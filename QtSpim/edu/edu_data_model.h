/* QtSpim-Edu: the Data panel's model (PLAN R5).

       Address | +0 | +4 | +8 | +C | ASCII | Labels

   A flat table over the three data segments upstream shows (user data, user
   stack from $sp up, kernel data).  Each segment has a header row that folds
   it; the kernel segment starts folded.  Inside a segment the rows are
   exactly upstream's lines (edu/core/edu_memory_rows.h): up to four words
   per line, runs of zero words as one row.

   The top of the stack holds what the core copied there when it set the
   stack up: the process environment and the command line (ARCHITECTURE
   3.10).  That is the student's user name and paths, so it is one folded
   row until clicked.  Its lower bound comes from the core's own registers
   right after initialize_stack() ($a2 = &envp[0]); see setEnvironmentStart().

   Values are read from the core in refresh() and only there, which the GUI
   calls where upstream rebuilt its HTML (DisplayDataSegments()).  Between
   refreshes the table shows what it read, as upstream's text did.
*/

#ifndef EDU_DATA_MODEL_H
#define EDU_DATA_MODEL_H

#include <QAbstractTableModel>
#include <QColor>
#include <QSet>
#include <QVector>

#include "edu/core/edu_memory_text.h"
#include "edu/core/edu_symbols.h"

class EduDataModel : public QAbstractTableModel {
  Q_OBJECT

 public:
  enum Column { AddressColumn, Word0Column, Word1Column, Word2Column,
                Word3Column, AsciiColumn, LabelColumn, ColumnCount };
  enum Segment { UserData, UserStack, KernelData, SegmentCount };
  enum RowKind { SegmentHeader, WordsRow, ZeroRunRow, EnvironmentFold };
  enum Role {
    RowKindRole = Qt::UserRole + 1,  // int (RowKind)
    AddressRole,    // quint32: the word a +0..+C cell stands for; else invalid
    PointerRole,    // int: general register number pointing into the cell, or -1
    FullRowTextRole // QString: text a header / fold / zero-run row shows
  };

  struct Row {
    RowKind kind;
    Segment segment;
    quint32 address;  // first word (rows of words), start of range (others)
    quint32 words;    // WordsRow: 1..4; ZeroRunRow: run length
    quint32 end;      // SegmentHeader / EnvironmentFold: one past the range
    quint32 word[4];  // WordsRow: by line slot, (address & ~15) + 4 * i
    quint16 half[8];
    quint8 byte[16];
    QString labels;   // LabelColumn text

    quint32 lineBase() const { return address & ~quint32(15); }
  };

  explicit EduDataModel(QObject* parent = 0);

  // Re-reads memory, registers and the segment bounds from the core.
  void refresh();

  // True when $sp, $fp or $gp no longer has the value refresh() saw.
  bool markedRegistersDiffer() const;

  void setSegmentsShown(bool userData, bool userStack, bool kernelData);
  void setBase(int base);
  void setUnit(edu::MemoryUnit unit);
  edu::MemoryUnit unit() const { return unit_; }
  int base() const { return base_; }
  void setColors(const QColor& text, const QColor& background);

  // Labels by address; the model keeps a copy.
  void setLabels(const edu::LabelMap& labels);
  const edu::LabelMap& labels() const { return labels_; }

  // $a2 right after the core initialised the stack: where envp[] begins.
  // Everything from there to the top of the stack is the folded area.
  // 0 = unknown, nothing is folded.
  void setEnvironmentStart(quint32 address);
  bool isEnvironmentExpanded() const { return environmentExpanded_; }
  void setEnvironmentExpanded(bool expanded);

  bool isSegmentExpanded(Segment segment) const { return expanded_[segment]; }
  void setSegmentExpanded(Segment segment, bool expanded);

  // Makes sure `address` has a row of words (unfolds its segment, the
  // environment, and pins its line if it sits in a zero run).  Returns the
  // cell, or an invalid index when the address is in no shown segment.
  QModelIndex reveal(quint32 address);
  void clearPins();

  QModelIndex indexOfAddress(quint32 address) const;
  const Row* rowAt(int row) const;
  bool wordAt(const QModelIndex& index, quint32* address) const;
  static QString segmentName(Segment segment);  // "User data", ...

  // What the inspector needs about one word.
  struct WordInfo {
    quint32 address;
    quint32 value;
    quint8 bytes[4];
    QStringList labels;    // "msg", "half+2"
    QStringList pointers;  // "$sp", "$t0+1"
    QString segment;
  };
  bool wordInfo(quint32 address, WordInfo* info) const;

  int rowCount(const QModelIndex& parent = QModelIndex()) const;
  int columnCount(const QModelIndex& parent = QModelIndex()) const;
  QVariant data(const QModelIndex& index, int role) const;
  QVariant headerData(int section, Qt::Orientation orientation, int role) const;
  Qt::ItemFlags flags(const QModelIndex& index) const;

 private:
  QVector<Row> buildRows() const;
  void appendRange(Segment segment, quint32 from, quint32 to,
                   QVector<Row>* rows) const;
  QString labelText(const Row& row) const;
  QString fullRowText(const Row& row) const;
  QString cellText(const Row& row, int slot) const;
  int pointerInto(quint32 from, quint32 to) const;  // $sp, $fp, $gp only

  QVector<Row> rows_;
  bool shown_[SegmentCount];
  bool expanded_[SegmentCount];
  bool environmentExpanded_;
  quint32 environmentStart_;
  QSet<quint32> pinnedLines_;
  edu::LabelMap labels_;
  edu::MemoryUnit unit_;
  int base_;
  quint32 registers_[32];  // general registers as of the last refresh
  QColor text_;
  QColor background_;
};

#endif  // EDU_DATA_MODEL_H
