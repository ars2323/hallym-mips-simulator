/* src/core/memory-text.ts.  (a): word, half-word and byte texts over the
   core's data memory, checked against the core's own byte reads
   (read_mem_byte) of the same words (read_mem_word); the character column
   is also compared with the Qt build's data window in
   tests/golden/qt.test.ts.  (b): the Qt build's tst_memory_text.cpp. */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import * as spim from '../../native/index.ts';
import { reg } from '../../src/core/registers.ts';
import {
  asciiText, lineOffsetName, memoryDetailLines, memoryValueText, memoryValueWidth, nameWithOffset, resolveGoTo,
  type MemoryUnit,
} from '../../src/core/memory-text.ts';
import { LabelMap } from '../../src/core/symbols.ts';
import { root } from '../helpers/machine.ts';

test('texts over the core\'s memory agree with its byte reads', () => {
  spim.assemble(readFileSync(path.join(root, 'tests/samples/data-stack.s')));
  while (spim.step(100000));
  const s = spim.segments();
  const count = 64;
  const words = spim.readWords(s.dataBot + 0x10000, count);
  const bytes = spim.readBytes(s.dataBot + 0x10000, 4 * count);
  let nonZero = 0;
  words.forEach((w, i) => {
    const b = [...bytes.subarray(4 * i, 4 * i + 4)];
    // The core's memory is little-endian: the word's low byte comes first.
    assert.equal(memoryValueText(w, 4, 16), b.map((x) => memoryValueText(x, 1, 16)).reverse().join(''));
    assert.equal(memoryValueText(b[0] | (b[1] << 8), 2, 16), memoryValueText(w & 0xffff, 2, 16));
    b.forEach((x) => assert.equal(memoryValueText(x, 1, 10), String((x << 24) >> 24)));
    const lines = memoryDetailLines(s.dataBot + 0x10000 + 4 * i, w, b, [], 'User data', []);
    assert.equal(lines[6], `Bytes     ${b.map((x) => memoryValueText(x, 1, 16)).join(' ')}  "${asciiText(b)}"`);
    if (w !== 0) nonZero += 1;
  });
  assert.ok(nonZero > 3);
});

test('values', () => {
  const table: [number, MemoryUnit, number, string][] = [
    [0x6c6c6548, 4, 16, '6c6c6548'], [0, 4, 16, '00000000'], [0xffffffff, 4, 10, '-1'],
    [0x80000000, 4, 10, '-2147483648'], [0x7fffffff, 4, 10, '2147483647'],
    [5, 4, 2, '00000000000000000000000000000101'],
    [0xabcd, 2, 16, 'abcd'], [0xabcd, 2, 10, '-21555'], [0x1234, 2, 10, '4660'], [0x8001, 2, 2, '1000000000000001'],
    [0x41, 1, 16, '41'], [0xff, 1, 10, '-1'], [0x7f, 1, 10, '127'], [0x80, 1, 10, '-128'], [0x05, 1, 2, '00000101'],
    // A sign-extended value from the core (read_mem_byte returns an int).
    [0xffffff80, 1, 16, '80'], [0xffffabcd, 2, 16, 'abcd'],
  ];
  for (const [value, unit, base, text] of table) {
    assert.equal(memoryValueText(value, unit, base), text, `${value.toString(16)} unit ${unit} base ${base}`);
  }
});

test('widths cover the extremes', () => {
  for (const unit of [1, 2, 4] as MemoryUnit[]) {
    for (const base of [2, 10, 16]) {
      for (const s of [0, 1, 0x7f, 0x80, 0xff, 0x7fff, 0x8000, 0xffff, 0x7fffffff, 0x80000000, 0xffffffff]) {
        assert.ok(memoryValueText(s, unit, base).length <= memoryValueWidth(unit, base));
      }
    }
  }
});

test('offsets', () => {
  assert.equal(lineOffsetName(0), '+0');
  assert.equal(lineOffsetName(4), '+4');
  assert.equal(lineOffsetName(12), '+C');
  assert.equal(lineOffsetName(0x10010025 - 0x10010020), '+5');
  assert.equal(nameWithOffset('msg', 0), 'msg');
  assert.equal(nameWithOffset('$t0', 3), '$t0+3');
});

test('ascii', () => {
  const bytes = [0x48, 0x69, 0x20, 0x7e, 0x00, 0x1f, 0x7f, 0x80, 0xff, 0x3c];
  assert.equal(asciiText(bytes), 'Hi ~.....<');
  assert.equal(asciiText([]), '');
});

test('detail lines', () => {
  let lines = memoryDetailLines(0x10010000, 0x6c6c6548, [0x48, 0x65, 0x6c, 0x6c], ['msg'], 'User data', ['$a0', '$t0+1']);
  assert.equal(lines.join('\n'),
    '0x10010000 | msg | User data\n'
    + 'Hex       0x6c6c6548\n'
    + 'Signed    1819043144\n'
    + 'Unsigned  1819043144\n'
    + '31   27   23   19   15   11   7    3\n'
    + '0110 1100 0110 1100 0110 0101 0100 1000\n'
    + 'Bytes     48 65 6c 6c  "Hell"\n'
    + 'Pointers  $a0, $t0+1');
  lines = memoryDetailLines(0x7fffff84, 0, [0, 0, 0, 0], [], 'User stack', []);
  assert.equal(lines.length, 7); // no Pointers line
  assert.equal(lines[0], '0x7fffff84 | User stack');
  assert.equal(lines[6], 'Bytes     00 00 00 00  "...."');
});

test('go to', () => {
  const labels = new LabelMap();
  labels.add('msg', 0x10010000);
  labels.add('sp', 0x10010040);       // a label that looks like a register
  labels.add('deadbeef', 0x10010080); // ... and one that looks like hex
  assert.deepEqual(resolveGoTo(' $sp ', labels), { kind: 'Register', reg: reg('General', 29) });
  assert.deepEqual(resolveGoTo('$29', labels), { kind: 'Register', reg: reg('General', 29) });
  assert.deepEqual(resolveGoTo('$gp', labels), { kind: 'Register', reg: reg('General', 28) });
  assert.equal(resolveGoTo('$nosuch', labels).kind, 'Invalid');
  assert.deepEqual(resolveGoTo('msg', labels), { kind: 'Label', address: 0x10010000, label: 'msg' });
  // A label wins over a register name without "$" and over hex digits.
  assert.equal(resolveGoTo('sp', labels).kind, 'Label');
  assert.deepEqual(resolveGoTo('deadbeef', labels), { kind: 'Label', address: 0x10010080, label: 'deadbeef' });
  assert.deepEqual(resolveGoTo('0x10010004', labels), { kind: 'Address', address: 0x10010004 });
  assert.deepEqual(resolveGoTo('10010004', labels), { kind: 'Address', address: 0x10010004 });
  assert.deepEqual(resolveGoTo('7FFFFF84', labels), { kind: 'Address', address: 0x7fffff84 });
  // "a0" is hex 0xa0 unless written "$a0".
  assert.equal(resolveGoTo('a0', labels).kind, 'Address');
  assert.equal(resolveGoTo('$a0', labels).kind, 'Register');
  // Without "$" and not hex: a register name still works.
  const none = new LabelMap();
  assert.deepEqual(resolveGoTo('fp', none), { kind: 'Register', reg: reg('General', 30) });
  for (const text of ['', '0x', '123456789', 'no such label']) assert.equal(resolveGoTo(text, none).kind, 'Invalid', text);
});
