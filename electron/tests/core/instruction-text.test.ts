/* src/core/instruction-text.ts.  (a): the inspector's lines for every
   instruction of the test programs, checked against the core -- the word
   and address, the bits, the field values, every register the core's
   disassembly names, and a branch's or jump's destination against the
   label the core says it goes to.  (b): the Qt build's
   tst_instruction_text.cpp table. */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { decode, formatName, type BranchConvention } from '../../src/core/decoder.ts';
import { bin32, hex32 } from '../../src/core/format.ts';
import {
  INSTRUCTION_TEXT_COLUMNS, instructionDetailLines, instructionNoteLines,
} from '../../src/core/instruction-text.ts';
import { generalRegisterName } from '../../src/core/registers.ts';
import { coreLine, load } from '../helpers/program.ts';

const namedLabel = (disassembly: string): string =>
  /\[([A-Za-z_.$][A-Za-z0-9_.$]*)(?:[-+][^\]]*)?\]$/.exec(disassembly)?.[1] ?? '';

for (const file of ['tests/programs/tt.core.s', 'tests/programs/helloworld.s']) {
  test(`${file}: every instruction's lines agree with the core`, (t0) => {
    const p = load(file);
    let destinations = 0;
    let registers = 0;
    for (const t of p.text) {
      const where = `[${hex32(t.addr)}] ${t.line}`;
      const { disassembly } = coreLine(t.line);
      const d = decode(t.word, t.addr, 'SpimNoDelaySlot');
      const label = d.hasDestination ? namedLabel(disassembly) : '';
      const lines = instructionDetailLines(d, t.addr, disassembly, label, 'SpimNoDelaySlot');

      assert.ok(lines[0].startsWith(d.known ? disassembly : '(not an instruction'), where);
      assert.ok(lines[0].endsWith(`${formatName(d.format)}-type`), where);
      assert.equal(lines[1], `${hex32(t.word)}  at ${hex32(t.addr)}`, where);
      assert.equal(lines[3].replaceAll(' ', ''), bin32(t.word), `${where}: bits`);
      assert.deepEqual(lines[5].trim().split(/ +/),
                       d.fields.map((f) => String(f.name === 'immediate' ? d.simm : f.value)), `${where}: values`);
      for (const row of lines.slice(2, 7)) assert.ok(row.length <= INSTRUCTION_TEXT_COLUMNS, `${where}: too wide`);

      // Every CPU register the core names is named in the meaning row.  (Not
      // for CP0 register numbers, which read as Status/Cause/... or nothing,
      // nor for an FP load/store's $f register, an I-type rt.)
      const meaning = ` ${lines[6]} `;
      for (const m of disassembly.replace(/\[.*$/, '').matchAll(/(?<![f\w])\$(\d+)/g)) {
        if (d.format === 'Cp0') continue;
        assert.ok(meaning.includes(` ${generalRegisterName(Number(m[1]))} `), `${where}: $${m[1]} in "${lines[6]}"`);
        registers += 1;
      }
      if (d.format === 'FR') {
        for (const m of disassembly.matchAll(/\$f(\d+)/g)) {
          assert.ok(meaning.includes(` $f${m[1]} `), `${where}: $f${m[1]} in "${lines[6]}"`);
        }
      }

      const address = label === '' ? undefined : p.labels.find(label);
      if (address !== undefined) {
        const expected = d.kind === 'Jump' ? ((t.addr & 0xf0000000) | (address & 0x0fffffff)) >>> 0 : address;
        assert.ok(lines[lines.length - 1].endsWith(`${hex32(expected)} [${label}]`), `${where}: ${lines.at(-1)}`);
        destinations += 1;
      }
    }
    assert.ok(registers > 10 && destinations > 0, `${registers} registers, ${destinations} destinations`);
    t0.diagnostic(`${p.text.length} instructions, ${registers} register names, ${destinations} destinations`);
  });
}

const detail = (word: number, pc: number, disassembly: string, label: string, convention: BranchConvention) =>
  instructionDetailLines(decode(word, pc, convention), pc, disassembly, label, convention);

test('the plan\'s example: lw', () => {
  assert.equal(detail(0x8fa40000, 0x00400000, 'lw $4, 0($29)', '', 'SpimNoDelaySlot').join('\n'),
    'lw $4, 0($29)                         I-type\n'
    + '0x8fa40000  at 0x00400000\n'
    + '31  26 25-21 20-16 15             0\n'
    + '100011 11101 00100 0000000000000000\n'
    + 'opcode rs    rt    immediate\n'
    + '35     29    4     0\n'
    + 'lw     $sp   $a0   0x0000');
});

test('R-type', () => {
  const lines = detail(0x00c23021, 0x00400010, 'addu $6, $6, $2', '', 'SpimNoDelaySlot');
  assert.equal(lines.length, 7);
  assert.equal(lines[3], '000000  00110 00010 00110 00000 100001');
  assert.equal(lines[4], 'opcode  rs    rt    rd    shamt funct');
  assert.equal(lines[5], '0       6     2     6     0     33');
  assert.equal(lines[6], 'SPECIAL $a2   $v0   $a2         addu');
});

test('branch in the default mode', () => {
  const lines = detail(0x14200002, 0x00400030, 'bne $1, $0, 8', 'target', 'SpimNoDelaySlot');
  assert.equal(lines.length, 8);
  assert.equal(lines[5], '5      1     0     2');
  assert.equal(lines[6], 'bne    $at   $zero x4=8');
  assert.equal(lines[7], 'Dest = PC + (offset×4) = 0x00400038 [target]');
  const notes = instructionNoteLines(decode(0x14200002, 0x00400030, 'SpimNoDelaySlot'), 'SpimNoDelaySlot');
  assert.equal(notes.length, 2);
  assert.ok(notes[0].startsWith('이 시뮬레이터의 기본 모드는'));
  assert.ok(notes[1].startsWith("This simulator's default mode"));
});

test('branch with delayed branches', () => {
  const lines = detail(0x1420fffe, 0x00400030, 'bne $1, $0, -8', '', 'MipsDelaySlot');
  assert.equal(lines.length, 8);
  assert.deepEqual(instructionNoteLines(decode(0x1420fffe, 0x00400030, 'MipsDelaySlot'), 'MipsDelaySlot'), []);
  assert.deepEqual(instructionNoteLines(decode(0x0c100009, 0x00400014, 'SpimNoDelaySlot'), 'SpimNoDelaySlot'), []);
  assert.equal(lines[5], '5      1     0     -2');
  assert.equal(lines[6], 'bne    $at   $zero x4=-8');
  assert.equal(lines[7], 'Dest = PC + 4 + (offset×4) = 0x0040002c');
});

test('jump, resolved and unresolved', () => {
  let lines = detail(0x0c100009, 0x00400014, 'jal 0x00400024 [main]', 'main', 'SpimNoDelaySlot');
  assert.equal(lines.length, 9);
  assert.equal(lines[3], '000011 00000100000000000000001001');
  assert.equal(lines[4], 'opcode target');
  assert.equal(lines[5], '3      1048585');
  assert.equal(lines[6], 'jal    x4=0x00400024');
  assert.equal(lines[7], 'Dest = (PC & 0xf0000000) | (target×4)');
  assert.equal(lines[8], '     = 0x00400024 [main]');
  lines = detail(0x0c000000, 0x00400014, 'jal 0x00000000 [main]', 'main', 'SpimNoDelaySlot');
  assert.equal(lines[8], '     = 0x00000000 [main]');
});

test('coprocessor formats', () => {
  let lines = detail(0x46241000, 0, 'add.d $f0, $f2, $f4', '', 'SpimNoDelaySlot');
  assert.equal(lines[4], 'opcode fmt    ft    fs    fd    funct');
  assert.equal(lines[6], 'COP1   double $f4   $f2   $f0   add.d');
  lines = detail(0x44886000, 0, 'mtc1 $8, $f12', '', 'SpimNoDelaySlot');
  assert.equal(lines[6], 'COP1   mtc1  $t0   $f12  $f0   mtc1');
  lines = detail(0x401a6800, 0, 'mfc0 $26, $13', '', 'SpimNoDelaySlot');
  assert.equal(lines[4], 'opcode rs    rt    rd    0        sel');
  assert.equal(lines[6], 'COP0   mfc0  $k0   Cause');
  lines = detail(0x45010003, 0x00400000, 'bc1t 0 12', '', 'MipsDelaySlot');
  assert.equal(lines[4], 'opcode fmt   cc    nd tf   immediate');
  assert.equal(lines[2], '31  26 25-21 20-18 17 16   15             0');
  assert.equal(lines[6], 'COP1   BC             bc1t x4=12');
});

test('unknown word', () => {
  const lines = detail(0xfc000000, 0, '', '', 'SpimNoDelaySlot');
  assert.ok(lines[0].startsWith('(not an instruction this simulator implements)'));
  assert.ok(lines[0].endsWith('I-type'));
  assert.equal(lines[1], '0xfc000000  at 0x00000000');
  assert.equal(lines.length, 7);
});

test('the table fits the inspector', () => {
  for (const word of [0x8fa40000, 0x00c23021, 0x0c100009, 0x03fffffd, 0x46241000, 0x4604103c, 0x45010003,
                      0x401a6800, 0x42000018, 0x04910004, 0x712a4002, 0x2008ffff, 0x1420fffe, 0xffffffff,
                      0x0bffffff, 0x03e0f809]) {
    const lines = instructionDetailLines(decode(word, 0x00400000, 'MipsDelaySlot'), 0x00400000, 'x', '', 'MipsDelaySlot');
    for (let row = 1; row < 7; row += 1) {
      assert.ok(lines[row].length <= INSTRUCTION_TEXT_COLUMNS, `${hex32(word)} row ${row}: "${lines[row]}"`);
    }
  }
});
