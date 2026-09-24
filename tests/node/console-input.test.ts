/* Console input (syscalls 5, 6, 8, 12): a read that finds no input stops
   the run with "input", leaving the machine exactly as it was just before
   the syscall; once input is provided the syscall runs again and reads it. */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as spim from '../../native/index.ts';
import { parseSymbolListing } from '../../src/core/symbols.ts';

function load(source: string): Record<string, number> {
  const r = spim.assemble(source);
  assert.ok(r.ok, r.errors.join(''));
  return Object.fromEntries(parseSymbolListing(r.symbols).map((s) => [s.name, s.address]));
}
const out = () => Buffer.from(spim.consoleOutput()).toString('utf8');

const READ_INT = `
	.text
	.globl main
main:	li $v0, 5
read:	syscall
	move $a0, $v0
	li $v0, 1
	syscall
	li $v0, 10
	syscall
`;

test('a read with no input stops before the syscall, untouched', () => {
  const at = load(READ_INT).read;
  assert.equal(spim.run(1000), 'input');
  const r = spim.registers();
  assert.equal(r.pc, at, 'PC is at the syscall');
  assert.equal(r.general[2], 5, '$v0 still holds the syscall number');
  assert.equal(spim.run(1000), 'input', 'and it keeps waiting');
  assert.equal(spim.registers().pc, at);
  spim.provideInput('42\n');
  assert.equal(spim.run(1000), 'exit');
  assert.equal(out(), '42');
});

test('single steps: the step that meets the read waits, the next one reads', () => {
  const at = load(READ_INT).read;
  let stop = spim.run(1);
  while (stop === 'limit') stop = spim.run(1);
  assert.equal(stop, 'input');
  assert.equal(spim.registers().pc, at);
  spim.provideInput('-7\n');
  assert.equal(spim.run(1), 'limit');
  assert.equal(spim.registers().pc, at + 4);
  assert.equal(spim.registers().general[2] | 0, -7);
});

test('input is a queue of lines, as a console is', () => {
  load(`
	.text
	.globl main
main:	li $v0, 5
	syscall
	move $t0, $v0
	li $v0, 5
	syscall
	add $a0, $t0, $v0
	li $v0, 1
	syscall
	li $v0, 10
	syscall
`);
  spim.provideInput('30\n12\n');
  assert.equal(spim.run(1000), 'exit', 'both lines were there already');
  assert.equal(out(), '42');
});

test('read_string fills the buffer; read_char takes one character', () => {
  const l = load(`
	.data
buf:	.space 16
	.text
	.globl main
main:	la $a0, buf
	li $a1, 16
	li $v0, 8
	syscall
	li $v0, 12
	syscall
	move $s0, $v0
	li $v0, 10
	syscall
`);
  assert.equal(spim.run(1000), 'input');
  const before = Buffer.from(spim.readBytes(l.buf, 16));
  assert.ok(before.every((b) => b === 0), 'nothing written while waiting');
  spim.provideInput('한글 ok\n');
  assert.equal(spim.run(1000), 'input', 'the string took the whole line; read_char waits');
  assert.equal(Buffer.from(spim.readBytes(l.buf, 16)).toString('utf8').replace(/\0+$/, ''), '한글 ok\n');
  spim.provideInput('x');
  assert.equal(spim.run(1000), 'exit');
  assert.equal(spim.registers().general[16], 'x'.charCodeAt(0));
});

test('read_float leaves $f0 alone while it waits', () => {
  load(`
	.data
two:	.float 2.5
	.text
	.globl main
main:	l.s $f0, two
	li $v0, 6
	syscall
	li $v0, 10
	syscall
`);
  const f32 = (bits: number) => new Float32Array(new Uint32Array([bits]).buffer)[0];
  assert.equal(spim.run(1000), 'input');
  assert.equal(f32(spim.registers().fp[0]), 2.5, '$f0 as it was before the syscall');
  spim.provideInput('1.25\n');
  assert.equal(spim.run(1000), 'exit');
  assert.equal(f32(spim.registers().fp[0]), 1.25);
});

test('a new program drops queued input', () => {
  load(READ_INT);
  spim.provideInput('99\n');
  load(READ_INT);
  assert.equal(spim.run(1000), 'input');
});
