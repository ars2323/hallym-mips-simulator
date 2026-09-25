/* The comparison set (docs/compare/): standard QtSpim 9.1.24 and this
   edition side by side, six pairs, under the same conditions -- the same
   file, the same number of steps, the same window size, each program's
   default font size, a fresh start with no saved settings.  One set, used
   by the README's "What's different" and by docs/edutech/.

     xvfb-run -a -s '-screen 0 2400x1400x24' node tools/capture-compare.ts

   Linux only: QtSpim is driven through X (xdotool) and captured with
   ImageMagick (import); the pairs are put together with ImageMagick too.
   Standard QtSpim is built from the tag vanilla-9.1.24 (git archive, qmake,
   make) into <tmp>/hallym-compare-qtspim-9.1.24 once, or taken from
   $QTSPIM.  It runs in its default layout -- the docked panels as QtSpim
   arranges them, the Console a window of its own -- with its settings in a
   fresh directory and USER=student (the stack holds the environment).

   Writes docs/compare/NN-name.png (the pair, with the conditions under it),
   docs/compare/originals/NN-name-qtspim.png / NN-name-2x.png (each side
   alone, full size, for other material) and docs/compare/window.png (this
   edition's whole window after the steps, Data tab). */

import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { launch, openAndAssemble, root, sample, settled, type Running } from '../tests/e2e/harness.ts';

const repo = path.join(root, '..');
const out = path.join(repo, 'docs', 'compare');
const originals = path.join(out, 'originals');
mkdirSync(originals, { recursive: true });

const WIDTH = 1600;
const HEIGHT = 900;
const STEPS = 13; // to the lw $t2, 4($t1) of line 14: PC 0x00400040
const FILE = 'tests/samples/data-labels.s';
const VERSION = (JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as { version: string }).version;
const FONT = path.join(repo, 'QtSpim', 'edu', 'theme', 'fonts', 'Pretendard-Medium.otf'); // read only, for the labels
const LEFT = 'Standard QtSpim 9.1.24';
const RIGHT = `Hallym MIPS ${VERSION}`;
const FONTS = 'default font sizes (QtSpim: Courier 10 pt, 13 px at 96 dpi; Hallym MIPS: 13 px)';

// ---- standard QtSpim ------------------------------------------------------------------------

function qtspim(): string {
  if (process.env.QTSPIM) return process.env.QTSPIM;
  const dir = path.join(os.tmpdir(), 'hallym-compare-qtspim-9.1.24');
  const bin = path.join(dir, 'build', 'QtSpim');
  if (existsSync(bin)) return bin;
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  mkdirSync(path.join(dir, 'build'), { recursive: true });
  execFileSync('sh', ['-c', `git -C "${repo}" archive vanilla-9.1.24 | tar -x -C "${path.join(dir, 'src')}"`]);
  execFileSync('qmake', ['../src/QtSpim/QtSpim.pro'], { cwd: path.join(dir, 'build') });
  execFileSync('make', [`-j${os.cpus().length}`], { cwd: path.join(dir, 'build'), stdio: 'ignore' });
  return bin;
}

const x = (...args: string[]) => execFileSync('xdotool', args, { encoding: 'utf8' }).trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The panels of QtSpim's default layout in a 1600x900 window (measured on
// its first start here: the docks do not move between runs with fresh
// settings), from the tab row down.
const QT = {
  registers: { x: 0, y: 62, width: 390, height: 646 },
  text: { x: 392, y: 62, width: 1208, height: 646 },
  userText: { x: 392, y: 62, width: 1208, height: 500 },
  dataTab: { x: 433, y: 76 },
};

class Qt {
  private proc: ChildProcess | null = null;
  private home = mkdtempSync(path.join(os.tmpdir(), 'qtspim-home-'));
  main = '';
  console = '';

  async start(file?: string): Promise<void> {
    const env = { DISPLAY: process.env.DISPLAY!, XAUTHORITY: process.env.XAUTHORITY ?? '', HOME: this.home, XDG_CONFIG_HOME: path.join(this.home, '.config'),
      USER: 'student', LOGNAME: 'student', PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' };
    this.proc = spawn(qtspim(), file ? ['-file', file] : [], { env, cwd: path.dirname(file ?? this.home), stdio: 'ignore' });
    this.main = x('search', '--sync', '--onlyvisible', '--name', '^QtSpim$').split('\n')[0];
    this.console = x('search', '--sync', '--name', '^Console$').split('\n')[0];
    x('windowmove', this.main, '0', '0');
    x('windowsize', this.main, String(WIDTH), String(HEIGHT));
    await sleep(1500);
  }

  // Single Step (F10), each with the main window focused: the Console
  // window comes forward and takes the keys when the program prints.
  async step(n: number): Promise<void> {
    for (let i = 0; i < n; i += 1) {
      x('windowraise', this.main);
      spawnSync('xdotool', ['windowfocus', this.main]);
      await sleep(150);
      x('key', 'F10');
      await sleep(350);
    }
  }

  async click(p: { x: number; y: number }): Promise<void> {
    x('windowraise', this.main);
    x('mousemove', String(p.x), String(p.y), 'click', '1', 'mousemove', '2000', '1300');
    await sleep(500);
  }

  // The screen from (0, 0), WIDTH x HEIGHT, or a part of it.
  async shot(file: string, crop = { x: 0, y: 0, width: WIDTH, height: HEIGHT }, raise = true): Promise<void> {
    if (raise) x('windowraise', this.main);
    await sleep(400);
    execFileSync('import', ['-window', 'root', '-crop', `${crop.width}x${crop.height}+${crop.x}+${crop.y}`, '+repage', file]);
  }

  stop(): void {
    this.proc?.kill();
    rmSync(this.home, { recursive: true, force: true });
  }
}

// ---- this edition ---------------------------------------------------------------------------

async function ours(): Promise<Running> {
  return launch({ width: WIDTH, height: HEIGHT });
}

async function panel(r: Running, label: string, file: string): Promise<void> {
  await r.page.mouse.move(WIDTH - 2, HEIGHT - 2);
  await r.page.waitForTimeout(400);
  const box = (await r.page.locator(`section[aria-label="${label}"]`).first().boundingBox())!;
  await r.page.screenshot({ path: file, clip: { x: box.x, y: box.y, width: box.width, height: box.height } });
}

async function whole(r: Running, file: string): Promise<void> {
  await r.page.mouse.move(WIDTH - 2, HEIGHT - 2);
  await r.page.waitForTimeout(400);
  await r.page.screenshot({ path: file });
}

// ---- putting a pair together ----------------------------------------------------------------

// Each side under its name; side by side; the conditions under both.  A
// whole window is shown at half size in the pair (the originals are full).
// `mark`: a window on QtSpim's side outlined and named (in the pair only).
function pair(name: string, conditions: string, half = false, mark?: { x: number; y: number; width: number; height: number; label: string }): void {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'pair-'));
  const side = (which: 'qtspim' | '2x', label: string, colour: string) => {
    const src = path.join(originals, `${name}-${which}.png`);
    const scaled = path.join(tmp, `${which}.png`);
    const outline = which === 'qtspim' && mark
      ? ['-fill', 'none', '-stroke', '#E8710A', '-strokewidth', '4',
         '-draw', `rectangle ${mark.x},${mark.y} ${mark.x + mark.width - 1},${mark.y + mark.height - 1}`,
         '-stroke', 'none', '-fill', '#E8710A', '-font', FONT, '-pointsize', '28', '-annotate', `+${mark.x + 16}+${mark.y + 44}`, mark.label]
      : [];
    execFileSync('convert', [src, ...outline, ...(half ? ['-resize', '50%'] : []), '-bordercolor', '#D0D5DD', '-border', '1', scaled]);
    const w = execFileSync('identify', ['-format', '%w', scaled], { encoding: 'utf8' });
    const labelled = path.join(tmp, `${which}-l.png`);
    execFileSync('convert', ['(', '-size', `${w}x36`, `xc:${colour}`, '-font', FONT, '-pointsize', '17', '-fill', 'white',
      '-annotate', '+12+25', label, ')', scaled, '-background', 'white', '-append', labelled]);
    return labelled;
  };
  const left = side('qtspim', LEFT, '#5A5A5A');
  const right = side('2x', RIGHT, '#00205B');
  const both = path.join(tmp, 'both.png');
  execFileSync('convert', [left, '(', '-size', '16x1', 'xc:white', ')', right, '-background', 'white', '-gravity', 'North', '+append', both]);
  const w = Number(execFileSync('identify', ['-format', '%w', both], { encoding: 'utf8' }));
  execFileSync('convert', [both, '(', '-size', `${w}x`, '-background', 'white', '-fill', '#5A5A5A', '-font', FONT,
    '-pointsize', '14', `caption:${conditions}`, ')', '-gravity', 'NorthWest', '-append', '-bordercolor', 'white', '-border', '8',
    path.join(out, `${name}.png`)]);
  rmSync(tmp, { recursive: true, force: true });
  console.log(`written  docs/compare/${name}.png`);
}

// ---- the six pairs --------------------------------------------------------------------------

const work = mkdtempSync(path.join(os.tmpdir(), 'compare-'));
const file = path.join(work, 'data-labels.s');
writeFileSync(file, readFileSync(path.join(root, FILE)));
// The same file with one mistake: line 14's base register without its $.
const broken = path.join(work, 'data-labels.s'.replace('.s', '-error.s'));
const lines = readFileSync(file, 'utf8').split('\n');
if (!lines[13].includes('4($t1)')) throw new Error(`line 14 of ${FILE} is not the lw it was`);
lines[13] = lines[13].replace('4($t1)', '4(t1)');
writeFileSync(broken, lines.join('\n'));

const SAME = `Same file (${path.basename(FILE)}), ${STEPS} × Single Step (F10), window ${WIDTH}×${HEIGHT}, ${FONTS}; fresh settings; Linux, Xvfb.`;

// 1-4: after the steps, one panel each.
{
  const qt = new Qt();
  await qt.start(file);
  await qt.step(STEPS);
  await qt.shot(path.join(originals, '01-registers-qtspim.png'), QT.registers);
  await qt.shot(path.join(originals, '02-text-qtspim.png'), QT.text);
  await qt.shot(path.join(originals, '03-inspector-qtspim.png'), QT.userText);
  await qt.click(QT.dataTab);
  await qt.shot(path.join(originals, '04-data-qtspim.png'), QT.text);
  qt.stop();

  const r = await ours();
  await openAndAssemble(r, sample(r.dir, FILE));
  for (let i = 0; i < STEPS; i += 1) { await r.page.keyboard.press('F10'); await settled(r.page); }
  await panel(r, 'Registers', path.join(originals, '01-registers-2x.png'));
  await panel(r, 'Text', path.join(originals, '02-text-2x.png'));
  await panel(r, 'Inspector', path.join(originals, '03-inspector-2x.png'));
  await r.page.locator('.ptab', { hasText: 'Data' }).click();
  await r.page.waitForSelector('.drow');
  await panel(r, 'Text', path.join(originals, '04-data-2x.png'));
  await whole(r, path.join(out, 'window.png')); // the README's "The whole window"
  await r.close();
}
pair('01-registers', `${SAME} QtSpim: the Int Regs panel. Hallym MIPS: Registers.`);
pair('02-text', `${SAME} QtSpim: the Text panel. Hallym MIPS: Text.`);
pair('03-inspector', `${SAME} The instruction at PC (lw $t2, 4($t1), word 8d2a0004). QtSpim: the user part of the Text panel. Hallym MIPS: Inspector.`);
pair('04-data', `${SAME} QtSpim: the Data panel. Hallym MIPS: the Data tab.`);

// 5: the same file with a mistake, opened; each whole window.
{
  const qt = new Qt();
  await qt.start(broken);
  await sleep(500);
  await qt.shot(path.join(originals, '05-editor-errors-qtspim.png'), undefined, false); // its error dialog in front
  qt.stop();
  const r = await ours();
  await openAndAssemble(r, broken);
  await r.page.waitForSelector('.errors .item');
  await whole(r, path.join(originals, '05-editor-errors-2x.png'));
  await r.close();
}
pair('05-editor-errors', `The same file with one mistake on line 14 (4(t1) for 4($t1)), opened; window ${WIDTH}×${HEIGHT}, ${FONTS}; fresh settings; Linux, Xvfb. QtSpim: started with the file (qtspim -file). Hallym MIPS: opened (Ctrl+O), then Ctrl+S. Shown at half size.`, true);

// 6: the first start, nothing opened.  QtSpim's Console opens at (0, 0)
// behind the main window here (no window manager to place it): it is moved
// to where it can be seen.
{
  const qt = new Qt();
  await qt.start();
  x('windowmap', qt.console);
  x('windowmove', qt.console, '780', '270');
  x('windowraise', qt.console);
  await qt.shot(path.join(originals, '06-first-start-qtspim.png'), undefined, false);
  qt.stop();
  const r = await ours();
  await whole(r, path.join(originals, '06-first-start-2x.png'));
  await r.close();
}
pair('06-first-start', `The first start: nothing opened, no saved settings; window ${WIDTH}×${HEIGHT}, ${FONTS}; Linux, Xvfb. QtSpim's Console is a window of its own (800×600, outlined here); with no window manager it opens behind the main window at (0, 0), and it is moved to (780, 270) so it can be seen. Shown at half size.`,
  true, { x: 780, y: 270, width: 800, height: 600, label: 'Console (a window of its own)' });

rmSync(work, { recursive: true, force: true });
