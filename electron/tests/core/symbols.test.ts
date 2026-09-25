/* src/core/symbols.ts.  (a): the labels parsed from the core's
   print_symbols() listing are where the core's own instructions say they
   are -- a j/jal's target, a branch's destination, a lui/ori pair's
   address, each named by the symbol the instruction carries.  Two different
   paths through the core agreeing.  (b): the Qt build's tst_symbols.cpp. */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { decode } from '../../src/core/decoder.ts';
import { LabelMap, parseSymbolListing } from '../../src/core/symbols.ts';
import { coreLine, load } from '../helpers/program.ts';

// The label an instruction names: "[main]", "[fail-0x00400080]", "[m3]".
const namedLabel = (disassembly: string): string | null =>
  /\[([A-Za-z_.$][A-Za-z0-9_.$]*)(?:[-+][^\]]*)?\]$/.exec(disassembly)?.[1] ?? null;

for (const file of ['tests/programs/tt.core.s', 'tests/programs/helloworld.s', 'tests/samples/data-stack.s']) {
  test(`${file}: labels are where the instructions point`, () => {
    const p = load(file);
    assert.ok(p.labels.size > 3);
    let jumps = 0;
    let branches = 0;
    let pairs = 0;
    p.text.forEach((t, i) => {
      const label = namedLabel(coreLine(t.line).disassembly);
      if (label === null) return;
      const address = p.labels.find(label);
      if (address === undefined) return; // an undefined symbol; nothing to compare
      const d = decode(t.word, t.addr, 'SpimNoDelaySlot');
      if (d.kind === 'Jump') {
        assert.equal(d.destination, ((t.addr & 0xf0000000) | (address & 0x0fffffff)) >>> 0, `jump to ${label}`);
        jumps += 1;
      } else if (d.kind === 'Branch') {
        assert.equal(d.destination, address, `branch to ${label} at ${t.addr.toString(16)}`);
        branches += 1;
      } else if (d.name === 'lui' && decode(p.text[i + 1]?.word ?? 0).name === 'ori'
                 && namedLabel(coreLine(p.text[i + 1].line).disassembly) === label
                 && !/\+/.test(coreLine(t.line).disassembly)) {
        const upper = d.imm << 16;
        assert.equal((upper | decode(p.text[i + 1].word).imm) >>> 0, address, `la ${label}`);
        pairs += 1;
      }
    });
    assert.ok(jumps + branches + pairs > 0, 'something was compared');
  });
}

// Real output of Simulator > Display Symbols after loading helloworld.s.
test('parses the core\'s format', () => {
  const symbols = parseSymbolListing(
    'g\t__eoth at 0x00400024\n'
    + 'g\t__start at 0x00400000\n'
    + '\tlocal_one at 0x10010004\n'
    + 'g\tmain at 0x00400024\n'
    + 'g\tfoobar at 0x10000000\n');
  assert.equal(symbols.length, 5);
  assert.deepEqual(symbols[0], { name: '__eoth', address: 0x00400024, global: true });
  assert.deepEqual(symbols[2], { name: 'local_one', address: 0x10010004, global: false });
  assert.equal(symbols[4].address, 0x10000000);
});

test('ignores everything else', () => {
  const symbols = parseSymbolListing(
    'Memory and registers cleared\n'
    + '\n'
    + 'g\tmain at 0x0040\n'            // not eight digits
    + 'gmain at 0x00400024\n'          // no tab
    + 'g\tmain at 0x00400024 extra\n'  // trailing text
    + 'g\tok at 0x00400024\r\n');      // CRLF is fine
  assert.deepEqual(symbols.map((s) => s.name), ['ok']);
});

test('map by address and name', () => {
  const map = new LabelMap();
  assert.ok(map.isEmpty);
  map.add('msg', 0x10010000);
  map.add('alias', 0x10010000);
  map.add('nums', 0x10010010);
  map.add('undefined', 0); // address 0 = not defined in the core
  map.add('msg', 0x10010000); // twice is once
  assert.equal(map.size, 3);
  assert.deepEqual(map.labelsAt(0x10010000), ['alias', 'msg']);
  assert.deepEqual(map.labelsAt(0x10010004), []);
  assert.equal(map.find('nums'), 0x10010010);
  assert.equal(map.find('undefined'), undefined);
  assert.equal(map.find('Nums'), undefined); // labels are case sensitive
  const within = map.labelsIn(0x10010000, 0x10010010); // half open
  assert.equal(within.length, 1);
  assert.equal(within[0][0], 0x10010000);
});

test('redefinition moves the label', () => {
  const map = new LabelMap();
  map.add('buf', 0x10010000);
  map.add('buf', 0x10010020);
  assert.deepEqual(map.labelsAt(0x10010000), []);
  assert.deepEqual(map.labelsAt(0x10010020), ['buf']);
  assert.equal(map.size, 1);
});
