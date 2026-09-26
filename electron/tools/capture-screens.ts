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

   The user guide's three pictures (docs/usage/usage.ko.md, usage.en.md)
   are taken with the set and written to docs/usage/images/: the start
   screen, tutorial step 4, and the running window with each part named
   (the names drawn over the page for the picture only).

   SCREENS_OUT: write somewhere else (the Windows CI job: report/screens;
   the guide's pictures to report/screens/usage). */

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { launch, openAndAssemble, openOnly, program, root, sample, settled, textRow, type Running } from '../tests/e2e/harness.ts';

const out = process.env.SCREENS_OUT ? path.resolve(process.env.SCREENS_OUT) : path.join(root, 'docs/screens');
mkdirSync(out, { recursive: true });
const guide = process.env.SCREENS_OUT ? path.join(out, 'usage') : path.join(root, '..', 'docs', 'usage', 'images');
mkdirSync(guide, { recursive: true });

const LAB04 = 'tests/samples/lab04-ok.s';     // shown as lab04.s
const LAB04_STEPS = 16;                         // PC 0x0040004c, $t6 just changed
const PINNED = '0x00400054';                    // sra $s1, $t6, 1
const ERROR = 'tests/samples/lab04.s';          // line 15: srll
const DATA = 'tests/samples/data-labels.s';
const DATA_STEPS = 14;                          // past the sw onto the stack
const TYPO = '        .text\n        .global main            # .globl\nmain:   li      $v0, 10\n        syscall\n';
const MAX_BYTES = 400 * 1024;
const MAX_SCREEN_BYTES = 700 * 1024; // a whole Windows screen, up to 1920x1080
const MAX_CROP_BYTES = 150 * 1024;

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

function written(name: string, max = MAX_BYTES): void {
  const file = path.join(out, `${name}.png`);
  const bytes = stripPng(file);
  console.log(`wrote ${path.relative(root, file)} (${Math.round(bytes / 1024)} KB)`);
  if (bytes > max) throw new Error(`${name}.png is ${bytes} bytes, over ${max}: crop it`);
}

async function shot(r: Running, name: string, clip?: { x: number; y: number; width: number; height: number }): Promise<void> {
  const { page } = r;
  await page.mouse.move(-10, -10); // out of the window: no hover, no tooltip
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1100); // past the registers' flash
  const hovered = await page.evaluate(() => document.querySelectorAll(':hover').length);
  if (hovered) throw new Error(`${name}: ${hovered} elements still hovered`);
  await page.screenshot({ path: path.join(out, `${name}.png`), clip });
  written(name, clip ? MAX_CROP_BYTES : MAX_BYTES);
}

// A shot of the set, also as one of the guide's pictures.
function forGuide(from: string, name: string): void {
  copyFileSync(path.join(out, `${from}.png`), path.join(guide, `${name}.png`));
  console.log(`wrote ${path.relative(root, path.join(guide, `${name}.png`))} (= ${from}.png)`);
}

// The running window with each part outlined and named, for the guide.
const PARTS: [string, string][] = [
  ['.titlebar .toolbar', 'Toolbar'], ['section[aria-label="Editor"]', 'Editor'], ['section[aria-label="Registers"]', 'Registers'],
  ['section[aria-label="Text"]', 'Text · Data'], ['section[aria-label="Inspector"]', 'Inspector'],
  ['section[aria-label="Console"]', 'Console'], ['footer.status', 'Status bar'],
];
async function namedParts(r: Running, name: string): Promise<void> {
  await r.page.evaluate((parts) => {
    const layer = document.createElement('div');
    layer.id = 'guide-names';
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99999';
    for (const [sel, label] of parts) {
      const b = document.querySelector(sel)!.getBoundingClientRect();
      const box = document.createElement('div');
      box.style.cssText = `position:fixed;left:${b.left + 1}px;top:${b.top + 1}px;width:${b.width - 2}px;height:${b.height - 2}px;`
        + 'border:2px solid #E8710A;border-radius:6px;box-sizing:border-box';
      const chip = document.createElement('div');
      chip.textContent = label;
      // The status bar's name on its own empty right end; the others on their bottom edge.
      const bar = sel === 'footer.status';
      chip.style.cssText = `position:fixed;left:${bar ? b.right - 90 : b.left + b.width / 2}px;top:${bar ? b.top + (b.height - 22) / 2 : b.bottom - 12}px;`
        + 'transform:translateX(-50%);background:#E8710A;color:#fff;font:700 13px/22px Pretendard,sans-serif;'
        + 'padding:0 10px;border-radius:11px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.25)';
      layer.append(box, chip);
    }
    document.body.append(layer);
  }, PARTS);
  const file = path.join(guide, `${name}.png`);
  await r.page.mouse.move(-10, -10);
  await r.page.waitForTimeout(1100);
  await r.page.screenshot({ path: file });
  const bytes = stripPng(file);
  console.log(`wrote ${path.relative(root, file)} (${Math.round(bytes / 1024)} KB)`);
  if (bytes > MAX_BYTES) throw new Error(`${name}.png is ${bytes} bytes, over ${MAX_BYTES}`);
  await r.page.evaluate(() => document.getElementById('guide-names')?.remove());
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
  forGuide('start', '01-start');
  await page.getByRole('button', { name: /바로 시작/ }).click();
  await shot(r, 'start-2');
  await openOnly(r, sample(r.dir, LAB04, 'lab04.s'));
  await shot(r, 'split-before');
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+s');
  await page.waitForSelector('.run-grid:not([hidden])');
  await page.keyboard.press('Control+Home');
  await shot(r, 'assembled');
  await lab04(r);
  await shot(r, 'split-running');
  await namedParts(r, '03-panels');
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
  await assembled(r, program(r.dir, 'typo.s', TYPO));
  await page.waitForSelector('.errors .item');
  await shot(r, 'error-near-miss');
  await assembled(r, sample(r.dir, 'tests/samples/editor-errors.s'));
  await page.waitForSelector('.errors .item + .item');
  await shot(r, 'error-several');
  await assembled(r, sample(r.dir, DATA));
  await steps(r, DATA_STEPS);
  await page.locator('.ptab', { hasText: 'Data' }).click();
  await page.waitForSelector('.drow');
  await shot(r, 'data');
  await r.close();
}

// A maximised 1920x1080 screen (1920x1040 under the taskbar): the Editor at
// what 72 columns need, the rest of the width on the Run side; and the
// Errors panel there.
{
  const r = await launch({ width: 1920, height: 1040 });
  await lab04(r);
  await shot(r, 'max-1920');
  await assembled(r, sample(r.dir, ERROR));
  await r.page.waitForSelector('.errors .item');
  await shot(r, 'errors-max');
  await r.close();
}

// The lab PC: 1366x768 at 125%, maximised -- 1093x582 CSS px drawn at 1.25;
// and the heads of Registers and Text there, cut out (lab-columns).
// Narrow: 1366x768 at 150% (910x505 CSS px), under the 980 px split: the
// Editor / Run tabs in the title bar, on Run.  1024x768: 1024x728 (the
// taskbar), still side by side.
for (const [name, size, scale] of [
  ['lab-1366x768-125', { width: 1093, height: 582 }, '1.25'],
  ['narrow', { width: 910, height: 505 }, '1.5'],
  ['1024x768', { width: 1024, height: 728 }, '1'],
] as const) {
  const r = await launch(size, { switches: [`--force-device-scale-factor=${scale}`] });
  await lab04(r);
  if (name === 'narrow') await r.page.getByRole('tab', { name: 'Run' }).waitFor();
  await shot(r, name);
  if (name === 'lab-1366x768-125') {
    const regs = (await r.page.locator('.regs').boundingBox())!;
    const text = (await r.page.locator('.textpanel').boundingBox())!;
    await shot(r, 'lab-columns', { x: regs.x - 4, y: regs.y - 4, width: text.x + text.width - regs.x + 8, height: 190 });
  }
  await r.close();
}

// The tutorial (docs/PORTING.md 18): steps 1, 4 (lui + ori), 9 (bits =
// Encoding), 14 (the gutter), 19 (the Errors panel, after Assemble), 20;
// step 9 again in the narrow window.  Each step is entered as the tutorial
// enters it (its go()), which sets the machine up the same way every time.
async function tutorialStep(r: Running, n: number): Promise<void> {
  const { page } = r;
  if (!(await page.evaluate(() => (window as unknown as { __tutorial: { active: boolean } }).__tutorial.active))) {
    await page.getByRole('button', { name: /튜토리얼 보기/ }).click();
  }
  await page.evaluate((i) => (window as unknown as { __tutorial: { go(i: number): Promise<void> } }).__tutorial.go(i), n - 1);
  await page.waitForFunction((k) => (window as unknown as { __tutorial: { shown: { step: number } } }).__tutorial.shown.step === k, n);
  await page.waitForTimeout(600); // the Data tab and the lists settle; the card follows
}
{
  const r = await launch({ width: 1280, height: 800 });
  for (const n of [1, 4, 9, 14]) { await tutorialStep(r, n); await shot(r, `tutorial-${String(n).padStart(2, '0')}`); }
  forGuide('tutorial-04', '02-tutorial-04');
  // The quit question over step 14: Haram in the dialog, the card and rings under the backdrop.
  await r.page.locator('.tut-card .tut-quit').click();
  await r.page.waitForSelector('dialog.ask[open]');
  await shot(r, 'tutorial-quit-ask');
  await r.page.locator('dialog.ask').getByRole('button', { name: '계속하기' }).click();
  // Step 18 done: the output pointed at, [다음] awaited.
  await tutorialStep(r, 18);
  for (let i = 0; i < 3 && !(await r.page.evaluate(() => (window as unknown as { __tutorial: { shown: { result: boolean } } }).__tutorial.shown.result)); i += 1) {
    await r.page.keyboard.press('F5');
    await r.page.waitForTimeout(700);
  }
  await r.page.waitForTimeout(600);
  await shot(r, 'tutorial-18-done');
  await tutorialStep(r, 19);
  await r.page.keyboard.press('Control+s');
  await r.page.waitForFunction(() => (window as unknown as { __tutorial: { shown: { phase: number } } }).__tutorial.shown.phase === 1);
  await r.page.waitForTimeout(600);
  await shot(r, 'tutorial-19');
  await tutorialStep(r, 20);
  await shot(r, 'tutorial-20');
  await r.close();
}
{
  const r = await launch({ width: 910, height: 505 }, { switches: ['--force-device-scale-factor=1.5'] });
  await tutorialStep(r, 9);
  await shot(r, 'tutorial-09-narrow');
  await r.close();
}

// The whole screen, as Windows draws it (the caption buttons included).
function screen(name: string): void {
  // The real pointer onto the empty right end of the status bar (nothing
  // there reacts to it); CopyFromScreen does not draw the cursor.
  const file = path.join(out, `${name}.png`);
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
  if (done.status !== 0) throw new Error(`${name}: ${done.stderr}`);
  written(name, MAX_SCREEN_BYTES);
}
if (process.platform === 'win32') {
  const r = await launch();
  await lab04(r);
  await r.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await r.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize());
  await r.page.waitForTimeout(1500);
  screen('windows-frame');
  await r.close();
  // The tutorial on, maximised: the caption buttons' patch coloured with the dim.
  const t = await launch();
  await tutorialStep(t, 14);
  await t.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize());
  await t.page.waitForTimeout(1500);
  screen('windows-frame-tutorial');
  await t.close();
  // A 1920x1080 screen (the workflow sets it: tools/windows/screen-1920.ps1):
  // the default layout maximised, as a student sees it, the caption
  // buttons and the taskbar included.
  const wide = await launch();
  const area = await wide.app.evaluate(({ screen: s }) => s.getPrimaryDisplay().size);
  if (area.width >= 1920) {
    await lab04(wide);
    await wide.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await wide.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize());
    await wide.page.waitForTimeout(1500);
    screen('windows-max-1920');
  } else {
    console.log(`windows-max-1920: not taken, the screen is ${area.width}x${area.height}`);
  }
  await wide.close();
}
