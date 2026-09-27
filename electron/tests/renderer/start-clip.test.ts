/* The first screen's video file (assets/hallym/start/, made by
   tools/start-video.ts): one track, VP9 video, 960x540 -- no sound track at
   all; small; its still the same size.  Read from the WebM's own track list
   (EBML), not from a player. */

import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { clipArgs, OUT_DIR } from '../../tools/start-video.ts';

const CLIP = path.join(OUT_DIR, 'start.webm');
const STILL = path.join(OUT_DIR, 'start.jpg');

// An EBML element: its id (with the length marker), and where its data is.
interface Element { id: number; start: number; end: number }
function vint(b: Buffer, at: number, keepMarker: boolean): { value: number; length: number; unknown: boolean } {
  let length = 1;
  while (length <= 8 && !(b[at] & (0x80 >> (length - 1)))) length++;
  let value = keepMarker ? b[at] : b[at] & (0xff >> length);
  let ones = value === (0xff >> length);
  for (let k = 1; k < length; k++) { value = value * 256 + b[at + k]; ones &&= b[at + k] === 0xff; }
  return { value, length, unknown: !keepMarker && ones };
}
function* children(b: Buffer, start: number, end: number): Generator<Element> {
  for (let at = start; at < end;) {
    const id = vint(b, at, true);
    const size = vint(b, at + id.length, false);
    const data = at + id.length + size.length;
    const stop = size.unknown ? end : data + size.value;
    yield { id: id.value, start: data, end: stop };
    at = stop;
  }
}
const child = (b: Buffer, e: Element, id: number) => [...children(b, e.start, e.end)].find((c) => c.id === id);
const uint = (b: Buffer, e: Element) => { let v = 0; for (let i = e.start; i < e.end; i++) v = v * 256 + b[i]; return v; };

interface Track { type: number; codec: string; width?: number; height?: number }
function tracks(file: string): Track[] {
  const b = readFileSync(file);
  const segment = [...children(b, 0, b.length)].find((e) => e.id === 0x18538067)!;
  let list: Element | undefined;
  for (const e of children(b, segment.start, segment.end)) if (e.id === 0x1654ae6b) { list = e; break; }
  assert.ok(list, 'no Tracks element');
  return [...children(b, list.start, list.end)].filter((e) => e.id === 0xae).map((entry) => {
    const video = child(b, entry, 0xe0);
    const codec = child(b, entry, 0x86)!;
    return {
      type: uint(b, child(b, entry, 0x83)!),
      codec: b.subarray(codec.start, codec.end).toString('latin1'),
      ...(video ? { width: uint(b, child(b, video, 0xb0)!), height: uint(b, child(b, video, 0xba)!) } : {}),
    };
  });
}

test('the clip: one track, VP9 video at 960x540, and no sound track', () => {
  assert.deepEqual(tracks(CLIP), [{ type: 1, codec: 'V_VP9', width: 960, height: 540 }]); // TrackType 1: video (2 would be audio)
});

test('the clip is small (under 3 MB), its still under 200 kB and the same size', () => {
  assert.ok(statSync(CLIP).size < 3_000_000, `${statSync(CLIP).size} bytes`);
  const jpg = readFileSync(STILL);
  assert.ok(jpg.length < 200_000, `${jpg.length} bytes`);
  // The JPEG's frame header (SOF0..SOF2): height, then width.
  let at = 2;
  while (!(jpg[at + 1] >= 0xc0 && jpg[at + 1] <= 0xc2)) at += 2 + jpg.readUInt16BE(at + 2);
  assert.deepEqual([jpg.readUInt16BE(at + 7), jpg.readUInt16BE(at + 5)], [960, 540]);
});

test('tools/start-video.ts writes no sound: -an, no audio codec; the loop fades its end into its start', () => {
  const args = clipArgs('in.mp4', 'out.webm', 0, 12);
  assert.ok(args.includes('-an'));
  assert.ok(!args.some((a) => /^-(c:a|acodec|b:a)$/.test(a)));
  const filter = args[args.indexOf('-filter_complex') + 1];
  assert.match(filter, /trim=0:12,/);
  assert.match(filter, /xfade=transition=fade:duration=0\.8:offset=10\.400/);
  assert.throws(() => clipArgs('in.mp4', 'out.webm', 0, 1.5));
});
