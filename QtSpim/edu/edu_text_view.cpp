/* See edu_text_view.h. */

#include "edu/edu_text_view.h"

#include <QAction>
#include <QApplication>
#include <QClipboard>
#include <QContextMenuEvent>
#include <QHeaderView>
#include <QMenu>
#include <QPainter>
#include <QScrollBar>
#include <QStyledItemDelegate>

#include "edu/edu_text_model.h"
#include "spimview.h"
#include "ui_spimview.h"

namespace {

QColor badgeColor(const QString& type) {
  if (type == "R") return QColor(46, 125, 50);     // green
  if (type == "I") return QColor(21, 101, 192);    // blue
  if (type == "J") return QColor(230, 81, 0);      // orange
  if (type == "FR") return QColor(106, 27, 154);   // purple
  if (type == "FI") return QColor(173, 20, 87);    // pink
  return QColor(84, 110, 122);                     // CP0: blue grey
}

// Paints the row background itself (the PC row stays cyan even when it is
// selected), a red dot in the BP column and a badge in the Type column.
class TextRowDelegate : public QStyledItemDelegate {
 public:
  explicit TextRowDelegate(QObject* parent) : QStyledItemDelegate(parent) {}

  void paint(QPainter* painter, const QStyleOptionViewItem& option,
             const QModelIndex& index) const {
    QStyleOptionViewItem opt(option);
    const bool isPc = index.data(EduTextModel::IsPcRole).toBool();
    const bool selected = (opt.state & QStyle::State_Selected) != 0;
    const bool instruction = index.data(EduTextModel::RowKindRole).toInt() ==
                             int(EduTextModel::InstructionRow);

    if (isPc) {
      // Selection is shown by a darker cyan, so "this is the PC" survives.
      opt.state &= ~QStyle::State_Selected;
      painter->fillRect(opt.rect, selected ? QColor(0, 200, 215)
                                           : QColor(Qt::cyan));
    } else if (!selected) {
      painter->fillRect(opt.rect,
                        index.data(Qt::BackgroundRole).value<QColor>());
    }

    if (instruction && index.column() == EduTextModel::BpColumn) {
      if (selected && !isPc) {
        QStyledItemDelegate::paint(painter, opt, index);
      }
      if (index.data(EduTextModel::BreakpointRole).toBool()) {
        const int d = qMin(opt.rect.height(), opt.rect.width()) - 6;
        QRect dot(0, 0, d, d);
        dot.moveCenter(opt.rect.center());
        painter->save();
        painter->setRenderHint(QPainter::Antialiasing);
        painter->setPen(Qt::NoPen);
        painter->setBrush(QColor(211, 47, 47));
        painter->drawEllipse(dot);
        painter->restore();
      }
      return;
    }

    if (instruction && index.column() == EduTextModel::TypeColumn) {
      if (selected && !isPc) {
        QStyledItemDelegate::paint(painter, opt, index);
      }
      const QString type = index.data(Qt::DisplayRole).toString();
      QFont font(opt.font);
      font.setBold(true);
      const QFontMetrics metrics(font);
      QRect badge(0, 0, metrics.horizontalAdvance("CP0") + 8,
                  qMin(opt.rect.height() - 2, metrics.height()));
      badge.moveCenter(opt.rect.center());
      painter->save();
      painter->setRenderHint(QPainter::Antialiasing);
      painter->setPen(Qt::NoPen);
      painter->setBrush(badgeColor(type));
      painter->drawRoundedRect(badge, 3, 3);
      painter->setPen(Qt::white);
      painter->setFont(font);
      painter->drawText(badge, Qt::AlignCenter, type);
      painter->restore();
      return;
    }

    // The background is already there; keep the style from painting the
    // model's brush over a selected row's highlight.
    opt.backgroundBrush = QBrush();
    if (isPc) {
      opt.palette.setColor(QPalette::Text, Qt::black);
    }
    QStyledItemDelegate::paint(painter, opt, index);
  }

  void initStyleOption(QStyleOptionViewItem* option,
                       const QModelIndex& index) const {
    QStyledItemDelegate::initStyleOption(option, index);
    option->backgroundBrush = QBrush();
    if (index.column() == EduTextModel::BpColumn ||
        index.column() == EduTextModel::TypeColumn) {
      if (index.data(EduTextModel::RowKindRole).toInt() ==
          int(EduTextModel::InstructionRow)) {
        option->text.clear();
      }
    }
  }
};

}  // namespace

EduTextView::EduTextView(QWidget* parent)
    : QTableView(parent),
      model_(0),
      menuRow_(-1),
      restoring_(false),
      fontApplied_(false),
      hadSelection_(false),
      selectedAddress_(0),
      scrollValue_(0) {
  setItemDelegate(new TextRowDelegate(this));
  setSelectionBehavior(QAbstractItemView::SelectRows);
  setSelectionMode(QAbstractItemView::SingleSelection);
  setEditTriggers(QAbstractItemView::NoEditTriggers);
  setShowGrid(false);
  setWordWrap(false);
  setTextElideMode(Qt::ElideRight);
  setHorizontalScrollMode(QAbstractItemView::ScrollPerPixel);
  setCornerButtonEnabled(false);
  verticalHeader()->hide();
  verticalHeader()->setSectionResizeMode(QHeaderView::Fixed);
  horizontalHeader()->setHighlightSections(false);
  horizontalHeader()->setStretchLastSection(true);
  horizontalHeader()->setSectionsClickable(false);
  horizontalHeader()->setDefaultAlignment(Qt::AlignLeft | Qt::AlignVCenter);

  setBreakpointAction_ = new QAction("Set Breakpoint", this);
  setBreakpointAction_->setObjectName("action_SetBreakpoint");
  clearBreakpointAction_ = new QAction("Clear Breakpoint", this);
  clearBreakpointAction_->setObjectName("action_ClearBreakpoint");
  copyAction_ = new QAction("Copy", this);
  connect(setBreakpointAction_, SIGNAL(triggered(bool)), this,
          SLOT(setBreakpointAtMenuRow()));
  connect(clearBreakpointAction_, SIGNAL(triggered(bool)), this,
          SLOT(clearBreakpointAtMenuRow()));
  connect(copyAction_, SIGNAL(triggered(bool)), this, SLOT(copyMenuRow()));

  connect(this, SIGNAL(clicked(QModelIndex)), this,
          SLOT(onClicked(QModelIndex)));
}

void EduTextView::setTextModel(EduTextModel* model) {
  model_ = model;
  setModel(model);
  connect(model, SIGNAL(modelAboutToBeReset()), this, SLOT(beforeReset()));
  connect(model, SIGNAL(modelReset()), this, SLOT(afterReset()));
  connect(selectionModel(),
          SIGNAL(currentRowChanged(QModelIndex, QModelIndex)), this,
          SLOT(onCurrentChanged()));
  afterReset();
}

void EduTextView::applyPanelFont(const QFont& font) {
  if (fontApplied_ && font == appliedFont_) {
    return;  // called on every refresh; keep widths the user has dragged
  }
  fontApplied_ = true;
  appliedFont_ = font;
  setFont(font);
  horizontalHeader()->setFont(font);  // the application style sheet resets it
  const QFontMetrics metrics(font);
  QFont boldFont(font);
  boldFont.setBold(true);
  const QFontMetrics bold(boldFont);

  verticalHeader()->setDefaultSectionSize(
      qMax(metrics.height(), metrics.lineSpacing()) + 2);
  const int pad = 14;
  setColumnWidth(EduTextModel::BpColumn, metrics.horizontalAdvance("BP") + pad);
  setColumnWidth(EduTextModel::AddressColumn,
                 metrics.horizontalAdvance("00000000") + pad);
  setColumnWidth(EduTextModel::CodeColumn,
                 metrics.horizontalAdvance("00000000") + pad);
  setColumnWidth(EduTextModel::TypeColumn,
                 qMax(bold.horizontalAdvance("CP0") + 8,
                      metrics.horizontalAdvance("Type")) + pad);
  setColumnWidth(EduTextModel::InstructionColumn,
                 bold.horizontalAdvance(QString(38, QLatin1Char('0'))) + pad);
}

void EduTextView::setColumnsShown(bool code, bool source) {
  setColumnHidden(EduTextModel::CodeColumn, !code);
  setColumnHidden(EduTextModel::SourceColumn, !source);
  // With the last column hidden the instruction column takes the stretch.
}

bool EduTextView::currentInstruction(quint32* address) const {
  if (model_ == 0 || !currentIndex().isValid() ||
      !selectionModel()->isRowSelected(currentIndex().row(), QModelIndex())) {
    return false;
  }
  const EduTextModel::Row* row = model_->rowAt(currentIndex().row());
  if (row == 0 || row->kind != EduTextModel::InstructionRow) {
    return false;
  }
  *address = row->address;
  return true;
}

void EduTextView::selectAddress(quint32 address) {
  const int row = model_ != 0 ? model_->rowOfAddress(address) : -1;
  if (row >= 0) {
    setCurrentIndex(model_->index(row, EduTextModel::InstructionColumn));
    scrollTo(currentIndex(), QAbstractItemView::PositionAtCenter);
  }
}

void EduTextView::showAddress(quint32 address) {
  const int row = model_ != 0 ? model_->rowOfAddress(address) : -1;
  if (row >= 0) {
    scrollTo(model_->index(row, EduTextModel::AddressColumn),
             QAbstractItemView::EnsureVisible);
  }
}

void EduTextView::beforeReset() {
  hadSelection_ = currentInstruction(&selectedAddress_);
  scrollValue_ = verticalScrollBar()->value();
}

void EduTextView::afterReset() {
  if (model_ == 0) {
    return;
  }
  clearSpans();
  const QList<int> headers = model_->headerRows();
  for (int i = 0; i < headers.size(); i += 1) {
    setSpan(headers.at(i), 0, 1, EduTextModel::ColumnCount);
  }
  restoring_ = true;
  if (hadSelection_) {
    const int row = model_->rowOfAddress(selectedAddress_);
    if (row >= 0) {
      setCurrentIndex(model_->index(row, EduTextModel::InstructionColumn));
    }
  }
  verticalScrollBar()->setValue(scrollValue_);
  restoring_ = false;
  emit instructionRowsReset();
}

void EduTextView::onCurrentChanged() {
  if (!restoring_) {
    emit instructionSelectionChanged();
  }
}

void EduTextView::onClicked(const QModelIndex& index) {
  const EduTextModel::Row* row = model_ != 0 ? model_->rowAt(index.row()) : 0;
  if (row == 0) {
    return;
  }
  if (row->kind == EduTextModel::KernelHeader) {
    model_->setKernelExpanded(!model_->isKernelExpanded());
    return;
  }
  emit instructionSelectionChanged();  // also when the row was current already
  if (row->kind == EduTextModel::InstructionRow && index.column() == EduTextModel::BpColumn) {
    setBreakpoint(index.row(), !inst_is_breakpoint(row->address));
  }
}

// Upstream's textTextEdit::setBreakpoint() / clearBreakpoint(): the core call
// plus an in-place change of the one line.
void EduTextView::setBreakpoint(int rowNumber, bool on) {
  const EduTextModel::Row* row = model_->rowAt(rowNumber);
  if (row == 0 || row->kind != EduTextModel::InstructionRow) {
    return;
  }
  const bool isSet = inst_is_breakpoint(row->address);
  if (on && !isSet) {
    add_breakpoint(row->address);
  } else if (!on && isSet) {
    delete_breakpoint(row->address);
  }
  model_->breakpointChanged(row->address);
}

void EduTextView::contextMenuEvent(QContextMenuEvent* event) {
  menuRow_ = indexAt(event->pos()).row();
  const EduTextModel::Row* row = model_ != 0 ? model_->rowAt(menuRow_) : 0;
  const bool instruction = row != 0 && row->kind == EduTextModel::InstructionRow;
  const bool isSet = instruction && inst_is_breakpoint(row->address);

  setBreakpointAction_->setEnabled(instruction && !isSet);
  clearBreakpointAction_->setEnabled(instruction && isSet);
  copyAction_->setEnabled(row != 0);

  QMenu menu(this);
  menu.addAction(copyAction_);
  menu.addSeparator();
  menu.addAction(setBreakpointAction_);
  menu.addAction(clearBreakpointAction_);
  menu.exec(event->globalPos());
}

void EduTextView::setBreakpointAtMenuRow() { setBreakpoint(menuRow_, true); }

void EduTextView::clearBreakpointAtMenuRow() { setBreakpoint(menuRow_, false); }

void EduTextView::copyMenuRow() {
  if (model_ != 0) {
    QApplication::clipboard()->setText(model_->rowText(menuRow_));
  }
}

// As upstream's textTextEdit: keep Window > Text Segment in step.  (Events
// can arrive while the main window is still being constructed.)
void EduTextView::hideEvent(QHideEvent* event) {
  if (Window != NULL) {
    Window->ui->action_Win_TextSegment->setChecked(false);
  }
  QTableView::hideEvent(event);
}

void EduTextView::showEvent(QShowEvent* event) {
  if (Window != NULL) {
    Window->ui->action_Win_TextSegment->setChecked(true);
  }
  QTableView::showEvent(event);
}
