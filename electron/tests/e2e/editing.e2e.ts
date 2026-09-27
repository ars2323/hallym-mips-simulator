/* Changing the code while a program is in the machine (app.ts, docs/
   PORTING.md 25):
   - the Run side stays -- the last program that assembled -- with a band
     that says so; Run, Step and Reset go on with that program;
   - an assemble with errors (checked in a second process first) leaves the
     machine as it was: its program, its registers, where it had run to;
     so does a program that ends the core (.err);
   - the Editor marks no line while its code is not the machine's (its
     lines are not the program's), Text still shows where PC is; after the
     next assemble the Editor's mark is back, on the right line;
   - a breakpoint set in changed code takes effect at the next assemble;
   - Reset starts the machine's program again, not the Editor's code;
   - the Assemble panel under the Editor is as tall as its words, the
     Editor keeps its least, the grip sets a height, a double click puts
     it back. */

import { expect, test, type Page } from '@playwright/test';

import { launch, openAndAssemble, program, regHex, resize, sample, settled, side, statusText, type Running } from './harness.ts';

const PROGRAM = 'main:\n  li $t0, 1\n  li $t1, 2\n  li $t2, 3\n  li $v0, 10\n  syscall\n';

let r: Running;
test.beforeEach(async () => { r = await launch(); });
test.afterEach(async () => { await r.close(); });

const pcAddr = (page: Page) => page.locator('.trow.pc').getAttribute('data-addr');
const pcLines = (page: Page) => page.locator('.cm-pc-line');

// F10 until the Editor marks `text` as the line to run next.
async function stepTo(page: Page, text: string): Promise<void> {
  for (let i = 0; i < 30; i += 1) {
    if ((await pcLines(page).count()) === 1 && (await pcLines(page).textContent()) === text) return;
    await page.keyboard.press('F10');
    await settled(page);
  }
  throw new Error(`never at ${text}`);
}

async function typeAt(page: Page, where: 'top' | 'end', text: string): Promise<void> {
  await side(page, 'Editor');
  await page.locator('.cm-content').click();
  await page.keyboard.press(where === 'top' ? 'Control+Home' : 'Control+End');
  await page.keyboard.insertText(text);
}

test('changed code: the machine stays; Step and Run go on with the last program; the Editor marks no line until the next assemble', async () => {
  const { page } = r;
  await openAndAssemble(r, program(r.dir, 'p.s', PROGRAM));
  await stepTo(page, '  li $t1, 2');
  const at = await pcAddr(page);
  expect(await regHex(page, '$t0')).toBe('0x00000001');

  await typeAt(page, 'top', '# 고침\n');
  await expect(pcLines(page)).toHaveCount(0);              // its lines are not the program's
  await expect(page.locator('.asm')).toHaveAttribute('data-state', 'changed');
  await side(page, 'Run');                                 // (a narrow window: the Run tab)
  await expect(page.locator('.run-band')).toBeVisible();
  await expect(page.locator('.run-grid')).toBeVisible();

  await page.keyboard.press('F10');                         // the program in the machine, one line on
  await settled(page);
  expect(Number(await pcAddr(page))).toBe(Number(at) + 4);
  expect(await regHex(page, '$t1')).toBe('0x00000002');
  await expect(pcLines(page)).toHaveCount(0);
  await page.keyboard.press('F5');
  await settled(page);
  expect(await statusText(page)).toContain('프로그램이 끝났습니다');
  expect(await regHex(page, '$t2')).toBe('0x00000003');

  // Assembled again: the band goes, and the Editor's mark is back -- on the new line numbers.
  await page.keyboard.press('Control+s');
  await expect(page.locator('.run-band')).toBeHidden();
  await stepTo(page, '  li $t1, 2');
  expect(await pcLines(page).evaluate((e) => e.closest('.cm-content') !== null)).toBe(true);
  const line = await page.evaluate(() => {
    const view = (document.querySelector('.cm-pc-line') as HTMLElement);
    return [...document.querySelectorAll('.cm-line')].indexOf(view) + 1;
  });
  expect(line).toBe(4); // was line 3; the comment added at the top moved it
});

test('repeated lines: after a line added above, the same text one line up is not the line being run -- the Editor marks none', async () => {
  const { page } = r;
  await openAndAssemble(r, program(r.dir, 'same.s', 'main:\n  addi $t0, $t0, 1\n  addi $t0, $t0, 1\n  addi $t0, $t0, 1\n  li $v0, 10\n  syscall\n'));
  // To the second addi (line 3): PC at its word.
  await stepTo(page, '  addi $t0, $t0, 1');
  await page.keyboard.press('F10');
  await settled(page);
  expect(await regHex(page, '$t0')).toBe('0x00000001');
  await typeAt(page, 'top', '# 한 줄 더\n');   // line 3 is now the first addi: the same text
  await page.keyboard.press('F10');
  await settled(page);
  expect(await regHex(page, '$t0')).toBe('0x00000002');
  await expect(pcLines(page)).toHaveCount(0);
  await expect(page.locator('.trow.pc')).toHaveCount(1); // Text shows where PC is
});

test('an assemble with errors leaves the machine as it was: its program, its registers, where it had run to', async () => {
  const { page } = r;
  await openAndAssemble(r, program(r.dir, 'p.s', PROGRAM));
  await stepTo(page, '  li $t1, 2');
  const at = await pcAddr(page);
  await typeAt(page, 'end', '  srll $t3, $t0, 1\n');
  await page.keyboard.press('Control+s');
  await expect(page.locator('.asm')).toHaveAttribute('data-state', 'errors');
  await expect(page.locator('.asm .item')).toHaveCount(1);
  await expect(page.locator('.asm .item .line')).toHaveText('7행');
  await side(page, 'Run');
  await expect(page.locator('.run-grid')).toBeVisible();
  await expect(page.locator('.run-band')).toBeVisible();
  expect(await pcAddr(page)).toBe(at);
  expect(await regHex(page, '$t0')).toBe('0x00000001');
  expect(await statusText(page)).toContain('고친 코드에 오류 1개');
  await page.keyboard.press('F10');
  await settled(page);
  expect(Number(await pcAddr(page))).toBe(Number(at) + 4);
  expect(await regHex(page, '$t1')).toBe('0x00000002');
});

test('a program that ends the core (.err) ends the second process only: the machine on screen goes on', async () => {
  const { page } = r;
  await openAndAssemble(r, program(r.dir, 'p.s', PROGRAM));
  await stepTo(page, '  li $t1, 2');
  const at = await pcAddr(page);
  await typeAt(page, 'end', '  .err\n');
  await page.keyboard.press('Control+s');
  await expect(page.locator('.asm .item')).toContainText('시뮬레이터가 중단되었습니다');
  await side(page, 'Run');
  expect(await pcAddr(page)).toBe(at);
  await page.keyboard.press('F10');
  await settled(page);
  expect(await regHex(page, '$t1')).toBe('0x00000002');
});

test('a breakpoint set in changed code takes effect at the next assemble', async () => {
  const { page } = r;
  await openAndAssemble(r, program(r.dir, 'p.s', PROGRAM));
  await typeAt(page, 'end', '# 끝\n');
  // The gutter of line 4 (li $t2, 3): a dot, and a word that it waits.
  const line4 = page.locator('.cm-line').nth(3);
  const box = (await line4.boundingBox())!;
  const gutter = (await page.locator('.cm-bp-gutter').boundingBox())!;
  await page.mouse.click(gutter.x + gutter.width / 2, box.y + box.height / 2);
  await expect(page.locator('.cm-bp-dot')).toHaveCount(1);
  await expect(page.locator('.status')).toContainText('다시 어셈블하면(Ctrl+S) 적용됩니다');
  await page.keyboard.press('F5');
  await settled(page);
  expect(await statusText(page)).toContain('프로그램이 끝났습니다'); // not yet
  await page.keyboard.press('Control+s');
  await expect(page.locator('.asm')).toHaveAttribute('data-state', 'ok'); // assembled (keys wait while it does)
  await page.keyboard.press('F5');
  await settled(page);
  expect(await statusText(page)).toContain('브레이크포인트');
  expect(await regHex(page, '$t2')).toBe('0x00000000');
});

test('Reset starts the program in the machine again, not the Editor\'s code', async () => {
  const { page } = r;
  await openAndAssemble(r, program(r.dir, 'p.s', PROGRAM));
  await page.keyboard.press('F5');
  await settled(page);
  expect(await regHex(page, '$t2')).toBe('0x00000003');
  // li $t2, 3 -> li $t2, 9, not assembled.
  await side(page, 'Editor');
  const line4 = page.locator('.cm-line').nth(3);
  await line4.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Backspace');
  await page.keyboard.insertText('9');
  await expect(line4).toHaveText('  li $t2, 9');
  await page.getByRole('button', { name: /Reset/ }).click();
  await expect(page.locator('.status')).toContainText('Step · ');
  await side(page, 'Run');
  expect(await regHex(page, '$t2')).toBe('0x00000000');
  await expect(page.locator('.run-band')).toBeVisible();   // still the last assembled code
  await page.keyboard.press('F5');
  await settled(page);
  expect(await regHex(page, '$t2')).toBe('0x00000003');     // its li $t2, 3
  await side(page, 'Editor');
  await expect(line4).toHaveText('  li $t2, 9');            // the Editor untouched
});

test('the Assemble panel: as tall as its words, the Editor its least, the grip; at 910x505', async () => {
  const { page } = r;
  await resize(r, { width: 910, height: 505 });
  const heights = () => page.evaluate(() => ({
    editor: Math.round(document.querySelector('.editor-panel')!.getBoundingClientRect().height),
    asm: Math.round(document.querySelector('.asm')!.getBoundingClientRect().height),
  }));
  await openAndAssemble(r, program(r.dir, 'ok.s', PROGRAM));
  await side(page, 'Editor');
  const clean = await heights();
  await openAndAssemble(r, program(r.dir, 'one.s', 'main:\n  srll $t1, $t0, 1\n'));
  const one = await heights();
  await openAndAssemble(r, sample(r.dir, 'tests/samples/editor-errors.s'));
  await expect(page.locator('.asm .item')).toHaveCount(3);
  const three = await heights();
  console.log(`[910x505] Editor/Assemble: clean ${clean.editor}/${clean.asm}, one error ${one.editor}/${one.asm}, three ${three.editor}/${three.asm}`);
  expect(clean.asm).toBeLessThan(100);
  expect(one.asm).toBeGreaterThan(clean.asm + 60);
  expect(three.asm).toBeGreaterThanOrEqual(one.asm);
  // The Editor keeps six lines and its head, whatever the panel says.
  // (at least its head and six lines of 22 px, with room for a sideways scroll bar)
  const least = await page.evaluate(() => 34 + 6 * parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--row')) + 22);
  for (const h of [clean, one, three]) expect(h.editor).toBeGreaterThanOrEqual(least);
  // The list scrolls inside the panel when it is taller than the room.
  await expect(page.locator('.asm .abody')).toHaveCSS('overflow-y', 'auto');

  // The grip: dragged up, the panel taller (never past the Editor's least); a double click puts it back.
  const grip = page.locator('.pane-editor > .vgrip');
  const g = (await grip.boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2, g.y - 400, { steps: 5 });
  await page.mouse.up();
  const dragged = await heights();
  expect(dragged.editor).toBeGreaterThanOrEqual(least);
  await grip.dblclick();
  expect((await heights()).asm).toBe(three.asm);
});
