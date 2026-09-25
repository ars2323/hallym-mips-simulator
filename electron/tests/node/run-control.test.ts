/* Running, stopping and breakpoints, in this process, on native/ directly:
   the meaning of each stop reason, and the core's breakpoints kept honest.
   (tests/sim/ does the same through the simulator process.) */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as spim from '../../native/index.ts';
import { parseSymbolListing } from '../../src/core/symbols.ts';

const PROGRAM = `
	.text
	.globl main
main:	li $t0, 1
	addi $t0, $t0, 1
there:	addi $t0, $t0, 40
	li $v0, 10
	syscall
`;

function load(source = PROGRAM): Record<string, number> {
  const r = spim.assemble(source);
  assert.ok(r.ok, r.errors.join(''));
  return Object.fromEntries(parseSymbolListing(r.symbols).map((s) => [s.name, s.address]));
}

test('stop reasons: limit, then exit; a finished program starts over', () => {
  load();
  assert.equal(spim.run(1), 'limit');
  assert.equal(spim.run(1000), 'exit');
  assert.equal(spim.registers().general[8], 42);
  assert.equal(spim.run(1), 'limit', 'the next run starts the program again');
  assert.equal(spim.registers().general[8], 42, 'memory and registers are not reset by a restart, as in QtSpim');
});

test('stop reason: error', () => {
  spim.assemble('\t.text\n\t.globl main\nmain:\tnop\n'); // runs off the end of the text
  assert.equal(spim.run(1000), 'error');
  assert.match(spim.errors().join(''), /Attempt to execute non-instruction/);
});

test('a breakpoint stops before its instruction, and the run goes on from it', () => {
  const at = load().there;
  assert.equal(spim.setBreakpoint(at), true);
  assert.equal(spim.setBreakpoint(at), true, 'setting it twice is fine');
  assert.deepEqual(spim.breakpoints(), [at]);
  assert.equal(spim.run(1000), 'breakpoint');
  assert.equal(spim.registers().pc, at);
  assert.equal(spim.registers().general[8], 2, 'the instruction under it has not run');
  assert.equal(spim.run(1000), 'exit');
  assert.equal(spim.registers().general[8], 42);
  assert.deepEqual(spim.breakpoints(), [at], 'still there after running over it');
});

test('step() can go on at a breakpoint; several breakpoints are listed in order', () => {
  const l = load();
  const second = l.there + 4;
  spim.setBreakpoint(second);
  spim.setBreakpoint(l.there);
  spim.setBreakpoint(l.main);
  assert.deepEqual(spim.breakpoints(), [l.main, l.there, second]);
  assert.equal(spim.step(1000), true, 'stopped at main: the program can go on');
  assert.equal(spim.registers().pc, l.main);
  assert.equal(spim.step(1000), true);
  assert.equal(spim.registers().pc, l.there);
  assert.equal(spim.step(1000), true);
  assert.equal(spim.registers().pc, second);
  assert.equal(spim.step(1000), false, 'then the end');
});

test('single steps over a breakpoint', () => {
  const at = load().there;
  spim.setBreakpoint(at);
  // Step until something other than a plain step happens: the breakpoint.
  let stop = spim.run(1);
  for (let i = 0; i < 50 && stop === 'limit'; i += 1) stop = spim.run(1);
  assert.equal(stop, 'breakpoint');
  assert.equal(spim.registers().pc, at);
  assert.equal(spim.registers().general[8], 2);
  // The next step executes the instruction under it.
  assert.equal(spim.run(1), 'limit');
  assert.equal(spim.registers().pc, at + 4);
  assert.equal(spim.registers().general[8], 42);
  while (spim.run(1) === 'limit');
  assert.equal(spim.registers().general[8], 42);
});

test('the text segment shows the instruction under a breakpoint, flagged', () => {
  const at = load().there;
  const before = spim.textSegment().find((t) => t.addr === at)!;
  spim.setBreakpoint(at);
  const under = spim.textSegment().find((t) => t.addr === at)!;
  assert.equal(under.breakpoint, true);
  assert.equal(under.word, before.word);
  assert.equal(under.line, before.line);
  assert.equal(spim.textSegment().filter((t) => t.breakpoint).length, 1);
  assert.deepEqual(spim.breakpoints(), [at], 'looking did not move or double it');
});

test('clearing, and addresses without an instruction', () => {
  const at = load().there;
  spim.setBreakpoint(at);
  assert.equal(spim.clearBreakpoint(at), true);
  assert.equal(spim.clearBreakpoint(at), false);
  assert.deepEqual(spim.breakpoints(), []);
  assert.equal(spim.run(1000), 'exit', 'nothing stops it now');
  // Outside the text segment: refused, and -- unlike the core's own
  // add_breakpoint() there -- without raising an exception into CP0.
  const cp0 = ({ cause, badVAddr, epc, status }: spim.Registers) => ({ cause, badVAddr, epc, status });
  const before = cp0(spim.registers());
  assert.equal(spim.setBreakpoint(0x00500000), false);
  assert.match(spim.errors().join(''), /No instruction to breakpoint at address 0x00500000/);
  assert.equal(spim.setBreakpoint(at + 1), false, 'not word aligned');
  assert.equal(spim.clearBreakpoint(0x00500000), false);
  assert.deepEqual(cp0(spim.registers()), before);
  assert.throws(() => spim.setBreakpoint(-1), TypeError);
});

test('a new program drops the breakpoints', () => {
  const at = load().there;
  spim.setBreakpoint(at);
  load();
  assert.deepEqual(spim.breakpoints(), []);
  assert.equal(spim.run(1000), 'exit');
});

test('console output comes out as bytes, and only once', () => {
  spim.assemble('\t.data\nmsg:\t.asciiz "안녕\\n"\n\t.text\n\t.globl main\nmain:\tli $v0, 4\n\tla $a0, msg\n\tsyscall\n'
                + '\tli $v0, 1\n\tli $a0, -7\n\tsyscall\n\tli $v0, 10\n\tsyscall\n');
  assert.equal(spim.run(1000), 'exit');
  assert.equal(Buffer.from(spim.consoleOutput()).toString('utf8'), '안녕\n-7');
  assert.equal(spim.consoleOutput().length, 0);
});
