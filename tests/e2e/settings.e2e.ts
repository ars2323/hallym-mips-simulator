/* Settings and About.  Saved: the font size and the Data base, nothing
   else.  Session only: Ctrl +/-, and everything under 고급. */

import { expect, test } from '@playwright/test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { launch, openAndAssemble, program, regHex, settled, statusText } from './harness.ts';

test('font size and base are saved; Ctrl +/- and the window are not', async () => {
  const userData = mkdtempSync(path.join(tmpdir(), 'spim-settings-'));
  let r = await launch({ width: 1280, height: 800 }, { userData });
  try {
    await r.page.getByTitle('설정').click();
    const dialog = r.page.locator('dialog.settings');
    // The base first: a later save of the base must not be what saves the size.
    await dialog.getByRole('button', { name: '10진' }).click();
    await dialog.getByRole('button', { name: '글자 크게' }).click();
    await dialog.getByRole('button', { name: '글자 크게' }).click();
    await expect(dialog.locator('.value')).toHaveText('15px');
    await dialog.getByRole('button', { name: '닫기' }).click();
    await r.page.keyboard.press('Control+=');
    await r.page.keyboard.press('Control+=');
    await expect.poll(() => r.page.evaluate(() => document.documentElement.style.getPropertyValue('--fs'))).toBe('17px');
  } finally {
    await r.app.close();
  }
  expect(JSON.parse(readFileSync(path.join(userData, 'settings.json'), 'utf8'))).toEqual({ fontSize: 15, dataBase: 10 });
  r = await launch({ width: 1000, height: 700 }, { userData });
  try {
    // The saved size, not the session's zoom; the window at its fixed default.
    expect(await r.page.evaluate(() => document.documentElement.style.getPropertyValue('--fs'))).toBe('15px');
    const bounds = await r.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getContentSize());
    expect(bounds).toEqual([1000, 700]); // (the harness set it; the app keeps nothing of the last run)
  } finally {
    await r.close();
  }
});

test('고급: options apply from the next assemble, for this session', async () => {
  const r = await launch();
  const { page } = r;
  try {
    const file = program(r.dir, 'argc.s', 'main:\n  li $v0, 1\n  syscall\n  li $v0, 10\n  syscall\n'); // prints argc
    await openAndAssemble(r, file);
    await page.keyboard.press('F5');
    await settled(page);
    await expect(page.locator('.clog')).toHaveText('1');

    await page.getByTitle('설정').click();
    const dialog = page.locator('dialog.settings');
    await dialog.locator('summary').click();
    await dialog.getByLabel('프로그램 인자').fill('alpha beta');
    await dialog.getByLabel('프로그램 인자').press('Tab');
    await dialog.getByRole('button', { name: '닫기' }).click();
    expect(await statusText(page)).toContain('고급 설정이 바뀌었습니다');
    await page.getByRole('button', { name: /처음으로/ }).click();
    await expect(page.locator('.status')).not.toContainText('고급 설정이 바뀌었습니다'); // assembled with them
    await page.keyboard.press('F5');
    await settled(page);
    await expect(page.locator('.clog')).toHaveText('3');

    // Pseudo instructions off: li is now a syntax error.
    await page.getByTitle('설정').click();
    await dialog.getByText('의사 명령 허용').click();
    await dialog.getByRole('button', { name: '닫기' }).click();
    await page.locator('.seg button', { hasText: '코드' }).click();
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
    await page.getByTitle('설정').click();
    const dialog = page.locator('dialog.settings');
    await dialog.locator('summary').click();
    await dialog.getByText('불러오지 않음').click();
    await dialog.getByRole('button', { name: '닫기' }).click();
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
    await page.getByTitle('설정').click();
    await page.getByRole('button', { name: /이 프로그램에 대하여/ }).click();
    const about = page.locator('dialog.about');
    await expect(about).toContainText('2.0.0-alpha.1');
    await expect(about).toContainText('Based on SPIM 9.1.24 by James R. Larus (BSD)');
    await about.getByRole('button', { name: '라이선스' }).click();
    const items = about.locator('details');
    await expect(items).toHaveCount(9);
    for (const [i, text] of [[0, 'James R. Larus'], [1, 'Hallym'], [3, 'SIL OPEN FONT LICENSE'], [5, 'ISC'],
                             [7, '@codemirror/view'], [8, 'Electron']] as const) {
      await items.nth(i).locator('summary').click();
      await expect(items.nth(i).locator('pre')).toContainText(text);
    }
  } finally {
    await r.close();
  }
});
