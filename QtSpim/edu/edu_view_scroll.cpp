/* See edu_view_scroll.h. */

#include "edu/edu_view_scroll.h"

#include <QAbstractScrollArea>
#include <QModelIndex>
#include <QScrollBar>
#include <QStringList>
#include <QWheelEvent>
#include <QWidget>

EduKeepHorizontalScroll::EduKeepHorizontalScroll(QAbstractScrollArea* area)
    : area_(area),
      value_(area != 0 ? area->horizontalScrollBar()->value() : 0),
      updates_(area != 0 ? area->viewport()->updatesEnabled() : true) {
  if (area_ != 0) {
    // Not only "put it back afterwards": while this is in scope the
    // viewport does not draw, so a sideways move made and undone in
    // between never reaches the screen.  QWidget::scroll() returns at
    // once when updates are off, so there is no blit either, and turning
    // updates back on repaints the viewport whole (V).
    area_->viewport()->setUpdatesEnabled(false);
  }
}

EduKeepHorizontalScroll::~EduKeepHorizontalScroll() {
  if (area_ != 0) {
    // setValue() clamps, so a model that shrank while this was in scope
    // leaves the panel at the nearest position it still has.
    area_->horizontalScrollBar()->setValue(value_);
    area_->viewport()->setUpdatesEnabled(updates_);
  }
}

bool eduWheelScrollsSideways(QAbstractScrollArea* area, QWheelEvent* event) {
  if (area == 0 || event == 0) {
    return false;
  }
  // Only when the platform has not already made it a sideways wheel, and
  // never with Ctrl, which is the text size.
  if (!(event->modifiers() & Qt::ShiftModifier) ||
      (event->modifiers() & Qt::ControlModifier) ||
      event->angleDelta().x() != 0) {
    return false;
  }
  QScrollBar* bar = area->horizontalScrollBar();
  const int steps = event->angleDelta().y() / 120;  // one notch is 120
  if (steps == 0 || bar->maximum() == bar->minimum()) {
    return false;
  }
  bar->setValue(bar->value() - steps * bar->singleStep() * 3);
  event->accept();
  return true;
}

namespace edu {
namespace {

int sidewaysCount = 0;
QStringList sidewaysSeen;

}  // namespace

void noteSidewaysPaint(const QWidget* panel, int dx) {
  sidewaysCount += 1;
  if (sidewaysSeen.size() < 20) {
    sidewaysSeen << QString("%1 %2%3")
                        .arg(panel != 0 ? panel->objectName() : QString("?"))
                        .arg(dx > 0 ? "+" : "")
                        .arg(dx);
  }
}

int sidewaysPaints() { return sidewaysCount; }

QString sidewaysPaintsSeen() { return sidewaysSeen.join(", "); }

void resetSidewaysPaints() {
  sidewaysCount = 0;
  sidewaysSeen.clear();
}

}  // namespace edu

void eduScrollRowOnly(QAbstractItemView* view, const QModelIndex& index,
                      QAbstractItemView::ScrollHint hint) {
  if (view == 0 || !index.isValid()) {
    return;
  }
  EduKeepHorizontalScroll keep(view);
  view->scrollTo(index, hint);
}
