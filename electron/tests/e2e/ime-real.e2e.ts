/* The real Microsoft Korean IME on Windows (SPIM_REAL_IME=1; the Windows
   CI job sets it after adding Korean to the runner's languages --
   tools/windows/korean-ime.ps1).  Keys are pressed through the keyboard
   driver's path (tools/windows/type-korean.ps1), so it is Windows' IME that
   composes them, not CDP.  The page's key and composition events are
   written to report/ime-real/<test>.txt: what the real IME sends, the
   evidence for the event orders tests/e2e/ime.e2e.ts reproduces. */

import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { answerSave, launch, root, settled, type Running } from './harness.ts';

test.skip(process.platform !== 'win32' || process.env.SPIM_REAL_IME !== '1', 'the real Korean IME: Windows CI only');

let r: Running;
test.beforeEach(async () => { r = await launch(); });
test.afterEach(async () => { await r.close(); });

async function type(keys: string[]): Promise<string> {
  const hwnd = await r.app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.show(); win.focus(); win.setAlwaysOnTop(true);
    return win.getNativeWindowHandle().readBigUInt64LE(0).toString();
  });
  return execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
    path.join(root, 'tools/windows/type-korean.ps1'), '-Hwnd', hwnd, '-Keys', keys.join(',')], { encoding: 'utf8' });
}

async function record(name: string, typed: string) {
  const events = await r.page.evaluate(() => (window as unknown as { __events: string[] }).__events.join('\n'));
  const dir = path.join(root, 'report', 'ime-real');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${name}.txt`), `${typed}\n-- events (type key keyCode isComposing data)\n${events}\n`);
}

async function logEvents() {
  await r.page.evaluate(() => {
    const events: string[] = [];
    (window as unknown as { __events: string[] }).__events = events;
    for (const t of ['keydown', 'keyup', 'compositionstart', 'compositionupdate', 'compositionend', 'beforeinput']) {
      document.addEventListener(t, (e) => {
        const k = e as KeyboardEvent & InputEvent;
        events.push([t, k.key ?? '', k.keyCode ?? '', k.isComposing ?? '', k.data ?? '', k.inputType ?? ''].join(' '));
      }, true);
    }
  });
}

const doc = () => r.page.evaluate(() => [...document.querySelectorAll('.cm-line')].map((l) => l.textContent ?? '').join('\n'));

test('the editor: 한글 typed with the Windows IME, Enter, then saved', async () => {
  const { page } = r;
  await page.getByRole('button', { name: /바로 시작/ }).click();
  await page.getByRole('button', { name: /새 파일/ }).first().click();
  await page.locator('.cm-content').click();
  await page.keyboard.insertText('main: # ');
  await logEvents();
  const typed = await type(['gksrmf', 'ENTER']);
  await page.waitForTimeout(500);
  const text = await doc();
  await record('editor', `${typed}\n-- editor\n${JSON.stringify(text)}`);
  expect(text, typed).toBe('main: # 한글\n');
  const file = path.join(r.dir, 'real.s');
  await answerSave(r.app, file);
  await page.keyboard.press('Control+s');
  await expect.poll(() => { try { return readFileSync(file, 'utf8'); } catch { return null; } }).toBe('main: # 한글\n');
});

test('the Console: 한글 typed with the Windows IME into syscall 8, Enter', async () => {
  const { page } = r;
  const file = path.join(r.dir, 'echo.s');
  writeFileSync(file, '.data\nbuf: .space 64\n.text\nmain: li $v0, 8\nla $a0, buf\nli $a1, 64\nsyscall\nli $v0, 4\nla $a0, buf\nsyscall\nli $v0, 10\nsyscall\n');
  await r.app.evaluate(({ dialog }, f) => { dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [f] })) as typeof dialog.showOpenDialog; }, file);
  await page.keyboard.press('Control+o');
  await page.waitForFunction(() => document.querySelector('.cm-content')?.textContent !== '');
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+s');
  await page.waitForSelector('.run-grid:not([hidden])');
  await page.keyboard.press('F5');
  await page.locator('.console .cinput').click();
  await logEvents();
  const typed = await type(['gksrmf', 'ENTER']);
  await settled(page);
  const out = await page.locator('.console .clog').textContent();
  await record('console', `${typed}\n-- console\n${JSON.stringify(out)}`);
  expect(out, typed).toBe('한글\n한글\n');
});
