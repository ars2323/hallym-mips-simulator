/* The Assemble button says what it does (app.ts nameAssemble; docs/
   PORTING.md 24):
   - a file with a place on disk: Save & Assemble -- the button saves it
     there, then assembles it, and the status bar says 저장됨;
   - a new file (untitled.s): Save & Assemble too -- the button asks where to
     save it (the system's save dialog); cancelled, it assembles all the
     same, says it did not save, shows the machine, and F10 steps (no second
     question);
   - the tutorial's examples, never saved: Assemble -- the tooltip, the
     status bar and the Run side's button agree;
   - a title bar too narrow for the long name: Assemble, the tooltip whole.
   An "&" is an "&" everywhere (never "&amp;"). */

import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { launch, openOnly, program, resize, settled, statusText, type Running } from './harness.ts';

const button = (page: Page) => page.locator('.toolbar .btn[data-tut="assemble"]');
const shownName = (page: Page) => button(page).locator('.label').innerText();
const placeholderButton = (page: Page) => page.locator('.run-placeholder .btn');

// The save dialog, answered from here with `file` (null: cancelled), and
// how many times the program asked for it.
async function saveDialog(r: Running, file: string | null): Promise<void> {
  await r.app.evaluate(({ dialog }, f) => {
    const g = globalThis as unknown as { asked?: number };
    g.asked ??= 0;
    dialog.showSaveDialog = (async () => {
      g.asked! += 1;
      return f === null ? { canceled: true, filePath: '' } : { canceled: false, filePath: f };
    }) as typeof dialog.showSaveDialog;
  }, file);
}
const asked = (r: Running) => r.app.evaluate(() => (globalThis as unknown as { asked?: number }).asked ?? 0);

async function noEntities(page: Page): Promise<void> {
  const text = await page.evaluate(() =>
    [document.body.innerText, ...[...document.querySelectorAll('[title]')].map((e) => e.getAttribute('title'))].join('\n'));
  expect(text).not.toContain('&amp;');
  expect(text).not.toContain('&#');
}

test('a file on disk: Save & Assemble saves it where it is, then assembles it', async () => {
  const r = await launch({ width: 1280, height: 800 });
  const { page } = r;
  try {
    const file = program(r.dir, 'p.s', 'main:\n  li $t0, 5\n  li $v0, 10\n  syscall\n');
    await openOnly(r, file);
    expect(await shownName(page)).toBe('Save & Assemble');
    await expect(button(page)).toHaveAttribute('title', 'Save & Assemble (Ctrl+S)');
    await expect(placeholderButton(page)).toHaveText(/^Save & Assemble/);
    expect(await statusText(page)).toContain('저장·어셈블 (Ctrl+S)');
    await noEntities(page);
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.insertText('\n# kept');
    await button(page).click();
    await page.waitForSelector('.run-grid:not([hidden])');
    await settled(page);
    expect(readFileSync(file, 'utf8')).toContain('# kept');
    expect(await statusText(page)).toContain('저장됨');
    await expect(page.locator('.titlebar .dirty')).toHaveCount(0);
  } finally {
    await r.close();
  }
});

test('a new file: Save & Assemble asks where to save it; cancelled, it assembles all the same and says it did not save', async () => {
  const r = await launch({ width: 1280, height: 800 });
  const { page } = r;
  try {
    await page.getByRole('button', { name: /바로 시작/ }).click();
    await page.getByRole('button', { name: /새 파일/ }).first().click();
    await page.waitForSelector('.editor-panel .cm-content');
    await expect(page.locator('.titlebar .file')).toHaveAttribute('title', 'untitled.s');
    expect(await shownName(page)).toBe('Save & Assemble');
    await expect(button(page)).toHaveAttribute('title', 'Save & Assemble (Ctrl+S)');
    await page.locator('.cm-content').click();
    await page.keyboard.insertText('main:\n  li $t0, 7\n  li $v0, 10\n  syscall\n');

    // Cancelled: assembled, the machine shown, the file still unsaved.
    await saveDialog(r, null);
    await button(page).click();
    await page.waitForSelector('.run-grid:not([hidden])');
    await settled(page);
    expect(await asked(r)).toBe(1);
    expect(await statusText(page)).toContain('저장하지 않음 (어셈블은 했습니다)');
    await expect(page.locator('.run-placeholder')).toBeHidden();
    await expect(page.locator('.titlebar .dirty')).toBeVisible();
    // F10 steps the program it has: no second question.
    await page.keyboard.press('F10');
    await settled(page);
    expect(await statusText(page)).toContain('1단계');
    expect(await asked(r)).toBe(1);

    // Answered: saved there, then assembled.
    const target = path.join(r.dir, 'mine.s');
    await saveDialog(r, target);
    await button(page).click();
    await settled(page);
    expect(await asked(r)).toBe(2);
    expect(readFileSync(target, 'utf8')).toContain('li $t0, 7');
    expect(await statusText(page)).toContain('저장됨');
    await expect(page.locator('.titlebar .file')).toHaveAttribute('title', 'mine.s');
    await expect(page.locator('.titlebar .dirty')).toHaveCount(0);
  } finally {
    await r.close();
  }
});

test("the tutorial's example: Assemble, since it is never saved -- the tooltip, the status bar and the Run side agree", async () => {
  const r = await launch({ width: 1280, height: 800 });
  const { page } = r;
  try {
    await page.getByRole('button', { name: /튜토리얼 보기/ }).click();
    await page.waitForSelector('.tut-card');
    expect(await shownName(page)).toBe('Assemble');
    await expect(button(page)).toHaveAttribute('title', 'Assemble (Ctrl+S): 예제라서 저장하지 않습니다');
    await expect(placeholderButton(page)).toHaveText(/^Assemble/);
    const before = await statusText(page);
    expect(before).toContain('어셈블 (Ctrl+S)');
    expect(before).not.toContain('저장');
    // Step 2: the card names the button as it is on the student's own files.
    await page.locator('.tut-card .tut-next').click();
    await expect(page.locator('.tut-card')).toContainText('Save & Assemble 버튼');
    await button(page).click();
    await page.waitForSelector('.run-grid:not([hidden])');
    await settled(page);
    expect(await statusText(page)).toContain('예제라서 저장하지 않습니다');
    expect(await shownName(page)).toBe('Assemble');
    await noEntities(page);
  } finally {
    await r.close();
  }
});

test('a title bar too narrow for the long name: Assemble, the tooltip whole; wider, Save & Assemble again', async () => {
  const r = await launch({ width: 910, height: 505 });
  const { page } = r;
  try {
    await openOnly(r, program(r.dir, 'p.s', 'main:\n  li $v0, 10\n  syscall\n'));
    expect(await shownName(page)).toBe('Assemble');
    await expect(page.locator('.titlebar.short')).toHaveCount(1);
    await expect(button(page)).toHaveAttribute('title', 'Save & Assemble (Ctrl+S)');
    await resize(r, { width: 1280, height: 800 });
    await expect.poll(() => shownName(page)).toBe('Save & Assemble');
    await expect(page.locator('.titlebar.short')).toHaveCount(0);
  } finally {
    await r.close();
  }
});
