/* See edu_decoder.h. */

#include "edu/core/edu_decoder.h"

#include <QVector>

namespace edu {

namespace {

struct Encoding {
  quint32 mask;
  quint32 pattern;
  const char* name;
  DecodedInstruction::Kind kind;
};

typedef DecodedInstruction::Kind Kind;
const Kind Plain = DecodedInstruction::Plain;
const Kind Branch = DecodedInstruction::Branch;
const Kind Jump = DecodedInstruction::Jump;

// Masks for the encoding classes of the MIPS32 opcode map.
const quint32 kOpcode = 0xfc000000u;          // major opcode only
const quint32 kOpcodeFunct = 0xfc00003fu;     // SPECIAL / SPECIAL2
const quint32 kOpcodeRt = 0xfc1f0000u;        // REGIMM
const quint32 kOpcodeRs = 0xffe00000u;        // COPz move to/from
const quint32 kOpcodeRsNdTf = 0xffe30000u;    // COPz branches
const quint32 kOpcodeRsFunct = 0xffe0003fu;   // COP0 CO functions, COP1 ops
const quint32 kOpcodeRsTfFunct = 0xffe3003fu; // movf/movt on FP registers
const quint32 kMovci = 0xfc03003fu;           // SPECIAL movf/movt
const quint32 kExact = 0xffffffffu;

quint32 major(int opcode) { return quint32(opcode) << 26; }

class EncodingTable {
 public:
  EncodingTable() { build(); }

  const Encoding* find(quint32 word) const {
    for (int i = 0; i < entries_.size(); i += 1) {
      if ((word & entries_.at(i).mask) == entries_.at(i).pattern) {
        return &entries_.at(i);
      }
    }
    return 0;
  }

 private:
  void add(quint32 mask, quint32 pattern, const char* name, Kind kind = Plain) {
    Encoding e;
    e.mask = mask;
    e.pattern = pattern;
    e.name = name;
    e.kind = kind;
    entries_.append(e);
  }

  // The names built for the FP operations have to outlive the table.
  const char* keep(const QByteArray& name) {
    names_.append(name);
    return names_.last().constData();
  }

  void build();

  QVector<Encoding> entries_;
  QList<QByteArray> names_;
};

void EncodingTable::build() {
  // The all-zero word is sll $0, $0, 0, which SPIM prints as "nop".  It has
  // to come before sll.  (0x00000040, "ssnop", is deliberately not singled
  // out: it is also a plain sll $0, $0, 1, and SPIM's decoder calls it sll.)
  add(kExact, 0x00000000u, "nop");

  // ---- SPECIAL (opcode 0), by funct
  static const struct { int funct; const char* name; } special[] = {
      {0x00, "sll"},   {0x02, "srl"},   {0x03, "sra"},     {0x04, "sllv"},
      {0x06, "srlv"},  {0x07, "srav"},  {0x08, "jr"},      {0x09, "jalr"},
      {0x0a, "movz"},  {0x0b, "movn"},  {0x0c, "syscall"}, {0x0d, "break"},
      {0x0f, "sync"},  {0x10, "mfhi"},  {0x11, "mthi"},    {0x12, "mflo"},
      {0x13, "mtlo"},  {0x18, "mult"},  {0x19, "multu"},   {0x1a, "div"},
      {0x1b, "divu"},  {0x20, "add"},   {0x21, "addu"},    {0x22, "sub"},
      {0x23, "subu"},  {0x24, "and"},   {0x25, "or"},      {0x26, "xor"},
      {0x27, "nor"},   {0x2a, "slt"},   {0x2b, "sltu"},    {0x30, "tge"},
      {0x31, "tgeu"},  {0x32, "tlt"},   {0x33, "tltu"},    {0x34, "teq"},
      {0x36, "tne"}};
  for (unsigned i = 0; i < sizeof(special) / sizeof(special[0]); i += 1) {
    add(kOpcodeFunct, quint32(special[i].funct), special[i].name);
  }
  // funct 1: move on FP condition code; bit 16 = true/false, bit 17 = 0.
  add(kMovci, 0x00000001u, "movf");
  add(kMovci, 0x00010001u, "movt");

  // ---- REGIMM (opcode 1), by rt
  static const struct { int rt; const char* name; Kind kind; } regimm[] = {
      {0, "bltz", Branch},     {1, "bgez", Branch},    {2, "bltzl", Branch},
      {3, "bgezl", Branch},    {8, "tgei", Plain},     {9, "tgeiu", Plain},
      {10, "tlti", Plain},     {11, "tltiu", Plain},   {12, "teqi", Plain},
      {14, "tnei", Plain},     {16, "bltzal", Branch}, {17, "bgezal", Branch},
      {18, "bltzall", Branch}, {19, "bgezall", Branch}};
  for (unsigned i = 0; i < sizeof(regimm) / sizeof(regimm[0]); i += 1) {
    add(kOpcodeRt, major(1) | (quint32(regimm[i].rt) << 16), regimm[i].name,
        regimm[i].kind);
  }

  // ---- Major opcodes that stand for one instruction each
  static const struct { int opcode; const char* name; Kind kind; } majors[] = {
      {0x02, "j", Jump},       {0x03, "jal", Jump},     {0x04, "beq", Branch},
      {0x05, "bne", Branch},   {0x06, "blez", Branch},  {0x07, "bgtz", Branch},
      {0x08, "addi", Plain},   {0x09, "addiu", Plain},  {0x0a, "slti", Plain},
      {0x0b, "sltiu", Plain},  {0x0c, "andi", Plain},   {0x0d, "ori", Plain},
      {0x0e, "xori", Plain},   {0x0f, "lui", Plain},    {0x14, "beql", Branch},
      {0x15, "bnel", Branch},  {0x16, "blezl", Branch}, {0x17, "bgtzl", Branch},
      {0x20, "lb", Plain},     {0x21, "lh", Plain},     {0x22, "lwl", Plain},
      {0x23, "lw", Plain},     {0x24, "lbu", Plain},    {0x25, "lhu", Plain},
      {0x26, "lwr", Plain},    {0x28, "sb", Plain},     {0x29, "sh", Plain},
      {0x2a, "swl", Plain},    {0x2b, "sw", Plain},     {0x2e, "swr", Plain},
      {0x2f, "cache", Plain},  {0x30, "ll", Plain},     {0x31, "lwc1", Plain},
      {0x32, "lwc2", Plain},   {0x33, "pref", Plain},   {0x35, "ldc1", Plain},
      {0x36, "ldc2", Plain},   {0x38, "sc", Plain},     {0x39, "swc1", Plain},
      {0x3a, "swc2", Plain},   {0x3d, "sdc1", Plain},   {0x3e, "sdc2", Plain}};
  for (unsigned i = 0; i < sizeof(majors) / sizeof(majors[0]); i += 1) {
    add(kOpcode, major(majors[i].opcode), majors[i].name, majors[i].kind);
  }

  // ---- SPECIAL2 (opcode 0x1c), by funct
  static const struct { int funct; const char* name; } special2[] = {
      {0x00, "madd"}, {0x01, "maddu"}, {0x02, "mul"}, {0x04, "msub"},
      {0x05, "msubu"}, {0x20, "clz"},  {0x21, "clo"}};
  for (unsigned i = 0; i < sizeof(special2) / sizeof(special2[0]); i += 1) {
    add(kOpcodeFunct, major(0x1c) | quint32(special2[i].funct),
        special2[i].name);
  }

  // ---- Coprocessors: moves (rs = 0, 2, 4, 6) and branches (rs = 8)
  static const char* const moves[3][4] = {{"mfc0", "cfc0", "mtc0", "ctc0"},
                                          {"mfc1", "cfc1", "mtc1", "ctc1"},
                                          {"mfc2", "cfc2", "mtc2", "ctc2"}};
  for (int z = 0; z < 3; z += 1) {
    for (int m = 0; m < 4; m += 1) {
      add(kOpcodeRs, major(0x10 + z) | (quint32(2 * m) << 21), moves[z][m]);
    }
  }
  static const char* const branches[2][4] = {
      {"bc1f", "bc1t", "bc1fl", "bc1tl"}, {"bc2f", "bc2t", "bc2fl", "bc2tl"}};
  for (int z = 1; z <= 2; z += 1) {
    for (int b = 0; b < 4; b += 1) {
      add(kOpcodeRsNdTf, major(0x10 + z) | (8u << 21) | (quint32(b) << 16),
          branches[z - 1][b], Branch);
    }
  }
  // SPIM's generic coprocessor-2 operation: CO bit set, 25-bit argument.
  add(0xfe000000u, 0x4a000000u, "cop2");

  // ---- COP0 functions (rs = 16, as SPIM encodes them), by funct
  static const struct { int funct; const char* name; } cop0[] = {
      {0x01, "tlbr"}, {0x02, "tlbwi"}, {0x06, "tlbwr"},
      {0x08, "tlbp"}, {0x10, "rfe"},   {0x18, "eret"}};
  for (unsigned i = 0; i < sizeof(cop0) / sizeof(cop0[0]); i += 1) {
    add(kOpcodeRsFunct, major(0x10) | (16u << 21) | quint32(cop0[i].funct),
        cop0[i].name);
  }

  // ---- COP1 operations: fmt 16 = single (.s), 17 = double (.d)
  static const struct { int funct; const char* stem; } fpOps[] = {
      {0x00, "add"},     {0x01, "sub"},     {0x02, "mul"},    {0x03, "div"},
      {0x04, "sqrt"},    {0x05, "abs"},     {0x06, "mov"},    {0x07, "neg"},
      {0x0c, "round.w"}, {0x0d, "trunc.w"}, {0x0e, "ceil.w"}, {0x0f, "floor.w"},
      {0x12, "movz"},    {0x13, "movn"}};
  static const char* const conditions[16] = {
      "f",  "un",   "eq",  "ueq", "olt", "ult", "ole", "ule",
      "sf", "ngle", "seq", "ngl", "lt",  "nge", "le",  "ngt"};
  for (int d = 0; d < 2; d += 1) {
    const quint32 fmt = major(0x11) | (quint32(16 + d) << 21);
    const char* const suffix = d == 0 ? ".s" : ".d";
    for (unsigned i = 0; i < sizeof(fpOps) / sizeof(fpOps[0]); i += 1) {
      add(kOpcodeRsFunct, fmt | quint32(fpOps[i].funct),
          keep(QByteArray(fpOps[i].stem) + suffix));
    }
    add(kOpcodeRsTfFunct, fmt | 0x00000011u, keep(QByteArray("movf") + suffix));
    add(kOpcodeRsTfFunct, fmt | 0x00010011u, keep(QByteArray("movt") + suffix));
    for (int c = 0; c < 16; c += 1) {
      add(kOpcodeRsFunct, fmt | quint32(0x30 + c),
          keep(QByteArray("c.") + conditions[c] + suffix));
    }
  }
  // Conversions.  cvt.d.w is where SPIM leaves the manual: it uses fmt 17
  // (0x46200021); MIPS32 puts it under fmt 20, the source format (0x46800021).
  add(kOpcodeRsFunct, 0x46000021u, "cvt.d.s");
  add(kOpcodeRsFunct, 0x46000024u, "cvt.w.s");
  add(kOpcodeRsFunct, 0x46200020u, "cvt.s.d");
  add(kOpcodeRsFunct, 0x46200021u, "cvt.d.w");
  add(kOpcodeRsFunct, 0x46200024u, "cvt.w.d");
  add(kOpcodeRsFunct, 0x46800020u, "cvt.s.w");
}

const EncodingTable& table() {
  static const EncodingTable instance;
  return instance;
}

InstructionField field(const char* name, int high, int low, quint32 word) {
  InstructionField f;
  f.name = QString::fromLatin1(name);
  f.high = high;
  f.low = low;
  const int width = high - low + 1;
  const quint32 mask = width >= 32 ? 0xffffffffu : ((quint32(1) << width) - 1);
  f.value = (word >> low) & mask;
  return f;
}

QList<InstructionField> fieldsOf(quint32 word, DecodedInstruction::Format format) {
  QList<InstructionField> f;
  f << field("opcode", 31, 26, word);
  switch (format) {
    case DecodedInstruction::R:
      f << field("rs", 25, 21, word) << field("rt", 20, 16, word)
        << field("rd", 15, 11, word) << field("shamt", 10, 6, word)
        << field("funct", 5, 0, word);
      break;
    case DecodedInstruction::I:
      f << field("rs", 25, 21, word) << field("rt", 20, 16, word)
        << field("immediate", 15, 0, word);
      break;
    case DecodedInstruction::J:
      f << field("target", 25, 0, word);
      break;
    case DecodedInstruction::Cp0:
      if (word & 0x02000000u) {  // CO: a coprocessor-0 function (eret, ...)
        f << field("CO", 25, 25, word) << field("code", 24, 6, word)
          << field("funct", 5, 0, word);
      } else {  // mfc0 / mtc0
        f << field("rs", 25, 21, word) << field("rt", 20, 16, word)
          << field("rd", 15, 11, word) << field("0", 10, 3, word)
          << field("sel", 2, 0, word);
      }
      break;
    case DecodedInstruction::FR:
      f << field("fmt", 25, 21, word) << field("ft", 20, 16, word)
        << field("fs", 15, 11, word) << field("fd", 10, 6, word)
        << field("funct", 5, 0, word);
      break;
    case DecodedInstruction::FI:
      f << field("fmt", 25, 21, word) << field("cc", 20, 18, word)
        << field("nd", 17, 17, word) << field("tf", 16, 16, word)
        << field("immediate", 15, 0, word);
      break;
  }
  return f;
}

}  // namespace

DecodedInstruction::Format formatOf(quint32 word) {
  const int opcode = int(word >> 26);
  switch (opcode) {
    case 0x00:
    case 0x1c:
      return DecodedInstruction::R;
    case 0x02:
    case 0x03:
      return DecodedInstruction::J;
    case 0x10:
      return DecodedInstruction::Cp0;
    case 0x11:
      return ((word >> 21) & 0x1f) == 8 ? DecodedInstruction::FI
                                        : DecodedInstruction::FR;
    default:
      return DecodedInstruction::I;
  }
}

QString formatName(DecodedInstruction::Format format) {
  switch (format) {
    case DecodedInstruction::R:
      return QString("R");
    case DecodedInstruction::I:
      return QString("I");
    case DecodedInstruction::J:
      return QString("J");
    case DecodedInstruction::Cp0:
      return QString("CP0");
    case DecodedInstruction::FR:
      return QString("FR");
    case DecodedInstruction::FI:
      return QString("FI");
  }
  return QString();
}

DecodedInstruction decode(quint32 word) {
  DecodedInstruction d;
  d.word = word;
  d.format = formatOf(word);
  d.opcode = int(word >> 26);
  d.rs = int((word >> 21) & 0x1f);
  d.rt = int((word >> 16) & 0x1f);
  d.rd = int((word >> 11) & 0x1f);
  d.shamt = int((word >> 6) & 0x1f);
  d.funct = int(word & 0x3f);
  d.imm = word & 0xffffu;
  d.simm = (word & 0x8000u) ? qint32(word | 0xffff0000u) : qint32(word & 0xffffu);
  d.target = word & 0x03ffffffu;
  d.fields = fieldsOf(word, d.format);

  const Encoding* encoding = table().find(word);
  d.known = encoding != 0;
  d.kind = encoding != 0 ? encoding->kind : DecodedInstruction::Plain;
  d.name = encoding != 0 ? QString::fromLatin1(encoding->name) : QString();

  d.hasDestination = false;
  d.destination = 0;
  return d;
}

DecodedInstruction decode(quint32 word, quint32 pc, BranchConvention convention) {
  DecodedInstruction d = decode(word);
  if (d.kind == DecodedInstruction::Branch) {
    const quint32 base = convention == MipsDelaySlot ? pc + 4 : pc;
    d.destination = base + (quint32(d.simm) << 2);  // wraps modulo 2^32
    d.hasDestination = true;
  } else if (d.kind == DecodedInstruction::Jump) {
    d.destination = (pc & 0xf0000000u) | (d.target << 2);
    d.hasDestination = true;
  }
  return d;
}

quint32 reassemble(const DecodedInstruction& instruction) {
  quint32 word = 0;
  for (int i = 0; i < instruction.fields.size(); i += 1) {
    word |= instruction.fields.at(i).value << instruction.fields.at(i).low;
  }
  return word;
}


// What the letters stand for.  Only the abbreviations are here: an
// instruction whose name is already a word -- add, and, or, nor, xor, sub,
// move, nop, syscall, break, sync, div (in full below), the floating point
// operations named after what they do -- would gain nothing from a line
// repeating it.
QString mnemonicExpansion(const QString& name) {
  static const struct {
    const char* name;
    const char* text;
  } kExpansions[] = {
    {"lb", "Load Byte"},
    {"lbu", "Load Byte Unsigned"},
    {"lh", "Load Halfword"},
    {"lhu", "Load Halfword Unsigned"},
    {"lw", "Load Word"},
    {"lwl", "Load Word Left"},
    {"lwr", "Load Word Right"},
    {"lui", "Load Upper Immediate"},
    {"ll", "Load Linked"},
    {"sb", "Store Byte"},
    {"sh", "Store Halfword"},
    {"sw", "Store Word"},
    {"swl", "Store Word Left"},
    {"swr", "Store Word Right"},
    {"sc", "Store Conditional"},
    {"addi", "Add Immediate"},
    {"addiu", "Add Immediate Unsigned"},
    {"addu", "Add Unsigned"},
    {"subu", "Subtract Unsigned"},
    {"mult", "Multiply"},
    {"multu", "Multiply Unsigned"},
    {"div", "Divide"},
    {"divu", "Divide Unsigned"},
    {"madd", "Multiply and Add"},
    {"maddu", "Multiply and Add Unsigned"},
    {"msub", "Multiply and Subtract"},
    {"msubu", "Multiply and Subtract Unsigned"},
    {"mul", "Multiply (to register)"},
    {"mfhi", "Move From HI"},
    {"mthi", "Move To HI"},
    {"mflo", "Move From LO"},
    {"mtlo", "Move To LO"},
    {"movz", "Move if Zero"},
    {"movn", "Move if Not Zero"},
    {"andi", "And Immediate"},
    {"ori", "Or Immediate"},
    {"xori", "Exclusive Or Immediate"},
    {"sll", "Shift Left Logical"},
    {"srl", "Shift Right Logical"},
    {"sra", "Shift Right Arithmetic"},
    {"sllv", "Shift Left Logical Variable"},
    {"srlv", "Shift Right Logical Variable"},
    {"srav", "Shift Right Arithmetic Variable"},
    {"slt", "Set on Less Than"},
    {"sltu", "Set on Less Than Unsigned"},
    {"slti", "Set on Less Than Immediate"},
    {"sltiu", "Set on Less Than Immediate Unsigned"},
    {"beq", "Branch on Equal"},
    {"bne", "Branch on Not Equal"},
    {"blez", "Branch on Less than or Equal to Zero"},
    {"bgtz", "Branch on Greater Than Zero"},
    {"bltz", "Branch on Less Than Zero"},
    {"bgez", "Branch on Greater than or Equal to Zero"},
    {"bltzal", "Branch on Less Than Zero And Link"},
    {"bgezal", "Branch on Greater than or Equal to Zero And Link"},
    {"beql", "Branch on Equal Likely"},
    {"bnel", "Branch on Not Equal Likely"},
    {"blezl", "Branch on Less than or Equal to Zero Likely"},
    {"bgtzl", "Branch on Greater Than Zero Likely"},
    {"bltzl", "Branch on Less Than Zero Likely"},
    {"bgezl", "Branch on Greater than or Equal to Zero Likely"},
    {"bltzall", "Branch on Less Than Zero And Link Likely"},
    {"bgezall", "Branch on Greater than or Equal to Zero And Link Likely"},
    {"j", "Jump"},
    {"jal", "Jump And Link"},
    {"jr", "Jump Register"},
    {"jalr", "Jump And Link Register"},
    {"teq", "Trap if Equal"},
    {"tne", "Trap if Not Equal"},
    {"tge", "Trap if Greater than or Equal"},
    {"tgeu", "Trap if Greater than or Equal Unsigned"},
    {"tlt", "Trap if Less Than"},
    {"tltu", "Trap if Less Than Unsigned"},
    {"teqi", "Trap if Equal Immediate"},
    {"tnei", "Trap if Not Equal Immediate"},
    {"tgei", "Trap if Greater than or Equal Immediate"},
    {"tgeiu", "Trap if Greater than or Equal Immediate Unsigned"},
    {"tlti", "Trap if Less Than Immediate"},
    {"tltiu", "Trap if Less Than Immediate Unsigned"},
    {"mfc0", "Move From Coprocessor 0"},
    {"mtc0", "Move To Coprocessor 0"},
    {"cfc0", "Move Control From Coprocessor 0"},
    {"ctc0", "Move Control To Coprocessor 0"},
    {"mfc1", "Move From Coprocessor 1"},
    {"mtc1", "Move To Coprocessor 1"},
    {"cfc1", "Move Control From Coprocessor 1"},
    {"ctc1", "Move Control To Coprocessor 1"},
    {"mfc2", "Move From Coprocessor 2"},
    {"mtc2", "Move To Coprocessor 2"},
    {"cfc2", "Move Control From Coprocessor 2"},
    {"ctc2", "Move Control To Coprocessor 2"},
    {"lwc1", "Load Word to Coprocessor 1"},
    {"swc1", "Store Word from Coprocessor 1"},
    {"ldc1", "Load Doubleword to Coprocessor 1"},
    {"sdc1", "Store Doubleword from Coprocessor 1"},
    {"lwc2", "Load Word to Coprocessor 2"},
    {"swc2", "Store Word from Coprocessor 2"},
    {"ldc2", "Load Doubleword to Coprocessor 2"},
    {"sdc2", "Store Doubleword from Coprocessor 2"},
    {"bc1f", "Branch on Coprocessor 1 False"},
    {"bc1t", "Branch on Coprocessor 1 True"},
    {"bc1fl", "Branch on Coprocessor 1 False Likely"},
    {"bc1tl", "Branch on Coprocessor 1 True Likely"},
    {"clz", "Count Leading Zeros"},
    {"clo", "Count Leading Ones"},
    {"pref", "Prefetch"},
    {"cache", "Cache Operation"},
    {"eret", "Exception Return"},
    {"rfe", "Restore From Exception"},
    {"tlbr", "TLB Read"},
    {"tlbwi", "TLB Write Indexed"},
    {"tlbwr", "TLB Write Random"},
    {"tlbp", "TLB Probe"},
  };
  for (unsigned i = 0; i < sizeof(kExpansions) / sizeof(kExpansions[0]);
       i += 1) {
    if (name == QLatin1String(kExpansions[i].name)) {
      return QString::fromLatin1(kExpansions[i].text);
    }
  }
  return QString();
}

}  // namespace edu
