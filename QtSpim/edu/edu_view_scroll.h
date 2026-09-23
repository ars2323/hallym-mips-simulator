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
int sidewaysPaints();
QString sidewaysPaintsSeen();  // "text +19, data -8", for the report
void resetSidewaysPaints();

}  // namespace edu

// scrollTo() with the horizontal position put back afterwards.
void eduScrollRowOnly(QAbstractItemView* view, const QModelIndex& index,
                      QAbstractItemView::ScrollHint hint =
                          QAbstractItemView::EnsureVisible);

#endif  // EDU_VIEW_SCROLL_H
