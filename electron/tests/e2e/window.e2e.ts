/* The window as it opens and while it is covered: maximised at start; the
   caption buttons' patch (titleBarOverlay: Windows draws the buttons on it)
   coloured under the tutorial's dim and a dialog's backdrop, white again
   after; the question dialogs (panels/ask.ts): Haram every time, a click
   outside does nothing, Esc is cancel, the backdrop covers the tutorial's
   card, the keys stay inside. */

import { expect, test } from '@playwright/test';

import { launch, openAndAssemble, program, type Running } from './harness.ts';

const PROGRAM = 'main:\n  li $v0, 10\n  syscall\n';
const overlay = (r: Running) => r.app.evaluate(({ BrowserWindow }) => (BrowserWindow.getAllWindows()[0] as unknown as { overlayColor?: string }).overlayColor ?? '#ffffff');
const visibleHarams = (r: Running) => r.page.evaluate(() => [...document.querySelectorAll('img.char')]
  .filter((e) => e.checkVisibility({ visibilityProperty: true })).map((e) => (e.closest('dialog') ? 'dialog' : e.closest('.tut-card') ? 'card' : 'panel')));

test('opens maximised (Windows), at its own 1280x800 where nothing maximises it', async () => {
  const r = await launch({ width: 1280, height: 800 }, { keepSize: true });
  try {
    const w = await r.app.evaluate(({ BrowserWindow }) => { const b = BrowserWindow.getAllWindows()[0]; return { maximized: b.isMaximized(), size: b.getContentSize() }; });
    if (process.platform === 'win32') expect(w.maximized).toBe(true);
    else if (!w.maximized) expect(w.size).toEqual([1280, 800]);
  } finally {
    await r.close();
  }
});

test('the caption buttons\' patch follows the tutorial\'s dim and a dialog\'s backdrop, and is white again after', async () => {
  const r = await launch();
  const { page } = r;
  try {
    expect(await overlay(r)).toBe('#ffffff');
    await page.getByTitle('Settings').click();
    await expect.poll(() => overlay(r)).toBe('#a6b1c6');   // white under navy at 35 %
    await page.locator('dialog.settings').getByRole('button', { name: 'Close' }).click();
    await expect.poll(() => overlay(r)).toBe('#ffffff');
    await page.getByRole('button', { name: /튜토리얼 보기/ }).click();
    await expect.poll(() => overlay(r)).toBe('#bdc5d4');   // under navy at 26 %
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.ask')).toBeVisible();
    await expect.poll(() => overlay(r)).toBe('#7b8baa');   // both
    await page.locator('dialog.ask').getByRole('button', { name: '계속하기' }).click();
    await expect.poll(() => overlay(r)).toBe('#bdc5d4');
    await page.keyboard.press('Escape');
    await page.locator('dialog.ask').getByRole('button', { name: '그만두기' }).click();
    await expect.poll(() => overlay(r)).toBe('#ffffff');
  } finally {
    await r.close();
  }
});

test('a question: Haram, modal, a click outside does nothing, Esc is cancel, Tab stays inside', async () => {
  const r = await launch();
  const { page } = r;
  try {
    await openAndAssemble(r, program(r.dir, 'p.s', PROGRAM));
    await page.getByTitle('New file').click();
    const dialog = page.locator('dialog.ask');
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((d) => d.matches(':modal'))).toBe(true);
    // Haram in the dialog (the panels' own, under the backdrop, are not the tutorial's: no card here).
    const harams = await visibleHarams(r);
    expect(harams.filter((h) => h === 'dialog')).toHaveLength(1);
    expect(harams).not.toContain('card');
    expect(await dialog.evaluate((d) => getComputedStyle(d, '::backdrop').backgroundColor)).toBe('rgba(0, 32, 91, 0.35)');
    // Outside: the backdrop, the Editor, the title bar -- nothing happens.
    const h = await page.evaluate(() => window.innerHeight);
    for (const [x, y] of [[10, h / 2], [200, 300], [640, 20]]) { await page.mouse.click(x, y); await page.waitForTimeout(150); }
    await expect(dialog).toBeVisible();
    // Tab goes round the two buttons and nowhere else.
    for (let i = 0; i < 3; i += 1) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('dialog.ask')), `Tab ${i + 1}: focus inside`).toBe(true);
    }
    // Esc: the safe answer, the file stays.
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.titlebar .file')).toContainText('p.s');
  } finally {
    await r.close();
  }
});

test('a question over the tutorial: its Haram alone, the card and rings under the backdrop, a click outside does nothing', async () => {
  const r = await launch();
  const { page } = r;
  try {
    await page.getByRole('button', { name: /튜토리얼 보기/ }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __tutorial: { shown: { step: number } } }).__tutorial.shown.step)).toBe(1);
    await page.locator('.tut-card .tut-quit').click();
    const dialog = page.locator('dialog.ask');
    await expect(dialog).toContainText('튜토리얼을 그만둘까요?');
    expect(await visibleHarams(r)).toEqual(['dialog']);
    // The dialog is in the top layer: over the tutorial's card, whatever its z-index.
    const over = await page.evaluate(() => {
      const card = document.querySelector('.tut-card')!.getBoundingClientRect();
      const hit = document.elementFromPoint(card.left + 10, card.top + 10);
      return hit?.closest('dialog') ? 'dialog' : hit?.closest('.tut-card') ? 'card' : 'other';
    });
    expect(over).toBe('dialog');
    const target = await page.evaluate(() => (window as unknown as { __tutorial: { shown: { targets: { left: number; top: number; right: number; bottom: number }[] } } }).__tutorial.shown.targets[0]);
    await page.mouse.click((target.left + target.right) / 2, (target.top + target.bottom) / 2); // where the step points: nothing happens
    await page.mouse.click(5, 400);
    await page.waitForTimeout(200);
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __tutorial: { active: boolean } }).__tutorial.active)).toBe(true);
    expect(await visibleHarams(r)).toEqual(['card']);
  } finally {
    await r.close();
  }
});
