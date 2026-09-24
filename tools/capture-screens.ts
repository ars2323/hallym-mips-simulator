/* Captures the real app in the four scenes of the mockups, at the mockups'
   three sizes, and renders the comparison sheet.

     xvfb-run -a -s '-screen 0 2400x1400x24' npm run screens

   docs/screens/<scene>-<width>x<height>.png, and docs/screens/sheet.png:
   each mockup (docs/mockups/<scene>-1-*.png, direction 1) next to the app.
   The content is the mockups': lab04.s with its error (B), lab04-ok.s
   stepped 16 times (C), then sra $s1, $t6, 1 chosen (D). */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { launch, openAndAssemble, root, sample, settled } from '../tests/e2e/harness.ts';

const out = path.join(root, 'docs/screens');
const SIZES: [number, number][] = [[1920, 1080], [1280, 800], [960, 1080]];

for (const [width, height] of SIZES) {
  const r = await launch({ width, height });
  const { page } = r;
  const shot = async (scene: string) => {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    const file = path.join(out, `${scene}-${width}x${height}.png`);
    await page.screenshot({ path: file });
    console.log(`wrote ${path.relative(root, file)}`);
  };
  await shot('A');
  await openAndAssemble(r, sample(r.dir, 'tests/samples/lab04.s'));
  await page.waitForSelector('.errors .item');
  await page.locator('.cm-content').blur();
  await shot('B');
  await openAndAssemble(r, sample(r.dir, 'tests/samples/lab04-ok.s', 'lab04.s'));
  for (let i = 0; i < 16; i += 1) {
    await page.keyboard.press('F10');
    await settled(page);
  }
  await shot('C');
  await page.locator('.trow[data-addr="0x00400054"] .dis').click();
  await page.waitForSelector('.insp:not([hidden]) .bits');
  await page.mouse.move(0, 0);
  await shot('D');
  if (width === SIZES[SIZES.length - 1][0]) {
    await page.goto(pathToFileURL(path.join(out, 'sheet.html')).href);
    await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
    await page.screenshot({ path: path.join(out, 'sheet.png'), fullPage: true });
    console.log('wrote docs/screens/sheet.png');
  }
  await r.close();
}
