/* The tutorial's two examples (src/examples/) have what its twenty steps
   point at: a big constant that becomes lui + ori (step 4), an R-type add
   right after two small li (steps 5-9), a word in .data that sw changes
   (step 12), $sp moved (step 13), output through syscall 4 (step 18), a
   run that ends; and a second file with exactly one error (step 19). */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import * as spim from '../../native/index.ts';
import { parseSymbolListing } from '../../src/core/symbols.ts';
import { textRows } from '../../src/renderer/app/logic/machine.ts';

const root = path.join(import.meta.dirname, '..', '..');
const source = (name: string) => readFileSync(path.join(root, 'src/examples', name), 'utf8');
const lineOf = (text: string, re: RegExp) => text.split('\n').findIndex((l) => re.test(l)) + 1;

test('tutorial.s: about thirty lines; li of a big constant is lui + ori; add is R-type after two li', () => {
  const text = source('tutorial.s');
  assert.ok(text.trimEnd().split('\n').length <= 32);
  const r = spim.assemble(text);
  assert.ok(r.ok, r.errors.join(''));
  const rows = textRows(spim.textSegment()).filter((w) => !w.kernel);
  // The words of a source line: its first (which carries the line), then
  // those after it that carry none.
  const at = (re: RegExp) => {
    const i = rows.findIndex((w) => w.line === lineOf(text, re));
    let j = i + 1;
    while (j < rows.length && rows[j].line === 0) j += 1;
    return rows.slice(i, j);
  };
  assert.deepEqual(at(/li\s+\$t0, 0x12345678/).map((w) => w.disassembly.split(' ')[0]), ['lui', 'ori']);
  const add = at(/add\s+\$t3/);
  assert.equal(add.length, 1);
  assert.equal(add[0].word >>> 26, 0, 'R-type: opcode 0');
  const main = parseSymbolListing(r.symbols).find((s) => s.name === 'main')!.address;
  assert.equal(add[0].addr, main + 8, 'two one-word li before it');
});

test('tutorial.s: sw changes total, $sp moves and comes back, "sum = 12" is printed, the run ends', () => {
  const r = spim.assemble(source('tutorial.s'));
  const labels = Object.fromEntries(parseSymbolListing(r.symbols).map((s) => [s.name, s.address]));
  const sp = spim.registers().general[29];
  assert.equal(spim.readWords(labels.total, 1)[0], 0);
  assert.equal(spim.run(100000), 'exit');
  assert.equal(spim.readWords(labels.total, 1)[0], 12);
  assert.equal(spim.registers().general[29], sp);
  assert.equal(Buffer.from(spim.consoleOutput()).toString(), 'sum = 12');
});

test('tutorial-error.s: a handful of lines, one error, on the srll line', () => {
  const text = source('tutorial-error.s');
  assert.ok(text.trimEnd().split('\n').length <= 7);
  const r = spim.assemble(text);
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], new RegExp(`line ${lineOf(text, /srll/)}\\b`));
});
