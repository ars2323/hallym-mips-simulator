/* Tokens of one line of SPIM assembly, for the editor's syntax
   highlighting.  A port of the Qt build's QtSpim/edu/core/
   edu_mips_syntax.{h,cpp}.

   Which words are instructions and which are directives is not decided
   here: the list is the core's own keyword table, CPU/op.h, as
   op-table.ts (generated from it).  So what the editor colours as an
   instruction is exactly what the assembler accepts as one, pseudo
   instructions included.
*/

import { OP_TABLE } from './op-table.ts';
import { findRegister } from './registers.ts';

export type SyntaxTokenKind =
  | 'Comment'         // # to the end of the line
  | 'String'          // "..." with \ escapes; 'c' character literals
  | 'Directive'       // .data .word ...      (CPU/op.h, ASM_DIR)
  | 'Instruction'     // add li syscall ...   (CPU/op.h, everything else)
  | 'Register'        // $t0 $29 $f12
  | 'LabelDefinition' // name:  at the start of the line
  | 'Identifier'      // any other name: a label being referred to
  | 'Number';         // 10 -4 0x10010000 1.5e3

export interface SyntaxToken {
  start: number;
  length: number;
  kind: SyntaxTokenKind;
}

const KEYWORD_TYPES: ReadonlyMap<string, string> = new Map(OP_TABLE.map(([name, type]) => [name, type]));

export const mipsKeywordCount = (): number => KEYWORD_TYPES.size; // entries in CPU/op.h

export function isMipsDirective(word: string): boolean { // case sensitive, as the core is
  return KEYWORD_TYPES.get(word) === 'ASM_DIR';
}

export function isMipsInstruction(word: string): boolean {
  const type = KEYWORD_TYPES.get(word);
  return type !== undefined && type !== 'ASM_DIR';
}

// The names themselves (src/core/near-miss.ts looks for the nearest).
export const mipsDirectiveNames = (): string[] => [...KEYWORD_TYPES].filter(([, t]) => t === 'ASM_DIR').map(([n]) => n);
export const mipsInstructionNames = (): string[] => [...KEYWORD_TYPES].filter(([, t]) => t !== 'ASM_DIR').map(([n]) => n);

// CPU/scanner.l: identifiers are [a-zA-Z_.][a-zA-Z0-9_.]*
const isNameStart = (c: string): boolean => /^[A-Za-z_.]$/.test(c);
const isNameChar = (c: string): boolean => /^[A-Za-z0-9_.]$/.test(c);
const isDigit = (c: string | undefined): boolean => c !== undefined && c >= '0' && c <= '9';

function isRegisterWord(word: string): boolean { // word starts with '$'
  const r = findRegister(word);
  if (r !== null && r.kind === 'General') return true;
  // $f0 .. $f31
  return /^\$f\d+$/.test(word) && Number(word.slice(2)) <= 31;
}

// Whitespace, commas, parentheses and the like produce no token.  A '$'
// word that is not a register ("$foo") and a '.' word that is not a
// directive (".Lloop", legal in a label) come out as Identifier.
export function tokenizeMipsLine(line: string): SyntaxToken[] {
  const tokens: SyntaxToken[] = [];
  const add = (start: number, end: number, kind: SyntaxTokenKind) => tokens.push({ start, length: end - start, kind });
  const n = line.length;
  let onlyLabelsSoFar = true; // a "name:" is a definition only up front
  let i = 0;
  while (i < n) {
    const c = line[i];
    if (c === '#') {
      add(i, n, 'Comment');
      break;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && line[j] !== c) j += line[j] === '\\' && j + 1 < n ? 2 : 1;
      j = Math.min(n, j + 1); // the closing quote, if there is one
      add(i, j, 'String');
      onlyLabelsSoFar = false;
      i = j;
      continue;
    }
    if (c === '$') {
      let j = i + 1;
      while (j < n && (isNameChar(line[j]) || line[j] === '$')) j += 1;
      add(i, j, isRegisterWord(line.slice(i, j)) ? 'Register' : 'Identifier');
      onlyLabelsSoFar = false;
      i = j;
      continue;
    }
    const sign = (c === '-' || c === '+') && isDigit(line[i + 1]);
    if (isDigit(c) || sign) {
      let j = i + 1;
      while (j < n && (isNameChar(line[j])
                       || ((line[j] === '-' || line[j] === '+')
                           && (line[j - 1] === 'e' || line[j - 1] === 'E')
                           && !/x/i.test(line.slice(i, j))))) {
        j += 1;
      }
      add(i, j, 'Number');
      onlyLabelsSoFar = false;
      i = j;
      continue;
    }
    if (isNameStart(c)) {
      let j = i + 1;
      while (j < n && isNameChar(line[j])) j += 1;
      const word = line.slice(i, j);
      let k = j;
      while (k < n && (line[k] === ' ' || line[k] === '\t')) k += 1;
      if (onlyLabelsSoFar && k < n && line[k] === ':') {
        add(i, k + 1, 'LabelDefinition');
        i = k + 1;
        continue;
      }
      onlyLabelsSoFar = false;
      add(i, j, isMipsDirective(word) ? 'Directive' : isMipsInstruction(word) ? 'Instruction' : 'Identifier');
      i = j;
      continue;
    }
    if (!/\s/.test(c)) onlyLabelsSoFar = false; // punctuation
    i += 1;
  }
  return tokens;
}
