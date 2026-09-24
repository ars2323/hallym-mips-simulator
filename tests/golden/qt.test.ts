/* The Qt build's goldens (tests/golden/*.txt, copied from its c20d0c3),
   replayed on the addon and compared field by field.

   Proves that the core behind this front end is the Qt build's: the same
   instruction words and disassembly, the same memory, the same registers,
   the same assembler messages.  For that the program must see the stack
   the goldens were captured with, so the run parameters here are the Qt
   capture environment -- and ONLY here.  They must never become a default
   of the addon or the app (docs/PORTING.md, "Run parameters").
*/

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';

import * as spim from '../../native/index.ts';
import { parseAssemblerMessage, simplified } from '../../src/core/asm-errors.ts';
import { asciiText } from '../../src/core/memory-text.ts';
import { rowEnd } from '../../src/core/memory-rows.ts';
import { dataSections, readCases, replay, root, textSections, type GoldenCase, type Replayed } from '../helpers/machine.ts';
import {
  QT_PANE_LINES, collapse, parseDataLog, qtWordText, parseIntRegsLog, parseMessageLog, parseTextLog, readWordsRow, splitComment,
} from '../helpers/qt-golden.ts';

// tools/capture-goldens.sh in the Qt repository: `env -i` with three
// variables, and no argv (the program was loaded with --load-cmdline, which
// leaves the recent-file list, and so argv[0], empty).  The order is
// environ's, which decides where each string lands on the stack.
const QT_CAPTURE_RUN: spim.RunParameters = Object.freeze({
  argv: [],
  env: ['QT_QPA_PLATFORM=offscreen', 'HOME=/nonexistent', 'XDG_CONFIG_HOME=/nonexistent/config'],
});

const hex = (n: number): string => '0x' + (n >>> 0).toString(16).padStart(8, '0');
const golden = (name: string): string => readFileSync(path.join(root, 'tests/golden', name + '.txt'), 'utf8');

/* QtSpim's Text window drops a comment the core glued to the disassembly.
   When an instruction's text is 57 columns or more, format_an_inst() puts
   "; N: ..." right after it with no blank; formatInstructions()
   (QtSpim/textwin.cpp) steps back over blanks from the ';' and writes '\0'
   one past them -- which, with no blank to step over, is the ';' itself,
   cutting the comment off.  Upstream's own bug, in the Qt front end; the
   core's line is intact. */
function commentQtShows(coreText: string): string | null {
  const i = coreText.indexOf(';');
  if (i < 0 || coreText[i - 1] !== ' ') return null;
  return splitComment(coreText).comment;
}

/* Where this front end and QtSpim show different source lines, and both
   texts.  QtSpim's scanner reads the file through a FILE* in 16 KB pieces;
   each refill moves the pending text to the start of flex's buffer and the
   core's current_line pointer (CPU/scanner.l) is left showing other bytes.
   This front end hands the scanner the whole file in one buffer, so the
   line is the source's (native/src/addon.cc readAssemblyBytes;
   docs/PORTING.md, "Source line display").  Both sides are pinned: a change
   on either fails. */
const SOURCE_LINE_DIFFERENCES: Record<string, Record<number, { qt: string; ours: string }>> = {
  'Tests/tt.core.s': {
    0x00400f18: { qt: '; 1155:', ours: '; 1155: mtlo $0' },
    0x0040206c: { qt: '; 2372: 42: c.u', ours: '; 2372: bc1f l230' },
    0x004031f8: { qt: '; 3577: _str)', ours: '; 3577: li $v0 4 # syscall 4 (print_str)' },
    0x00403b9c: { qt: '; 4195: ble $0 $0 l1', ours: '; 4195: ble $0 $0 l140' },
    0x00404970: { qt: '; 4857: li $v0, 10 # syscal', ours: '; 4857: li $v0, 10 # syscall 10 (exit)' },
  },
};

function coreText(line: string): string {
  const m = /^\[0x[0-9a-f]{8}\]\t0x[0-9a-f]{8}  (.*)$/s.exec(line);
  assert.ok(m, `core line ${JSON.stringify(line)}`);
  return m[1];
}

function compareText(c: GoldenCase, r: Replayed): string {
  const expected = parseTextLog(golden(c.name), c.name);
  const ours = textSections(r.display);
  assert.deepEqual(expected.map((s) => [s.name, s.from, s.to]), ours.map((s) => [s.name, s.from, s.to]), 'sections');
  const pinned = SOURCE_LINE_DIFFERENCES[c.program] ?? {};
  let lines = 0;
  let pinnedSeen = 0;
  let breakpoints = 0;
  expected.forEach((section, si) => {
    assert.equal(section.lines.length, ours[si].lines.length, `${section.name}: instruction count`);
    section.lines.forEach((g, li) => {
      const o = ours[si].lines[li];
      const where = `${c.name}:${g.lineNo} [${hex(o.addr)}]`;
      assert.equal(o.breakpoint, g.breakpoint !== null, `${where} breakpoint`);
      if (g.breakpoint) {
        assert.equal(hex(o.addr).slice(2, 9), g.breakpoint.addrDigits, `${where} address digits`);
        assert.equal(hex(o.word).slice(2, 9), g.breakpoint.wordDigits, `${where} word digits`);
        breakpoints += 1;
      } else {
        assert.equal(g.addr, o.addr, `${where} address`);
        if (r.display.textValue) assert.equal(g.word, o.word, `${where} word`);
        else assert.equal(g.word, null, `${where} word shown although hidden`);
      }
      const text = coreText(o.line);
      assert.equal(g.disassembly, splitComment(text).disassembly, `${where} disassembly`);
      if (!r.display.textComments) {
        assert.equal(g.comment, null, `${where} comment shown although hidden`);
      } else if (pinned[g.addr]) {
        assert.equal(g.comment, pinned[g.addr].qt, `${where} Qt's source line`);
        assert.equal(commentQtShows(text), pinned[g.addr].ours, `${where} our source line`);
        pinnedSeen += 1;
      } else {
        assert.equal(g.comment, commentQtShows(text), `${where} comment`);
      }
      lines += 1;
    });
  });
  if (r.display.textComments && r.display.textUser) {
    assert.equal(pinnedSeen, Object.keys(pinned).length, 'every pinned difference was met');
  }
  assert.equal(breakpoints, r.breakpoints.length, 'every breakpoint shown');
  return `${lines} instructions` + (pinnedSeen ? `, ${pinnedSeen} pinned source-line differences` : '')
    + (breakpoints ? `, ${breakpoints} breakpoint` : '');
}

function compareData(c: GoldenCase, r: Replayed): string {
  const expected = parseDataLog(golden(c.name), c.name);
  const ours = dataSections(r.display);
  assert.deepEqual(expected.map((s) => [s.name, s.from, s.to]), ours.map((s) => [s.name, s.from, s.to]), 'sections');
  let words = 0;
  expected.forEach((section, si) => {
    const rows = ours[si].rows;
    assert.equal(section.rows.length, rows.length, `${section.name}: row count`);
    section.rows.forEach((g, i) => {
      const o = rows[i];
      const where = `${c.name}:${g.lineNo}`;
      if (g.kind === 'ZeroRun') {
        assert.equal(o.kind, 'ZeroRun', `${where} kind`);
        assert.deepEqual([g.from, g.last], [o.address, rowEnd(o) - 1], `${where} zero run`);
        words += o.words;
        return;
      }
      assert.equal(o.kind, 'Words', `${where} kind`);
      assert.equal(g.address, o.address, `${where} address`);
      const row = readWordsRow(g.rest, o.words);
      assert.ok(row, `${where}: not ${o.words} words: ${JSON.stringify(g.rest)}`);
      assert.deepEqual(row.tokens, o.values.map((v) => qtWordText(v, r.display.dataBase)), `${where} values`);
      assert.equal(row.chars, asciiText(o.bytes), `${where} characters`);
      words += o.words;
    });
  });
  return `${words} words`;
}

function compareRegisters(c: GoldenCase, r: Replayed): string {
  const g = parseIntRegsLog(golden(c.name), r.display.regBase, c.name);
  const o = spim.registers();
  assert.deepEqual(Object.fromEntries(g.special), {
    PC: o.pc, EPC: o.epc, Cause: o.cause, BadVAddr: o.badVAddr, Status: o.status, HI: o.hi, LO: o.lo,
  });
  const names = spim.registerNames();
  assert.deepEqual(g.general, o.general.map((value, number) => ({ number, name: names[number], value })));
  return `${g.special.size + g.general.length} registers`;
}

function compareMessages(c: GoldenCase, r: Replayed): string {
  const text = golden(c.name);
  const g = parseMessageLog(text);
  // The pane's own lines are all known ones (else the parser would have
  // taken them for messages).
  for (const line of text.split('\n')) {
    if (line !== '' && !line.startsWith('(parser) ') && !g.other.includes(line) && !g.parser.some((p) => p.includes(line))) {
      assert.ok(QT_PANE_LINES.includes(line), `unexpected pane line ${JSON.stringify(line)}`);
    }
  }
  const located = r.assembled.errors.map(parseAssemblerMessage).filter((m) => m.hasLocation);
  const view = (raw: string) => {
    const m = parseAssemblerMessage(raw);
    const caret = raw.split('\n')[2] ?? '';
    return { message: m.message, line: m.line, file: m.file, source: simplified(m.source),
             caretColumn: caret.replace(/\t/g, '').indexOf('^') };
  };
  assert.deepEqual(g.parser.map(view), located.map((m) => view(m.raw)), 'parser messages');
  const others = [...r.assembled.errors.map(parseAssemblerMessage).filter((m) => !m.hasLocation).map((m) => m.message),
                  ...r.runErrors.map(collapse)];
  assert.deepEqual(g.other, others, 'other messages');
  return `${g.parser.length} parser, ${g.other.length} other messages`;
}

describe('Qt goldens under the Qt capture environment', () => {
  for (const c of readCases()) {
    test(`${c.name} (${c.stream})`, (t) => {
      const r = replay(c, QT_CAPTURE_RUN);
      const summary = c.stream === 'text-log' ? compareText(c, r)
        : c.stream === 'data-log' ? compareData(c, r)
        : c.stream === 'intregs-log' ? compareRegisters(c, r)
        : compareMessages(c, r);
      t.diagnostic(summary);
    });
  }
});
