/* A guess at the name a student meant, for the error list's hint: on the
   line the assembler could not read, a name a letter or two away from one
   it knows -- .global for .globl, .asciz for .asciiz, srll for srl -- a
   register that does not exist ($s10, $t10), or a register name without
   its $ (t0).  The most common slips of a student who comes from GNU as
   or MARS, which the core reports as "syntax error" and nothing more.

   Where it looks: the statement's first word (an instruction or a
   directive) and its operands' $-words (registers) and bare words that
   are a register's name; labels in front of the statement, numbers,
   strings and the comment are left alone.  An instruction is compared
   with instructions only, a directive with directives, a register with
   registers: a wrong guess is worse than none.

   What counts as near (nearMissRule): Damerau-Levenshtein distance 1 for
   a name of up to five characters, 2 from six on; one candidate at that
   distance, or, among those tied, the one sharing the longest prefix with
   the word, then the longest suffix (.asciz: .asciiz over .ascii) -- still
   tied, no guess.  A word of two characters or less is never guessed at
   (too many names are one letter from it). */

import { mipsDirectiveNames, mipsInstructionNames } from './mips-syntax.ts';
import { generalRegisterName } from './registers.ts';

export type NearMiss =
  | { why: 'spelling'; kind: 'directive' | 'instruction' | 'register'; token: string; meant: string }
  | { why: 'no-such-register'; token: string; family: string; range: string }
  | { why: 'missing-dollar'; token: string; meant: string };

const REGISTERS = Array.from({ length: 32 }, (_, i) => generalRegisterName(i));
const FAMILIES: Record<string, [number, number]> = { t: [0, 9], s: [0, 7], a: [0, 3], v: [0, 1], k: [0, 1] };

// The distance allowed for a word of `length` characters.
export const nearMissRule = (length: number): number => (length <= 2 ? 0 : length <= 5 ? 1 : 2);

// Damerau-Levenshtein (optimal string alignment): insert, delete,
// substitute, swap two neighbours.
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

const commonPrefix = (a: string, b: string): number => {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n += 1;
  return n;
};
const reverse = (s: string): string => [...s].reverse().join('');
const commonSuffix = (a: string, b: string): number => commonPrefix(reverse(a), reverse(b));

// The one name of `names` near `word`, or null.
export function nearest(word: string, names: readonly string[]): string | null {
  const allowed = nearMissRule(word.length);
  if (allowed === 0 || names.includes(word)) return null;
  let best: { name: string; distance: number; prefix: number; suffix: number }[] = [];
  for (const name of names) {
    const distance = editDistance(word, name);
    if (distance === 0 || distance > allowed) continue;
    const entry = { name, distance, prefix: commonPrefix(word, name), suffix: commonSuffix(word, name) };
    if (best.length === 0 || distance < best[0].distance) best = [entry];
    else if (distance === best[0].distance) best.push(entry);
  }
  if (best.length === 0) return null;
  for (const key of ['prefix', 'suffix'] as const) {
    const longest = Math.max(...best.map((b) => b[key]));
    best = best.filter((b) => b[key] === longest);
  }
  return best.length === 1 ? best[0].name : null;
}

// The line without its comment and its strings, and without the labels in
// front of the statement.
function statementOf(line: string): string {
  let s = line.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  const hash = s.indexOf('#');
  if (hash >= 0) s = s.slice(0, hash);
  return s.replace(/^\s*(?:[A-Za-z_.$][\w.$]*\s*:\s*)+/, '').trim();
}

export function nearMiss(sourceLine: string): NearMiss | null {
  const statement = statementOf(sourceLine);
  if (statement === '') return null;
  const words = statement.split(/[\s,()]+/).filter(Boolean);
  const [first, ...operands] = words;
  // The instruction or directive.
  if (first.startsWith('.')) {
    const meant = nearest(first, mipsDirectiveNames());
    if (meant) return { why: 'spelling', kind: 'directive', token: first, meant };
  } else if (/^[A-Za-z][\w.]*$/.test(first)) {
    const meant = nearest(first.toLowerCase(), mipsInstructionNames());
    if (meant) return { why: 'spelling', kind: 'instruction', token: first, meant };
  }
  // The registers among the operands.
  for (const w of operands) {
    if (w.startsWith('$')) {
      if (REGISTERS.includes(w) || /^\$(?:[0-9]|[12][0-9]|3[01])$/.test(w) || /^\$f(?:[0-9]|[12][0-9]|3[01])$/.test(w)) continue;
      const family = /^\$([a-z])(\d+)$/.exec(w);
      if (family && family[1] in FAMILIES) {
        const [lo, hi] = FAMILIES[family[1]];
        const n = Number(family[2]);
        if (n < lo || n > hi) return { why: 'no-such-register', token: w, family: `$${family[1]}`, range: `$${family[1]}${lo}–$${family[1]}${hi}` };
      }
      const number = /^\$(\d+)$/.exec(w);
      if (number) return { why: 'no-such-register', token: w, family: '$0', range: '$0–$31' };
      const meant = nearest(w.toLowerCase(), REGISTERS);
      if (meant) return { why: 'spelling', kind: 'register', token: w, meant };
    } else if (/^[a-z][a-z0-9]*$/.test(w) && REGISTERS.includes(`$${w}`)) {
      return { why: 'missing-dollar', token: w, meant: `$${w}` };
    }
  }
  return null;
}
