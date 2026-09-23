/* Hallym MIPS Simulator -- the handle where the two splits cross.

   With four panels in a two by two block -- editor and console in one
   column, text and inspector in the other -- there are three ways to
   change their sizes: the line down the middle, the line across, and the
   point where they meet.  Qt gives the first two (they are dock
   separators, and the tour of this program keeps the two horizontal ones
   in step, see SpimView::eduSyncSplits), but not the third: there is no
   widget at the crossing, so a drag there would catch one line or the
   other.

   This is that missing widget: twelve pixels square, sitting over the
   crossing, showing the move cursor, and dragging both lines at once.  It
   is not part of the dock layout -- it is a child of the main window,
   placed wherever the crossing is and hidden when there is no crossing
   (a panel closed, floated, or dragged somewhere else).
*/

#ifndef EDU_CROSS_HANDLE_H
#define EDU_CROSS_HANDLE_H

#include <QPoint>
#include <QWidget>

class SpimView;

class EduCrossHandle : public QWidget {
  Q_OBJECT

 public:
  explicit EduCrossHandle(SpimView* window);

  enum { kSize = 12 };

  // Puts the handle where the two splits cross, or hides it when the four
  // panels are not in their block.
  void follow();

 protected:
  void paintEvent(QPaintEvent* event);
  void mousePressEvent(QMouseEvent* event);
  void mouseMoveEvent(QMouseEvent* event);
  void mouseReleaseEvent(QMouseEvent* event);

 private:
  SpimView* window_;
  bool dragging_;
  QPoint pressedAt_;     // in the main window's coordinates
  int pressedColumn_;    // width of the middle column at the press
  int pressedRow_;       // height of the top row at the press
};

#endif  // EDU_CROSS_HANDLE_H
