/* The mockups' content, taken from the real simulator: nothing in them is
   typed in by hand.

     node design/mockups/data.ts OUT.js

   Writes `window.MOCK = {...}` for design/mockups/index.html.  lab04.s and
   lab04-ok.s are the course's lab 4 (copied from the Qt repository's
   slides/course/src); tt.core.s gives the Text window a long program. */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import * as spim from '../../native/index.ts';
import { parseAssemblerMessage, resolveMessageLine } from '../../src/core/asm-errors.ts';
import { decode, formatName, mnemonicExpansion } from '../../src/core/decoder.ts';
import { bin32Grouped, hex32, signedDec32 } from '../../src/core/format.ts';
import { instructionDetailLines } from '../../src/core/instruction-text.ts';
import { layoutMemoryRows, rowEnd } from '../../src/core/memory-rows.ts';
import { asciiText } from '../../src/core/memory-text.ts';
import { generalRegisterName, registerGroups, registerName } from '../../src/core/registers.ts';
import { sourceLineNumber, sourceLineStatement } from '../../src/core/source-text.ts';
import { tokenizeMipsLine } from '../../src/core/mips-syntax.ts';

const root = path.join(import.meta.dirname, '..', '..');
const read = (p: string) => readFileSync(path.join(root, p));

function textRows() {
  return spim.textSegment().map((t) => {
    const m = /^\[0x[0-9a-f]{8}\]\t0x[0-9a-f]{8}  (.*)$/s.exec(t.line)!;
    const i = m[1].indexOf(';');
    const disassembly = (i < 0 ? m[1] : m[1].slice(0, i)).trim();
    const source = i < 0 ? '' : m[1].slice(i + 1).trim();
    return {
      addr: hex32(t.addr), word: hex32(t.word).slice(2), disassembly,
      line: sourceLineNumber(source) || null, source: source ? sourceLineStatement(source) : '',
      format: formatName(decode(t.word).format), kernel: t.addr >= 0x80000000,
    };
  });
}

function registers(before: spim.Registers) {
  const now = spim.registers();
  const general = now.general.map((v, n) => ({
    name: generalRegisterName(n), number: n, hex: hex32(v), dec: signedDec32(v), bin: bin32Grouped(v),
    changed: v !== before.general[n],
  }));
  const groups = registerGroups().map((g) => ({
    title: g.title,
    names: g.registers.map(registerName),
  }));
  return { pc: hex32(now.pc), hi: hex32(now.hi), lo: hex32(now.lo), general, groups };
}

function dataRows() {
  const s = spim.segments();
  const from = s.dataBot;
  const to = s.dataTop;
  const words = spim.readWords(from, (to - from) / 4);
  return layoutMemoryRows(from, to, { word: (a) => words[(a - from) / 4] }).map((r) => (r.kind === 'ZeroRun'
    ? { kind: 'zero', from: hex32(r.address), to: hex32(rowEnd(r) - 1), words: r.words }
    : { kind: 'words', addr: hex32(r.address),
        values: Array.from({ length: r.words }, (_, i) => hex32(words[(r.address - from) / 4 + i]).slice(2)),
        chars: asciiText(spim.readBytes(r.address, 4 * r.words)) }));
}

function editorLines(source: string) {
  return source.replace(/\r\n/g, '\n').split('\n').map((text) => ({
    text,
    tokens: tokenizeMipsLine(text).map((t) => [t.start, t.length, t.kind]),
  }));
}

// ---- B: lab04.s, with its error
const lab04 = read('tests/samples/lab04.s').toString('utf8');
const failed = spim.assemble(Buffer.from(lab04), { fileName: 'lab04.s' });
const errors = failed.errors.map((raw) => {
  const m = parseAssemblerMessage(raw);
  return { line: resolveMessageLine(m, lab04.split('\n')), message: m.message, source: m.source, raw };
});

// ---- C, D: lab04-ok.s, stepped to the sll
const labOk = read('tests/samples/lab04-ok.s').toString('utf8');
spim.assemble(Buffer.from(labOk), { fileName: 'lab04.s' });
for (let i = 0; i < 15; i += 1) spim.step(1);
const before = spim.registers();
spim.step(1);
const stepping = {
  registers: registers(before),
  text: textRows(),
  data: dataRows(),
  stack: (() => {
    const sp = spim.registers().general[29];
    const words = spim.readWords(sp, (0x80000000 - sp) / 4);
    return { sp: hex32(sp), words: words.map((w) => hex32(w).slice(2)),
             chars: asciiText(spim.readBytes(sp, 0x80000000 - sp)) };
  })(),
};
const selectedAddr = 0x00400054; // sra $s1, $t6, 1
const selWord = spim.textSegment().find((t) => t.addr === selectedAddr)!;
const selDecoded = decode(selWord.word, selectedAddr, 'SpimNoDelaySlot');
const selDis = /^\[0x[0-9a-f]{8}\]\t0x[0-9a-f]{8}  ([^;]*)/.exec(selWord.line)![1].trim();
const inspector = {
  addr: hex32(selectedAddr),
  word: hex32(selWord.word),
  disassembly: selDis,
  format: formatName(selDecoded.format),
  name: selDecoded.name,
  expansion: mnemonicExpansion(selDecoded.name),
  fields: selDecoded.fields.map((f) => ({ name: f.name, high: f.high, low: f.low, value: f.value,
                                          bits: f.value.toString(2).padStart(f.high - f.low + 1, '0') })),
  lines: instructionDetailLines(selDecoded, selectedAddr, selDis, '', 'SpimNoDelaySlot'),
  source: selWord.line.slice(selWord.line.indexOf(';') + 1).trim(),
  values: { rt: hex32(spim.registers().general[selDecoded.rt]), rtBin: bin32Grouped(spim.registers().general[selDecoded.rt]) },
};

// ---- run lab04-ok to the end, for the console text of a finished run
spim.assemble(Buffer.from(labOk), { fileName: 'lab04.s' });
while (spim.step(100000));
const consoleText = Buffer.from(spim.consoleOutput()).toString('utf8');

// ---- tt.core.s, for density
spim.assemble(read('tests/programs/tt.core.s'));
const ttcore = { instructions: spim.textSegment().length, text: textRows().slice(0, 400) };

const mock = {
  lab04: { name: 'lab04.s', lines: editorLines(lab04), errors },
  labOk: { name: 'lab04.s', lines: editorLines(labOk) },
  stepping, inspector, console: consoleText, ttcore,
  recent: ['lab04.s', 'tutorial.s', 'helloworld.s', 'data-stack.s'], // files that exist in this repository or the Qt one
};
writeFileSync(process.argv[2], `window.MOCK = ${JSON.stringify(mock)};\n`);
console.log(`wrote ${process.argv[2]}: ${errors.length} error(s), ${stepping.text.length} text rows, console ${JSON.stringify(consoleText)}`);
