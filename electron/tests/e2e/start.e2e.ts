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

import { offsets, peakAt, SEED, SPARK_ORDER, SPARKS, SWEEP_MS } from '../../src/renderer/app/panels/spark.ts';
import { COLOURS } from '../../src/renderer/startfield/render.ts';
import { BANDS, IDLE_MOTION, measureBoard, TIMING } from './board-measure.ts';
import { launch, type Running } from './harness.ts';
import { decodePng, meanLuminance } from './png.ts';

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
/** A computed colour, laid over `under` when it is not opaque -- the second
    way in is white at 82 %, and taking it for pure white would report a
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

/* Everything the package carries: the product's name, each button's label
   against its own ground, and the way back.  The two buttons are on purpose
   not the same brightness (the hierarchy below), so each is measured
   against the ground it is actually on. */
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
        title: getComputedStyle(document.querySelector('.wcard .wtitle')!).backgroundImage,
        back: get('.wbody .back'),
        appname: get('.titlebar .appname'), status: get('.status'),
        cardBg: getComputedStyle(document.querySelector('.wcard')!).backgroundColor,
        buttons: [...document.querySelectorAll<HTMLElement>('.action')].map((b) => ({
          label: getComputedStyle(b.querySelector('b')!).color,
          ground: getComputedStyle(b).backgroundColor,
          border: getComputedStyle(b).borderTopColor,
        })),
      };
    });
    expect(parse(colours.cardBg)).toEqual(chip);
    const worst: [string, number][] = [];
    // The product's name is white glyphs on the chip (its fill is a gradient
    // only so that the light can run across it).
    expect(colours.title).toContain('rgb(255, 255, 255)');
    worst.push(['the name', contrast([255, 255, 255], chip)]);
    // Each button's words against that button's own ground, not against the
    // chip: the two grounds are different on purpose.
    for (const [n, b] of colours.buttons.entries()) {
      const ground = parse(b.ground, chip);
      worst.push([`the ${n === 0 ? 'first' : 'second'} way in`, contrast(parse(b.label, ground), ground)]);
    }
    worst.push(['the way back', contrast(parse(colours.back, chip), chip)]);
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

/* What the package carries: the mark, the product's name and the two ways
   in -- one column, centred in the die frame rather than held there by fixed
   padding.  Measured against the die frame, which is .wcard::before: the
   package's border, its inset, and the frame's own line. */
interface Rect { x: number; y: number; width: number; height: number }
interface Card {
  card: Rect; die: Rect; stack: string[];
  logo: Rect; title: Rect; titleText: string;
  block: { logo: Rect; title: Rect; body: Rect };
  buttons: { box: Rect; label: string }[];
  sentences: number; text: string;
}
const cardLayout = (page: Page): Promise<Card> => page.evaluate(() => {
  const box = (sel: string): Rect => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`no ${sel}`);
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  };
  const card = document.querySelector('.wcard') as HTMLElement;
  const r = card.getBoundingClientRect();
  const edge = parseFloat(getComputedStyle(card).borderLeftWidth)
    + parseFloat(getComputedStyle(card, '::before').left)
    + parseFloat(getComputedStyle(card, '::before').borderLeftWidth);
  return {
    card: { x: r.x, y: r.y, width: r.width, height: r.height },
    die: { x: r.x + edge, y: r.y + edge, width: r.width - 2 * edge, height: r.height - 2 * edge },
    stack: [...document.querySelector('.wstack')!.children].map((c) => c.className),
    logo: box('.wstack .wlogo'), title: box('.wcard .wtitle'),
    titleText: document.querySelector('.wcard .wtitle')?.textContent ?? '',
    block: { logo: box('.wstack .wlogo'), title: box('.wcard .wtitle'), body: box('.wbody') },
    buttons: [...document.querySelectorAll<HTMLElement>('.action')].map((b) => {
      const q = b.getBoundingClientRect();
      return { box: { x: q.x, y: q.y, width: q.width, height: q.height }, label: b.querySelector('b')?.textContent ?? '' };
    }),
    sentences: document.querySelectorAll('.wcard h1, .wcard p').length,
    text: card.innerText,
  };
});
const middle = (b: Rect): number => b.x + b.width / 2;

test('the package carries a mark, the name and two ways in -- in that order, and no marking or sentence', async () => {
  const r = await launch();
  const { page } = r;
  try {
    await settle(page);
    const m = await cardLayout(page);
    // Nothing explains the program on the package, and nothing marks the die.
    expect(m.sentences, 'a heading or a paragraph is back on the package').toBe(0);
    expect(m.text.replace(/\s+/g, ' ').trim()).toBe('Hallym MIPS Simulator 바로 시작 튜토리얼 보기');
    expect(m.text, 'the die marking is back').not.toContain('MIPS32');
    expect(await page.locator('.wcard .die').count(), 'the die marking is back').toBe(0);
    expect(m.stack).toEqual(['wlogo', 'wtitle', 'wbody']);
    // The mark: large, and over the name rather than beside it.
    expect(m.logo.height, `the mark is ${m.logo.height.toFixed(1)} px tall`).toBeGreaterThanOrEqual(52);
    expect(m.block.title.y, 'the name is not under the mark').toBeGreaterThanOrEqual(m.logo.y + m.logo.height);
    expect(m.block.title.y - (m.logo.y + m.logo.height)).toBeCloseTo(14, 0);
    expect(m.titleText).toBe('Hallym MIPS Simulator');
    // Both of them down the middle of the package.
    for (const [what, b] of [['the mark', m.logo], ['the name', m.title]] as const) {
      expect(Math.abs(middle(b) - middle(m.card)), `${what} is off centre`).toBeLessThanOrEqual(1);
    }
    // The two ways in: straight to work first, 46 px tall, 12 px apart, at
    // 70 % of the die frame -- short of its edge, which is what makes them
    // read as marking on a package.
    expect(m.buttons.map((b) => b.label)).toEqual(['바로 시작', '튜토리얼 보기']);
    for (const b of m.buttons) expect(b.box.height).toBeCloseTo(46, 0);
    expect(m.buttons[1].box.y - (m.buttons[0].box.y + m.buttons[0].box.height)).toBeCloseTo(12, 0);
    expect(m.buttons[0].box.y - (m.block.title.y + m.block.title.height)).toBeCloseTo(40, 0);
    const share = m.buttons[0].box.width / m.die.width;
    const said = `the buttons at ${(share * 100).toFixed(2)} % of the die frame`;
    expect(share, said).toBeGreaterThanOrEqual(0.68);
    expect(share, said).toBeLessThanOrEqual(0.72);
    console.log(`package ${m.card.width.toFixed(2)}x${m.card.height.toFixed(2)}, die frame ${m.die.width.toFixed(2)},`
      + ` the mark ${m.logo.height.toFixed(1)} px, ${said}`);
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
      const top = m.block.logo.y, foot = m.block.body.y + m.block.body.height;
      const where = `${w}x${h}: the package ${m.card.width.toFixed(2)}x${m.card.height.toFixed(2)},`
        + ` the column ${top.toFixed(2)}..${foot.toFixed(2)} in the die frame`
        + ` ${m.die.y.toFixed(2)}..${(m.die.y + m.die.height).toFixed(2)}`;
      expect(Math.abs(m.card.width - m.card.height), where).toBeLessThanOrEqual(1);
      expect(top, where).toBeGreaterThanOrEqual(m.die.y);
      expect(foot, where).toBeLessThanOrEqual(m.die.y + m.die.height);
      expect(m.buttons[0].box.x, where).toBeGreaterThanOrEqual(m.die.x);
      expect(m.title.x + m.title.width, where).toBeLessThanOrEqual(m.die.x + m.die.width);
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
    show('idle motion', m.idleMotion, IDLE_MOTION, '', 4);
    // How many lines there are is checked on the generator's own output
    // (tests/renderer/startfield.test.ts): counting them off the pixels
    // turned on where a threshold was put, which proved nothing about
    // whether a trace had been added.
    console.log(`  lines crossed      ${m.density.toFixed(2)} /1000 px   (reported, not held to)`);

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
    band('what still moves once it has settled', m.idleMotion, IDLE_MOTION);
  } finally { await r.close(); }
});

/* The hierarchy on the card: the name, then straight to work, then the
   tutorial.  Three axes -- how bright each is at rest, how bright its light
   gets, and how often one comes -- and all three have to run the same way
   round, because one of them on its own is a coincidence.  Measured as the
   mean grey of each element's own box, off a photograph of the window: what
   is on screen, not what the stylesheet says.

   The light's size follows its strength as well as its brightness (app.css),
   so the lifts are further apart than the peaks are; that is what makes the
   order something a measurement can see rather than something only the
   stylesheet knows. */
const LIFT_STEP = 1.6;      // each one's lift against the next one's
/* And a floor under each, about half of what it measures: a ratio alone is
   satisfied by three lights that are all off, which is the one way of
   breaking this that would look worst. */
const LIFT_LEAST = { title: 4.0, primary: 1.2, secondary: 0.4 } as const;

test('the card reads in one order: the name, then straight to work, then the tutorial', async () => {
  const r = await launch(MEASURE_AT);
  const { page } = r;
  try {
    await grown(page);
    const phase = offsets(SEED);
    const boxes = await page.evaluate(() => {
      const pick = (s: string, n = 0) => document.querySelectorAll<HTMLElement>(s)[n];
      const at = (e: HTMLElement) => {
        const b = e.getBoundingClientRect();
        return { x: Math.round(b.x) - 3, y: Math.round(b.y) - 3, width: Math.round(b.width) + 6, height: Math.round(b.height) + 6 };
      };
      return { title: at(pick('.wtitle')), primary: at(pick('.action', 0)), secondary: at(pick('.action', 1)) };
    });
    const step = async (ms: number): Promise<void> => {
      await page.evaluate((ms) => (window as unknown as {
        __startfield: { stepTo(ms: number): void } }).__startfield.stepTo(ms), ms);
      await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
      await page.waitForTimeout(20);
    };
    const grey = async (which: keyof typeof boxes): Promise<number> =>
      meanLuminance(decodePng(await page.screenshot({ clip: boxes[which], animations: 'disabled' })));

    // A moment when none of the three has a light passing.
    const settled = 11000;
    let quiet = settled;
    for (let t = settled; t < settled + 20000; t += 10) {
      if (!SPARK_ORDER.some((k) => (((t - phase[k]) % SPARKS[k].periodMs) + SPARKS[k].periodMs) % SPARKS[k].periodMs < SWEEP_MS)) { quiet = t; break; }
    }
    await step(quiet);
    const rest = { title: await grey('title'), primary: await grey('primary'), secondary: await grey('secondary') };
    const peak = {} as Record<keyof typeof boxes, number>;
    for (const k of SPARK_ORDER) { await step(peakAt(k, phase[k], settled)); peak[k] = await grey(k); }
    const lift = { title: peak.title - rest.title, primary: peak.primary - rest.primary, secondary: peak.secondary - rest.secondary };
    const show = (name: string, v: Record<string, number>) => `${name} ${SPARK_ORDER.map((k) => `${k} ${v[k].toFixed(2)}`).join(', ')}`
      + ` (steps ${(v.title - v.primary).toFixed(2)}, ${(v.primary - v.secondary).toFixed(2)})`;
    console.log(show('rest ', rest));
    console.log(show('peak ', peak));
    console.log(show('lift ', lift));

    // Axis 1 and axis 2: both orders, with a step a measurement can see.
    for (const [name, v] of [['at rest', rest], ['at the top of its light', peak]] as const) {
      expect(v.title - v.primary, `${name}: the name against the first way in`).toBeGreaterThan(2);
      expect(v.primary - v.secondary, `${name}: the first way in against the second`).toBeGreaterThan(2);
    }
    // Axis 2 again, as how much each one's light lifts it: with every peak
    // the same the two buttons' lifts come together, which the step catches.
    for (const k of SPARK_ORDER) {
      expect(lift[k], `${k}: its light lifts it ${lift[k].toFixed(2)}, which is not a light`).toBeGreaterThan(LIFT_LEAST[k]);
    }
    expect(lift.title).toBeGreaterThan(LIFT_STEP * lift.primary);
    expect(lift.primary).toBeGreaterThan(LIFT_STEP * lift.secondary);
    // Axis 3: how often.  Settled in spark.ts, and checked there as well.
    expect(SPARKS.title.periodMs).toBeLessThan(SPARKS.primary.periodMs);
    expect(SPARKS.primary.periodMs).toBeLessThan(SPARKS.secondary.periodMs);
  } finally { await r.close(); }
});

/* Off the first screen, nothing of it is left.  The board's layer above
   never stops while the screen is up, so if it survived the screen it would
   go on costing a lab PC for the rest of the lesson. */
test('leaving the first screen takes the board with it, and coming back brings it up again', async () => {
  const r = await launch();
  const { page } = r;
  try {
    await settle(page);
    expect(await page.locator('.startfield canvas').count()).toBe(2);
    await page.getByRole('button', { name: /바로 시작/ }).click();
    await page.getByRole('button', { name: /새 파일/ }).click();
    await expect(page.locator('.editor-panel')).toBeVisible();
    await page.waitForTimeout(400);
    // Not one animation frame asked for in a second of the Editor.
    const counted = await page.evaluate(() => new Promise<number>((done) => {
      let n = 0;
      const real = window.requestAnimationFrame.bind(window);
      (window as unknown as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame =
        ((cb: FrameRequestCallback) => { n++; return real(cb); }) as typeof requestAnimationFrame;
      setTimeout(() => done(n), 1000);
    }));
    expect(counted, 'animation frames asked for in 1 s of the Editor').toBe(0);
    // And nothing of it left in the document.
    const after = await page.evaluate(() => ({
      canvases: document.querySelectorAll('.startfield canvas').length,
      geometry: (window as unknown as { __startfield: { geometry(): unknown } }).__startfield.geometry() === undefined,
      die: (document.querySelector('.wcard') as HTMLElement | null)?.style.getPropertyValue('--sf-die') ?? '',
      amp: (document.querySelector('.wtitle') as HTMLElement | null)?.style.getPropertyValue('--sp-amp') ?? '',
    }));
    expect(after.canvases, 'the canvases are still in the document').toBe(0);
    expect(after.geometry, 'the board is still held').toBe(true);
    expect(after.die, 'the die frame is still being set').toBe('');
    expect(after.amp, 'the card is still being lit').toBe('');

  } finally { await r.close(); }
});

/* There is a way back: the tutorial started from the first screen, then
   quit, leaves no file open and the first screen returns.  It has to come up
   again, and with one loop running, not two. */
test('back from the tutorial: the board is up again, and running once', async () => {
  const r = await launch();
  const { page } = r;
  try {
    await settle(page);
    await page.getByRole('button', { name: /튜토리얼 보기/ }).click();
    await expect(page.locator('.tut-card')).toBeVisible();
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.locator('dialog.ask').getByRole('button', { name: '그만두기' }).click();
    await expect(page.locator('.wcard')).toBeVisible();
    await settle(page);
    expect(await page.locator('.startfield canvas').count(), 'the canvases did not come back').toBe(2);
    // One loop, not two: a second would draw twice as many frames a second.
    const a = await framesDrawn(page);
    await page.waitForTimeout(1000);
    const drawn = await framesDrawn(page) - a;
    console.log(`${drawn} frames in a second after coming back`);
    expect(drawn, 'the board is not drawing again').toBeGreaterThan(20);
    expect(drawn, 'two loops are running').toBeLessThan(90);
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
    // Nothing is animated: not the package's entrance, not its die frame,
    // not the buttons' border, not the light across the name.
    const still = await page.evaluate(() => {
      const card = document.querySelector('.wcard') as HTMLElement;
      const title = document.querySelector('.wtitle') as HTMLElement;
      const button = document.querySelector('.action') as HTMLElement;
      const names = [card, title, button].flatMap((el) =>
        [getComputedStyle(el).animationName, getComputedStyle(el, '::after').animationName,
         getComputedStyle(el, '::before').animationName]);
      return {
        names: [...new Set(names)],
        // And nothing of the card's light is being set, so nothing of it moves.
        amps: [title, button].map((el) => el.style.getPropertyValue('--sp-amp')),
      };
    });
    expect(still.names, 'something on the card is animated').toEqual(['none']);
    expect(still.amps.every((v) => v === '' || Number(v) === 0),
      `the card's light is running: ${still.amps.join(', ')}`).toBe(true);
    // The board is there in full, drawn once.
    const drawn = await page.evaluate(() => (window as unknown as {
      __startfield: { boardDraws(): number; frames(): number } }).__startfield.boardDraws());
    expect(drawn, 'the board was drawn more than once with motion turned down').toBeLessThanOrEqual(2);
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
