/* See edu_frozen_columns.h. */

#include "edu/edu_frozen_columns.h"

#include <QAbstractItemModel>
#include <QAbstractItemView>
#include <QContextMenuEvent>
#include <QEvent>
#include <QHeaderView>
#include <QScrollBar>
#include <QTableView>
#include <QTreeView>

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
  frozen_->setVerticalScrollMode(view_->verticalScrollMode());
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
  // The same fonts, or the rows are different heights and the names
  // slide away from the values they belong to.
  frozen_->setFont(view_->font());
  header->setFont(source->font());
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
  frozen_->verticalScrollBar()->setValue(view_->verticalScrollBar()->value());
}

bool EduFrozenColumns::eventFilter(QObject* watched, QEvent* event) {
  if (attached_ && watched == frozen_->viewport() &&
      event->type() == QEvent::ContextMenu) {
    QContextMenuEvent* menu = static_cast<QContextMenuEvent*>(event);
    emit contextMenuRequested(frozen_->indexAt(menu->pos()),
                              menu->globalPos());
    return true;
  }
  return QObject::eventFilter(watched, event);
}
