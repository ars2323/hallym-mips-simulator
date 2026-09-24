/* Shows that the tests catch a wrong module, before they are trusted to say
   a right one is right.

     node tools/mutants.ts [FILTER]

   Each mutant below changes one thing in one file -- the text `find` must
   occur exactly once -- in a copy of src/, tests/, tools/ and native/'s
   sources in a temporary directory (the built addon, CPU/ and node_modules/
   are linked, not copied), and
   runs the tests named for it there.  A mutant is KILLED when those tests
   fail; one that survives, or does not apply, fails this script.  Nothing in
   the working tree is touched.
*/

import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');

interface Mutant {
  module: string;
  file: string;
  find: string;
  replace: string;
  tests: string[];
  what: string;
}

const MUTANTS: Mutant[] = [
  // ---- decoder
  { module: 'decoder', file: 'src/core/decoder.ts', what: 'rt taken from bit 17',
    find: 'rt: (word >>> 16) & 0x1f,', replace: 'rt: (word >>> 17) & 0x1f,', tests: ['tests/core/decoder.test.ts'] },
  { module: 'decoder', file: 'src/core/decoder.ts', what: 'addiu named addi',
    find: "[0x09, 'addiu', 'Plain']", replace: "[0x09, 'addi', 'Plain']", tests: ['tests/core/decoder.test.ts'] },
  { module: 'decoder', file: 'src/core/decoder.ts', what: 'SPECIAL2 formatted as I',
    find: '    case 0x00:\n    case 0x1c:\n      return \'R\';', replace: '    case 0x00:\n      return \'R\';',
    tests: ['tests/core/decoder.test.ts'] },
  // ---- registers
  { module: 'registers', file: 'src/core/registers.ts', what: '$t8 and $t9 swapped',
    find: "'s6', 's7', 't8', 't9',", replace: "'s6', 's7', 't9', 't8',", tests: ['tests/core/registers.test.ts'] },
  { module: 'registers', file: 'src/core/registers.ts', what: 'Cause numbered 14',
    find: 'export const CP0_CAUSE = 13;', replace: 'export const CP0_CAUSE = 14;', tests: ['tests/core/registers.test.ts'] },
  { module: 'registers', file: 'src/core/registers.ts', what: '"r32" accepted',
    find: 'Number(digits) <= 31', replace: 'Number(digits) <= 32', tests: ['tests/core/registers.test.ts'] },
  // ---- format
  { module: 'format', file: 'src/core/format.ts', what: 'nibbles joined with _',
    find: ".match(/.{4}/g)!.join(' ')", replace: ".match(/.{4}/g)!.join('_')", tests: ['tests/core/format.test.ts'] },
  { module: 'format', file: 'src/core/format.ts', what: 'decimal below INT32_MIN accepted',
    find: 'parsed < -2147483648n', replace: 'parsed < -2147483649n', tests: ['tests/core/format.test.ts'] },
  { module: 'format', file: 'src/core/format.ts', what: 'signed decimal printed unsigned',
    find: 'String(value | 0)', replace: 'String(value >>> 0)', tests: ['tests/core/format.test.ts'] },
  // ---- instruction-text
  { module: 'instruction-text', file: 'src/core/instruction-text.ts', what: 'immediate value shown unsigned',
    find: "field.name === 'immediate' ? String(d.simm)", replace: "field.name === 'immediate' ? String(d.imm)",
    tests: ['tests/core/instruction-text.test.ts'] },
  { module: 'instruction-text', file: 'src/core/instruction-text.ts', what: 'rs meaning off by one',
    find: "return generalRegisterName(v);\n      break;\n    case 'Cp0':",
    replace: "return generalRegisterName(field.name === 'rs' ? (v + 1) % 32 : v);\n      break;\n    case 'Cp0':",
    tests: ['tests/core/instruction-text.test.ts'] },
  { module: 'instruction-text', file: 'src/core/instruction-text.ts', what: 'jump destination label dropped',
    find: "(destinationLabel === '' ? '' : ` [${destinationLabel}]`)", replace: "''",
    tests: ['tests/core/instruction-text.test.ts'] },
  // ---- source-text
  { module: 'source-text', file: 'src/core/source-text.ts', what: 'statement keeps the colon',
    find: 'source.slice(colon + 1).trim()', replace: 'source.slice(colon).trim()', tests: ['tests/core/source-text.test.ts'] },
  { module: 'source-text', file: 'src/core/source-text.ts', what: 'thirteen digits taken as a line number',
    find: 'm[1].length > 9', replace: 'm[1].length > 13', tests: ['tests/core/source-text.test.ts'] },
  // ---- symbols
  { module: 'symbols', file: 'src/core/symbols.ts', what: 'address read as decimal',
    find: 'address: parseInt(m[3], 16)', replace: 'address: parseInt(m[3], 10)', tests: ['tests/core/symbols.test.ts'] },
  { module: 'symbols', file: 'src/core/symbols.ts', what: 'undefined (address 0) labels kept',
    find: "if (name === '' || address === 0) return;", replace: "if (name === '') return;",
    tests: ['tests/core/symbols.test.ts'] },
  // ---- memory-rows
  { module: 'memory-rows', file: 'src/core/memory-rows.ts', what: 'three zero words make a run',
    find: 'if (zeros >= 4) {', replace: 'if (zeros >= 3) {', tests: ['tests/core/memory-rows.test.ts'] },
  { module: 'memory-rows', file: 'src/core/memory-rows.ts', what: 'no short first line',
    find: 'if (from % LINE === 0 || from >= to) return from;', replace: 'if (from % WORD === 0 || from >= to) return from;',
    tests: ['tests/core/memory-rows.test.ts'] },
  { module: 'memory-rows', file: 'src/core/memory-rows.ts', what: 'goldens: zero runs one word short',
    find: "rows.push({ kind: 'ZeroRun', address: i, words: zeros });",
    replace: "rows.push({ kind: 'ZeroRun', address: i, words: zeros - 1 });",
    tests: ['tests/golden/qt.test.ts'] },
  // ---- memory-text
  { module: 'memory-text', file: 'src/core/memory-text.ts', what: "'~' shown as '.'",
    find: 'c >= 0x20 && c <= 0x7e', replace: 'c >= 0x20 && c < 0x7e', tests: ['tests/core/memory-text.test.ts'] },
  { module: 'memory-text', file: 'src/core/memory-text.ts', what: 'bytes and halves unsigned in decimal',
    find: 'return String(v & (1 << (bits - 1)) ? v - (1 << bits) : v);', replace: 'return String(v);',
    tests: ['tests/core/memory-text.test.ts'] },
  { module: 'memory-text', file: 'src/core/memory-text.ts', what: 'goldens: space shown as .',
    find: 'c >= 0x20 && c <= 0x7e', replace: 'c > 0x20 && c <= 0x7e', tests: ['tests/golden/qt.test.ts'] },
  // ---- mips-syntax
  { module: 'mips-syntax', file: 'src/core/mips-syntax.ts', what: 'first keyword lost',
    find: 'new Map(OP_TABLE.map(', replace: 'new Map(OP_TABLE.slice(1).map(', tests: ['tests/core/mips-syntax.test.ts'] },
  { module: 'mips-syntax', file: 'src/core/mips-syntax.ts', what: "names may not start with '.'",
    find: '/^[A-Za-z_.]$/', replace: '/^[A-Za-z_]$/', tests: ['tests/core/mips-syntax.test.ts'] },
  { module: 'mips-syntax', file: 'src/core/op-table.ts', what: 'generated table edited by hand',
    find: '["add", \'R3_TYPE_INST\'', replace: '["addd", \'R3_TYPE_INST\'', tests: ['tests/core/mips-syntax.test.ts'] },
  // ---- asm-errors
  { module: 'asm-errors', file: 'src/core/asm-errors.ts', what: 'first " on line " taken as the location',
    find: '/^spim: \\(parser\\) (.*) on line', replace: '/^spim: \\(parser\\) (.*?) on line',
    tests: ['tests/core/asm-errors.test.ts'] },
  { module: 'asm-errors', file: 'src/core/asm-errors.ts', what: 'quoted source not trimmed',
    find: "!lines[1].includes('^') ? lines[1].trim() : ''", replace: "!lines[1].includes('^') ? lines[1] : ''",
    tests: ['tests/core/asm-errors.test.ts'] },
  { module: 'asm-errors', file: 'src/core/asm-errors.ts', what: 'search goes down instead of up',
    find: 'for (let line = from; line >= 1 && line > from - 200; line -= 1) {',
    replace: 'for (let line = 1; line <= from; line += 1) {', tests: ['tests/core/asm-errors.test.ts'] },
  // ---- text-file (Node side)
  { module: 'text-file', file: 'src/node/text-file.ts', what: 'byte order mark not noted',
    find: '    byteOrderMark = true;\n    bytes = bytes.subarray(3);', replace: '    bytes = bytes.subarray(3);',
    tests: ['tests/node/text-file.test.ts'] },
  { module: 'text-file', file: 'src/node/text-file.ts', what: 'anything not UTF-8 taken for CP949',
    find: 'if (sameBytes(iconv.encode(korean, \'cp949\'), bytes)) {', replace: 'if (true) {',
    tests: ['tests/node/text-file.test.ts'] },
  { module: 'text-file', file: 'src/node/text-file.ts', what: 'CRLF counted as LF',
    find: "lineEnd: crlf > lf ? 'CRLF' : 'LF'", replace: "lineEnd: 'LF'", tests: ['tests/node/text-file.test.ts'] },
  // ---- the Node boundary
  { module: 'native/index.ts', file: 'native/index.ts', what: 'default argv[0] changed',
    find: "Object.freeze(['program.s'])", replace: "Object.freeze(['prog.s'])",
    tests: ['tests/golden/default.test.ts', 'tests/node/run-parameters.test.ts'] },
  { module: 'native/index.ts', file: 'native/index.ts', what: 'bytes passed on undecoded',
    find: '    text = decoded.text;', replace: "    text = Buffer.from(source).toString('latin1');",
    tests: ['tests/node/encoding.test.ts'] },
  { module: 'native/index.ts', file: 'native/index.ts', what: 'process environment leaks in by default',
    find: 'env: Object.freeze([]) });', replace: "env: Object.freeze(['HOME=' + (process.env.HOME ?? '')]) });",
    tests: ['tests/node/run-parameters.test.ts'] },
  // ---- the golden harness itself
  { module: 'qt goldens', file: 'tests/golden/qt.test.ts', what: 'capture environment in another order',
    find: "env: ['QT_QPA_PLATFORM=offscreen', 'HOME=/nonexistent',", replace: "env: ['HOME=/nonexistent', 'QT_QPA_PLATFORM=offscreen',",
    tests: ['tests/golden/qt.test.ts'] },
  { module: 'qt goldens', file: 'tests/golden/qt.test.ts', what: "a pinned source line's Qt text changed",
    find: "qt: '; 3577: _str)'", replace: "qt: '; 3577: _str'", tests: ['tests/golden/qt.test.ts'] },
  { module: 'qt goldens', file: 'tests/golden/qt.test.ts', what: "a pinned source line's own text changed",
    find: "ours: '; 1155: mtlo $0'", replace: "ours: '; 1155: mtlo $1'", tests: ['tests/golden/qt.test.ts'] },
];

function copyTree(dir: string): void {
  for (const d of ['src', 'tests', 'tools']) cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  for (const f of ['package.json', 'tsconfig.json']) cpSync(path.join(root, f), path.join(dir, f));
  cpSync(path.join(root, 'native'), path.join(dir, 'native'), {
    recursive: true, filter: (from) => !from.startsWith(path.join(root, 'native', 'build')),
  });
  symlinkSync(path.join(root, 'native', 'build'), path.join(dir, 'native', 'build'));
  for (const l of ['CPU', 'node_modules']) symlinkSync(path.join(root, l), path.join(dir, l));
}

const filter = process.argv[2] ?? '';
const selected = MUTANTS.filter((m) => `${m.module} ${m.what}`.includes(filter));
let bad = 0;
const rows: string[] = [];
for (const m of selected) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'mutant-'));
  try {
    copyTree(dir);
    const file = path.join(dir, m.file);
    const text = readFileSync(file, 'utf8');
    const count = text.split(m.find).length - 1;
    if (count !== 1) {
      rows.push(`NOT APPLIED  ${m.module}: ${m.what} (found ${count} times)`);
      bad += 1;
      continue;
    }
    writeFileSync(file, text.replace(m.find, m.replace));
    const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...m.tests],
                          { cwd: dir, encoding: 'utf8', timeout: 300000 });
    const firstFailure = /^\s*not ok \d+ - (.*)$/m.exec(run.stdout)?.[1] ?? '(no test reported a failure)';
    if (run.status === 0) {
      rows.push(`SURVIVED     ${m.module}: ${m.what}`);
      bad += 1;
    } else {
      rows.push(`killed       ${m.module}: ${m.what}  <-  ${firstFailure}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
console.log(rows.join('\n'));
console.log(`\n${selected.length - bad} of ${selected.length} mutants killed`);
process.exit(bad === 0 ? 0 : 1);
