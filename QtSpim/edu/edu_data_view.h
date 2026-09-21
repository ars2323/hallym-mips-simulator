/* QtSpim-Edu: the Data panel (PLAN R5).

   EduDataPanel is what sits in DataSegDockWidget in place of upstream's
   DataSegmentTextEdit: a "Go to" bar over an EduDataView (a QTableView over
   EduDataModel).  Kept from upstream:

     - context menu: Binary / Decimal / Hex (the Data Segment menu's own
       actions) and "Change Memory Contents"; a double click also edits
     - the Window > Data Segment check mark follows show/hide

   New: Words / Half words / Bytes in the same menus, Go to (address, label,
   $register), a "$sp" button, fold rows, one selectable cell per word.
*/

#ifndef EDU_DATA_VIEW_H
#define EDU_DATA_VIEW_H

#include <QTableView>
#include <QWidget>

#include "edu/core/edu_memory_text.h"

class EduDataModel;
class QAction;
class QActionGroup;
class QLabel;
class QLineEdit;

class EduDataView : public QTableView {
  Q_OBJECT

 public:
  explicit EduDataView(QWidget* parent = 0);

  void setDataModel(EduDataModel* model);
  void applyPanelFont(const QFont& font);
  void fitColumns();  // after the base or the unit changed

  bool currentWord(quint32* address) const;
  bool goToAddress(quint32 address);  // reveal, select, scroll

  // What Change Memory Contents does once it has a value.
  void writeWord(quint32 address, quint32 value);

  // Words / Half words / Bytes; owned here, also put into the Data Segment
  // menu by the main window.
  QList<QAction*> unitActions() const;
  void setUnit(edu::MemoryUnit unit);  // checks the matching action too

 signals:
  void memorySelectionChanged();  // the user picked a cell
  void memoryRowsReset();         // rows were rebuilt; selection restored
  void memoryEdited();            // Change Memory Contents wrote a word

 public slots:
  void changeValueOfCurrent();

 protected:
  void contextMenuEvent(QContextMenuEvent* event);

 private slots:
  void onClicked(const QModelIndex& index);
  void onDoubleClicked(const QModelIndex& index);
  void onCurrentChanged();
  void beforeReset();
  void afterReset();
  void onUnitAction(QAction* action);

 private:
  void changeValue(quint32 address);

  EduDataModel* model_;
  QAction* changeValueAction_;
  QActionGroup* unitGroup_;
  bool restoring_;
  bool fontApplied_;
  QFont appliedFont_;
  int fittedBase_;
  int fittedUnit_;
  QFont fittedFont_;
  bool hadSelection_;
  quint32 selectedAddress_;
  int scrollValue_;
  quint32 menuAddress_;
  bool menuHasAddress_;
};

class EduDataPanel : public QWidget {
  Q_OBJECT

 public:
  explicit EduDataPanel(QWidget* parent = 0);

  EduDataView* view() const { return view_; }
  void setDataModel(EduDataModel* model);

  // Types into the Go to box and presses Enter (also used by the harness).
  bool goTo(const QString& text);

 protected:
  void hideEvent(QHideEvent* event);
  void showEvent(QShowEvent* event);

 private slots:
  void onGoTo();
  void onGoToStackPointer();

 private:
  EduDataModel* model_;
  EduDataView* view_;
  QLineEdit* goToEdit_;
  QLabel* goToStatus_;
};

#endif  // EDU_DATA_VIEW_H
