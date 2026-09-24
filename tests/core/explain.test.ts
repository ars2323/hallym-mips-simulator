/* src/core/explain.ts.  (a): for every instruction of tt.core.s, the
   registers the sentence names are exactly the registers the core's own
   disassembly names; nothing that is code is left outside backticks.
   (b): the sentences for the Inspector's examples, word for word. */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { decode } from '../../src/core/decoder.ts';
import { codeParts, explain } from '../../src/core/explain.ts';
import { generalRegisterName } from '../../src/core/registers.ts';
import { coreLine, load } from '../helpers/program.ts';

// Instructions whose sentence names a register the disassembly does not
// (jal: $ra; syscall: $v0 and its arguments) or none it does.
const IMPLICIT = new Set(['jal', 'syscall', 'break', 'nop', 'mfhi', 'mflo', 'mthi', 'mtlo', 'jalr']);

test('tt.core.s: every sentence names the registers the core names', () => {
  const p = load('tests/programs/tt.core.s');
  const regs = Array.from({ length: 32 }, (_, i) => (i * 0x01010101) >>> 0);
  let checked = 0;
  for (const t of p.text) {
    const d = decode(t.word, t.addr, 'SpimNoDelaySlot');
    const e = explain(d, regs, t.addr);
    if (e.sentence === '') continue;
    const plain = codeParts(e.sentence).filter((x) => !x.code).map((x) => x.text).join('');
    assert.ok(!/0x|\$/.test(plain), `code outside backticks: ${e.sentence}`);
    if (IMPLICIT.has(d.name)) continue;
    const fromCore = new Set([...coreLine(t.line).disassembly.replace(/\[.*$/, '').matchAll(/(?<![f\w])\$(\d+)/g)]
      .map((m) => generalRegisterName(Number(m[1]))));
    const fromSentence = new Set(codeParts(e.sentence).filter((x) => x.code && x.text.startsWith('$')).map((x) => x.text));
    assert.deepEqual([...fromSentence].sort(), [...fromCore].sort(), `${t.line}\n${e.sentence}`);
    checked += 1;
  }
  assert.ok(checked > 3000, `${checked} sentences checked`);
});

test('the sentences, word for word', () => {
  const regs = new Array(32).fill(0);
  regs[14] = 0x80000001; // $t6
  regs[8] = 5; regs[9] = 0xfffffffe; regs[29] = 0x7fffffe4; regs[2] = 4;
  const at = (word: number, pc = 0x00400054) => explain(decode(word, pc, 'SpimNoDelaySlot'), regs, pc);
  assert.deepEqual(at(0x000e8843), {
    title: 'sra — Shift Right Arithmetic',
    sentence: '`$t6` 값(`0x80000001`)을 shamt 값(`1`)만큼 오른쪽으로 옮겨 `$s1` 레지스터에 넣습니다. 빈 자리는 부호 비트로 채웁니다.',
  });
  assert.equal(at(0x01095021).sentence, // addu $t2, $t0, $t1
    '`$t0` 값(`0x00000005`)과 `$t1` 값(`0xfffffffe`)을 더해 `$t2` 레지스터에 넣습니다. 넘쳐도 예외는 나지 않습니다.');
  assert.equal(at(0x8fa4fffc).sentence, // lw $a0, -4($sp)
    '`$sp` 값(`0x7fffffe4`)에서 오프셋(`4`)을 뺀 주소(`0x7fffffe0`)의 워드를 읽어 `$a0` 레지스터에 넣습니다.');
  assert.equal(at(0x2008ffff).sentence, // addi $t0, $zero, -1
    '`$zero` 값(`0x00000000`)에 즉시값(`-1`)을 더해 `$t0` 레지스터에 넣습니다.');
  assert.equal(at(0x0000000c).sentence,
    '`$v0` 값(`0x00000004`)에 따라 시스템 호출을 합니다: print_string — `$a0` 값이 가리키는 문자열을 출력.');
  assert.equal(at(0x0c100009, 0x00400014).sentence,
    '돌아올 주소(`0x00400018`)를 `$ra` 레지스터에 넣고 `0x00400024` 주소로 점프합니다(함수 호출).');
  assert.equal(at(0x03e00008).sentence, '`$ra` 값(`0x00000000`)이 가리키는 곳, 곧 이 함수를 부른 곳 다음으로 돌아갑니다.');
  assert.deepEqual(at(0x00000000), { title: 'nop', sentence: '아무것도 하지 않습니다.' });
  assert.equal(at(0xfc000000).title, '이 시뮬레이터가 실행하지 않는 워드입니다');
});

test('code parts', () => {
  assert.deepEqual(codeParts('a `b` c'), [{ text: 'a ', code: false }, { text: 'b', code: true }, { text: ' c', code: false }]);
});
