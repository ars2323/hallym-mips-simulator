/* The executable image, .hmx: an assembled program as memory -- its words,
   its data, where it begins, its labels -- for a program that runs MIPS code
   without assembling it (Hallym Circuit Studio loads these).  Not an object
   file: nothing is left to link or relocate.  The format is specified in
   the repository's docs/hmx-format.md, which is the reference; this writes
   version 1.

   Pure: the image is read from the simulator by src/sim/image.ts. */

export const HMX_MAGIC = 'HALLYM-EXEC';
export const HMX_VERSION = 1;
// A run of this many zero bytes or more is written "zero <count>" (in .text,
// this many bytes' worth of words).
export const ZERO_RUN = 16;
const BYTES_PER_LINE = 16;
const KEY_WIDTH = 14;

export interface HmxSymbol { name: string; addr: number }

// What the machine holds once the program is assembled (src/sim/image.ts).
export interface MachineImage {
  endian: 'little' | 'big';
  entry: number;
  regs: { name: string; value: number }[];   // $sp and $gp
  symbols: HmxSymbol[];                      // the program's own labels, by address
  text: { addr: number; words: number[] };   // user text, the start-up code included
  data: { addr: number; bytes: Uint8Array } | null;
}

export interface ExecImage extends MachineImage {
  source: string;        // the file's name
  sourceSha256: string;  // of the assembled source, as its file holds it
  producedBy: string;    // "Hallym MIPS 2.4.0"
  assembled: string;     // hmxTime()
}

export const hex32 = (n: number): string => '0x' + (n >>> 0).toString(16).padStart(8, '0');
const word = (n: number): string => (n >>> 0).toString(16).padStart(8, '0');
const byte = (n: number): string => n.toString(16).padStart(2, '0');
const field = (key: string, value: string): string => `${key.padEnd(KEY_WIDTH - 1)} ${value}`;

// Local time to the minute, with its offset: 2026-09-27T13:15+09:00.
export function hmxTime(at: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const off = -at.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}T${p(at.getHours())}:${p(at.getMinutes())}` +
    `${sign}${p(Math.floor(Math.abs(off) / 60))}:${p(Math.abs(off) % 60)}`;
}

// Runs of items: zero runs at least `least` long, and the rest.
function runs<T>(items: ArrayLike<T>, isZero: (x: T) => boolean, least: number): { zero: boolean; from: number; to: number }[] {
  const out: { zero: boolean; from: number; to: number }[] = [];
  let i = 0;
  while (i < items.length) {
    let j = i;
    while (j < items.length && isZero(items[j])) j++;
    if (j - i >= least) { out.push({ zero: true, from: i, to: j }); i = j; continue; }
    // Not a long zero run: up to the next one.
    let k = j;
    for (;;) {
      while (k < items.length && !isZero(items[k])) k++;
      let z = k;
      while (z < items.length && isZero(items[z])) z++;
      if (k >= items.length || z - k >= least) break;
      k = z;
    }
    out.push({ zero: false, from: i, to: k });
    i = k;
  }
  return out;
}

export function formatHmx(image: ExecImage): string {
  const lines = [
    `${HMX_MAGIC} ${HMX_VERSION}`,
    field('source', image.source),
    field('source-sha256', image.sourceSha256),
    field('produced-by', image.producedBy),
    field('assembled', image.assembled),
    field('endian', image.endian),
    '',
    field('entry', hex32(image.entry)),
    ...image.regs.map((r) => field(`reg ${r.name}`, hex32(r.value))),
    '',
    ...image.symbols.map((s) => field(`symbol ${s.name}`, hex32(s.addr))),
  ];
  if (image.symbols.length) lines.push('');
  const { text, data } = image;
  lines.push(`.text ${hex32(text.addr)} words ${text.words.length}`);
  for (const r of runs(text.words, (w) => w === 0, ZERO_RUN / 4)) {
    if (r.zero) lines.push(`zero ${r.to - r.from}`);
    else for (let i = r.from; i < r.to; i++) lines.push(word(text.words[i]));
  }
  if (data) {
    lines.push('', `.data ${hex32(data.addr)} bytes ${data.bytes.length}`);
    for (const r of runs(data.bytes, (b) => b === 0, ZERO_RUN)) {
      if (r.zero) { lines.push(`zero ${r.to - r.from}`); continue; }
      for (let i = r.from; i < r.to; i += BYTES_PER_LINE) lines.push([...data.bytes.subarray(i, Math.min(r.to, i + BYTES_PER_LINE))].map(byte).join(' '));
    }
  }
  return lines.join('\n') + '\n';
}
