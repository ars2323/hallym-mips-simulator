/* Enough of PNG to read a screenshot back: what Playwright hands over is a
   PNG, and the checks on the first screen's hierarchy need its pixels.

   Only what Chromium writes -- 8 bits a channel, colour type 2 (RGB) or 6
   (RGBA), no interlacing -- and it says so rather than guessing when it is
   handed anything else.  Feeding the picture back into the window as a
   data: URL would be shorter, but the window's content policy does not
   allow data: images, and loosening it for a test would be the test
   changing the program. */

import { inflateSync } from 'node:zlib';

export interface Picture {
  width: number;
  height: number;
  /** RGBA, four bytes a pixel, top row first. */
  data: Uint8Array;
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function decodePng(png: Buffer): Picture {
  if (!png.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  let width = 0, height = 0, depth = 0, colour = -1, interlace = 0;
  const parts: Buffer[] = [];
  for (let at = 8; at + 8 <= png.length;) {
    const length = png.readUInt32BE(at);
    const type = png.toString('latin1', at + 4, at + 8);
    const body = png.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      colour = body[9];
      interlace = body[12];
    } else if (type === 'IDAT') parts.push(body);
    else if (type === 'IEND') break;
    at += 12 + length;                        // length, type, body, CRC
  }
  if (depth !== 8 || (colour !== 2 && colour !== 6) || interlace !== 0) {
    throw new Error(`PNG depth ${depth}, colour type ${colour}, interlace ${interlace} is not read here`);
  }
  const channels = colour === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * channels;
  const out = new Uint8Array(width * height * 4);
  const line = new Uint8Array(stride);
  const prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const from = y * (stride + 1) + 1;
    for (let i = 0; i < stride; i++) {
      const x = raw[from + i];
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v: number;
      switch (filter) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + b; break;
        case 3: v = x + ((a + b) >> 1); break;
        case 4: {                              // Paeth
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`PNG filter ${filter}`);
      }
      line[i] = v & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const s = x * channels, d = (y * width + x) * 4;
      out[d] = line[s];
      out[d + 1] = line[s + 1];
      out[d + 2] = line[s + 2];
      out[d + 3] = channels === 4 ? line[s + 3] : 255;
    }
    prev.set(line);
  }
  return { width, height, data: out };
}

/** The mean of the picture's greys, 0..255 -- what "how bright is this part
    of the screen" means here. */
export function meanLuminance(p: Picture): number {
  let sum = 0;
  for (let i = 0; i < p.data.length; i += 4) {
    sum += (p.data[i] * 299 + p.data[i + 1] * 587 + p.data[i + 2] * 114) / 1000;
  }
  return sum / (p.data.length / 4);
}
