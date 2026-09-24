/* Electron's main process: the host.  It owns the Simulator (src/sim/host.ts),
   whose core runs in a utility process, and relays calls from the window and
   events back to it.  The window only ever sees window.sim (preload.cjs).

   For now the window is the wiring check (src/renderer/wiring/), not the
   UI: assemble an example, run it, show a few registers.

     node tools/electron.ts                    open it
     node tools/electron.ts --smoke OUT.png    run the check, save a capture, exit 0/1
*/

import { app, BrowserWindow, ipcMain } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { Simulator } from '../sim/host.ts';
import type { CallName } from '../sim/protocol.ts';
import { utilityTransport } from '../sim/transport.ts';

const root = path.join(import.meta.dirname, '..', '..');
const smokeAt = process.argv.indexOf('--smoke');
const smokeOut = smokeAt >= 0 ? process.argv[smokeAt + 1] : null;

async function main(): Promise<void> {
  await app.whenReady();
  const sim = await Simulator.start({ transport: () => utilityTransport() });

  const win = new BrowserWindow({
    width: 900,
    height: 640,
    show: smokeOut === null,
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  ipcMain.handle('sim:call', (_e, method: CallName, args: unknown[]) =>
    (sim.call as (m: CallName, ...a: unknown[]) => Promise<unknown>)(method, ...args));
  ipcMain.handle('sim:stop', () => sim.stop());
  ipcMain.handle('app:example', () => new Uint8Array(readFileSync(path.join(root, 'tests/programs/helloworld.s'))));
  sim.on('console', (text) => win.webContents.send('sim:console', text));
  sim.on('crashed', (report) => win.webContents.send('sim:crashed', report.message, report.error.message));

  ipcMain.once('wiring:done', async (_e, report: { ok: boolean; lines: string[] }) => {
    console.log(report.lines.join('\n'));
    if (smokeOut === null) return;
    await new Promise((resolve) => setTimeout(resolve, 300)); // let the last lines paint
    const image = await win.webContents.capturePage();
    writeFileSync(smokeOut, image.toPNG());
    console.log(`captured ${smokeOut}`);
    sim.close();
    app.exit(report.ok ? 0 : 1);
  });

  await win.loadFile(path.join(root, 'src/renderer/wiring/index.html'));
}

app.on('window-all-closed', () => app.quit());
main().catch((e) => {
  console.error(e);
  app.exit(1);
});
