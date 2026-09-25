/* Starting the real app for the end-to-end tests, the measurements and the
   screen captures: Electron through Playwright's _electron.launch(), a fresh
   settings directory every time, and the file dialogs answered from here
   (they are native windows Playwright cannot click). */

import { _electron, type ElectronApplication, type Page } from '@playwright/test';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const root = path.join(import.meta.dirname, '..', '..');

export interface Running {
  app: ElectronApplication;
  page: Page;
  dir: string;          // a scratch directory, removed by close()
  close(): Promise<void>;
}

// SPIM_E2E_EXE: run the tests against a packaged app (its executable)
// instead of the source tree -- the Windows CI job does, with the installed
// HallymMIPS.exe.
export async function launch(size: { width: number; height: number } = { width: 1280, height: 800 },
                             options: { userData?: string; switches?: string[] } = {}): Promise<Running> {
  const dir = mkdtempSync(path.join(tmpdir(), 'spim-e2e-'));
  const env = { ...process.env, SPIM_USER_DATA: options.userData ?? path.join(dir, 'user-data') } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE; // set by VS Code; Electron would run as plain Node
  const exe = process.env.SPIM_E2E_EXE;
  // switches: Chromium's, e.g. --force-device-scale-factor=1.25 (a 125% display).
  const switches = options.switches ?? [];
  const app = exe
    ? await _electron.launch({ executablePath: exe, args: switches, env })
    : await _electron.launch({ args: [...switches, path.join(root, 'src/main/main.ts')], env, cwd: root });
  const page = await app.firstWindow();
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.waitForSelector('.wcard');
  await resize({ app, page }, size);
  return {
    app, page, dir,
    close: async () => {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
      if (pageErrors.length) throw new Error(`errors in the window:\n${pageErrors.join('\n')}`);
    },
  };
}

export async function resize(r: { app: ElectronApplication; page: Page }, size: { width: number; height: number }): Promise<void> {
  // A small screen (the Windows CI runner's is 1024x768) opens the window
  // maximised, and a maximised window keeps its size: restore it first.
  await r.app.evaluate(({ BrowserWindow }, s) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win.isMaximized()) win.unmaximize();
    win.setContentSize(s.width, s.height);
  }, size);
  // (At a fractional device scale the window can land a pixel off.)
  await r.page.waitForFunction((s) => Math.abs(window.innerWidth - s.width) <= 1 && Math.abs(window.innerHeight - s.height) <= 1, size);
}

// The next save dialog answers `file`; the next open dialog answers `file`.
export async function answerSave(app: ElectronApplication, file: string): Promise<void> {
  await app.evaluate(({ dialog }, f) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: f })) as typeof dialog.showSaveDialog;
  }, file);
}
export async function answerOpen(app: ElectronApplication, file: string): Promise<void> {
  await app.evaluate(({ dialog }, f) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [f] })) as typeof dialog.showOpenDialog;
  }, file);
}

// A copy of a sample under `dir`, with the name the window should show.
export function sample(dir: string, from: string, name = path.basename(from)): string {
  const target = path.join(dir, name);
  copyFileSync(path.join(root, from), target);
  return target;
}

// Opens `file` through the open dialog (Ctrl+O), without assembling it.
export async function openOnly(r: Running, file: string): Promise<void> {
  await answerOpen(r.app, file);
  await r.page.keyboard.press('Control+o');
  // Unsaved text first: the window asks (its own dialog); go on without it.
  const ask = r.page.locator('dialog.ask');
  await ask.waitFor({ timeout: 300 }).then(() => ask.getByRole('button', { name: '버리고 계속' }).click(), () => {});
  await r.page.waitForSelector('.editor-panel .cm-content');
  await r.page.waitForFunction(() => document.querySelector('.cm-content')?.textContent !== '');
}

// Opens `file` through the open dialog (Ctrl+O) and assembles it (Ctrl+S saves in place).
export async function openAndAssemble(r: Running, file: string): Promise<void> {
  await openOnly(r, file);
  await r.page.locator('.cm-content').click();
  await r.page.keyboard.press('Control+s');
  await r.page.waitForSelector('.run-grid:not([hidden]), .errors:not([hidden]), .status .err');
}

export const statusText = (page: Page) => page.locator('.status').innerText();
export const regHex = (page: Page, name: string) => page.locator(`.rrow[data-reg="${name}"] .hex`).innerText();

// Waits until the window has taken in the last stop (no call in flight).
export async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => !document.querySelector('.status .run')?.textContent?.startsWith('실행 중'));
  await page.waitForTimeout(50);
}

// A program written to `dir` under `name`.
export function program(dir: string, name: string, text: string): string {
  const target = path.join(dir, name);
  writeFileSync(target, text);
  return target;
}

// The Text row at `addr`, scrolled into the list (it is a virtual list:
// rows far from view are not in the DOM).
export async function textRow(page: Page, addr: string) {
  const row = page.locator(`.trow[data-addr="${addr}"]`);
  await page.locator('.text').evaluate((el) => { el.scrollTop = 0; });
  for (let i = 0; i < 60 && (await row.count()) === 0; i += 1) {
    await page.locator('.text').evaluate((el) => { el.scrollTop += el.clientHeight / 2; });
    await page.waitForTimeout(20);
  }
  // Centre it (the list re-renders its rows as it scrolls), then take it afresh.
  const top = await row.evaluate((el) => parseFloat((el as HTMLElement).style.top));
  await page.locator('.text').evaluate((el, t) => { el.scrollTop = t - el.clientHeight / 2; }, top);
  await page.waitForTimeout(50);
  return page.locator(`.trow[data-addr="${addr}"]`);
}

// Korean words (어절) broken across two lines anywhere on screen: the
// characters of one word whose boxes sit on different lines.  Each is
// returned as "…the word…" for the failure message.
export async function brokenWords(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const broken: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? '';
      if (!/[가-힣]/.test(text)) continue;
      const el = node.parentElement!;
      if (!el.checkVisibility()) continue;
      const range = document.createRange();
      const top = (i: number) => { range.setStart(node!, i); range.setEnd(node!, i + 1); return range.getClientRects()[0]?.top ?? NaN; };
      for (let i = 0; i + 1 < text.length; i += 1) {
        if (/\s/.test(text[i]) || /\s/.test(text[i + 1])) continue;
        if (!/[가-힣]/.test(text[i] + text[i + 1])) continue;
        const a = top(i);
        const b = top(i + 1);
        if (Math.abs(a - b) > 4) {
          const from = text.lastIndexOf(' ', i) + 1;
          const to = text.indexOf(' ', i + 1);
          broken.push(`…${text.slice(from, to < 0 ? undefined : to)}…`);
        }
      }
    }
    return broken;
  });
}
