/* The first screen's background (panels/backdrop.ts): the university's
   video, silent, looping, from the app's own files; one video for both
   steps, running on from one to the other; the card readable over it (the
   card does not change while the video does, and the ground around it is
   dark); the still only under prefers-reduced-motion; nothing of it once a
   file is open; the brand's navy, quietly, when the clip cannot play.

   Run by the Windows job against the installed program too: there the clip
   is read from the package (app.asar). */

import { expect, test, type Page } from '@playwright/test';

import { compare, groundRect, rawPixels, readbackPixels, screenPixels } from './backdrop-measure.ts';
import { launch, type Running } from './harness.ts';

const NAVY = 'rgb(0, 32, 91)';
const clip = (page: Page) => page.evaluate(() => {
  const v = document.querySelector('.wback video') as HTMLVideoElement & { webkitAudioDecodedByteCount: number };
  return { src: v.currentSrc, hasSrc: v.hasAttribute('src'), paused: v.paused, muted: v.muted, time: v.currentTime, duration: v.duration,
           width: v.videoWidth, height: v.videoHeight, audioBytes: v.webkitAudioDecodedByteCount, network: v.networkState,
           playing: v.closest('.wback')!.classList.contains('playing') };
});
// Stops the clip at `t` seconds and waits for the frame to be on screen.
async function at(page: Page, t: number): Promise<void> {
  await page.evaluate((t) => new Promise<void>((done) => {
    const v = document.querySelector('.wback video') as HTMLVideoElement;
    v.pause();
    v.addEventListener('seeked', () => requestAnimationFrame(() => requestAnimationFrame(() => done())), { once: true });
    v.currentTime = t;
  }), t);
  await page.waitForTimeout(100);
}
// The window's pixels in `rect` (CSS pixels): their mean luminance (0..1), and the bytes themselves.
const pixels = (r: Running, rect: { x: number; y: number; width: number; height: number }) =>
  r.app.evaluate(async ({ BrowserWindow }, rect) => {
    const image = await BrowserWindow.getAllWindows()[0].webContents.capturePage(rect);
    const b = image.toBitmap(); // BGRA
    let sum = 0;
    for (let i = 0; i < b.length; i += 4) sum += (0.0722 * b[i] + 0.7152 * b[i + 1] + 0.2126 * b[i + 2]) / 255;
    return { luminance: sum / (b.length / 4), hash: b.toString('base64') };
  }, { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) });

test('the first screen: the university video behind the card, from the app\'s own file, silent, playing', async () => {
  const r = await launch();
  const { page } = r;
  try {
    await page.waitForSelector('.wback.playing');
    const c = await clip(page);
    expect(c.src).toMatch(/^file:.*\/assets\/hallym\/start\/start\.webm$/); // no network: the program's own file
    expect([c.width, c.height]).toEqual([960, 540]);
    expect(c.duration).toBeGreaterThan(10);
    expect(c.muted).toBe(true);
    const t0 = c.time;
    await page.waitForTimeout(1200);
    const later = await clip(page);
    expect(later.paused).toBe(false);
    expect((later.time - t0 + later.duration) % later.duration).toBeGreaterThan(0.5); // it moves
    expect(later.audioBytes).toBe(0); // no sound decoded: the file has none
    expect(await page.locator('.wback').getAttribute('aria-hidden')).toBe('true');
    // Its still is there too, under it: the clip's first frame, 960x540.
    expect(await page.locator('.wback img.still').evaluate((i: HTMLImageElement) => [i.complete, i.naturalWidth])).toEqual([true, 960]);
  } finally {
    await r.close();
  }
});

test('both steps of the first screen: one background, which runs on from one to the other', async () => {
  const r = await launch();
  const { page } = r;
  try {
    await page.waitForSelector('.wback.playing');
    // Marks the element and counts every (re)load of it.
    await page.evaluate(() => {
      const v = document.querySelector('.wback video') as HTMLVideoElement & { mark?: string };
      v.mark = 'first';
      (window as unknown as { loads: number }).loads = 0;
      for (const e of ['loadstart', 'emptied']) v.addEventListener(e, () => { (window as unknown as { loads: number }).loads++; });
    });
    const same = () => page.evaluate(() => ({
      mark: (document.querySelector('.wback video') as HTMLVideoElement & { mark?: string } | null)?.mark ?? null,
      backs: document.querySelectorAll('.wback').length,
      loads: (window as unknown as { loads: number }).loads,
    }));
    let before = (await clip(page)).time;
    for (const go of [/바로 시작/, /처음으로/, /바로 시작/]) {
      await page.getByRole('button', { name: go }).click();
      await page.waitForTimeout(700);
      expect(await same()).toEqual({ mark: 'first', backs: 1, loads: 0 });
      const now = await clip(page);
      expect(now.playing).toBe(true);
      expect(now.paused).toBe(false);
      const moved = (now.time - before + now.duration) % now.duration;
      expect(moved).toBeGreaterThan(0.3); // on from where it was, not from the start
      expect(moved).toBeLessThan(3);
      before = now.time;
    }
    await expect(page.getByRole('button', { name: /파일 열기/ })).toBeVisible();
  } finally {
    await r.close();
  }
});

test('the card stays readable over the video: it does not change while the video does, and the ground around it is dark', async () => {
  const r = await launch();
  const { page } = r;
  try {
    await page.waitForSelector('.wback.playing');
    const card = (await page.locator('.wcard').boundingBox())!;
    const stage = (await page.locator('.stage-welcome').boundingBox())!;
    const inner = { x: card.x + 16, y: card.y + 16, width: card.width - 32, height: card.height - 32 }; // inside the rounded corners
    // A strip of the ground: above the card, or (a short window) beside it.
    const ground = card.y - stage.y > 60
      ? { x: stage.x, y: stage.y, width: stage.width, height: card.y - stage.y - 30 }
      : { x: stage.x, y: stage.y, width: Math.max(24, card.x - stage.x - 30), height: stage.height };
    const cards: string[] = [], grounds: string[] = [];
    for (const t of [0.5, 4.2, 8.1]) {
      await at(page, t);
      const c = await pixels(r, inner), g = await pixels(r, ground);
      cards.push(c.hash);
      grounds.push(g.hash);
      expect(g.luminance, `the ground at ${t} s`).toBeLessThan(0.4);
      expect(c.luminance, `the card at ${t} s`).toBeGreaterThan(0.85);
    }
    expect(new Set(grounds).size).toBe(3); // the video does change behind it
    expect(new Set(cards).size).toBe(1);   // the card does not
  } finally {
    await r.close();
  }
});

// As the SCREEN shows it, while the video plays (slowed, so that the frame
// holds while it is captured): the background moved toward the navy by the
// tint, and blurred -- against the clip's own frame at the same place.  The
// compositor's readback is not enough: on Windows it had both while the
// screen had neither (tests/e2e/backdrop-measure.ts).
test('the background on the screen, while the video plays: tinted toward the navy and blurred, against the raw frame', async () => {
  const r = await launch();
  const { page } = r;
  try {
    await page.waitForSelector('.wback.playing');
    await page.mouse.move(-10, -10);
    await page.evaluate(() => { (document.querySelector('.wback video') as HTMLVideoElement).playbackRate = 0.0625; });
    await page.waitForTimeout(1500);
    expect((await clip(page)).paused).toBe(false);
    const rect = await groundRect(r);
    const raw = await rawPixels(r, rect);
    const onScreen = compare(await screenPixels(r, rect), raw);
    const inReadback = compare(await readbackPixels(r, rect), raw);
    const said = `screen: toward navy ${onScreen.towardNavy.toFixed(3)}, sharpness ${onScreen.sharpness.toFixed(3)}; ` +
      `readback: ${inReadback.towardNavy.toFixed(3)}, ${inReadback.sharpness.toFixed(3)}; rect ${JSON.stringify(rect)}`;
    console.log(said);
    expect(onScreen.towardNavy, said).toBeGreaterThan(0.4); // the tint: 0.5 at the edges .. 0.78 behind the card
    expect(onScreen.sharpness, said).toBeLessThan(0.6);     // the blur: about 0.3; unblurred, about 1
  } finally {
    await r.close();
  }
});

test('prefers-reduced-motion: the still, and no video loaded, from the start or when it is turned on', async () => {
  const r = await launch();
  const { page } = r;
  try {
    await page.waitForSelector('.wback.playing');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(async () => { const c = await clip(page); return [c.hasSrc, c.playing]; }).toEqual([false, false]);
    await expect(page.locator('.wback img.still')).toBeVisible();
    await expect(page.locator('.wback video')).toHaveCSS('opacity', '0');
    // From the start: the window loaded again with the preference already on.
    await page.reload();
    await page.waitForSelector('.wcard');
    await page.waitForTimeout(800);
    const c = await clip(page);
    expect([c.hasSrc, c.playing, c.network]).toEqual([false, false, 0]); // NETWORK_EMPTY: never loaded
    await expect(page.locator('.wback img.still')).toBeVisible();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForSelector('.wback.playing');
  } finally {
    await r.close();
  }
});

test('the Editor has no video: it is unloaded once a file is open, and back with the first screen', async () => {
  const r = await launch();
  const { page } = r;
  try {
    await page.waitForSelector('.wback.playing');
    await page.getByRole('button', { name: /바로 시작/ }).click();
    await page.getByRole('button', { name: /새 파일/ }).click();
    await page.waitForSelector('.editor-panel .cm-content');
    await expect(page.locator('.wback')).toBeHidden();
    const c = await clip(page);
    expect([c.hasSrc, c.paused, c.playing]).toEqual([false, true, false]);
  } finally {
    await r.close();
  }
  // The tutorial, started from the first screen, opens its program (no
  // video) and, stopped, goes back to the first screen: the video with it.
  const r2 = await launch();
  try {
    await r2.page.waitForSelector('.wback.playing');
    await r2.page.getByRole('button', { name: /튜토리얼 보기/ }).click();
    await r2.page.waitForSelector('.tut-card');
    await expect(r2.page.locator('.wback')).toBeHidden();
    expect((await clip(r2.page)).hasSrc).toBe(false);
    await r2.page.locator('.tut-card .tut-quit').click();
    await r2.page.locator('dialog.ask').getByRole('button', { name: '그만두기' }).click();
    await expect(r2.page.locator('.wcard')).toBeVisible();
    await r2.page.waitForSelector('.wback.playing');
  } finally {
    await r2.close();
  }
});

test('a clip that cannot play: the brand\'s navy, quietly -- no still, no video, no message, never white', async () => {
  const r = await launch();
  const { page } = r;
  try {
    await page.waitForSelector('.wback.playing');
    const status = await page.locator('.status').innerText();
    await page.evaluate(() => { const v = document.querySelector('.wback video') as HTMLVideoElement; v.src = v.src.replace('start.webm', 'missing.webm'); });
    await page.waitForSelector('.wback.failed');
    await expect(page.locator('.wback img.still')).toBeHidden();
    await expect(page.locator('.wback video')).toBeHidden();
    await expect(page.locator('.wback')).toHaveCSS('background-color', NAVY);
    const stage = (await page.locator('.stage-welcome').boundingBox())!;
    await expect.poll(async () => (await pixels(r, { x: stage.x, y: stage.y, width: 40, height: 40 })).luminance)
      .toBeLessThan(0.2); // navy (0.12) under the tint, not white
    expect(await page.locator('.status').innerText()).toBe(status);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
  } finally {
    await r.close();
  }
});
