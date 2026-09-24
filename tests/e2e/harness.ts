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
                             options: { userData?: string } = {}): Promise<Running> {
  const dir = mkdtempSync(path.join(tmpdir(), 'spim-e2e-'));
  const env = { ...process.env, SPIM_USER_DATA: options.userData ?? path.join(dir, 'user-data') } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE; // set by VS Code; Electron would run as plain Node
  const exe = process.env.SPIM_E2E_EXE;
  const app = exe
    ? await _electron.launch({ executablePath: exe, args: [], env })
    : await _electron.launch({ args: [path.join(root, 'src/main/main.ts')], env, cwd: root });
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
  await r.app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0].setContentSize(s.width, s.height), size);
  await r.page.waitForFunction((s) => window.innerWidth === s.width && window.innerHeight === s.height, size);
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

// Opens `file` through the open dialog (Ctrl+O) and assembles it (Ctrl+S saves in place).
export async function openAndAssemble(r: Running, file: string): Promise<void> {
  await answerOpen(r.app, file);
  await r.page.keyboard.press('Control+o');
  await r.page.waitForSelector('.editor-panel .cm-content');
  await r.page.waitForFunction(() => document.querySelector('.cm-content')?.textContent !== '');
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
