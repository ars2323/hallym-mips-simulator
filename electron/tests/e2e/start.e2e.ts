/* The first screen's circuit board (src/renderer/startfield/).

   What is checked here is what a picture cannot settle: that every text on
   the chip is readable against it, that the board is bright enough and
   spread out enough in time to read as something growing, that a settled
   board still moves without being redrawn, that it keeps inside a frame's
   budget, and that the chip is the card -- the pins are on the rectangle the
   card actually occupies, at every window size.

   The brightness and the timing are measured off the board's own pixels, by
   the same function the tuning tool uses (board-measure.ts): a number read
   there is what a threshold here is drawn around.

   The board itself -- the grid, the angles, the self-avoidance -- is checked
   where it is decided, in tests/renderer/startfield.test.ts, against the
   geometry rather than against pixels. */

import { expect, test, type Page } from '@playwright/test';

import { COLOURS } from '../../src/renderer/startfield/render.ts';
import { BANDS, DENSITY, IDLE_MOTION, measureBoard, TIMING } from './board-measure.ts';
import { launch, type Running } from './harness.ts';

/** Long enough for the card and the first of the board, not for all of it:
    only the tests that measure the opening wait for it to finish. */
const DRAWN = 1400;
const CHIP_INSIDE = '#050505';
/** The brightest the board's ground gets (render.ts lays the haze down):
    what the words that sit over the board have to be read against. */
const BOARD_GROUND = COLOURS.hazePeak;
/** The bars on the first screen are the board with 3 % white over them. */
const BAR_WHITE = 0.03;
/** The window the board was tuned at, and is measured at. */
const MEASURE_AT = { width: 1920, height: 1080 };

const framesDrawn = (page: Page) => page.evaluate(() => (window as unknown as {
  __startfield: { frames(): number } }).__startfield.frames());

/** sRGB relative luminance, and the contrast of two colours. */
function luminance(rgb: [number, number, number]): number {
  const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
}
const contrast = (a: [number, number, number], b: [number, number, number]): number => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
/** A computed colour, laid over `under` when it is not opaque -- the die
    marking is white at 55 %, and taking it for pure white would report a
    contrast it does not have. */
const parse = (css: string, under?: [number, number, number]): [number, number, number] => {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(css);
  if (!m) throw new Error(`not a colour: ${css}`);
  const rgb: [number, number, number] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const a = m[4] === undefined ? 1 : Number(m[4]);
  if (a === 1 || !under) return rgb;
  return rgb.map((v, i) => Math.round(v * a + under[i] * (1 - a))) as [number, number, number];
};
const hex = (h: string): [number, number, number] =>
  [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

async function settle(page: Page): Promise<void> {
  await page.waitForSelector('.startfield canvas');
  await page.waitForTimeout(DRAWN);
}

/** Waits for the whole board to have grown, however long that takes. */
async function grown(page: Page): Promise<number> {
  await page.waitForSelector('.startfield canvas');
  const ms = await page.evaluate(() => (window as unknown as {
    __startfield: { grown(): number } }).__startfield.grown());
  await page.waitForTimeout(ms + 800);
  return ms;
}

test('the board is behind the card, drawn by the app itself, and the card is the chip', async () => {
  const r = await launch();
  const { page } = r;
  try {
    await settle(page);
    const g = await page.evaluate(() => (window as unknown as { __startfield: { geometry(): {
      pins: { side: string; at: { x: number; y: number }; stub: { x: number; y: number } }[];
      paths: unknown[]; card: { x: number; y: number; width: number; height: number };
    } } }).__startfield.geometry());
    expect(g.paths.length).toBeGreaterThan(40);
    expect(g.pins.length).toBeGreaterThanOrEqual(32);
    // The pins are on the rectangle the card really occupies, not on a square of their own.
    const box = (await page.locator('.wcard').boundingBox())!;
    const host = (await page.locator('.startfield').boundingBox())!;
    // A processor is square, and the board is laid out around that square.
    expect(Math.abs(box.width - box.height),
      `the package is ${Math.round(box.width)}x${Math.round(box.height)}`).toBeLessThanOrEqual(1);
    expect(Math.abs(g.card.x - (box.x - host.x))).toBeLessThanOrEqual(1);
    expect(Math.abs(g.card.y - (box.y - host.y))).toBeLessThanOrEqual(1);
    expect(Math.abs(g.card.width - box.width)).toBeLessThanOrEqual(1);
    for (const pin of g.pins) {
      const edge = pin.side === 'top' ? pin.at.y === g.card.y
        : pin.side === 'bottom' ? pin.at.y === g.card.y + g.card.height
        : pin.side === 'left' ? pin.at.x === g.card.x : pin.at.x === g.card.x + g.card.width;
      expect(edge).toBe(true);
    }
    // No video is loaded any more: the first screen is drawn, not played.
    expect(await page.locator('.wback').count()).toBe(0);
    expect(await page.locator('video').count()).toBe(0);
  } finally { await r.close(); }
});

/* Everything the package carries: the product's name, the buttons' labels,
   the die marking and the way back.  The marking is held to 4.5:1 like the
   rest -- white at 45 % would be 4.49:1 on #050505, just under it. */
test('every text on the chip at 4.5:1 or better, against the chip and against the board', async () => {
  const r = await launch();
  const { page } = r;
  try {
    await settle(page);
    const chip = hex(CHIP_INSIDE);
    const ground = hex(BOARD_GROUND).map((v) => Math.round(v * (1 - BAR_WHITE) + 255 * BAR_WHITE)) as [number, number, number];
    const colours = await page.evaluate(() => {
      const get = (sel: string) => {
        const el = document.querySelector(sel);
        return el ? getComputedStyle(el).color : '';
      };
      return {
        wordmark: get('.wcard .wordmark'), die: get('.wcard .die'), label: get('.action b'), back: get('.wbody .back'),
        appname: get('.titlebar .appname'), status: get('.status'),
        cardBg: getComputedStyle(document.querySelector('.wcard')!).backgroundColor,
        actionBg: getComputedStyle(document.querySelector('.action')!).backgroundColor,
      };
    });
    expect(parse(colours.cardBg)).toEqual(chip);
    const worst: [string, number][] = [];
    // The card's own words sit on the chip; the buttons' on the button, which
    // is the chip with a touch of white over it -- take the chip, the darker
    // of the two, as the ground for both.
    for (const [name, css] of Object.entries({ wordmark: colours.wordmark, die: colours.die,
                                               label: colours.label, back: colours.back })) {
      worst.push([name, contrast(parse(css, chip), chip)]);
    }
    /* The only words that sit over the board itself are the two bars': the
       first screen makes them transparent and the board shows through.
       Their ground is the brightest the haze gets, with the bars' own 3 %
       white over it -- the worst case for them, not the card's #0d0d0d,
       which nothing is drawn on any more. */
    for (const [name, css] of Object.entries({ 'the title bar over the board': colours.appname,
                                               'the status bar over the board': colours.status })) {
      worst.push([name, contrast(parse(css, ground), ground)]);
    }
    for (const [name, value] of worst) expect(value, `${name}: ${value.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    console.log('contrast', worst.map(([n, v]) => `${n} ${v.toFixed(2)}`).join(', '));
  } finally { await r.close(); }
});

/* What the package carries (2.7.2): the mark with the product's name, the
   two ways in, and the die marking at the foot -- one column, centred in the
   die frame rather than held by fixed padding.  Measured against the die
   frame, which is .wcard::before: the package's border, its inset, and the
   frame's own line. */
interface Rect { x: number; y: number; width: number; height: number }
interface Card {
  card: Rect; die: Rect; stack: string[];
  logo: Rect; wordmark: Rect; wordmarkText: string; markText: string;
  block: { logo: Rect; body: Rect; mark: Rect };
  buttons: Rect[]; sentences: number; text: string;
}
const cardLayout = (page: Page): Promise<Card> => page.evaluate(() => {
  const box = (sel: string): Rect => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`no ${sel}`);
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  };
  const text = (sel: string) => document.querySelector(sel)?.textContent ?? '';
  const card = document.querySelector('.wcard') as HTMLElement;
  const r = card.getBoundingClientRect();
  const edge = parseFloat(getComputedStyle(card).borderLeftWidth)
    + parseFloat(getComputedStyle(card, '::before').left)
    + parseFloat(getComputedStyle(card, '::before').borderLeftWidth);
  return {
    card: { x: r.x, y: r.y, width: r.width, height: r.height },
    die: { x: r.x + edge, y: r.y + edge, width: r.width - 2 * edge, height: r.height - 2 * edge },
    stack: [...document.querySelector('.wstack')!.children].map((c) => c.className),
    logo: box('.wlogo .logo'), wordmark: box('.wlogo .wordmark'),
    wordmarkText: text('.wlogo .wordmark'), markText: text('.wcard .die'),
    block: { logo: box('.wlogo'), body: box('.wbody'), mark: box('.wcard .die') },
    buttons: [...document.querySelectorAll('.action')].map((b) => {
      const q = b.getBoundingClientRect();
      return { x: q.x, y: q.y, width: q.width, height: q.height };
    }),
    sentences: document.querySelectorAll('.wcard h1, .wcard p').length,
    text: card.innerText,
  };
});
const middle = (b: Rect): number => b.y + b.height / 2;

test('the package carries a mark, two ways in and a die marking -- in that order, and no sentence', async () => {
  const r = await launch();
  const { page } = r;
  try {
    await settle(page);
    const m = await cardLayout(page);
    // Nothing explains the program on the package any more.
    expect(m.sentences, 'a heading or a paragraph is back on the package').toBe(0);
    expect(m.text.replace(/\s+/g, ' ').trim()).toBe('Hallym MIPS Simulator 튜토리얼 보기 바로 시작 MIPS32');
    expect(m.stack).toEqual(['wlogo', 'wbody', 'die']);
    // The mark and the product's name: one line, centred on each other, 10 px apart.
    expect(Math.abs(middle(m.logo) - middle(m.wordmark)),
      `the mark at ${middle(m.logo).toFixed(2)}, the name at ${middle(m.wordmark).toFixed(2)}`).toBeLessThanOrEqual(0.5);
    expect(m.wordmark.x - (m.logo.x + m.logo.width)).toBeCloseTo(10, 0);
    expect(m.logo.height).toBeCloseTo(26, 0);
    expect(m.wordmarkText).toBe('Hallym MIPS Simulator');
    // The two ways in: 44 px tall, 10 px apart, at 70 % of the die frame --
    // short of its edge, which is what makes them read as marking.
    expect(m.buttons.length).toBe(2);
    for (const b of m.buttons) expect(b.height).toBeCloseTo(44, 0);
    expect(m.buttons[1].y - (m.buttons[0].y + m.buttons[0].height)).toBeCloseTo(10, 0);
    const share = m.buttons[0].width / m.die.width;
    const said = `the buttons at ${(share * 100).toFixed(2)} % of the die frame`;
    expect(share, said).toBeGreaterThanOrEqual(0.68);
    expect(share, said).toBeLessThanOrEqual(0.72);
    // The die marking is last: below both of them, and last in the column.
    expect(m.stack[m.stack.length - 1]).toBe('die');
    expect(m.block.body.y, 'the two ways in are not under the mark').toBeGreaterThanOrEqual(m.block.logo.y + m.block.logo.height);
    expect(m.block.mark.y, 'the die marking is not at the foot').toBeGreaterThanOrEqual(m.block.body.y + m.block.body.height);
    expect(m.markText).toBe('MIPS32');
    // The two gaps the column is built on.
    expect(m.block.body.y - (m.block.logo.y + m.block.logo.height)).toBeCloseTo(44, 0);
    expect(m.block.mark.y - (m.block.body.y + m.block.body.height)).toBeCloseTo(40, 0);
    console.log(`package ${m.card.width.toFixed(2)}x${m.card.height.toFixed(2)}, die frame ${m.die.width.toFixed(2)}, ${said}`);
  } finally { await r.close(); }
});

test('the package stays square and its column keeps inside the die frame, at four window sizes', async () => {
  const r = await launch({ width: 1280, height: 800 });
  const { page } = r;
  try {
    await settle(page);
    for (const [w, h] of [[1280, 800], [1920, 1080], [1920, 540], [1024, 768]] as [number, number][]) {
      await resize(r, w, h);
      await page.waitForTimeout(400);
      const m = await cardLayout(page);
      const top = m.block.logo.y, foot = m.block.mark.y + m.block.mark.height;
      const where = `${w}x${h}: the package ${m.card.width.toFixed(2)}x${m.card.height.toFixed(2)},`
        + ` the column ${top.toFixed(2)}..${foot.toFixed(2)} in the die frame`
        + ` ${m.die.y.toFixed(2)}..${(m.die.y + m.die.height).toFixed(2)}`;
      expect(Math.abs(m.card.width - m.card.height), where).toBeLessThanOrEqual(1);
      expect(top, where).toBeGreaterThanOrEqual(m.die.y);
      expect(foot, where).toBeLessThanOrEqual(m.die.y + m.die.height);
      expect(m.buttons[0].x, where).toBeGreaterThanOrEqual(m.die.x);
      expect(m.wordmark.x + m.wordmark.width, where).toBeLessThanOrEqual(m.die.x + m.die.width);
      console.log(where);
    }
  } finally { await r.close(); }
});

/* A window left open all afternoon is the case this has to be right for.
   The layer above the board goes on drawing, so the screen is never a
   photograph; the board below is drawn while it grows and once more when it
   has, and after that not at all.  That is what makes the one affordable:
   the frames keep coming, but each of them is a handful of strokes. */
test('a settled board goes on moving, and the board below it is never drawn again', async () => {
  const r = await launch();
  const { page } = r;
  try {
    const ms = await grown(page);
    const before = await page.evaluate(() => (window as unknown as {
      __startfield: { boardDraws(): number; frames(): number } }).__startfield.boardDraws());
    const framesBefore = await framesDrawn(page);
    await page.waitForTimeout(2000);
    const after = await page.evaluate(() => (window as unknown as {
      __startfield: { boardDraws(): number } }).__startfield.boardDraws());
    expect(after - before, 'the board below was drawn again after it had grown').toBe(0);
    expect(await framesDrawn(page) - framesBefore,
      'the layer above stopped: a settled board is a photograph').toBeGreaterThan(60);
    console.log(`grown at ${(ms / 1000).toFixed(2)} s, ${before} draws of the board below, 0 after`);
  } finally { await r.close(); }
});

/* The budget is the work in the frame, not the gap between frames: a window
   that keeps up draws every 16.7 ms whatever it is drawing, so a median gap
   under 8 ms is not something a 60 Hz screen can show.  The gaps are
   reported too -- they are what says no frame was missed. */
test('what a frame costs: growing under 8/16 ms, settled under 5/12 ms', async () => {
  const r = await launch();
  const { page } = r;
  try {
    const ms = await grown(page);
    await page.waitForTimeout(2500);
    const got = await page.evaluate(({ ms }) => {
      const h = (window as unknown as {
        __startfield: { work(): number[]; deltas(): number[]; times(): number[] } }).__startfield;
      const times = h.times(), work = h.work(), deltas = h.deltas();
      const part = (lo: number, hi: number) => {
        const w: number[] = [], d: number[] = [];
        for (let i = 0; i < times.length; i++) {
          if (times[i] < lo || times[i] >= hi) continue;
          w.push(work[i]);
          if (deltas[i] > 0) d.push(deltas[i]);
        }
        return { work: w.sort((a, b) => a - b), gaps: d.sort((a, b) => a - b) };
      };
      return { growth: part(0, ms), idle: part(ms, Infinity) };
    }, { ms });
    const q = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.floor(xs.length * p))];
    for (const [name, part, median, p99] of [
      ['growing', got.growth, 8, 16], ['settled', got.idle, 5, 12]] as const) {
      expect(part.work.length, `${name}: frames measured`).toBeGreaterThan(20);
      console.log(`${name}: drawing median ${q(part.work, 0.5).toFixed(2)} ms, p99 ${q(part.work, 0.99).toFixed(2)} ms`
        + ` over ${part.work.length} frames; gaps median ${q(part.gaps, 0.5).toFixed(1)} ms, p99 ${q(part.gaps, 0.99).toFixed(1)} ms`);
      expect(q(part.work, 0.5), `${name}: the median frame`).toBeLessThan(median);
      expect(q(part.work, 0.99), `${name}: the worst hundredth`).toBeLessThan(p99);
    }
  } finally { await r.close(); }
});

/* The board, measured off its own pixels at the window it was tuned at.
   Five things at once because they come from one sweep of the clock, which
   takes a while: how bright it ends up, when each pixel of it lit, whether
   that spread outwards from the chip, how many lines a scanline crosses --
   and that a settled board is still moving.

   The density is here to catch the obvious wrong answer to "it is too dark":
   more traces.  Brightness belongs in the alphas, the haze and the flares;
   the number of lines is already what it should be. */
test('the board at 1920x1080: bright enough, spread out in time, and no more lines than before', async () => {
  const r = await launch(MEASURE_AT);
  const { page } = r;
  try {
    const ms = await grown(page);
    const m = await page.evaluate(measureBoard, { step: 150, grown: ms });
    const show = (name: string, v: number, [lo, hi]: readonly number[], unit = '', dp = 2): void => {
      console.log(`  ${name.padEnd(18)} ${v.toFixed(dp)}${unit}   (${lo}..${hi === Infinity ? '' : hi})`);
    };
    console.log(`board region ${m.board.width}x${m.board.height}, ${m.board.pixels} px, grown at ${(ms / 1000).toFixed(2)} s`);
    show('mean', m.hist.mean, BANDS.mean);
    show('near-black 0-20', m.hist.nearBlack, BANDS.nearBlack, ' %');
    show('visible 45+', m.hist.visible, BANDS.visible, ' %');
    show('bright 160+', m.hist.bright, BANDS.bright, ' %');
    show('near-white 220+', m.hist.nearWhite, BANDS.nearWhite, ' %');
    for (const k of ['p10', 'p50', 'p90', 'p99', 'spread'] as const) show(k, m.timing[k], TIMING[k], ' ms');
    console.log(`  rings 90 %         ${m.timing.rings.map((v) => (v / 1000).toFixed(2)).join(' / ')} s`);
    show('rings far-near', m.timing.rings[4] - m.timing.rings[0], TIMING.rings, ' ms');
    show('density', m.density, DENSITY, ' /1000 px');
    show('idle motion', m.idleMotion, IDLE_MOTION, '', 4);

    const band = (name: string, v: number, [lo, hi]: readonly number[]): void => {
      expect(v, `${name}: ${v.toFixed(2)}`).toBeGreaterThanOrEqual(lo);
      expect(v, `${name}: ${v.toFixed(2)}`).toBeLessThanOrEqual(hi);
    };
    band('mean brightness', m.hist.mean, BANDS.mean);
    band('near-black', m.hist.nearBlack, BANDS.nearBlack);
    band('visible', m.hist.visible, BANDS.visible);
    band('bright', m.hist.bright, BANDS.bright);
    band('near-white', m.hist.nearWhite, BANDS.nearWhite);
    for (const k of ['p10', 'p50', 'p90', 'p99', 'spread'] as const) band(k, m.timing[k], TIMING[k]);
    band('the rings, farthest against nearest', m.timing.rings[4] - m.timing.rings[0], TIMING.rings);
    band('lines a scanline crosses', m.density, DENSITY);
    band('what still moves once it has settled', m.idleMotion, IDLE_MOTION);
  } finally { await r.close(); }
});

test('the buttons work from the start, and the second step keeps the same board', async () => {
  const r = await launch();
  const { page } = r;
  try {
    await page.waitForSelector('.startfield canvas');
    const before = await page.evaluate(() => (window as unknown as {
      __startfield: { geometry(): { seed: number; paths: unknown[] } } }).__startfield.geometry());
    await page.getByRole('button', { name: /바로 시작/ }).click();   // the opening is still running
    await expect(page.getByRole('button', { name: /새 파일/ })).toBeVisible();
    await settle(page);
    const after = await page.evaluate(() => (window as unknown as {
      __startfield: { geometry(): { seed: number; paths: unknown[] } } }).__startfield.geometry());
    expect(after.seed).toBe(before.seed);
    expect(after.paths.length).toBe(before.paths.length);   // a step never rebuilds the board
  } finally { await r.close(); }
});

test('prefers-reduced-motion: the settled board at once, and nothing moving', async () => {
  const r = await launch(undefined, { switches: ['--force-prefers-reduced-motion'] });
  const { page } = r;
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await page.waitForSelector('.startfield canvas');
    await page.waitForTimeout(600);
    const counted = await page.evaluate(() => new Promise<number>((done) => {
      let n = 0;
      const real = window.requestAnimationFrame.bind(window);
      (window as unknown as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame = ((cb: FrameRequestCallback) => { n++; return real(cb); }) as typeof requestAnimationFrame;
      setTimeout(() => done(n), 1200);
    }));
    expect(counted).toBe(0);
    // Nothing is animated: not the package's entrance, not the die frame.
    const names = await page.evaluate(() => {
      const card = document.querySelector('.wcard')!;
      return [getComputedStyle(card).animationName, getComputedStyle(card, '::before').animationName];
    });
    expect(names).toEqual(['none', 'none']);
  } finally { await r.close(); }
});

test('nothing of the board once a file is open, and it is back with the first screen', async () => {
  const r = await launch();
  const { page } = r;
  try {
    await settle(page);
    await page.getByRole('button', { name: /바로 시작/ }).click();
    await page.getByRole('button', { name: /새 파일/ }).click();
    await expect(page.locator('.stage-welcome')).toBeHidden();
    // The app draws its own things under the Editor; what must stop is the board.
    const before = await framesDrawn(page);
    await page.waitForTimeout(1000);
    expect(await framesDrawn(page), 'the board must not draw under the Editor').toBe(before);
  } finally { await r.close(); }
});

test('the board follows the window: resized, the pins are on the card again', async () => {
  const r = await launch({ width: 1280, height: 800 });
  const { page } = r;
  try {
    await settle(page);
    const first = await page.evaluate(() => (window as unknown as {
      __startfield: { geometry(): { width: number; card: { x: number } } } }).__startfield.geometry());
    await resize(r, 1024, 768);
    await page.waitForTimeout(900);          // the field is laid out again once the size is quiet
    const g = await page.evaluate(() => (window as unknown as { __startfield: { geometry(): {
      width: number; card: { x: number; y: number; width: number; height: number };
      pins: { side: string; at: { x: number; y: number } }[];
    } } }).__startfield.geometry());
    expect(g.width).toBeLessThan(first.width);
    const box = (await page.locator('.wcard').boundingBox())!;
    const host = (await page.locator('.startfield').boundingBox())!;
    // A processor is square, and the board is laid out around that square.
    expect(Math.abs(box.width - box.height),
      `the package is ${Math.round(box.width)}x${Math.round(box.height)}`).toBeLessThanOrEqual(1);
    expect(Math.abs(g.card.x - (box.x - host.x))).toBeLessThanOrEqual(1);
    for (const pin of g.pins.filter((p) => p.side === 'top')) expect(pin.at.y).toBe(g.card.y);
  } finally { await r.close(); }
});

async function resize(r: Running, width: number, height: number): Promise<void> {
  await r.app.evaluate(({ BrowserWindow }, s) => {
    BrowserWindow.getAllWindows()[0].setBounds({ width: s.width, height: s.height });
  }, { width, height });
}
