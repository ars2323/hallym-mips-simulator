/* src/node/text-file.ts.  (b): the Qt build's tst_text_file.cpp -- a file
   opened and saved unchanged is the same bytes, whatever its encoding, byte
   order mark and line ends. */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { NEW_FILE_FORMAT, decodeTextFile, encodeTextFile, type TextFileFormat } from '../../src/node/text-file.ts';

const b = (...parts: (string | number[])[]) =>
  Buffer.concat(parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'latin1') : Buffer.from(p))));
// "# 출력" in the two encodings.
const UTF8_COMMENT = [0x23, 0x20, 0xec, 0xb6, 0x9c, 0xeb, 0xa0, 0xa5];
const CP949_COMMENT = [0x23, 0x20, 0xc3, 0xe2, 0xb7, 0xc2];

test('round trip', () => {
  const table: [string, Buffer, TextFileFormat['encoding'], boolean, TextFileFormat['lineEnd']][] = [
    ['ascii lf', b('\t.text\nmain:\tjr $ra\n'), 'UTF-8', false, 'LF'],
    ['ascii crlf', b('\t.text\r\nmain:\tjr $ra\r\n'), 'UTF-8', false, 'CRLF'],
    ['no final newline', b('a\nb'), 'UTF-8', false, 'LF'],
    ['empty', b(''), 'UTF-8', false, 'LF'],
    ['tabs and trailing blanks', b('\tli\t$v0, 4   \n\n\n'), 'UTF-8', false, 'LF'],
    ['utf8 hangul lf', b('syscall ', UTF8_COMMENT, '\n'), 'UTF-8', false, 'LF'],
    ['utf8 hangul crlf', b('syscall ', UTF8_COMMENT, '\r\nnop\r\n'), 'UTF-8', false, 'CRLF'],
    ['utf8 with mark', b([0xef, 0xbb, 0xbf], UTF8_COMMENT, '\r\n'), 'UTF-8', true, 'CRLF'],
    ['mark only', b([0xef, 0xbb, 0xbf]), 'UTF-8', true, 'LF'],
    ['cp949 hangul crlf', b('syscall ', CP949_COMMENT, '\r\nnop\r\n'), 'CP949', false, 'CRLF'],
    ['cp949 hangul lf', b('syscall ', CP949_COMMENT, '\n'), 'CP949', false, 'LF'],
    // Neither UTF-8 nor CP949: every byte still comes back.
    ['unknown bytes', b('x ', [0xff, 0xfe, 0x80], ' y\n'), 'Latin-1', false, 'LF'],
  ];
  for (const [name, bytes, encoding, mark, lineEnd] of table) {
    const d = decodeTextFile(bytes);
    assert.equal(d.format.encoding, encoding, name);
    assert.equal(d.format.byteOrderMark, mark, name);
    if (bytes.includes(0x0a)) assert.equal(d.format.lineEnd, lineEnd, name);
    assert.ok(!d.mixedLineEnds, name);
    assert.ok(!d.text.includes('\r'), name);
    if (encoding !== 'Latin-1' && (bytes.includes(0xec) || encoding === 'CP949')) assert.ok(d.text.includes('출력'), name);
    const saved = encodeTextFile(d.text, d.format);
    assert.ok(saved.ok, name);
    assert.deepEqual(Buffer.from(saved.bytes), bytes, name);
  }
});

test('mixed line ends go with the majority', () => {
  let d = decodeTextFile(b('a\r\nb\r\nc\n'));
  assert.ok(d.mixedLineEnds);
  assert.equal(d.format.lineEnd, 'CRLF');
  assert.equal(d.text, 'a\nb\nc\n');
  const saved = encodeTextFile(d.text, d.format);
  assert.ok(saved.ok);
  assert.deepEqual(Buffer.from(saved.bytes), b('a\r\nb\r\nc\r\n'));
  d = decodeTextFile(b('a\nb\nc\r\n'));
  assert.ok(d.mixedLineEnds);
  assert.equal(d.format.lineEnd, 'LF');
});

test('new file defaults', () => {
  assert.deepEqual(NEW_FILE_FORMAT, { encoding: 'UTF-8', byteOrderMark: false, lineEnd: 'LF' });
  const saved = encodeTextFile('# 출력\nnop\n', NEW_FILE_FORMAT);
  assert.ok(saved.ok);
  assert.deepEqual(Buffer.from(saved.bytes), b(UTF8_COMMENT, '\nnop\n'));
});

test('an unrepresentable character is refused', () => {
  // U+1F600 (an emoji) is not in CP949; it is on line 3.
  assert.deepEqual(encodeTextFile('# 출력\nnop\n# \u{1F600}\n', { ...NEW_FILE_FORMAT, encoding: 'CP949' }),
                   { ok: false, firstBadLine: 3 });
  assert.deepEqual(encodeTextFile('ok\n출력\n', { ...NEW_FILE_FORMAT, encoding: 'Latin-1' }), { ok: false, firstBadLine: 2 });
});

test('an edited CP949 file stays CP949', () => {
  const d = decodeTextFile(b('nop ', CP949_COMMENT, '\r\n'));
  const saved = encodeTextFile(d.text + 'syscall # 입력\n', d.format);
  assert.ok(saved.ok);
  assert.deepEqual(Buffer.from(saved.bytes), b('nop ', CP949_COMMENT, '\r\nsyscall # ', [0xc0, 0xd4, 0xb7, 0xc2], '\r\n'));
});
