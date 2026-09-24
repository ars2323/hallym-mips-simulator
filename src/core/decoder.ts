/* 32-bit MIPS instruction word -> format, fields, name and branch/jump
   destination.  Pure logic: no core, no DOM, no Node.

   A port of the Qt build's QtSpim/edu/core/edu_decoder.{h,cpp}
   (hallym-mips-simulator), whose header comment is the specification.  It is
   restated here because it still is:

   The decoder looks at the word and nothing else.  The simulator core is not
   used here; tests/spike/check-decoder.ts checks this decoder against the
   core's disassembly of every instruction of a test program.

   Format (from the word alone, never from op.h's operand-shape classes):

       opcode 0x00 (SPECIAL)         R
       opcode 0x1c (SPECIAL2)        R    -- mul, clz...: same field layout
       opcode 0x02, 0x03             J
       opcode 0x10 (COP0)            CP0
       opcode 0x11 (COP1)            FI if the fmt field is 8 (bc1f/bc1t...),
                                     otherwise FR
       everything else               I

   Names cover what SPIM 9.1.24 can assemble and execute.  The MIPS32
   Release 2 instructions listed in op.h are rejected by SPIM's own parser
   ("not implemented. Instruction ignored"), so they decode as unknown here
   too.  Where SPIM's encoding differs from the MIPS32 manual, SPIM wins,
   because SPIM produced the words a student is looking at.
*/

export interface InstructionField {
  name: string;  // "opcode", "rs", "immediate", ...
  high: number;  // most significant bit, 31..0
  low: number;   // least significant bit
  value: number; // the bits, right-aligned
}

export const fieldWidth = (f: InstructionField): number => f.high - f.low + 1;

// How a branch's 16-bit offset relates to its destination.
//
// SPIM assembles and executes branches differently depending on its
// "delayed branches" setting (CPU/run.cpp BRANCH_INST, CPU/sym-tbl.cpp
// resolve_a_label_sub):
//
//   off (QtSpim's default)  destination = PC     + (offset << 2)
//   on  (bare machine)      destination = PC + 4 + (offset << 2)   <- MIPS
//
// so the same source line yields a different word in the two modes, and the
// textbook formula only holds in the second.
export type BranchConvention = 'SpimNoDelaySlot' | 'MipsDelaySlot';

export type Format = 'R' | 'I' | 'J' | 'Cp0' | 'FR' | 'FI';
export type Kind = 'Plain' | 'Branch' | 'Jump';

export interface DecodedInstruction {
  word: number;
  format: Format;
  kind: Kind;
  known: boolean; // false: no instruction SPIM implements has this encoding
  name: string;   // mnemonic as SPIM spells it ("addu", "c.eq.d"); '' if !known

  // Raw bit fields, always extracted, whatever the format.
  opcode: number; // [31:26]
  rs: number;     // [25:21]  (fmt in FR/FI)
  rt: number;     // [20:16]  (ft)
  rd: number;     // [15:11]  (fs)
  shamt: number;  // [10:6]   (fd)
  funct: number;  // [5:0]
  imm: number;    // [15:0], zero-extended
  simm: number;   // [15:0], sign-extended
  target: number; // [25:0]

  // The fields that make up this format, most significant first.  They tile
  // the word exactly: reassemble() gives back `word`.
  fields: InstructionField[];

  // Branch or jump destination; meaningful only when hasDestination.
  hasDestination: boolean;
  destination: number;
}

// ---------------------------------------------------------------- table

interface Encoding {
  mask: number;
  pattern: number;
  name: string;
  kind: Kind;
}

// Masks for the encoding classes of the MIPS32 opcode map.
const kOpcode = 0xfc000000;          // major opcode only
const kOpcodeFunct = 0xfc00003f;     // SPECIAL / SPECIAL2
const kOpcodeRt = 0xfc1f0000;        // REGIMM
const kOpcodeRs = 0xffe00000;        // COPz move to/from
const kOpcodeRsNdTf = 0xffe30000;    // COPz branches
const kOpcodeRsFunct = 0xffe0003f;   // COP0 CO functions, COP1 ops
const kOpcodeRsTfFunct = 0xffe3003f; // movf/movt on FP registers
const kMovci = 0xfc03003f;           // SPECIAL movf/movt
const kExact = 0xffffffff;

const major = (opcode: number): number => (opcode << 26) >>> 0;

function buildTable(): Encoding[] {
  const entries: Encoding[] = [];
  const add = (mask: number, pattern: number, name: string, kind: Kind = 'Plain') => {
    entries.push({ mask: mask >>> 0, pattern: pattern >>> 0, name, kind });
  };

  // The all-zero word is sll $0, $0, 0, which SPIM prints as "nop".  It has
  // to come before sll.  (0x00000040, "ssnop", is deliberately not singled
  // out: it is also a plain sll $0, $0, 1, and SPIM's decoder calls it sll.)
  add(kExact, 0x00000000, 'nop');

  // ---- SPECIAL (opcode 0), by funct
  const special: [number, string][] = [
    [0x00, 'sll'], [0x02, 'srl'], [0x03, 'sra'], [0x04, 'sllv'],
    [0x06, 'srlv'], [0x07, 'srav'], [0x08, 'jr'], [0x09, 'jalr'],
    [0x0a, 'movz'], [0x0b, 'movn'], [0x0c, 'syscall'], [0x0d, 'break'],
    [0x0f, 'sync'], [0x10, 'mfhi'], [0x11, 'mthi'], [0x12, 'mflo'],
    [0x13, 'mtlo'], [0x18, 'mult'], [0x19, 'multu'], [0x1a, 'div'],
    [0x1b, 'divu'], [0x20, 'add'], [0x21, 'addu'], [0x22, 'sub'],
    [0x23, 'subu'], [0x24, 'and'], [0x25, 'or'], [0x26, 'xor'],
    [0x27, 'nor'], [0x2a, 'slt'], [0x2b, 'sltu'], [0x30, 'tge'],
    [0x31, 'tgeu'], [0x32, 'tlt'], [0x33, 'tltu'], [0x34, 'teq'],
    [0x36, 'tne']];
  for (const [funct, name] of special) add(kOpcodeFunct, funct, name);
  // funct 1: move on FP condition code; bit 16 = true/false, bit 17 = 0.
  add(kMovci, 0x00000001, 'movf');
  add(kMovci, 0x00010001, 'movt');

  // ---- REGIMM (opcode 1), by rt
  const regimm: [number, string, Kind][] = [
    [0, 'bltz', 'Branch'], [1, 'bgez', 'Branch'], [2, 'bltzl', 'Branch'],
    [3, 'bgezl', 'Branch'], [8, 'tgei', 'Plain'], [9, 'tgeiu', 'Plain'],
    [10, 'tlti', 'Plain'], [11, 'tltiu', 'Plain'], [12, 'teqi', 'Plain'],
    [14, 'tnei', 'Plain'], [16, 'bltzal', 'Branch'], [17, 'bgezal', 'Branch'],
    [18, 'bltzall', 'Branch'], [19, 'bgezall', 'Branch']];
  for (const [rt, name, kind] of regimm) add(kOpcodeRt, major(1) | (rt << 16), name, kind);

  // ---- Major opcodes that stand for one instruction each
  const majors: [number, string, Kind][] = [
    [0x02, 'j', 'Jump'], [0x03, 'jal', 'Jump'], [0x04, 'beq', 'Branch'],
    [0x05, 'bne', 'Branch'], [0x06, 'blez', 'Branch'], [0x07, 'bgtz', 'Branch'],
    [0x08, 'addi', 'Plain'], [0x09, 'addiu', 'Plain'], [0x0a, 'slti', 'Plain'],
    [0x0b, 'sltiu', 'Plain'], [0x0c, 'andi', 'Plain'], [0x0d, 'ori', 'Plain'],
    [0x0e, 'xori', 'Plain'], [0x0f, 'lui', 'Plain'], [0x14, 'beql', 'Branch'],
    [0x15, 'bnel', 'Branch'], [0x16, 'blezl', 'Branch'], [0x17, 'bgtzl', 'Branch'],
    [0x20, 'lb', 'Plain'], [0x21, 'lh', 'Plain'], [0x22, 'lwl', 'Plain'],
    [0x23, 'lw', 'Plain'], [0x24, 'lbu', 'Plain'], [0x25, 'lhu', 'Plain'],
    [0x26, 'lwr', 'Plain'], [0x28, 'sb', 'Plain'], [0x29, 'sh', 'Plain'],
    [0x2a, 'swl', 'Plain'], [0x2b, 'sw', 'Plain'], [0x2e, 'swr', 'Plain'],
    [0x2f, 'cache', 'Plain'], [0x30, 'll', 'Plain'], [0x31, 'lwc1', 'Plain'],
    [0x32, 'lwc2', 'Plain'], [0x33, 'pref', 'Plain'], [0x35, 'ldc1', 'Plain'],
    [0x36, 'ldc2', 'Plain'], [0x38, 'sc', 'Plain'], [0x39, 'swc1', 'Plain'],
    [0x3a, 'swc2', 'Plain'], [0x3d, 'sdc1', 'Plain'], [0x3e, 'sdc2', 'Plain']];
  for (const [opcode, name, kind] of majors) add(kOpcode, major(opcode), name, kind);

  // ---- SPECIAL2 (opcode 0x1c), by funct
  const special2: [number, string][] = [
    [0x00, 'madd'], [0x01, 'maddu'], [0x02, 'mul'], [0x04, 'msub'],
    [0x05, 'msubu'], [0x20, 'clz'], [0x21, 'clo']];
  for (const [funct, name] of special2) add(kOpcodeFunct, major(0x1c) | funct, name);

  // ---- Coprocessors: moves (rs = 0, 2, 4, 6) and branches (rs = 8)
  const moves = [['mfc0', 'cfc0', 'mtc0', 'ctc0'],
                 ['mfc1', 'cfc1', 'mtc1', 'ctc1'],
                 ['mfc2', 'cfc2', 'mtc2', 'ctc2']];
  for (let z = 0; z < 3; z += 1) {
    for (let m = 0; m < 4; m += 1) {
      add(kOpcodeRs, major(0x10 + z) | ((2 * m) << 21), moves[z][m]);
    }
  }
  const branches = [['bc1f', 'bc1t', 'bc1fl', 'bc1tl'], ['bc2f', 'bc2t', 'bc2fl', 'bc2tl']];
  for (let z = 1; z <= 2; z += 1) {
    for (let b = 0; b < 4; b += 1) {
      add(kOpcodeRsNdTf, major(0x10 + z) | (8 << 21) | (b << 16), branches[z - 1][b], 'Branch');
    }
  }
  // SPIM's generic coprocessor-2 operation: CO bit set, 25-bit argument.
  add(0xfe000000, 0x4a000000, 'cop2');

  // ---- COP0 functions (rs = 16, as SPIM encodes them), by funct
  const cop0: [number, string][] = [
    [0x01, 'tlbr'], [0x02, 'tlbwi'], [0x06, 'tlbwr'],
    [0x08, 'tlbp'], [0x10, 'rfe'], [0x18, 'eret']];
  for (const [funct, name] of cop0) add(kOpcodeRsFunct, major(0x10) | (16 << 21) | funct, name);

  // ---- COP1 operations: fmt 16 = single (.s), 17 = double (.d)
  const fpOps: [number, string][] = [
    [0x00, 'add'], [0x01, 'sub'], [0x02, 'mul'], [0x03, 'div'],
    [0x04, 'sqrt'], [0x05, 'abs'], [0x06, 'mov'], [0x07, 'neg'],
    [0x0c, 'round.w'], [0x0d, 'trunc.w'], [0x0e, 'ceil.w'], [0x0f, 'floor.w'],
    [0x12, 'movz'], [0x13, 'movn']];
  const conditions = ['f', 'un', 'eq', 'ueq', 'olt', 'ult', 'ole', 'ule',
                      'sf', 'ngle', 'seq', 'ngl', 'lt', 'nge', 'le', 'ngt'];
  for (let d = 0; d < 2; d += 1) {
    const fmt = major(0x11) | ((16 + d) << 21);
    const suffix = d === 0 ? '.s' : '.d';
    for (const [funct, stem] of fpOps) add(kOpcodeRsFunct, fmt | funct, stem + suffix);
    add(kOpcodeRsTfFunct, fmt | 0x00000011, 'movf' + suffix);
    add(kOpcodeRsTfFunct, fmt | 0x00010011, 'movt' + suffix);
    for (let c = 0; c < 16; c += 1) {
      add(kOpcodeRsFunct, fmt | (0x30 + c), 'c.' + conditions[c] + suffix);
    }
  }
  // Conversions.  cvt.d.w is where SPIM leaves the manual: it uses fmt 17
  // (0x46200021); MIPS32 puts it under fmt 20, the source format (0x46800021).
  add(kOpcodeRsFunct, 0x46000021, 'cvt.d.s');
  add(kOpcodeRsFunct, 0x46000024, 'cvt.w.s');
  add(kOpcodeRsFunct, 0x46200020, 'cvt.s.d');
  add(kOpcodeRsFunct, 0x46200021, 'cvt.d.w');
  add(kOpcodeRsFunct, 0x46200024, 'cvt.w.d');
  add(kOpcodeRsFunct, 0x46800020, 'cvt.s.w');
  return entries;
}

const table = buildTable();

function find(word: number): Encoding | undefined {
  return table.find((e) => ((word & e.mask) >>> 0) === e.pattern);
}

// ---------------------------------------------------------------- fields

function field(name: string, high: number, low: number, word: number): InstructionField {
  const width = high - low + 1;
  const mask = width >= 32 ? 0xffffffff : (1 << width) - 1;
  return { name, high, low, value: ((word >>> low) & mask) >>> 0 };
}

function fieldsOf(word: number, format: Format): InstructionField[] {
  const f = [field('opcode', 31, 26, word)];
  switch (format) {
    case 'R':
      f.push(field('rs', 25, 21, word), field('rt', 20, 16, word),
             field('rd', 15, 11, word), field('shamt', 10, 6, word),
             field('funct', 5, 0, word));
      break;
    case 'I':
      f.push(field('rs', 25, 21, word), field('rt', 20, 16, word),
             field('immediate', 15, 0, word));
      break;
    case 'J':
      f.push(field('target', 25, 0, word));
      break;
    case 'Cp0':
      if (word & 0x02000000) { // CO: a coprocessor-0 function (eret, ...)
        f.push(field('CO', 25, 25, word), field('code', 24, 6, word),
               field('funct', 5, 0, word));
      } else { // mfc0 / mtc0
        f.push(field('rs', 25, 21, word), field('rt', 20, 16, word),
               field('rd', 15, 11, word), field('0', 10, 3, word),
               field('sel', 2, 0, word));
      }
      break;
    case 'FR':
      f.push(field('fmt', 25, 21, word), field('ft', 20, 16, word),
             field('fs', 15, 11, word), field('fd', 10, 6, word),
             field('funct', 5, 0, word));
      break;
    case 'FI':
      f.push(field('fmt', 25, 21, word), field('cc', 20, 18, word),
             field('nd', 17, 17, word), field('tf', 16, 16, word),
             field('immediate', 15, 0, word));
      break;
  }
  return f;
}

// ---------------------------------------------------------------- API

// The format rule on its own.
export function formatOf(word: number): Format {
  switch (word >>> 26) {
    case 0x00:
    case 0x1c:
      return 'R';
    case 0x02:
    case 0x03:
      return 'J';
    case 0x10:
      return 'Cp0';
    case 0x11:
      return ((word >>> 21) & 0x1f) === 8 ? 'FI' : 'FR';
    default:
      return 'I';
  }
}

// "R", "I", "J", "CP0", "FR", "FI".
export function formatName(format: Format): string {
  return format === 'Cp0' ? 'CP0' : format;
}

// Decodes without a PC: hasDestination is false.
export function decode(word: number): DecodedInstruction;
// Decodes an instruction located at `pc`.  Branches get
// pc (+4 under MipsDelaySlot) + (simm << 2); j/jal get
// (pc & 0xf0000000) | (target << 2), which is how SPIM computes it.
export function decode(word: number, pc: number, convention: BranchConvention): DecodedInstruction;
export function decode(word: number, pc?: number,
                       convention?: BranchConvention): DecodedInstruction {
  word = word >>> 0;
  const format = formatOf(word);
  const encoding = find(word);
  const d: DecodedInstruction = {
    word,
    format,
    kind: encoding ? encoding.kind : 'Plain',
    known: encoding !== undefined,
    name: encoding ? encoding.name : '',
    opcode: word >>> 26,
    rs: (word >>> 21) & 0x1f,
    rt: (word >>> 16) & 0x1f,
    rd: (word >>> 11) & 0x1f,
    shamt: (word >>> 6) & 0x1f,
    funct: word & 0x3f,
    imm: word & 0xffff,
    simm: (word << 16) >> 16,
    target: word & 0x03ffffff,
    fields: fieldsOf(word, format),
    hasDestination: false,
    destination: 0,
  };
  if (pc === undefined) return d;

  if (d.kind === 'Branch') {
    const base = convention === 'MipsDelaySlot' ? pc + 4 : pc;
    d.destination = (base + (d.simm << 2)) >>> 0; // wraps modulo 2^32
    d.hasDestination = true;
  } else if (d.kind === 'Jump') {
    d.destination = ((pc & 0xf0000000) | (d.target << 2)) >>> 0;
    d.hasDestination = true;
  }
  return d;
}

// ORs the fields back together.
export function reassemble(instruction: DecodedInstruction): number {
  let word = 0;
  for (const f of instruction.fields) word |= f.value << f.low;
  return word >>> 0;
}

// What the letters stand for.  Only the abbreviations are here: an
// instruction whose name is already a word -- add, and, or, nor, xor, sub,
// move, nop, syscall, break, sync, div (in full below), the floating point
// operations named after what they do -- would gain nothing from a line
// repeating it.  "lui" -> "Load Upper Immediate"; '' for the rest.
const kExpansions: Record<string, string> = {
  lb: 'Load Byte',
  lbu: 'Load Byte Unsigned',
  lh: 'Load Halfword',
  lhu: 'Load Halfword Unsigned',
  lw: 'Load Word',
  lwl: 'Load Word Left',
  lwr: 'Load Word Right',
  lui: 'Load Upper Immediate',
  ll: 'Load Linked',
  sb: 'Store Byte',
  sh: 'Store Halfword',
  sw: 'Store Word',
  swl: 'Store Word Left',
  swr: 'Store Word Right',
  sc: 'Store Conditional',
  addi: 'Add Immediate',
  addiu: 'Add Immediate Unsigned',
  addu: 'Add Unsigned',
  subu: 'Subtract Unsigned',
  mult: 'Multiply',
  multu: 'Multiply Unsigned',
  div: 'Divide',
  divu: 'Divide Unsigned',
  madd: 'Multiply and Add',
  maddu: 'Multiply and Add Unsigned',
  msub: 'Multiply and Subtract',
  msubu: 'Multiply and Subtract Unsigned',
  mul: 'Multiply (to register)',
  mfhi: 'Move From HI',
  mthi: 'Move To HI',
  mflo: 'Move From LO',
  mtlo: 'Move To LO',
  movz: 'Move if Zero',
  movn: 'Move if Not Zero',
  andi: 'And Immediate',
  ori: 'Or Immediate',
  xori: 'Exclusive Or Immediate',
  sll: 'Shift Left Logical',
  srl: 'Shift Right Logical',
  sra: 'Shift Right Arithmetic',
  sllv: 'Shift Left Logical Variable',
  srlv: 'Shift Right Logical Variable',
  srav: 'Shift Right Arithmetic Variable',
  slt: 'Set on Less Than',
  sltu: 'Set on Less Than Unsigned',
  slti: 'Set on Less Than Immediate',
  sltiu: 'Set on Less Than Immediate Unsigned',
  beq: 'Branch on Equal',
  bne: 'Branch on Not Equal',
  blez: 'Branch on Less than or Equal to Zero',
  bgtz: 'Branch on Greater Than Zero',
  bltz: 'Branch on Less Than Zero',
  bgez: 'Branch on Greater than or Equal to Zero',
  bltzal: 'Branch on Less Than Zero And Link',
  bgezal: 'Branch on Greater than or Equal to Zero And Link',
  beql: 'Branch on Equal Likely',
  bnel: 'Branch on Not Equal Likely',
  blezl: 'Branch on Less than or Equal to Zero Likely',
  bgtzl: 'Branch on Greater Than Zero Likely',
  bltzl: 'Branch on Less Than Zero Likely',
  bgezl: 'Branch on Greater than or Equal to Zero Likely',
  bltzall: 'Branch on Less Than Zero And Link Likely',
  bgezall: 'Branch on Greater than or Equal to Zero And Link Likely',
  j: 'Jump',
  jal: 'Jump And Link',
  jr: 'Jump Register',
  jalr: 'Jump And Link Register',
  teq: 'Trap if Equal',
  tne: 'Trap if Not Equal',
  tge: 'Trap if Greater than or Equal',
  tgeu: 'Trap if Greater than or Equal Unsigned',
  tlt: 'Trap if Less Than',
  tltu: 'Trap if Less Than Unsigned',
  teqi: 'Trap if Equal Immediate',
  tnei: 'Trap if Not Equal Immediate',
  tgei: 'Trap if Greater than or Equal Immediate',
  tgeiu: 'Trap if Greater than or Equal Immediate Unsigned',
  tlti: 'Trap if Less Than Immediate',
  tltiu: 'Trap if Less Than Immediate Unsigned',
  mfc0: 'Move From Coprocessor 0',
  mtc0: 'Move To Coprocessor 0',
  cfc0: 'Move Control From Coprocessor 0',
  ctc0: 'Move Control To Coprocessor 0',
  mfc1: 'Move From Coprocessor 1',
  mtc1: 'Move To Coprocessor 1',
  cfc1: 'Move Control From Coprocessor 1',
  ctc1: 'Move Control To Coprocessor 1',
  mfc2: 'Move From Coprocessor 2',
  mtc2: 'Move To Coprocessor 2',
  cfc2: 'Move Control From Coprocessor 2',
  ctc2: 'Move Control To Coprocessor 2',
  lwc1: 'Load Word to Coprocessor 1',
  swc1: 'Store Word from Coprocessor 1',
  ldc1: 'Load Doubleword to Coprocessor 1',
  sdc1: 'Store Doubleword from Coprocessor 1',
  lwc2: 'Load Word to Coprocessor 2',
  swc2: 'Store Word from Coprocessor 2',
  ldc2: 'Load Doubleword to Coprocessor 2',
  sdc2: 'Store Doubleword from Coprocessor 2',
  bc1f: 'Branch on Coprocessor 1 False',
  bc1t: 'Branch on Coprocessor 1 True',
  bc1fl: 'Branch on Coprocessor 1 False Likely',
  bc1tl: 'Branch on Coprocessor 1 True Likely',
  clz: 'Count Leading Zeros',
  clo: 'Count Leading Ones',
  pref: 'Prefetch',
  cache: 'Cache Operation',
  eret: 'Exception Return',
  rfe: 'Restore From Exception',
  tlbr: 'TLB Read',
  tlbwi: 'TLB Write Indexed',
  tlbwr: 'TLB Write Random',
  tlbp: 'TLB Probe',
};

export function mnemonicExpansion(name: string): string {
  return Object.hasOwn(kExpansions, name) ? kExpansions[name] : '';
}
