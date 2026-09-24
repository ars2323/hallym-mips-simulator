/* The fixed set of screenshots (docs/screens/README.md), every one of them
   taken here -- none by hand -- and all of them again every round:

     xvfb-run -a -s '-screen 0 2400x1400x24' npm run screens

   The examples and step counts are written below, so a round's shots can
   be laid over the last round's.  The whole window at 1280x800 unless the
   name says otherwise; no mouse cursor, hover or tooltip in any of them
   (the pointer is moved out of the window and checked).  Each PNG is
   written without its ancillary chunks (metadata), losslessly, and must
   stay within 400 KB.

   windows-frame.png: only on Windows (the CI job, with the installed app),
   the whole screen with the window maximised -- the caption buttons are the
   system's and a page capture has none.

   SCREENS_OUT: write somewhere else (the Windows CI job: report/screens). */

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { launch, openAndAssemble, openOnly, root, sample, settled, textRow, type Running } from '../tests/e2e/harness.ts';

const out = process.env.SCREENS_OUT ? path.resolve(process.env.SCREENS_OUT) : path.join(root, 'docs/screens');
mkdirSync(out, { recursive: true });

const LAB04 = 'tests/samples/lab04-ok.s';     // shown as lab04.s
const LAB04_STEPS = 16;                         // PC 0x0040004c, $t6 just changed
const PINNED = '0x00400054';                    // sra $s1, $t6, 1
const ERROR = 'tests/samples/lab04.s';          // line 15: srll
const DATA = 'tests/samples/data-labels.s';
const DATA_STEPS = 14;                          // past the sw onto the stack
const MAX_BYTES = 400 * 1024;

// PNG without its ancillary chunks: the signature, then IHDR, PLTE, tRNS,
// IDAT and IEND only.  The pixels are untouched.
function stripPng(file: string): number {
  const b = readFileSync(file);
  const keep = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']);
  const parts = [b.subarray(0, 8)];
  for (let at = 8; at < b.length;) {
    const end = at + 12 + b.readUInt32BE(at);
    if (keep.has(b.toString('latin1', at + 4, at + 8))) parts.push(b.subarray(at, end));
    at = end;
  }
  const png = Buffer.concat(parts);
  writeFileSync(file, png);
  return png.length;
}

function written(name: string): void {
  const file = path.join(out, `${name}.png`);
  const bytes = stripPng(file);
  console.log(`wrote ${path.relative(root, file)} (${Math.round(bytes / 1024)} KB)`);
  if (bytes > MAX_BYTES) throw new Error(`${name}.png is ${bytes} bytes, over ${MAX_BYTES}: crop it`);
}

async function shot(r: Running, name: string): Promise<void> {
  const { page } = r;
  await page.mouse.move(-10, -10); // out of the window: no hover, no tooltip
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1100); // past the registers' flash
  const hovered = await page.evaluate(() => document.querySelectorAll(':hover').length);
  if (hovered) throw new Error(`${name}: ${hovered} elements still hovered`);
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  written(name);
}

// Opened and assembled, the editor's cursor back on line 1 (the click that
// focused it would leave its line lit next to the PC's).
async function assembled(r: Running, file: string): Promise<void> {
  await openAndAssemble(r, file);
  await r.page.keyboard.press('Control+Home');
}

async function steps(r: Running, n: number): Promise<void> {
  for (let i = 0; i < n; i += 1) { await r.page.keyboard.press('F10'); await settled(r.page); }
}

async function lab04(r: Running): Promise<void> {
  await assembled(r, sample(r.dir, LAB04, 'lab04.s'));
  await steps(r, LAB04_STEPS);
}

{
  const r = await launch({ width: 1280, height: 800 });
  const { page } = r;
  await shot(r, 'start');
  await page.getByRole('button', { name: /바로 시작/ }).click();
  await shot(r, 'start-2');
  await openOnly(r, sample(r.dir, LAB04, 'lab04.s'));
  await shot(r, 'split-before');
  await lab04(r);
  await shot(r, 'split-running');
  await (await textRow(page, PINNED)).locator('.dis').click();
  await page.waitForSelector('.insp .bitgrid');
  await shot(r, 'inspector');
  await page.getByTitle('New file').click();
  await page.waitForSelector('dialog.ask');
  await shot(r, 'dialog');
  await page.keyboard.press('Escape');
  await assembled(r, sample(r.dir, ERROR));
  await page.waitForSelector('.errors .item');
  await shot(r, 'error');
  await assembled(r, sample(r.dir, DATA));
  await steps(r, DATA_STEPS);
  await page.locator('.ptab', { hasText: 'Data' }).click();
  await page.waitForSelector('.drow');
  await shot(r, 'data');
  await r.close();
}

// The lab PC: 1366x768 at 125%, maximised -- 1093x582 CSS px drawn at 1.25.
// Narrow: 1366x768 at 150% (910x505 CSS px), under the 980 px split: the
// Editor / Run tabs in the title bar, on Run.
for (const [name, size, scale] of [
  ['lab-1366x768-125', { width: 1093, height: 582 }, '1.25'],
  ['narrow', { width: 910, height: 505 }, '1.5'],
] as const) {
  const r = await launch(size, { switches: [`--force-device-scale-factor=${scale}`] });
  await lab04(r);
  if (name === 'narrow') await r.page.getByRole('tab', { name: 'Run' }).waitFor();
  await shot(r, name);
  await r.close();
}

if (process.platform === 'win32') {
  const r = await launch();
  await lab04(r);
  await r.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await r.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize());
  await r.page.waitForTimeout(1500);
  // The real pointer onto the empty right end of the status bar (nothing
  // there reacts to it); CopyFromScreen does not draw the cursor.
  const file = path.join(out, 'windows-frame.png');
  const ps = `Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$w = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point ($w.Right - 60), ($w.Bottom - 8)
Start-Sleep -Milliseconds 500
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
$bmp.Save('${file}', [System.Drawing.Imaging.ImageFormat]::Png)`;
  const done = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
  if (done.status !== 0) throw new Error(`windows-frame: ${done.stderr}`);
  written('windows-frame');
  await r.close();
}
