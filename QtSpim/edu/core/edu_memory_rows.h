/* QtSpim-Edu: which lines the Data panel shows for a range of memory
   (PLAN R5).

   Same lines as upstream's text window (SpimView::formatMemoryContents(),
   QtSpim/datawin.cpp), so a student sees the same thing in both programs
   and in a saved log:

     - a line is up to four words at a 16-byte aligned address;
     - a range that starts inside a line begins with a short line;
     - from a line start, four or more consecutive zero words become ONE row
       "[from]..[to] 00000000" however long the run is; after the run, the
       rest of that line is again a short line.

   One addition: a "pinned" line is always shown as words, even inside a
   zero run.  That is how Go To can land on (and Change Memory Contents can
   reach) an address the zero-run row would otherwise swallow.

   QtCore only; memory is reached through MemoryReader.
*/

#ifndef EDU_MEMORY_ROWS_H
#define EDU_MEMORY_ROWS_H

#include <QSet>
#include <QVector>
#include <QtGlobal>

namespace edu {

class MemoryReader {
 public:
  virtual ~MemoryReader() {}
  virtual quint32 word(quint32 address) const = 0;
};

struct MemoryRow {
  enum Kind { Words, ZeroRun };
  Kind kind;
  quint32 address;  // of the first word in the row
  quint32 words;    // Words: 1..4.  ZeroRun: length of the run

  quint32 end() const { return address + 4 * words; }  // one past the row
  bool contains(quint32 a) const { return a >= address && a < end(); }
  bool operator==(const MemoryRow& o) const {
    return kind == o.kind && address == o.address && words == o.words;
  }
};

// Rows for [from, to).  `from` is rounded up to a word boundary as upstream
// does; `pinnedLines` holds 16-byte aligned addresses.
QVector<MemoryRow> layoutMemoryRows(quint32 from, quint32 to,
                                    const MemoryReader& memory,
                                    const QSet<quint32>& pinnedLines);

}  // namespace edu

#endif  // EDU_MEMORY_ROWS_H
