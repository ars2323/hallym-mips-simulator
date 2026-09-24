/* Which integer registers exist, what they are called, and how the register
   panel groups them.  A port of the Qt build's QtSpim/edu/core/
   edu_registers.{h,cpp}.

   The simulator core names the general registers "r0 at v0 ... s8 ra"
   (CPU/display-utils.cpp, int_reg_names).  Textbooks and students write
   $zero and $fp, so those two get their usual names here;
   tests/core/registers.test.ts checks every other name against the core's
   table, read through the addon.  Pure data.
*/

export type RegisterKind = 'Pc' | 'Hi' | 'Lo' | 'General' | 'Cp0';

export interface RegisterRef {
  kind: RegisterKind;
  number: number; // General: 0..31.  Cp0: coprocessor-0 register number.  Else 0.
}

export const reg = (kind: RegisterKind, number = 0): RegisterRef => ({ kind, number });
export const sameRegister = (a: RegisterRef, b: RegisterRef): boolean =>
  a.kind === b.kind && a.number === b.number;

// Same order as the core's int_reg_names; [0] and [30] are the two
// deliberate differences (r0 -> zero, s8 -> fp).
const GENERAL_NAMES = [
  'zero', 'at', 'v0', 'v1', 'a0', 'a1', 'a2', 'a3', 't0', 't1', 't2',
  't3', 't4', 't5', 't6', 't7', 's0', 's1', 's2', 's3', 's4', 's5',
  's6', 's7', 't8', 't9', 'k0', 'k1', 'gp', 'sp', 'fp', 'ra'];

// Coprocessor-0 register numbers, as in CPU/reg.h (CP0_*_Reg).
export const CP0_BADVADDR = 8;
export const CP0_STATUS = 12;
export const CP0_CAUSE = 13;
export const CP0_EPC = 14;

const inRange = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= 31;

// "$t0"; "$zero" for 0 and "$fp" for 30.  '' for numbers outside 0..31.
export function generalRegisterName(number: number): string {
  return inRange(number) ? '$' + GENERAL_NAMES[number] : '';
}

// The core's own spelling of the same register ("t0", "r0", "s8").
export function generalRegisterCoreName(number: number): string {
  if (!inRange(number)) return '';
  if (number === 0) return 'r0';
  if (number === 30) return 's8';
  return GENERAL_NAMES[number];
}

// "PC", "HI", "LO", "$t0", "Status", "Cause", "EPC", "BadVAddr".
export function registerName(r: RegisterRef): string {
  switch (r.kind) {
    case 'Pc': return 'PC';
    case 'Hi': return 'HI';
    case 'Lo': return 'LO';
    case 'General': return generalRegisterName(r.number);
    case 'Cp0':
      switch (r.number) {
        case CP0_BADVADDR: return 'BadVAddr';
        case CP0_STATUS: return 'Status';
        case CP0_CAUSE: return 'Cause';
        case CP0_EPC: return 'EPC';
        default: return '';
      }
  }
}

// The "number" column: "R8" for general registers (upstream's notation),
// "$12" for coprocessor-0 registers, '' for PC/HI/LO.
export function registerNumberLabel(r: RegisterRef): string {
  switch (r.kind) {
    case 'General': return `R${r.number}`;
    case 'Cp0': return `$${r.number}`;
    default: return '';
  }
}

// The name upstream's "Change Register Contents" prompt used: "R8", "PC",
// "Status", ...
export function registerPromptName(r: RegisterRef): string {
  return r.kind === 'General' ? `R${r.number}` : registerName(r);
}

// Looks a register up by any of its spellings, case-insensitively and with
// or without the '$': "t0", "$T0", "r8", "R8", "8", "$8", "fp", "s8", "pc",
// "status"...  null if nothing matches.
export function findRegister(spelling: string): RegisterRef | null {
  let s = spelling.trim().toLowerCase();
  if (s.startsWith('$')) s = s.slice(1);
  if (s === '') return null;
  switch (s) {
    case 'pc': return reg('Pc');
    case 'hi': return reg('Hi');
    case 'lo': return reg('Lo');
    case 'status': return reg('Cp0', CP0_STATUS);
    case 'cause': return reg('Cp0', CP0_CAUSE);
    case 'epc': return reg('Cp0', CP0_EPC);
    case 'badvaddr': return reg('Cp0', CP0_BADVADDR);
  }
  for (let n = 0; n < 32; n += 1) {
    if (s === GENERAL_NAMES[n] || s === generalRegisterCoreName(n)) return reg('General', n);
  }
  // "8", "r8"
  const digits = s.startsWith('r') ? s.slice(1) : s;
  if (/^\d+$/.test(digits) && Number(digits) <= 31) return reg('General', Number(digits));
  return null;
}

export interface RegisterGroup {
  title: string;
  description: string;
  registers: RegisterRef[];
}

const generalRange = (first: number, last: number): RegisterRef[] =>
  Array.from({ length: last - first + 1 }, (_, i) => reg('General', first + i));

// The panel's groups, in display order.  Every register appears exactly once.
export function registerGroups(): RegisterGroup[] {
  return [
    { title: 'Special', description: 'Program counter and the multiply/divide result registers',
      registers: [reg('Pc'), reg('Hi'), reg('Lo')] },
    { title: 'Return values', description: '$v0-$v1: function results; $v0 also selects the syscall',
      registers: generalRange(2, 3) },
    { title: 'Arguments', description: '$a0-$a3: the first four arguments of a call',
      registers: generalRange(4, 7) },
    { title: 'Temporaries', description: '$t0-$t9: not preserved across a call',
      registers: [...generalRange(8, 15), ...generalRange(24, 25)] },
    { title: 'Saved', description: '$s0-$s7: a callee must preserve these',
      registers: generalRange(16, 23) },
    { title: 'Pointers', description: '$gp global pointer, $sp stack pointer, '
                                    + '$fp frame pointer (= $s8), $ra return address',
      registers: generalRange(28, 31) },
    { title: 'Reserved', description: '$zero is always 0; $at belongs to the assembler; '
                                    + '$k0-$k1 belong to the exception handler',
      registers: [reg('General', 0), reg('General', 1), reg('General', 26), reg('General', 27)] },
    { title: 'CP0', description: 'Coprocessor 0: exception and interrupt state',
      registers: [reg('Cp0', CP0_STATUS), reg('Cp0', CP0_CAUSE), reg('Cp0', CP0_EPC), reg('Cp0', CP0_BADVADDR)] },
  ];
}
