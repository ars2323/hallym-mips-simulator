/* src/core/near-miss.ts: the slips it names, and the words it leaves alone. */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { editDistance, nearMiss, nearMissRule, nearest } from '../../src/core/near-miss.ts';

test('the distance counts an insertion, a deletion, a substitution and a swap as one each', () => {
  assert.equal(editDistance('srl', 'srll'), 1);
  assert.equal(editDistance('.asciz', '.asciiz'), 1);
  assert.equal(editDistance('.global', '.globl'), 1);
  assert.equal(editDistance('addu', 'adud'), 1); // a swap
  assert.equal(editDistance('add', 'sub'), 3);
});

test('the rule: nothing for two characters, one letter to five, two from six on', () => {
  assert.deepEqual([1, 2, 3, 5, 6, 9].map(nearMissRule), [0, 0, 1, 1, 2, 2]);
});

test('the typical slips are named', () => {
  assert.deepEqual(nearMiss('    .global main'), { why: 'spelling', kind: 'directive', token: '.global', meant: '.globl' });
  assert.deepEqual(nearMiss('msg: .asciz "hi"'), { why: 'spelling', kind: 'directive', token: '.asciz', meant: '.asciiz' });
  assert.deepEqual(nearMiss('x: .wrod 1'), { why: 'spelling', kind: 'directive', token: '.wrod', meant: '.word' });
  assert.deepEqual(nearMiss('    srll $t1, $t0, 2'), { why: 'spelling', kind: 'instruction', token: 'srll', meant: 'srl' });
  assert.deepEqual(nearMiss('    addd $t0, $t1, $t2'), { why: 'spelling', kind: 'instruction', token: 'addd', meant: 'add' });
  assert.deepEqual(nearMiss('    sysclal'), { why: 'spelling', kind: 'instruction', token: 'sysclal', meant: 'syscall' });
  assert.deepEqual(nearMiss('    li $s10, 1'), { why: 'no-such-register', token: '$s10', family: '$s', range: '$s0–$s7' });
  assert.deepEqual(nearMiss('    add $t10, $t0, $t1'), { why: 'no-such-register', token: '$t10', family: '$t', range: '$t0–$t9' });
  assert.deepEqual(nearMiss('    move $a4, $t0'), { why: 'no-such-register', token: '$a4', family: '$a', range: '$a0–$a3' });
  assert.deepEqual(nearMiss('    add $32, $t0, $t1'), { why: 'no-such-register', token: '$32', family: '$0', range: '$0–$31' });
  assert.deepEqual(nearMiss('    add t0, $t1, $t2'), { why: 'missing-dollar', token: 't0', meant: '$t0' });
  assert.deepEqual(nearMiss('    li v0, 4'), { why: 'missing-dollar', token: 'v0', meant: '$v0' });
  assert.deepEqual(nearMiss('    lw $t0, 0($spp)'), { why: 'spelling', kind: 'register', token: '$spp', meant: '$sp' });
});

test('a line the assembler would accept gets no guess', () => {
  for (const line of ['    .globl main', '    srl $t1, $t0, 2', 'main: li $v0, 10', '    lw $t0, 4($t1)', '    .asciiz "text"',
    '    add $s7, $t9, $a3', 'loop:', '    beq $t0, $zero, done   # done', '    la $a0, msg']) {
    assert.equal(nearMiss(line), null, line);
  }
});

test('a word far from every name, or as near to two, gets no guess', () => {
  assert.equal(nearMiss('    foobar $t0'), null);       // nothing within two
  assert.equal(nearMiss('    xyz $t0'), null);          // nothing within one
  assert.equal(nearMiss('    ad $t0, $t1, $t2'), null); // two characters: never
  assert.equal(nearest('sr', ['srl', 'sra', 'sll']), null);
  // Ties: the one sharing the longest prefix, then the longest suffix, else none.
  assert.equal(nearest('srll', ['srl', 'sll']), 'srl');        // prefix srl (3) over s (1)
  assert.equal(nearest('sbb', ['sb', 'sub']), 'sb');           // prefix sb (2) over s (1)
  assert.equal(nearest('.asciz', ['.ascii', '.asciiz']), '.asciiz'); // prefix tied at .asci; suffix z decides
  assert.equal(nearest('sbb', ['sub', 'sll']), 'sub');         // prefix tied at s; suffix b decides
  assert.equal(nearest('xll', ['sll', 'all']), null);          // prefix 0 and suffix ll for both: no guess
});

test('labels, strings, numbers and comments are not looked at', () => {
  assert.equal(nearMiss('mian: li $v0, 4'), null);            // a label is the student's own name
  assert.equal(nearMiss('    j mian'), null);                  // so is a label used
  assert.equal(nearMiss('msg: .asciiz ".global srll t0"'), null);
  assert.equal(nearMiss('    li $v0, 4   # srll t0 .global'), null);
  assert.equal(nearMiss('    .word 0xsrl'), null);
});
