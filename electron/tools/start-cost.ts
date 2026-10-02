/* What a frame of the first screen costs on the machine it is run on.

     node tools/start-cost.ts [--json FILE] [--hold 30]
     SPIM_E2E_EXE=... node tools/start-cost.ts     (the installed app)

   Numbers, not a check.  The ones in the tests come off a developer's
   machine; the lab PCs have built-in graphics, and the Windows runner is the
   nearest thing in CI to one, so this is run there too (electron.yml) and the
   two are reported side by side.

   Three things:
     growing   while the board fills in -- the layer below is redrawn every
               frame then, which is the expensive part
     settled   after it has, when the board below is never drawn again and
               only the layer above it is
     holding   the same, 30 s of it, to see whether anything accumulates:
               the draws of the layer below (which must stay at 0), the
               frames, and the window's heap

   The card's lights are in all three: they are custom properties set on
   three elements every frame, and the browser does the styling for them. */

import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { launch } from '../tests/e2e/harness.ts';

const { values } = parseArgs({ options: {
  json: { type: 'string' },
  hold: { type: 'string', default: '30' },
  size: { type: 'string', default: '1920x1080' },
} });
const [width, height] = values.size!.split('x').map(Number);
const HOLD = Number(values.hold) * 1000;

interface Part { frames: number; work: number[]; gap: number[] }

const r = await launch({ width, height });
try {
  await r.page.waitForSelector('.startfield canvas');
  const grown = await r.page.evaluate(() => window.__startfield!.grown());
  await r.page.waitForTimeout(grown + 3000);

  const split = await r.page.evaluate(({ grown }) => {
    const h = window.__startfield!;
    const times = h.times(), work = h.work(), deltas = h.deltas();
    const q = (xs: number[], p: number) => (xs.length ? xs.sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] : 0);
    const part = (lo: number, hi: number) => {
      const w: number[] = [], d: number[] = [];
      for (let i = 0; i < times.length; i++) {
        if (times[i] < lo || times[i] >= hi) continue;
        w.push(work[i]);
        if (deltas[i] > 0) d.push(deltas[i]);
      }
      return { frames: w.length, work: [q(w, 0.5), q(w, 0.99)], gap: [q(d, 0.5), q(d, 0.99)] };
    };
    return { growing: part(0, grown), settled: part(grown, Infinity) };
  }, { grown });

  // ---- and then left alone, to see whether anything piles up -------------
  const before = await r.page.evaluate(() => ({
    draws: window.__startfield!.boardDraws(),
    frames: window.__startfield!.frames(),
    heap: (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0,
  }));
  await r.page.waitForTimeout(HOLD);
  const after = await r.page.evaluate(() => ({
    draws: window.__startfield!.boardDraws(),
    frames: window.__startfield!.frames(),
    heap: (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0,
  }));
  const held = await r.page.evaluate(({ since }) => {
    const h = window.__startfield!;
    const times = h.times(), work = h.work(), deltas = h.deltas();
    const q = (xs: number[], p: number) => (xs.length ? xs.sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] : 0);
    const w: number[] = [], d: number[] = [];
    for (let i = 0; i < times.length; i++) {
      if (times[i] < since) continue;
      w.push(work[i]);
      if (deltas[i] > 0) d.push(deltas[i]);
    }
    return { frames: w.length, work: [q(w, 0.5), q(w, 0.99)], gap: [q(d, 0.5), q(d, 0.99)] };
  }, { since: grown + 3000 });

  const show = (name: string, p: Part): void => {
    console.log(`${name.padEnd(9)} drawing ${p.work[0].toFixed(2)} / ${p.work[1].toFixed(2)} ms (median / p99)`
      + `   gaps ${p.gap[0].toFixed(1)} / ${p.gap[1].toFixed(1)} ms   ${p.frames} frames`);
  };
  console.log(`${width}x${height}, ${process.env.SPIM_E2E_EXE ? 'the installed app' : 'from source'},`
    + ` the board grown at ${(grown / 1000).toFixed(2)} s`);
  show('growing', split.growing);
  show('settled', split.settled);
  show(`holding`, held);
  const heap = after.heap === 0 ? 'heap not reported'
    : `heap ${(before.heap / 1048576).toFixed(1)} -> ${(after.heap / 1048576).toFixed(1)} MB`;
  console.log(`held ${(HOLD / 1000).toFixed(0)} s: the board below drawn ${after.draws - before.draws} more times,`
    + ` ${after.frames - before.frames} frames, ${heap}`);

  if (values.json) {
    writeFileSync(values.json, `${JSON.stringify({ size: values.size, grown, ...split, held,
      accumulated: { draws: after.draws - before.draws, frames: after.frames - before.frames, heapBytes: after.heap - before.heap },
    }, null, 2)}\n`);
  }
} finally { await r.close(); }
