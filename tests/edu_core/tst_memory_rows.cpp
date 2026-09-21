/* edu/core/edu_memory_rows: the Data panel's lines.  The expectations are
   upstream's own lines for the same memory (tests/golden/data-*.txt show the
   shapes: short first line, zero runs, short line after a run). */

#include <QtTest>
#include <QMap>

#include "edu/core/edu_memory_rows.h"
#include "edu_test.h"

namespace {

class FakeMemory : public edu::MemoryReader {
 public:
  quint32 word(quint32 address) const { return words.value(address, 0); }
  QMap<quint32, quint32> words;
};

QString show(const QVector<edu::MemoryRow>& rows) {
  QStringList parts;
  for (int i = 0; i < rows.size(); i += 1) {
    parts << QString("%1%2x%3")
                 .arg(rows.at(i).kind == edu::MemoryRow::ZeroRun ? "Z" : "W")
                 .arg(rows.at(i).address, 8, 16, QLatin1Char('0'))
                 .arg(rows.at(i).words);
  }
  return parts.join(" ");
}

}  // namespace

class TestMemoryRows : public QObject {
  Q_OBJECT

 private slots:
  void userDataLikeTheGolden();
  void stackStartsInsideALine();
  void threeZerosAreALineFourAreARun();
  void runEndsInsideALine();
  void pinnedLineSplitsARun();
  void emptyAndTopOfMemory();
};

// tests/golden/data-sample-steps12.txt:
//   [10000000]..[1000ffff]  00000000
//   [10010000]  6c6c6548 64202c6f 21617461 00000000
//   [10010010]  00000001 00000002 00000003 ffffffff
//   [10010020]  00000000 44434241 abcd1234 00000000
//   [10010030]..[1003ffff]  00000000
void TestMemoryRows::userDataLikeTheGolden() {
  FakeMemory memory;
  memory.words[0x10010000] = 0x6c6c6548;
  memory.words[0x10010004] = 0x64202c6f;
  memory.words[0x10010008] = 0x21617461;
  memory.words[0x10010010] = 1;
  memory.words[0x10010014] = 2;
  memory.words[0x10010018] = 3;
  memory.words[0x1001001c] = 0xffffffff;
  memory.words[0x10010024] = 0x44434241;
  memory.words[0x10010028] = 0xabcd1234;
  QCOMPARE(show(edu::layoutMemoryRows(0x10000000, 0x10040000, memory,
                                      QSet<quint32>())),
           QString("Z10000000x16384 W10010000x4 W10010010x4 W10010020x4 "
                   "Z10010030x49140"));
}

// Same golden: "User Stack [7fffff84]..[80000000]", first line has 3 words.
void TestMemoryRows::stackStartsInsideALine() {
  FakeMemory memory;
  memory.words[0x7fffff90] = 0x00400018;
  memory.words[0x7fffff9c] = 0x7fffffe6;
  const QVector<edu::MemoryRow> rows = edu::layoutMemoryRows(
      0x7fffff84, 0x7fffffa0, memory, QSet<quint32>());
  QCOMPARE(show(rows), QString("W7fffff84x3 W7fffff90x4"));
  QVERIFY(rows.at(0).contains(0x7fffff8c));
  QVERIFY(!rows.at(0).contains(0x7fffff90));

  // An unaligned $sp is rounded up to a word, as upstream does.
  QCOMPARE(show(edu::layoutMemoryRows(0x7fffff85, 0x7fffffa0, memory,
                                      QSet<quint32>())),
           QString("W7fffff88x2 W7fffff90x4"));
}

void TestMemoryRows::threeZerosAreALineFourAreARun() {
  FakeMemory memory;
  memory.words[0x1000000c] = 5;  // 0 0 0 5 | 0 0 0 0 | 7 ...
  memory.words[0x10000020] = 7;
  QCOMPARE(show(edu::layoutMemoryRows(0x10000000, 0x10000030, memory,
                                      QSet<quint32>())),
           QString("W10000000x4 Z10000010x4 W10000020x4"));
}

// A run is counted in words, not lines: it may stop mid-line, and the rest
// of that line is a short line.
void TestMemoryRows::runEndsInsideALine() {
  FakeMemory memory;
  memory.words[0x10000018] = 9;  // zeros: 0x00..0x14 (6 words)
  QCOMPARE(show(edu::layoutMemoryRows(0x10000000, 0x10000030, memory,
                                      QSet<quint32>())),
           QString("Z10000000x6 W10000018x2 Z10000020x4"));
}

void TestMemoryRows::pinnedLineSplitsARun() {
  FakeMemory memory;
  QSet<quint32> pinned;
  pinned << 0x10000020u;
  QCOMPARE(show(edu::layoutMemoryRows(0x10000000, 0x10000040, memory, pinned)),
           QString("Z10000000x8 W10000020x4 Z10000030x4"));

  pinned.clear();
  pinned << 0x10000000u;  // at the very start
  QCOMPARE(show(edu::layoutMemoryRows(0x10000000, 0x10000040, memory, pinned)),
           QString("W10000000x4 Z10000010x12"));
}

void TestMemoryRows::emptyAndTopOfMemory() {
  FakeMemory memory;
  QVERIFY(edu::layoutMemoryRows(0x10000000, 0x10000000, memory,
                                QSet<quint32>()).isEmpty());
  QVERIFY(edu::layoutMemoryRows(0x10000010, 0x10000000, memory,
                                QSet<quint32>()).isEmpty());
  // Must terminate next to the top of the address space.
  QCOMPARE(show(edu::layoutMemoryRows(0xffffffe0u, 0xfffffff0u, memory,
                                      QSet<quint32>())),
           QString("Zffffffe0x4"));
}

EDU_TEST_FACTORY(TestMemoryRows)

#include "tst_memory_rows.moc"
