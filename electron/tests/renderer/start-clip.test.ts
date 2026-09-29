/* The first screen's video file (assets/hallym/start/, made by
   tools/start-video.ts): one track, VP9 video, 960x540 -- no sound track at
   all; small; its still the same size.  Read from the WebM's own track list
   (EBML), not from a player. */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { clipArgs, makeClip, OUT_DIR } from '../../tools/start-video.ts';
import { hasFfmpeg, motion } from '../helpers/clip-motion.ts';

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

test('tools/start-video.ts writes no sound: -an, no audio codec; the cut in use is slowed, its copies gone first; the loop by frames', () => {
  const args = clipArgs('in.mp4', 'out.webm', 0, 12, 1, 360);
  assert.ok(args.includes('-an'));
  assert.ok(!args.some((a) => /^-(c:a|acodec|b:a)$/.test(a)));
  assert.match(args[args.indexOf('-filter_complex') + 1], /trim=0:12,/);
  assert.throws(() => clipArgs('in.mp4', 'out.webm', 0, 2, 1, 60));
  // The cut in use: 0:00.1-0:02.6, timed at 25/1.001, slowed to a third and interpolated, then
  // evened; 216 frames, the clip 192.  (That its copies go first is the motion tests' to see.)
  const used = clipArgs('in.mp4', 'out.webm', 0.1, 2.6, 3, 216);
  const f = used[used.indexOf('-filter_complex') + 1];
  assert.match(f, /trim=0\.1:2\.6,setpts=PTS-STARTPTS,.*setpts=N\/\(25000\/1001\)\/TB,scale=960:540[^,]*,setpts=3\*PTS,minterpolate=fps=30:mi_mode=mci[^,]*,tmix=/);
  // Cut in frames: the middle of the plain frames first, the end blended into the head (N from 1).
  assert.match(f, /trim=start_frame=108:end_frame=192.*trim=start_frame=192:end_frame=216.*trim=end_frame=24.*trim=start_frame=24:end_frame=108/);
  assert.match(f, /blend=all_expr='A\*\(1-N\/24\)\+B\*N\/24'/);
  assert.match(f, /concat=n=3/);
  assert.ok(used.includes('-an'));
});

// How the committed clip moves (tests/helpers/clip-motion.ts).  Each threshold lies between the
// clip made in 2.7.1 and 2.7.0's, whose copied frames stood it still 0.1 s in every 0.6
// (docs/PORTING.md 31):
//                        2.7.1   2.7.0   threshold
//   stall                0.702   0.001   >= 0.35   the smallest step over the mean step
//   period 3             0.039   0.382   <= 0.2    the index % 3 phases' range over the mean
//   period 18            0.205   1.434   <= 0.8    the same, 18 phases (5 shot frames in 18)
//   seam                 1.205   1.627   <= 1.4    last -> first over the median step
export const MOTION = { stall: 0.35, period3: 0.2, period18: 0.8, seam: 1.4 };
function moves(file: string, where: string, seam = true): void {
  const m = motion(file);
  const said = `${where}: ${JSON.stringify(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, +v.toFixed(3)])))}`;
  console.log(said);
  assert.ok(m.stall >= MOTION.stall, `${said}: a frame that does not move`);
  assert.ok(m.period3 <= MOTION.period3, `${said}: uneven every third frame`);
  assert.ok(m.period18 <= MOTION.period18, `${said}: uneven every 18th frame`);
  if (seam) assert.ok(m.seam <= MOTION.seam, `${said}: the loop jumps where it wraps`);
}

test('the clip moves at every frame, evenly, and wraps without a jump', { skip: !hasFfmpeg() && 'no ffmpeg on PATH' }, () => {
  moves(CLIP, 'start.webm');
});

// The tool on a source with the same fault as the promotional video: an image panned at 25 frames
// a second, made 29.97 (every sixth frame a copy).  The clip it makes must move at every frame and
// evenly, as the one in use.  (Its seam depends on the picture: 1.3 on this one, not what the copies
// change; the committed clip's is checked above.)
test('tools/start-video.ts: a 25-fps source in a 29.97-fps stream makes a clip that moves at every frame', { skip: !hasFfmpeg() && 'no ffmpeg on PATH', timeout: 600_000 }, () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'start-clip-'));
  try {
    const source = path.join(dir, 'source.mkv'), clip = path.join(dir, 'clip.webm');
    execFileSync('ffmpeg', ['-v', 'error', '-loop', '1', '-framerate', '25', '-i', STILL, '-vf',
      'scale=2400:1350,crop=1920:1080:x=t*100:y=t*30,fps=30000/1001', '-t', '3', '-c:v', 'ffv1', source]);
    makeClip(source, clip, 0.1, 2.6, 3);
    moves(clip, 'the panned source\'s clip', false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
