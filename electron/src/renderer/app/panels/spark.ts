/* The signal that runs on from the board into the card: a light that goes
   round a button's border, and one that runs across the product's name.

   Pure arithmetic -- what each of the three is doing at a moment -- so the
   order they are meant to be in can be checked without a window
   (tests/renderer/spark.test.ts).  welcome.ts puts the result on the
   elements as custom properties and the CSS draws it; nothing here touches
   the DOM.

   Two things decided here rather than in CSS, and for the same reason in
   both cases: a CSS animation that loops cannot be photographed (the
   capture tool freezes animations to take a frame) and keeps a compositor
   thread awake for as long as the window is open.  So the phase comes from
   the board's own clock, and the moments come from the board's own seed --
   which is also what makes the card look like part of the board rather than
   like a dialog sitting on it. */

import { rng } from '../../startfield/generate.ts';

/** The board's seed.  It lives here rather than in welcome.ts because what
    is derived from it is here, and because this file pulls in no CSS, so a
    test can read it without a bundler. */
export const SEED = 20261002;

/** What each of the three carries, in the order the eye should read them.
    All three axes run the same way round -- how bright it is at rest, how
    bright its pulse gets, and how often one comes -- because one axis on its
    own is not a hierarchy, it is a coincidence. */
export const SPARKS = {
  title: { periodMs: 3500, peak: 1.0 },
  primary: { periodMs: 5000, peak: 0.85 },
  secondary: { periodMs: 8000, peak: 0.55 },
} as const;
export type SparkName = keyof typeof SPARKS;
export const SPARK_ORDER: SparkName[] = ['title', 'primary', 'secondary'];

/** How long one pass takes: the light crosses the name, or goes once round
    a border, in this, and then nothing until the next one is due. */
export const SWEEP_MS = 900;

export interface Spark {
  /** 0 when nothing is passing, up to the element's peak in the middle. */
  amp: number;
  /** How far the pass has got, 0..1.  Meaningless while amp is 0. */
  at: number;
}

/** Where each one starts in its period.  From the board's seed, so the card
    and the board are two parts of one thing. */
export function offsets(seed: number): Record<SparkName, number> {
  const rand = rng(seed ^ 0x5eed);
  const out = {} as Record<SparkName, number>;
  for (const name of SPARK_ORDER) out[name] = rand() * SPARKS[name].periodMs;
  return out;
}

/** What `name` is doing at `t` ms of the opening. */
export function sparkAt(name: SparkName, t: number, offsetMs: number): Spark {
  const { periodMs, peak } = SPARKS[name];
  if (t < 0) return { amp: 0, at: 0 };
  const since = (((t - offsetMs) % periodMs) + periodMs) % periodMs;
  if (since >= SWEEP_MS) return { amp: 0, at: 0 };
  const at = since / SWEEP_MS;
  // Up and down over the pass, so nothing switches on or off at an edge.
  return { amp: peak * Math.sin(Math.PI * at), at };
}

/** The highest `amp` ever reaches, and when it does: the moment to measure
    an element's pulse at. */
export const peakAt = (name: SparkName, offsetMs: number, after: number): number => {
  const { periodMs } = SPARKS[name];
  const first = offsetMs + SWEEP_MS / 2;
  const n = Math.ceil((after - first) / periodMs);
  return first + Math.max(0, n) * periodMs;
};
