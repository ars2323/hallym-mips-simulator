/* Pictures of the candidate first-screen designs (tools/start-variants-list.ts),
   for choosing one: each at 1920x1040 and at 910x505 (1366x768 at 150%, the
   lab's narrow case), the video stopped at the same second as the fixed set
   (3.0 s), the clock fixed.  Each design's tint and blur measured on the
   screen against the raw frame (tests/e2e/backdrop-measure.ts), and, for the
   glass card, what its backdrop-filter does on this platform.

     xvfb-run -a -s '-screen 0 2400x1400x24' node tools/start-variants.ts

   Writes docs/start-variants/: <id>-1920.jpg, <id>-910.jpg, sheet.jpg (all
   of them side by side, montage), metrics.json.  Candidates, not the app's
   screens: docs/screens/ is left alone. */

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { compare, groundRect, rawPixels, screenPixels, stats, type Rect } from '../tests/e2e/backdrop-measure.ts';
import { launch, root, type Running } from '../tests/e2e/harness.ts';
import { applyVariant, VARIANTS } from './start-variants-list.ts';

type RGB = [number, number, number];
// What the treatment does to the colour, screen against the raw frame: the blue and the green
// channels' shares of the total, in percentage points (brightness left out: towardNavy alone
// cannot tell darkening from bluing, navy being dark); light = the screen's total over the frame's.
export function colour(screen: RGB, raw: RGB) {
  const sum = (c: RGB) => c[0] + c[1] + c[2];
  const share = (c: RGB, i: number) => 100 * c[i] / sum(c);
  return { blueLean: +(share(screen, 2) - share(raw, 2)).toFixed(1), greenLean: +(share(screen, 1) - share(raw, 1)).toFixed(1),
           light: +(sum(screen) / sum(raw)).toFixed(2) };
}

const out = process.env.START_VARIANTS_OUT ? path.resolve(process.env.START_VARIANTS_OUT) : path.join(root, 'docs/start-variants');
mkdirSync(out, { recursive: true });
const FIXED_TIME = new Date('2026-09-28T10:00:00+09:00');
const AT = 3.0;
const SIZES = [
  { name: '1920', size: { width: 1920, height: 1040 }, scale: '1' },
  { name: '910', size: { width: 910, height: 505 }, scale: '1.5' },
];

async function videoAt(r: Running, t: number): Promise<void> {
  await r.page.waitForSelector('.wback.playing');
  await r.page.evaluate((t) => new Promise<void>((done) => {
    const v = document.querySelector('.wback video') as HTMLVideoElement;
    v.pause();
    v.addEventListener('seeked', () => requestAnimationFrame(() => requestAnimationFrame(() => done())), { once: true });
    v.currentTime = t;
  }), t);
}

// Inside the card, above its heading: what the card shows of the ground (the glass).
export async function cardRect(r: Running): Promise<Rect> {
  const card = (await r.page.locator('.wcard').boundingBox())!;
  const h1 = (await r.page.locator('.wcard h1').boundingBox())!;
  return { x: card.x + 24, y: card.y + 4, width: card.width - 48, height: Math.max(8, h1.y - card.y - 10) };
}

const metrics: Record<string, unknown>[] = [];
for (const v of VARIANTS) {
  for (const s of SIZES) {
    const r = await launch(s.size, { switches: [`--force-device-scale-factor=${s.scale}`] });
    try {
      await r.page.clock.setFixedTime(FIXED_TIME);
      await videoAt(r, AT);
      await applyVariant(r, v);
      await r.page.mouse.move(-10, -10);
      await r.page.evaluate(() => document.fonts.ready);
      await r.page.waitForTimeout(800);
      const ground = await groundRect(r);
      const g = compare(await screenPixels(r, ground), await rawPixels(r, ground));
      let cardStrip;
      if (v.glass) {
        // The card's top strip against the raw frame there, with the backdrop-filter and without
        // it (the control): the filter blurs what the card shows only if the first is well under
        // the second.  And what the renderer says it applies.
        const cr = await cardRect(r);
        const strip = async () => {
          const cs = await screenPixels(r, cr);
          return { sharpness: +compare(cs, await rawPixels(r, cr)).sharpness.toFixed(3), mean: stats(cs).mean.map(Math.round) };
        };
        const computed = await r.page.evaluate(() => getComputedStyle(document.querySelector('.wcard')!).backdropFilter);
        const on = await strip();
        await r.page.evaluate(() => {
          const st = document.createElement('style');
          st.id = 'glass-off';
          st.textContent = '.wcard { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }';
          document.head.append(st);
        });
        await r.page.waitForTimeout(400);
        const off = await strip();
        await r.page.evaluate(() => document.getElementById('glass-off')!.remove());
        await r.page.waitForTimeout(400);
        cardStrip = { computed, on, off };
      }
      const card = (await r.page.locator('.wcard').boundingBox())!;
      const file = path.join(out, `${v.id}-${s.name}.jpg`);
      await r.page.screenshot({ path: file, type: 'jpeg', quality: 85 });
      const row = {
        variant: v.id, size: s.name,
        ground: { towardNavy: +g.towardNavy.toFixed(3), sharpness: +g.sharpness.toFixed(3), ...colour(g.screen.mean, g.raw.mean),
                  mean: g.screen.mean.map(Math.round), rawMean: g.raw.mean.map(Math.round) },
        cardStrip,
        card: { width: Math.round(card.width), height: Math.round(card.height) },
      };
      metrics.push(row);
      console.log(`${v.id} ${s.name}: tint ${row.ground.towardNavy} sharpness ${row.ground.sharpness} blue ${row.ground.blueLean} green ${row.ground.greenLean} light ${row.ground.light}`
        + (cardStrip ? `; glass '${cardStrip.computed}' strip sharpness ${cardStrip.on.sharpness} (without the filter ${cardStrip.off.sharpness}) mean ${cardStrip.on.mean} (${cardStrip.off.mean})` : '') + `; card ${row.card.width}x${row.card.height}`);
    } finally {
      await r.close();
    }
  }
}
writeFileSync(path.join(out, 'metrics.json'), JSON.stringify(metrics, null, 1));

// The sheet: one row per design, both widths, its name above (ImageMagick's montage; not on the Windows runner).
if (spawnSync('montage', ['-version']).status !== 0) {
  console.log('no montage here: no sheet');
} else {
  const args: string[] = [];
  for (const v of VARIANTS) for (const s of SIZES) args.push('-label', `${v.name} — ${s.name === '1920' ? '1920×1040' : '910×505 (at 150%)'}`, path.join(out, `${v.id}-${s.name}.jpg`));
  const m = spawnSync('montage', [...args, '-tile', '2x', '-geometry', '760x440+10+10', '-pointsize', '20', '-background', 'white', '-quality', '82',
    path.join(out, 'sheet.jpg')], { encoding: 'utf8' });
  if (m.status !== 0) throw new Error(`montage: ${m.stderr}`);
}
console.log(`wrote ${VARIANTS.length * SIZES.length} pictures and metrics.json in ${path.relative(root, out) || out}`);
