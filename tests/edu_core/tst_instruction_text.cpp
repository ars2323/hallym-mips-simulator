/* edu/core/edu_instruction_text: the inspector's layout for an instruction. */

#include <QtTest>

#include "edu/core/edu_instruction_text.h"
#include "edu_test.h"

class TestInstructionText : public QObject {
  Q_OBJECT

 private slots:
  void planExampleLw();
  void rType();
  void branchInDefaultMode();
  void branchWithDelayedBranches();
  void jumpResolvedAndUnresolved();
  void coprocessorFormats();
  void unknownWord();
  void tableFitsTheInspector();
};

static QStringList detail(quint32 word, quint32 pc, const char* disassembly,
                          const char* label, edu::BranchConvention convention) {
  return edu::instructionDetailLines(edu::decode(word, pc, convention), pc,
                                     QString::fromLatin1(disassembly),
                                     QString::fromLatin1(label), convention);
}

// The example in PLAN R3.
void TestInstructionText::planExampleLw() {
  const QStringList lines =
      detail(0x8fa40000u, 0x00400000u, "lw $4, 0($29)", "", edu::SpimNoDelaySlot);
  QCOMPARE(lines.join("\n"),
           QString("lw $4, 0($29)                         I-type\n"
                   "0x8fa40000  at 0x00400000\n"
                   "31  26 25-21 20-16 15             0\n"
                   "100011 11101 00100 0000000000000000\n"
                   "opcode rs    rt    immediate\n"
                   "35     29    4     0\n"
                   "lw     $sp   $a0   0x0000"));
}

void TestInstructionText::rType() {
  const QStringList lines =
      detail(0x00c23021u, 0x00400010u, "addu $6, $6, $2", "", edu::SpimNoDelaySlot);
  QCOMPARE(lines.size(), 7);
  QCOMPARE(lines.at(3), QString("000000  00110 00010 00110 00000 100001"));
  QCOMPARE(lines.at(4), QString("opcode  rs    rt    rd    shamt funct"));
  QCOMPARE(lines.at(5), QString("0       6     2     6     0     33"));
  QCOMPARE(lines.at(6), QString("SPECIAL $a2   $v0   $a2         addu"));
}

void TestInstructionText::branchInDefaultMode() {
  const QStringList lines = detail(0x14200002u, 0x00400030u, "bne $1, $0, 8",
                                   "target", edu::SpimNoDelaySlot);
  QCOMPARE(lines.size(), 10);
  QCOMPARE(lines.at(5), QString("5      1     0     2"));
  QCOMPARE(lines.at(6), QString("bne    $at   $zero x4=8"));
  QCOMPARE(lines.at(7),
           QString::fromUtf8("Dest = PC + (offset×4) = 0x00400038 [target]"));
  QVERIFY(lines.at(8).startsWith(QString::fromUtf8("SPIM 기본 모드는")));
  QVERIFY(lines.at(9).startsWith(QString("SPIM's default mode")));
}

void TestInstructionText::branchWithDelayedBranches() {
  const QStringList lines = detail(0x1420fffeu, 0x00400030u, "bne $1, $0, -8",
                                   "", edu::MipsDelaySlot);
  QCOMPARE(lines.size(), 8);  // no note in this mode
  QCOMPARE(lines.at(5), QString("5      1     0     -2"));
  QCOMPARE(lines.at(6), QString("bne    $at   $zero x4=-8"));
  QCOMPARE(lines.at(7),
           QString::fromUtf8("Dest = PC + 4 + (offset×4) = 0x0040002c"));
}

void TestInstructionText::jumpResolvedAndUnresolved() {
  QStringList lines = detail(0x0c100009u, 0x00400014u, "jal 0x00400024 [main]",
                             "main", edu::SpimNoDelaySlot);
  QCOMPARE(lines.size(), 9);
  QCOMPARE(lines.at(3), QString("000011 00000100000000000000001001"));
  QCOMPARE(lines.at(4), QString("opcode target"));
  QCOMPARE(lines.at(5), QString("3      1048585"));
  QCOMPARE(lines.at(6), QString("jal    x4=0x00400024"));
  QCOMPARE(lines.at(7), QString::fromUtf8("Dest = (PC & 0xf0000000) | (target×4)"));
  QCOMPARE(lines.at(8), QString("     = 0x00400024 [main]"));

  // Nothing loaded yet: jal 0x00000000 [main]
  lines = detail(0x0c000000u, 0x00400014u, "jal 0x00000000 [main]", "main",
                 edu::SpimNoDelaySlot);
  QCOMPARE(lines.at(8), QString("     = 0x00000000 [main]"));
}

void TestInstructionText::coprocessorFormats() {
  QStringList lines = detail(0x46241000u, 0, "add.d $f0, $f2, $f4", "", edu::SpimNoDelaySlot);
  QCOMPARE(lines.at(4), QString("opcode fmt    ft    fs    fd    funct"));
  QCOMPARE(lines.at(6), QString("COP1   double $f4   $f2   $f0   add.d"));

  lines = detail(0x44886000u, 0, "mtc1 $8, $f12", "", edu::SpimNoDelaySlot);
  QCOMPARE(lines.at(6), QString("COP1   mtc1  $t0   $f12  $f0   mtc1"));

  lines = detail(0x401a6800u, 0, "mfc0 $26, $13", "", edu::SpimNoDelaySlot);
  QCOMPARE(lines.at(4), QString("opcode rs    rt    rd    0        sel"));
  QCOMPARE(lines.at(6), QString("COP0   mfc0  $k0   Cause"));

  lines = detail(0x45010003u, 0x00400000u, "bc1t 0 12", "", edu::MipsDelaySlot);
  QCOMPARE(lines.at(4), QString("opcode fmt   cc    nd tf   immediate"));
  QCOMPARE(lines.at(2), QString("31  26 25-21 20-18 17 16   15             0"));
  QCOMPARE(lines.at(6), QString("COP1   BC             bc1t x4=12"));
}

void TestInstructionText::unknownWord() {
  const QStringList lines = detail(0xfc000000u, 0, "", "", edu::SpimNoDelaySlot);
  QVERIFY(lines.at(0).startsWith("(not an instruction SPIM implements)"));
  QVERIFY(lines.at(0).endsWith("I-type"));
  QCOMPARE(lines.at(1), QString("0xfc000000  at 0x00000000"));
  QCOMPARE(lines.size(), 7);
}

// The five table rows must fit the inspector's width for every format.
void TestInstructionText::tableFitsTheInspector() {
  const quint32 words[] = {0x8fa40000u, 0x00c23021u, 0x0c100009u, 0x03fffffdu,
                           0x46241000u, 0x4604103cu, 0x45010003u, 0x401a6800u,
                           0x42000018u, 0x04910004u, 0x712a4002u, 0x2008ffffu,
                           0x1420fffeu, 0xffffffffu, 0x0bffffffu, 0x03e0f809u};
  for (unsigned i = 0; i < sizeof(words) / sizeof(words[0]); i += 1) {
    const QStringList lines = edu::instructionDetailLines(
        edu::decode(words[i], 0x00400000u, edu::MipsDelaySlot), 0x00400000u,
        QString("x"), QString(), edu::MipsDelaySlot);
    for (int row = 1; row < 7; row += 1) {
      QVERIFY2(lines.at(row).size() <= edu::kInstructionTextColumns,
               qPrintable(QString("0x%1 row %2: \"%3\"")
                              .arg(words[i], 8, 16, QLatin1Char('0'))
                              .arg(row).arg(lines.at(row))));
    }
  }
}

EDU_TEST_FACTORY(TestInstructionText)

#include "tst_instruction_text.moc"
