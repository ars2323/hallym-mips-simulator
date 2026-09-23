/* Hallym MIPS Simulator -- scrolling that leaves the sideways view alone.

   A panel moves sideways for two reasons: the student dragged its
   horizontal scroll bar, or the program moved the selection.  Only the
   first is wanted.  QAbstractItemView::scrollTo() moves both axes --
   with PositionAtCenter it centres the cell sideways as well -- so a
   step, a Go to, or a refresh of the model could slide the columns out
   from under the reader while they were looking at something else (S).

   EduKeepHorizontalScroll notes where the panel is sideways and puts it
   back when it goes out of scope; eduScrollRowOnly() is scrollTo()
   wrapped in one of those, so it guarantees the row and nothing else.

   The tutorial is the one place that *should* scroll sideways -- it has
   to bring the cell it is pointing at into view -- so it does not use
   these.  It notes the position when it starts and restores it at the
   end (SpimView::eduTutorialTakeSettings).
*/

#ifndef EDU_VIEW_SCROLL_H
#define EDU_VIEW_SCROLL_H

#include <QAbstractItemView>

class QAbstractScrollArea;
class QModelIndex;
class QWheelEvent;

class EduKeepHorizontalScroll {
 public:
  explicit EduKeepHorizontalScroll(QAbstractScrollArea* area);
  ~EduKeepHorizontalScroll();

 private:
  Q_DISABLE_COPY(EduKeepHorizontalScroll)

  QAbstractScrollArea* area_;
  int value_;
  bool updates_;
};

// Shift and the wheel, scrolling sideways.  Some platforms turn that into
// a horizontal wheel event and some do not, so the panels take it
// themselves when the platform did not (W).  Returns true when it handled
// the event, i.e. when the caller should not pass it on.
bool eduWheelScrollsSideways(QAbstractScrollArea* area, QWheelEvent* event);

namespace edu {

// Every sideways move that reached the screen.  A panel scrolls sideways by
// blitting its viewport there and then -- QWidget::scroll(), which on
// Windows is ScrollWindowEx -- so a move that is undone afterwards is still
// drawn once, and what the student sees is a flicker (V).  The views call
// this from scrollContentsBy() when the move happened while the viewport
// was drawing; with the viewport's updates off the blit is skipped and
// nothing is counted.  Zero is the promise, and the harness checks it.
void noteSidewaysPaint(const QWidget* panel, int dx);

// Up and down is different: a step *should* move the panel, because the
// current instruction has moved.  What must not happen is a third
// position on the way -- the panel dropping to the top and climbing back,
// which is what a flicker is (BB).  Every vertical move that was drawn is
// recorded in order, per panel, so that one step can be asked how many
// positions it drew.
void noteVerticalScroll(const QWidget* panel, int value);
QString verticalTrail(const QString& panel);   // "120 -> 0 -> 140"
int verticalMoves(const QString& panel);       // how many were drawn
void resetVerticalScrolls();
int sidewaysPaints();
QString sidewaysPaintsSeen();  // "text +19, data -8", for the report
void resetSidewaysPaints();

}  // namespace edu

// The same as eduScrollVerticallyTo(); kept as the name the panels call.
void eduScrollRowOnly(QAbstractItemView* view, const QModelIndex& index,
                      QAbstractItemView::ScrollHint hint =
                          QAbstractItemView::EnsureVisible);

// Brings a row into view by moving the vertical scroll bar and nothing
// else.  This is what the panels use in place of the base class's
// scrollTo(), which moves both axes and therefore had to be wrapped in a
// guard that turned the viewport's drawing off -- and turning drawing back
// on repaints the whole panel, which is a flash on every step even when
// nothing moved at all (BB).  Here the horizontal bar is never touched, so
// there is nothing to undo and nothing to hide: a vertical move is one
// ordinary scroll, and no move is no paint.
//
// The value of a vertical scroll bar is a pixel offset (all three panels
// scroll per pixel, see U); with ScrollPerItem this falls back to the
// view's own scrollTo().
void eduScrollVerticallyTo(QAbstractItemView* view, const QModelIndex& index,
                           QAbstractItemView::ScrollHint hint);

#endif  // EDU_VIEW_SCROLL_H
