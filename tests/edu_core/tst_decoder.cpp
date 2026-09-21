/* edu/core/edu_decoder on its own, with answers worked out by hand: the
   boundary cases PLAN lists (largest/smallest immediate, negative branch
   offset, unresolved jump, nop, an opcode SPIM does not have) and one
   example of every format.  The exhaustive comparison with the simulator
   core is tests/edu_oracle. */

#include <QtTest>

#include "edu/core/edu_decoder.h"
#include "edu_test.h"

using edu::DecodedInstruction;

class TestDecoder : public QObject {
  Q_OBJECT

 private slots:
  void formatRule();
  void examples_data();
  void examples();
  void fieldsOfEachFormat();
  void immediateBoundaries();
  void branchDestinations();
  void jumpDestinations();
  void noDestinationWithoutPc();
  void unknownOpcode();
};

static QString fieldSummary(const DecodedInstruction& d) {
  QStringList parts;
  for (int i = 0; i < d.fields.size(); i += 1) {
    const edu::InstructionField& f = d.fields.at(i);
    parts << QString("%1[%2:%3]=%4").arg(f.name).arg(f.high).arg(f.low).arg(f.value);
  }
  return parts.join(" ");
}

// Stage-1 decision: the format comes from the word alone.
void TestDecoder::formatRule() {
  for (quint32 opcode = 0; opcode < 64; opcode += 1) {
    const quint32 word = opcode << 26;
    QString expected = "I";
    if (opcode == 0x00 || opcode == 0x1c) expected = "R";
    if (opcode == 0x02 || opcode == 0x03) expected = "J";
    if (opcode == 0x10) expected = "CP0";
    if (opcode == 0x11) expected = "FR";
    QCOMPARE(edu::formatName(edu::formatOf(word)), expected);
  }
  // COP1: fmt 8 (the bc1 branches) is FI, every other fmt FR.
  for (quint32 fmt = 0; fmt < 32; fmt += 1) {
    const quint32 word = (0x11u << 26) | (fmt << 21);
    QCOMPARE(edu::formatName(edu::formatOf(word)),
             QString(fmt == 8 ? "FI" : "FR"));
  }
}

void TestDecoder::examples_data() {
  QTest::addColumn<quint32>("word");
  QTest::addColumn<QString>("name");
  QTest::addColumn<QString>("format");

  // Words taken from SPIM's own listings (docs/ARCHITECTURE.md §3.4).
  QTest::newRow("lw $4, 0($29)") << quint32(0x8fa40000u) << "lw" << "I";
  QTest::newRow("addiu $5, $29, 4") << quint32(0x27a50004u) << "addiu" << "I";
  QTest::newRow("sll $2, $4, 2") << quint32(0x00041080u) << "sll" << "R";
  QTest::newRow("addu $6, $6, $2") << quint32(0x00c23021u) << "addu" << "R";
  QTest::newRow("jal main") << quint32(0x0c100009u) << "jal" << "J";
  QTest::newRow("nop") << quint32(0x00000000u) << "nop" << "R";
  QTest::newRow("ori $2, $0, 10") << quint32(0x3402000au) << "ori" << "I";
  QTest::newRow("syscall") << quint32(0x0000000cu) << "syscall" << "R";
  QTest::newRow("lui $1, 4660") << quint32(0x3c011234u) << "lui" << "I";
  QTest::newRow("slt $1, $8, $9") << quint32(0x0109082au) << "slt" << "R";
  QTest::newRow("bne $1, $0, 8") << quint32(0x14200002u) << "bne" << "I";
  QTest::newRow("jr $31") << quint32(0x03e00008u) << "jr" << "R";
  QTest::newRow("mfc0 $26, $13") << quint32(0x401a6800u) << "mfc0" << "CP0";
  QTest::newRow("eret") << quint32(0x42000018u) << "eret" << "CP0";
  // Worked out from the MIPS32 encoding tables.
  QTest::newRow("mul $8, $9, $10") << quint32(0x712a4002u) << "mul" << "R";
  QTest::newRow("add.d $f0, $f2, $f4") << quint32(0x46241000u) << "add.d" << "FR";
  QTest::newRow("c.lt.s $f2, $f4") << quint32(0x4604103cu) << "c.lt.s" << "FR";
  QTest::newRow("mtc1 $8, $f12") << quint32(0x44886000u) << "mtc1" << "FR";
  QTest::newRow("bc1t 3") << quint32(0x45010003u) << "bc1t" << "FI";
  QTest::newRow("bc1fl 3") << quint32(0x45020003u) << "bc1fl" << "FI";
  QTest::newRow("lwc1 $f2, 8($29)") << quint32(0xc7a20008u) << "lwc1" << "I";
  QTest::newRow("movt $2, $3, 0") << quint32(0x00611001u) << "movt" << "R";
  QTest::newRow("movf $2, $3, 0") << quint32(0x00601001u) << "movf" << "R";
  QTest::newRow("bgezal $4, 16") << quint32(0x04910004u) << "bgezal" << "I";
  // SPIM's own spelling of cvt.d.w (the manual has it at 0x46800021).
  QTest::newRow("cvt.d.w (SPIM)") << quint32(0x46201021u) << "cvt.d.w" << "FR";
}

void TestDecoder::examples() {
  QFETCH(quint32, word);
  QFETCH(QString, name);
  QFETCH(QString, format);

  const DecodedInstruction d = edu::decode(word);
  QVERIFY(d.known);
  QCOMPARE(d.name, name);
  QCOMPARE(edu::formatName(d.format), format);
  QCOMPARE(d.word, word);
  QCOMPARE(edu::reassemble(d), word);
}

void TestDecoder::fieldsOfEachFormat() {
  // lw $4, 0($29): the example in PLAN R3.
  QCOMPARE(fieldSummary(edu::decode(0x8fa40000u)),
           QString("opcode[31:26]=35 rs[25:21]=29 rt[20:16]=4 immediate[15:0]=0"));
  QCOMPARE(fieldSummary(edu::decode(0x00041080u)),
           QString("opcode[31:26]=0 rs[25:21]=0 rt[20:16]=4 rd[15:11]=2 "
                   "shamt[10:6]=2 funct[5:0]=0"));
  QCOMPARE(fieldSummary(edu::decode(0x0c100009u)),
           QString("opcode[31:26]=3 target[25:0]=1048585"));
  QCOMPARE(fieldSummary(edu::decode(0x401a6800u)),
           QString("opcode[31:26]=16 rs[25:21]=0 rt[20:16]=26 rd[15:11]=13 "
                   "0[10:3]=0 sel[2:0]=0"));
  QCOMPARE(fieldSummary(edu::decode(0x42000018u)),
           QString("opcode[31:26]=16 CO[25:25]=1 code[24:6]=0 funct[5:0]=24"));
  QCOMPARE(fieldSummary(edu::decode(0x46241000u)),
           QString("opcode[31:26]=17 fmt[25:21]=17 ft[20:16]=4 fs[15:11]=2 "
                   "fd[10:6]=0 funct[5:0]=0"));
  QCOMPARE(fieldSummary(edu::decode(0x45010003u)),
           QString("opcode[31:26]=17 fmt[25:21]=8 cc[20:18]=0 nd[17:17]=0 "
                   "tf[16:16]=1 immediate[15:0]=3"));

  const DecodedInstruction lw = edu::decode(0x8fa40000u);
  QCOMPARE(lw.opcode, 35);
  QCOMPARE(lw.rs, 29);
  QCOMPARE(lw.rt, 4);
  const DecodedInstruction addu = edu::decode(0x00c23021u);
  QCOMPARE(addu.rs, 6);
  QCOMPARE(addu.rt, 2);
  QCOMPARE(addu.rd, 6);
  QCOMPARE(addu.shamt, 0);
  QCOMPARE(addu.funct, 0x21);
}

void TestDecoder::immediateBoundaries() {
  const DecodedInstruction max = edu::decode(0x20087fffu);  // addi $8,$0,32767
  QCOMPARE(max.name, QString("addi"));
  QCOMPARE(max.imm, quint32(0x7fff));
  QCOMPARE(max.simm, 32767);

  const DecodedInstruction min = edu::decode(0x20088000u);  // addi $8,$0,-32768
  QCOMPARE(min.imm, quint32(0x8000));
  QCOMPARE(min.simm, -32768);

  const DecodedInstruction minusOne = edu::decode(0x2008ffffu);
  QCOMPARE(minusOne.imm, quint32(0xffff));
  QCOMPARE(minusOne.simm, -1);

  // ori zero-extends when executed; the decoder reports both readings.
  const DecodedInstruction ori = edu::decode(0x3408ffffu);
  QCOMPARE(ori.imm, quint32(65535));
  QCOMPARE(ori.simm, -1);
}

void TestDecoder::branchDestinations() {
  // From a real SPIM listing, delayed branches off (QtSpim's default):
  //   [0x00400030] 0x14200002  bne $1, $0, 8 [target-0x00400030]
  // and "target" was at 0x00400038 = pc + (2 << 2).
  DecodedInstruction d = edu::decode(0x14200002u, 0x00400030u, edu::SpimNoDelaySlot);
  QCOMPARE(d.kind, DecodedInstruction::Branch);
  QVERIFY(d.hasDestination);
  QCOMPARE(d.destination, quint32(0x00400038u));

  // The same word on real MIPS (and in SPIM with delayed branches on).
  d = edu::decode(0x14200002u, 0x00400030u, edu::MipsDelaySlot);
  QCOMPARE(d.destination, quint32(0x0040003cu));

  // Negative offset: -2 words.
  d = edu::decode(0x1420fffeu, 0x00400030u, edu::SpimNoDelaySlot);
  QCOMPARE(d.simm, -2);
  QCOMPARE(d.destination, quint32(0x00400028u));
  d = edu::decode(0x1420fffeu, 0x00400030u, edu::MipsDelaySlot);
  QCOMPARE(d.destination, quint32(0x0040002cu));

  // Extremes of the 16-bit offset.
  d = edu::decode(0x10007fffu, 0x00400000u, edu::MipsDelaySlot);  // beq +32767
  QCOMPARE(d.destination, quint32(0x00400004u + 0x1fffcu));
  d = edu::decode(0x10008000u, 0x00400000u, edu::MipsDelaySlot);  // beq -32768
  QCOMPARE(d.destination, quint32(0x00400004u - 0x20000u));

  // Arithmetic is modulo 2^32.
  d = edu::decode(0x10000001u, 0xfffffffcu, edu::MipsDelaySlot);
  QCOMPARE(d.destination, quint32(0x00000004u));

  // Coprocessor and REGIMM branches are branches too.
  QCOMPARE(edu::decode(0x45010003u, 0x00400000u, edu::SpimNoDelaySlot).destination,
           quint32(0x0040000cu));
  QCOMPARE(edu::decode(0x04910004u, 0x00400000u, edu::SpimNoDelaySlot).destination,
           quint32(0x00400010u));
}

void TestDecoder::jumpDestinations() {
  // [0x00400014] 0x0c100009  jal 0x00400024 [main]
  DecodedInstruction d = edu::decode(0x0c100009u, 0x00400014u, edu::SpimNoDelaySlot);
  QCOMPARE(d.kind, DecodedInstruction::Jump);
  QCOMPARE(d.destination, quint32(0x00400024u));

  // Nothing loaded yet: [0x00400014] 0x0c000000  jal 0x00000000 [main]
  d = edu::decode(0x0c000000u, 0x00400014u, edu::SpimNoDelaySlot);
  QVERIFY(d.hasDestination);
  QCOMPARE(d.target, quint32(0));
  QCOMPARE(d.destination, quint32(0x00000000u));

  // The top four bits come from the PC: the same word in the kernel segment.
  d = edu::decode(0x08000096u, 0x80000180u, edu::SpimNoDelaySlot);  // j, target 0x96
  QCOMPARE(d.destination, quint32(0x80000258u));

  // Largest target.
  d = edu::decode(0x0bffffffu, 0x00400000u, edu::MipsDelaySlot);
  QCOMPARE(d.destination, quint32(0x0ffffffcu));

  // jr goes wherever the register says: no static destination.
  d = edu::decode(0x03e00008u, 0x00400034u, edu::SpimNoDelaySlot);
  QCOMPARE(d.kind, DecodedInstruction::Plain);
  QVERIFY(!d.hasDestination);
}

void TestDecoder::noDestinationWithoutPc() {
  const DecodedInstruction d = edu::decode(0x14200002u);
  QCOMPARE(d.kind, DecodedInstruction::Branch);
  QVERIFY(!d.hasDestination);
}

void TestDecoder::unknownOpcode() {
  // Major opcode 0x3f is unused; opcode 0x1f is MIPS32 Release 2 (ext, ins,
  // seb...), which SPIM does not implement.
  const quint32 words[] = {0xfc000000u, 0xffffffffu, 0x7c0a4820u, 0x00000005u};
  for (unsigned i = 0; i < sizeof(words) / sizeof(words[0]); i += 1) {
    const DecodedInstruction d = edu::decode(words[i], 0x00400000u, edu::MipsDelaySlot);
    QVERIFY2(!d.known, qPrintable(QString::number(words[i], 16)));
    QVERIFY(d.name.isEmpty());
    QCOMPARE(d.kind, DecodedInstruction::Plain);
    QVERIFY(!d.hasDestination);
    // Still fully described: format by the rule, fields that reassemble.
    QCOMPARE(edu::reassemble(d), words[i]);
    QVERIFY(!d.fields.isEmpty());
  }
  QCOMPARE(edu::formatName(edu::decode(0xfc000000u).format), QString("I"));
  QCOMPARE(edu::formatName(edu::decode(0x00000005u).format), QString("R"));
}

EDU_TEST_FACTORY(TestDecoder)

#include "tst_decoder.moc"
