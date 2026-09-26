/* Settings and About.  Nothing is kept from one run to the next (a lab PC
   is shared): the font size, the Data radix, Ctrl +/-, the folds, the
   window's size -- all back to their defaults at the next start, and
   nothing of them on disk.  Advanced applies from the next assemble. */

import { expect, test } from '@playwright/test';
import { existsSync, mkdtempSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { launch, openAndAssemble, program, regHex, sample, settled, side, statusText } from './harness.ts';

// Every file under `dir`.
const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = path.join(dir, n);
  return statSync(p).isDirectory() ? files(p) : [p];
});

test('nothing is kept: font size, Data radix, zoom, folds and the window are back to their defaults at the next start', async () => {
  const runs = mkdtempSync(path.join(tmpdir(), 'spim-runs-'));
  let r = await launch({ width: 1280, height: 800 }, { userData: runs });
  try {
    await openAndAssemble(r, sample(r.dir, 'tests/samples/data-labels.s'));
    await r.page.getByTitle('Settings').click();
    const dialog = r.page.locator('dialog.settings');
    await dialog.getByRole('button', { name: 'Dec' }).click();
    await dialog.getByRole('button', { name: 'Larger' }).click();
    await dialog.getByRole('button', { name: 'Larger' }).click();
    await expect(dialog.locator('.value')).toHaveText('15px');
    await dialog.getByRole('button', { name: 'Close' }).click();
    await r.page.keyboard.press('Control+=');
    await expect.poll(() => r.page.evaluate(() => document.documentElement.style.getPropertyValue('--fs'))).toBe('16px');
    await r.page.locator('.console').getByRole('button', { name: 'Collapse' }).click();
    await expect(r.page.locator('.console')).not.toHaveClass(/open/);
    await r.page.getByRole('button', { name: 'Collapse Editor' }).click();
    await expect(r.page.locator('.split')).toHaveAttribute('data-folded', 'editor');
    await r.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1000, 700));
  } finally {
    await r.app.close();
  }
  // Nothing written for the next start (no settings file, no profile of it left
  // once the next start has cleaned up).
  r = await launch({ width: 1280, height: 800 }, { userData: runs, keepSize: true });
  try {
    const { page } = r;
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--fs'))).toBe('13px');
    // The window as the app opens it: maximised (Windows; on a Linux display
    // without a window manager maximising is nothing, and it is its own
    // 1280x800) -- not the 1000x700 of the last run.
    const win = await r.app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      return { size: w.getContentSize(), maximized: w.isMaximized() };
    });
    if (process.platform === 'win32') expect(win.maximized).toBe(true);
    if (!win.maximized) expect(win.size).toEqual([1280, 800]);
    await page.getByTitle('Settings').click();
    const dialog = page.locator('dialog.settings');
    await expect(dialog.locator('.value')).toHaveText('13px');
    await expect(dialog.getByRole('button', { name: 'Hex' })).toHaveClass(/on/);
    await dialog.getByRole('button', { name: 'Close' }).click();
    await openAndAssemble(r, sample(r.dir, 'tests/samples/data-labels.s'));
    await expect(page.locator('.console')).toHaveClass(/open/);
    await expect(page.locator('.split')).toHaveAttribute('data-folded', 'none');
    await page.locator('.ptab', { hasText: 'Data' }).click();
    await expect(page.locator('.dtable')).toHaveClass(/base-16/);
    // On disk: only this run's folder, and no settings file anywhere.
    const left = readdirSync(runs);
    expect(left.length, left.join(', ')).toBe(1);
    expect(files(runs).filter((f) => /settings/i.test(path.basename(f)))).toEqual([]);
  } finally {
    await r.close();
  }
  // Quit: once the program has exited, this run's folder goes too.
  await expect.poll(() => (existsSync(runs) ? readdirSync(runs) : []), { timeout: 20_000 }).toEqual([]);
});

test('Advanced: options apply from the next assemble, for this session', async () => {
  const r = await launch();
  const { page } = r;
  try {
    const file = program(r.dir, 'argc.s', 'main:\n  li $v0, 1\n  syscall\n  li $v0, 10\n  syscall\n'); // prints argc
    await openAndAssemble(r, file);
    await page.keyboard.press('F5');
    await settled(page);
    await expect(page.locator('.clog')).toHaveText('1');

    await page.getByTitle('Settings').click();
    const dialog = page.locator('dialog.settings');
    await dialog.locator('summary').click();
    await dialog.getByLabel('Program arguments').fill('first second');
    await dialog.getByLabel('Program arguments').press('Tab');
    await dialog.getByRole('button', { name: 'Close' }).click();
    expect(await statusText(page)).toContain('설정이 바뀌었습니다');
    await page.getByRole('button', { name: /Reset/ }).click();
    await expect(page.locator('.status')).not.toContainText('설정이 바뀌었습니다'); // assembled with them
    await page.keyboard.press('F5');
    await settled(page);
    await expect(page.locator('.clog')).toHaveText('3');

    // Pseudo instructions off: li is now a syntax error.
    await page.getByTitle('Settings').click();
    await dialog.getByText('Pseudo instructions').click();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await side(page, 'Editor');
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+s');
    await expect(page.locator('.errors .item').first()).toContainText('syntax error');
  } finally {
    await r.close();
  }
});

test('no exception handler: the program brings its own __start', async () => {
  const r = await launch();
  const { page } = r;
  try {
    await page.getByTitle('Settings').click();
    const dialog = page.locator('dialog.settings');
    await dialog.locator('summary').click();
    await dialog.getByText('None —').click();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await openAndAssemble(r, program(r.dir, 'start.s', '  .globl __start\n__start:\n  li $t0, 9\n  li $v0, 10\n  syscall\n'));
    await expect(page.locator('.textpanel .fold')).toBeHidden(); // no kernel text to fold
    await page.keyboard.press('F5');
    await settled(page);
    expect(await regHex(page, '$t0')).toBe('0x00000009');
  } finally {
    await r.close();
  }
});

test('About: version, SPIM, and every notice from the files the package carries', async () => {
  const r = await launch();
  const { page } = r;
  try {
    await page.getByTitle('Settings').click();
    await page.getByRole('button', { name: /About · Licenses/ }).click();
    const about = page.locator('dialog.about');
    await expect(about).toContainText('2.0.0');
    await expect(about).toContainText('Based on SPIM 9.1.24 by James R. Larus (BSD)');
    await about.getByRole('button', { name: 'Licenses' }).click();
    const items = about.locator('details');
    await expect(items).toHaveCount(9);
    // LICENSE: this project's; NOTICE: SPIM's license and the rest (the repository's two files).
    for (const [i, text] of [[0, 'Hakhyeon Kim'], [1, 'James R. Larus'], [1, 'Qt edition only'], [2, 'Hallym'], [3, 'SIL OPEN FONT LICENSE'], [5, 'ISC'],
                             [7, '@codemirror/view'], [8, 'Electron']] as const) {
      await items.nth(i).locator('summary').click();
      await expect(items.nth(i).locator('pre')).toContainText(text);
    }
  } finally {
    await r.close();
  }
});
