/* edu/core/edu_decoder against the SPIM core (PLAN.md, verification 1).

   The expected answers are never written down here; they come from the core:

     1. opTable():  every instruction of CPU/op.h is built as a core
        `instruction`, encoded by the core's inst_encode(), and the word is
        given to our decoder.  Name, fields and reassembly must agree.
     2. programs(): every instruction the core assembles from the upstream
        test programs (Tests/tt.*.s, CPU/exceptions.s) gets the same checks,
        plus branch and jump destinations against the core's symbol table.
     3. coreDecodeAgreement(): the core's own inst_decode() is compared with
        ours over all those words.  It is NOT treated as ground truth -- it
        has quirks of its own -- so the differences are collected, printed as
        a table and pinned, so that a new one fails the test.
*/

#include <QFile>
#include <QMap>
#include <QSet>
#include <QtTest>
#include <cstring>

#include "core_frontend_stubs.h"
#include "edu/core/edu_decoder.h"

// The core.  Its headers have no include guards; include each exactly once.
#include "spim.h"
#include "string-stream.h"
#include "spim-utils.h"
#include "inst.h"
#include "reg.h"
#include "mem.h"
#include "sym-tbl.h"
#include "parser_yacc.h"  // Y_*_OP, generated into the build directory

#ifndef EDU_SOURCE_ROOT
#error "EDU_SOURCE_ROOT must point at the repository root"
#endif

// The known disagreements with the core's inst_decode(), all of them its
// quirks; explained where they are compared, in coreDecodeAgreement().
#define EDU_EXPECTED_DECODE_DIFFERENCES                                  \
  "bc1fl->bc1f bc1tl->bc1t bc2fl->bc2f bc2t->bc2f bc2tl->bc2f cop2-> "   \
  "movt->movf movt.d->movf.d movt.s->movf.s"

namespace {

// ---- CPU/op.h as data -----------------------------------------------------

struct OpEntry {
  const char* name;
  int internalOpcode;  // Y_*_OP
  int type;            // *_TYPE_INST, ASM_DIR, PSEUDO_OP
  qint64 encoding;     // -1 for directives and pseudo instructions
};

#define OP(NAME, I_OPCODE, TYPE, A_OPCODE) \
  {NAME, I_OPCODE, TYPE, qint64(A_OPCODE)},
const OpEntry kOpTable[] = {
#include "op.h"
};
#undef OP
const int kOpCount = int(sizeof(kOpTable) / sizeof(kOpTable[0]));

QString sourcePath(const char* relative) {
  return QString::fromLocal8Bit(EDU_SOURCE_ROOT) + QLatin1Char('/') +
         QString::fromLatin1(relative);
}

// op.h marks the MIPS32 Release 2 instructions in a comment; SPIM's parser
// refuses every one of them, so they are outside what this decoder names.
QSet<QString> release2Names() {
  QSet<QString> names;
  QFile file(sourcePath("CPU/op.h"));
  if (!file.open(QIODevice::ReadOnly)) {
    return names;
  }
  // Over the whole text, since some entries are wrapped onto two lines:
  // OP("name", ..., 0x...)   optionally followed by   /* MIPS32 Rev 2 */
  const QString text = QString::fromLatin1(file.readAll());
  QRegExp entry("OP\\(\"([^\"]+)\"[^)]*\\)([^\n]*)");
  int pos = 0;
  while ((pos = entry.indexIn(text, pos)) >= 0) {
    if (entry.cap(2).contains("MIPS32 Rev 2")) {
      names.insert(entry.cap(1));
    }
    pos += entry.matchedLength();
  }
  return names;
}

const OpEntry* entryFor(int internalOpcode) {
  for (int i = 0; i < kOpCount; i += 1) {
    if (kOpTable[i].internalOpcode == internalOpcode &&
        kOpTable[i].encoding != -1) {
      return &kOpTable[i];
    }
  }
  return 0;
}

// ---- the core's view of a word or instruction -----------------------------

// The name the core has for an instruction it holds: op.h's name for the
// struct's internal opcode.  (Not parsed out of format_an_inst(): that glues
// the condition-code digit onto bc1f/bc1t -- "bc1f0 12".)  An all-zero word
// is the one case where the core prints something else, "nop".
QString coreName(instruction* inst) {
  if (inst == NULL || OPCODE(inst) == 0) {
    return QString();  // inst_decode()'s "invalid instruction"
  }
  if (ENCODING(inst) == 0) {
    return QString("nop");
  }
  const OpEntry* op = entryFor(OPCODE(inst));
  return op != 0 ? QString::fromLatin1(op->name) : QString();
}

// Which bit field of the word each slot of the core's `instruction` ends up
// in, per op.h type -- read off inst_encode() (CPU/inst.cpp).  This is the
// assembler's direction: struct -> word.  -1 = slot not encoded.
struct SlotLayout {
  bool rs, rt, rd, shamt, imm, target;
  bool ccInRt;  // the condition-code number RT>>2 goes to bits 20..18
};

bool layoutFor(int type, SlotLayout* l) {
  SlotLayout none = {false, false, false, false, false, false, false};
  *l = none;
  switch (type) {
    case BC_TYPE_INST:      l->ccInRt = true; l->imm = true; return true;
    case B1_TYPE_INST:
    case I1s_TYPE_INST:     l->rs = true; l->imm = true; return true;
    case I1t_TYPE_INST:
    case I2_TYPE_INST:
    case B2_TYPE_INST:
    case I2a_TYPE_INST:
    case FP_I2a_TYPE_INST:  l->rs = true; l->rt = true; l->imm = true; return true;
    case R1s_TYPE_INST:     l->rs = true; return true;
    case R1d_TYPE_INST:     l->rd = true; return true;
    case R2td_TYPE_INST:    l->rt = true; l->rd = true; return true;
    case R2st_TYPE_INST:    l->rs = true; l->rt = true; return true;
    case R2ds_TYPE_INST:    l->rs = true; l->rd = true; return true;
    case R2sh_TYPE_INST:    l->rt = true; l->rd = true; l->shamt = true; return true;
    case R3_TYPE_INST:
    case R3sh_TYPE_INST:    l->rs = true; l->rt = true; l->rd = true; return true;
    // movf/movt: RT holds cc<<2 (|tf); bit 17 (nd) must stay 0.
    case MOVC_TYPE_INST:    l->rs = true; l->ccInRt = true; l->rd = true; return true;
    case FP_R2ds_TYPE_INST: l->rd = true; l->shamt = true; return true;  // fs, fd
    case FP_R2ts_TYPE_INST: l->rt = true; l->rd = true; return true;     // rt, fs
    case FP_CMP_TYPE_INST:
    case FP_R3_TYPE_INST:   l->rt = true; l->rd = true; l->shamt = true; return true;
    case FP_MOVC_TYPE_INST: l->ccInRt = true; l->rd = true; l->shamt = true; return true;
    case J_TYPE_INST:       l->target = true; return true;
    case NOARG_TYPE_INST:   return true;
    default:                return false;  // FP_R4: inst_encode() cannot encode it
  }
}

// Compares the slots the core encoded with the fields we extracted.
QString compareSlots(instruction* inst, int type,
                     const edu::DecodedInstruction& ours) {
  SlotLayout l;
  if (!layoutFor(type, &l)) {
    return QString("no layout for type %1").arg(type);
  }
  QStringList problems;
  if (l.rs && RS(inst) != ours.rs)
    problems << QString("rs core=%1 ours=%2").arg(RS(inst)).arg(ours.rs);
  if (l.rt && RT(inst) != ours.rt)
    problems << QString("rt core=%1 ours=%2").arg(RT(inst)).arg(ours.rt);
  if (l.ccInRt && (RT(inst) >> 2) != (ours.rt >> 2))
    problems << QString("cc core=%1 ours=%2").arg(RT(inst) >> 2).arg(ours.rt >> 2);
  if (l.rd && RD(inst) != ours.rd)
    problems << QString("rd core=%1 ours=%2").arg(RD(inst)).arg(ours.rd);
  if (l.shamt && SHAMT(inst) != ours.shamt)
    problems << QString("shamt core=%1 ours=%2").arg(SHAMT(inst)).arg(ours.shamt);
  if (l.imm && qint32(IMM(inst)) != ours.simm)
    problems << QString("imm core=%1 ours=%2").arg(IMM(inst)).arg(ours.simm);
  // A J-type's opcode pattern may reach into the target field: "cop2" is
  // 0x4a000000, whose bit 25 is part of our 26-bit target.
  const OpEntry* op = entryFor(OPCODE(inst));
  const quint32 fixedBits = op != 0 ? quint32(op->encoding) & 0x03ffffffu : 0;
  if (l.target && (quint32(TARGET(inst)) | fixedBits) != ours.target)
    problems << QString("target core=%1 ours=%2").arg(TARGET(inst)).arg(ours.target);
  return problems.join(", ");
}

QString fieldsTile(const edu::DecodedInstruction& d) {
  int next = 31;
  for (int i = 0; i < d.fields.size(); i += 1) {
    if (d.fields.at(i).high != next || d.fields.at(i).low > d.fields.at(i).high) {
      return QString("field %1 does not continue at bit %2")
          .arg(d.fields.at(i).name).arg(next);
    }
    next = d.fields.at(i).low - 1;
  }
  return next == -1 ? QString() : QString("fields stop at bit %1").arg(next + 1);
}

// The format rule restated from the stage-1 decision, independently of the
// decoder's own switch.
QString expectedFormat(quint32 word) {
  const quint32 opcode = word >> 26;
  if (opcode == 0x00 || opcode == 0x1c) return "R";
  if (opcode == 0x02 || opcode == 0x03) return "J";
  if (opcode == 0x10) return "CP0";
  if (opcode == 0x11) return ((word >> 21) & 0x1f) == 8 ? "FI" : "FR";
  return "I";
}

// Everything checked for one word whose true identity the core has told us.
struct Tally {
  int words;
  QStringList failures;
  QSet<quint32> seen;
  Tally() : words(0) {}
  void fail(const QString& what) {
    if (failures.size() < 25) failures << what;
  }
};

void checkWord(quint32 word, const QString& expectedName,
               instruction* coreStruct, int type, Tally* tally) {
  tally->words += 1;
  tally->seen.insert(word);
  const edu::DecodedInstruction ours = edu::decode(word);
  const QString where = QString("%1 0x%2: ").arg(expectedName)
                            .arg(word, 8, 16, QLatin1Char('0'));

  if (!ours.known || ours.name != expectedName) {
    tally->fail(where + QString("decoded as \"%1\"").arg(ours.name));
  }
  if (edu::reassemble(ours) != word) {
    tally->fail(where + QString("reassembles to 0x%1")
                            .arg(edu::reassemble(ours), 8, 16, QLatin1Char('0')));
  }
  const QString tiling = fieldsTile(ours);
  if (!tiling.isEmpty()) {
    tally->fail(where + tiling);
  }
  if (edu::formatName(ours.format) != expectedFormat(word)) {
    tally->fail(where + "format " + edu::formatName(ours.format));
  }
  const QString slotProblems = compareSlots(coreStruct, type, ours);
  if (!slotProblems.isEmpty()) {  // ("slots" is a Qt keyword)
    tally->fail(where + slotProblems);
  }
}

// Words collected by opTable() and programs() for coreDecodeAgreement().
QMap<quint32, QString> g_wordsSeen;  // word -> name the assembler side gave

}  // namespace

class TestDecoderOracle : public QObject {
  Q_OBJECT

 private slots:
  void initTestCase();
  void opTable();
  void programs_data();
  void programs();
  void unknownEncodings();
  void coreDecodeAgreement();

 private:
  QSet<QString> release2_;
};

void TestDecoderOracle::initTestCase() {
  release2_ = release2Names();
  QVERIFY2(release2_.size() > 50, "could not read the Rev 2 markers in op.h");

  message_out.i = 1;
  console_out.i = 2;
  bare_machine = false;
  accept_pseudo_insts = true;
  delayed_branches = false;
  delayed_loads = false;
  quiet = true;
  mapped_io = false;
  initialize_world(sourcePath("CPU/exceptions.s").toLocal8Bit().data(), false);
  takeCoreErrors();
}

// ---- 1. every instruction in op.h ------------------------------------------

void TestDecoderOracle::opTable() {
  const int regs[] = {0, 31, 21, 10, 1};
  const int imms[] = {0, 1, -1, 32767, -32768, 0x1234};
  const quint32 targets[] = {0u, 0x3ffffffu, 0x0100009u, 0x2aaaaaau};

  Tally tally;
  int instructions = 0;
  QStringList skipped;

  for (int i = 0; i < kOpCount; i += 1) {
    const OpEntry& op = kOpTable[i];
    if (op.encoding == -1) {
      continue;  // directive or pseudo instruction: no encoding of its own
    }
    if (release2_.contains(QString::fromLatin1(op.name))) {
      continue;  // see unknownEncodings()
    }
    SlotLayout layout;
    if (!layoutFor(op.type, &layout)) {
      skipped << op.name;
      continue;
    }
    instructions += 1;

    // "ssnop" is sll $0,$0,1: the whole word is the instruction.
    const bool wholeWord = QByteArray(op.name) == "ssnop";

    for (int a = 0; a < 5; a += 1) {
      for (int b = 0; b < 6; b += 1) {
        instruction inst;
        memset(&inst, 0, sizeof(inst));
        SET_OPCODE(&inst, op.internalOpcode);
        if (!wholeWord) {
          if (layout.target) {
            SET_TARGET(&inst, targets[(a + b) % 4]);
          } else {
            if (layout.rs) SET_RS(&inst, regs[a]);
            if (layout.rt) SET_RT(&inst, regs[(a + 1) % 5]);
            if (layout.ccInRt) SET_RT(&inst, (regs[a] & 7) << 2);
            if (layout.imm) {
              SET_IMM(&inst, imms[b]);
            } else {
              if (layout.rd) SET_RD(&inst, regs[(a + 2) % 5]);
              if (layout.shamt) SET_SHAMT(&inst, regs[(a + 3) % 5]);
            }
          }
        }
        const quint32 word = quint32(inst_encode(&inst));
        QString expectedName = QString::fromLatin1(op.name);
        if (word == 0) {
          expectedName = "nop";  // what the core prints for an all-zero word
        } else if (wholeWord) {
          // 0x00000040 is both "ssnop" and "sll $0, $0, 1"; a word cannot say
          // which the programmer wrote.  We answer as the core's decoder does.
          expectedName = "sll";
        }
        // For the whole-word case the struct's slots are empty by
        // construction (the 1 in shamt is part of the opcode pattern).
        checkWord(word, expectedName, &inst,
                  wholeWord ? NOARG_TYPE_INST : op.type, &tally);
        g_wordsSeen.insert(word, expectedName);
        if (wholeWord) break;
      }
      if (wholeWord) break;
    }
  }

  qInfo("op.h: %d instructions, %d words checked (%d distinct)", instructions,
        tally.words, tally.seen.size());
  QVERIFY2(skipped.isEmpty(), qPrintable("no layout: " + skipped.join(" ")));
  QVERIFY2(tally.failures.isEmpty(), qPrintable("\n" + tally.failures.join("\n")));
  QVERIFY(instructions > 150);
}

// ---- 2. every instruction of the upstream test programs --------------------

void TestDecoderOracle::programs_data() {
  QTest::addColumn<QString>("file");
  QTest::addColumn<bool>("bare");
  QTest::addColumn<bool>("delayed");
  QTest::addColumn<bool>("handler");

  // Flags as in spim/Makefile's test targets.
  QTest::newRow("exceptions.s only") << "" << false << false << true;
  QTest::newRow("helloworld.s") << "helloworld.s" << false << false << true;
  QTest::newRow("tt.core.s") << "Tests/tt.core.s" << false << false << true;
  QTest::newRow("tt.le.s") << "Tests/tt.le.s" << false << false << true;
  QTest::newRow("tt.dir.s") << "Tests/tt.dir.s" << false << false << true;
  QTest::newRow("tt.io.s") << "Tests/tt.io.s" << false << false << true;
  QTest::newRow("tt.bare.s") << "Tests/tt.bare.s" << false << true << false;
  QTest::newRow("tt.alu.bare.s") << "Tests/tt.alu.bare.s" << true << true << false;
  QTest::newRow("tt.fpu.bare.s") << "Tests/tt.fpu.bare.s" << true << true << false;
}

void TestDecoderOracle::programs() {
  QFETCH(QString, file);
  QFETCH(bool, bare);
  QFETCH(bool, delayed);
  QFETCH(bool, handler);

  bare_machine = bare;
  accept_pseudo_insts = !bare;
  delayed_branches = delayed;
  delayed_loads = delayed;
  if (handler) {
    initialize_world(sourcePath("CPU/exceptions.s").toLocal8Bit().data(), false);
  } else {
    initialize_world(NULL, false);
  }
  if (!file.isEmpty()) {
    QVERIFY(read_assembly_file(sourcePath(qPrintable(file)).toLocal8Bit().data()));
  }
  takeCoreErrors();  // some of these programs contain deliberate errors

  const edu::BranchConvention convention =
      delayed ? edu::MipsDelaySlot : edu::SpimNoDelaySlot;

  Tally tally;
  int branches = 0, jumps = 0, destinationsChecked = 0;
  const mem_addr ranges[2][2] = {{TEXT_BOT, text_top}, {K_TEXT_BOT, k_text_top}};
  for (int r = 0; r < 2; r += 1) {
    for (mem_addr pc = ranges[r][0]; pc < ranges[r][1]; pc += 4) {
      instruction* inst = read_mem_inst(pc);
      if (inst == NULL) {
        continue;
      }
      const OpEntry* op = entryFor(OPCODE(inst));
      QVERIFY2(op != 0, qPrintable(QString("no op.h entry at 0x%1").arg(pc, 8, 16)));
      const quint32 word = quint32(ENCODING(inst));
      QString name = coreName(inst);
      if (word == 0x00000040u) {
        name = "sll";  // see opTable(): "ssnop" and "sll $0,$0,1" are one word
      }
      checkWord(word, name, inst, op->type, &tally);
      g_wordsSeen.insert(word, name);

      // Destinations, against the symbol the source line named.
      const edu::DecodedInstruction ours = edu::decode(word, pc, convention);
      if (ours.kind == edu::DecodedInstruction::Branch) branches += 1;
      if (ours.kind == edu::DecodedInstruction::Jump) jumps += 1;
      QCOMPARE(ours.kind == edu::DecodedInstruction::Branch,
               opcode_is_branch(OPCODE(inst)));
      if (ours.kind == edu::DecodedInstruction::Jump) {
        QVERIFY(opcode_is_jump(OPCODE(inst)));
      }
      if (ours.hasDestination && EXPR(inst) != NULL &&
          EXPR(inst)->symbol != NULL && SYMBOL_IS_DEFINED(EXPR(inst)->symbol)) {
        // The address of the label the source line named.  A jump can only
        // reach within its own 256 MB region: the core warns about a target
        // elsewhere and then executes exactly this truncation (run.cpp).
        quint32 expected = quint32(EXPR(inst)->symbol->addr);
        if (ours.kind == edu::DecodedInstruction::Jump) {
          expected = (pc & 0xf0000000u) | (expected & 0x0fffffffu);
        }
        destinationsChecked += 1;
        if (ours.destination != expected) {
          tally.fail(QString("%1 at 0x%2 [%3]: destination 0x%4, core says 0x%5")
                         .arg(name).arg(pc, 8, 16, QLatin1Char('0'))
                         .arg(EXPR(inst)->symbol->name)
                         .arg(ours.destination, 8, 16, QLatin1Char('0'))
                         .arg(expected, 8, 16, QLatin1Char('0')));
        }
      }
    }
  }

  qInfo("%d instructions (%d distinct words), %d branches, %d jumps, "
        "%d destinations checked against symbols",
        tally.words, tally.seen.size(), branches, jumps, destinationsChecked);
  QVERIFY2(tally.failures.isEmpty(), qPrintable("\n" + tally.failures.join("\n")));
  QVERIFY(tally.words > 0);
}

// ---- 3. what must NOT decode ------------------------------------------------

void TestDecoderOracle::unknownEncodings() {
  // Major opcodes no SPIM instruction uses.
  const quint32 unused[] = {0x60000000u, 0x64000000u, 0x6c000000u, 0x78000000u,
                            0x9c000000u, 0xb0000000u, 0xfc000000u};
  for (unsigned i = 0; i < sizeof(unused) / sizeof(unused[0]); i += 1) {
    const edu::DecodedInstruction d = edu::decode(unused[i] | 0x00123456u);
    QVERIFY2(!d.known, qPrintable(QString::number(unused[i], 16)));
    QVERIFY(d.name.isEmpty());
    QCOMPARE(edu::reassemble(d), unused[i] | 0x00123456u);
    // The core agrees that these are not instructions.
    instruction* core = inst_decode(int32(unused[i] | 0x00123456u));
    QCOMPARE(int(OPCODE(core)), 0);
    free_inst(core);
  }

  // Release 2 instructions: in op.h, refused by SPIM's parser, unknown to us.
  // (Those whose op.h encoding collides with a real instruction are named
  // after the real one, which is correct: see coreDecodeAgreement.)
  int unknown = 0, shadowed = 0;
  for (int i = 0; i < kOpCount; i += 1) {
    const OpEntry& op = kOpTable[i];
    if (op.encoding == -1 || !release2_.contains(QString::fromLatin1(op.name))) {
      continue;
    }
    const edu::DecodedInstruction d = edu::decode(quint32(op.encoding));
    QVERIFY2(d.name != QString::fromLatin1(op.name), op.name);
    if (d.known) shadowed += 1; else unknown += 1;
  }
  qInfo("Release 2 entries in op.h: %d decode as unknown, %d share an encoding "
        "with an implemented instruction", unknown, shadowed);
}

// ---- 4. the core's own decoder, as a second opinion -------------------------

void TestDecoderOracle::coreDecodeAgreement() {
  QVERIFY(!g_wordsSeen.isEmpty());

  // name the assembler gave -> (core inst_decode name -> example word)
  QMap<QString, QPair<QString, quint32> > differences;
  QMap<QString, QString> duplicates;
  for (QMap<quint32, QString>::const_iterator it = g_wordsSeen.constBegin();
       it != g_wordsSeen.constEnd(); ++it) {
    instruction* core = inst_decode(int32(it.key()));
    const QString theirs = coreName(core);
    free_inst(core);
    const QString ours = edu::decode(it.key()).name;
    if (theirs == ours) {
      continue;
    }
    if (release2_.contains(theirs)) {
      // op.h gives this Release 2 instruction the same encoding as an
      // implemented one (trunc.w.s / suxc1, ...).  Which of the two the
      // core's bsearch lands on depends on how qsort ordered equal keys, so
      // it may differ between C libraries: reported, not pinned.
      duplicates.insert(ours, theirs);
    } else if (!differences.contains(ours)) {
      differences.insert(ours, qMakePair(theirs, it.key()));
    }
  }

  QStringList table;
  table << "| ours (= what the assembler emitted) | core inst_decode() | example word |";
  table << "|---|---|---|";
  QStringList summary;
  for (QMap<QString, QPair<QString, quint32> >::const_iterator it =
           differences.constBegin(); it != differences.constEnd(); ++it) {
    table << QString("| %1 | %2 | 0x%3 |").arg(it.key(), it.value().first)
                 .arg(it.value().second, 8, 16, QLatin1Char('0'));
    summary << it.key() + "->" + it.value().first;
  }
  qInfo("%d distinct words: core inst_decode() names differ for %d "
        "instructions\n%s", g_wordsSeen.size(), differences.size(),
        qPrintable(table.join("\n")));
  for (QMap<QString, QString>::const_iterator it = duplicates.constBegin();
       it != duplicates.constEnd(); ++it) {
    qInfo("duplicate encoding in op.h: core decodes %s as %s",
          qPrintable(it.key()), qPrintable(it.value()));
  }

  // Why each pinned entry is the core's quirk and not ours:
  //   bc1fl/bc1tl -> bc1f/bc1t   inst_decode() keys COP1 branches on bit 16
  //                              (tf) only and drops bit 17 (nd, "likely")
  //   bc2t/bc2fl/bc2tl -> bc2f   for COP2 it keys on rs alone
  //   cop2 -> (invalid)          ditto: rs is part of cop2's 25-bit argument
  //   movt -> movf, movt.s/.d    SPECIAL and COP1 key on funct (+fmt); the
  //                              tf bit in rt is not part of the key
  // The assembler emits all of them correctly and run.cpp executes them by
  // internal opcode, so programs are unaffected; only a word that goes
  // through inst_decode() (".word" in a text segment) is misnamed.

  // Pinned.  Every entry is a quirk of the core's decoder, not of ours: see
  // docs/ARCHITECTURE.md.  A new difference has to be looked at.
  const QString expected = QString::fromLatin1(EDU_EXPECTED_DECODE_DIFFERENCES);
  QCOMPARE(summary.join(" "), expected);
}

QTEST_APPLESS_MAIN(TestDecoderOracle)

#include "tst_decoder_oracle.moc"
