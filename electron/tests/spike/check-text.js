// Check 1: assemble a program with the addon and compare every instruction
// word, address by address, with a Text-window golden from the Qt build.
//
//   node tests/spike/check-text.js [PROGRAM GOLDEN]
//
// Defaults to tests/programs/tt.core.s against tests/golden/text-ttcore.txt.
// Exits non-zero at the first difference, naming the address, both words,
// the golden's line and the program's source line there.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as spim from '../../native/index.ts';
import { readTextGolden } from './golden.js';

const root = path.join(import.meta.dirname, '..', '..');
const program = process.argv[2] || path.join(root, 'tests/programs/tt.core.s');
const goldenFile = process.argv[3] || path.join(root, 'tests/golden/text-ttcore.txt');

const hex = (n) => n.toString(16).padStart(8, '0');
const source = readFileSync(program, 'utf8');
const sourceLines = source.split('\n');

const result = spim.assemble(source);
if (!result.ok) {
  console.log(`assemble reported errors (${result.errors.length}):`);
  result.errors.forEach((e) => process.stdout.write('  ' + e));
}

const expected = readTextGolden(goldenFile);
const actual = spim.textSegment();

function fail(i, why) {
  const e = expected[i];
  const a = actual[i];
  console.log(`FAIL  ${path.basename(program)}: ${why} at entry ${i}`);
  if (e) {
    console.log(`  golden   [${hex(e.addr)}] ${hex(e.word)}   (${path.basename(goldenFile)}:${e.lineNo})`);
    console.log(`           ${e.text}`);
    // The golden's own comment names the source line ("; 183: ...");
    // an instruction expanded from a pseudo-op carries it on its first word only.
    for (let j = i; j >= 0; j--) {
      const m = /; (\d+): /.exec(expected[j].text);
      if (m) {
        const n = Number(m[1]);
        console.log(`  source   ${n}: ${sourceLines[n - 1]}   (line of [${hex(expected[j].addr)}]; the handler's lines are CPU/exceptions.s)`);
        break;
      }
    }
  }
  if (a) console.log(`  addon    [${hex(a.addr)}] ${hex(a.word)}`);
  process.exit(1);
}

const n = Math.max(expected.length, actual.length);
for (let i = 0; i < n; i++) {
  if (i >= expected.length) fail(i, 'addon has more instructions than the golden');
  if (i >= actual.length) fail(i, 'addon has fewer instructions than the golden');
  if (expected[i].addr !== actual[i].addr) fail(i, 'addresses differ');
  if (expected[i].word !== actual[i].word) fail(i, 'words differ');
}

const user = actual.filter((x) => x.addr < 0x80000000).length;
console.log(`PASS  ${path.basename(program)}: ${actual.length} instructions, every address and word identical ` +
            `(${user} user, ${actual.length - user} kernel)`);
