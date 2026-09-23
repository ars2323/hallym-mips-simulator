/* See edu_view_scroll.h. */

#include "edu/edu_view_scroll.h"

#include <QAbstractScrollArea>
#include <QModelIndex>
#include <QScrollBar>

EduKeepHorizontalScroll::EduKeepHorizontalScroll(QAbstractScrollArea* area)
    : area_(area),
      value_(area != 0 ? area->horizontalScrollBar()->value() : 0) {}

EduKeepHorizontalScroll::~EduKeepHorizontalScroll() {
  if (area_ != 0) {
    // setValue() clamps, so a model that shrank while this was in scope
    // leaves the panel at the nearest position it still has.
    area_->horizontalScrollBar()->setValue(value_);
  }
}

void eduScrollRowOnly(QAbstractItemView* view, const QModelIndex& index,
                      QAbstractItemView::ScrollHint hint) {
  if (view == 0 || !index.isValid()) {
    return;
  }
  EduKeepHorizontalScroll keep(view);
  view->scrollTo(index, hint);
}
