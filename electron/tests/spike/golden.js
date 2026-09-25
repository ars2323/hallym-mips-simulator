// Reader for the Qt build's text-log goldens (tests/golden/text-*.txt).
//
// The format, as text-ttcore.txt has it: a "<Name> Text Segment [a]..[b]"
// header, one line per instruction, a blank line, the next header, and so on.
// An instruction line is
//
//   [00400000] 8fa40000  lw $4, 0($29)            ; 183: lw $a0 0($sp) # argc
//
// i.e. "[" 8 hex digits "] " 8 hex digits, two spaces, the core's
// disassembly, and optionally "; <line>: <source>".  Anything else is an
// error rather than skipped, so a format change cannot pass silently.

import { readFileSync } from 'node:fs';

const HEADER = /^(User|Kernel) Text Segment \[[0-9a-f]{8}\]\.\.\[[0-9a-f]{8}\]$/;
const INST = /^\[([0-9a-f]{8})\] ([0-9a-f]{8})  (.*)$/;

export function readTextGolden(file) {
  const lines = readFileSync(file, 'utf8').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  const insts = [];
  lines.forEach((line, i) => {
    if (line === '' || HEADER.test(line)) return;
    const m = INST.exec(line);
    if (!m) throw new Error(`${file}:${i + 1}: unexpected line: ${line}`);
    insts.push({
      addr: parseInt(m[1], 16),
      word: parseInt(m[2], 16),
      text: m[3],
      lineNo: i + 1,
    });
  });
  return insts;
}
