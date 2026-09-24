/* A source file saved as CP949 (with CRLF, as old Windows editors wrote it)
   assembles to the very same machine as its UTF-8 twin: the bytes are
   decoded in Node and the core receives UTF-8 either way.  The Qt build
   handed the core the file's raw bytes, so there the two differed -- in
   the source lines it keeps and, for a string, in memory. */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import * as spim from '../../native/index.ts';
import { root } from '../helpers/machine.ts';

function machine(file: string) {
  const assembled = spim.assemble(readFileSync(path.join(root, file)));
  const s = spim.segments();
  const state = {
    ok: assembled.ok,
    errors: assembled.errors,
    symbols: assembled.symbols,
    text: spim.textSegment(),
    data: [...spim.readBytes(s.dataBot, s.dataTop - s.dataBot)],
  };
  while (spim.step(100000));
  return { format: assembled.format, state, after: { registers: spim.registers(), errors: spim.errors() } };
}

test('CP949 + CRLF and UTF-8 + LF give the same machine', () => {
  const utf8 = machine('tests/samples/hangul-utf8.s');
  const cp949 = machine('tests/samples/hangul-cp949.s');
  assert.deepEqual(utf8.format, { encoding: 'UTF-8', byteOrderMark: false, lineEnd: 'LF' });
  assert.deepEqual(cp949.format, { encoding: 'CP949', byteOrderMark: false, lineEnd: 'CRLF' });
  assert.ok(utf8.state.ok, utf8.state.errors.join(''));
  assert.deepEqual(cp949.state, utf8.state);
  assert.deepEqual(cp949.after, utf8.after);

  // The Hangul the core kept is Hangul: in a source line, and in memory.
  assert.ok(utf8.state.text.some((t) => t.line.includes('# 출력')));
  const greeting = Buffer.from('안녕하세요, MIPS!\n\0', 'utf8');
  assert.ok(Buffer.from(utf8.state.data).includes(greeting));
});

test('a string source is taken as it is', () => {
  const text = readFileSync(path.join(root, 'tests/samples/hangul-utf8.s'), 'utf8');
  const fromString = spim.assemble(text);
  assert.equal(fromString.format, null);
  const lines = spim.textSegment();
  spim.assemble(readFileSync(path.join(root, 'tests/samples/hangul-utf8.s')));
  assert.deepEqual(lines, spim.textSegment());
});
