/* Bytes of a source file <-> text, on the Node side of the addon.

   A port of the Qt build's QtSpim/edu/core/edu_text_file.{h,cpp}, whose
   rule this keeps exactly:

   Opening: a UTF-8 byte order mark is noted and removed; valid UTF-8 is
   UTF-8; anything else is tried as CP949 (what Korean Windows editors wrote
   for decades), and is CP949 if it decodes and encodes back to the very same
   bytes; otherwise Latin-1, which maps every byte to a character and back,
   so even a file in an unknown encoding survives an edit elsewhere in it.

   Saving: the same encoding, the same byte order mark, the same line ends.
   A file opened and saved without a change is the same bytes.  New files are
   UTF-8, no mark, LF.

   The text uses '\n' only.  A file that mixes CRLF and LF cannot keep both;
   it is saved with the kind it has more of, and `mixedLineEnds` says so.

   The decision is a rule, not a guess: no statistical detector is asked
   (docs/PORTING.md, "Encoding").  The simulator core never sees any of this;
   it receives the text as UTF-8 bytes (native/index.ts).
*/

import iconv from 'iconv-lite';

export type Encoding = 'UTF-8' | 'CP949' | 'Latin-1';
export type LineEnd = 'LF' | 'CRLF';

export interface TextFileFormat {
  encoding: Encoding;
  byteOrderMark: boolean; // UTF-8 only
  lineEnd: LineEnd;
}

export interface DecodedTextFile {
  text: string; // '\n' line ends
  format: TextFileFormat;
  mixedLineEnds: boolean;
}

export const NEW_FILE_FORMAT: Readonly<TextFileFormat> =
  Object.freeze({ encoding: 'UTF-8', byteOrderMark: false, lineEnd: 'LF' });

const UTF8_MARK = [0xef, 0xbb, 0xbf];
const utf8Strict = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

function startsWithMark(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && UTF8_MARK.every((b, i) => bytes[i] === b);
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

// True when the bytes are well-formed UTF-8 (plain ASCII included).
export function isValidUtf8(bytes: Uint8Array): boolean {
  try {
    utf8Strict.decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function count(text: string, piece: string): number {
  return text.split(piece).length - 1;
}

export function decodeTextFile(input: Uint8Array): DecodedTextFile {
  let byteOrderMark = false;
  let bytes = input;
  if (startsWithMark(bytes)) {
    byteOrderMark = true;
    bytes = bytes.subarray(3);
  }

  let encoding: Encoding;
  let text: string;
  if (isValidUtf8(bytes)) {
    encoding = 'UTF-8';
    text = utf8Strict.decode(bytes);
  } else {
    byteOrderMark = false; // not UTF-8 after all: keep the bytes
    bytes = input;
    // The CP949 decoder substitutes for what it cannot read, so "is this
    // CP949" is decided by the round trip, as in the Qt build.
    const korean = iconv.decode(Buffer.from(bytes), 'cp949');
    if (sameBytes(iconv.encode(korean, 'cp949'), bytes)) {
      encoding = 'CP949';
      text = korean;
    } else {
      encoding = 'Latin-1';
      text = Buffer.from(bytes).toString('latin1');
    }
  }

  const crlf = count(text, '\r\n');
  const lf = count(text, '\n') - crlf;
  return {
    text: text.replaceAll('\r\n', '\n'),
    format: { encoding, byteOrderMark, lineEnd: crlf > lf ? 'CRLF' : 'LF' },
    mixedLineEnds: crlf > 0 && lf > 0,
  };
}

export type EncodeResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; firstBadLine: number }; // 1-based line of a character the encoding cannot carry

export function encodeTextFile(text: string, format: TextFileFormat): EncodeResult {
  // Find a character the encoding cannot carry before writing anything.
  if (format.encoding !== 'UTF-8') {
    let line = 1;
    for (const c of text) { // by code point: a surrogate pair is one character
      if (c === '\n') {
        line += 1;
        continue;
      }
      const code = c.codePointAt(0)!;
      if (code < 128) continue;
      const representable = format.encoding === 'Latin-1'
        ? code < 256
        // The encoder substitutes '?'; ask for the character back instead.
        : iconv.decode(iconv.encode(c, 'cp949'), 'cp949') === c;
      if (!representable) return { ok: false, firstBadLine: line };
    }
  }

  const out = format.lineEnd === 'CRLF' ? text.replaceAll('\n', '\r\n') : text;
  switch (format.encoding) {
    case 'UTF-8': {
      const body = Buffer.from(out, 'utf8');
      return { ok: true, bytes: format.byteOrderMark ? Buffer.concat([Buffer.from(UTF8_MARK), body]) : body };
    }
    case 'CP949':
      return { ok: true, bytes: iconv.encode(out, 'cp949') };
    case 'Latin-1':
      return { ok: true, bytes: Buffer.from(out, 'latin1') };
  }
}
