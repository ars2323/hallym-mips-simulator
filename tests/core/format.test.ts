/* src/core/format.ts.  (b): the Qt build's tst_format.cpp table. */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  baseName, bin32, bin32Grouped, bitRuler32, hex32, hex32Digits, inBase32, parseValue32, signedDec32, unsignedDec32,
} from '../../src/core/format.ts';

test('values', () => {
  const table: [number, string, string, string, string][] = [
    [0, '0x00000000', '0', '0', '0000 0000 0000 0000 0000 0000 0000 0000'],
    [1, '0x00000001', '1', '1', '0000 0000 0000 0000 0000 0000 0000 0001'],
    [0xffffffff, '0xffffffff', '-1', '4294967295', '1111 1111 1111 1111 1111 1111 1111 1111'],
    [0x7fffffff, '0x7fffffff', '2147483647', '2147483647', '0111 1111 1111 1111 1111 1111 1111 1111'],
    [0x80000000, '0x80000000', '-2147483648', '2147483648', '1000 0000 0000 0000 0000 0000 0000 0000'],
    [0xfffffffe, '0xfffffffe', '-2', '4294967294', '1111 1111 1111 1111 1111 1111 1111 1110'],
    [0x00400000, '0x00400000', '4194304', '4194304', '0000 0000 0100 0000 0000 0000 0000 0000'],
    [0x7ffff10c, '0x7ffff10c', '2147479820', '2147479820', '0111 1111 1111 1111 1111 0001 0000 1100'],
    [0x8fa40000, '0x8fa40000', '-1885077504', '2409889792', '1000 1111 1010 0100 0000 0000 0000 0000'],
    [0xaaaaaaaa, '0xaaaaaaaa', '-1431655766', '2863311530', '1010 1010 1010 1010 1010 1010 1010 1010'],
  ];
  for (const [value, hex, sdec, udec, bin] of table) {
    assert.equal(hex32(value), hex);
    assert.equal(signedDec32(value), sdec);
    assert.equal(unsignedDec32(value), udec);
    assert.equal(bin32Grouped(value), bin);
    assert.equal(bin32(value), bin.replaceAll(' ', ''));
    assert.equal(bin32(value).length, 32);
  }
});

// Each label must start in the column of its nibble's first digit.
test('ruler lines up with grouped binary', () => {
  const ruler = bitRuler32();
  assert.equal(ruler, '31   27   23   19   15   11   7    3');
  assert.ok(ruler.length <= bin32Grouped(0).length);
  const labelled = [31, 27, 23, 19, 15, 11, 7, 3];
  labelled.forEach((bit, i) => {
    const column = bin32Grouped(2 ** bit).indexOf('1');
    assert.equal(ruler.substr(column, String(bit).length), String(bit));
    assert.equal(ruler.substr(5 * i, 5).trim(), String(bit));
  });
});

test('bare hex digits', () => {
  assert.equal(hex32Digits(0x00400000), '00400000');
  assert.equal(hex32Digits(0xffffffff), 'ffffffff');
  assert.equal(hex32Digits(0), '00000000');
});

test('inBase follows the menu', () => {
  const v = 0xfffffff6; // -10
  assert.equal(inBase32(v, 16), '0xfffffff6');
  assert.equal(inBase32(v, 10), '-10');
  assert.equal(inBase32(v, 2), '1111 1111 1111 1111 1111 1111 1111 0110');
  assert.equal(inBase32(v, 7), '0xfffffff6'); // unknown -> hex
  assert.equal(baseName(16), 'Hex');
  assert.equal(baseName(10), 'Dec');
  assert.equal(baseName(2), 'Bin');
});

test('parse', () => {
  const table: [string, number, number | null][] = [
    ['0', 10, 0], ['-1', 10, 0xffffffff], ['-2147483648', 10, 0x80000000], ['-2147483649', 10, null],
    ['2147483647', 10, 0x7fffffff], ['4294967295', 10, 0xffffffff], ['4294967296', 10, null],
    ['  42 ', 10, 42], ['1f', 10, null],
    ['7ffff10c', 16, 0x7ffff10c], ['0x10010000', 16, 0x10010000], ['FFFFFFFF', 16, 0xffffffff],
    ['100000000', 16, null], ['-1', 16, null], ['xyz', 16, null],
    ['1010', 2, 10], ['11111111111111111111111111111111', 2, 0xffffffff],
    ['100000000000000000000000000000000', 2, null], ['102', 2, null],
    ['', 16, null], ['   ', 10, null], ['17', 8, null],
  ];
  for (const [text, base, value] of table) {
    assert.equal(parseValue32(text, base), value, `${JSON.stringify(text)} base ${base}`);
  }
});

// What the panel shows can be typed back into the Change Value dialog.
test('format then parse round trips', () => {
  for (const value of [0, 1, 0x7fffffff, 0x80000000, 0xffffffff, 0x12345678]) {
    assert.equal(parseValue32(hex32(value), 16), value);
    assert.equal(parseValue32(signedDec32(value), 10), value);
    assert.equal(parseValue32(unsignedDec32(value), 10), value);
    assert.equal(parseValue32(bin32(value), 2), value);
  }
});
