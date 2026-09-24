/* The Editor: errors that say what to do, breakpoints in its gutter, the
   window's own dialogs, typing (Tab is four columns, Enter starts at 0),
   and a first screen that keeps its shape. */

import { expect, test } from '@playwright/test';

import { launch, openAndAssemble, program, regHex, settled, statusText, textRow, type Running } from './harness.ts';

let r: Running;
test.beforeEach(async () => { r = await launch(); });
test.afterEach(async () => { await r.close(); });

const PROGRAM = 'main:\n  li $t0, 5\n  li $t1, 7\n\n  add $t2, $t0, $t1\n  li $v0, 10\n  syscall\n';
// A click in the breakpoint gutter, level with the Editor's line `line`.
const gutterAt = (line: number) => ({
  click: async () => {
    const at = (await r.page.locator('.cm-line').nth(line - 1).boundingBox())!;
    const g = (await r.page.locator('.cm-bp-gutter').boundingBox())!;
    await r.page.mouse.click(g.x + g.width / 2, at.y + at.height / 2);
  },
});

test('an assembly error: what to do first, Haram, and a mark unlike a breakpoint\'s', async () => {
  const { page } = r;
  await openAndAssemble(r, program(r.dir, 'bad.s', 'main:\n  li $t0, 5\n  srll $t1, $t0, 1\n'));
  const panel = page.locator('.errors');
  await expect(panel.locator('h3')).toHaveText('3행을 고친 뒤 다시 Ctrl+S 하면 됩니다');
  await expect(panel.locator('img.char')).toHaveCount(1);
  await expect(panel.locator('.hint')).toContainText('레지스터 이름');
  await expect(page.locator('.cm-error-gutter .cm-error-mark')).toHaveText('!');
  await expect(page.locator('.cm-bp-dot')).toHaveCount(0);
  await panel.getByRole('button', { name: '3행으로 가기' }).click();
  expect(await page.evaluate(() => document.getSelection()?.anchorNode?.parentElement?.closest('.cm-line')?.textContent)).toBe('  srll $t1, $t0, 1');
});

test('breakpoints from the Editor\'s gutter: set before assembling, kept, stopped at, shown in Text', async () => {
  const { page } = r;
  await page.getByRole('button', { name: /바로 시작/ }).click();
  await page.getByRole('button', { name: /새 파일/ }).first().click();
  await openAndAssemble(r, program(r.dir, 'p.s', PROGRAM));
  await gutterAt(5).click(); // add $t2 ...
  await expect(page.locator('.cm-bp-dot')).toHaveCount(1);
  await expect(page.locator('.trow.bp-on .lno')).toHaveText('5');
  await page.keyboard.press('F5');
  await settled(page);
  expect(await statusText(page)).toContain('브레이크포인트');
  expect(await regHex(page, '$t1')).toBe('0x00000007');
  expect(await regHex(page, '$t2')).toBe('0x00000000');
  await expect(page.locator('.cm-pc-line')).toHaveText('  add $t2, $t0, $t1');

  // A line with no instruction takes no breakpoint.
  await gutterAt(4).click();
  await expect(page.locator('.cm-bp-dot')).toHaveCount(1);
  await expect(page.locator('.status')).toContainText('4행에는 명령이 없습니다');

  // Set in Text: the Editor shows it on the source line.
  await page.getByRole('button', { name: /Reset/ }).click();
  await settled(page);
  await (await textRow(page, await page.locator('.trow', { has: page.locator('.lno', { hasText: /^2$/ }) }).getAttribute('data-addr') ?? '')).locator('.bp').click();
  await expect(page.locator('.cm-bp-dot')).toHaveCount(2);
});

test('a breakpoint set while the code is unassembled moves with the text and applies at the next assemble', async () => {
  const { page } = r;
  await openAndAssemble(r, program(r.dir, 'p.s', PROGRAM));
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+Home');
  await page.keyboard.insertText('# 맨 위에 한 줄\n'); // now dirty: the Run side waits
  await gutterAt(6).click();              // add $t2 is line 6 now
  await expect(page.locator('.cm-bp-dot')).toHaveCount(1);
  await page.keyboard.press('Control+Home');
  await page.keyboard.insertText('# 또 한 줄\n'); // the mark moves to line 7
  await page.keyboard.press('Control+s');
  await expect(page.locator('.run-grid')).toBeVisible();
  await expect(page.locator('.trow.bp-on .lno')).toHaveText('7');
});

test('the window\'s own dialogs: a new file is asked about even when saved; unsaved text before opening another', async () => {
  const { page } = r;
  await openAndAssemble(r, program(r.dir, 'p.s', PROGRAM));
  await page.getByTitle('New file').click();
  const dialog = page.locator('dialog.ask');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('img.char')).toHaveCount(1);
  await expect(dialog).toContainText('저장되어 있습니다');
  await dialog.getByRole('button', { name: '돌아가기' }).click();
  await expect(page.locator('.titlebar .file')).toContainText('p.s');

  await page.locator('.cm-content').click();
  await page.keyboard.insertText('# 바꿈\n');
  await page.getByTitle('Open file (Ctrl+O)').click();
  await expect(dialog).toContainText('저장하지 않은 변경이 있습니다');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.getByTitle('New file').click();
  await dialog.getByRole('button', { name: '버리고 계속' }).click();
  await expect(page.locator('.titlebar .file')).toContainText('untitled.s');
  expect(await page.locator('.cm-content').textContent()).toBe('');
});

test('typing: Tab is four columns, Shift+Tab takes four back, Enter starts at column 0', async () => {
  const { page } = r;
  await page.getByRole('button', { name: /바로 시작/ }).click();
  await page.getByRole('button', { name: /새 파일/ }).first().click();
  await page.locator('.cm-content').click();
  const doc = () => page.evaluate(() => [...document.querySelectorAll('.cm-line')].map((l) => l.textContent).join('\n'));
  await page.keyboard.press('Tab');
  await page.keyboard.insertText('li');
  await page.keyboard.press('Tab');
  await page.keyboard.insertText('$t0, 5');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('x');
  expect(await doc()).toBe('    li  $t0, 5\nx');
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Tab');
  expect(await doc()).toBe('        li  $t0, 5\n    x');
  await page.keyboard.press('Shift+Tab');
  expect(await doc()).toBe('    li  $t0, 5\nx');
});

test('the first screen keeps its shape from one step to the other, and the window its size into the work', async () => {
  const { page, app } = r;
  const box = async (sel: string) => (await page.locator(sel).boundingBox())!;
  const card1 = await box('.wcard');
  const first1 = await box('.actions .action >> nth=0');
  const lead1 = await box('.wcard .lead');
  await page.getByRole('button', { name: /바로 시작/ }).click();
  expect(await box('.wcard')).toEqual(card1);
  expect(await box('.actions .action >> nth=0')).toEqual(first1);
  expect(await box('.wcard .lead')).toEqual(lead1);
  const size = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getContentSize());
  await page.getByRole('button', { name: /새 파일/ }).first().click();
  await expect(page.locator('.editor-panel')).toBeVisible();
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getContentSize())).toEqual(size);
});
