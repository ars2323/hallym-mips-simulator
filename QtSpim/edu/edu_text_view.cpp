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

#include "edu/edu_frozen_columns.h"
#include "edu/edu_text_model.h"
#include "edu/edu_view_scroll.h"
#include "edu/theme/tokens.h"
#include "edu/edu_panel_zoom.h"
#include "spimview.h"
#include "ui_spimview.h"

namespace {

using namespace edu::theme;

const BadgeColors& badgeColors(const QString& type) {
  for (unsigned i = 0; i < sizeof(kBadges) / sizeof(kBadges[0]); i += 1) {
    if (type == QLatin1String(kBadges[i].type)) {
      return kBadges[i];
    }
  }
  return kBadges[sizeof(kBadges) / sizeof(kBadges[0]) - 1];  // CP0
}

// Paints the row background itself -- the PC row (blue tint, left bar) and
// the selected row (darker tint, navy text; never white on blue) -- the
// pseudo-expansion band bar, the breakpoint dot and the type badge.
// docs/design/tokens.md 1.3 and 4.
class TextRowDelegate : public QStyledItemDelegate {
 public:
  // `frozen` is the copy that paints the strip of BP and Address cells.
  // A segment header is one text across the whole row, so the strip
  // leaves it to the table underneath and paints only its background.
  TextRowDelegate(EduTextView* view, bool frozen)
      : QStyledItemDelegate(view), view_(view), frozen_(frozen) {}

  void paint(QPainter* painter, const QStyleOptionViewItem& option,
             const QModelIndex& index) const {
    QStyleOptionViewItem opt(option);
    const bool isPc = index.data(EduTextModel::IsPcRole).toBool();
    const bool selected = (opt.state & QStyle::State_Selected) != 0;
    const bool instruction = index.data(EduTextModel::RowKindRole).toInt() ==
                             int(EduTextModel::InstructionRow);

    // The style's highlight is never used: selection is a tint with navy
    // text, and the PC row keeps its bar when it is the selected row too.
    opt.state &= ~QStyle::State_Selected;
    if (selected) {
      painter->fillRect(opt.rect, QColor(kBlueTint2));
    } else {
      painter->fillRect(opt.rect,
                        index.data(Qt::BackgroundRole).value<QColor>());
    }
    if (index.column() == 0) {
      if (isPc) {
        painter->fillRect(QRect(opt.rect.left(), opt.rect.top(), kPcBarWidth,
                                opt.rect.height()),
                          QColor(kBlue));
      } else if (instruction &&
                 index.data(Qt::BackgroundRole).value<QColor>() ==
                     QColor(kWindow)) {
        // A pseudo-instruction band: a bar down its left edge, broken at
        // the first row of each expansion so neighbours stay apart.
        const int gap = index.data(EduTextModel::BandStartRole).toBool() ? 2 : 0;
        painter->fillRect(QRect(opt.rect.left(), opt.rect.top() + gap,
                                kBandBarWidth, opt.rect.height() - gap),
                          QColor(kGray));
      }
    }
    if (selected || isPc) {
      opt.palette.setColor(QPalette::Text, QColor(kNavy));
    }

    if (instruction && index.column() == EduTextModel::BpColumn) {
      if (index.data(EduTextModel::BreakpointRole).toBool()) {
        const int d = qMin(opt.rect.height(), opt.rect.width()) - 8;
        QRect dot(0, 0, d, d);
        dot.moveCenter(opt.rect.center());
        painter->save();
        painter->setRenderHint(QPainter::Antialiasing);
        painter->setPen(Qt::NoPen);
        painter->setBrush(QColor(kError));
        painter->drawEllipse(dot);
        painter->restore();
      }
      return;
    }

    if (instruction && index.column() == EduTextModel::TypeColumn) {
      const QString type = index.data(Qt::DisplayRole).toString();
      const BadgeColors& colors = badgeColors(type);
      QFont font(opt.font);
      font.setPixelSize(kBadgePixelSize);
      font.setWeight(QFont::DemiBold);
      const QFontMetrics metrics(font);
      QRect badge(0, 0, metrics.horizontalAdvance("CP0") + 8,
                  qMin(opt.rect.height() - 2, kBadgeHeight));
      badge.moveCenter(opt.rect.center());
      painter->save();
      painter->setRenderHint(QPainter::Antialiasing);
      painter->setPen(Qt::NoPen);
      painter->setBrush(QColor(colors.background));
      painter->drawRoundedRect(badge, kBadgeRadius, kBadgeRadius);
      painter->setPen(QColor(colors.text));
      painter->setFont(font);
      painter->drawText(badge, Qt::AlignCenter, type);
      painter->restore();
      return;
    }

    if (!instruction) {
      if (frozen_) {
        return;  // the background, drawn above, is all the strip says here
      }
      // A header spans every column, so its text would start under the
      // frozen strip; it begins after it instead, and stays there when
      // the panel is scrolled sideways.
      const int strip = view_ != 0 ? view_->frozenWidth() : 0;
      if (opt.rect.left() < strip) {
        opt.rect.setLeft(strip);
      }
    }

    // The background is already there; keep the style from painting the
    // model's brush over it.
    opt.backgroundBrush = QBrush();
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

 private:
  EduTextView* view_;
  bool frozen_;
};

}  // namespace

EduTextView::EduTextView(QWidget* parent)
    : QTableView(parent),
      model_(0),
      frozen_(new QTableView(this)),
      frozenColumns_(0),
      menuRow_(-1),
      restoring_(false),
      fontApplied_(false),
      instructionColumnMax_(0),
      hadSelection_(false),
      selectedAddress_(0),
      scrollValue_(0) {
  setItemDelegate(new TextRowDelegate(this, false));
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
  // The last column is Source, which is sized to its contents so that a
  // long line runs off the right and can be scrolled to (R); stretching
  // it would elide the line instead.
  horizontalHeader()->setStretchLastSection(false);
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

  // BP and Address stay put.  BP is where a breakpoint is clicked and
  // Address is what says which instruction a row is; with Comments shown
  // the Source column is long enough to push both off the left edge (R).
  frozen_->setObjectName("EduTextFrozen");
  frozen_->setItemDelegate(new TextRowDelegate(this, true));
  frozenColumns_ =
      new EduFrozenColumns(this, frozen_, EduTextModel::CodeColumn, this);
  frozenColumns_->attach();
  connect(frozen_, SIGNAL(clicked(QModelIndex)), this,
          SLOT(onClicked(QModelIndex)));
  connect(frozenColumns_, SIGNAL(contextMenuRequested(QModelIndex, QPoint)),
          this, SLOT(showMenuAt(QModelIndex, QPoint)));
  afterReset();
}

int EduTextView::frozenWidth() const {
  return frozenColumns_ != 0 ? frozenColumns_->width() : 0;
}

void EduTextView::resizeEvent(QResizeEvent* event) {
  QTableView::resizeEvent(event);
  if (frozenColumns_ != 0) {
    frozenColumns_->sync();
  }
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
      qMax(qMax(metrics.height(), metrics.lineSpacing()) + 2, kRowHeight));
  const int pad = 14;
  setColumnWidth(EduTextModel::BpColumn, metrics.horizontalAdvance("BP") + pad);
  setColumnWidth(EduTextModel::AddressColumn,
                 metrics.horizontalAdvance("00000000") + pad);
  setColumnWidth(EduTextModel::CodeColumn,
                 metrics.horizontalAdvance("00000000") + pad);
  setColumnWidth(EduTextModel::TypeColumn,
                 qMax(bold.horizontalAdvance("CP0") + 8,
                      metrics.horizontalAdvance("Type")) + pad);
  // The instruction column is not drawn bold any more (E), so it is
  // measured as it is drawn.
  instructionColumnMax_ =
      metrics.horizontalAdvance(QString(38, QLatin1Char('0'))) + pad;
  setColumnWidth(EduTextModel::InstructionColumn, instructionColumnMax_);
  if (frozenColumns_ != 0) {
    frozenColumns_->sync();
  }
}

void EduTextView::setColumnsShown(bool code, bool source) {
  setColumnHidden(EduTextModel::CodeColumn, !code);
  setColumnHidden(EduTextModel::SourceColumn, !source);
  fitSourceColumn();
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
    // The row, not the sideways position: stepping must not slide the
    // columns out from under the reader (S).  setCurrentIndex() also
    // scrolls -- that is how the arrow keys follow the selection -- so
    // the guard covers it too.
    EduKeepHorizontalScroll keepSideways(this);
    setCurrentIndex(model_->index(row, EduTextModel::InstructionColumn));
    scrollTo(currentIndex(), QAbstractItemView::PositionAtCenter);
  }
}

void EduTextView::showAddress(quint32 address) {
  const int row = model_ != 0 ? model_->rowOfAddress(address) : -1;
  if (row >= 0) {
    eduScrollRowOnly(this, model_->index(row, EduTextModel::AddressColumn),
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
  EduKeepHorizontalScroll keepSideways(this);  // a refresh moves nothing (S)
  clearSpans();
  const QList<int> headers = model_->headerRows();
  for (int i = 0; i < headers.size(); i += 1) {
    setSpan(headers.at(i), 0, 1, EduTextModel::ColumnCount);
  }
  // The Instruction column is as wide as its widest text, at most the width
  // set from the font (applyPanelFont): in a dock half the window wide, the
  // Source column keeps its room.
  const int fitted = sizeHintForColumn(EduTextModel::InstructionColumn) + 8;
  if (instructionColumnMax_ > 0) {
    setColumnWidth(EduTextModel::InstructionColumn,
                   qBound(60, fitted, instructionColumnMax_));
  }
  fitSourceColumn();
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

// The Source column holds whole lines of the program, comment and all.
// Letting it stretch to the panel elided every long line with no way to
// read the rest; sized to its contents, it runs off the right and the
// horizontal scroll bar fetches it (R).
void EduTextView::fitSourceColumn() {
  if (model_ == 0 || isColumnHidden(EduTextModel::SourceColumn)) {
    return;
  }
  const int fitted = sizeHintForColumn(EduTextModel::SourceColumn) + 12;
  setColumnWidth(EduTextModel::SourceColumn, qMax(80, fitted));
}

void EduTextView::contextMenuEvent(QContextMenuEvent* event) {
  showMenuAt(indexAt(event->pos()), event->globalPos());
}

// Also reached from the frozen BP/Address strip, which has no menu.
void EduTextView::showMenuAt(const QModelIndex& index,
                             const QPoint& globalPos) {
  menuRow_ = index.row();
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
  if (Window != 0 && Window->eduTextZoom != 0) {
    Window->eduTextZoom->addMenuActions(&menu);  // Zoom In / Out / Reset
  }
  menu.exec(globalPos);
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
