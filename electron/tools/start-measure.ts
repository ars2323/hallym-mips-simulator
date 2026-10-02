/* The first screen, measured instead of looked at.

     xvfb-run -a -s '-screen 0 2400x1400x24' node tools/start-measure.ts [--size WxH] [--json FILE]

   Every number here is read off the board the program draws, at moments put
   there by the virtual clock (window.__startfield.stepTo), not off a video:
   a film is a measurement of the encoder as much as of the screen.

   What it reads, over the board region alone -- the window with the card,
   the title bar and the status bar cut out of it, since those are the app's
   and not the board's:

     brightness   the histogram of the settled board, in the six bands the
                  eye notices: near-black, visible, clear, bright, near-white
     timing       when each pixel that ends up lit first lit, as percentiles,
                  and the same by distance from the chip (the rings)
     density      how many lines a scanline crosses per 1000 px: the check
                  that brightness was not bought with more traces
     idle         how much the screen still changes once the board has grown,
                  and what each frame costs

   The same measurements are checks in tests/e2e/start.e2e.ts; this prints
   them with the targets beside them, which is what they are tuned against. */

import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { BANDS, DENSITY, IDLE_MOTION, measureBoard, TIMING } from '../tests/e2e/board-measure.ts';
import { launch } from '../tests/e2e/harness.ts';

const { values } = parseArgs({ options: {
  size: { type: 'string', default: '1920x1080' },
  json: { type: 'string' },
  step: { type: 'string', default: '150' },     // ms between the frames timing is read from
} });
const [width, height] = values.size!.split('x').map(Number);
const STEP = Number(values.step);

const r = await launch({ width, height });
try {
  await r.page.waitForSelector('.startfield canvas');
  await r.page.waitForTimeout(1500);
  const grown = await r.page.evaluate(() => window.__startfield!.grown());
  console.log(`window ${width}x${height}, the board grown at ${(grown / 1000).toFixed(2)} s`);

  const measured = await r.page.evaluate(measureBoard, { step: STEP, grown });

  // ---- the cost of a frame, from the window's own loop -------------------
  await r.page.reload();
  await r.page.waitForSelector('.startfield canvas');
  await r.page.waitForTimeout(grown + 4000);
  const cost = await r.page.evaluate(({ grown }) => {
    const h = window.__startfield!;
    const times = h.times(), work = h.work(), deltas = h.deltas();
    const pick = (lo: number, hi: number) => {
      const w: number[] = [], d: number[] = [];
      for (let i = 0; i < times.length; i++) {
        if (times[i] < lo || times[i] >= hi) continue;
        w.push(work[i]);
        if (deltas[i] > 0) d.push(deltas[i]);
      }
      const q = (xs: number[], p: number) => (xs.length ? xs.sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] : 0);
      return { frames: w.length, work: [q(w, 0.5), q(w, 0.99)], gap: [q(d, 0.5), q(d, 0.99)] };
    };
    return { growth: pick(0, grown), idle: pick(grown, Infinity), boardDraws: h.boardDraws() };
  }, { grown });
  const idleDraws = await r.page.evaluate(async () => {
    const h = window.__startfield!;
    const before = h.boardDraws();
    await new Promise((d) => setTimeout(d, 1500));
    return h.boardDraws() - before;
  });

  const band = (v: number, [lo, hi]: readonly number[]): string =>
    `${v >= lo && v <= hi ? 'ok  ' : 'OUT '}(${lo}..${hi === Infinity ? '' : hi})`;
  const h = measured.hist, tm = measured.timing;
  console.log(`\nboard region ${measured.board.width}x${measured.board.height}, ${measured.board.pixels} px`);
  console.log(`  mean brightness   ${h.mean.toFixed(1)}      ${band(h.mean, BANDS.mean)}`);
  console.log(`  near-black 0-20   ${h.nearBlack.toFixed(2)} %   ${band(h.nearBlack, BANDS.nearBlack)}`);
  console.log(`  visible 45+       ${h.visible.toFixed(2)} %   ${band(h.visible, BANDS.visible)}`);
  console.log(`  clear 90+         ${h.clear.toFixed(2)} %`);
  console.log(`  bright 160+       ${h.bright.toFixed(2)} %   ${band(h.bright, BANDS.bright)}`);
  console.log(`  near-white 220+   ${h.nearWhite.toFixed(2)} %   ${band(h.nearWhite, BANDS.nearWhite)}`);
  console.log(`\nfirst lit (${tm.litPixels} px)`);
  for (const k of ['p10', 'p50', 'p90', 'p99', 'spread'] as const) {
    console.log(`  ${k.padEnd(8)} ${(tm[k] / 1000).toFixed(2)} s   ${band(tm[k], TIMING[k])}`);
  }
  console.log(`  rings 90 %        ${tm.rings.map((v) => (v / 1000).toFixed(2)).join(' / ')} s`
    + `   far-near ${((tm.rings[4] - tm.rings[0]) / 1000).toFixed(2)} s   ${band(tm.rings[4] - tm.rings[0], TIMING.rings)}`);
  console.log(`\ndensity           ${measured.density.toFixed(2)} /1000 px   ${band(measured.density, DENSITY)}`
    + `   at ${measured.densityAt.map(([th, v]) => `${th}:${v}`).join(' ')}`);
  console.log(`idle motion       ${measured.idleMotion.toFixed(4)}   ${band(measured.idleMotion, IDLE_MOTION)}`);
  console.log(`\ngrowth  work ${cost.growth.work.map((v) => v.toFixed(2)).join(' / ')} ms (median/p99), gaps ${cost.growth.gap.map((v) => v.toFixed(1)).join(' / ')} ms, ${cost.growth.frames} frames`);
  console.log(`idle    work ${cost.idle.work.map((v) => v.toFixed(2)).join(' / ')} ms (median/p99), gaps ${cost.idle.gap.map((v) => v.toFixed(1)).join(' / ')} ms, ${cost.idle.frames} frames`);
  console.log(`board draws ${cost.boardDraws} in all, ${idleDraws} in 1.5 s of a settled board`);

  if (values.json) writeFileSync(values.json, `${JSON.stringify({ grown, ...measured, cost, idleDraws }, null, 2)}\n`);
} finally { await r.close(); }
