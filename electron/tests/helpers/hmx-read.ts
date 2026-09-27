/* A reader of executable images (.hmx), for the tests only: what
   ../docs/hmx-format.md asks of a reader, strictly.  The app writes images
   (src/core/hmx.ts) and never reads them. */

export interface HmxFile {
  version: number;
  fields: Map<string, string>;   // source, source-sha256, produced-by, assembled, endian, entry (as written)
  endian: 'little' | 'big';
  entry: number;
  regs: Map<string, number>;
  symbols: { name: string; addr: number }[];
  text: { addr: number; words: number[] };
  data: { addr: number; bytes: Uint8Array } | null;
}

export class HmxError extends Error {
  constructor(line: number, message: string) { super(`line ${line}: ${message}`); }
}

const KNOWN_VERSION = 1;
const ADDR = /^0x[0-9a-fA-F]{8}$/;

export function readHmx(file: string): HmxFile {
  const lines = file.split(/\r?\n/);
  let n = 0;
  const content = (s: string) => s.trim() !== '' && !s.trimStart().startsWith('#');
  while (n < lines.length && !content(lines[n])) n++;
  const head = /^HALLYM-EXEC\s+(\d+)\s*$/.exec(lines[n] ?? '');
  if (!head) throw new HmxError(n + 1, 'not an executable image: no "HALLYM-EXEC <version>" line');
  const version = Number(head[1]);
  if (version > KNOWN_VERSION) throw new HmxError(n + 1, `version ${version}: this reader knows up to ${KNOWN_VERSION}`);

  const fields = new Map<string, string>();
  const regs = new Map<string, number>();
  const symbols: { name: string; addr: number }[] = [];
  const sections = new Map<string, { addr: number; unit: 'words' | 'bytes'; count: number; items: number[]; line: number }>();
  let current: { addr: number; unit: 'words' | 'bytes'; count: number; items: number[]; line: number } | null = null;
  const addr = (s: string | undefined, line: number) => {
    if (!s || !ADDR.test(s)) throw new HmxError(line, `not an address: ${s ?? '(nothing)'}`);
    return parseInt(s, 16);
  };

  for (n++; n < lines.length; n++) {
    const line = lines[n].trim();
    if (!content(line)) continue;
    const words = line.split(/\s+/);
    const section = /^\.(\w+)$/.exec(words[0]);
    if (section) {
      if (!['text', 'data'].includes(section[1])) throw new HmxError(n + 1, `unknown section ${words[0]}`);
      if (sections.has(section[1])) throw new HmxError(n + 1, `a second ${words[0]}`);
      const unit = section[1] === 'text' ? 'words' : 'bytes';
      if (words[2] !== unit || !/^\d+$/.test(words[3] ?? '') || words.length !== 4) throw new HmxError(n + 1, `expected "${words[0]} <address> ${unit} <count>"`);
      current = { addr: addr(words[1], n + 1), unit, count: Number(words[3]), items: [], line: n + 1 };
      if (unit === 'words' && current.addr % 4) throw new HmxError(n + 1, '.text not on a word boundary');
      sections.set(section[1], current);
      continue;
    }
    if (current) {
      if (words[0] === 'zero') {
        if (words.length !== 2 || !/^\d+$/.test(words[1])) throw new HmxError(n + 1, 'expected "zero <count>"');
        for (let k = Number(words[1]); k > 0; k--) current.items.push(0);
        continue;
      }
      const item = current.unit === 'words' ? /^[0-9a-fA-F]{8}$/ : /^[0-9a-fA-F]{2}$/;
      for (const w of words) {
        if (!item.test(w)) throw new HmxError(n + 1, `not a ${current.unit === 'words' ? 'word' : 'byte'}: ${w}`);
        current.items.push(parseInt(w, 16));
      }
      continue;
    }
    // A field.  Unknown keys are left alone.
    const key = words[0];
    if (key === 'reg') regs.set(words[1], addr(words[2], n + 1));
    else if (key === 'symbol') symbols.push({ name: words[1], addr: addr(words[2], n + 1) });
    else fields.set(key, line.slice(key.length).trim());
  }
  for (const s of sections.values()) {
    if (s.items.length !== s.count) throw new HmxError(s.line, `${s.count} ${s.unit} said, ${s.items.length} given`);
  }

  const endian = fields.get('endian');
  if (endian !== 'little' && endian !== 'big') throw new HmxError(0, `endian: ${endian ?? 'missing'}`);
  const entry = fields.get('entry');
  if (!entry) throw new HmxError(0, 'no entry');
  const text = sections.get('text');
  if (!text) throw new HmxError(0, 'no .text');
  const data = sections.get('data');
  return {
    version, fields, endian, entry: addr(entry, 0), regs, symbols,
    text: { addr: text.addr, words: text.items },
    data: data ? { addr: data.addr, bytes: Uint8Array.from(data.items) } : null,
  };
}
