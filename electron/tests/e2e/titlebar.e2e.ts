/* The title bar at every font size the app offers (10-24 px) and every
   width it is made for (docs/PORTING.md 30).  Before 2.7.0 only the default
   font was tried: at 24 px the speed switch grew past the bar and pushed
   the buttons up, and the steps that make room were not taken again after
   the font changed, so the bar ran off the window.

   The worst case at each: a file with a twenty-column name (Hangul in it),
   and (off Windows) the caption buttons 30 px wider, as Windows' are.  At
   each size and font:
   - every control's middle within 2 px of the others';
   - every button and switch with its border, all round, and showing an
     icon or words;
   - nothing past the room before the caption buttons;
   - no control cut: inside the bar, its words whole. */

import { expect, test } from '@playwright/test';

import { launch, openAndAssemble, sample } from './harness.ts';

const WIDTHS = [
  { width: 1280, height: 800 }, { width: 1093, height: 582 }, { width: 1024, height: 728 },
  { width: 910, height: 505 }, { width: 1920, height: 1040 },
];
const FONTS = Array.from({ length: 15 }, (_, i) => 10 + i); // settings: 10..24 px
const LONG = 'lab04_김학현_20210123.s';

for (const size of WIDTHS) {
  test(`${size.width}x${size.height}: the title bar at every font from 10 to 24 px`, async () => {
    test.setTimeout(120_000);
    const r = await launch(size);
    const { page } = r;
    try {
      const extra = process.platform === 'win32' ? 0 : 30;
      await page.evaluate((x) => document.documentElement.style.setProperty('--caption-extra', `${x}px`), extra);
      await openAndAssemble(r, sample(r.dir, 'tests/samples/lab04-ok.s', LONG));
      for (let i = 0; i < 3; i += 1) await page.keyboard.press('Control+-'); // 13 -> 10
      const failures: string[] = [];
      const spares: number[] = [];
      for (const font of FONTS) {
        if (font > 10) await page.keyboard.press('Control+=');
        await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--fs').trim())).toBe(`${font}px`);
        await page.waitForTimeout(50);
        const bar = await page.evaluate((x) => {
          const tb = document.querySelector('.titlebar') as HTMLElement;
          const box = tb.getBoundingClientRect();
          const o = (navigator as unknown as { windowControlsOverlay: { getTitlebarAreaRect(): DOMRect } }).windowControlsOverlay.getTitlebarAreaRect();
          const end = Math.min(box.right - parseFloat(getComputedStyle(tb).paddingRight), o.x + o.width - x);
          const controls = [...tb.querySelectorAll('.brand, .file, .btn, .seg, .iconbtn')].filter((e) => e.checkVisibility()) as HTMLElement[];
          const shown = controls.map((e) => {
            const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
            const bordered = !e.matches('.btn, .seg') || (['Top', 'Right', 'Bottom', 'Left'] as const).every((s) =>
              parseFloat(cs.getPropertyValue(`border-${s.toLowerCase()}-width`)) >= 1 && cs.getPropertyValue(`border-${s.toLowerCase()}-color`) !== 'rgba(0, 0, 0, 0)');
            const name = `${e.className.split(' ')[0]}${e.textContent?.trim() ? ` "${e.textContent.trim().slice(0, 16)}"` : ''}`;
            // A button shows what it is: an icon or words (not an empty bordered box).
            const says = !e.matches('.btn, .iconbtn') || [...e.querySelectorAll('img, .label')].some((x) => x.checkVisibility() && x.getBoundingClientRect().width > 4
              && (x.tagName === 'IMG' || (x.textContent ?? '').trim() !== ''));
            return { name, top: r.top, bottom: r.bottom, left: r.left, right: r.right, mid: (r.top + r.bottom) / 2, bordered, says,
              whole: e.scrollWidth <= e.clientWidth + 1 && e.scrollHeight <= e.clientHeight + 1 };
          });
          const mids = shown.map((s) => s.mid);
          return {
            steps: tb.className.replace('titlebar', '').trim(),
            // What the drag region has over its least width: the room left (it takes what the rest leave).
            spare: (() => { const d = tb.querySelector('.drag') as HTMLElement; return d.getBoundingClientRect().width - parseFloat(getComputedStyle(d).minWidth); })(),
            spread: Math.max(...mids) - Math.min(...mids),
            unbordered: shown.filter((s) => !s.bordered).map((s) => s.name),
            empty: shown.filter((s) => !s.says).map((s) => s.name),
            past: shown.filter((s) => s.right > end + 0.5).map((s) => `${s.name} ${Math.round(s.right)} > ${Math.round(end)}`),
            cut: shown.filter((s) => s.top < box.top - 0.5 || s.bottom > box.bottom + 0.5 || s.left < box.left - 0.5 || !s.whole)
              .map((s) => `${s.name} ${Math.round(s.top)}..${Math.round(s.bottom)}`),
          };
        }, extra);
        const where = `${size.width}px, ${font}px font [${bar.steps}]`;
        if (bar.spread > 2) failures.push(`${where}: middles ${bar.spread.toFixed(1)} px apart`);
        if (bar.unbordered.length) failures.push(`${where}: no border on ${bar.unbordered.join(', ')}`);
        if (bar.empty.length) failures.push(`${where}: a button showing nothing: ${bar.empty.join(', ')}`);
        if (bar.past.length) failures.push(`${where}: past the room: ${bar.past.join(', ')}`);
        if (bar.cut.length) failures.push(`${where}: cut: ${bar.cut.join(', ')}`);
        if (font === 10 || font === 13 || font === 24) console.log(`${where}: middles within ${bar.spread.toFixed(1)} px, ${Math.round(bar.spare)} px to spare`);
        spares.push(bar.spare);
      }
      console.log(`${size.width}px: the least room to spare, over the fonts: ${Math.round(Math.min(...spares))} px`);
      expect(failures, failures.join('\n')).toEqual([]);
    } finally {
      await r.close();
    }
  });
}
