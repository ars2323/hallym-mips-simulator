/* Electron's main process: the host.  It owns the Simulator (src/sim/host.ts),
   whose core runs in a utility process, and everything that touches the
   disk: source files (decoded and encoded here, src/node/text-file.ts), the
   example programs, and the one settings file.  The window sees only
   window.app (preload.cjs).

   Nothing of a session is restored: window size, panels and recent files
   start from fixed defaults every time -- lab PCs are shared.  The settings
   file holds the font size and the number base, nothing else.

   The settings live in their own folder, %APPDATA%\HallymMIPS2 on Windows
   (userData), apart from the Qt build's (registry, HKCU\Software\HallymMIPS)
   so that the two can be installed side by side.  SPIM_USER_DATA (a
   directory) puts them elsewhere: the tests start every run from a fresh one. */

import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { decodeTextFile, encodeTextFile, NEW_FILE_FORMAT, type TextFileFormat } from '../node/text-file.ts';
import { LICENSES, paths, version } from './paths.ts';
import { Simulator } from '../sim/host.ts';
import type { CallName } from '../sim/protocol.ts';
import { utilityTransport } from '../sim/transport.ts';

app.setName('Hallym MIPS Simulator');
// The Start menu shortcut carries this id (tools/package.ts appId): the window groups with it.
if (process.platform === 'win32') app.setAppUserModelId('kr.ac.hallym.mips-simulator.electron');
app.setPath('userData', process.env.SPIM_USER_DATA ?? path.join(app.getPath('appData'), 'HallymMIPS2'));

// ---- settings: font size and number base, and nothing else --------------

export interface Settings {
  fontSize: number;          // px of the code font; the UI font follows
  dataBase: 2 | 10 | 16;     // Data panel values
}
const DEFAULT_SETTINGS: Settings = { fontSize: 13, dataBase: 16 };
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

function readSettings(): Settings {
  try {
    const s = JSON.parse(readFileSync(settingsFile(), 'utf8')) as Partial<Settings>;
    return {
      fontSize: Number.isInteger(s.fontSize) && s.fontSize! >= 10 && s.fontSize! <= 24 ? s.fontSize! : DEFAULT_SETTINGS.fontSize,
      dataBase: s.dataBase === 2 || s.dataBase === 10 ? s.dataBase : 16,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(s: Settings): void {
  mkdirSync(app.getPath('userData'), { recursive: true });
  writeFileSync(settingsFile(), JSON.stringify({ fontSize: s.fontSize, dataBase: s.dataBase }, null, 1));
}

// ---- files ------------------------------------------------------------------

export interface OpenedFile {
  name: string;
  path: string | null;
  text: string;
  format: TextFileFormat;
}

function openBytes(bytes: Uint8Array, name: string, filePath: string | null): OpenedFile {
  const decoded = decodeTextFile(bytes);
  return { name, path: filePath, text: decoded.text, format: decoded.format };
}

type Result<T> = { ok: true; value: T } | { ok: false; error: { name: string; message: string } };
async function answer<T>(f: () => T | Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await f() };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return { ok: false, error: { name: err.name, message: err.message } };
  }
}

async function main(): Promise<void> {
  Menu.setApplicationMenu(null); // no default zoom/reload accelerators; the window has its own keys
  await app.whenReady();
  const sim = await Simulator.start({ transport: () => utilityTransport() });

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: '한림 MIPS 시뮬레이터',
    backgroundColor: '#f5f7fa',
    webPreferences: {
      preload: paths.preload,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  // Calls into the simulator come back as results, never as thrown errors:
  // a thrown error in a handler is also logged by Electron as a failure.
  // run goes through sim.run(), which stop() needs to know about.
  ipcMain.handle('sim:call', (_e, method: CallName, args: unknown[]) =>
    answer(() => (method === 'run' ? sim.run() : (sim.call as (m: CallName, ...a: unknown[]) => Promise<unknown>)(method, ...args))));
  ipcMain.handle('sim:stop', () => answer(() => sim.stop()));
  sim.on('console', (text) => win.webContents.send('sim:console', text));
  sim.on('progress', (p) => win.webContents.send('sim:progress', p));
  sim.on('crashed', (report) => win.webContents.send('sim:crashed', report.message, report.error.message));

  ipcMain.handle('file:open', () => answer(async () => {
    const r = await dialog.showOpenDialog(win, { filters: [{ name: 'MIPS 어셈블리', extensions: ['s', 'asm'] }, { name: '모든 파일', extensions: ['*'] }] });
    if (r.canceled || r.filePaths.length === 0) return null;
    const p = r.filePaths[0];
    return openBytes(readFileSync(p), path.basename(p), p);
  }));
  ipcMain.handle('file:save', (_e, file: { path: string | null; name: string; text: string; format: TextFileFormat | null }) =>
    answer(async () => {
      let target = file.path;
      if (target === null) {
        const r = await dialog.showSaveDialog(win, { defaultPath: file.name, filters: [{ name: 'MIPS 어셈블리', extensions: ['s'] }] });
        if (r.canceled || !r.filePath) return null;
        target = r.filePath;
      }
      const encoded = encodeTextFile(file.text, file.format ?? NEW_FILE_FORMAT);
      if (!encoded.ok) throw new Error(`${encoded.firstBadLine}행의 글자는 이 파일의 인코딩(${file.format?.encoding})으로 저장할 수 없습니다`);
      writeFileSync(target, encoded.bytes);
      return { path: target, name: path.basename(target) };
    }));
  ipcMain.handle('example:open', (_e, name: string) => answer(() => {
    if (!/^[a-z0-9-]+\.s$/.test(name)) throw new Error(`no example ${name}`);
    return openBytes(readFileSync(path.join(paths.examples, name)), name, null);
  }));
  // An exception handler for Settings > 고급: its name and text (decoded like a program).
  ipcMain.handle('file:openHandler', () => answer(async () => {
    const r = await dialog.showOpenDialog(win, { title: '예외 처리기 파일', filters: [{ name: 'MIPS 어셈블리', extensions: ['s', 'asm', 'a'] }, { name: '모든 파일', extensions: ['*'] }] });
    if (r.canceled || r.filePaths.length === 0) return null;
    return { name: path.basename(r.filePaths[0]), text: decodeTextFile(readFileSync(r.filePaths[0])).text };
  }));
  ipcMain.handle('about:info', () => ({
    version, electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node,
    licenses: LICENSES.map((l) => l.title),
  }));
  ipcMain.handle('about:license', (_e, i: number) => answer(() => {
    if (i === LICENSES.length) return readFileSync(paths.electronLicense(), 'utf8');
    return readFileSync(paths.license(LICENSES[i].name), 'utf8');
  }));
  ipcMain.handle('about:openCredits', () => answer(async () => {
    const error = await shell.openPath(paths.chromiumCredits());
    if (error) throw new Error(error);
  }));
  ipcMain.handle('settings:get', () => readSettings());
  ipcMain.handle('settings:set', (_e, s: Settings) => {
    writeSettings(s);
    return readSettings();
  });

  await win.loadFile(paths.page);
}

app.on('window-all-closed', () => app.quit());
main().catch((e) => {
  console.error(e);
  app.exit(1);
});
