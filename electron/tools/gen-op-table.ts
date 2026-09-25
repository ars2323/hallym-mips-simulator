/* Writes src/core/op-table.ts from CPU/op.h, the core's keyword table.

     node tools/gen-op-table.ts            write it
     node tools/gen-op-table.ts --check    exit 1 if it is not up to date

   The Qt build compiled op.h in with a macro (QtSpim/edu/core/
   edu_mips_syntax.cpp); a TS module cannot include a C header, so the table
   is generated and tests/core/mips-syntax.test.ts runs --check's comparison.
*/

import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);

export function renderOpTable(opH: string): string {
  // OP("name", Y_..._OP, TYPE, encoding)   optionally   /* MIPS32 Rev 2 */
  // Over the whole text, since some entries are wrapped onto two lines.
  const entry = /OP\("([^"]+)",\s*\w+,\s*(\w+),\s*(-?\w+)\)([^\n]*)/g;
  const rows = [...opH.matchAll(entry)].map((m) => {
    const encoding = m[3] === '-1' ? -1 : Number(m[3]);
    const release2 = m[4].includes('MIPS32 Rev 2');
    return `  [${JSON.stringify(m[1])}, '${m[2]}', ${encoding === -1 ? -1 : '0x' + encoding.toString(16).padStart(8, '0')}, ${release2}],`;
  });
  return `/* GENERATED from CPU/op.h by tools/gen-op-table.ts -- do not edit.

   The core's keyword table: every mnemonic and directive the assembler
   knows, with op.h's operand-shape type, its encoding (-1 for directives
   and pseudo instructions) and whether op.h marks it MIPS32 Release 2
   (which SPIM's parser refuses).
*/

export type OpEntry = readonly [name: string, type: string, encoding: number, release2: boolean];

export const OP_TABLE: readonly OpEntry[] = [
${rows.join('\n')}
];
`;
}

if (import.meta.main) {
  const expected = renderOpTable(readFileSync(new URL('../CPU/op.h', root), 'latin1'));
  const target = new URL('src/core/op-table.ts', root);
  if (process.argv.includes('--check')) {
    const current = readFileSync(target, 'utf8');
    if (current !== expected) {
      console.error('src/core/op-table.ts is out of date: run node tools/gen-op-table.ts');
      process.exit(1);
    }
  } else {
    writeFileSync(target, expected);
  }
}
