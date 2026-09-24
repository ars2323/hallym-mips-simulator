/* src/core/registers.ts.  (a): the names are checked against the core's own
   table (int_reg_names, through the addon) and the CP0 numbers against the
   core's CPU/reg.h; the rest is the Qt build's tst_registers.cpp table. */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import * as spim from '../../native/index.ts';
import {
  findRegister, generalRegisterCoreName, generalRegisterName, reg, registerGroups, registerName,
  registerNumberLabel, registerPromptName,
} from '../../src/core/registers.ts';
import { root } from '../helpers/machine.ts';

test('names match the core, except $zero and $fp', () => {
  const core = spim.registerNames();
  assert.equal(core.length, 32);
  for (let n = 0; n < 32; n += 1) {
    assert.equal(generalRegisterCoreName(n), core[n], `R${n}`);
    const expected = n === 0 ? '$zero' : n === 30 ? '$fp' : '$' + core[n];
    assert.equal(generalRegisterName(n), expected, `R${n}`);
    // Every spelling of the core's leads back to the register.
    assert.deepEqual(findRegister(core[n]), reg('General', n));
    assert.deepEqual(findRegister('$' + n), reg('General', n));
  }
  assert.equal(generalRegisterName(-1), '');
  assert.equal(generalRegisterName(32), '');
});

test('CP0 numbers match the core', () => {
  const source = readFileSync(path.join(root, 'CPU/reg.h'), 'latin1');
  for (const name of ['BadVAddr', 'Status', 'Cause', 'EPC']) {
    const m = new RegExp(`#define CP0_${name}_Reg\\s+(\\d+)`).exec(source);
    assert.ok(m, name);
    const r = findRegister(name);
    assert.deepEqual(r, reg('Cp0', Number(m[1])));
    assert.equal(registerName(r!), name);
  }
});

test('every register is in exactly one group', () => {
  const seen = new Set<string>();
  let general = 0;
  for (const group of registerGroups()) {
    for (const r of group.registers) {
      const name = registerName(r);
      assert.notEqual(name, '');
      assert.ok(!seen.has(name), `${name} listed twice`);
      seen.add(name);
      if (r.kind === 'General') general += 1;
    }
  }
  assert.equal(general, 32);
  assert.equal(seen.size, 32 + 3 + 4); // general + PC/HI/LO + four CP0
});

test('groups are the planned ones', () => {
  assert.equal(registerGroups().map((g) => `${g.title}: ${g.registers.map(registerName).join(' ')}`).join('\n'),
    'Special: PC HI LO\n'
    + 'Return values: $v0 $v1\n'
    + 'Arguments: $a0 $a1 $a2 $a3\n'
    + 'Temporaries: $t0 $t1 $t2 $t3 $t4 $t5 $t6 $t7 $t8 $t9\n'
    + 'Saved: $s0 $s1 $s2 $s3 $s4 $s5 $s6 $s7\n'
    + 'Pointers: $gp $sp $fp $ra\n'
    + 'Reserved: $zero $at $k0 $k1\n'
    + 'CP0: Status Cause EPC BadVAddr');
});

test('labels', () => {
  assert.equal(registerNumberLabel(reg('General', 8)), 'R8');
  assert.equal(registerPromptName(reg('General', 8)), 'R8');
  assert.equal(registerNumberLabel(reg('Pc')), '');
  assert.equal(registerPromptName(reg('Pc')), 'PC');
  assert.equal(registerNumberLabel(reg('Cp0', 12)), '$12');
  assert.equal(registerPromptName(reg('Cp0', 12)), 'Status');
});

test('lookup', () => {
  const table: [string, string][] = [
    ['$t0', '$t0'], ['T0', '$t0'], ['r8', '$t0'], ['$8', '$t0'], ['8', '$t0'], ['zero', '$zero'],
    ['r0', '$zero'], ['$fp', '$fp'], ['s8', '$fp'], ['31', '$ra'], ['pc', 'PC'], ['Hi', 'HI'],
    ['STATUS', 'Status'], [' epc ', 'EPC'], ['32', ''], ['-1', ''], ['t10', ''], ['', ''], ['$', ''],
  ];
  for (const [spelling, expected] of table) {
    const r = findRegister(spelling);
    // Found or not first (as the Qt test does): "32" must not be a register
    // that merely has no name.
    assert.equal(r !== null, expected !== '', `${JSON.stringify(spelling)} found`);
    if (r !== null) assert.equal(registerName(r), expected, JSON.stringify(spelling));
  }
});
