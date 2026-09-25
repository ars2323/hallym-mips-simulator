/* src/core/mips-syntax.ts.  (b): the Qt build's tst_mips_syntax.cpp table,
   and the keyword table checked to be the core's CPU/op.h as it is now. */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { OP_TABLE } from '../../src/core/op-table.ts';
import {
  isMipsDirective, isMipsInstruction, mipsKeywordCount, tokenizeMipsLine, type SyntaxTokenKind,
} from '../../src/core/mips-syntax.ts';
import { renderOpTable } from '../../tools/gen-op-table.ts';
import { root } from '../helpers/machine.ts';

const KIND: Record<SyntaxTokenKind, string> = {
  Comment: 'comment', String: 'string', Directive: 'directive', Instruction: 'instruction',
  Register: 'register', LabelDefinition: 'labeldef', Identifier: 'identifier', Number: 'number',
};

// "labeldef[main:] instruction[li] register[$v0] number[4] comment[# x]"
const show = (line: string) =>
  tokenizeMipsLine(line).map((t) => `${KIND[t.kind]}[${line.slice(t.start, t.start + t.length)}]`).join(' ');

test('the keyword table is the core\'s', () => {
  const opH = readFileSync(path.join(root, '../CPU/op.h'), 'latin1');
  assert.equal(readFileSync(path.join(root, 'src/core/op-table.ts'), 'utf8'), renderOpTable(opH),
               'src/core/op-table.ts is out of date: run node tools/gen-op-table.ts');
  assert.equal(OP_TABLE.length, (opH.match(/\bOP\(/g) ?? []).length);
  assert.equal(mipsKeywordCount(), 381); // OP( lines in CPU/op.h
  for (const w of ['add', 'syscall', 'li', 'la', 'move', 'bnez', 'c.eq.d', 'l.d']) assert.ok(isMipsInstruction(w), w);
  assert.ok(!isMipsInstruction('ADD')); // the assembler is case sensitive
  assert.ok(!isMipsInstruction('main'));
  assert.ok(!isMipsInstruction('.data'));
  for (const w of ['.data', '.asciiz', '.globl']) assert.ok(isMipsDirective(w), w);
  assert.ok(!isMipsDirective('.bogus'));
  assert.ok(!isMipsDirective('add'));
});

test('helloworld lines', () => {
  assert.equal(show('main:   li $v0, 4       # syscall 4 (print_str)'),
               'labeldef[main:] instruction[li] register[$v0] number[4] comment[# syscall 4 (print_str)]');
  assert.equal(show('msg:   .asciiz "Hello World"'), 'labeldef[msg:] directive[.asciiz] string["Hello World"]');
  assert.equal(show('\t.extern foobar 4'), 'directive[.extern] identifier[foobar] number[4]');
  assert.equal(show('        lw $t1, foobar'), 'instruction[lw] register[$t1] identifier[foobar]');
  assert.equal(show('\tlw $a0 0($sp)\t\t# argc'),
               'instruction[lw] register[$a0] number[0] register[$sp] comment[# argc]');
  assert.equal(show(''), '');
  assert.equal(show('   \t '), '');
});

test('labels', () => {
  assert.equal(show('loop: next : addi $t0, $t0, -1'),
               'labeldef[loop:] labeldef[next :] instruction[addi] register[$t0] register[$t0] number[-1]');
  assert.equal(show('b done'), 'instruction[b] identifier[done]');
  assert.equal(show('add: add $t0, $t0, $t1'),
               'labeldef[add:] instruction[add] register[$t0] register[$t0] register[$t1]');
  assert.equal(show('.Lx: .word .Lx'), 'labeldef[.Lx:] directive[.word] identifier[.Lx]');
  assert.equal(show('size = 16'), 'identifier[size] number[16]');
});

test('registers', () => {
  assert.equal(show('$zero $0 $31 $ra $fp $s8 $f0 $f31'),
               'register[$zero] register[$0] register[$31] register[$ra] register[$fp] register[$s8] '
               + 'register[$f0] register[$f31]');
  assert.equal(show('$32 $f32 $foo $'), 'identifier[$32] identifier[$f32] identifier[$foo] identifier[$]');
});

test('numbers', () => {
  assert.equal(show('.word 10, -4, 0x10010000, 0XFF, +7'),
               'directive[.word] number[10] number[-4] number[0x10010000] number[0XFF] number[+7]');
  assert.equal(show('.double 1.5e-3, 2.0'), 'directive[.double] number[1.5e-3] number[2.0]');
  assert.equal(show('la $t0, buf-4'), 'instruction[la] register[$t0] identifier[buf] number[-4]');
  assert.equal(show('lw $t0, 0xe-4($sp)'), 'instruction[lw] register[$t0] number[0xe] number[-4] register[$sp]');
});

test('strings and comments', () => {
  assert.equal(show('.asciiz "a # not a comment" # a comment'),
               'directive[.asciiz] string["a # not a comment"] comment[# a comment]');
  assert.equal(show('.asciiz "say \\"hi\\"\\n"'), 'directive[.asciiz] string["say \\"hi\\"\\n"]');
  assert.equal(show("li $t0, 'a'  # char"), "instruction[li] register[$t0] string['a'] comment[# char]");
  assert.equal(show('.asciiz "unterminated'), 'directive[.asciiz] string["unterminated]');
  assert.equal(show('# li $v0, 4'), 'comment[# li $v0, 4]');
  assert.equal(show('syscall # 출력'), 'instruction[syscall] comment[# 출력]');
  assert.equal(show('.asciiz "안녕"'), 'directive[.asciiz] string["안녕"]');
});

test('tokens stay inside the line', () => {
  for (const line of ['"', "'", '$', '-', '0x', 'a:', ':', '\\', '"\\', 'label:#c', '1e', '1e+', 'x = -', '.', '$$$$']) {
    let end = 0;
    for (const t of tokenizeMipsLine(line)) {
      assert.ok(t.start >= end, line); // ordered, no overlap
      assert.ok(t.length > 0, line);
      end = t.start + t.length;
      assert.ok(end <= line.length, line);
    }
  }
});
