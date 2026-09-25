/* src/core/source-text.ts.  (a): every source line the core keeps with an
   instruction, read back and found in the file it came from.  (b): the Qt
   build's tst_source_text.cpp table (without decodeSourceBytes, which this
   build does not need; see the module). */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sourceLineNumber, sourceLineStatement } from '../../src/core/source-text.ts';
import { coreLine, load } from '../helpers/program.ts';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

for (const file of ['tests/programs/tt.core.s', 'tests/programs/helloworld.s', 'tests/samples/data-stack.s']) {
  test(`${file}: every kept source line is the file's line`, () => {
    const p = load(file);
    let checked = 0;
    for (const t of p.text) {
      const { source } = coreLine(t.line);
      if (source === null) continue; // the second word of a pseudo instruction
      const n = sourceLineNumber(source);
      assert.ok(n > 0, `[${t.addr.toString(16)}] ${JSON.stringify(source)}`);
      const statement = norm(sourceLineStatement(source));
      const found = p.sourcesOf(t.addr).some((lines) => {
        const fileLine = norm(lines[n - 1] ?? '');
        // The core leaves out the labels in front of a statement.
        return fileLine === statement || fileLine.replace(/^([A-Za-z_.][A-Za-z0-9_.]*\s*:\s*)+/, '') === statement;
      });
      assert.ok(found, `[${t.addr.toString(16)}] line ${n}: core ${JSON.stringify(statement)}`);
      checked += 1;
    }
    assert.ok(checked > 10);
  });
}

test('line number and statement', () => {
  assert.equal(sourceLineNumber('183: jal main'), 183);
  assert.equal(sourceLineStatement('183: jal main'), 'jal main');
  assert.equal(sourceLineNumber('  7:\tli $v0, 4  '), 7);
  assert.equal(sourceLineStatement('  7:\tli $v0, 4  '), 'li $v0, 4');
  // A colon that is a label, not a line number.
  assert.equal(sourceLineNumber('main: nop'), 0);
  assert.equal(sourceLineStatement('main: nop'), 'main: nop');
  // No colon at all, and nothing there.
  assert.equal(sourceLineNumber('42 nop'), 0);
  assert.equal(sourceLineNumber(''), 0);
  assert.equal(sourceLineStatement(''), '');
  // A number so long it cannot be one.
  assert.equal(sourceLineNumber('1234567890123: nop'), 0);
  // The statement keeps its comment.
  assert.equal(sourceLineStatement('9: syscall # print'), 'syscall # print');
});
