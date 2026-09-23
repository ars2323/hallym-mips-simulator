/* Hallym MIPS Simulator -- leading columns that do not scroll away.

   In binary a register value is thirty-nine characters and a row of
   memory four times that; with Comments shown a line of source can be
   longer still.  Once a panel is scrolled sideways far enough, the
   column that says *which* register or *which* address this row is
   disappears off the left and the panel becomes a wall of digits (L, R).

   This keeps the leading columns in place: a second view of the same
   model and the same selection, laid over the left edge of the first
   and scrolled only up and down.  The two behave as one table -- same
   rows, same heights, same selection, same fonts -- because they are
   one model seen twice.

   The owner builds the second view (its own class, so that a tree stays
   a tree and a table a table, and so that the panel can give it the
   delegate it wants), hands both to this, and calls attach() once the
   model is set.  What arrives back are the clone's own clicked() and
   doubleClicked() -- the indexes are the model's, so the panel's
   handlers take them unchanged -- and contextMenuRequested(), because a
   right click on the frozen strip must open the panel's menu for that
   row and not the clone's (which has none).
*/

#ifndef EDU_FROZEN_COLUMNS_H
#define EDU_FROZEN_COLUMNS_H

#include <QObject>
#include <QPoint>

class QAbstractItemView;
class QHeaderView;
class QModelIndex;

class EduFrozenColumns : public QObject {
  Q_OBJECT

 public:
  // `columns` leading columns of `view` are shown by `frozen`, which must
  // already be a child widget of `view`.
  EduFrozenColumns(QAbstractItemView* view, QAbstractItemView* frozen,
                   int columns, QObject* parent);

  // After the model has been set on `view`: gives the clone the same
  // model and the same selection model, and starts following.
  void attach();

  // The width of the frozen strip, 0 while it is not attached.  A panel
  // that paints a whole row itself (a segment header) starts the text
  // after this, so that the strip does not cut it in two.
  int width() const;

  QAbstractItemView* frozenView() const { return frozen_; }

 signals:
  void contextMenuRequested(const QModelIndex& index, const QPoint& globalPos);

 public slots:
  // Fonts, column widths, geometry.  Called on every resize of the panel
  // and whenever a column is dragged.
  void sync();

 protected:
  bool eventFilter(QObject* watched, QEvent* event);

 private:
  QHeaderView* headerOf(QAbstractItemView* view) const;
  int headerHeight() const;

  QAbstractItemView* view_;
  QAbstractItemView* frozen_;
  int columns_;
  bool attached_;
};

#endif  // EDU_FROZEN_COLUMNS_H
