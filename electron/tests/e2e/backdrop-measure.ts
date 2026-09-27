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
    const s = Math.max(c.width / iw, c.height / ih) * 1.03; // object-fit: cover, then scale(1.03)
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
