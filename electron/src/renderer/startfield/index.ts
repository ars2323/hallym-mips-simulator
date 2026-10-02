/* The first screen's circuit board.  The only surface a caller uses:

     const field = startfield({ seed: 20261002, chipLabel: 'MIPS32' });
     container.append(field.root, card);   // the card carries data-startfield-chip
     field.show(true);

   Two parameters, and no import of anything outside this folder, so the
   folder can be copied whole into another simulator: there the call becomes
   chipLabel: 'RV32I' with its own seed and nothing else changes.  The chip
   is found by the attribute, not passed in, which keeps it at two.

   The card is the chip.  Its rectangle is measured on screen and the pins
   are placed on it, so there is never a second drawn square under a floating
   card for the two to disagree about.

   What this file owns: the two canvases, the clock, and which layer is drawn
   when.  The opening runs on delta time -- adding a constant per frame would
   make it 2.8 s at 60 Hz and 1.2 s at 144 Hz.  The board below is drawn
   while it grows and once more when it has, and then not again however long
   the window is left open; the layer above it is cleared and drawn every
   frame, with at most a handful of things on it.  That is the whole cost of
   a settled board.

   Nothing is animated in CSS that does not end.  The one thing on the card
   that keeps moving -- the die frame's slow breath -- is driven from here,
   as --sf-die on the chip, because a CSS animation that never ends is one
   the capture tool cannot photograph (it freezes them) and one the window
   keeps a compositor thread awake for. */

import { generate, type Geometry } from './generate.ts';
import glintsCss from './glints.css';
import { dieAlpha, drawBoard, drawPulse } from './render.ts';

export interface Startfield {
  root: HTMLElement;
  show(on: boolean): void;
  destroy(): void;
}

export const CHIP_ATTR = 'data-startfield-chip';
const STYLE_ID = 'startfield-css';
const RESIZE_SETTLE = 180; // ms of quiet before the field is laid out again

/* Only on a window that is being driven (navigator.webdriver): the capture
   tool needs to put the opening at an exact time, and the tests need the
   frame deltas and the geometry.  A student's window has none of it. */
interface TestHook {
  stepTo(ms: number): void;
  geometry(): Geometry;
  /** When the board has finished growing, in ms. */
  grown(): number;
  frames(): number;
  /** How many times the board below has been drawn.  After it has grown
      this must stop going up. */
  boardDraws(): number;
  /** Time spent drawing, per frame, in ms. */
  work(): number[];
  /** Time between one animation frame and the next, in ms. */
  deltas(): number[];
  /** The moment of the opening each frame was drawn at, in ms. */
  times(): number[];
}
declare global {
  interface Window { __startfield?: TestHook }
}

export function startfield(options: { seed: number; chipLabel: string }): Startfield {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = glintsCss;
    document.head.append(style);
  }
  const board = document.createElement('canvas');
  const pulse = document.createElement('canvas');
  board.className = 'sf-board';
  pulse.className = 'sf-pulse';
  const root = document.createElement('div');
  root.className = 'startfield';
  root.setAttribute('aria-hidden', 'true');
  root.append(board, pulse);

  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let geo: Geometry | undefined;
  let raf = 0, started = 0, shown = false, frames = 0, boardDraws = 0;
  let drawnAt = -1;                      // the moment the board below holds
  let resizeTimer = 0, lastFrame = 0;
  const deltas: number[] = [];
  const work: number[] = [];
  const times: number[] = [];

  const chip = (): HTMLElement | null =>
    (root.parentElement?.querySelector(`[${CHIP_ATTR}]`) as HTMLElement | null) ?? null;

  /* One frame of the whole screen at `t`.  The board below is redrawn only
     while it is still growing -- or if the clock has gone backwards, which
     is what the capture tool does between takes. */
  const paint = (t: number): void => {
    if (!geo) return;
    const lower = board.getContext('2d');
    const upper = pulse.getContext('2d');
    if (!lower || !upper) return;
    frames++;
    times.push(t);
    const began = performance.now();
    if (drawnAt < geo.grownMs || t < drawnAt) {
      drawBoard(lower, geo, Math.min(t, geo.grownMs));
      drawnAt = Math.min(t, geo.grownMs);
      boardDraws++;
    }
    drawPulse(upper, geo, t);
    work.push(performance.now() - began);
    chip()?.style.setProperty('--sf-die', dieAlpha(t).toFixed(3));
  };

  /* Measures the card and lays the field out again.  Done after the fonts
     are ready: measured before they load, the card is a different size and
     the pins miss its edges. */
  const build = (): void => {
    const el = chip();
    if (!el) return;
    /* The card's settled rectangle.  getBoundingClientRect() alone would be
       measured through its entrance transform (0.96 -> 1, glints.css) and
       the pins would end up on a card three pixels narrower than the one
       that is finally there.  The scale is about the centre, which the
       transform leaves where it is, so the centre comes from the rect and
       the size from the layout box. */
    const r = el.getBoundingClientRect();
    const box = { width: el.offsetWidth, height: el.offsetHeight,
                  x: r.x + r.width / 2 - el.offsetWidth / 2, y: r.y + r.height / 2 - el.offsetHeight / 2 };
    const host = root.getBoundingClientRect();
    const width = Math.max(320, Math.round(host.width));
    const height = Math.max(240, Math.round(host.height));
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    for (const c of [board, pulse]) {
      c.width = Math.round(width * dpr);
      c.height = Math.round(height * dpr);
    }
    geo = generate({
      seed: options.seed, width, height, dpr, chipLabel: options.chipLabel,
      card: { x: Math.round(box.x - host.x), y: Math.round(box.y - host.y), width: Math.round(box.width), height: Math.round(box.height) },
    });
    drawnAt = -1;
    if (reduce.matches) paint(geo.grownMs); else run();
  };

  const stop = (): void => { if (raf) cancelAnimationFrame(raf); raf = 0; };

  const frame = (now: number): void => {
    if (!started) { started = now; deltas.push(0); } else deltas.push(now - lastFrame);
    lastFrame = now;
    paint(now - started);               // delta time, never a per-frame constant
    raf = requestAnimationFrame(frame); // the board below stops; this layer does not
  };

  const run = (): void => {
    stop();
    if (!geo) return;
    if (reduce.matches) { paint(geo.grownMs); return; }
    started = 0;
    raf = requestAnimationFrame(frame);
  };

  const observer = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => { if (shown) build(); }, RESIZE_SETTLE);
  });

  const onReduce = (): void => { if (shown) build(); };
  reduce.addEventListener('change', onReduce);

  let ready = false;
  const start = (): void => {
    if (ready) { build(); return; }
    // The fonts first, then one frame, so the card is at its final size.
    void document.fonts.ready.then(() => requestAnimationFrame(() => {
      ready = true;
      if (!shown) return;
      const el = chip();
      if (el) observer.observe(el);
      observer.observe(root);
      build();
    }));
  };

  if (typeof window !== 'undefined' && navigator.webdriver) {
    window.__startfield = {
      stepTo(ms: number) {
        stop();
        paint(Math.max(0, ms));
        /* The CSS parts that do end are put at the same moment: a negative
           delay moves an animation to that point and pausing it keeps it
           there, so a captured frame is the whole screen at t, not the
           canvases at t over CSS wherever it happened to be.  What never
           ends is on the canvases, where the same clock drives it. */
        const sec = `${-ms / 1000}s`;
        const card = chip();
        if (card) {
          for (const el of [card, ...card.querySelectorAll<HTMLElement>('.actions, .back')]) {
            el.style.animationDelay = sec;
            el.style.animationPlayState = 'paused';
          }
        }
      },
      geometry: () => geo!,
      grown: () => geo?.grownMs ?? 0,
      frames: () => frames,
      boardDraws: () => boardDraws,
      work: () => work.slice(),
      deltas: () => deltas.slice(),
      times: () => times.slice(),
    };
  }

  return {
    root,
    show(on: boolean) {
      if (on === shown) return;
      shown = on;
      root.parentElement?.classList.toggle('startfield-on', on);
      if (on) start(); else { stop(); observer.disconnect(); }
    },
    destroy() {
      stop();
      observer.disconnect();
      reduce.removeEventListener('change', onReduce);
      if (window.__startfield) delete window.__startfield;
    },
  };
}
