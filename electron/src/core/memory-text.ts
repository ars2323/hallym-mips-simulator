/* Text for the Data panel's cells and for the inspector's view of a memory
   word, and the reading of what is typed into the panel's "Go to" box.  A
   port of the Qt build's QtSpim/edu/core/edu_memory_text.{h,cpp}.

   Values arrive already read from the core at the right granularity (word /
   half / byte), so nothing here assumes a byte order; bytes are always
   given in memory order, lowest address first.
*/

import { bin32Grouped, bitRuler32, hex32, signedDec32, unsignedDec32 } from './format.ts';
import { findRegister, type RegisterRef } from './registers.ts';
import type { LabelMap } from './symbols.ts';

export type MemoryUnit = 1 | 2 | 4; // bytes: byte, half word, word

export function memoryUnitName(unit: MemoryUnit): string {
  switch (unit) {
    case 1: return 'Bytes';
    case 2: return 'Half words';
    default: return 'Words';
  }
}

// One value of `unit` bytes in the Data Segment menu's base:
//   16: zero-padded hex digits, no prefix ("6c6c6548", "6548", "48")
//   10: signed decimal of that width (a byte 0xff is -1)
//    2: zero-padded binary digits
export function memoryValueText(value: number, unit: MemoryUnit, base: number): string {
  const bits = 8 * unit;
  const v = bits === 32 ? value >>> 0 : (value >>> 0) & ((1 << bits) - 1);
  if (base === 10) {
    if (bits === 32) return String(v | 0);
    return String(v & (1 << (bits - 1)) ? v - (1 << bits) : v);
  }
  if (base === 2) return v.toString(2).padStart(bits, '0');
  return v.toString(16).padStart(bits / 4, '0');
}

// Widest text memoryValueText() can produce, for column sizing.
export function memoryValueWidth(unit: MemoryUnit, base: number): number {
  const bits = 8 * unit;
  if (base === 2) return bits;
  if (base === 10) return unit === 4 ? 11 : unit === 2 ? 6 : 4; // "-2147483648"
  return bits / 4;
}

// "+0", "+4", "+8", "+C": a byte offset inside a 16-byte line, as the column
// headers and the Labels column name it (one upper-case hex digit).
export const lineOffsetName = (offset: number): string => '+' + (offset & 15).toString(16).toUpperCase();

// "msg" for offset 0, otherwise "msg+2": a label or register that points
// `offset` bytes into a word.
export const nameWithOffset = (name: string, offset: number): string => (offset === 0 ? name : `${name}+${offset}`);

// Bytes as characters: printable ASCII as itself, everything else '.'.
export function asciiText(bytes: ArrayLike<number>): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 1) {
    const c = bytes[i];
    text += c >= 0x20 && c <= 0x7e ? String.fromCharCode(c) : '.';
  }
  return text;
}

// The inspector's lines for one memory word.
//   address   of the word (word aligned)
//   value     the word
//   bytes     its four bytes in memory order
//   labels    labels at the word's four addresses, as "name" or "name+2"
//   segment   "User data", "User stack", "Kernel data"
//   pointers  registers whose value lies in the word, as "$sp" or "$t0+1"
export function memoryDetailLines(address: number, value: number, bytes: ArrayLike<number>,
                                  labels: readonly string[], segment: string,
                                  pointers: readonly string[]): string[] {
  const heading = [hex32(address)];
  if (labels.length > 0) heading.push(labels.join(', '));
  if (segment !== '') heading.push(segment);
  const byteTexts = Array.from({ length: 4 }, (_, i) => memoryValueText(bytes[i], 1, 16));
  const lines = [
    heading.join(' | '),
    'Hex       ' + hex32(value),
    'Signed    ' + signedDec32(value),
    'Unsigned  ' + unsignedDec32(value),
    bitRuler32(),
    bin32Grouped(value),
    `Bytes     ${byteTexts.join(' ')}  "${asciiText(Array.from({ length: 4 }, (_, i) => bytes[i]))}"`,
  ];
  if (pointers.length > 0) lines.push('Pointers  ' + pointers.join(', '));
  return lines;
}

// What the text in the Go To box means.
export type GoToTarget =
  | { kind: 'Invalid' }
  | { kind: 'Address'; address: number }
  | { kind: 'Register'; reg: RegisterRef } // the caller reads its value
  | { kind: 'Label'; address: number; label: string };

// In this order: "$name" / "$number" is a register; a known label is that
// label; "0x..." or bare hex digits is an address; a register name without
// the "$" ("sp") is a register.
export function resolveGoTo(input: string, labels: LabelMap): GoToTarget {
  const text = input.trim();
  if (text === '') return { kind: 'Invalid' };
  if (text.startsWith('$')) {
    const r = findRegister(text);
    return r ? { kind: 'Register', reg: r } : { kind: 'Invalid' };
  }
  const labelled = labels.find(text);
  if (labelled !== undefined) return { kind: 'Label', address: labelled, label: text };
  const digits = /^0x/i.test(text) ? text.slice(2) : text;
  if (/^[0-9a-fA-F]{1,8}$/.test(digits)) return { kind: 'Address', address: parseInt(digits, 16) >>> 0 };
  const r = findRegister(text);
  return r ? { kind: 'Register', reg: r } : { kind: 'Invalid' };
}
