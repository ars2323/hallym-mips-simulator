/* src/core/memory-rows.ts.  (a): the rows it lays out over the core's real
   memory are checked against the core's memory itself, here, and against
   the Qt build's data window row by row in tests/golden/qt.test.ts.  (b):
   the Qt build's tst_memory_rows.cpp table. */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import * as spim from '../../native/index.ts';
import { layoutMemoryRows, rowContains, rowEnd, type MemoryReader, type MemoryRow } from '../../src/core/memory-rows.ts';
import { root } from '../helpers/machine.ts';

test('rows over the core\'s memory: complete, and true to it', () => {
  spim.assemble(readFileSync(path.join(root, 'tests/samples/data-stack.s')));
  while (spim.step(100000));
  const s = spim.segments();
  const sp = spim.registers().general[29];
  for (const [from, to] of [[s.dataBot, s.dataTop], [sp - (sp % 4), s.stackTop], [s.kDataBot, s.kDataTop]]) {
    const words = spim.readWords(from, (to - from) / 4);
    const word = (a: number) => words[(a - from) / 4];
    const rows = layoutMemoryRows(from, to, { word });
    let next = from;
    for (const row of rows) {
      assert.equal(row.address, next, 'rows follow each other');
      next = rowEnd(row);
      if (row.kind === 'ZeroRun') {
        assert.ok(row.words >= 4);
        for (let a = row.address; a < next; a += 4) assert.equal(word(a), 0, `zero run word ${a.toString(16)}`);
      } else {
        assert.ok(row.words >= 1 && row.words <= 4);
        // Four zero words at a line start would have been a run.
        if (row.address % 16 === 0 && row.words === 4) {
          assert.ok([0, 4, 8, 12].some((o) => word(row.address + o) !== 0), `line ${row.address.toString(16)}`);
        }
        assert.ok(row.address % 16 === 0 || rows[0] === row || (row.address + 4 * row.words) % 16 === 0);
      }
    }
    assert.equal(next, to, 'rows cover the whole range');
  }
});

class FakeMemory implements MemoryReader {
  readonly words: Record<number, number>;
  constructor(words: Record<number, number> = {}) { this.words = words; }
  word(address: number): number { return this.words[address] ?? 0; }
}

const show = (rows: MemoryRow[]) => rows.map((r) => `${r.kind === 'ZeroRun' ? 'Z' : 'W'}${r.address.toString(16).padStart(8, '0')}x${r.words}`).join(' ');

// tests/golden/data-sample-steps12.txt.
test('user data like the golden', () => {
  const memory = new FakeMemory({
    0x10010000: 0x6c6c6548, 0x10010004: 0x64202c6f, 0x10010008: 0x21617461,
    0x10010010: 1, 0x10010014: 2, 0x10010018: 3, 0x1001001c: 0xffffffff,
    0x10010024: 0x44434241, 0x10010028: 0xabcd1234,
  });
  assert.equal(show(layoutMemoryRows(0x10000000, 0x10040000, memory)),
    'Z10000000x16384 W10010000x4 W10010010x4 W10010020x4 Z10010030x49140');
});

// Same golden: "User Stack [7fffff84]..[80000000]", first line has 3 words.
test('stack starts inside a line', () => {
  const memory = new FakeMemory({ 0x7fffff90: 0x00400018, 0x7fffff9c: 0x7fffffe6 });
  const rows = layoutMemoryRows(0x7fffff84, 0x7fffffa0, memory);
  assert.equal(show(rows), 'W7fffff84x3 W7fffff90x4');
  assert.ok(rowContains(rows[0], 0x7fffff8c));
  assert.ok(!rowContains(rows[0], 0x7fffff90));
  // An unaligned $sp is rounded up to a word, as upstream does.
  assert.equal(show(layoutMemoryRows(0x7fffff85, 0x7fffffa0, memory)), 'W7fffff88x2 W7fffff90x4');
});

test('three zeros are a line, four are a run', () => {
  const memory = new FakeMemory({ 0x1000000c: 5, 0x10000020: 7 });
  assert.equal(show(layoutMemoryRows(0x10000000, 0x10000030, memory)), 'W10000000x4 Z10000010x4 W10000020x4');
});

// A run is counted in words, not lines: it may stop mid-line, and the rest
// of that line is a short line.
test('run ends inside a line', () => {
  const memory = new FakeMemory({ 0x10000018: 9 });
  assert.equal(show(layoutMemoryRows(0x10000000, 0x10000030, memory)), 'Z10000000x6 W10000018x2 Z10000020x4');
});

test('a pinned line splits a run', () => {
  const memory = new FakeMemory();
  assert.equal(show(layoutMemoryRows(0x10000000, 0x10000040, memory, new Set([0x10000020]))),
               'Z10000000x8 W10000020x4 Z10000030x4');
  assert.equal(show(layoutMemoryRows(0x10000000, 0x10000040, memory, new Set([0x10000000]))),
               'W10000000x4 Z10000010x12');
});

test('empty, and the top of memory', () => {
  const memory = new FakeMemory();
  assert.deepEqual(layoutMemoryRows(0x10000000, 0x10000000, memory), []);
  assert.deepEqual(layoutMemoryRows(0x10000010, 0x10000000, memory), []);
  // Must terminate next to the top of the address space.
  assert.equal(show(layoutMemoryRows(0xffffffe0, 0xfffffff0, memory)), 'Zffffffe0x4');
});
