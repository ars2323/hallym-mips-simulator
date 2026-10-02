/* The first screen's opening, as frames and as a film.

     xvfb-run -a -s '-screen 0 2400x1400x24' node tools/start-film.ts [--out DIR] [--sizes WxH,...]
     node tools/start-film.ts --stills-only          the four moments, no film
     node tools/start-film.ts --at 4.0               those moments only: no frames taken, no film
                                                     (Windows, where only the settled screen is wanted)

   The window is not recorded while it plays.  A recording of a CI runner
   drops frames, and a dropped frame in a film about an animation reads as
   the animation stuttering.  Instead the opening is put at an exact time --
   window.__startfield.stepTo(ms), which draws one frame of that moment and
   nothing else -- and the page is photographed.  The CSS parts (the chip's
   entrance, the glints) are put at the same time by giving them a negative
   animation-delay and pausing them, so a frame is the whole screen at t,
   not the canvas at t over CSS wherever it happened to be.

   So the same input gives the same PNG every time: there is no clock and no
   frame budget in it.  --twice checks that, by taking every frame again and
   comparing the hashes.

   The film is 60 frames a second, from 60 frames a second of source: no
   interpolation, no mpdecimate, no frame rate conversion.  mp4/H.264, which
   Windows and a phone open without being asked twice. */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { launch, type Running } from '../tests/e2e/harness.ts';

const root = path.join(import.meta.dirname, '..');
const FIXED_TIME = new Date('2026-09-28T10:00:00+09:00');
const FPS = 60;
const SECONDS = 5;
const STILLS = [0.3, 0.9, 1.5, 4.0];           // seconds
const SIZES: [number, number][] = [[1280, 800], [1920, 1080], [1920, 540], [1024, 768]];

const { values } = parseArgs({ options: {
  out: { type: 'string', default: path.join(root, 'build/startfilm') },
  sizes: { type: 'string' },
  'stills-only': { type: 'boolean', default: false },
  twice: { type: 'boolean', default: false },
  at: { type: 'string' },
} });
const out = path.resolve(values.out!);
const sizes: [number, number][] = values.sizes
  ? values.sizes.split(',').map((s) => s.split('x').map(Number) as [number, number])
  : SIZES;
// --at asks for those moments and nothing else: no frames are taken, so no
// film is made and there is nothing to compare between two runs.
const moments = values.at ? values.at.split(',').map(Number) : STILLS;
const frameCount = values.at ? 0 : FPS * SECONDS;

/** Puts the whole screen -- canvas and CSS alike -- at `ms` of the opening. */
async function stepTo(r: Running, ms: number): Promise<void> {
  await r.page.evaluate((ms) => {
    (window as unknown as { __startfield: { stepTo(ms: number): void } }).__startfield.stepTo(ms);
  }, ms);
  // Two frames for the compositor to present what was just drawn, and a
  // moment more: a screenshot taken before the new frame is on screen comes
  // back as the one before it, which showed up as a fifth of the frames
  // differing between two runs of the same input.
  await r.page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  await r.page.waitForTimeout(20);
}

async function film(width: number, height: number, dir: string): Promise<string[]> {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const r = await launch({ width, height });
  const hashes: string[] = [];
  try {
    await r.page.clock.setFixedTime(FIXED_TIME);
    await r.page.waitForSelector('.startfield canvas');
    await r.page.waitForTimeout(1500);           // fonts, layout, the first build
    for (let n = 0; n < frameCount; n++) {
      await stepTo(r, (n * 1000) / FPS);
      const file = path.join(dir, `frame_${String(n).padStart(4, '0')}.png`);
      // animations: 'disabled' keeps Playwright from sampling a CSS
      // animation at its own moment; ours are already paused at `t`.
      await r.page.screenshot({ path: file, animations: 'disabled' });
      hashes.push(createHash('sha256').update(readFileSync(file)).digest('hex'));
    }
    for (const t of moments) {
      await stepTo(r, t * 1000);
      await r.page.screenshot({ path: path.join(out, `still-${width}x${height}-${t.toFixed(1)}s.png`), animations: 'disabled' });
    }
  } finally { await r.close(); }
  return hashes;
}

/** ffmpeg is what makes the film and the contact sheet; the Windows runner
    has none, and there it is only the stills that are wanted. */
const hasFfmpeg = (): boolean => spawnSync('ffmpeg', ['-version']).status === 0;

function encode(dir: string, mp4: string): void {
  const run = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
    '-framerate', String(FPS), '-i', path.join(dir, 'frame_%04d.png'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', mp4], { stdio: 'inherit' });
  if (run.status !== 0) throw new Error(`ffmpeg: ${run.status}`);
}

/** The stills of every size, side by side, to look at in one go: one row a
    window size, one column a moment.  Each is fitted into the same cell
    first -- they are four different window sizes, and a glob of mixed sizes
    is one stream the image demuxer cannot read. */
function contactSheet(files: string[], to: string): void {
  const CELL_W = 648, CELL_H = 408, COLS = moments.length;
  const scale = files.map((_, i) =>
    `[${i}:v]scale=${CELL_W - 8}:${CELL_H - 8}:force_original_aspect_ratio=decrease,`
    + `pad=${CELL_W}:${CELL_H}:(ow-iw)/2:(oh-ih)/2:color=0x151515[c${i}]`).join(';');
  const layout = files.map((_, i) => `${(i % COLS) * CELL_W}_${Math.floor(i / COLS) * CELL_H}`).join('|');
  const run = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
    ...files.flatMap((f) => ['-i', f]),
    '-filter_complex', `${scale};${files.map((_, i) => `[c${i}]`).join('')}xstack=inputs=${files.length}:layout=${layout}[v]`,
    '-map', '[v]', '-frames:v', '1', to], { stdio: 'inherit' });
  if (run.status !== 0) throw new Error(`contact sheet: ${run.status}`);
}

mkdirSync(out, { recursive: true });
const report: Record<string, unknown> = {};
for (const [w, h] of sizes) {
  const dir = path.join(out, `frames-${w}x${h}`);
  console.log(`\n== ${w}x${h}`);
  const first = await film(w, h, dir);
  if (values.twice && first.length) {
    const again = await film(w, h, `${dir}-again`);
    const same = first.length === again.length && first.every((x, i) => x === again[i]);
    console.log(`  taken twice: ${same ? 'every frame identical' : 'FRAMES DIFFER'}`);
    report[`${w}x${h}-reproducible`] = same;
    if (!same) {
      report[`${w}x${h}-differing-frames`] = first.map((x, i) => (x === again[i] ? -1 : i)).filter((i) => i >= 0);
    }
    rmSync(`${dir}-again`, { recursive: true, force: true });
  }
  if (!values['stills-only'] && first.length) {
    const mp4 = path.join(out, `start-${w}x${h}.mp4`);
    encode(dir, mp4);
    console.log(`  ${path.relative(root, mp4)}`);
  }
  report[`${w}x${h}-frames`] = first.length;
  report[`${w}x${h}-frameHash`] = createHash('sha256').update(first.join('')).digest('hex').slice(0, 16);
  rmSync(dir, { recursive: true, force: true });
}
// Sorted: the rows come out one window size each, the columns one moment each.
const stills = readdirSync(out).filter((f) => f.startsWith('still-')).sort().map((f) => path.join(out, f));
const sheet = stills.length > 1 && hasFfmpeg();
if (sheet) contactSheet(stills, path.join(out, 'contact-sheet.png'));
else if (stills.length) console.log(`no contact sheet (${hasFfmpeg() ? 'one still' : 'no ffmpeg on PATH'})`);
report.stills = stills.length;
report.contactSheet = sheet;
writeFileSync(path.join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`\n${JSON.stringify(report, null, 2)}`);
