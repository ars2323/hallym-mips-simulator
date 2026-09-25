/* The window's pure logic (src/renderer/app/logic): which Text rows are in
   the DOM, which registers count as changed, what a stop means. */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  changedKeys, parseCoreLine, registerRows, stateAfter, textRows, type RegisterValues,
} from '../../src/renderer/app/logic/machine.ts';
import { scrollToShow, visibleRange } from '../../src/renderer/app/logic/virtual.ts';

test('visibleRange: the rows in view and ten on each side, clipped to the list', () => {
  assert.deepEqual(visibleRange(0, 220, 22, 4758), { first: 0, last: 20 });
  assert.deepEqual(visibleRange(2200, 220, 22, 4758), { first: 90, last: 120 });
  assert.deepEqual(visibleRange(2200 + 11, 220, 22, 4758), { first: 90, last: 121 }); // a row half in view counts
  assert.deepEqual(visibleRange(22 * 4750, 220, 22, 4758), { first: 4740, last: 4758 });
  assert.deepEqual(visibleRange(0, 220, 22, 0), { first: 0, last: 0 });
  assert.deepEqual(visibleRange(0, 220, 22, 5, 0), { first: 0, last: 5 });
});

test('scrollToShow: moves only as far as needed, with a margin of two rows', () => {
  assert.equal(scrollToShow(10, 0, 440, 22), 0);               // already in view
  assert.equal(scrollToShow(30, 0, 440, 22), (30 + 3) * 22 - 440); // below: bottom edge plus margin
  assert.equal(scrollToShow(5, 400, 440, 22), 3 * 22);         // above: top edge minus margin
  assert.equal(scrollToShow(0, 400, 440, 22), 0);              // never negative
  assert.equal(scrollToShow(17, 0, 440 - 300, 22), (17 + 3) * 22 - 140); // a sheet covering 300 px
});

const regs = (patch: Partial<RegisterValues> = {}, general: Record<number, number> = {}): RegisterValues => {
  const g = new Array(32).fill(0);
  for (const [n, v] of Object.entries(general)) g[Number(n)] = v;
  return { pc: 0x00400000, hi: 0, lo: 0, epc: 0, cause: 0, badVAddr: 0, status: 0, general: g, fp: new Array(32).fill(0), ...patch };
};

test('changedKeys: registers that differ from the last stop, PC left out', () => {
  assert.deepEqual([...changedKeys(null, regs())], []);
  assert.deepEqual([...changedKeys(regs(), regs({ pc: 0x00400004 }, { 8: 5 }))], ['$t0']);
  assert.deepEqual([...changedKeys(regs(), regs({ hi: 1, cause: 0x24 }, { 29: 4 }))].sort(), ['$sp', 'Cause', 'HI']);
});

test('registerRows: panel order, CP0 only when asked', () => {
  const rows = registerRows(regs({}, { 2: 10 }));
  assert.deepEqual(rows.slice(0, 6).map((r) => r.key), ['PC', 'HI', 'LO', '$zero', '$v0', '$v1']);
  // Every general register once; $zero a constant and $ra the return address,
  // not "Reserved" and "Pointers" as in the Qt build's grouping.
  const general = rows.filter((r) => r.key.startsWith('$')).map((r) => r.key);
  assert.equal(new Set(general).size, 32);
  const groupOf = (k: string) => rows.find((r) => r.key === k)!.group;
  assert.deepEqual(['$zero', '$at', '$k0', '$gp', '$sp', '$fp', '$ra', '$t9'].map(groupOf),
                   ['Constant', 'Reserved', 'Reserved', 'Pointers', 'Pointers', 'Pointers', 'Return address', 'Temporaries']);
  assert.equal(rows.find((r) => r.key === '$v0')!.value, 10);
  assert.equal(rows.some((r) => r.group === 'CP0'), false);
  assert.equal(registerRows(regs(), true).filter((r) => r.group === 'CP0').length, 4);
  assert.equal(registerRows(regs({}, { 8: -1 }))[registerRows(regs()).findIndex((r) => r.key === '$t0')].value, 0xffffffff);
});

test('stateAfter: what each stop leaves the controls in', () => {
  assert.equal(stateAfter('exit'), 'finished');
  assert.equal(stateAfter('error'), 'finished');
  assert.equal(stateAfter('input'), 'input');
  assert.equal(stateAfter('breakpoint'), 'paused');
  assert.equal(stateAfter('stopped'), 'paused');
  assert.equal(stateAfter('limit'), 'paused');
});

test('textRows: core lines split, pseudo instructions banded, kernel marked', () => {
  assert.deepEqual(parseCoreLine('[0x00400000]\t0x8fa40000  lw $4, 0($29)                   ; 183: lw $a0 0($sp) # argc'),
                   { disassembly: 'lw $4, 0($29)', source: '183: lw $a0 0($sp) # argc' });
  const rows = textRows([
    { addr: 0x00400024, word: 0x3c01f0f0, line: '[0x00400024]\t0x3c01f0f0  lui $1, -3856                   ; 6: li $t0, 0xF0F0F0F0', breakpoint: false },
    { addr: 0x00400028, word: 0x3428f0f0, line: '[0x00400028]\t0x3428f0f0  ori $8, $1, -3856', breakpoint: true },
    { addr: 0x0040002c, word: 0x01095024, line: '[0x0040002c]\t0x01095024  and $10, $8, $9                 ; 8: and $t2, $t0, $t1', breakpoint: false },
    { addr: 0x80000180, word: 0x0001d821, line: '[0x80000180]\t0x0001d821  addu $27, $0, $1                ; 90: move $k1 $at', breakpoint: false },
  ]);
  assert.deepEqual(rows.map((r) => [r.line, r.source, r.band, r.kernel, r.breakpoint, r.format]), [
    [6, 'li $t0, 0xF0F0F0F0', true, false, false, 'I'],
    [0, '', true, false, true, 'I'],
    [8, 'and $t2, $t0, $t1', false, false, false, 'R'],
    [90, 'move $k1 $at', false, true, false, 'R'],
  ]);
});
