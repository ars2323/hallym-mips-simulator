/* Check 2: src/core/decoder.ts against the SPIM core, through the addon.

     node tests/spike/check-decoder.ts [PROGRAM...]

   Defaults to tests/programs/tt.core.s.  Every instruction the core
   assembles (user and kernel text, so CPU/exceptions.s too) is decoded by
   the TS decoder and by the core's own inst_decode() + format_an_inst(),
   which the addon's disassemble() returns as text:

     [0x00400000]\t0x8fa40000  lw $4, 0($29)

   The expected answers are never written down here; they come from that
   text.  For each word:

     name     ours == the mnemonic the core prints.  A handful of words the
              core's inst_decode() is known to misname (below) are allowed
              and counted, as the Qt build's oracle test pins them.
     fields   the core's operands are rebuilt from OUR bit fields, the way
              inst_decode() slots them and format_an_inst() prints them for
              that instruction's op.h type, and must equal the core's text
              character for character.  The operand shape comes from
              CPU/op.h; the values come only from the TS decoder.
     format   ours == the format rule restated independently (the spec).
     tiling   the fields cover bits 31..0 exactly and reassemble to the word.
*/

import { readFileSync } from 'node:fs';
import path from 'node:path';

import * as spim from '../../native/index.js';
import {
  decode, formatName, reassemble, type DecodedInstruction,
} from '../../src/core/decoder.ts';

const root = path.join(import.meta.dirname, '..', '..');
const programs = process.argv.length > 2
  ? process.argv.slice(2)
  : [path.join(root, 'tests/programs/tt.core.s')];

const hex8 = (n: number): string => (n >>> 0).toString(16).padStart(8, '0');

// ---- CPU/op.h as data ------------------------------------------------------

interface Op { name: string; type: string; release2: boolean }

function readOpTable(): Map<string, Op> {
  const text = readFileSync(path.join(root, 'CPU/op.h'), 'latin1');
  const ops = new Map<string, Op>();
  // OP("name", Y_..._OP, TYPE, encoding)   optionally   /* MIPS32 Rev 2 */
  // Over the whole text, since some entries are wrapped onto two lines.
  const entry = /OP\("([^"]+)",\s*\w+,\s*(\w+),\s*(-?\w+)\)([^\n]*)/g;
  for (const m of text.matchAll(entry)) {
    if (m[3] === '-1') continue; // directive or pseudo instruction
    ops.set(m[1], { name: m[1], type: m[2], release2: m[4].includes('MIPS32 Rev 2') });
  }
  return ops;
}
const ops = readOpTable();

// ---- what the core would print, from our fields ----------------------------

// spim.h SIGN_EX, applied as inst.h IDISP does: to the offset already
// shifted left, so it looks at bit 15 of (offset << 2).
const idisp = (simm: number): number => {
  const v = simm << 2;
  return v & 0x8000 ? (v | 0xffff0000) | 0 : v;
};

// format_an_inst()'s operand text for each op.h type, fed with the slots
// inst_decode() fills from the word (both in CPU/inst.cpp).  Three types
// are slotted oddly by inst_decode() and printed accordingly -- the core's
// quirks, reproduced, not ours:
//   FP_CMP     slots BIN_FD where FS is printed and prints FD as 0, so
//              "c.eq.d $f2, $f4" reads back as "c.eq.d $f<fd bits>, $f4"
//   FP_MOVC    likewise prints $f0 for fd and the fd bits for fs
//   BC         prints the condition code glued to the name ("bc1t0 -12")
function coreOperands(type: string, d: DecodedInstruction): string | null {
  const { rs, rt, rd, shamt, simm } = d;
  switch (type) {
    case 'BC_TYPE_INST':      return `${rt >> 2} ${idisp(simm)}`;
    case 'B1_TYPE_INST':      return ` $${rs} ${idisp(simm)}`;
    case 'I1s_TYPE_INST':     return ` $${rs}, ${simm}`;
    case 'I1t_TYPE_INST':     return ` $${rt}, ${simm}`;
    case 'I2_TYPE_INST':      return ` $${rt}, $${rs}, ${simm}`;
    case 'B2_TYPE_INST':      return ` $${rs}, $${rt}, ${idisp(simm)}`;
    case 'I2a_TYPE_INST':     return ` $${rt}, ${simm}($${rs})`;
    case 'R1s_TYPE_INST':     return ` $${rs}`;
    case 'R1d_TYPE_INST':     return ` $${rd}`;
    case 'R2td_TYPE_INST':    return ` $${rt}, $${rd}`;
    case 'R2st_TYPE_INST':    return ` $${rs}, $${rt}`;
    case 'R2ds_TYPE_INST':    return ` $${rd}, $${rs}`;
    case 'R2sh_TYPE_INST':    return d.word === 0 ? '' : ` $${rd}, $${rt}, ${shamt}`;
    case 'R3_TYPE_INST':      return ` $${rd}, $${rs}, $${rt}`;
    case 'R3sh_TYPE_INST':    return ` $${rd}, $${rt}, $${rs}`;
    case 'FP_I2a_TYPE_INST':  return ` $f${rt}, ${simm}($${rs})`;
    case 'FP_R2ds_TYPE_INST': return ` $f${shamt}, $f${rd}`;
    case 'FP_R2ts_TYPE_INST': return ` $${rt}, $f${rd}`;
    case 'FP_CMP_TYPE_INST':  return ` $f${shamt}, $f${rt}`;
    case 'FP_R3_TYPE_INST':   return ` $f${shamt}, $f${rd}, $f${rt}`;
    case 'MOVC_TYPE_INST':    return ` $${rd}, $${rs}, ${rt >> 2}`;
    case 'FP_MOVC_TYPE_INST': return ` $f0, $f${shamt}, ${rt >> 2}`;
    case 'J_TYPE_INST':       return ` 0x${hex8(d.target << 2)}`;
    case 'NOARG_TYPE_INST':   return '';
    default:                  return null;
  }
}

// ---- reading the core's line ------------------------------------------------

const CORE_LINE = /^\[0x([0-9a-f]{8})\]\t0x([0-9a-f]{8})  (.*)$/;

interface CoreView { name: string; operands: string }

function coreView(line: string, addr: number, word: number): CoreView | string {
  const m = CORE_LINE.exec(line);
  if (!m) return `unreadable core line ${JSON.stringify(line)}`;
  if (parseInt(m[1], 16) !== addr || parseInt(m[2], 16) !== word) {
    return `core echoed [${m[1]}] ${m[2]}`;
  }
  const rest = m[3];
  if (rest.startsWith('<unknown instruction')) return { name: '', operands: '' };
  const space = rest.indexOf(' ');
  let name = space < 0 ? rest : rest.slice(0, space);
  let operands = space < 0 ? '' : rest.slice(space);
  // BC_TYPE: the condition code is glued to the name.
  const bc = /^(bc[12][ft]l?)(\d+)$/.exec(name);
  if (bc && ops.get(bc[1])?.type === 'BC_TYPE_INST') {
    name = bc[1];
    operands = bc[2] + operands;
  }
  return { name, operands };
}

// ---- the independent restatements -------------------------------------------

// The format rule restated from the spec, independently of the decoder.
function expectedFormat(word: number): string {
  const opcode = word >>> 26;
  if (opcode === 0x00 || opcode === 0x1c) return 'R';
  if (opcode === 0x02 || opcode === 0x03) return 'J';
  if (opcode === 0x10) return 'CP0';
  if (opcode === 0x11) return ((word >>> 21) & 0x1f) === 8 ? 'FI' : 'FR';
  return 'I';
}

function tilingProblem(d: DecodedInstruction): string {
  let next = 31;
  for (const f of d.fields) {
    if (f.high !== next || f.low > f.high) return `field ${f.name} does not continue at bit ${next}`;
    next = f.low - 1;
  }
  if (next !== -1) return `fields stop at bit ${next + 1}`;
  if (reassemble(d) !== d.word) return `reassembles to 0x${hex8(reassemble(d))}`;
  return '';
}

// The core's inst_decode() misnames these (ours = what the assembler
// emitted, which the addon's textSegment() words are).  From the Qt build's
// tests/edu_oracle/tst_decoder_oracle.cpp, where each is explained.
const CORE_DECODE_QUIRKS: Record<string, string> = {
  'bc1fl': 'bc1f', 'bc1tl': 'bc1t', 'bc2fl': 'bc2f', 'bc2t': 'bc2f',
  'bc2tl': 'bc2f', 'cop2': '', 'movt': 'movf', 'movt.d': 'movf.d',
  'movt.s': 'movf.s',
};

// ---- run --------------------------------------------------------------------

let failed = false;

for (const program of programs) {
  const result = spim.assemble(readFileSync(program, 'utf8'));
  const text = spim.textSegment();

  const failures: string[] = [];
  const fail = (s: string) => { if (failures.length < 25) failures.push(s); };
  const names = new Map<string, number>();
  const formats = new Map<string, number>();
  const quirks = new Map<string, number>();
  const release2 = new Map<string, number>();
  let fieldChecks = 0;

  for (const { addr, word } of text) {
    const where = `[${hex8(addr)}] ${hex8(word)}`;
    const ours = decode(word, addr, 'SpimNoDelaySlot');
    const core = coreView(spim.disassemble(word, addr), addr, word);
    if (typeof core === 'string') { fail(`${where}: ${core}`); continue; }

    // name.  "nop" is a pseudo instruction in op.h; the core prints an
    // all-zero word as sll and then overwrites the name (R2sh_TYPE_INST).
    let shape = core.name === 'nop' ? 'sll' : core.name;
    if (ours.name !== core.name) {
      const coreOp = ops.get(core.name);
      if (CORE_DECODE_QUIRKS[ours.name] === core.name) {
        const k = `${ours.name}->${core.name || '(invalid)'}`;
        quirks.set(k, (quirks.get(k) ?? 0) + 1);
        shape = ours.name;
      } else if (coreOp?.release2 && ours.known) {
        // op.h gives a Release 2 instruction the same encoding as an
        // implemented one; which the core's bsearch finds depends on qsort.
        const k = `${ours.name}->${core.name}`;
        release2.set(k, (release2.get(k) ?? 0) + 1);
        shape = ours.name;
      } else {
        fail(`${where}: name "${ours.name}", core "${core.name}"`);
        continue;
      }
    }
    names.set(ours.name, (names.get(ours.name) ?? 0) + 1);

    // format and tiling
    const fmt = formatName(ours.format);
    formats.set(fmt, (formats.get(fmt) ?? 0) + 1);
    if (fmt !== expectedFormat(word)) fail(`${where} ${ours.name}: format ${fmt}, spec ${expectedFormat(word)}`);
    const tiling = tilingProblem(ours);
    if (tiling) fail(`${where} ${ours.name}: ${tiling}`);

    // fields, through the core's own operand text
    if (!ours.known) continue; // both sides call it unknown: nothing to print
    const op = ops.get(shape);
    const expected = op ? coreOperands(op.type, ours) : null;
    if (expected === null) {
      fail(`${where} ${ours.name}: no operand shape for op.h type ${op?.type ?? '(none)'}`);
      continue;
    }
    // A quirk-named word is printed with the core's name's shape; only the
    // exact matches are field checks.
    if (shape === core.name || core.name === 'nop') {
      fieldChecks += 1;
      if (expected !== core.operands) {
        fail(`${where} ${ours.name}: operands from our fields "${expected}", core "${core.operands}"`);
      }
    }
  }

  const base = path.basename(program);
  const distinct = new Set(text.map((t) => t.word)).size;
  console.log(`${failures.length ? 'FAIL' : 'PASS'}  ${base}: ${text.length} instructions ` +
              `(${distinct} distinct words, ${names.size} mnemonics), ` +
              `${fieldChecks} operand texts matched field by field` +
              (result.ok ? '' : `  [assembler reported ${result.errors.length} error(s)]`));
  console.log(`      formats: ${[...formats].map(([k, v]) => `${k} ${v}`).join(', ')}`);
  if (quirks.size) console.log(`      core inst_decode() quirks met: ${[...quirks].map(([k, v]) => `${k} x${v}`).join(', ')}`);
  if (release2.size) console.log(`      Release 2 duplicate encodings: ${[...release2].map(([k, v]) => `${k} x${v}`).join(', ')}`);
  for (const f of failures) console.log(`      ${f}`);
  if (failures.length) failed = true;
}

process.exit(failed ? 1 : 0);
