/* The window's frame and layout: the title bar is the app's own, the Editor
   and the Run side sit side by side, the Run side shows the machine only
   while it holds the Editor's program, and the Editor marks the line being
   executed. */

import { expect, test } from '@playwright/test';

import { launch, openAndAssemble, program, regHex, resize, settled, type Running } from './harness.ts';

let r: Running;
test.beforeEach(async () => { r = await launch(); });
test.afterEach(async () => { await r.close(); });

const PROGRAM = 'main:\n  li $t0, 5\n  li $t1, 7\n  add $t2, $t0, $t1\n  li $v0, 10\n  syscall\n';

test('the title bar is the window\'s own: name, logo, a drag region, room for the caption buttons', async () => {
  const { page } = r;
  await expect(page.locator('.titlebar .appname')).toHaveText('Hallym MIPS');
  await expect(page).toHaveTitle('Hallym MIPS');
  expect(await page.evaluate(() => (navigator as unknown as { windowControlsOverlay?: { visible: boolean } }).windowControlsOverlay?.visible))
    .toBe(true); // titleBarOverlay: the system draws the caption buttons
  const regions = await page.evaluate(() => ({
    bar: getComputedStyle(document.querySelector('.titlebar')!).getPropertyValue('-webkit-app-region'),
    button: getComputedStyle(document.querySelector('.titlebar button')!).getPropertyValue('-webkit-app-region'),
  }));
  expect(regions).toEqual({ bar: 'drag', button: 'no-drag' });
  // Nothing of ours under the caption buttons.
  const free = await page.evaluate(() => {
    const o = (navigator as unknown as { windowControlsOverlay: { getTitlebarAreaRect(): DOMRect } }).windowControlsOverlay.getTitlebarAreaRect();
    const tools = document.querySelector('.titlebar .tools')!.getBoundingClientRect();
    return tools.right <= o.x + o.width;
  });
  expect(free).toBe(true);
});

test('Run side: a card before the first assemble, the machine after, another card once the code changes', async () => {
  const { page } = r;
  await page.getByRole('button', { name: /바로 시작/ }).click();
  await page.getByRole('button', { name: /새 파일/ }).first().click();
  await expect(page.locator('.editor-panel')).toBeVisible();
  const card = page.locator('.run-placeholder');
  await expect(card).toHaveAttribute('data-kind', 'fresh');
  await expect(card).toContainText('아직 어셈블하지 않았습니다');
  await expect(page.locator('.run-grid')).toBeHidden();

  await openAndAssemble(r, program(r.dir, 'p.s', PROGRAM));
  await expect(page.locator('.run-grid')).toBeVisible();
  await expect(card).toBeHidden();

  await page.locator('.cm-content').click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' # 바꿈');
  await expect(card).toHaveAttribute('data-kind', 'changed');
  await expect(card).toContainText('코드가 바뀌었습니다');
  await expect(page.locator('.run-grid')).toBeHidden();
  await page.keyboard.press('Control+s');
  await expect(page.locator('.run-grid')).toBeVisible();
});

test('the Editor marks the line being executed, and only the student\'s own lines', async () => {
  const { page } = r;
  // Long enough that the start-up code's line numbers (the exception
  // handler's, 183 and on) are lines of this file too: they must not be marked.
  const padded = PROGRAM + Array.from({ length: 220 }, (_, i) => `# ${i}`).join('\n') + '\n';
  await openAndAssemble(r, program(r.dir, 'p.s', padded));
  await expect(page.locator('.cm-pc-line')).toHaveCount(0); // not started
  await page.keyboard.press('F10'); // start-up code: its lines are the exception handler's, not the Editor's
  await settled(page);
  await expect(page.locator('.cm-pc-line')).toHaveCount(0);
  for (let i = 0; i < 20 && (await regHex(page, '$t0')) === '0x00000000'; i += 1) {
    await page.keyboard.press('F10');
    await settled(page);
  }
  // li $t0, 5 has run: PC is at li $t1, 7 -- line 3.
  await expect(page.locator('.cm-pc-line')).toHaveText('  li $t1, 7');
  await page.keyboard.press('F10');
  await settled(page);
  await expect(page.locator('.cm-pc-line')).toHaveText('  add $t2, $t0, $t1');
  // The Text row and the Editor line agree.
  await expect(page.locator('.trow.pc .lno')).toHaveText('4');
});

test('splitter: drag to share the width, fold either side away and back', async () => {
  const { page } = r;
  await openAndAssemble(r, program(r.dir, 'p.s', PROGRAM));
  const editorBox = async () => (await page.locator('.pane-editor').boundingBox())!;
  const before = (await editorBox()).width;
  const grip = (await page.locator('.splitter .grip').boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + 150, grip.y + grip.height / 2, { steps: 5 });
  await page.mouse.up();
  expect((await editorBox()).width).toBeGreaterThan(before + 100);

  await page.getByRole('button', { name: 'Editor 접기' }).click();
  await expect(page.locator('.editor-panel')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Editor 펼치기' })).toBeVisible();
  await page.getByRole('button', { name: 'Editor 펼치기' }).click();
  await expect(page.locator('.editor-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Run 접기' }).click();
  await expect(page.locator('.run-grid')).toBeHidden();
  await page.getByRole('button', { name: 'Run 펼치기' }).click();
  await expect(page.locator('.run-grid')).toBeVisible();
});

test('narrow windows show one side at a time; 1093 wide (1366 at 125%) keeps both', async () => {
  const { page } = r;
  await openAndAssemble(r, program(r.dir, 'p.s', PROGRAM));
  await resize(r, { width: 1093, height: 582 });
  await expect(page.locator('.viewswitch')).toBeHidden();
  await expect(page.locator('.editor-panel')).toBeVisible();
  await expect(page.locator('.run-grid')).toBeVisible();
  await resize(r, { width: 910, height: 505 });
  await expect(page.locator('.viewswitch')).toBeVisible();
  await page.locator('.viewswitch button', { hasText: 'Editor' }).click();
  await expect(page.locator('.editor-panel')).toBeVisible();
  await expect(page.locator('.run-grid')).toBeHidden();
  await page.locator('.viewswitch button', { hasText: 'Run' }).click();
  await expect(page.locator('.run-grid')).toBeVisible();
  await expect(page.locator('.editor-panel')).toBeHidden();
});
