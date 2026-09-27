/* Makes the first screen's background from a video file: the clip and its
   still (the clip's first frame, shown before the clip plays and instead of
   it under prefers-reduced-motion).

     node tools/start-video.ts <source video> [--from 0] [--to 12]

   Writes src/renderer/assets/hallym/start/start.webm and start.jpg.  To use
   another video (say, the university's own master of the one used now), run
   this on it: nothing else changes -- the screen's blur and tint are CSS
   (app.css, "first screen"), not in the file.

   The clip: [from, to] of the source, 960x540, 30 fps, VP9 in WebM, no
   sound track at all (not a muted one).  Its end fades into its start over
   FADE seconds, so the loop has no seam: the clip is (to - from - FADE)
   seconds long, its last FADE seconds show the source's last FADE seconds
   crossfading into its first, and it starts where that fade ends.

   Needs ffmpeg (with libvpx-vp9) on PATH. */

import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const root = path.join(import.meta.dirname, '..');
export const OUT_DIR = path.join(root, 'src/renderer/assets/hallym/start');
export const FADE = 0.8;
const WIDTH = 960, HEIGHT = 540, FPS = 30;

/** ffmpeg's arguments for the clip.  -an: no sound track is written. */
export function clipArgs(source: string, out: string, from: number, to: number): string[] {
  const length = to - from;
  if (!(length > 2 * FADE)) throw new Error(`the clip must be longer than ${2 * FADE} s`);
  const filter = [
    `[0:v]trim=${from}:${to},setpts=PTS-STARTPTS,scale=${WIDTH}:${HEIGHT}:flags=lanczos,fps=${FPS},split[a][b]`,
    `[a]trim=${FADE}:${length},setpts=PTS-STARTPTS[main]`,
    `[b]trim=0:${FADE},setpts=PTS-STARTPTS[head]`,
    `[main][head]xfade=transition=fade:duration=${FADE}:offset=${(length - 2 * FADE).toFixed(3)}[v]`,
  ].join(';');
  return ['-y', '-i', source, '-filter_complex', filter, '-map', '[v]', '-an', '-sn', '-dn', '-map_metadata', '-1',
    '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '40', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2',
    '-pix_fmt', 'yuv420p', out];
}

/** ffmpeg's arguments for the still: the clip's first frame. */
export const stillArgs = (clip: string, out: string): string[] =>
  ['-y', '-i', clip, '-frames:v', '1', '-q:v', '4', '-map_metadata', '-1', out];

if (import.meta.main) {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: { from: { type: 'string', default: '0' }, to: { type: 'string', default: '12' } } });
  if (positionals.length !== 1) throw new Error('usage: node tools/start-video.ts <source video> [--from 0] [--to 12]');
  mkdirSync(OUT_DIR, { recursive: true });
  const clip = path.join(OUT_DIR, 'start.webm'), still = path.join(OUT_DIR, 'start.jpg');
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...clipArgs(positionals[0], clip, Number(values.from), Number(values.to))], { stdio: 'inherit' });
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...stillArgs(clip, still)], { stdio: 'inherit' });
  for (const f of [clip, still]) console.log(`${path.relative(root, f)}  ${statSync(f).size} bytes`);
}
