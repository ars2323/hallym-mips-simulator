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

 signals:
  // Emitted when the selection moves; hasRegister is false on a group row.
  void registerSelectionChanged();

 public slots:
  void changeValueOfCurrent();

 protected:
  void contextMenuEvent(QContextMenuEvent* event);
  void hideEvent(QHideEvent* event);
  void showEvent(QShowEvent* event);

 private slots:
  void onDoubleClicked(const QModelIndex& index);
  void onCurrentChanged();

 private:
  void changeValue(const edu::RegisterRef& reg);

  EduRegisterModel* model_;
  QAction* changeValueAction_;
};

#endif  // EDU_REGISTER_VIEW_H
