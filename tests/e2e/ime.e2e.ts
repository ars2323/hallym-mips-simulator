/* Korean input in the editor, through Chromium's IME path (CDP
   Input.imeSetComposition / Input.insertText -- what an IME does to the
   page), not through synthetic key events. */

import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { answerSave, launch, type Running } from './harness.ts';

let r: Running;
test.beforeEach(async () => { r = await launch(); });
test.afterEach(async () => { await r.close(); });

async function newFileWith(text: string) {
  const { page } = r;
  await page.getByRole('button', { name: /바로 시작/ }).click();
  await page.getByRole('button', { name: /새 파일/ }).first().click();
  await page.locator('.cm-content').click();
  await page.keyboard.insertText(text);
  return page.context().newCDPSession(page);
}

const compose = (cdp: Awaited<ReturnType<typeof newFileWith>>, text: string) =>
  cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length });
const commit = (cdp: Awaited<ReturnType<typeof newFileWith>>, text: string) => cdp.send('Input.insertText', { text });
const doc = () => r.page.evaluate(() => [...document.querySelectorAll('.cm-line')].map((l) => l.textContent).join('\n'));

test('syllables are composed and committed once each', async () => {
  const cdp = await newFileWith('main: # ');
  for (const s of ['ㅎ', '하', '한']) await compose(cdp, s);
  await commit(cdp, '한');
  for (const s of ['ㄱ', '그', '글']) await compose(cdp, s);
  await commit(cdp, '글');
  await r.page.keyboard.insertText(' ok');
  expect(await doc()).toBe('main: # 한글 ok');
});

test('Ctrl+S in the middle of a syllable waits for it, then saves it whole', async () => {
  const { app, page } = r;
  const file = path.join(r.dir, 'ime.s');
  await answerSave(app, file);
  const cdp = await newFileWith('main:\n  li $v0, 10\n  syscall # ');
  await compose(cdp, 'ㄲ');
  await compose(cdp, '끄');
  expect(await page.locator('.cm-content').textContent()).toContain('끄'); // on screen, not committed
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(300);
  expect(existsSync(file)).toBe(false); // nothing saved with half a syllable
  await compose(cdp, '끝');              // the syllable goes on after Ctrl+S
  await commit(cdp, '끝');
  await expect(page.locator('.run-grid')).toBeVisible();
  const saved = readFileSync(file, 'utf8');
  expect(saved).toBe('main:\n  li $v0, 10\n  syscall # 끝');
  expect(await doc()).toBe('main:\n  li $v0, 10\n  syscall # 끝');
  // Saved once the syllable was in: not dirty.
  await expect(page.locator('.top .dirty')).toHaveCount(0);
});
