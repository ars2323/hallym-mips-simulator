/* The machine as the window shows it: register rows, text rows, and what a
   stop means for the controls.  Pure; the panels (../panels) put these on
   screen. */

import { decode, formatName } from '../../../core/decoder.ts';
import { bin32Grouped, hex32, signedDec32 } from '../../../core/format.ts';
import { reg, registerGroups, registerName, type RegisterRef } from '../../../core/registers.ts';
import { sourceLineNumber, sourceLineStatement } from '../../../core/source-text.ts';

export interface RegisterValues {
  pc: number; hi: number; lo: number; epc: number; cause: number; badVAddr: number; status: number;
  general: number[]; fp: number[];
}

export interface RegisterRow {
  key: string;     // "PC", "$t0" -- stable, for keeping one DOM row per register
  group: string;   // the group's title (WINDOW_GROUPS)
  value: number;
}

/* The window's groups.  They follow the register-use table of the course
   textbook (Patterson & Hennessy, "MIPS green card"), not the Qt build's
   panel (src/core/registers.ts registerGroups(), which this file leaves as
   the port it is): there $zero sat under Reserved and $ra under Pointers,
   and named in English the groups said what those two are not.  $zero is a
   constant, $ra the return address; each gets its own group, and every
   group's name is true of every register in it. */
const general = (...numbers: number[]): RegisterRef[] => numbers.map((n) => reg('General', n));
const range = (first: number, last: number) => general(...Array.from({ length: last - first + 1 }, (_, i) => first + i));
export const WINDOW_GROUPS: { title: string; registers: RegisterRef[] }[] = [
  { title: 'Special', registers: [reg('Pc'), reg('Hi'), reg('Lo')] },
  { title: 'Constant', registers: general(0) },                              // $zero
  { title: 'Return values', registers: range(2, 3) },                        // $v0-$v1
  { title: 'Arguments', registers: range(4, 7) },                            // $a0-$a3
  { title: 'Temporaries', registers: [...range(8, 15), ...range(24, 25)] },  // $t0-$t9
  { title: 'Saved', registers: range(16, 23) },                              // $s0-$s7
  { title: 'Pointers', registers: range(28, 30) },                           // $gp $sp $fp
  { title: 'Return address', registers: general(31) },                       // $ra
  { title: 'Reserved', registers: general(1, 26, 27) },                      // $at $k0 $k1
  { title: 'CP0', registers: registerGroups().find((g) => g.title === 'CP0')!.registers },
];

function valueOf(r: RegisterValues, key: string): number {
  switch (key) {
    case 'PC': return r.pc;
    case 'HI': return r.hi;
    case 'LO': return r.lo;
    case 'Status': return r.status;
    case 'Cause': return r.cause;
    case 'EPC': return r.epc;
    case 'BadVAddr': return r.badVAddr;
  }
  return r.general[GENERAL_INDEX[key]];
}
const GENERAL_INDEX: Record<string, number> = Object.fromEntries(
  Array.from({ length: 32 }, (_, n) => [registerName({ kind: 'General', number: n }), n]));

// The rows in display order: WINDOW_GROUPS, CP0 last.
export function registerRows(r: RegisterValues, withCp0 = false): RegisterRow[] {
  return WINDOW_GROUPS
    .filter((g) => withCp0 || g.title !== 'CP0')
    .flatMap((g) => g.registers.map((ref) => {
      const key = registerName(ref);
      return { key, group: g.title, value: valueOf(r, key) >>> 0 };
    }));
}

// Registers whose value differs from the last stop.  PC is left out: it
// moves on every step and has its own marker (the PC row in Text).
export function changedKeys(before: RegisterValues | null, now: RegisterValues): Set<string> {
  const changed = new Set<string>();
  if (before === null) return changed;
  const a = registerRows(before, true);
  const b = registerRows(now, true);
  b.forEach((row, i) => { if (row.key !== 'PC' && row.value !== a[i].value) changed.add(row.key); });
  return changed;
}

export const cells = (value: number) => ({ hex: hex32(value), dec: signedDec32(value), bin: bin32Grouped(value) });

// ---- Text rows ------------------------------------------------------------

export interface TextRow {
  addr: number;
  word: number;
  format: string;          // "R", "I", ...
  disassembly: string;     // "lw $4, 0($29)"
  line: number;            // source line, 0 if none
  source: string;          // "lw $a0 0($sp) # argc"
  kernel: boolean;
  breakpoint: boolean;
  band: boolean;           // one of several words of one source line (a pseudo instruction)
}

// "[0x00400000]\t0x8fa40000  lw $4, 0($29)   ; 183: lw $a0 0($sp) # argc"
export function parseCoreLine(line: string): { disassembly: string; source: string } {
  const m = /^\[0x[0-9a-f]{8}\]\t0x[0-9a-f]{8}  (.*)$/s.exec(line);
  const rest = m ? m[1] : line;
  const i = rest.indexOf(';');
  return i < 0 ? { disassembly: rest.trim(), source: '' } : { disassembly: rest.slice(0, i).trim(), source: rest.slice(i + 1).trim() };
}

export function textRows(words: { addr: number; word: number; line: string; breakpoint: boolean }[]): TextRow[] {
  const rows = words.map((w) => {
    const { disassembly, source } = parseCoreLine(w.line);
    return {
      addr: w.addr, word: w.word, format: formatName(decode(w.word).format), disassembly,
      line: sourceLineNumber(source), source: source ? sourceLineStatement(source) : '',
      kernel: w.addr >= 0x80000000, breakpoint: w.breakpoint, band: false,
    };
  });
  // A source line that became several words: the core keeps its text with
  // the first one only.
  rows.forEach((r, i) => {
    const next = rows[i + 1];
    if (r.source === '' && i > 0 && !r.kernel) r.band = true;
    if (r.source !== '' && next && next.source === '' && next.kernel === r.kernel) r.band = true;
  });
  return rows;
}

// ---- what a stop means for the window ---------------------------------------

export type StopReason = 'exit' | 'error' | 'breakpoint' | 'input' | 'stopped' | 'limit';
export type RunState = 'ready' | 'running' | 'paused' | 'input' | 'finished';

export function stateAfter(reason: StopReason): RunState {
  switch (reason) {
    case 'exit':
    case 'error': return 'finished';
    case 'input': return 'input';
    default: return 'paused';
  }
}

// The status bar's words for a stop.  `hex` marks code (set in the mono font).
export function stopMessage(reason: StopReason, pc: string): string {
  switch (reason) {
    case 'exit': return '프로그램이 끝났습니다';
    case 'error': return '실행 오류로 멈췄습니다';
    case 'breakpoint': return `브레이크포인트에서 멈췄습니다 (PC \`${pc}\`) — 이어서 하려면 F5`;
    case 'input': return '입력을 기다립니다 — 콘솔에 입력하고 Enter';
    case 'stopped': return `멈췄습니다 (PC \`${pc}\`) — 레지스터와 메모리를 볼 수 있습니다`;
    case 'limit': return `한 줄 실행했습니다 (PC \`${pc}\`)`;
  }
}
