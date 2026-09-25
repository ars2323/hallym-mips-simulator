/* Electron's main process: the host.  It owns the Simulator (src/sim/host.ts),
   whose core runs in a utility process, and everything that touches the
   disk: source files (decoded and encoded here, src/node/text-file.ts) and
   the example programs.  The window sees only window.app (preload.cjs).

   Nothing is kept from one run to the next -- lab PCs are shared, and every
   student starts from the same screen: the window's size, the panels, the
   files opened, the font size and the Data radix all start from their
   defaults every time.  Settings live in memory for this run only.

   Chromium needs a profile folder while it runs (caches, its own state).
   Each run gets a new one, <temp>\HallymMIPS\run-<pid>-<time>, removed when
   the program quits; one a run could not remove (Windows keeps some files
   open until the process is gone) is removed at the next start, once its
   process is no longer running.  Nothing goes to %APPDATA%: the folder
   earlier builds used there (%APPDATA%\HallymMIPS2) is removed at start.
   SPIM_USER_DATA (a directory) is where the run folders go instead of
   <temp>\HallymMIPS: the tests look into it. */

import { app, BrowserWindow, dialog, ipcMain, Menu, screen, shell } from 'electron';
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { decodeTextFile, encodeTextFile, NEW_FILE_FORMAT, type TextFileFormat } from '../node/text-file.ts';
import { LICENSES, paths, version } from './paths.ts';
import { Simulator } from '../sim/host.ts';
import type { CallName } from '../sim/protocol.ts';
import { utilityTransport } from '../sim/transport.ts';

app.setName('Hallym MIPS');
// The top bar's height in the window (src/renderer/app/app.css --titlebar).
const TITLE_BAR_HEIGHT = 40;
// The Start menu shortcut carries this id (tools/package.ts appId): the window groups with it.
if (process.platform === 'win32') app.setAppUserModelId('kr.ac.hallym.mips-simulator.electron');
// ---- this run's profile folder, and nothing else on disk --------------------

const runsDir = process.env.SPIM_USER_DATA ?? path.join(os.tmpdir(), 'HallymMIPS');
const runDir = path.join(runsDir, `run-${process.pid}-${Date.now()}`);
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; } };
// Folders of earlier runs whose process is gone (a running copy's is left alone).
for (const name of (() => { try { return readdirSync(runsDir); } catch { return []; } })()) {
  const pid = Number(/^run-(\d+)-/.exec(name)?.[1]);
  if (pid && pid !== process.pid && !alive(pid)) rmSync(path.join(runsDir, name), { recursive: true, force: true });
}
// What earlier builds kept in %APPDATA% (settings.json and a Chromium profile).
if (!process.env.SPIM_USER_DATA) rmSync(path.join(app.getPath('appData'), 'HallymMIPS2'), { recursive: true, force: true });
mkdirSync(runDir, { recursive: true });
app.setPath('userData', runDir);
app.setPath('sessionData', runDir);
app.setPath('crashDumps', path.join(runDir, 'Crashpad'));
// Chromium writes into the folder until its very end, so the folder is removed
// after the program has exited: by this same executable run as plain Node,
// detached, waiting for this process to be gone (at most 15 s).
app.on('quit', () => {
  const script = `const {rmSync}=require('fs');const pid=${process.pid};const dir=${JSON.stringify(runDir)};
const gone=()=>{try{process.kill(pid,0);return false}catch(e){return e.code!=='EPERM'}};
const t0=Date.now();(function wait(){if(gone()||Date.now()-t0>15000){try{rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200})}catch{}}else setTimeout(wait,100)})();`;
  try {
    spawn(process.execPath, ['-e', script], { detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }).unref();
  } catch { /* the next start removes it */ }
});

// ---- settings: for this run only ------------------------------------------------

export interface Settings {
  fontSize: number;          // px of the code font; the UI font follows
  dataBase: 2 | 10 | 16;     // Data panel values
}
const DEFAULT_SETTINGS: Settings = { fontSize: 13, dataBase: 16 };
let settings: Settings = { ...DEFAULT_SETTINGS };

function setSettings(s: Partial<Settings>): Settings {
  settings = {
    fontSize: Number.isInteger(s.fontSize) && s.fontSize! >= 10 && s.fontSize! <= 24 ? s.fontSize! : settings.fontSize,
    dataBase: s.dataBase === 2 || s.dataBase === 10 || s.dataBase === 16 ? s.dataBase : settings.dataBase,
  };
  return { ...settings };
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

  // The window starts at a fixed size -- or fills the screen when the screen
  // is smaller (a lab PC: 1366x768 at 125% leaves about 1093x582) -- and
  // nothing of its size or place is kept for the next start.
  const area = screen.getPrimaryDisplay().workAreaSize;
  const small = area.width < 1280 || area.height < 800;
  const win = new BrowserWindow({
    width: Math.min(1280, area.width),
    height: Math.min(800, area.height),
    minWidth: 760,
    minHeight: 480,
    show: false,
    title: 'Hallym MIPS',
    backgroundColor: '#f5f7fa',
    // No system title bar: the window's own top bar carries the logo, the
    // file and the toolbar.  The caption buttons stay the system's own
    // (titleBarOverlay), so Windows 11's snap layouts -- the flyout on the
    // maximise button -- keep working, as do double-click to maximise and
    // dragging to the top edge on the bar's drag region.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#ffffff', symbolColor: '#00205b', height: TITLE_BAR_HEIGHT },
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
    const r = await dialog.showOpenDialog(win, { filters: [{ name: 'MIPS assembly', extensions: ['s', 'asm'] }, { name: 'All files', extensions: ['*'] }] });
    if (r.canceled || r.filePaths.length === 0) return null;
    const p = r.filePaths[0];
    return openBytes(readFileSync(p), path.basename(p), p);
  }));
  ipcMain.handle('file:save', (_e, file: { path: string | null; name: string; text: string; format: TextFileFormat | null }) =>
    answer(async () => {
      let target = file.path;
      if (target === null) {
        const r = await dialog.showSaveDialog(win, { defaultPath: file.name, filters: [{ name: 'MIPS assembly', extensions: ['s'] }] });
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
    const r = await dialog.showOpenDialog(win, { title: 'Exception handler', filters: [{ name: 'MIPS assembly', extensions: ['s', 'asm', 'a'] }, { name: 'All files', extensions: ['*'] }] });
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
  ipcMain.handle('settings:get', () => ({ ...settings }));
  ipcMain.handle('settings:set', (_e, s: Settings) => {
    return setSettings(s);
  });

  win.once('ready-to-show', () => { if (small) win.maximize(); win.show(); });
  await win.loadFile(paths.page);
}

app.on('window-all-closed', () => app.quit());
main().catch((e) => {
  console.error(e);
  app.exit(1);
});
