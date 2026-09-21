/* See edu_memory_rows.h. */

#include "edu/core/edu_memory_rows.h"

namespace edu {

namespace {

const quint32 kWord = 4;
const quint32 kLine = 16;

// 64-bit so that a range ending at 0x100000000 - n cannot wrap.
quint64 roundUp(quint64 value, quint32 to) {
  return (value + to - 1) / to * to;
}

// The short line from `from` to the end of its line (or to `to`).
quint64 appendPartialLine(quint64 from, quint64 to, QVector<MemoryRow>* rows) {
  if (from % kLine == 0 || from >= to) {
    return from;
  }
  const quint64 stop = qMin(roundUp(from, kLine), to);
  MemoryRow row;
  row.kind = MemoryRow::Words;
  row.address = quint32(from);
  row.words = quint32((stop - from) / kWord);
  rows->append(row);
  return stop;
}

}  // namespace

QVector<MemoryRow> layoutMemoryRows(quint32 from32, quint32 to32,
                                    const MemoryReader& memory,
                                    const QSet<quint32>& pinnedLines) {
  QVector<MemoryRow> rows;
  const quint64 to = to32;
  quint64 i = roundUp(from32, kWord);
  i = appendPartialLine(i, to, &rows);

  while (i < to) {  // i is line aligned here
    quint64 zeros = 0;
    if (!pinnedLines.contains(quint32(i))) {
      while (i + zeros * kWord < to) {
        const quint64 a = i + zeros * kWord;
        // A pinned line ends the run in front of it.
        if (a % kLine == 0 && zeros > 0 && pinnedLines.contains(quint32(a))) {
          break;
        }
        if (memory.word(quint32(a)) != 0) {
          break;
        }
        zeros += 1;
      }
    }

    if (zeros >= 4) {
      MemoryRow run;
      run.kind = MemoryRow::ZeroRun;
      run.address = quint32(i);
      run.words = quint32(zeros);
      rows.append(run);
      i += zeros * kWord;
      i = appendPartialLine(i, to, &rows);
    } else {
      MemoryRow line;
      line.kind = MemoryRow::Words;
      line.address = quint32(i);
      line.words = quint32(qMin<quint64>(4, (to - i) / kWord));
      if (line.words == 0) {
        break;  // fewer than four bytes left: upstream shows nothing either
      }
      rows.append(line);
      i += line.words * kWord;
    }
  }
  return rows;
}

}  // namespace edu
