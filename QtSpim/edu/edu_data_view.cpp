/* See edu_data_view.h. */

#include "edu/edu_data_view.h"

#include "edu/theme/tokens.h"

#include <QAction>
#include <QActionGroup>
#include <QContextMenuEvent>
#include <QHBoxLayout>
#include <QHeaderView>
#include <QKeyEvent>
#include <QLabel>
#include <QLineEdit>
#include <QMenu>
#include <QMessageBox>
#include <QPainter>
#include <QScrollBar>
#include <QStyledItemDelegate>
#include <QToolButton>
#include <QVBoxLayout>

#include "edu/core/edu_format.h"
#include "edu/core/edu_registers.h"
#include "edu/edu_data_model.h"
#include "edu/edu_frozen_columns.h"
#include "edu/edu_view_scroll.h"
#include "edu/edu_register_model.h"
#include "edu/edu_panel_zoom.h"
#include "spimview.h"
#include "ui_spimview.h"

namespace {

// Header, fold and zero-run rows show one text across the whole row.  Spans
// would do that too, but a span per zero run is a lot of bookkeeping on every
// refresh; instead each cell of such a row paints the same text, shifted so
// that the pieces line up, clipped to itself.
class DataRowDelegate : public QStyledItemDelegate {
 public:
  // `frozen` is the copy that paints the strip of Address cells: it shows
  // the addresses and nothing else, so that the one full-row text is
  // drawn once, by the table underneath, and not cut in two.
  DataRowDelegate(EduDataView* view, bool frozen)
      : QStyledItemDelegate(view), view_(view), frozen_(frozen) {}

  void paint(QPainter* painter, const QStyleOptionViewItem& option,
             const QModelIndex& index) const {
    QStyleOptionViewItem opt(option);
    initStyleOption(&opt, index);
    const bool selected = (opt.state & QStyle::State_Selected) != 0;
    if (!selected) {
      painter->fillRect(opt.rect, index.data(Qt::BackgroundRole).value<QColor>());
    }
    opt.backgroundBrush = QBrush();

    const QVariant full = index.data(EduDataModel::FullRowTextRole);
    if (!full.isValid()) {
      QStyledItemDelegate::paint(painter, opt, index);
      return;
    }
    if (frozen_) {
      return;  // the background, drawn above, is all the strip says here
    }
    if (index.column() == EduDataModel::LabelColumn &&
        !index.data(Qt::DisplayRole).toString().isEmpty()) {
      QStyledItemDelegate::paint(painter, opt, index);  // a run's labels
      return;
    }

    // Past the frozen Address strip, so the text is never half under it,
    // and it stays where it is when the panel is scrolled sideways.
    const int left =
        qMax(view_->frozenWidth(), view_->columnViewportPosition(0)) + 4;
    // Stop before the Labels column when that has something to say.
    int right = view_->viewport()->width();
    const QModelIndex labels =
        index.sibling(index.row(), EduDataModel::LabelColumn);
    if (!labels.data(Qt::DisplayRole).toString().isEmpty()) {
      right = view_->columnViewportPosition(EduDataModel::LabelColumn) - 8;
    }
    if (right - left < 24) {
      return;  // scrolled until the labels are against the strip: no room
    }
    painter->save();
    painter->setClipRect(opt.rect);
    painter->setFont(opt.font);
    painter->setPen(index.data(Qt::ForegroundRole).value<QColor>());
    painter->drawText(QRect(left, opt.rect.top(), qMax(0, right - left),
                            opt.rect.height()),
                      Qt::AlignLeft | Qt::AlignVCenter | Qt::TextSingleLine,
                      full.toString());
    painter->restore();
  }

 private:
  EduDataView* view_;
  bool frozen_;
};

}  // namespace

EduDataView::EduDataView(QWidget* parent)
    : QTableView(parent),
      model_(0),
      changeValueAction_(new QAction(this)),
      unitGroup_(new QActionGroup(this)),
      frozen_(new QTableView(this)),
      frozenColumns_(0),
      keyNavigating_(false),
      restoring_(false),
      fontApplied_(false),
      fittedBase_(0),
      fittedUnit_(0),
      hadSelection_(false),
      selectedAddress_(0),
      scrollValue_(0),
      menuAddress_(0),
      menuHasAddress_(false) {
  setObjectName("DataSegView");  // so a report can name the panel
  setItemDelegate(new DataRowDelegate(this, false));
  setSelectionBehavior(QAbstractItemView::SelectItems);
  setSelectionMode(QAbstractItemView::SingleSelection);
  setEditTriggers(QAbstractItemView::NoEditTriggers);
  setShowGrid(false);
  setWordWrap(false);
  setHorizontalScrollMode(QAbstractItemView::ScrollPerPixel);
  // Per pixel up and down as well: in ScrollPerItem the offset at the end
  // of the range is worked out from the height of the viewport, so two
  // views of the same rows can stand a few pixels apart (U).
  setVerticalScrollMode(QAbstractItemView::ScrollPerPixel);
  setCornerButtonEnabled(false);
  verticalHeader()->hide();
  verticalHeader()->setSectionResizeMode(QHeaderView::Fixed);
  horizontalHeader()->setHighlightSections(false);
  horizontalHeader()->setStretchLastSection(true);
  horizontalHeader()->setSectionsClickable(false);
  horizontalHeader()->setDefaultAlignment(Qt::AlignLeft | Qt::AlignVCenter);

  // Upstream's object name and text.
  changeValueAction_->setObjectName("action_ChangeValue");
  changeValueAction_->setText("Change Memory Contents");
  connect(changeValueAction_, SIGNAL(triggered(bool)), this,
          SLOT(changeValueOfCurrent()));

  const edu::MemoryUnit units[] = {edu::WordUnit, edu::HalfUnit, edu::ByteUnit};
  const char* const names[] = {"action_Data_UnitWords", "action_Data_UnitHalves",
                               "action_Data_UnitBytes"};
  for (int i = 0; i < 3; i += 1) {
    QAction* action = new QAction(edu::memoryUnitName(units[i]), this);
    action->setObjectName(names[i]);
    action->setCheckable(true);
    action->setChecked(units[i] == edu::WordUnit);
    action->setData(int(units[i]));
    unitGroup_->addAction(action);
  }
  connect(unitGroup_, SIGNAL(triggered(QAction*)), this,
          SLOT(onUnitAction(QAction*)));

  connect(this, SIGNAL(clicked(QModelIndex)), this,
          SLOT(onClicked(QModelIndex)));
  connect(this, SIGNAL(doubleClicked(QModelIndex)), this,
          SLOT(onDoubleClicked(QModelIndex)));
}

QList<QAction*> EduDataView::unitActions() const {
  return unitGroup_->actions();
}

void EduDataView::setDataModel(EduDataModel* model) {
  model_ = model;
  setModel(model);
  connect(model, SIGNAL(modelAboutToBeReset()), this, SLOT(beforeReset()));
  connect(model, SIGNAL(modelReset()), this, SLOT(afterReset()));
  connect(selectionModel(),
          SIGNAL(currentChanged(QModelIndex, QModelIndex)), this,
          SLOT(onCurrentChanged()));

  // The Address column stays put: in binary one row of memory is well
  // over a hundred characters and the address is the first thing to go
  // off the left edge (R).
  frozen_->setObjectName("EduDataFrozen");
  frozen_->setItemDelegate(new EduFrozenRowDelegate(
      this, new DataRowDelegate(this, true), frozen_));
  frozenColumns_ = new EduFrozenColumns(
      this, frozen_, EduDataModel::AddressColumn + 1, this);
  frozenColumns_->attach();
  connect(frozen_, SIGNAL(clicked(QModelIndex)), this,
          SLOT(onClicked(QModelIndex)));
  connect(frozen_, SIGNAL(doubleClicked(QModelIndex)), this,
          SLOT(onDoubleClicked(QModelIndex)));
  connect(frozenColumns_, SIGNAL(contextMenuRequested(QModelIndex, QPoint)),
          this, SLOT(showMenuAt(QModelIndex, QPoint)));
}

int EduDataView::frozenWidth() const {
  return frozenColumns_ != 0 ? frozenColumns_->width() : 0;
}

void EduDataView::resizeEvent(QResizeEvent* event) {
  QTableView::resizeEvent(event);
  if (frozenColumns_ != 0) {
    frozenColumns_->sync();
  }
}

void EduDataView::applyPanelFont(const QFont& font) {
  if (fontApplied_ && font == appliedFont_) {
    return;
  }
  fontApplied_ = true;
  appliedFont_ = font;
  setFont(font);
  horizontalHeader()->setFont(font);  // the application style sheet resets it
  const QFontMetrics metrics(font);
  verticalHeader()->setDefaultSectionSize(qMax(
      qMax(metrics.height(), metrics.lineSpacing()) + 2, edu::theme::kRowHeight));
  fitColumns();
}

// Widths from the widest text each column can hold in the current base and
// unit, not from the rows that happen to be there.
void EduDataView::fitColumns() {
  if (model_ == 0 ||
      (fittedBase_ == model_->base() && fittedUnit_ == int(model_->unit()) &&
       fittedFont_ == font())) {
    return;  // called on every refresh; keep widths the user has dragged
  }
  fittedBase_ = model_->base();
  fittedUnit_ = int(model_->unit());
  fittedFont_ = font();
  const QFontMetrics metrics(font());
  const int pad = 16;
  const QChar digit('0');
  const edu::MemoryUnit unit = model_->unit();
  const int perWord = 4 / int(unit);
  const int chars = perWord * edu::memoryValueWidth(unit, model_->base()) +
                    (perWord - 1);
  setColumnWidth(EduDataModel::AddressColumn,
                 metrics.horizontalAdvance(QString(8, digit)) + pad);
  for (int c = EduDataModel::Word0Column; c <= EduDataModel::Word3Column; c += 1) {
    setColumnWidth(c, metrics.horizontalAdvance(QString(chars, digit)) + pad);
  }
  setColumnWidth(EduDataModel::AsciiColumn,
                 metrics.horizontalAdvance(QString(16, digit)) + pad);
  if (frozenColumns_ != 0) {
    frozenColumns_->sync();
  }
}

bool EduDataView::currentWord(quint32* address) const {
  return model_ != 0 && currentIndex().isValid() &&
         selectionModel()->isSelected(currentIndex()) &&
         model_->wordAt(currentIndex(), address);
}

bool EduDataView::goToAddress(quint32 address) {
  if (model_ == 0) {
    return false;
  }
  const QModelIndex cell = model_->reveal(address);
  if (!cell.isValid()) {
    return false;
  }
  // The row, not the sideways position: the Address column is frozen, so
  // there is nothing to fetch from the right (S).  setCurrentIndex() also
  // scrolls -- that is how the arrow keys follow the selection -- so the
  // guard covers it too.
  EduKeepHorizontalScroll keepSideways(this);
  setCurrentIndex(cell);
  scrollTo(cell, QAbstractItemView::PositionAtCenter);
  emit memorySelectionChanged();
  return true;
}

// Only down and up.  QAbstractItemView::scrollTo() moves both axes, and
// QAbstractScrollArea blits the viewport the moment the value changes, so
// a move made here and undone afterwards is still one frame of the wrong
// thing on screen (V).  The guard turns the viewport's drawing off while
// the base class does its work, so nothing is blitted and nothing has to
// be undone visibly.  The arrow keys go the other way: moving the current
// cell to a column off the right should bring it into view.
void EduDataView::scrollTo(const QModelIndex& index, ScrollHint hint) {
  if (keyNavigating_) {
    QTableView::scrollTo(index, hint);
    return;
  }
  EduKeepHorizontalScroll keepSideways(this);
  QTableView::scrollTo(index, hint);
}

// Shift and the wheel move the panel sideways where the platform has not
// already done so (W).
void EduDataView::wheelEvent(QWheelEvent* event) {
  if (eduWheelScrollsSideways(this, event)) {
    return;
  }
  QTableView::wheelEvent(event);
}

void EduDataView::keyPressEvent(QKeyEvent* event) {
  keyNavigating_ = true;
  QTableView::keyPressEvent(event);
  keyNavigating_ = false;
}

// Where a sideways move becomes pixels on the screen.  With the viewport's
// updates off there is no blit, and nothing is counted; anything counted
// here is a frame the student saw (V).
void EduDataView::scrollContentsBy(int dx, int dy) {
  if (dx != 0 && viewport()->updatesEnabled()) {
    edu::noteSidewaysPaint(this, dx);
  }
  QTableView::scrollContentsBy(dx, dy);
}

void EduDataView::beforeReset() {
  hadSelection_ = currentWord(&selectedAddress_);
  scrollValue_ = verticalScrollBar()->value();
}

void EduDataView::afterReset() {
  if (model_ == 0) {
    return;
  }
  EduKeepHorizontalScroll keepSideways(this);  // a refresh moves nothing (S)
  restoring_ = true;
  if (hadSelection_) {
    const QModelIndex cell = model_->indexOfAddress(selectedAddress_);
    if (cell.isValid()) {
      setCurrentIndex(cell);
    }
  }
  verticalScrollBar()->setValue(scrollValue_);  // upstream kept it as well
  restoring_ = false;
  emit memoryRowsReset();
}

void EduDataView::onCurrentChanged() {
  if (!restoring_) {
    emit memorySelectionChanged();
  }
}

void EduDataView::onClicked(const QModelIndex& index) {
  const EduDataModel::Row* row = model_ != 0 ? model_->rowAt(index.row()) : 0;
  if (row == 0) {
    return;
  }
  if (row->kind == EduDataModel::SegmentHeader) {
    model_->setSegmentExpanded(row->segment,
                               !model_->isSegmentExpanded(row->segment));
  } else if (row->kind == EduDataModel::EnvironmentFold) {
    model_->setEnvironmentExpanded(!model_->isEnvironmentExpanded());
  } else {
    emit memorySelectionChanged();  // also when the cell was current already
  }
}

void EduDataView::onDoubleClicked(const QModelIndex& index) {
  quint32 address = 0;
  if (model_ != 0 && model_->wordAt(index, &address)) {
    changeValue(address);
  }
}

void EduDataView::setUnit(edu::MemoryUnit unit) {
  const QList<QAction*> actions = unitGroup_->actions();
  for (int i = 0; i < actions.size(); i += 1) {
    if (actions.at(i)->data().toInt() == int(unit)) {
      actions.at(i)->setChecked(true);  // no triggered(): apply it here
      onUnitAction(actions.at(i));
    }
  }
}

void EduDataView::onUnitAction(QAction* action) {
  if (model_ != 0) {
    model_->setUnit(edu::MemoryUnit(action->data().toInt()));
    fitColumns();
  }
}

void EduDataView::contextMenuEvent(QContextMenuEvent* event) {
  showMenuAt(indexAt(event->pos()), event->globalPos());
}

// Also reached from the frozen Address strip, which has no menu of its own.
void EduDataView::showMenuAt(const QModelIndex& index,
                             const QPoint& globalPos) {
  const EduDataModel::Row* row = model_ != 0 ? model_->rowAt(index.row()) : 0;
  menuHasAddress_ = model_ != 0 && model_->wordAt(index, &menuAddress_);
  if (!menuHasAddress_ && row != 0 && row->kind == EduDataModel::ZeroRunRow) {
    // Upstream's regex found the first address of a "[a]..[b]" line.
    menuAddress_ = row->address;
    menuHasAddress_ = true;
  }
  if (menuHasAddress_ && model_->wordAt(index, &menuAddress_)) {
    setCurrentIndex(index);
  }
  changeValueAction_->setEnabled(menuHasAddress_);

  QMenu menu(this);
  menu.addAction(Window->ui->action_Data_DisplayBinary);
  menu.addAction(Window->ui->action_Data_DisplayDecimal);
  menu.addAction(Window->ui->action_Data_DisplayHex);
  menu.addSeparator();
  menu.addActions(unitGroup_->actions());
  menu.addSeparator();
  menu.addAction(changeValueAction_);
  if (Window != 0 && Window->eduDataZoom != 0) {
    Window->eduDataZoom->addMenuActions(&menu);  // Zoom In / Out / Reset
  }
  menu.exec(globalPos);
  menuHasAddress_ = false;
}

void EduDataView::changeValueOfCurrent() {
  quint32 address = 0;
  if (menuHasAddress_) {
    changeValue(menuAddress_);
  } else if (currentWord(&address)) {
    changeValue(address);
  }
}

void EduDataView::changeValue(quint32 address) {
  // Upstream's dialog and prompt text ("New value for 10010000").
  int base = Window->DataDisplayBase();
  const QString text = promptForNewValue(
      "New value for " + edu::hex32Digits(address), &base);
  if (text.isEmpty()) {
    return;  // cancelled (upstream went on to complain about a bad value)
  }

  quint32 value = 0;
  if (!edu::parseValue32(text, base, &value)) {
    QMessageBox box;
    box.setText(QString("Bad ") + (base == 16 ? "hex" : "decimal") +
                " memory value: " + text);
    box.exec();
    return;
  }

  writeWord(address, value);
}

void EduDataView::writeWord(quint32 address, quint32 value) {
  set_mem_word(address, mem_word(value));
  if (model_ != 0) {
    model_->reveal(address);  // a word inside a zero run gets its own line
  }
  Window->DisplayDataSegments(true);  // as upstream
  emit memoryEdited();
}

//
// EduDataPanel
//

EduDataPanel::EduDataPanel(QWidget* parent)
    : QWidget(parent),
      model_(0),
      view_(new EduDataView(this)),
      goToEdit_(new QLineEdit(this)),
      goToStatus_(new QLabel(this)) {
  QLabel* caption = new QLabel("Go to", this);
  goToEdit_->setObjectName("DataGoToEdit");
  goToEdit_->setPlaceholderText("address, label or $register");
  goToEdit_->setClearButtonEnabled(true);
  goToEdit_->setMaximumWidth(260);
  QToolButton* go = new QToolButton(this);
  go->setText("Go");
  QToolButton* stack = new QToolButton(this);
  stack->setObjectName("DataGoToSpButton");
  stack->setText("$sp");
  stack->setToolTip("Go to the word $sp points to");

  QHBoxLayout* bar = new QHBoxLayout;
  bar->setContentsMargins(4, 2, 4, 2);
  bar->setSpacing(4);
  bar->addWidget(caption);
  bar->addWidget(goToEdit_);
  bar->addWidget(go);
  bar->addWidget(stack);
  bar->addWidget(goToStatus_, 1);

  QVBoxLayout* layout = new QVBoxLayout(this);
  layout->setContentsMargins(0, 0, 0, 0);
  layout->setSpacing(0);
  layout->addLayout(bar);
  layout->addWidget(view_, 1);

  connect(goToEdit_, SIGNAL(returnPressed()), this, SLOT(onGoTo()));
  connect(go, SIGNAL(clicked()), this, SLOT(onGoTo()));
  connect(stack, SIGNAL(clicked()), this, SLOT(onGoToStackPointer()));
}

void EduDataPanel::setDataModel(EduDataModel* model) {
  model_ = model;
  view_->setDataModel(model);
}

bool EduDataPanel::goTo(const QString& text) {
  goToEdit_->setText(text);
  onGoTo();
  return goToStatus_->text().isEmpty() || !goToStatus_->text().startsWith("No");
}

void EduDataPanel::onGoTo() {
  if (model_ == 0) {
    return;
  }
  const edu::GoToTarget target =
      edu::resolveGoTo(goToEdit_->text(), model_->labels());
  quint32 address = target.address;
  QString what;
  switch (target.kind) {
    case edu::GoToTarget::Invalid:
      goToStatus_->setText(goToEdit_->text().trimmed().isEmpty()
                               ? QString()
                               : QString("No such address, label or register"));
      return;
    case edu::GoToTarget::Register:
      address = EduRegisterModel::readRegister(target.reg);
      what = edu::registerName(target.reg) + QString(" = ");
      break;
    case edu::GoToTarget::Label:
      what = target.label + QString(" = ");
      break;
    case edu::GoToTarget::Address:
      break;
  }
  if (view_->goToAddress(address)) {
    goToStatus_->setText(what + edu::hex32(address));
    view_->setFocus();
  } else {
    goToStatus_->setText(QString("No data at ") + what + edu::hex32(address) +
                         QString(" (not in a shown data segment)"));
  }
}

void EduDataPanel::onGoToStackPointer() {
  goToEdit_->setText("$sp");
  onGoTo();
}

// As upstream's dataTextEdit: keep Window > Data Segment in step.  (Events
// can arrive while the main window is still being constructed.)
void EduDataPanel::hideEvent(QHideEvent* event) {
  if (Window != NULL) {
    Window->ui->action_Win_DataSegment->setChecked(false);
  }
  QWidget::hideEvent(event);
}

void EduDataPanel::showEvent(QShowEvent* event) {
  if (Window != NULL) {
    Window->ui->action_Win_DataSegment->setChecked(true);
  }
  QWidget::showEvent(event);
}
