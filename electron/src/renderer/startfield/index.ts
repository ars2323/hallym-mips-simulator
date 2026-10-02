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

   What this file owns: the canvas, the clock, and when to stop.  The opening
   runs on delta time -- adding a constant per frame would make it 2.8 s at
   60 Hz and 1.2 s at 144 Hz -- and once it is over the loop ends and only
   glints.css is left moving. */

import { generate, type Geometry } from './generate.ts';
import glintsCss from './glints.css';
import { draw, SETTLED } from './render.ts';

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
  frames(): number;
  /** Time spent drawing, per frame, in ms. */
  work(): number[];
  /** Time between one animation frame and the next, in ms. */
  deltas(): number[];
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
  const canvas = document.createElement('canvas');
  const root = document.createElement('div');
  root.className = 'startfield';
  root.setAttribute('aria-hidden', 'true');
  root.append(canvas);

  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let geo: Geometry | undefined;
  let raf = 0, started = 0, shown = false, settled = false, frames = 0;
  let resizeTimer = 0, lastFrame = 0;
  const deltas: number[] = [];
  const work: number[] = [];

  const chip = (): HTMLElement | null =>
    (root.parentElement?.querySelector(`[${CHIP_ATTR}]`) as HTMLElement | null) ?? null;

  const paint = (t: number): void => {
    if (!geo) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    frames++;
    const began = performance.now();
    draw(ctx, geo, t);
    work.push(performance.now() - began);
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
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    geo = generate({
      seed: options.seed, width, height, dpr, chipLabel: options.chipLabel,
      card: { x: Math.round(box.x - host.x), y: Math.round(box.y - host.y), width: Math.round(box.width), height: Math.round(box.height) },
    });
    if (settled || reduce.matches) paint(SETTLED); else run();
  };

  const stop = (): void => { if (raf) cancelAnimationFrame(raf); raf = 0; };

  const frame = (now: number): void => {
    if (!started) started = now;
    else deltas.push(now - lastFrame);
    lastFrame = now;
    const t = now - started;               // delta time, never a per-frame constant
    paint(Math.min(t, SETTLED));
    if (t >= SETTLED) { settled = true; raf = 0; return; }   // the loop ends here
    raf = requestAnimationFrame(frame);
  };

  const run = (): void => {
    stop();
    if (reduce.matches) { settled = true; paint(SETTLED); return; }
    started = 0;
    settled = false;
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
        settled = ms >= SETTLED;
        paint(Math.min(Math.max(0, ms), SETTLED));
        // The CSS parts are put at the same moment: a negative delay moves
        // an animation to that point and pausing it keeps it there, so a
        // captured frame is the whole screen at t, not the canvas at t over
        // CSS wherever it happened to be.
        const sec = `${-ms / 1000}s`;
        const card = chip();
        if (card) {
          for (const el of [card, ...card.querySelectorAll<HTMLElement>('.actions, .back, .die')]) {
            el.style.animationDelay = sec;
            el.style.animationPlayState = 'paused';
          }
          // The die frame is a pseudo-element: an inline style cannot reach
          // it, so its phase comes from these.
          card.style.setProperty('--sf-delay', sec);
          card.style.setProperty('--sf-play', 'paused');
        }
      },
      geometry: () => geo!,
      frames: () => frames,
      work: () => work.slice(),
      deltas: () => deltas.slice(),
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
