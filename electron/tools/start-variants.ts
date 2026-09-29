/* Pictures and numbers of the candidate first-screen designs
   (tools/start-variants-list.ts), for choosing one and then implementing it.

     xvfb-run -a -s '-screen 0 2400x1400x24' node tools/start-variants.ts [combined|first]

   `first` is the first round's seven designs (docs/start-variants/); `combined`
   (the default) the combinations and the contrast probes
   (docs/start-variants/combined/).  START_VARIANTS_OUT overrides the folder.

   Each design at 1920x1040 and at 910x505 (1366x768 at 150%):
     - its picture, the video stopped at 3.0 s, the clock fixed (not the probes)
     - over FRAMES (the clip's 6.7 s, every half second), as the SCREEN shows it:
       the ground's tint and sharpness against the raw frame with the treatment
       on and with it off (no filter, no veil), the colour lean; the card's
       text contrast against what is behind each text (the text hidden, the
       darkest 1% of the pixels under its box); for a glass card, what it
       shows of the ground with its backdrop-filter and without -- each as
       the range over the frames, the worst end being what a check must hold
   And on Windows, the whole screen as Windows draws it -- the caption buttons
   included, which the page cannot draw -- for each design with dark bars and
   each patch colour in OVERLAYS: windows-frame-<id>-<overlay>.png, with the
   patch's colour against the bar's beside it.

   Writes <id>-1920.jpg, <id>-910.jpg, sheet.jpg (ImageMagick's montage, where
   there is one), metrics.json. */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  CARD_EMPTY, cardTexts, compare, GLASS_OFF, glassRect, glassSharpness, groundRect, HIDE_TEXT, rawPixels, screenPixels, setExtra, textContrasts, TREATMENT_OFF, type Pixels,
} from '../tests/e2e/backdrop-measure.ts';
import { launch, root, type Running } from '../tests/e2e/harness.ts';
import { applyVariant, OVERLAYS, SETS, VARIANTS } from './start-variants-list.ts';

// [set] [--size default|variants] [--frames N|all]
const args = process.argv.slice(2);
const flag = (name: string, dflt: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const setName = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')) ?? 'combined';
const set = SETS[setName];
if (!set) throw new Error(`no set ${setName}: ${Object.keys(SETS).join(', ')}`);
const out = process.env.START_VARIANTS_OUT ? path.resolve(process.env.START_VARIANTS_OUT)
  : path.join(root, 'docs/start-variants', setName === 'first' ? '' : setName);
mkdirSync(out, { recursive: true });
const FIXED_TIME = new Date('2026-09-28T10:00:00+09:00');
const AT = 3.0;
// `all`: every frame of the clip (counted by ffprobe: 192 at 30/s from 2.7.1), each at its middle;
// N: N evenly from 0.25 to 6.25 s.
const framesArg = flag('--frames', '13');
const clipFrames = (): number => Number(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0',
  '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', path.join(root, 'src/renderer/assets/hallym/start/start.webm')], { encoding: 'utf8' }).trim());
const FRAMES = framesArg === 'all' ? Array.from({ length: clipFrames() }, (_, i) => (i + 0.5) / 30)
  : Array.from({ length: Number(framesArg) }, (_, i) => 0.25 + i * (6 / Math.max(1, Number(framesArg) - 1)));
if (!FRAMES.length || FRAMES.some((t) => !(t >= 0 && t < 6.7))) throw new Error(`--frames ${framesArg}`);
// `default`: the harness's own window (1280x800, SPIM_E2E_SIZE aside), the one the e2e measure in;
// or sizes, WxH,WxH (at 100%: the e2e's widths, tools/e2e-widths.ts, and 1920x1040).
const sizeArg = flag('--size', 'variants');
const SIZES = sizeArg === 'default' ? [{ name: 'default', size: undefined as { width: number; height: number } | undefined, scale: '1' }]
  : sizeArg !== 'variants' ? sizeArg.split(',').map((wh) => {
    const m = /^(\d+)x(\d+)$/.exec(wh);
    if (!m) throw new Error(`--size ${wh}`);
    return { name: wh, size: { width: Number(m[1]), height: Number(m[2]) } as { width: number; height: number } | undefined, scale: '1' };
  }) : [
    { name: '1920', size: { width: 1920, height: 1040 } as { width: number; height: number } | undefined, scale: '1' },
    { name: '910', size: { width: 910, height: 505 } as { width: number; height: number } | undefined, scale: '1.5' },
  ];

type RGB = [number, number, number];
// The blue and green channels' shares of the total, screen against the frame, in percentage
// points (brightness left out: towardNavy cannot tell darkening from bluing, navy being dark);
// light = the screen's total over the frame's.
export function colour(screen: RGB, raw: RGB) {
  const sum = (c: RGB) => c[0] + c[1] + c[2];
  const share = (c: RGB, i: number) => 100 * c[i] / sum(c);
  return { blueLean: +(share(screen, 2) - share(raw, 2)).toFixed(1), greenLean: +(share(screen, 1) - share(raw, 1)).toFixed(1),
           light: +(sum(screen) / sum(raw)).toFixed(2) };
}

async function videoAt(r: Running, t: number): Promise<void> {
  await r.page.waitForSelector('.wback.playing');
  await r.page.evaluate((t) => new Promise<void>((done) => {
    const v = document.querySelector('.wback video') as HTMLVideoElement;
    v.pause();
    v.addEventListener('seeked', () => requestAnimationFrame(() => requestAnimationFrame(() => done())), { once: true });
    v.currentTime = t;
  }), t);
}

// ---- Windows first: the whole screen, the caption buttons included (does the dark bar hold?) ----
function wholeScreen(file: string): void {
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
  if (done.status !== 0) throw new Error(`whole screen: ${done.stderr}`);
}

async function readPng(r: Running, file: string): Promise<Pixels> {
  const read = await r.app.evaluate(({ nativeImage }, f) => {
    const img = nativeImage.createFromPath(f);
    const s = img.getSize();
    return { width: s.width, height: s.height, bgra: img.toBitmap().toString('base64') };
  }, file);
  if (!read.width) throw new Error(`${file}: not read`);
  const bgra = Buffer.from(read.bgra, 'base64');
  const rgba = new Uint8Array(bgra.length);
  for (let i = 0; i < bgra.length; i += 4) { rgba[i] = bgra[i + 2]; rgba[i + 1] = bgra[i + 1]; rgba[i + 2] = bgra[i]; rgba[i + 3] = 255; }
  return { width: read.width, height: read.height, rgba };
}

function meanAt(p: Pixels, x: number, y: number, w: number, h: number): number[] {
  const m = [0, 0, 0];
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) for (let c = 0; c < 3; c++) m[c] += p.rgba[(j * p.width + i) * 4 + c];
  return m.map((v) => Math.round(v / (w * h)));
}

if (process.platform === 'win32') {
  // The app as built sets its own patch (`own`); a candidate is pictured with each of OVERLAYS.
  const withBars = setName === 'app' ? [set[0]]
    : [VARIANTS.find((v) => v.id === '5-whole-window')!, ...set.filter((v) => v.titlebarOverlay && !v.probe)];
  const overlays = setName === 'app' ? { own: undefined } : OVERLAYS;
  const frames: Record<string, unknown>[] = [];
  for (const v of withBars) {
    for (const [oname, overlay] of Object.entries(overlays)) {
      const r = await launch();
      try {
        await r.page.clock.setFixedTime(FIXED_TIME);
        await r.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize());
        await r.page.waitForTimeout(1000);
        await videoAt(r, AT);
        await applyVariant(r, v, overlay);
        await r.page.waitForTimeout(1500);
        const file = path.join(out, `windows-frame-${v.id}-${oname}.png`);
        wholeScreen(file);
        // The patch: right of the title bar area the page gets (the Window Controls Overlay's rect).
        const at = await r.app.evaluate(({ BrowserWindow, screen }) => ({
          content: BrowserWindow.getAllWindows()[0].getContentBounds(), scale: screen.getPrimaryDisplay().scaleFactor,
        }));
        const area = await r.page.evaluate(() => {
          const a = (navigator as unknown as { windowControlsOverlay?: { getTitlebarAreaRect(): DOMRect } }).windowControlsOverlay?.getTitlebarAreaRect();
          return a ? { x: a.x, width: a.width, height: a.height } : null;
        });
        if (!area || !area.width) throw new Error(`no window controls overlay rect: ${JSON.stringify(area)}`);
        const p = await readPng(r, file);
        const px = (css: number) => Math.round((at.content.x + css) * at.scale);
        const py = (css: number) => Math.round((at.content.y + css) * at.scale);
        const patchX = px(area.x + area.width), top = py(0), mid = py(area.height / 2) - 3;
        const row = {
          variant: v.id, overlay: oname, set: overlay, content: at.content, scale: at.scale, titlebarArea: area,
          // 6x6 in the patch's left edge (clear of the symbols) and in the bar's empty 8 px just before it
          patch: meanAt(p, patchX + 4, top + 4, 6, 6), bar: meanAt(p, patchX - 8, top + 4, 6, 6),
          patchMiddle: meanAt(p, patchX + 4, mid, 6, 6), barMiddle: meanAt(p, patchX - 8, mid, 6, 6),
        };
        frames.push(row);
        writeFileSync(path.join(out, 'windows-frames.json'), JSON.stringify(frames, null, 1));
        console.log(`frame ${v.id} ${oname}: ${JSON.stringify(row)}`);
      } finally {
        await r.close();
      }
    }
  }
}

const range = (xs: number[]) => [+Math.min(...xs).toFixed(3), +Math.max(...xs).toFixed(3)];

const metrics: Record<string, unknown>[] = [];
for (const v of set) {
  for (const s of SIZES) {
    const started = Date.now();
    const r = await launch(s.size, { switches: [`--force-device-scale-factor=${s.scale}`] });
    try {
      // Windows centres a new window: a 1920x1040 one on the 1920x1080 screen sat at (320,116),
      // its right 320 px off the screen, and the ground strip captured black there (run
      // 36447207053).  At (0,0) only its bottom 8 px are under the taskbar, far from what is measured.
      await r.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setPosition(0, 0));
      await r.page.clock.setFixedTime(FIXED_TIME);
      await videoAt(r, AT);
      await applyVariant(r, v);
      await r.page.mouse.move(-10, -10);
      await r.page.evaluate(() => document.fonts.ready);
      await r.page.waitForTimeout(800);
      if (!v.probe) await r.page.screenshot({ path: path.join(out, `${v.id}-${s.name}.jpg`), type: 'jpeg', quality: 85 });
      const card = (await r.page.locator('.wcard').boundingBox())!;
      const on: { towardNavy: number; sharpness: number; blueLean: number; greenLean: number; light: number }[] = [];
      const off: { towardNavy: number; sharpness: number }[] = [];
      const glassOn: number[] = [], glassOff: number[] = [];
      const worst: Record<string, number> = {};
      const ts = await cardTexts(r);
      const at = async (t: number) => { await videoAt(r, t); await r.page.waitForTimeout(200); };
      // Pass 1, the design (its texts hidden): the ground, the contrasts.
      await setExtra(r, HIDE_TEXT);
      for (const t of FRAMES) {
        await at(t);
        if (!v.probe) {
          const ground = await groundRect(r);
          const g = compare(await screenPixels(r, ground), await rawPixels(r, ground));
          on.push({ towardNavy: g.towardNavy, sharpness: g.sharpness, ...colour(g.screen.mean, g.raw.mean) });
        }
        for (const [name, c] of Object.entries(await textContrasts(r, ts))) worst[name] = Math.min(worst[name] ?? Infinity, c);
      }
      // Pass 2, the card emptied: all of it is glass; pass 3, the same without its backdrop-filter.
      if (v.glass) {
        await setExtra(r, CARD_EMPTY);
        for (const t of FRAMES) {
          await at(t);
          const cr = await glassRect(r);
          glassOn.push(glassSharpness(await screenPixels(r, cr), await rawPixels(r, cr)));
        }
        await setExtra(r, CARD_EMPTY + GLASS_OFF);
        for (const t of FRAMES) {
          await at(t);
          const cr = await glassRect(r);
          glassOff.push(glassSharpness(await screenPixels(r, cr), await rawPixels(r, cr)));
        }
      }
      // Pass 4, the ground's treatment removed (no filter, no veil).
      if (!v.probe) {
        await setExtra(r, HIDE_TEXT + TREATMENT_OFF);
        for (const t of FRAMES) {
          await at(t);
          const ground = await groundRect(r);
          const o = compare(await screenPixels(r, ground), await rawPixels(r, ground));
          off.push({ towardNavy: o.towardNavy, sharpness: o.sharpness });
        }
      }
      // Where the window is on the screen: a strip partly off the screen captures black.
      const geometry = await r.app.evaluate(({ BrowserWindow, screen }) => {
        const w = BrowserWindow.getAllWindows()[0], d = screen.getPrimaryDisplay();
        return { window: w.getBounds(), content: w.getContentBounds(), screen: d.bounds, workArea: d.workArea, scale: d.scaleFactor };
      });
      // The first design's screen as it is at the end (the ground's treatment off), for when the numbers say something is wrong.
      if (process.platform === 'win32' && v === set[0]) wholeScreen(path.join(out, `windows-screen-${v.id}-${s.name}.png`));
      const row = {
        variant: v.id, size: s.name, frames: FRAMES.length, geometry,
        card: { width: Math.round(card.width), height: Math.round(card.height) },
        ...(on.length ? {
          ground: {
            // With the treatment off the screen must be the raw frame (tint about 0, sharpness about 1);
            // if not, the strip holds something else and neither end of the row is a measurement.
            valid: Math.max(...off.map((m) => Math.abs(m.towardNavy))) < 0.1 && Math.min(...off.map((m) => m.sharpness)) > 0.8,
            on: { towardNavy: range(on.map((m) => m.towardNavy)), sharpness: range(on.map((m) => m.sharpness)),
                  blueLean: range(on.map((m) => m.blueLean)), greenLean: range(on.map((m) => m.greenLean)), light: range(on.map((m) => m.light)) },
            off: { towardNavy: range(off.map((m) => m.towardNavy)), sharpness: range(off.map((m) => m.sharpness)) },
          },
        } : {}),
        // on/off in the same frame: the ranges can overlap across frames, the ratio at one frame not
        ...(glassOn.length ? { glass: { on: range(glassOn), off: range(glassOff), ratio: range(glassOn.map((x, i) => x / glassOff[i])) } } : {}),
        contrastWorst: worst,
      };
      metrics.push(row);
      writeFileSync(path.join(out, 'metrics.json'), JSON.stringify(metrics, null, 1)); // as it goes: a timeout keeps what was measured
      console.log(`${v.id} ${s.name} (${Math.round((Date.now() - started) / 1000)} s): ${JSON.stringify(row)}`);
    } finally {
      await r.close();
    }
  }
}

// The sheet: one row per pictured design, both widths (ImageMagick's montage; not on the Windows runner).
const pictured = set.filter((v) => !v.probe);
if (spawnSync('montage', ['-version']).status !== 0) {
  console.log('no montage here: no sheet');
} else {
  const args: string[] = [];
  for (const v of pictured) for (const s of SIZES) args.push('-label', `${v.name} — ${s.name === '1920' ? '1920×1040' : '910×505 (at 150%)'}`, path.join(out, `${v.id}-${s.name}.jpg`));
  const m = spawnSync('montage', [...args, '-tile', '2x', '-geometry', '760x440+10+10', '-pointsize', '20', '-background', 'white', '-quality', '82',
    path.join(out, 'sheet.jpg')], { encoding: 'utf8' });
  if (m.status !== 0) throw new Error(`montage: ${m.stderr}`);
}
console.log(`wrote ${pictured.length * SIZES.length} pictures and metrics.json in ${path.relative(root, out) || out}`);
