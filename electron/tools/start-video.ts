/* Makes the first screen's background from a video file: the clip and its
   still (the clip's first frame, shown before the clip plays and instead of
   it under prefers-reduced-motion).

     node tools/start-video.ts <source video> [--from 0.1] [--to 2.6] [--slow 3]

   Writes src/renderer/assets/hallym/start/start.webm and start.jpg.  To use
   another video (say, the university's own master of the one used now), run
   this on it: nothing else changes -- the screen's blur and tint are CSS
   (app.css, "first screen"), not in the file.

   The clip: [from, to] of the source, 960x540, 30 fps, VP9 in WebM, no
   sound track at all (not a muted one), played `slow` times slower (the
   frames in between made by motion interpolation, minterpolate).  Its end
   fades into its start over FADE seconds, so the loop has no seam: the
   clip is the paced cut less FADE, its last FADE seconds show the paced
   cut's last FADE seconds crossfading into its first, and it starts where
   that fade ends.

   Before it is slowed, the source's copied frames go (DEDUP) and the frames
   left are timed evenly at the rate they were shot at (REAL_RATE): the
   promotional video is 25-fps material in a 29.97-fps stream, every sixth
   frame a copy of the one before (0:00-0:02.7: frames 2, 8, 14 ... 80).
   Slowed and interpolated as they came, each copy was a standstill of three
   frames every 18 -- the clip stopped 0.1 s in every 0.6 (2.7.0: 27 of its
   200 steps under 0.3 of a moving step's 1.6, docs/PORTING.md 31).  The
   paced cut's frames are counted first (pacedFrames) and the clip is cut
   by frames, not seconds.

   The defaults are the cut in use: the promotional video's opening aerial
   shot, 0:00.1-0:02.6, slowed to a third.  It is the one shot of the video
   with nothing written in it, no graphics over it and no cut in it (the
   rest carries building signs, captions, logos or people; see
   docs/screens/README.md, start-clip-*).

   Needs ffmpeg (with libvpx-vp9) on PATH. */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

const root = path.join(import.meta.dirname, '..');
export const OUT_DIR = path.join(root, 'src/renderer/assets/hallym/start');
export const FADE = 0.8;
const WIDTH = 960, HEIGHT = 540, FPS = 30;
// A frame that differs from the one kept before it by less than this is a copy.  The source's
// copies differ by 0.02-0.66 (grey, mean per pixel), its moving frames by about 4: mpdecimate's
// own defaults took 7 of the cut's 14 copies; these take all 14 and nothing else, as do twice them.
export const DEDUP = 'mpdecimate=hi=64*32:lo=64*16:frac=0.5';
export const REAL_RATE = '25000/1001'; // 29.97 * 5/6: the rate the copies were made from
// Interpolated 5 frames for every 18 (25/1.001 fps slowed 3 times into 30), the frames next to a
// shot frame move more than those between (steps of about 1.5 and 0.9, grey mean per pixel): a
// jolt 1.7 times a step, every 3.6 frames.  Five frames averaged, 1-2-3-2-1, even them out (the
// steps' strongest periodic structure 0.63 of a step to 0.06), at a smear of about 0.13 s the
// screen's blur (app.css) covers.
export const EVEN = 'tmix=frames=5:weights=1 2 3 2 1';

/** The cut, paced: 30 frames a second; slowed, its copies gone (at the source's own size) and the
    frames left timed evenly at REAL_RATE, then scaled, slowed, interpolated and evened (EVEN). */
export function pace(from: number, to: number, slow = 1): string {
  const scale = `scale=${WIDTH}:${HEIGHT}:flags=lanczos`;
  return `trim=${from}:${to},setpts=PTS-STARTPTS,` + (slow === 1 ? `${scale},fps=${FPS}`
    : `${DEDUP},setpts=N/(${REAL_RATE})/TB,${scale},setpts=${slow}*PTS,minterpolate=fps=${FPS}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,${EVEN}`);
}

/** ffmpeg's arguments that list the paced cut's frames, one framemd5 line each (pacedFrames). */
export const framesArgs = (source: string, from: number, to: number, slow = 1): string[] =>
  ['-v', 'error', '-i', source, '-vf', pace(from, to, slow), '-an', '-f', 'framemd5', '-'];

/** How many frames the paced cut has: counted, not worked out (minterpolate stops about one of
    its inputs' intervals before the last kept frame). */
export function pacedFrames(source: string, from: number, to: number, slow = 1): number {
  const list = execFileSync('ffmpeg', framesArgs(source, from, to, slow), { encoding: 'utf8', maxBuffer: 1 << 28 });
  return list.split('\n').filter((l) => /^\s*0,/.test(l)).length;
}

/** ffmpeg's arguments for the clip, from the paced cut's `n` frames (pacedFrames).  -an: no sound
    track is written.  Counted in frames, not seconds.  The loop is the paced frames F..n-F-1 as
    they are, then their last F blended into the first F -- the k-th of those (k+1)/F of the head's,
    ending on the head's frame F-1 whole -- and so on to frame F again: nothing in it jumps.  The
    file starts that loop in the middle of the plain frames (at frame r), so its last frame and its
    first, where the player wraps, are two neighbours of the paced cut, not a blended frame (which
    the encoder keeps less well) against the first, key frame.  (2.6.0 faded with xfade, whose
    timing ended short of the head, and wrapped there: with the copies in it, its seam was 1.4
    moving steps.) */
export function clipArgs(source: string, out: string, from: number, to: number, slow: number, n: number,
                         pass?: { pass: 1 | 2; log: string }): string[] {
  const F = Math.round(FADE * FPS);
  if (!(n > 3 * F)) throw new Error(`the clip must be longer than ${2 * FADE} s`);
  const r = F + Math.floor((n - 2 * F) / 2);
  const filter = [
    `[0:v]${pace(from, to, slow)},split=4[a][b][c][d]`,
    `[a]trim=start_frame=${r}:end_frame=${n - F},setpts=PTS-STARTPTS[late]`,
    `[b]trim=start_frame=${n - F}:end_frame=${n},setpts=PTS-STARTPTS[tail]`,
    `[c]trim=end_frame=${F},setpts=PTS-STARTPTS[head]`,
    `[d]trim=start_frame=${F}:end_frame=${r},setpts=PTS-STARTPTS[early]`,
    `[tail][head]blend=all_expr='A*(1-N/${F})+B*N/${F}'[fade]`, // blend's N counts from 1
    '[late][fade][early]concat=n=3:v=1:a=0[v]',
  ].join(';');
  // Two passes (`pass`): the encoder then keeps its first (key) frame and the later ones alike, which
  // matters where the player wraps -- one pass at crf 40 left that step 1.44 moving steps, two at 34
  // leave it 1.1 (docs/PORTING.md 31).
  return ['-y', '-i', source, '-filter_complex', filter, '-map', '[v]', '-an', '-sn', '-dn', '-map_metadata', '-1',
    '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '34', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2',
    '-pix_fmt', 'yuv420p', ...(pass ? ['-pass', String(pass.pass), '-passlogfile', pass.log] : []),
    ...(pass?.pass === 1 ? ['-f', 'null', '-'] : [out])];
}

/** The clip, as the command below makes it: the paced cut's frames counted, then two passes. */
export function makeClip(source: string, out: string, from: number, to: number, slow: number): number {
  const n = pacedFrames(source, from, to, slow);
  const log = path.join(mkdtempSync(path.join(tmpdir(), 'start-video-')), 'pass');
  for (const pass of [1, 2] as const) {
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...clipArgs(source, out, from, to, slow, n, { pass, log })], { stdio: 'inherit' });
  }
  rmSync(path.dirname(log), { recursive: true, force: true });
  return n;
}

/** ffmpeg's arguments for the still: the clip's first frame. */
export const stillArgs = (clip: string, out: string): string[] =>
  ['-y', '-i', clip, '-frames:v', '1', '-q:v', '4', '-map_metadata', '-1', out];

if (import.meta.main) {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    from: { type: 'string', default: '0.1' }, to: { type: 'string', default: '2.6' }, slow: { type: 'string', default: '3' } } });
  if (positionals.length !== 1) throw new Error('usage: node tools/start-video.ts <source video> [--from 0.1] [--to 2.6] [--slow 3]');
  mkdirSync(OUT_DIR, { recursive: true });
  const [from, to, slow] = [Number(values.from), Number(values.to), Number(values.slow)];
  const clip = path.join(OUT_DIR, 'start.webm'), still = path.join(OUT_DIR, 'start.jpg');
  const n = makeClip(positionals[0], clip, from, to, slow);
  console.log(`the paced cut: ${n} frames; the clip ${n - Math.round(FADE * FPS)}`);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...stillArgs(clip, still)], { stdio: 'inherit' });
  for (const f of [clip, still]) console.log(`${path.relative(root, f)}  ${statSync(f).size} bytes`);
}
