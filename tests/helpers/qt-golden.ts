/* The Qt build's golden logs, read back into data.

   The goldens are what QtSpim's Save Log File wrote: upstream's HTML for
   the Text, Data and register windows, put through QTextEdit::toPlainText().
   The layout (padding, &nbsp; runs, blank lines between sections) is Qt's
   and has no counterpart in this front end, whose panels are DOM tables.
   What the goldens carry that matters is data -- "the word at A is W, the
   instruction reads D, the register holds V" -- so they are parsed into
   fields and compared field by field (docs/PORTING.md, "Goldens").

   Every line must have one of the shapes below; anything else throws, so a
   golden that stops matching the parser cannot pass by being skipped.
*/

const HEX8 = '[0-9a-f]{8}';

// White space as an HTML view shows it: runs of blanks, tabs and newlines
// are one blank.  Applied to the core's text before it is compared with
// what the Qt view showed of it.
export const collapse = (s: string): string => s.replace(/[ \t\r\n]+/g, ' ').trim();

// ---- Text window ----------------------------------------------------------

export interface GoldenTextLine {
  addr: number;
  word: number | null;     // null when the window hid the encoding
  disassembly: string;     // white space collapsed
  comment: string | null;  // "; 183: lw $a0 0($sp) # argc", collapsed; null if none shown
  lineNo: number;          // in the golden file
}

export interface GoldenTextSection {
  name: string;
  from: number;
  to: number;
  lines: GoldenTextLine[];
}

// Splits an instruction's text where upstream's window did: at the first ';'
// (QtSpim/textwin.cpp formatInstructions: strstr(disassembly, ";")).
export function splitComment(text: string): { disassembly: string; comment: string | null } {
  const i = text.indexOf(';');
  if (i < 0) return { disassembly: collapse(text), comment: null };
  return { disassembly: collapse(text.slice(0, i)), comment: collapse(text.slice(i)) };
}

export function parseTextLog(text: string, file = 'text log'): GoldenTextSection[] {
  const sections: GoldenTextSection[] = [];
  const header = new RegExp(`^(User Text Segment|Kernel Text Segment) \\[(${HEX8})\\]\\.\\.\\[(${HEX8})\\]$`);
  // "[addr] word  disassembly<pad>comment"; the word is absent when hidden.
  const line = new RegExp(`^\\[(${HEX8})\\] (${HEX8})?  (.*)$`);
  text.split('\n').forEach((raw, i) => {
    if (raw === '') return;
    let m = header.exec(raw);
    if (m) {
      sections.push({ name: m[1], from: parseInt(m[2], 16), to: parseInt(m[3], 16), lines: [] });
      return;
    }
    m = line.exec(raw);
    if (!m || sections.length === 0) throw new Error(`${file}:${i + 1}: not a text-log line: ${JSON.stringify(raw)}`);
    sections[sections.length - 1].lines.push({
      addr: parseInt(m[1], 16),
      word: m[2] === undefined ? null : parseInt(m[2], 16),
      ...splitComment(m[3]),
      lineNo: i + 1,
    });
  });
  return sections;
}

// ---- Data window ----------------------------------------------------------

export type GoldenDataRow =
  | { kind: 'ZeroRun'; from: number; last: number; lineNo: number }
  | { kind: 'Words'; address: number; rest: string; lineNo: number };

export interface GoldenDataSection {
  name: string;
  from: number;
  to: number;
  rows: GoldenDataRow[];
}

export function parseDataLog(text: string, file = 'data log'): GoldenDataSection[] {
  const sections: GoldenDataSection[] = [];
  const header = new RegExp(`^(User data segment|User Stack|Kernel data segment) \\[(${HEX8})\\]\\.\\.\\[(${HEX8})\\]$`);
  const zeroRun = new RegExp(`^\\[(${HEX8})\\]\\.\\.\\[(${HEX8})\\]  (0+)$`);
  const words = new RegExp(`^\\[(${HEX8})\\]  (.*)$`);
  text.split('\n').forEach((raw, i) => {
    if (raw === '') return;
    let m = header.exec(raw);
    if (m) {
      sections.push({ name: m[1], from: parseInt(m[2], 16), to: parseInt(m[3], 16), rows: [] });
      return;
    }
    if (sections.length === 0) throw new Error(`${file}:${i + 1}: row before any section`);
    const rows = sections[sections.length - 1].rows;
    m = zeroRun.exec(raw);
    if (m) {
      rows.push({ kind: 'ZeroRun', from: parseInt(m[1], 16), last: parseInt(m[2], 16), lineNo: i + 1 });
      return;
    }
    m = words.exec(raw);
    if (!m) throw new Error(`${file}:${i + 1}: not a data-log line: ${JSON.stringify(raw)}`);
    rows.push({ kind: 'Words', address: parseInt(m[1], 16), rest: m[2], lineNo: i + 1 });
  });
  return sections;
}

// Reads a Words row that should hold `count` words: the values as the
// window printed them, then one character per byte, each followed by a
// blank.  null when the row does not have that shape.
export function readWordsRow(rest: string, count: number): { tokens: string[]; chars: string } | null {
  const charsWidth = 2 * 4 * count;
  if (rest.length < charsWidth) return null;
  const charPart = rest.slice(rest.length - charsWidth);
  let chars = '';
  for (let i = 0; i < charPart.length; i += 2) {
    if (charPart[i + 1] !== ' ') return null;
    chars += charPart[i];
  }
  const tokens = rest.slice(0, rest.length - charsWidth).trim().split(/ +/);
  return tokens.length === count ? { tokens, chars } : null;
}

/* How QtSpim's data window writes a word (QtSpim/datawin.cpp formatWord):
   8 hex digits, 32 binary digits, or a decimal zero-padded to 10.  A
   negative decimal is cut to its last 10 characters, so one with 10 digits
   loses its minus sign ("-1879048156" shows as "1879048156"): upstream's
   bug, in the Qt front end, kept here because the goldens have it. */
export function qtWordText(value: number, base: 2 | 10 | 16): string {
  if (base === 16) return (value >>> 0).toString(16).padStart(8, '0');
  if (base === 2) return (value >>> 0).toString(2).padStart(32, '0');
  const s = String(value | 0);
  return s.length > 10 ? s.slice(s.length - 10) : s.startsWith('-') ? s : s.padStart(10, '0');
}

// ---- Integer register window ---------------------------------------------

export interface GoldenRegisters {
  special: Map<string, number>;                        // PC, EPC, Cause, BadVAddr, Status, HI, LO
  general: { number: number; name: string; value: number }[];
}

export function parseIntRegsLog(text: string, base: 2 | 10 | 16, file = 'register log'): GoldenRegisters {
  const special = new Map<string, number>();
  const general: GoldenRegisters['general'] = [];
  const value = (t: string): number => {
    const ok = base === 16 ? /^[0-9a-f]{1,8}$/ : base === 2 ? /^[01]{1,32}$/ : /^-?\d{1,10}$/;
    if (!ok.test(t)) throw new Error(`${file}: not a base-${base} value: ${t}`);
    return (base === 10 ? Number(t) : parseInt(t, base)) >>> 0;
  };
  text.split('\n').forEach((raw, i) => {
    if (raw === '') return;
    let m = /^(PC|EPC|Cause|BadVAddr|Status|HI|LO) += (\S+)$/.exec(raw);
    if (m) {
      special.set(m[1], value(m[2]));
      return;
    }
    m = /^R(\d+) +\[(\w+)\] = (\S+)$/.exec(raw);
    if (!m) throw new Error(`${file}:${i + 1}: not a register line: ${JSON.stringify(raw)}`);
    general.push({ number: Number(m[1]), name: m[2], value: value(m[3]) });
  });
  return { special, general };
}

// ---- Message window --------------------------------------------------------

/* The Qt message pane.  Its log has the pane's own lines around the core's
   messages: the banner (with the Qt build's version) and "Memory and
   registers cleared".  Those are the Qt front end's text and are matched
   exactly here, as a list, so that a golden that changes them is noticed;
   they are not compared with anything of ours.  The rest is the core's
   messages, which the pane shows with "spim: " taken off each (QtSpim/
   spimview.cpp WriteOutput) and through HTML, so tabs are gone. */
export const QT_PANE_LINES: readonly string[] = [
  'Memory and registers cleared',
  'Hallym MIPS Simulator 1.2.4',
  'MIPS32 assembler and simulator · AIAC Lab, Hallym University',
  'Based on SPIM 9.1.24 by James Larus (BSD). See Help > About > License.',
];

export interface GoldenMessages {
  parser: string[];   // each parser message, "spim: " restored, lines joined by '\n'
  other: string[];    // any other message line (run-time errors), as shown
}

export function parseMessageLog(text: string): GoldenMessages {
  const parser: string[] = [];
  const other: string[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === '' || QT_PANE_LINES.includes(line)) continue;
    if (line.startsWith('(parser) ')) {
      // The message, the quoted source, the caret line.
      parser.push(['spim: ' + line, lines[i + 1] ?? '', lines[i + 2] ?? ''].join('\n'));
      i += 2;
      continue;
    }
    other.push(line);
  }
  return { parser, other };
}
