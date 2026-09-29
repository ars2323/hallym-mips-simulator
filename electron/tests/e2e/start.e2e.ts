/* The first screen's background (panels/backdrop.ts): the university's
   video, silent, looping, from the app's own files; one video for both
   steps, running on from one to the other; the glass card readable over it
   (every text 4.5:1 at every moment of the clip) and blurring what it shows;
   on the screen, the ground tinted and blurred; on Windows, the caption
   buttons' patch showing the dark bar through; the still only under
   prefers-reduced-motion; nothing of it once a
   file is open; the brand's navy, quietly, when the clip cannot play.

   Run by the Windows job against the installed program too: there the clip
   is read from the package (app.asar). */

import { expect, test, type Page } from '@playwright/test';

import {
  CARD_EMPTY, cardTexts, compare, GLASS_OFF, glassRect, glassSharpness, groundRect, HIDE_TEXT, rawPixels, readbackPixels, screenPixels, setExtra, stats, textContrasts,
} from './backdrop-measure.ts';
import { launch, openAndAssemble, program, type Running } from './harness.ts';

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
    expect(c.duration).toBeGreaterThan(6); // 6.7 s: 0:00.1-0:02.6 of the source, slowed to a third
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

// The card is glass (2.6.0): it shows the ground, blurred, so it changes
// with the video -- what must hold is that every text on it stays readable,
// 4.5:1 (WCAG AA) against what is behind it, at every moment of the clip.
// Measured as the screen shows it, the texts hidden, the darkest 1% under
// each text's box (backdrop-measure.ts); the moments cover the clip, whose
// worst frame of all 201 is in docs/PORTING.md 29.
const MOMENTS = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.2]; // the clip is 6.4 s (2.7.1)
test('every text on the card at least 4.5:1 against what is behind it, at every moment of the clip; the video changes behind it', async () => {
  const r = await launch();
  const { page } = r;
  try {
    await page.waitForSelector('.wback.playing');
    await page.mouse.move(-10, -10);
    const texts = await cardTexts(r);
    const ground = await groundRect(r);
    await setExtra(r, HIDE_TEXT);
    const grounds = new Set<string>();
    const worst: string[] = [];
    for (const t of MOMENTS) {
      await at(page, t);
      grounds.add((await pixels(r, ground)).hash);
      for (const [name, c] of Object.entries(await textContrasts(r, texts))) {
        worst.push(`${name} ${c} at ${t} s`);
        expect(c, `${name} at ${t} s`).toBeGreaterThanOrEqual(4.5);
      }
    }
    console.log(worst.sort((a, b) => parseFloat(a.split(' ').at(-4)!) - parseFloat(b.split(' ').at(-4)!)).slice(0, 3).join('; '));
    expect(grounds.size).toBe(MOMENTS.length); // the video does change behind it
  } finally {
    await r.close();
  }
});

// The glass: the card blurs what it shows of the ground.  The card emptied
// (all of it glass) against the raw frame, on 4x4 blocks (glassSharpness),
// with the card's backdrop-filter and without it, in the same frame; the
// ratio of the two sharpnesses is the measure (across frames the two ranges can overlap, in one frame not).
// With no filter it is 1; the design's, at every e2e size, is in
// docs/PORTING.md 29.
test('the glass card blurs what it shows of the ground', async () => {
  const r = await launch();
  const { page } = r;
  try {
    await page.waitForSelector('.wback.playing');
    await page.mouse.move(-10, -10);
    const strip = await glassRect(r);
    const moments = [0.5, 3.0, 5.5];
    const on: number[] = [];
    await setExtra(r, CARD_EMPTY);
    for (const t of moments) { await at(page, t); on.push(glassSharpness(await screenPixels(r, strip), await rawPixels(r, strip))); }
    await setExtra(r, CARD_EMPTY + GLASS_OFF);
    for (const [i, t] of moments.entries()) {
      await at(page, t);
      const off = glassSharpness(await screenPixels(r, strip), await rawPixels(r, strip));
      const said = `at ${t} s: with the filter ${on[i].toFixed(3)}, without ${off.toFixed(3)}, ratio ${(on[i] / off).toFixed(3)}`;
      console.log(said);
      expect(on[i] / off, said).toBeLessThanOrEqual(0.85);
    }
  } finally {
    await r.close();
  }
});

// Windows draws the caption buttons, on a patch the page cannot paint:
// on the first screen it is transparent (logic/overlay.ts), so the screen
// shows the dark glass bar through it -- a white patch would stand out by
// about 200 levels (docs/start-variants/combined/README.md).  In the Editor
// the bar is white and so is the patch.
test('the caption buttons on the screen: the first screen\'s dark bar through their patch, white in the Editor', async () => {
  test.skip(process.platform !== 'win32', 'Windows draws the caption buttons');
  const r = await launch();
  const { page } = r;
  try {
    await page.waitForSelector('.wback.playing');
    await page.mouse.move(-10, -10);
    await at(page, 3.0);
    const sample = async () => {
      const a = await page.evaluate(() => {
        const rect = (navigator as unknown as { windowControlsOverlay: { getTitlebarAreaRect(): DOMRect } }).windowControlsOverlay.getTitlebarAreaRect();
        return { right: rect.x + rect.width, height: rect.height };
      });
      const patch = stats(await screenPixels(r, { x: a.right + 4, y: 4, width: 6, height: 6 })).mean;
      const bar = stats(await screenPixels(r, { x: a.right - 8, y: 4, width: 6, height: 6 })).mean;
      return { patch, bar, apart: Math.max(...patch.map((v, i) => Math.abs(v - bar[i]))), said: `patch ${patch.map(Math.round)}, bar ${bar.map(Math.round)}` };
    };
    const first = await sample();
    console.log(`first screen: ${first.said}`);
    expect(first.apart, first.said).toBeLessThanOrEqual(3);
    expect(Math.max(...first.bar), first.said).toBeLessThan(160); // the dark bar, not white
    await openAndAssemble(r, program(r.dir, 'p.s', 'main:\n  li $v0, 10\n  syscall\n'));
    await page.waitForTimeout(500);
    const editor = await sample();
    console.log(`Editor: ${editor.said}`);
    expect(editor.apart, editor.said).toBeLessThanOrEqual(3);
    expect(Math.min(...editor.patch), editor.said).toBeGreaterThan(240);
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
    // Between the design and the ground with its treatment off, measured at every size the e2e run
    // in, over the clip's frames (docs/PORTING.md 29): the tint 0.40-0.45 with it, about 0 without;
    // the sharpness at most 0.28 with it, about 1 without.  What they guard: the navy veil, and the blur.
    expect(onScreen.towardNavy, said).toBeGreaterThan(0.2);
    expect(onScreen.sharpness, said).toBeLessThan(0.6);
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
