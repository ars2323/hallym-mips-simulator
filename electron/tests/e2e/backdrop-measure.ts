/* Whether the first screen's background reaches the SCREEN blurred and
   tinted: its pixels as the display shows them, against the clip's own
   frame at the same geometry.  Used by tests/e2e/start.e2e.ts and
   tools/probe-platform.ts.

   - the screen: Windows, the screen's pixels (CopyFromScreen: what DWM
     shows, video planes included); Linux, the X server's (import -window
     root).  Not the compositor's readback (capturePage, page.screenshot):
     on Windows that showed the processing while the screen did not.
   - the raw frame: the video's current frame (or the still), drawn with no
     filter into a canvas as object-fit: cover and scale(1.03) place it.

   Two numbers for a region of the background:
     towardNavy  how far the mean colour moved from the raw frame's to the
                 navy (0 none, 1 all the way): the tint's opacity
     sharpness   the relative local variance (the mean 3x3 variance of the
                 luminance over its variance in the region), screen over raw:
                 1 as sharp as the frame, lower blurred.  Dividing by the
                 region's variance takes the tint's dimming out of it. */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { Running } from './harness.ts';

export const NAVY = [0, 32, 91] as const;
type RGB = [number, number, number];
export interface Rect { x: number; y: number; width: number; height: number }
export interface Pixels { width: number; height: number; rgba: Uint8Array }

// The screen's pixels under a CSS rect of the page (device pixels).
export async function screenPixels(r: Running, rect: Rect): Promise<Pixels> {
  const at = await r.app.evaluate(({ BrowserWindow, screen }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.moveTop();
    return { content: w.getContentBounds(), scale: screen.getPrimaryDisplay().scaleFactor };
  });
  const x = Math.round((at.content.x + rect.x) * at.scale), y = Math.round((at.content.y + rect.y) * at.scale);
  const width = Math.round(rect.width * at.scale), height = Math.round(rect.height * at.scale);
  const dir = mkdtempSync(path.join(tmpdir(), 'screen-'));
  const file = path.join(dir, 'region.png');
  try {
    const done = process.platform === 'win32'
      ? spawnSync('powershell', ['-NoProfile', '-Command', `Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap ${width}, ${height}
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen(${x}, ${y}, 0, 0, $bmp.Size)
$bmp.Save('${file}', [System.Drawing.Imaging.ImageFormat]::Png)`], { encoding: 'utf8' })
      : spawnSync('import', ['-window', 'root', '-crop', `${width}x${height}+${x}+${y}`, '+repage', file], { encoding: 'utf8' });
    if (done.status !== 0) throw new Error(`screen capture failed: ${done.stderr || done.error}`);
    const read = await r.app.evaluate(({ nativeImage }, f) => {
      const img = nativeImage.createFromPath(f);
      const s = img.getSize();
      return { width: s.width, height: s.height, bgra: img.toBitmap().toString('base64') };
    }, file);
    const bgra = Buffer.from(read.bgra, 'base64');
    const rgba = new Uint8Array(bgra.length);
    for (let i = 0; i < bgra.length; i += 4) { rgba[i] = bgra[i + 2]; rgba[i + 1] = bgra[i + 1]; rgba[i + 2] = bgra[i]; rgba[i + 3] = 255; }
    return { width: read.width, height: read.height, rgba };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// The compositor's readback of the same rect (for comparison only).
export async function readbackPixels(r: Running, rect: Rect): Promise<Pixels> {
  const read = await r.app.evaluate(async ({ BrowserWindow }, rc) => {
    const img = await BrowserWindow.getAllWindows()[0].webContents.capturePage(rc);
    const s = img.getSize();
    return { width: s.width, height: s.height, bgra: img.toBitmap().toString('base64') };
  }, { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) });
  const bgra = Buffer.from(read.bgra, 'base64');
  const rgba = new Uint8Array(bgra.length);
  for (let i = 0; i < bgra.length; i += 4) { rgba[i] = bgra[i + 2]; rgba[i + 1] = bgra[i + 1]; rgba[i + 2] = bgra[i]; rgba[i + 3] = 255; }
  return { width: read.width, height: read.height, rgba };
}

// The clip's current frame (the still if no clip is loaded), unprocessed, at
// the geometry the page gives it, under the same rect (device pixels).
export async function rawPixels(r: Running, rect: Rect): Promise<Pixels> {
  const read = await r.page.evaluate((rc) => {
    const stage = document.querySelector('.wback') as HTMLElement;
    const box = stage.getBoundingClientRect();
    const video = document.querySelector('.wback video') as HTMLVideoElement;
    const still = document.querySelector('.wback img.still') as HTMLImageElement;
    const src: CanvasImageSource = video.readyState >= 2 && video.videoWidth ? video : still;
    const iw = video.readyState >= 2 && video.videoWidth ? video.videoWidth : still.naturalWidth;
    const ih = video.readyState >= 2 && video.videoWidth ? video.videoHeight : still.naturalHeight;
    const dpr = window.devicePixelRatio;
    const c = document.createElement('canvas');
    c.width = Math.round(box.width * dpr); c.height = Math.round(box.height * dpr);
    const g = c.getContext('2d')!;
    // object-fit: cover, then the video's own scale (app.css: scale(1.03); the candidate designs, others)
    const t = getComputedStyle(video).transform;
    const s = Math.max(c.width / iw, c.height / ih) * (t && t !== 'none' ? new DOMMatrix(t).a : 1);
    g.drawImage(src, (c.width - iw * s) / 2, (c.height - ih * s) / 2, iw * s, ih * s);
    const x = Math.round((rc.x - box.x) * dpr), y = Math.round((rc.y - box.y) * dpr);
    const w = Math.round(rc.width * dpr), h = Math.round(rc.height * dpr);
    return { width: w, height: h, data: Array.from(g.getImageData(x, y, w, h).data) };
  }, rect);
  return { width: read.width, height: read.height, rgba: Uint8Array.from(read.data) };
}

export function stats(p: Pixels): { mean: [number, number, number]; relLocalVar: number } {
  const n = p.width * p.height;
  const mean: [number, number, number] = [0, 0, 0];
  const lum = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const r = p.rgba[i * 4], g = p.rgba[i * 4 + 1], b = p.rgba[i * 4 + 2];
    mean[0] += r; mean[1] += g; mean[2] += b;
    lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  mean[0] /= n; mean[1] /= n; mean[2] /= n;
  let m = 0; for (const v of lum) m += v; m /= n;
  let global = 0; for (const v of lum) global += (v - m) ** 2; global /= n;
  let local = 0, count = 0;
  for (let y = 1; y < p.height - 1; y++) {
    for (let x = 1; x < p.width - 1; x++) {
      let s = 0, s2 = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const v = lum[(y + dy) * p.width + x + dx]; s += v; s2 += v * v; }
      local += s2 / 9 - (s / 9) ** 2; count++;
    }
  }
  return { mean, relLocalVar: global > 0 ? local / count / global : 0 };
}

export interface Measure { towardNavy: number; sharpness: number; screen: ReturnType<typeof stats>; raw: ReturnType<typeof stats> }
export function compare(screen: Pixels, raw: Pixels): Measure {
  const s = stats(screen), w = stats(raw);
  const d = (c: [number, number, number]) => Math.hypot(c[0] - NAVY[0], c[1] - NAVY[1], c[2] - NAVY[2]);
  return { towardNavy: 1 - d(s.mean) / d(w.mean), sharpness: w.relLocalVar > 0 ? s.relLocalVar / w.relLocalVar : 1, screen: s, raw: w };
}

// The background's largest strip clear of the card: above it, or beside it.
export async function groundRect(r: Running): Promise<Rect> {
  const card = (await r.page.locator('.wcard').boundingBox())!;
  const stage = (await r.page.locator('.stage-welcome').boundingBox())!;
  const above = { x: stage.x + 20, y: stage.y + 10, width: stage.width - 40, height: card.y - stage.y - 30 };
  const beside = { x: stage.x + 10, y: stage.y + 20, width: card.x - stage.x - 30, height: stage.height - 40 };
  return above.width * above.height >= beside.width * beside.height ? above : beside;
}

// ---- the first screen's card: its glass and its texts' contrast (2.6.0) -------------------

// The treatment of the ground taken off (the raw photo on the screen); the card's
// backdrop-filter taken off; the card's texts hidden (what is behind them left).
export const TREATMENT_OFF = '.wback img, .wback video { filter: none !important; } .wback::after { display: none !important; }';
export const GLASS_OFF = '.wcard { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }';
export const HIDE_TEXT = '.wcard h1, .wcard p.lead, .action b, .action .sub { color: transparent !important; }';
export const TEXTS: [string, string][] = [
  ['lead', '.wcard p.lead'], ['sub, main button', '.action.main .sub'], ['sub, other button', '.action:not(.main) .sub'],
  ['heading', '.wcard h1'], ['button label', '.action:not(.main) b'],
];

// WCAG 2 relative luminance and contrast ratio.
const lin = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
export const lum = (c: RGB) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
export const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

// One extra style for a whole pass over the frames, then a second for it to reach the screen:
// switched per frame, a capture could come before the compositor had drawn the switch (one row of
// tools/start-variants.ts read every text at about 1:1 -- the text not yet hidden).
export async function setExtra(r: Running, css: string): Promise<void> {
  await r.page.evaluate((css) => new Promise<void>((done) => {
    document.getElementById('measure-extra')?.remove();
    const st = document.createElement('style');
    st.id = 'measure-extra';
    st.textContent = css;
    document.head.append(st);
    requestAnimationFrame(() => requestAnimationFrame(() => done()));
  }), css);
  await r.page.waitForTimeout(1000);
}

// The glass: with everything on it hidden (CARD_EMPTY), the whole card is what it shows of the
// ground -- inside its rounded corners and border.  (The strip above the heading alone, about 20
// px, read up to 0.75 at 910x505, too near what no filter reads: docs/PORTING.md 29.)
export const CARD_EMPTY = '.wcard > * { visibility: hidden !important; }';

// The glass's sharpness, screen over raw, on 4x4-pixel block means: the ground under the card is
// blurred already (8 px), so at the pixel's own scale both states sit near the noise floor (the
// design read 0.58-0.60 of no filter at the 3x3 scale); the card's 18 px more show at a coarser
// one (0.36-0.37 at every e2e size; docs/PORTING.md 29).
export function glassSharpness(screen: Pixels, raw: Pixels): number {
  return compare(blocks(screen, 4), blocks(raw, 4)).sharpness;
}
export function blocks(p: Pixels, k: number): Pixels {
  const w = Math.floor(p.width / k), h = Math.floor(p.height / k), rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) sum += p.rgba[((y * k + j) * p.width + x * k + i) * 4 + c];
      rgba[(y * w + x) * 4 + c] = Math.round(sum / (k * k));
    }
    rgba[(y * w + x) * 4 + 3] = 255;
  }
  return { width: w, height: h, rgba };
}
export async function glassRect(r: Running): Promise<Rect> {
  const card = (await r.page.locator('.wcard').boundingBox())!;
  return { x: card.x + 18, y: card.y + 18, width: card.width - 36, height: card.height - 36 };
}

// The card's texts: where, and their colours (read before the pass that hides them).
export interface Text { name: string; x: number; y: number; width: number; height: number; color: string }
export async function cardTexts(r: Running): Promise<Text[]> {
  return r.page.evaluate((sels) => sels.map(([name, sel]) => {
    const e = document.querySelector(sel)!;
    const b = e.getBoundingClientRect();
    return { name, x: b.x, y: b.y, width: b.width, height: b.height, color: getComputedStyle(e).color };
  }), TEXTS);
}

// Each text's contrast against what is behind it, the texts hidden (HIDE_TEXT on for the pass):
// the darkest 1% of the pixels under its box (the backgrounds are lighter than the texts).
export async function textContrasts(r: Running, ts: Text[]): Promise<Record<string, number>> {
  const card = (await r.page.locator('.wcard').boundingBox())!;
  const shot = await screenPixels(r, card);
  const k = shot.width / card.width;
  const result: Record<string, number> = {};
  for (const t of ts) {
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
    const c = ratio(lum(fg), ls[Math.floor(ls.length * 0.01)]);
    // No design here puts a text on its own colour: under 1.5 the text was still on the screen.
    if (c < 1.5) throw new Error(`${t.name}: ${c.toFixed(2)}:1 -- the text not hidden on the screen yet`);
    result[t.name] = +c.toFixed(2);
  }
  return result;
}
