/* src/core/asm-errors.ts.  (b): the Qt build's tst_asm_errors.cpp table.
   And the messages the core actually writes for the test files, parsed and
   led back to the line they quote. */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import * as spim from '../../native/index.ts';
import {
  assemblerMessageSummary, parseAssemblerMessage, resolveMessageLine, simplified,
} from '../../src/core/asm-errors.ts';
import { root } from '../helpers/machine.ts';

for (const file of ['tests/samples/editor-errors.s', 'tests/programs/tt.alu.bare.s', 'tests/samples/syntax-error-midfile.s']) {
  test(`${file}: the core's messages parse and point at the quoted line`, () => {
    const bytes = readFileSync(path.join(root, file));
    const lines = bytes.toString('utf8').split('\n');
    const r = spim.assemble(bytes, { fileName: file });
    assert.ok(r.errors.length > 0);
    for (const raw of r.errors) {
      const m = parseAssemblerMessage(raw);
      assert.ok(m.hasLocation, raw);
      assert.equal(m.file, file);
      assert.equal(m.raw, raw);
      const line = resolveMessageLine(m, lines);
      if (m.source !== '') {
        // The core quotes the whole line, or the statement without the
        // labels in front of it when the error is past them.
        const whole = simplified(lines[line - 1]);
        const statement = whole.replace(/^([A-Za-z_.][A-Za-z0-9_.]*\s*:\s*)+/, '');
        assert.ok([whole, statement].includes(simplified(m.source)), `${raw}\nline ${line}: ${whole}`);
        assert.ok(line <= m.line, 'upwards from the reported line');
      }
      assert.equal(assemblerMessageSummary(m, line), `${line}: ${m.message}`);
    }
  });
}

// Real output for Tests/tt.alu.bare.s.
test('parser message', () => {
  const m = parseAssemblerMessage(
    'spim: (parser) immediate value (65432) out of range (-32768 .. 32767) on line 414 of file Tests/tt.alu.bare.s\n'
    + '\t  addi $4 $0 0xff98\n'
    + '\t                   ^\n');
  assert.ok(m.hasLocation);
  assert.equal(m.message, 'immediate value (65432) out of range (-32768 .. 32767)');
  assert.equal(m.line, 414);
  assert.equal(m.file, 'Tests/tt.alu.bare.s');
  assert.equal(m.source, 'addi $4 $0 0xff98');
  assert.equal(assemblerMessageSummary(m), '414: immediate value (65432) out of range (-32768 .. 32767)');
  const s = parseAssemblerMessage(
    'spim: (parser) syntax error on line 40 of file /home/u/helloworld.s\n'
    + '\t  main:   li $v0, 4       # syscall 4 (print_str)\n'
    + '\t          ^\n');
  assert.ok(s.hasLocation);
  assert.equal(s.message, 'syntax error');
  assert.equal(s.line, 40);
  assert.equal(s.source, 'main:   li $v0, 4       # syscall 4 (print_str)');
});

test('paths with spaces and Hangul', () => {
  const m = parseAssemblerMessage(
    'spim: (parser) Label is defined for the second time on line 7 of file C:/Users/홍 길동/내 문서/lab 1.s\n\t  main:\n\t  ^\n');
  assert.ok(m.hasLocation);
  assert.equal(m.line, 7);
  assert.equal(m.file, 'C:/Users/홍 길동/내 문서/lab 1.s');
  assert.equal(m.message, 'Label is defined for the second time');
});

test('a message that mentions a line', () => {
  // The LAST " on line N of file " is the location.
  const m = parseAssemblerMessage('spim: (parser) odd message on line 3 of file x on line 12 of file a.s\n');
  assert.ok(m.hasLocation);
  assert.equal(m.line, 12);
  assert.equal(m.file, 'a.s');
  assert.equal(m.message, 'odd message on line 3 of file x');
  assert.equal(m.source, '');
});

test('other messages are kept whole', () => {
  for (const text of ["Cannot open file: `/nonexistent/x.s'\n", 'The following symbols are undefined:\nfoo\n',
                      'Attempt to execute non-instruction at 0x0040002c\n', 'spim: (parser) no location here\n', '']) {
    const m = parseAssemblerMessage(text);
    assert.ok(!m.hasLocation);
    assert.equal(m.line, 0);
    assert.equal(m.raw, text);
    assert.equal(m.message, simplified(text));
    assert.equal(assemblerMessageSummary(m), m.message);
  }
});

// Tests/tt.alu.bare.s: the message says 414, the quoted line is line 413.
test('the line is where the quoted source is', () => {
  const file = ['\tlui $4 0xffff', '\taddi $4 $0 0xff98', '', '# a comment', '\tbne $t1 $4 fail', '\taddi $4 $0 0xff98'];
  let m = parseAssemblerMessage('spim: (parser) immediate value (65432) out of range (-32768 .. 32767) '
                                + 'on line 5 of file x.s\n\t  addi $4 $0 0xff98\n\t        ^\n');
  assert.equal(m.line, 5);
  assert.equal(resolveMessageLine(m, file), 2); // upwards, not line 6
  assert.equal(assemblerMessageSummary(m, 2), '2: immediate value (65432) out of range (-32768 .. 32767)');
  // The nearest match above wins.  (Not in the Qt build's table; added when
  // tools/mutants.ts showed that a search from the top passed it too.)
  const twice = ['\taddi $4 $0 0xff98', 'nop', '\taddi $4 $0 0xff98', 'nop', '\tbne $t1 $4 fail'];
  m = parseAssemblerMessage('spim: (parser) immediate value (65432) out of range (-32768 .. 32767) '
                            + 'on line 5 of file x.s\n\t  addi $4 $0 0xff98\n\t        ^\n');
  assert.equal(resolveMessageLine(m, twice), 3);
  m = parseAssemblerMessage('spim: (parser) syntax error on line 5 of file x.s\n\t  bne $t1 $4 fail\n\t  ^\n');
  assert.equal(resolveMessageLine(m, file), 5);
  m = parseAssemblerMessage('spim: (parser) syntax error on line 4 of file x.s\n\t  gone\n\t  ^\n');
  assert.equal(resolveMessageLine(m, file), 4);
  m = parseAssemblerMessage('spim: (parser) syntax error on line 99 of file x.s\n');
  assert.equal(resolveMessageLine(m, file), 99);
  m = parseAssemblerMessage("Cannot open file: `x.s'\n");
  assert.equal(resolveMessageLine(m, file), 0);
});
