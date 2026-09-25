/* The inspector's text for one instruction.  A port of the Qt build's
   QtSpim/edu/core/edu_instruction_text.{h,cpp}.

       lw $4, 0($29)                     I-type
       0x8fa40000  at 0x00400024
       31  26 25-21 20-16 15             0
       100011 11101 00100 0000000000000000
       opcode rs    rt    immediate
       35     29    4     0
       lw     $sp   $a0   0x0000

   One column per field of the decoded word: its bit range, its bits, its
   name, its value, and what the value means (instruction name for opcode /
   funct, register name for a register number, hex or "x4" for an offset).
   Branches and jumps get their destination.  In SPIM's default branch mode
   there is also a note; it is prose, not a table, and comes separately
   (instructionNoteLines) so that a view can set it in a proportional font
   with word wrap.

   Pure text layout; the detail lines are meant for a fixed-pitch font.  The
   table part never exceeds INSTRUCTION_TEXT_COLUMNS characters.
*/

import { formatName, type BranchConvention, type DecodedInstruction, type InstructionField } from './decoder.ts';
import { hex32 } from './format.ts';
import { generalRegisterName } from './registers.ts';

export const INSTRUCTION_TEXT_COLUMNS = 44;

interface Column {
  range: string;   // "31  26"
  bits: string;    // "100011"
  name: string;    // "opcode"
  value: string;   // "35"
  meaning: string; // "lw"
  width: number;
}

function majorOpcodeClass(opcode: number): string {
  switch (opcode) {
    case 0x00: return 'SPECIAL';
    case 0x01: return 'REGIMM';
    case 0x10: return 'COP0';
    case 0x11: return 'COP1';
    case 0x12: return 'COP2';
    case 0x13: return 'COP1X';
    case 0x1c: return 'SPECIAL2';
    default: return '';
  }
}

function cp0RegisterName(number: number): string {
  switch (number) {
    case 8: return 'BadVAddr';
    case 12: return 'Status';
    case 13: return 'Cause';
    case 14: return 'EPC';
    default: return '';
  }
}

function fpFormatName(fmt: number): string {
  switch (fmt) {
    case 16: return 'single';
    case 17: return 'double';
    case 20: return 'word';
    case 8: return 'BC';
    default: return '';
  }
}

// What a field's value stands for, given the whole instruction.
// What one field says (the last row of the table), for a view that sets
// the table itself.
export function meaningOf(field: InstructionField, d: DecodedInstruction): string {
  const named = d.known;
  const v = field.value;
  if (field.name === 'opcode') {
    const group = majorOpcodeClass(d.opcode);
    return group === '' ? (named ? d.name : '?') : group;
  }
  if (field.name === 'funct') return named ? d.name : '?';
  if (field.name === 'immediate') {
    if (d.kind === 'Branch') return `x4=${d.simm * 4}`;
    return '0x' + d.imm.toString(16).padStart(4, '0');
  }
  if (field.name === 'target') {
    return 'x4=0x' + ((d.target << 2) >>> 0).toString(16).padStart(8, '0');
  }
  switch (d.format) {
    case 'R':
    case 'I':
      if (field.name === 'rt' && d.opcode === 0x01) return named ? d.name : '?'; // REGIMM: rt selects the instruction
      if (field.name === 'rs' || field.name === 'rt' || field.name === 'rd') return generalRegisterName(v);
      break;
    case 'Cp0':
      if (field.name === 'rs') return named ? d.name : '?';
      if (field.name === 'rt') return generalRegisterName(v);
      if (field.name === 'rd') return cp0RegisterName(v);
      break;
    case 'FR':
      if (field.name === 'fmt') {
        const fmt = fpFormatName(v);
        return fmt === '' && named ? d.name : fmt; // mfc1, mtc1, ...
      }
      if (field.name === 'ft' && d.rs < 8) return generalRegisterName(v); // mfc1 $t0, $f12: rt is a CPU register
      if (field.name === 'ft' || field.name === 'fs' || field.name === 'fd') return `$f${v}`;
      break;
    case 'FI':
      if (field.name === 'fmt') return fpFormatName(v);
      if (field.name === 'tf') return named ? d.name : '?'; // bc1t / bc1f
      break;
    case 'J':
      break;
  }
  return '';
}

function rangeLabel(field: InstructionField, width: number): string {
  if (field.high === field.low) return String(field.high);
  const high = String(field.high);
  const low = String(field.low);
  if (width >= high.length + low.length + 2) { // "25 21" would read as two fields
    return high + ' '.repeat(width - high.length - low.length) + low;
  }
  return `${high}-${low}`;
}

function joinRow(columns: Column[], member: keyof Omit<Column, 'width'>): string {
  const cells = columns.map((c, i) => (i + 1 < columns.length ? c[member].padEnd(c.width, ' ') : c[member]));
  return cells.join(' ').replace(/ +$/, '');
}

// `decoded` should come from decode(word, address, convention) so that a
// branch or jump carries its destination; `address` is where the instruction
// sits.  `disassembly` is the core's text for the instruction
// ("lw $4, 0($29)"); `destinationLabel` is the label the source named, or ''.
export function instructionDetailLines(d: DecodedInstruction, address: number, disassembly: string,
                                       destinationLabel: string, convention: BranchConvention): string[] {
  const columns: Column[] = d.fields.map((field) => {
    const width = field.high - field.low + 1;
    const c: Column = {
      range: '',
      bits: field.value.toString(2).padStart(width, '0'),
      name: field.name,
      value: field.name === 'immediate' ? String(d.simm) : String(field.value),
      meaning: meaningOf(field, d),
      width: 0,
    };
    c.width = Math.max(c.bits.length, c.name.length, c.value.length, c.meaning.length);
    // A range that does not fit as "31  26" falls back to "31-26", which
    // may itself need room.
    c.width = Math.max(c.width, rangeLabel(field, c.width).length);
    c.range = rangeLabel(field, c.width);
    return c;
  });

  const type = formatName(d.format) + '-type';
  const what = d.known ? disassembly : '(not an instruction this simulator implements)';
  const gap = Math.max(2, INSTRUCTION_TEXT_COLUMNS - what.length - type.length);
  const lines = [
    what + ' '.repeat(gap) + type,
    `${hex32(d.word)}  at ${hex32(address)}`,
    joinRow(columns, 'range'),
    joinRow(columns, 'bits'),
    joinRow(columns, 'name'),
    joinRow(columns, 'value'),
    joinRow(columns, 'meaning'),
  ];
  if (d.hasDestination) {
    const where = hex32(d.destination) + (destinationLabel === '' ? '' : ` [${destinationLabel}]`);
    if (d.kind === 'Jump') {
      lines.push('Dest = (PC & 0xf0000000) | (target×4)');
      lines.push('     = ' + where);
    } else if (convention === 'MipsDelaySlot') {
      lines.push('Dest = PC + 4 + (offset×4) = ' + where);
    } else {
      lines.push('Dest = PC + (offset×4) = ' + where);
    }
  }
  return lines;
}

// The explanation that goes with a branch in SPIM's default mode (Korean,
// then English); empty for everything else.
export function instructionNoteLines(d: DecodedInstruction, convention: BranchConvention): string[] {
  if (d.hasDestination && d.kind === 'Branch' && convention === 'SpimNoDelaySlot') {
    return [
      '이 시뮬레이터의 기본 모드는 지연 분기가 없어 PC 기준으로 인코딩합니다. '
        + '교재의 MIPS(PC+4 기준)와 offset 값이 1 다릅니다.',
      "This simulator's default mode has no delayed branches and encodes from PC. "
        + 'Textbook MIPS encodes from PC+4, so its offset is 1 less.',
    ];
  }
  return [];
}
