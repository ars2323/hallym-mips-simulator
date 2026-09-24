/* src/core/decoder.ts.  (a): every instruction of the test programs against
   the core's own disassembly (tests/helpers/decoder-oracle.ts).  The core's
   inst_decode() misnames a few words; the ones met are pinned by count. */

import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';

import { checkDecoder } from '../helpers/decoder-oracle.ts';
import { root } from '../helpers/machine.ts';

const program = (name: string) => path.join(root, 'tests/programs', name);

test('tt.core.s: name, format and fields of every instruction', () => {
  const r = checkDecoder(program('tt.core.s'));
  assert.deepEqual(r.failures, []);
  assert.equal(r.instructions, 4758);
  assert.equal(r.fieldChecks, 4749);
  assert.deepEqual(Object.fromEntries(r.quirks), { 'movt->movf': 2, 'movt.d->movf.d': 2, 'movt.s->movf.s': 2 });
  assert.deepEqual(Object.fromEntries(r.release2), { 'trunc.w.s->suxc1': 3 });
});

for (const name of ['tt.alu.bare.s', 'tt.fpu.bare.s', 'tt.le.s', 'tt.dir.s', 'helloworld.s']) {
  test(`${name}: every instruction`, () => {
    const r = checkDecoder(program(name));
    assert.deepEqual(r.failures, []);
    assert.ok(r.instructions > 50);
  });
}

/* SPIM assembles a forward branch of 0x2000 words (32 KB) or more into a
   word that points BACKWARDS, without an error, and executes it that way:
   CPU/inst.h IDISP sign-extends the offset after shifting it
   (docs/PORTING.md, "Long forward branches").  The decoder follows SPIM --
   its destination is where SPIM really goes -- and must stay that way. */
test('a forward branch past 32 KB goes where SPIM sends it', async () => {
  const spim = await import('../../native/index.ts');
  const { decode } = await import('../../src/core/decoder.ts');
  const cases = [
    { gap: 0x1ffe, word: 0x10001fff, destination: 0x00408020 }, // still in range: forward, as written
    { gap: 0x2000, word: 0x1000e001, destination: 0x003f8028 }, // 0x00408028 intended; SPIM goes back
    { gap: 0x3000, word: 0x1000f001, destination: 0x003fc028 },
  ];
  for (const c of cases) {
    const source = ['.text', 'main: beq $0, $0, far', ...Array(c.gap).fill('  nop'), 'far: li $v0, 10', '  syscall'].join('\n');
    assert.ok(spim.assemble(source).ok);
    const at = 0x00400024;
    const word = spim.textSegment().find((t) => t.addr === at)!.word;
    assert.equal(word, c.word, `gap ${c.gap}: the word SPIM assembles`);
    assert.equal(decode(word, at, 'SpimNoDelaySlot').destination, c.destination, `gap ${c.gap}: decoded destination`);
    while (spim.registers().pc !== at) spim.step(1);
    spim.step(1);
    assert.equal(spim.registers().pc, c.destination, `gap ${c.gap}: where SPIM went`);
  }
});
