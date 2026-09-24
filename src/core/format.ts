/* The one place 32-bit values are turned into text (and back).  A port of
   the Qt build's QtSpim/edu/core/edu_format.{h,cpp}.

   Views never format numbers themselves.  Everything here takes the value
   as the raw 32-bit register or memory word (any JS number; only its low 32
   bits count) and says in its name how the bits are interpreted.
*/

const u32 = (value: number): number => value >>> 0;

// "8fa40000": eight lower-case digits, no prefix, as the Text and Data
// windows have always shown addresses and words.
export const hex32Digits = (value: number): string => u32(value).toString(16).padStart(8, '0');

// "0x0040000c": always 0x + 8 lower-case digits.
export const hex32 = (value: number): string => '0x' + hex32Digits(value);

// Two's-complement signed / plain unsigned decimal, no padding.
export const signedDec32 = (value: number): string => String(value | 0);
export const unsignedDec32 = (value: number): string => String(u32(value));

// "00000000010000000000000000001100"
export const bin32 = (value: number): string => u32(value).toString(2).padStart(32, '0');

// "0000 0000 0100 0000 0000 0000 0000 1100": nibbles, most significant first.
export const bin32Grouped = (value: number): string => bin32(value).match(/.{4}/g)!.join(' ');

// A ruler for bin32Grouped() in a fixed-width font:
// "31   27   23   19   15   11   7    3" -- the number of each nibble's most
// significant bit, starting in the column of that nibble's first digit.
export function bitRuler32(): string {
  let ruler = '';
  for (let nibble = 0; nibble < 8; nibble += 1) ruler += String(31 - nibble * 4).padEnd(5, ' ');
  return ruler.trim();
}

// The value column of a list that follows the Registers/Data "Binary /
// Decimal / Hex" menu: 16 -> hex32, 10 -> signedDec32, 2 -> bin32Grouped.
// Any other base is treated as 16, as the upstream menu code does.
export function inBase32(value: number, base: number): string {
  switch (base) {
    case 2: return bin32Grouped(value);
    case 10: return signedDec32(value);
    default: return hex32(value);
  }
}

// Short column title for that base: "Hex", "Dec", "Bin".
export function baseName(base: number): string {
  switch (base) {
    case 2: return 'Bin';
    case 10: return 'Dec';
    default: return 'Hex';
  }
}

// Parses what a user types into the "Change Value" dialog.  Decimal input
// may be signed and must fit in 32 bits either way (-2147483648 ..
// 4294967295); hex and binary input is unsigned, and hex may carry a 0x
// prefix.  Surrounding white space is ignored.  null for anything else.
export function parseValue32(text: string, base: number): number | null {
  const t = text.trim();
  let parsed: bigint;
  if (base === 10) {
    if (!/^[+-]?\d+$/.test(t)) return null;
    parsed = BigInt(t);
    if (parsed < -2147483648n || parsed > 4294967295n) return null;
  } else if (base === 16) {
    if (!/^(0[xX])?[0-9a-fA-F]+$/.test(t)) return null;
    parsed = BigInt('0x' + t.replace(/^0[xX]/, ''));
  } else if (base === 2) {
    if (!/^[01]+$/.test(t)) return null;
    parsed = BigInt('0b' + t);
  } else {
    return null;
  }
  if (parsed > 4294967295n) return null;
  return Number(BigInt.asUintN(32, parsed));
}
