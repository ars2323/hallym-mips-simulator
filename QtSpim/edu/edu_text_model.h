/* QtSpim-Edu: the Text panel's model (PLAN R3).

   A flat table.  Each text segment contributes a header row and, unless it
   is collapsed, one row per instruction:

       BP | Address | Code | Type | Instruction | Source

   The kernel segment starts collapsed; the view expands it on a click, and
   the model expands it by itself when the PC enters it.

   Where each column comes from (PLAN R3, ARCHITECTURE section 14):
     - Address, Code, Instruction, Source: the core.  The disassembly is the
       core's own format_an_inst() text, the word is ENCODING(inst), the
       source line is SOURCE(inst).
     - Type: edu::formatOf(word), i.e. from the machine word alone.
     - BP: inst_is_breakpoint(), asked whenever the cell is painted.

   Rows are rebuilt exactly when upstream rebuilt its HTML (DisplayText-
   Segments(): forced, or the core's text_modified flag).  Moving the PC
   touches two rows.
*/

#ifndef EDU_TEXT_MODEL_H
#define EDU_TEXT_MODEL_H

#include <QAbstractTableModel>
#include <QColor>
#include <QFont>
#include <QHash>
#include <QVector>

class EduTextModel : public QAbstractTableModel {
  Q_OBJECT

 public:
  enum Column { BpColumn, AddressColumn, CodeColumn, TypeColumn,
                InstructionColumn, SourceColumn, ColumnCount };
  enum RowKind { UserHeader, KernelHeader, InstructionRow };
  enum Role {
    RowKindRole = Qt::UserRole + 1,  // int (RowKind)
    IsPcRole,                        // bool
    BreakpointRole,                  // bool
    BandStartRole                    // bool: first row of a pseudo expansion
  };

  struct Row {
    RowKind kind;
    quint32 address;
    quint32 word;
    bool known;            // the core could name the instruction
    bool startsSourceLine; // SOURCE(inst) != NULL
    int band;              // 0: single instruction; 1, 2: pseudo expansion
    QString disassembly;
    QString source;
    QString label;         // what a branch/jump names as its destination
  };

  explicit EduTextModel(QObject* parent = 0);

  // Re-reads the text segments from the core.
  void rebuild(bool showUser, bool showKernel);

  // Moves the PC highlight; returns the row now highlighted, or -1.
  int setCurrentPc(quint32 pc);
  quint32 currentPc() const { return pc_; }

  bool isKernelExpanded() const { return kernelExpanded_; }
  void setKernelExpanded(bool expanded);

  int rowOfAddress(quint32 address) const;
  const Row* rowAt(int row) const;
  QList<int> headerRows() const;

  // A breakpoint was set or cleared at this address by the view.
  void breakpointChanged(quint32 address);

  void setColors(const QColor& text, const QColor& background);

  // Row as one line of text, for Copy.
  QString rowText(int row) const;

  int rowCount(const QModelIndex& parent = QModelIndex()) const;
  int columnCount(const QModelIndex& parent = QModelIndex()) const;
  QVariant data(const QModelIndex& index, int role) const;
  QVariant headerData(int section, Qt::Orientation orientation, int role) const;
  Qt::ItemFlags flags(const QModelIndex& index) const;

 private:
  // Repaints one row without repainting the panel: see setCurrentPc().
  void markRowChanged(int row);

  void appendSegment(RowKind header, quint32 from, quint32 to, bool expanded);
  QString headerText(const Row& row) const;

  QVector<Row> rows_;
  QHash<quint32, int> rowOfAddress_;
  quint32 pc_;
  bool showUser_;
  bool showKernel_;
  bool kernelExpanded_;
  int kernelInstructions_;
  QColor text_;
  QColor background_;
};

#endif  // EDU_TEXT_MODEL_H
