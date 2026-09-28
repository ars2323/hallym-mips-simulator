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

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { compare, groundRect, rawPixels, screenPixels, type Pixels, type Rect } from '../tests/e2e/backdrop-measure.ts';
import { launch, root, type Running } from '../tests/e2e/harness.ts';
import { applyVariant, OVERLAYS, SETS, VARIANTS } from './start-variants-list.ts';

const setName = process.argv[2] ?? 'combined';
const set = SETS[setName];
if (!set) throw new Error(`no set ${setName}: ${Object.keys(SETS).join(', ')}`);
const out = process.env.START_VARIANTS_OUT ? path.resolve(process.env.START_VARIANTS_OUT)
  : path.join(root, 'docs/start-variants', setName === 'first' ? '' : setName);
mkdirSync(out, { recursive: true });
const FIXED_TIME = new Date('2026-09-28T10:00:00+09:00');
const AT = 3.0;
const FRAMES = Array.from({ length: 13 }, (_, i) => 0.25 + i * 0.5); // 0.25 .. 6.25 of 6.7 s
const SIZES = [
  { name: '1920', size: { width: 1920, height: 1040 }, scale: '1' },
  { name: '910', size: { width: 910, height: 505 }, scale: '1.5' },
];
const OFF = '.wback img, .wback video { filter: none !important; } .wback::after { display: none !important; }';
const GLASS_OFF = '.wcard { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }';
const HIDE_TEXT = '.wcard h1, .wcard p.lead, .action b, .action .sub { color: transparent !important; }';
const TEXTS: [string, string][] = [
  ['lead', '.wcard p.lead'], ['sub, main button', '.action.main .sub'], ['sub, other button', '.action:not(.main) .sub'],
  ['heading', '.wcard h1'], ['button label', '.action:not(.main) b'],
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

// WCAG 2 relative luminance and contrast ratio.
const lin = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (c: RGB) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

async function videoAt(r: Running, t: number): Promise<void> {
  await r.page.waitForSelector('.wback.playing');
  await r.page.evaluate((t) => new Promise<void>((done) => {
    const v = document.querySelector('.wback video') as HTMLVideoElement;
    v.pause();
    v.addEventListener('seeked', () => requestAnimationFrame(() => requestAnimationFrame(() => done())), { once: true });
    v.currentTime = t;
  }), t);
}

async function withStyle<T>(r: Running, css: string, body: () => Promise<T>): Promise<T> {
  await r.page.evaluate((css) => new Promise<void>((done) => {
    const st = document.createElement('style');
    st.id = 'measure-extra';
    st.textContent = css;
    document.head.append(st);
    requestAnimationFrame(() => requestAnimationFrame(() => done()));
  }), css);
  await r.page.waitForTimeout(150);
  try {
    return await body();
  } finally {
    await r.page.evaluate(() => new Promise<void>((done) => {
      document.getElementById('measure-extra')?.remove();
      requestAnimationFrame(() => requestAnimationFrame(() => done()));
    }));
    await r.page.waitForTimeout(150);
  }
}

// Inside the card, above its heading: what the card shows of the ground (the glass).
async function cardRect(r: Running): Promise<Rect> {
  const card = (await r.page.locator('.wcard').boundingBox())!;
  const h1 = (await r.page.locator('.wcard h1').boundingBox())!;
  return { x: card.x + 24, y: card.y + 4, width: card.width - 48, height: Math.max(8, h1.y - card.y - 10) };
}

// Each text's contrast against what is behind it: the card captured with the text hidden,
// the darkest 1% of the pixels under the text's box (the backgrounds are lighter than the texts).
async function contrasts(r: Running): Promise<Record<string, number>> {
  const card = (await r.page.locator('.wcard').boundingBox())!;
  const texts = await r.page.evaluate((sels) => sels.map(([name, sel]) => {
    const e = document.querySelector(sel)!;
    const b = e.getBoundingClientRect();
    return { name, x: b.x, y: b.y, width: b.width, height: b.height, color: getComputedStyle(e).color };
  }), TEXTS);
  const shot = await withStyle(r, HIDE_TEXT, () => screenPixels(r, card));
  const k = shot.width / card.width;
  const result: Record<string, number> = {};
  for (const t of texts) {
    const fg = t.color.match(/[\d.]+/g)!.slice(0, 3).map(Number) as RGB;
    const x0 = Math.round((t.x - card.x) * k), y0 = Math.round((t.y - card.y) * k);
    const x1 = Math.round((t.x + t.width - card.x) * k), y1 = Math.round((t.y + t.height - card.y) * k);
    const ls: number[] = [];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * shot.width + x) * 4;
      ls.push(lum([shot.rgba[i], shot.rgba[i + 1], shot.rgba[i + 2]]));
    }
    if (!ls.length) throw new Error(`${t.name}: no pixels under it`);
    ls.sort((a, b) => a - b);
    result[t.name] = +ratio(lum(fg), ls[Math.floor(ls.length * 0.01)]).toFixed(2);
  }
  return result;
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
  const withBars = [VARIANTS.find((v) => v.id === '5-whole-window')!, ...set.filter((v) => v.titlebarOverlay && !v.probe)];
  const frames: Record<string, unknown>[] = [];
  for (const v of withBars) {
    for (const [oname, overlay] of Object.entries(OVERLAYS)) {
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
      for (const t of FRAMES) {
        await videoAt(r, t);
        if (!v.probe) {
          const ground = await groundRect(r);
          const raw = await rawPixels(r, ground);
          const g = compare(await screenPixels(r, ground), raw);
          on.push({ towardNavy: g.towardNavy, sharpness: g.sharpness, ...colour(g.screen.mean, g.raw.mean) });
          const o = await withStyle(r, OFF, async () => compare(await screenPixels(r, ground), raw));
          off.push({ towardNavy: o.towardNavy, sharpness: o.sharpness });
        }
        if (v.glass) {
          const cr = await cardRect(r);
          const raw = await rawPixels(r, cr);
          glassOn.push(compare(await screenPixels(r, cr), raw).sharpness);
          glassOff.push(await withStyle(r, GLASS_OFF, async () => compare(await screenPixels(r, cr), raw).sharpness));
        }
        for (const [name, c] of Object.entries(await contrasts(r))) worst[name] = Math.min(worst[name] ?? Infinity, c);
      }
      const row = {
        variant: v.id, size: s.name, frames: FRAMES.length,
        card: { width: Math.round(card.width), height: Math.round(card.height) },
        ...(on.length ? {
          ground: {
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
