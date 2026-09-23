/* QtSpim-Edu: the Text panel (PLAN R3).

   A QTableView over EduTextModel that takes the place of upstream's
   TextSegmentTextEdit inside TextSegDockWidget and keeps its behaviour:

     - context menu: Set Breakpoint / Clear Breakpoint (upstream found the
       address by regex over the clicked text line; here it is the row), plus
       Copy for what the text widget's standard menu offered
     - a click in the BP column toggles the breakpoint
     - the Window > Text Segment check mark follows show/hide
     - a click on the kernel segment's header row expands / collapses it
*/

#ifndef EDU_TEXT_VIEW_H
#define EDU_TEXT_VIEW_H

#include <QTableView>

class EduFrozenColumns;
class EduTextModel;
class QAction;

class EduTextView : public QTableView {
  Q_OBJECT

 public:
  explicit EduTextView(QWidget* parent = 0);

  void setTextModel(EduTextModel* model);

  // Font, and the column widths and row height that go with it.
  void applyPanelFont(const QFont& font);

  // Text > Comments / Instruction Value.
  void setColumnsShown(bool code, bool source);

  // What the panel asks for at first start (upstream's .ui gave the text
  // window a MINIMUM of 800x600; that size is a wish here, so the panel can
  // also be made small when it shares the area with the editor).
  QSize sizeHint() const { return QSize(800, 600); }

  // The selected instruction's address, if an instruction row is selected.
  // The width of the frozen BP/Address strip: a segment header's text
  // starts after it, so the strip never cuts one in half.
  int frozenWidth() const;

  bool currentInstruction(quint32* address) const;
  void selectAddress(quint32 address);
  void showAddress(quint32 address);  // scroll just enough to see it

 signals:
  void instructionSelectionChanged();  // the user picked a row
  void instructionRowsReset();         // rows were rebuilt; selection restored

 protected:
  void contextMenuEvent(QContextMenuEvent* event);
  void resizeEvent(QResizeEvent* event);
  void hideEvent(QHideEvent* event);
  void showEvent(QShowEvent* event);

 private slots:
  void showMenuAt(const QModelIndex& index, const QPoint& globalPos);
  void onClicked(const QModelIndex& index);
  void onCurrentChanged();
  void beforeReset();
  void afterReset();
  void setBreakpointAtMenuRow();
  void clearBreakpointAtMenuRow();
  void copyMenuRow();

 private:
  void setBreakpoint(int row, bool on);
  void fitSourceColumn();

  EduTextModel* model_;
  QTableView* frozen_;
  EduFrozenColumns* frozenColumns_;
  QAction* setBreakpointAction_;
  QAction* clearBreakpointAction_;
  QAction* copyAction_;
  int menuRow_;
  bool restoring_;
  bool fontApplied_;
  QFont appliedFont_;
  int instructionColumnMax_;
  bool hadSelection_;
  quint32 selectedAddress_;
  int scrollValue_;
};

#endif  // EDU_TEXT_VIEW_H
