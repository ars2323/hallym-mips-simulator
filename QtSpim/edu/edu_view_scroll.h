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

class EduKeepHorizontalScroll {
 public:
  explicit EduKeepHorizontalScroll(QAbstractScrollArea* area);
  ~EduKeepHorizontalScroll();

 private:
  Q_DISABLE_COPY(EduKeepHorizontalScroll)

  QAbstractScrollArea* area_;
  int value_;
};

// scrollTo() with the horizontal position put back afterwards.
void eduScrollRowOnly(QAbstractItemView* view, const QModelIndex& index,
                      QAbstractItemView::ScrollHint hint =
                          QAbstractItemView::EnsureVisible);

#endif  // EDU_VIEW_SCROLL_H
