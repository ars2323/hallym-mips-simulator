/* The notices (src/renderer/app/notice.ts): the Console's word before any
   output, the Inspector's before the first step, the card on the Run side
   before the first assemble, and the error list -- one shape, in the
   middle of their panel, the character at the far end and one size, at
   1280x800 and on a maximised 1920 screen. */

import { expect, test, type Page } from '@playwright/test';

import { launch, openOnly, program, sample } from './harness.ts';

interface Placed { where: string; dx: number; dy: number; char: boolean; charHeight: number; title: string; width: number }
const placed = (page: Page): Promise<Placed[]> => page.evaluate(() => [...document.querySelectorAll('.notice')]
  .filter((n) => (n as HTMLElement).checkVisibility())
  .map((n) => {
    const host = n.parentElement!;
    const a = n.getBoundingClientRect();
    const b = host.getBoundingClientRect();
    const img = n.querySelector('img.char') as HTMLElement;
    return {
      where: host.closest('section')?.getAttribute('aria-label') ?? host.className.split(' ')[0],
      dx: Math.round((a.left + a.right) / 2 - (b.left + b.right) / 2), dy: Math.round((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2),
      char: getComputedStyle(img).display !== 'none', charHeight: img.getBoundingClientRect().height,
      title: getComputedStyle(n.querySelector('h3')!).fontSize, width: Math.round(a.width),
    };
  }));

for (const size of [{ name: '1280x800', width: 1280, height: 800 }, { name: '1920x1040', width: 1920, height: 1040 }]) {
  test(`${size.name}: each notice in the middle of its panel, with the character, at one size`, async () => {
    const r = await launch(size);
    const { page } = r;
    try {
      const check = async (expected: string[]) => {
        await page.mouse.move(-5, -5);
        await page.waitForTimeout(300);
        const all = await placed(page);
        expect(all.map((p) => p.where).sort()).toEqual([...expected].sort());
        for (const p of all) {
          expect(Math.abs(p.dx) <= 8 && Math.abs(p.dy) <= 8, `${p.where}: in the middle (${p.dx}, ${p.dy})`).toBe(true);
          // The Console's empty word is the words alone: the Console is kept as
          // short as they are (the height goes to Registers); the others have the character.
          if (p.where === 'Console') { expect(p.char, 'Console: the words alone').toBe(false); continue; }
          expect(p.char, `${p.where}: the character`).toBe(true);
          expect(p.charHeight, `${p.where}: one size`).toBe(120);
          expect(p.title, `${p.where}: one title size`).toBe('16px');
          expect(p.width, `${p.where}: no wider than reads well`).toBeLessThanOrEqual(760);
        }
      };
      await openOnly(r, sample(r.dir, 'tests/samples/lab04-ok.s', 'lab04.s'));
      await check(['run-placeholder']);
      await page.locator('.cm-content').click();
      await page.keyboard.press('Control+s');
      await page.waitForSelector('.run-grid:not([hidden])');
      await check(['Console', 'Inspector']);
      await openOnly(r, program(r.dir, 'bad.s', '        .text\n        .global main\nmain:   li $v0, 10\n        syscall\n'));
      await page.locator('.cm-content').click();
      await page.keyboard.press('Control+s');
      await page.waitForSelector('.errors .item');
      await check(['Errors']);
      await expect(page.locator('.errors .hint')).toContainText('혹시');
    } finally {
      await r.close();
    }
  });
}
