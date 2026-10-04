/* The Editor: errors that say what to do, breakpoints in its gutter, the
   window's own dialogs, typing (Tab is four columns, Enter starts at 0),
   and a first screen that keeps its shape. */

import { expect, test } from '@playwright/test';

import { launch, openAndAssemble, program, regHex, settled, statusText, side, textRow, type Running } from './harness.ts';

let r: Running;
test.beforeEach(async () => { r = await launch(); });
test.afterEach(async () => { await r.close(); });

const PROGRAM = 'main:\n  li $t0, 5\n  li $t1, 7\n\n  add $t2, $t0, $t1\n  li $v0, 10\n  syscall\n';
// A click in the breakpoint gutter, level with the Editor's line `line`.
const gutterAt = (line: number) => ({
  click: async () => {
    await side(r.page, 'Editor');
    const at = (await r.page.locator('.cm-line').nth(line - 1).boundingBox())!;
    const g = (await r.page.locator('.cm-bp-gutter').boundingBox())!;
    await r.page.mouse.click(g.x + g.width / 2, at.y + at.height / 2);
  },
});

test('an assembly error: under the Editor, what is wrong then what to do, and a mark unlike a breakpoint\'s', async () => {
  const { page } = r;
  await openAndAssemble(r, program(r.dir, 'bad.s', 'main:\n  li $t0, 5\n  srll $t1, $t0, 1\n'));
  const panel = page.locator('.asm');
  await expect(panel.locator('h3')).toHaveText('코드에 오류가 있습니다');                    // what is wrong
  await expect(panel.locator('.notice .say > p')).toHaveText('아래 줄을 고친 뒤 Ctrl+S 키를 다시 누르세요.'); // what to do
  // The line's number twice at most: in the error and on the button.
  expect(((await panel.locator('.notice').textContent()) ?? '').split('3행').length - 1).toBeLessThanOrEqual(2);
  await expect(panel.locator('img.char')).toBeHidden(); // the words alone, right under the Editor
  await expect(panel.locator('.hint')).toContainText('혹시'); // the slip named: srll -> srl
  await expect(panel.locator('.hint .mono').last()).toHaveText('srl');
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
  await side(page, 'Run');
  await (await textRow(page, await page.locator('.trow', { has: page.locator('.lno', { hasText: /^2$/ }) }).getAttribute('data-addr') ?? '')).locator('.bp').click();
  await expect(page.locator('.cm-bp-dot')).toHaveCount(2);
});

test('a breakpoint set while the code is unassembled moves with the text and applies at the next assemble', async () => {
  const { page } = r;
  await openAndAssemble(r, program(r.dir, 'p.s', PROGRAM));
  await side(page, 'Editor');
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

  await side(page, 'Editor');
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

/* Four columns on one line, eight on the next, two on the one after: the
   marks have to come back in one column, the shallowest of the three. */
const BLOCK = 'main:\n    li $t0, 5\n\n        add $t1, $t0, $t0\n  sw $t1, x\n';

/** Into the Editor with `text` in it, and a way to read the lines back. */
async function typed(r: Running, text: string): Promise<() => Promise<string>> {
  const { page, app } = r;
  await page.getByRole('button', { name: /바로 시작/ }).click();
  await page.getByRole('button', { name: /새 파일/ }).first().click();
  await expect(page.locator('.editor-panel')).toBeVisible();
  await app.evaluate(({ clipboard }, t) => clipboard.writeText(t), text);
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+v');
  return () => page.evaluate(() => [...document.querySelectorAll('.cm-line')].map((l) => l.textContent).join('\n'));
}

test('Ctrl+/: one line on and off, a block in one column, blank lines left alone, one undo', async () => {
  const { page } = r;
  const doc = await typed(r, BLOCK);
  // One line, no selection: the line the cursor is on.
  await page.locator('.cm-line').nth(1).click();
  await page.keyboard.press('Control+/');
  expect(await doc()).toBe('main:\n    # li $t0, 5\n\n        add $t1, $t0, $t0\n  sw $t1, x\n');
  await page.keyboard.press('Control+/');
  expect(await doc()).toBe(BLOCK);

  // The three lines of the body, which are indented 4, 8 and 2: the marks go
  // in one column, the shallowest, and the blank line keeps out of it.
  await page.locator('.cm-line').nth(1).click();
  await page.keyboard.down('Shift');
  await page.locator('.cm-line').nth(4).click();
  await page.keyboard.up('Shift');
  await page.keyboard.press('Control+/');
  // The mark is in one column and each line keeps its own indent after it.
  expect(await doc()).toBe('main:\n  #   li $t0, 5\n\n  #       add $t1, $t0, $t0\n  # sw $t1, x\n');
  // Still the same lines selected: toggling again takes them all off.
  await page.keyboard.press('Control+/');
  expect(await doc()).toBe(BLOCK);

  // Part commented: all of them get the mark, and one undo takes it all back.
  await page.locator('.cm-line').nth(1).click();
  await page.keyboard.press('Control+/');
  await page.locator('.cm-line').nth(1).click();
  await page.keyboard.down('Shift');
  await page.locator('.cm-line').nth(4).click();
  await page.keyboard.up('Shift');
  await page.keyboard.press('Control+/');
  expect(await doc()).toBe('main:\n  #   # li $t0, 5\n\n  #       add $t1, $t0, $t0\n  # sw $t1, x\n');
  await page.keyboard.press('Control+z');
  expect(await doc(), 'the block came back a line at a time').toBe(
    'main:\n    # li $t0, 5\n\n        add $t1, $t0, $t0\n  sw $t1, x\n');
});

/* KNOWN WEAK (2.8.2, frozen): this holds that the read-only example is not
   written to, and it is not -- but it does not hold that editor.ts's
   `if (state.readOnly) return true;` is what stops it.  Delete that line and
   this test still passes: its mutant ("Ctrl+/ writing to a read-only
   document") survives.  Instrumenting toggleComment showed it is never
   entered here at all -- with the tutorial open the keydown reaches the
   window's capture phase already defaultPrevented and never gets to
   .cm-content.  What does that is not identified; it is not a renderer
   capture listener (there is none) and not a main-process accelerator
   (Menu.setApplicationMenu(null), no before-input-event, no globalShortcut).
   To get a check the mutant can kill, exercise the guard on a read-only
   document that is not behind the tutorial.  See docs/HANDOVER.md (d). */
test('Ctrl+/ does nothing to a read-only document: the tutorial\'s example is not written to', async () => {
  const { page } = r;
  await page.getByRole('button', { name: /튜토리얼 보기/ }).click();
  await expect(page.locator('.tut-card')).toBeVisible();
  const doc = () => page.evaluate(() => [...document.querySelectorAll('.cm-line')].map((l) => l.textContent).join('\n'));
  const before = await doc();
  expect(before.length, 'the tutorial opened nothing').toBeGreaterThan(20);
  /* Lines with something on them, and both ways the toggle could go: the
     example's first line is a comment already, so one key would take its
     mark off, and the three lines of its .data have none, so one key would
     give them marks.  A blank line, or a line the cursor is not on, would
     pass whatever the editor did. */
  const lines = before.split('\n');
  expect(lines[0], 'the example no longer opens with a comment').toMatch(/^#/);
  for (const n of [3, 4, 5]) expect(lines[n].trim(), `line ${n + 1} is not a plain line`).not.toMatch(/^(#|$)/);
  await page.locator('.cm-line').nth(0).click();
  await page.keyboard.press('Control+/');
  await page.waitForTimeout(150);
  expect(await doc(), 'the read-only example lost its comment mark').toBe(before);
  await page.locator('.cm-line').nth(3).click();
  await page.keyboard.down('Shift');
  await page.locator('.cm-line').nth(5).click();
  await page.keyboard.up('Shift');
  await page.keyboard.press('Control+/');
  await page.waitForTimeout(150);
  expect(await doc(), 'the read-only example was written to').toBe(before);
  // And nothing was put up to say so.
  expect(await page.locator('dialog[open]').count()).toBe(0);
});

test('the first screen keeps its shape from one step to the other, and the window its size into the work', async () => {
  const { page, app } = r;
  const box = async (sel: string) => (await page.locator(sel).boundingBox())!;
  // The package comes in scaled (startfield/glints.css, sf-chip): measured
  // while that runs, it is smaller than it will be, and a step later it
  // would look as though the step had moved it.
  await page.locator('.wcard').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  const card1 = await box('.wcard');
  const first1 = await box('.actions .action >> nth=0');
  const mark1 = await box('.wcard .wlogo');
  const title1 = await box('.wcard .wtitle');
  await page.getByRole('button', { name: /바로 시작/ }).click();
  expect(await box('.wcard')).toEqual(card1);
  expect(await box('.actions .action >> nth=0')).toEqual(first1);
  expect(await box('.wcard .wlogo')).toEqual(mark1);
  expect(await box('.wcard .wtitle')).toEqual(title1);
  const size = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getContentSize());
  await page.getByRole('button', { name: /새 파일/ }).first().click();
  await expect(page.locator('.editor-panel')).toBeVisible();
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getContentSize())).toEqual(size);
});
