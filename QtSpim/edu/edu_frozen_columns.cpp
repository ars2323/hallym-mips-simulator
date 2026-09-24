/* See edu_frozen_columns.h. */

#include "edu/edu_frozen_columns.h"

#include <QResizeEvent>

#include <QAbstractItemModel>
#include <QAbstractItemView>
#include <QApplication>
#include <QContextMenuEvent>
#include <QEvent>
#include <QHeaderView>
#include <QScrollBar>
#include <QTableView>
#include <QTreeView>

EduFrozenRowDelegate::EduFrozenRowDelegate(QAbstractItemView* source,
                                           QAbstractItemDelegate* painter,
                                           QObject* parent)
    : QStyledItemDelegate(parent), source_(source), painter_(painter) {
  painter_->setParent(this);
}

void EduFrozenRowDelegate::paint(QPainter* painter,
                                 const QStyleOptionViewItem& option,
                                 const QModelIndex& index) const {
  painter_->paint(painter, option, index);
}

QSize EduFrozenRowDelegate::sizeHint(const QStyleOptionViewItem& option,
                                     const QModelIndex& index) const {
  QSize size = painter_->sizeHint(option, index);
  const int height = sourceRowHeight(source_, index);
  if (height > 0) {
    size.setHeight(height);
  }
  return size;
}

int EduFrozenRowDelegate::sourceRowHeight(QAbstractItemView* source,
                                          const QModelIndex& index) {
  if (QTableView* table = qobject_cast<QTableView*>(source)) {
    return table->rowHeight(index.row());
  }
  if (qobject_cast<QTreeView*>(source) != 0) {
    // QTreeView::rowHeight() is protected; visualRect() says the same and
    // is not clipped to the viewport, so a row scrolled out still answers.
    return source->visualRect(index).height();
  }
  return 0;
}

EduFrozenColumns::EduFrozenColumns(QAbstractItemView* view,
                                   QAbstractItemView* frozen, int columns,
                                   QObject* parent)
    : QObject(parent),
      view_(view),
      frozen_(frozen),
      columns_(columns),
      attached_(false) {}

QHeaderView* EduFrozenColumns::headerOf(QAbstractItemView* view) const {
  if (QTreeView* tree = qobject_cast<QTreeView*>(view)) {
    return tree->header();
  }
  if (QTableView* table = qobject_cast<QTableView*>(view)) {
    return table->horizontalHeader();
  }
  return 0;
}

int EduFrozenColumns::headerHeight() const {
  const QHeaderView* header = headerOf(view_);
  return header != 0 && !header->isHidden() ? header->height() : 0;
}

void EduFrozenColumns::attach() {
  if (view_ == 0 || frozen_ == 0 || view_->model() == 0) {
    return;
  }
  frozen_->setModel(view_->model());
  frozen_->setSelectionModel(view_->selectionModel());
  frozen_->setFrameShape(QFrame::NoFrame);
  frozen_->setFocusPolicy(Qt::NoFocus);
  frozen_->setHorizontalScrollBarPolicy(Qt::ScrollBarAlwaysOff);
  frozen_->setVerticalScrollBarPolicy(Qt::ScrollBarAlwaysOff);
  frozen_->setSelectionMode(view_->selectionMode());
  frozen_->setSelectionBehavior(view_->selectionBehavior());
  frozen_->setEditTriggers(view_->editTriggers());
  frozen_->viewport()->installEventFilter(this);

  if (QTreeView* tree = qobject_cast<QTreeView*>(frozen_)) {
    QTreeView* source = qobject_cast<QTreeView*>(view_);
    tree->setRootIsDecorated(source->rootIsDecorated());
    tree->setIndentation(source->indentation());
    tree->setUniformRowHeights(source->uniformRowHeights());
    tree->setExpandsOnDoubleClick(false);
    tree->expandAll();
    connect(source, SIGNAL(expanded(QModelIndex)), tree,
            SLOT(expand(QModelIndex)));
    connect(source, SIGNAL(collapsed(QModelIndex)), tree,
            SLOT(collapse(QModelIndex)));
    connect(tree, SIGNAL(expanded(QModelIndex)), source,
            SLOT(expand(QModelIndex)));
    connect(tree, SIGNAL(collapsed(QModelIndex)), source,
            SLOT(collapse(QModelIndex)));
  }
  if (QTableView* table = qobject_cast<QTableView*>(frozen_)) {
    QTableView* source = qobject_cast<QTableView*>(view_);
    table->setShowGrid(source->showGrid());
    table->setWordWrap(source->wordWrap());
    table->setCornerButtonEnabled(false);
    table->verticalHeader()->hide();
    table->verticalHeader()->setSectionResizeMode(QHeaderView::Fixed);
  }

  QHeaderView* header = headerOf(frozen_);
  QHeaderView* source = headerOf(view_);
  if (header != 0 && source != 0) {
    header->setStretchLastSection(false);
    header->setSectionsClickable(false);
    header->setSectionsMovable(false);
    header->setHighlightSections(source->highlightSections());
    header->setDefaultAlignment(source->defaultAlignment());
    connect(source, SIGNAL(sectionResized(int, int, int)), this, SLOT(sync()));
    // sync() pins the strip's header to the panel header's height, so it has
    // to run when that height is what it will be -- not a moment before.  A
    // font change resizes the columns first and the header a beat later, and
    // a sync driven only by sectionResized read the old height and pinned the
    // strip to it for good: the strip's rows then began higher than the
    // panel's by the difference, which grew with the text size (II).  Watch
    // the panel's header itself, so the two take the same value at the same
    // time.
    source->installEventFilter(this);
  }

  // The rows of the two have to stay level, so the one scroll bar that
  // is left drives both.
  connect(view_->verticalScrollBar(), SIGNAL(valueChanged(int)),
          frozen_->verticalScrollBar(), SLOT(setValue(int)));
  connect(frozen_->verticalScrollBar(), SIGNAL(valueChanged(int)),
          view_->verticalScrollBar(), SLOT(setValue(int)));

  // The strip is over the table, not under it.
  view_->viewport()->stackUnder(frozen_);
  attached_ = true;
  sync();
}

int EduFrozenColumns::width() const {
  const QHeaderView* header = headerOf(view_);
  if (!attached_ || header == 0) {
    return 0;
  }
  int total = 0;
  for (int column = 0; column < columns_; column += 1) {
    if (!header->isSectionHidden(column)) {
      total += header->sectionSize(column);
    }
  }
  return total;
}

void EduFrozenColumns::sync() {
  if (!attached_) {
    return;
  }
  QHeaderView* header = headerOf(frozen_);
  QHeaderView* source = headerOf(view_);
  if (header == 0 || source == 0) {
    return;
  }
  // Everything the panel decided, copied rather than decided again.  The
  // scroll mode matters as much as the font: in ScrollPerItem the offset
  // at the end of the range depends on the height of the viewport, and
  // the two viewports were eight pixels apart (U).
  frozen_->setFont(view_->font());
  frozen_->setVerticalScrollMode(view_->verticalScrollMode());
  header->setFont(source->font());
  // The strip's header is held to the panel's height, so that what is left
  // for the rows is the same in both to the pixel.
  if (!source->isHidden()) {
    header->setFixedHeight(source->height());
  }
  if (QTreeView* tree = qobject_cast<QTreeView*>(frozen_)) {
    tree->setIndentation(qobject_cast<QTreeView*>(view_)->indentation());
  }
  if (QTableView* table = qobject_cast<QTableView*>(frozen_)) {
    QTableView* from = qobject_cast<QTableView*>(view_);
    table->verticalHeader()->setDefaultSectionSize(
        from->verticalHeader()->defaultSectionSize());
  }

  const int columns = view_->model() != 0 ? view_->model()->columnCount() : 0;
  for (int column = 0; column < columns; column += 1) {
    const bool frozen = column < columns_;
    header->setSectionHidden(column, !frozen || source->isSectionHidden(column));
    if (frozen) {
      header->resizeSection(column, source->sectionSize(column));
    }
  }

  const int strip = width();
  frozen_->setGeometry(view_->frameWidth(), view_->frameWidth(), strip,
                       view_->viewport()->height() + headerHeight());
  frozen_->setVisible(strip > 0);
  frozen_->verticalScrollBar()->setRange(view_->verticalScrollBar()->minimum(),
                                         view_->verticalScrollBar()->maximum());
  frozen_->verticalScrollBar()->setValue(view_->verticalScrollBar()->value());
}

// Walks down the two views a pixel row at a time and asks each which model
// row is there.  That is what the student sees, so that is what is checked.
int EduFrozenColumns::firstMisalignedRow(QString* why) const {
  if (!attached_ || frozen_->isHidden()) {
    return -1;
  }
  const int height =
      qMin(view_->viewport()->height(), frozen_->viewport()->height());
  for (int y = 2; y < height; y += 2) {
    const QModelIndex a = view_->indexAt(QPoint(4, y));
    const QModelIndex b = frozen_->indexAt(QPoint(4, y));
    const QModelIndex a0 = a.isValid() ? a.sibling(a.row(), 0) : QModelIndex();
    const QModelIndex b0 = b.isValid() ? b.sibling(b.row(), 0) : QModelIndex();
    if (a0 != b0) {
      if (why != 0) {
        *why = QString("y=%1: panel row %2, strip row %3")
                   .arg(y)
                   .arg(a0.isValid() ? a0.row() : -1)
                   .arg(b0.isValid() ? b0.row() : -1);
      }
      return y;
    }
    if (a0.isValid()) {
      const QRect ra = view_->visualRect(a0);
      const QRect rb = frozen_->visualRect(b0);
      if (ra.y() != rb.y() || ra.height() != rb.height()) {
        if (why != 0) {
          *why = QString("row %1: panel y=%2 h=%3, strip y=%4 h=%5")
                     .arg(a0.row()).arg(ra.y()).arg(ra.height())
                     .arg(rb.y()).arg(rb.height());
        }
        return y;
      }
    }
  }
  return -1;
}

bool EduFrozenColumns::eventFilter(QObject* watched, QEvent* event) {
#ifndef QT_NO_DEBUG
  // A debug build says so the moment the two disagree.  The check is at
  // paint time because that is when the layout has settled -- during one
  // there are honest half-states -- and it is what the student would be
  // looking at.  It is not an abort: a warning names the row and the
  // developer sees it in the console, while the sweep in the harness
  // (--align-sweep) is what turns it into a failure.
  if (attached_ && watched == frozen_->viewport() &&
      event->type() == QEvent::Paint) {
    QString why;
    if (firstMisalignedRow(&why) >= 0) {
      qWarning("%s: the frozen strip and the panel disagree -- %s",
               qPrintable(view_->objectName()), qPrintable(why));
    }
  }
#endif
  // sync() moves the strip's geometry, so it must not run for nothing: a
  // header resizes on every column drag and every window resize, and only
  // its *height* is what the strip has to follow.  Narrowing it to a real
  // height change keeps the sideways-blit count at zero and the repaint
  // share where V and BB left them.
  if (attached_ && watched == headerOf(view_)) {
    if (event->type() == QEvent::Resize) {
      const QResizeEvent* resize = static_cast<QResizeEvent*>(event);
      if (resize->oldSize().height() != resize->size().height()) {
        sync();
      }
    } else if (event->type() == QEvent::FontChange) {
      sync();
    }
  }
  if (attached_ && watched == frozen_->viewport() &&
      event->type() == QEvent::ContextMenu) {
    QContextMenuEvent* menu = static_cast<QContextMenuEvent*>(event);
    emit contextMenuRequested(frozen_->indexAt(menu->pos()),
                              menu->globalPos());
    return true;
  }
  return QObject::eventFilter(watched, event);
}
