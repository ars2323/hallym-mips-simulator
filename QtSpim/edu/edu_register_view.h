/* QtSpim-Edu: the integer register panel (PLAN R1).

   A QTreeView over EduRegisterModel that takes the place of upstream's
   IntRegTextEdit inside IntRegDockWidget, and keeps its behaviour:

     - context menu: Binary / Decimal / Hex (the Registers menu's own
       actions) and "Change Register Contents"; a double click also edits
     - the Window > Integer Registers check mark follows show/hide

   Upstream found the register under the mouse by regex over the text line;
   here it is simply the clicked row.
*/

#ifndef EDU_REGISTER_VIEW_H
#define EDU_REGISTER_VIEW_H

#include <QTreeView>

#include "edu/core/edu_registers.h"

class EduFrozenColumns;
class EduRegisterModel;
class QAction;

class EduRegisterView : public QTreeView {
  Q_OBJECT

 public:
  explicit EduRegisterView(QWidget* parent = 0);

  void setRegisterModel(EduRegisterModel* model);

  // The selected register, if a register row is selected.
  bool currentRegister(edu::RegisterRef* reg) const;
  void selectRegister(const edu::RegisterRef& reg);

  // The row and nothing else; see EduTextView::scrollTo (V).
  void scrollTo(const QModelIndex& index,
                ScrollHint hint = EnsureVisible);

  // Sets the font and the minimum width that goes with it.
  void applyPanelFont(const QFont& font);

  // Height at which every currently expanded row is visible without a
  // scroll bar.  Also what sizeHint() asks for.
  int fullContentHeight() const;
  QSize sizeHint() const;

  // The width the name and number columns need: the column may be dragged
  // down to this and no further, so that a register is always named.
  int frozenWidth() const;

 signals:
  // Emitted when the selection moves; hasRegister is false on a group row.
  void registerSelectionChanged();

 public slots:
  void changeValueOfCurrent();

 private slots:
  void syncFrozenGeometry();
  // The column widths the font and the base ask for.
  void fitColumns();
  // The panel's own menu, opened either here or on the frozen strip.
  void showMenuAt(const QModelIndex& index, const QPoint& globalPos);

 protected:
  void resizeEvent(QResizeEvent* event);
  void contextMenuEvent(QContextMenuEvent* event);
  void keyPressEvent(QKeyEvent* event);
  void wheelEvent(QWheelEvent* event);
  void scrollContentsBy(int dx, int dy);
  void hideEvent(QHideEvent* event);
  void showEvent(QShowEvent* event);

 private slots:
  void onDoubleClicked(const QModelIndex& index);
  void onCurrentChanged();

 private:
  void changeValue(const edu::RegisterRef& reg);
  void initFrozen();

  EduRegisterModel* model_;
  int contentWidth_;  // what the whole table wants, measured with the font
  bool fontApplied_;  // applyPanelFont() is called on every refresh
  QFont appliedFont_;
  int nameWidth_;     // what the names and group titles need
  // A second view of the same model, showing only the name and the number
  // and laid over the left of this one.  In binary a value is thirty-nine
  // characters and the table scrolls sideways; without this the names go
  // with it and the panel becomes a wall of digits (L).
  QTreeView* frozen_;
  EduFrozenColumns* frozenColumns_;
  bool keyNavigating_;  // inside keyPressEvent: sideways moves are wanted
  QAction* changeValueAction_;
};

#endif  // EDU_REGISTER_VIEW_H
