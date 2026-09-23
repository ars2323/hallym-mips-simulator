/* See edu_register_view.h. */

#include "edu/edu_register_view.h"

#include "edu/theme/tokens.h"

#include <QAction>
#include <QContextMenuEvent>
#include <QHeaderView>
#include <QKeyEvent>
#include <QScrollBar>
#include <QStyle>
#include <QMenu>
#include <QMessageBox>
#include <QStyledItemDelegate>

#include "edu/core/edu_format.h"
#include "edu/edu_frozen_columns.h"
#include "edu/edu_register_model.h"
#include "edu/edu_view_scroll.h"
#include "spimview.h"
#include "ui_spimview.h"

namespace {

// Compact rows: the text height plus a hair instead of the style's roomy
// default.  All 47 rows (8 groups, 39 registers) have to fit a 1080-line
// screen without scrolling, as upstream's 41 text lines did.
class CompactRowDelegate : public QStyledItemDelegate {
 public:
  explicit CompactRowDelegate(QObject* parent) : QStyledItemDelegate(parent) {}

  QSize sizeHint(const QStyleOptionViewItem& option,
                 const QModelIndex& index) const {
    // Three pixels under the font's line height, but never less than the
    // glyphs need.  With the default Courier 10 pt that is 15-16 pixels a
    // row, which is what 47 rows + header + inspector can have in the left
    // dock column of a maximised window on a 1080-line screen.
    // The token row height (docs/design/tokens.md 3), unless the font is
    // taller than that (a user-chosen Register window font).
    const QFontMetrics& metrics = option.fontMetrics;
    const int glyphs =
        metrics.tightBoundingRect(QString("$0gyRSpj")).height() + 2;
    QSize size = QStyledItemDelegate::sizeHint(option, index);
    size.setHeight(qMax(glyphs, edu::theme::kRowHeight));
    return size;
  }
};

}  // namespace

EduRegisterView::EduRegisterView(QWidget* parent)
    : QTreeView(parent),
      model_(0),
      contentWidth_(0),
      frozen_(new QTreeView(this)),
      frozenColumns_(0),
      keyNavigating_(false),
      changeValueAction_(new QAction(this)) {
  // The column can be dragged to any width the student wants: in binary a
  // value is thirty-nine characters, which the default width cannot show.
  // What the layout gives it to begin with is set in eduApplyLayoutSizes().
  changeValueAction_->setObjectName("action_ChangeValue");
  changeValueAction_->setText("Change Register Contents");
  connect(changeValueAction_, SIGNAL(triggered(bool)), this,
          SLOT(changeValueOfCurrent()));

  setUniformRowHeights(true);
  setAllColumnsShowFocus(true);
  setSelectionBehavior(QAbstractItemView::SelectRows);
  setSelectionMode(QAbstractItemView::SingleSelection);
  setEditTriggers(QAbstractItemView::NoEditTriggers);
  setExpandsOnDoubleClick(true);
  setIndentation(12);
  setItemDelegate(new CompactRowDelegate(this));

  connect(this, SIGNAL(doubleClicked(QModelIndex)), this,
          SLOT(onDoubleClicked(QModelIndex)));
}

// The name and the number, laid over the left of the table and never
// scrolled sideways.  It is the same model and the same selection, so it
// behaves as one table however it is scrolled or expanded.
void EduRegisterView::initFrozen() {
  // Both views scroll the same way, or the names slide out of step with
  // the values they belong to.
  setVerticalScrollMode(QAbstractItemView::ScrollPerPixel);
  setHorizontalScrollMode(QAbstractItemView::ScrollPerPixel);
  setUniformRowHeights(true);
  frozen_->setObjectName("EduRegisterFrozen");
  frozen_->setItemDelegate(new EduFrozenRowDelegate(
      this, new CompactRowDelegate(0), frozen_));
  frozenColumns_ =
      new EduFrozenColumns(this, frozen_, EduRegisterModel::BaseColumn, this);
  frozenColumns_->attach();
  connect(frozen_, SIGNAL(doubleClicked(QModelIndex)), this,
          SLOT(onDoubleClicked(QModelIndex)));
  connect(frozenColumns_, SIGNAL(contextMenuRequested(QModelIndex, QPoint)),
          this, SLOT(showMenuAt(QModelIndex, QPoint)));
}

int EduRegisterView::frozenWidth() const {
  return frozenColumns_ != 0 ? frozenColumns_->width() : 0;
}

void EduRegisterView::syncFrozenGeometry() {
  if (frozenColumns_ != 0) {
    frozenColumns_->sync();
  }
}

void EduRegisterView::resizeEvent(QResizeEvent* event) {
  QTreeView::resizeEvent(event);
  syncFrozenGeometry();
}

void EduRegisterView::setRegisterModel(EduRegisterModel* model) {
  model_ = model;
  setModel(model);
  expandAll();  // groups start open; the user may fold them

  header()->setStretchLastSection(true);
  header()->setSectionResizeMode(QHeaderView::ResizeToContents);
  header()->setSectionsMovable(false);

  connect(selectionModel(),
          SIGNAL(currentRowChanged(QModelIndex, QModelIndex)), this,
          SLOT(onCurrentChanged()));

  // The frozen name column follows the same model and the same selection.
  initFrozen();
}

// Only down and up.  QAbstractItemView::scrollTo() moves both axes, and
// QAbstractScrollArea blits the viewport the moment the value changes, so
// a move made here and undone afterwards is still one frame of the wrong
// thing on screen (V).  The guard turns the viewport's drawing off while
// the base class does its work, so nothing is blitted and nothing has to
// be undone visibly.  The arrow keys go the other way: moving the current
// cell to a column off the right should bring it into view.
void EduRegisterView::scrollTo(const QModelIndex& index, ScrollHint hint) {
  if (keyNavigating_) {
    QTreeView::scrollTo(index, hint);
    return;
  }
  EduKeepHorizontalScroll keepSideways(this);
  QTreeView::scrollTo(index, hint);
}

// Shift and the wheel move the panel sideways where the platform has not
// already done so (W).
void EduRegisterView::wheelEvent(QWheelEvent* event) {
  if (eduWheelScrollsSideways(this, event)) {
    return;
  }
  QTreeView::wheelEvent(event);
}

void EduRegisterView::keyPressEvent(QKeyEvent* event) {
  keyNavigating_ = true;
  QTreeView::keyPressEvent(event);
  keyNavigating_ = false;
}

// Where a sideways move becomes pixels on the screen.  With the viewport's
// updates off there is no blit, and nothing is counted; anything counted
// here is a frame the student saw (V).
void EduRegisterView::scrollContentsBy(int dx, int dy) {
  if (dx != 0 && viewport()->updatesEnabled()) {
    edu::noteSidewaysPaint(this, dx);
  }
  QTreeView::scrollContentsBy(dx, dy);
}

bool EduRegisterView::currentRegister(edu::RegisterRef* reg) const {
  return model_ != 0 && model_->registerAt(currentIndex(), reg);
}

void EduRegisterView::selectRegister(const edu::RegisterRef& reg) {
  if (model_ == 0) {
    return;
  }
  const QModelIndex index = model_->indexOf(reg);
  if (index.isValid()) {
    // The row, not the sideways position (S); setCurrentIndex() scrolls
    // as well, so the guard covers it too.
    EduKeepHorizontalScroll keepSideways(this);
    expand(index.parent());
    setCurrentIndex(index);
    scrollTo(index);
  }
}

// Wide enough for every column in the default (hex) base, so the Decimal
// column is not pushed under a horizontal scroll bar.  Measured from the
// widest texts rather than from the live columns: in binary the value column
// is 39 characters and should scroll rather than widen the whole dock.
void EduRegisterView::applyPanelFont(const QFont& font) {
  setFont(font);
  header()->setFont(font);  // else it keeps the (larger) application font
  const QFontMetrics metrics(font);
  const int cellPadding = 12;
  // The Name column holds the group titles too ("Return values" is wider
  // than "BadVAddr" plus its extra indentation level).
  int nameWidth = indentation() * 2 + metrics.horizontalAdvance("BadVAddr");
  for (int g = 0; model_ != 0 && g < model_->rowCount(); g += 1) {
    const QString title = model_->index(g, 0).data(Qt::DisplayRole).toString();
    nameWidth = qMax(nameWidth,
                     indentation() + metrics.horizontalAdvance(title));
  }
  // The narrowest the column may be dragged: the name and the number, whole.
  // The value columns scroll rather than hold the column open, so that a
  // student can put the register list down to a strip when they want the
  // room for code.
  const int floorWidth = nameWidth + metrics.horizontalAdvance("R31") +
                         2 * cellPadding + 2 * frameWidth() +
                         style()->pixelMetric(QStyle::PM_ScrollBarExtent);
  setMinimumWidth(floorWidth);
  syncFrozenGeometry();
  // What the whole table wants, which is what the layout gives it by
  // default (edu::theme::kRegisterColumnWidth is this, rounded).
  contentWidth_ = nameWidth + metrics.horizontalAdvance("R31") +
                  metrics.horizontalAdvance("0x00000000") +
                  metrics.horizontalAdvance("-2147483648") + 4 * cellPadding +
                  2 * frameWidth() +
                  style()->pixelMetric(QStyle::PM_ScrollBarExtent) + 16;
}

int EduRegisterView::fullContentHeight() const {
  if (model_ == 0) {
    return QTreeView::sizeHint().height();
  }
  int rows = 0;
  for (int g = 0; g < model_->rowCount(); g += 1) {
    const QModelIndex group = model_->index(g, 0);
    rows += 1 + (isExpanded(group) ? model_->rowCount(group) : 0);
  }
  const int rowHeight = qMax(1, sizeHintForRow(0));
  return header()->sizeHint().height() + rows * rowHeight + 2 * frameWidth() + 2;
}

QSize EduRegisterView::sizeHint() const {
  // The width the columns actually need, not QTreeView's, which asks for
  // room the table does not use and takes it from the code beside it.
  return QSize(qMax(contentWidth_, 100), fullContentHeight());
}

void EduRegisterView::onCurrentChanged() { emit registerSelectionChanged(); }

void EduRegisterView::contextMenuEvent(QContextMenuEvent* event) {
  showMenuAt(indexAt(event->pos()), event->globalPos());
}

// Also reached from the frozen name strip, which has no menu of its own.
void EduRegisterView::showMenuAt(const QModelIndex& index,
                                 const QPoint& globalPos) {
  if (index.isValid()) {
    setCurrentIndex(index);
  }

  // Same entries, in the same order, as upstream's register context menu
  // (minus the text-edit Copy/Select All, which have no meaning here).
  QMenu menu(this);
  menu.addAction(Window->ui->action_Reg_DisplayBinary);
  menu.addAction(Window->ui->action_Reg_DisplayDecimal);
  menu.addAction(Window->ui->action_Reg_DisplayHex);
  menu.addSeparator();
  edu::RegisterRef reg;
  changeValueAction_->setEnabled(currentRegister(&reg));
  menu.addAction(changeValueAction_);
  menu.exec(globalPos);
}

void EduRegisterView::onDoubleClicked(const QModelIndex& index) {
  edu::RegisterRef reg;
  if (model_ != 0 && model_->registerAt(index, &reg)) {
    changeValue(reg);
  }
}

void EduRegisterView::changeValueOfCurrent() {
  edu::RegisterRef reg;
  if (currentRegister(&reg)) {
    changeValue(reg);
  }
}

void EduRegisterView::changeValue(const edu::RegisterRef& reg) {
  // Upstream's dialog and prompt text ("New value for R8" / "... for PC").
  int base = Window->RegDisplayBase();
  const QString text = promptForNewValue(
      "New value for " + edu::registerPromptName(reg), &base);
  if (text.isEmpty()) {
    return;  // cancelled (upstream went on to complain about a bad value)
  }

  quint32 value = 0;
  if (!edu::parseValue32(text, base, &value)) {
    QMessageBox box;
    box.setText(QString("Bad ") + (base == 16 ? "hex" : "decimal") +
                " register value: " + text);
    box.exec();
    return;
  }

  model_->writeRegister(reg, value);
  // As upstream: both register windows are redrawn after an edit.
  Window->DisplayIntRegisters();
  Window->DisplayFPRegisters();
}

// Window > Integer Registers follows the panel's visibility, as upstream's
// regTextEdit did for both register windows.
void EduRegisterView::hideEvent(QHideEvent* event) {
  if (Window != NULL) {
    Window->ui->action_Win_IntRegisters->setChecked(false);
  }
  QTreeView::hideEvent(event);
}

void EduRegisterView::showEvent(QShowEvent* event) {
  if (Window != NULL) {
    Window->ui->action_Win_IntRegisters->setChecked(true);
  }
  QTreeView::showEvent(event);
}
