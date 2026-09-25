/* Korean input, through Chromium's IME path: CDP Input.imeSetComposition /
   Input.insertText (what an IME does to the page) and the key events an IME
   sends while it composes (keyCode 229, isComposing set), not synthetic
   typing.  No Korean Windows needed: what breaks is the order of these
   events, and they are the same on every OS.

   Two kinds of IME for Enter and Tab:
   - Windows' Microsoft Korean IME: the key comes to the page as "Process"
     (keyCode 229, composing), the IME commits the syllable, then the key
     goes on to the page as itself -- one press gives the syllable and a new
     line, as in Notepad.  This is the order the real IME produced on the
     Windows CI runner (tests/e2e/ime-real.e2e.ts, report/ime-real/):
     keydown Process 229 composing, compositionend, keydown Enter 13.
   - an IME that takes the key for itself (macOS's sends it as "Enter" with
     keyCode 229): 229, the commit, and nothing more -- the syllable only;
     the next press makes the new line.
   Either way the syllable is there once, whole, and the lines are what the
   IME asked for; what is saved is what is on screen.

   Every test ends on the file on disk (what the editor really holds, not
   what the DOM shows). */

import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { answerSave, launch, openAndAssemble, openOnly, program, sample, settled, side, type Running } from './harness.ts';

let r: Running;
test.beforeEach(async () => { r = await launch(); });
test.afterEach(async () => { await r.close(); });

// ---- the IME, through CDP -----------------------------------------------------------------

const ime = (page: Page) => page.context().newCDPSession(page);
const compose = (cdp: CDPSession, text: string) =>
  cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length });
const commit = (cdp: CDPSession, text: string) => cdp.send('Input.insertText', { text });
const VK: Record<string, number> = { Enter: 13, Tab: 9, Backspace: 8 };
// A key the IME has (keyCode 229: "processed by the IME"); Windows names it
// "Process", macOS keeps the key's name.
const toIme = (cdp: CDPSession, key: string, name = key) =>
  cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: name, code: key, windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 });
// The key itself, as the IME lets it go on.
async function pass(cdp: CDPSession, key: string) {
  const text = key === 'Enter' ? '\r' : key === 'Tab' ? '\t' : undefined;
  const k = { key, code: key, windowsVirtualKeyCode: VK[key], nativeVirtualKeyCode: VK[key] };
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...k });
  if (text) await cdp.send('Input.dispatchKeyEvent', { type: 'char', ...k, text, unmodifiedText: text });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...k });
}
// One syllable typed jamo by jamo and committed: ㅎ 하 한.
async function syllable(cdp: CDPSession, steps: string[]) {
  for (const s of steps) await compose(cdp, s);
  await commit(cdp, steps[steps.length - 1]);
}
// Composing `steps`, then the Windows IME's `key`: Process 229, commit, the key.
async function windowsKey(cdp: CDPSession, steps: string[], key: string) {
  for (const s of steps) await compose(cdp, s);
  await toIme(cdp, key, 'Process');
  await commit(cdp, steps[steps.length - 1]);
  await pass(cdp, key);
}

// ---- the editor -----------------------------------------------------------------------------

const lines = () => r.page.evaluate(() => [...document.querySelectorAll('.cm-line')].map((l) => l.textContent ?? ''));
const doc = async () => (await lines()).join('\n');
// The cursor: its line (1-based) and column.
const cursor = () => r.page.evaluate(() => {
  const sel = getSelection()!;
  const line = (sel.focusNode instanceof Element ? sel.focusNode : sel.focusNode!.parentElement)!.closest('.cm-line')!;
  const all = [...document.querySelectorAll('.cm-line')];
  const range = document.createRange();
  range.setStart(line, 0);
  range.setEnd(sel.focusNode!, sel.focusOffset);
  return { line: all.indexOf(line) + 1, column: range.toString().length };
});

async function newFileWith(text: string): Promise<CDPSession> {
  const { page } = r;
  await page.getByRole('button', { name: /바로 시작/ }).click();
  await page.getByRole('button', { name: /새 파일/ }).first().click();
  await page.locator('.cm-content').click();
  await page.keyboard.insertText(text);
  return ime(page);
}

// Saves (Ctrl+S, not composing) to `name` and returns the file's text; the
// bytes are UTF-8 (checked by decoding them back).
async function saved(name = 'ime.s'): Promise<string> {
  const file = path.join(r.dir, name);
  if (!existsSync(file)) await answerSave(r.app, file);
  await r.page.locator('.cm-content').focus();
  await r.page.keyboard.press('Control+s');
  await expect.poll(() => existsSync(file)).toBe(true);
  await expect(r.page.locator('.top .dirty')).toHaveCount(0);
  const bytes = readFileSync(file);
  expect(Buffer.from(bytes.toString('utf8'), 'utf8').equals(bytes)).toBe(true);
  return bytes.toString('utf8');
}

test('syllables are composed jamo by jamo and committed once each', async () => {
  const cdp = await newFileWith('main: # ');
  await syllable(cdp, ['ㅎ', '하', '한']);
  await syllable(cdp, ['ㄱ', '그', '글']);
  await r.page.keyboard.insertText(' ok');
  expect(await doc()).toBe('main: # 한글 ok');
  expect(await saved()).toBe('main: # 한글 ok');
});

test('Enter while composing, Windows IME: the syllable, then one new line, the cursor at column 0', async () => {
  const cdp = await newFileWith('main: # ');
  await windowsKey(cdp, ['ㅎ', '하', '한'], 'Enter');
  expect(await lines()).toEqual(['main: # 한', '']);
  expect(await cursor()).toEqual({ line: 2, column: 0 });
  await pass(cdp, 'Enter');
  expect(await lines()).toEqual(['main: # 한', '', '']);
  expect(await cursor()).toEqual({ line: 3, column: 0 });
  expect(await saved()).toBe('main: # 한\n\n');
});

test('Enter while composing, an IME that takes the key: the syllable only; the next Enter makes the line', async () => {
  const cdp = await newFileWith('main: # ');
  for (const s of ['ㅎ', '하', '한']) await compose(cdp, s);
  await toIme(cdp, 'Enter');
  await commit(cdp, '한');
  expect(await lines()).toEqual(['main: # 한']);
  expect(await cursor()).toEqual({ line: 1, column: 9 });
  await pass(cdp, 'Enter');
  expect(await lines()).toEqual(['main: # 한', '']);
  expect(await cursor()).toEqual({ line: 2, column: 0 });
  expect(await saved()).toBe('main: # 한\n');
});

test('Tab while composing: the syllable whole, then spaces to the next multiple of four', async () => {
  const cdp = await newFileWith('# ');
  await windowsKey(cdp, ['ㅎ', '하', '한'], 'Tab'); // "# 한" is 3 characters: one space to column 4
  await syllable(cdp, ['ㄱ', '그', '글']);
  expect(await doc()).toBe('# 한 글');
  // The IME that takes the key: the syllable, no spaces.
  for (const s of ['ㅁ', '마', '말']) await compose(cdp, s);
  await toIme(cdp, 'Tab');
  await commit(cdp, '말');
  expect(await doc()).toBe('# 한 글말');
  expect(await saved()).toBe('# 한 글말');
});

test('Backspace while composing takes back one jamo at a time, and nothing before the syllable', async () => {
  const cdp = await newFileWith('main: # 가');
  for (const s of ['ㄷ', '다', '닭']) await compose(cdp, s);
  // The IME takes Backspace: 닭 -> 달 -> 다 -> ㄷ -> nothing.
  for (const s of ['달', '다', 'ㄷ']) { await toIme(cdp, 'Backspace'); await compose(cdp, s); expect(await doc()).toBe(`main: # 가${s}`); }
  await toIme(cdp, 'Backspace');
  await compose(cdp, '');
  expect(await doc()).toBe('main: # 가');
  // The syllable before is still there, whole; the composition goes on after it.
  await syllable(cdp, ['ㄴ', '나']);
  expect(await doc()).toBe('main: # 가나');
  // A Backspace after the commit is an ordinary one: one syllable.
  await pass(cdp, 'Backspace');
  expect(await saved()).toBe('main: # 가');
});

test('Ctrl+S in the middle of a syllable waits for it, then saves and assembles it whole', async () => {
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
  expect(readFileSync(file, 'utf8')).toBe('main:\n  li $v0, 10\n  syscall # 끝');
  expect(await doc()).toBe('main:\n  li $v0, 10\n  syscall # 끝');
  await expect(page.locator('.top .dirty')).toHaveCount(0); // saved once the syllable was in
});

test('clicking another panel while composing commits the syllable, whole and once', async () => {
  const { page } = r;
  const file = sample(r.dir, 'tests/samples/lab04-ok.s', 'ime.s');
  await openAndAssemble(r, file);
  const first = readFileSync(file, 'utf8').split('\n')[0].replace(/\r$/, '');
  await side(page, 'Editor');
  // The end of the first line: a comment in Korean, left half-typed.
  await page.locator('.cm-line').first().click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' # ');
  const cdp = await ime(page);
  await syllable(cdp, ['ㅁ', '메', '멤']);
  for (const s of ['ㅗ', '모']) await compose(cdp, s);
  // The Run side (after an edit it says the code has changed).
  await side(page, 'Run');
  await page.locator('.run-placeholder h3').click();
  await page.waitForTimeout(200);
  expect((await lines())[0]).toBe(`${first} # 멤모`);
  // Typing again in the Editor does not bring the old composition back.
  await side(page, 'Editor');
  await page.locator('.cm-content').focus();
  await page.keyboard.press('End');
  await page.keyboard.insertText('!');
  expect((await lines())[0]).toBe(`${first} # 멤모!`);
  expect((await saved('ime.s')).split('\n')[0].replace(/\r$/, '')).toBe(`${first} # 멤모!`);
});

test('Korean at the end of a line, then Enter: the next line is typed and the program assembles and runs', async () => {
  const { page } = r;
  const cdp = await newFileWith('main:\n    li $v0, 10    # ');
  await syllable(cdp, ['ㄲ', '끄', '끝']);
  await syllable(cdp, ['ㄴ', '내']);
  await windowsKey(cdp, ['ㄱ', '기'], 'Enter');
  expect(await cursor()).toEqual({ line: 3, column: 0 });
  await page.keyboard.insertText('    syscall');
  expect(await saved()).toBe('main:\n    li $v0, 10    # 끝내기\n    syscall');
  await expect(page.locator('.run-grid')).toBeVisible();
  await page.keyboard.press('F5');
  await settled(page);
  await expect(page.locator('.status')).toContainText('끝났습니다');
});

test('a file with Korean comments and strings: assembled, run, the string printed whole (UTF-8 and CP949)', async () => {
  const { page } = r;
  for (const name of ['hangul-utf8.s', 'hangul-cp949.s']) {
    await openAndAssemble(r, sample(r.dir, `tests/samples/${name}`));
    await expect(page.locator('.run-grid')).toBeVisible();
    await page.keyboard.press('F5');
    await settled(page);
    await expect(page.locator('.console .clog')).toHaveText('안녕하세요, MIPS!\n');
    expect(await doc()).toContain('# 출력');
    expect(await doc()).toContain('# 돌아가기');
  }
});

test('typed in Korean, saved, opened again: the same text (UTF-8, byte for byte)', async () => {
  const { page } = r;
  const cdp = await newFileWith('# ');
  await syllable(cdp, ['ㅇ', '어']);
  await syllable(cdp, ['ㅅ', '세']);
  await syllable(cdp, ['ㅁ', '므', '믈']);
  await page.keyboard.insertText('리 — 반복문 ①');
  const text = await saved('round.s');
  expect(text).toBe('# 어세믈리 — 반복문 ①');
  expect(readFileSync(path.join(r.dir, 'round.s')).equals(Buffer.from(text, 'utf8'))).toBe(true);
  // Another file, then the saved one opened again.
  await openOnly(r, sample(r.dir, 'tests/samples/lab04-ok.s'));
  expect(await doc()).not.toContain('어세믈리');
  await openOnly(r, path.join(r.dir, 'round.s'));
  expect(await doc()).toBe('# 어세믈리 — 반복문 ①');
  await expect(page.locator('.editor-panel .pmeta')).toContainText('UTF-8');
});

// ---- the Console's input (syscall 8) ----------------------------------------------------------

// Reads a line (syscall 8) and prints it back between [ and ].
const ECHO = `        .data
buf:    .space 64
open:   .asciiz "["
close:  .asciiz "]"
        .text
main:   li $v0, 8
        la $a0, buf
        li $a1, 64
        syscall
        li $v0, 4
        la $a0, open
        syscall
        la $a0, buf
        syscall
        la $a0, close
        syscall
        li $v0, 10
        syscall
`;

async function waitingForInput(): Promise<CDPSession> {
  const { page } = r;
  await openAndAssemble(r, program(r.dir, 'echo.s', ECHO));
  await page.keyboard.press('F5');
  const input = page.locator('.console .cinput');
  await expect(input).toBeVisible();
  await input.click();
  return ime(page);
}
const consoleText = () => r.page.locator('.console .clog').textContent();

test('Console input, Windows IME: Korean composed, Enter sends the line once, whole', async () => {
  const { page } = r;
  const cdp = await waitingForInput();
  await syllable(cdp, ['ㅎ', '하', '한']);
  await windowsKey(cdp, ['ㄱ', '그', '글'], 'Enter');
  await settled(page);
  await expect(page.locator('.status')).toContainText('끝났습니다');
  expect(await consoleText()).toBe('한글\n[한글\n]');
  await expect(page.locator('.console .cinput')).toHaveValue('');
});

test('Console input, an IME that takes Enter: the syllable stays in the box until the next Enter', async () => {
  const { page } = r;
  const cdp = await waitingForInput();
  for (const s of ['ㄷ', '다', '달']) await compose(cdp, s);
  await toIme(cdp, 'Enter');
  await commit(cdp, '달');
  await page.waitForTimeout(200);
  await expect(page.locator('.console .cinput')).toHaveValue('달');
  expect(await consoleText()).toBe('');
  await pass(cdp, 'Enter');
  await settled(page);
  await expect(page.locator('.status')).toContainText('끝났습니다');
  expect(await consoleText()).toBe('달\n[달\n]');
});
