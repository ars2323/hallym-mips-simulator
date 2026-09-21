/* See edu_register_view.h. */

#include "edu/edu_register_view.h"

#include <QAction>
#include <QContextMenuEvent>
#include <QHeaderView>
#include <QMenu>
#include <QMessageBox>
#include <QStyledItemDelegate>

#include "edu/core/edu_format.h"
#include "edu/edu_register_model.h"
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
    const QFontMetrics& metrics = option.fontMetrics;
    const int glyphs =
        metrics.tightBoundingRect(QString("$0gyRSpj")).height() + 2;
    QSize size = QStyledItemDelegate::sizeHint(option, index);
    size.setHeight(qMax(glyphs, metrics.height() - 3));
    return size;
  }
};

}  // namespace

EduRegisterView::EduRegisterView(QWidget* parent)
    : QTreeView(parent), model_(0), changeValueAction_(new QAction(this)) {
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
  QFont bold = font;
  bold.setBold(true);
  const QFontMetrics metrics(bold);
  const int cellPadding = 12;
  const int width =
      indentation() * 2 + metrics.horizontalAdvance("BadVAddr") +
      metrics.horizontalAdvance("R31") +
      metrics.horizontalAdvance("0x00000000") +
      metrics.horizontalAdvance("-2147483648") + 4 * cellPadding +
      2 * frameWidth() + 20;  // + vertical scroll bar, if it ever shows
  setMinimumWidth(width);
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
  return QSize(QTreeView::sizeHint().width(), fullContentHeight());
}

void EduRegisterView::onCurrentChanged() { emit registerSelectionChanged(); }

void EduRegisterView::contextMenuEvent(QContextMenuEvent* event) {
  const QModelIndex index = indexAt(event->pos());
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
  menu.exec(event->globalPos());
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
