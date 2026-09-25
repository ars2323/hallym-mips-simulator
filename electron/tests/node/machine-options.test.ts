/* QtSpim's Settings, machine part (native/index.ts MachineOptions), and the
   exception handler: each option reaches the core and does what QtSpim's
   does.  Defaults are QtSpim's (tests/golden pins them). */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as spim from '../../native/index.ts';

const runAll = (limit = 50): spim.RunStop => {
  let s: spim.RunStop = 'limit';
  for (let i = 0; i < limit && s === 'limit'; i += 1) s = spim.run(100000);
  return s;
};
const reg = (n: number) => spim.registers().general[n];
const wordOf = (mnemonic: string) => spim.textSegment().find((w) => w.addr < 0x80000000 && w.line.includes(mnemonic))!.word;

test('defaults are QtSpim\'s', () => {
  assert.deepEqual(spim.DEFAULT_MACHINE,
                   { acceptPseudo: true, delayedBranches: false, delayedLoads: false, mappedIo: false, quiet: false });
});

test('pseudo instructions off: li is a syntax error', () => {
  assert.equal(spim.assemble('main: li $t0, 5\n').ok, true);
  const r = spim.assemble('main: li $t0, 5\n', { machine: { acceptPseudo: false } });
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /syntax error on line 1/);
  assert.equal(spim.assemble('main: ori $t0, $0, 5\n', { machine: { acceptPseudo: false } }).ok, true);
});

test('delayed branches: the offset is counted from PC+4', () => {
  const source = 'main: beq $0, $0, t\n nop\nt: li $v0, 10\n syscall\n';
  spim.assemble(source);
  assert.equal(wordOf('beq') & 0xffff, 2);
  spim.assemble(source, { machine: { delayedBranches: true } });
  assert.equal(wordOf('beq') & 0xffff, 1);
});

test('delayed loads: the next instruction still sees the old value', () => {
  const source = 'main: lw $t0, 0($sp)\n add $t1, $t0, $0\n li $v0, 10\n syscall\n'; // 0($sp) is argc = 1
  spim.assemble(source);
  runAll();
  assert.equal(reg(9), 1);
  spim.assemble(source, { machine: { delayedLoads: true } });
  runAll();
  assert.equal(reg(9), 0);
});

test('mapped I/O: the receiver registers see console input only when on', () => {
  const source = ['main: lui $t0, 0xffff', 'w: lw $t1, 0($t0)', ' andi $t1, $t1, 1', ' beq $t1, $0, w',
                  ' lw $t4, 4($t0)', ' li $v0, 10', ' syscall', ''].join('\n');
  spim.assemble(source, { machine: { mappedIo: true } });
  spim.provideInput('x\n');
  assert.equal(runAll(), 'exit');
  assert.equal(reg(12), 'x'.charCodeAt(0));
  spim.assemble(source);
  spim.provideInput('x\n');
  assert.equal(runAll(5), 'limit'); // polls for ever: nothing fills the receiver
});

test('quiet: no "Exception occurred" message, and the handler goes on', () => {
  const source = 'main: li $t0, 1\n lw $t1, 0($t0)\n li $v0, 10\n syscall\n';
  spim.assemble(source);
  assert.equal(runAll(), 'error');
  assert.match(spim.errors().join(''), /Exception occurred at PC=0x/);
  spim.assemble(source, { machine: { quiet: true } });
  assert.equal(runAll(), 'exit');
  assert.deepEqual(spim.errors(), []);
});

test('no exception handler: no kernel text, and the program brings its own __start', () => {
  const r = spim.assemble('  .globl __start\n__start: li $t0, 7\n li $v0, 10\n syscall\n', { handler: null });
  assert.equal(r.ok, true);
  assert.equal(spim.textSegment().filter((w) => w.addr >= 0x80000000).length, 0);
  assert.equal(runAll(), 'exit');
  assert.equal(reg(8), 7);
});

test('another exception handler, given as text', () => {
  const handler = '  .ktext 0x80000180\n  eret\n  .text\n  .globl __start\n__start: jal main\n  li $v0, 10\n  syscall\n';
  const r = spim.assemble('main: li $t0, 3\n jr $ra\n', { handler });
  assert.equal(r.ok, true);
  assert.equal(spim.textSegment().filter((w) => w.addr >= 0x80000000).length, 1);
  assert.equal(runAll(), 'exit');
  assert.equal(reg(8), 3);
});
