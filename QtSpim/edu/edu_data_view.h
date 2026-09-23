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
class EduFrozenColumns;
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
  void resetColumnWidths();  // back to what the base and unit ask for (AA)

  bool currentWord(quint32* address) const;
  bool goToAddress(quint32 address);  // reveal, select, scroll

  // The row and nothing else; see EduTextView::scrollTo (V).
  void scrollTo(const QModelIndex& index,
                ScrollHint hint = EnsureVisible);

  // The width of the frozen Address strip: the delegate starts a whole-row
  // text after it, so that the strip never cuts one in half.
  int frozenWidth() const;

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
  void resizeEvent(QResizeEvent* event);
  void keyPressEvent(QKeyEvent* event);
  void wheelEvent(QWheelEvent* event);
  void scrollContentsBy(int dx, int dy);

 private slots:
  void showMenuAt(const QModelIndex& index, const QPoint& globalPos);
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
  QTableView* frozen_;
  EduFrozenColumns* frozenColumns_;
  bool keyNavigating_;  // inside keyPressEvent: sideways moves are wanted
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
