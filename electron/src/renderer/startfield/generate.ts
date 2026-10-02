/* The first screen's circuit board: where every line, pad and bright point
   goes.  A pure function -- no DOM, no timers, no randomness of its own --
   so it can be checked with `node --test` and its output hashed as a golden
   (tests/renderer/startfield.test.ts).  render.ts draws what this returns.

   What makes it read as a board rather than as scattered lines:

   1. Thin lines, wide apart.  The look lives in the ratio of line width to
      grid pitch, not in either number: 1 to 1.5 px on a 22 px pitch is about
      1:15, and at 1:8 the same drawing reads as ribbons.
   2. Every vertex on the grid; segments level, upright or exactly 45 deg.
      A right angle is cut by a straight 6 px chamfer (drawn()), never
      rounded -- a rounded corner is what turns a board into a ribbon.
   3. Traces leave the chip's pins, and the pins sit on the card's measured
      rectangle: the card is the chip (index.ts), so there is no second drawn
      square for the two to disagree about.  The corners of each edge are
      left bare, as a package has them.
   4. Self-avoiding: two traces never cross and never touch.  That is the
      rule a single-sided board obeys.
   5. Three depths, by width and brightness together (LAYERS), and far more
      pads than traces -- most of them joined to nothing.  The small dots are
      half of the texture; without them the field looks empty however many
      lines are in it.

   Lengths, not segment counts, drive the timing: a path's duration is its
   length over one speed, so a signal moves at the same rate everywhere. */

export type Layer = 0 | 1 | 2; // 0 far, 1 mid, 2 near
export type Side = 'top' | 'right' | 'bottom' | 'left';

export interface Pt { x: number; y: number }
export interface Rect { x: number; y: number; width: number; height: number }

export interface Pin {
  side: Side;
  /** On the card's edge. */
  at: Pt;
  /** The pin's outer end, where its trace starts. */
  tip: Pt;
}

export interface Path {
  id: number;
  layer: Layer;
  /** A tenth of the near ones are brighter again and carry a flare. */
  bright: boolean;
  from: 'pin' | 'seed' | 'branch';
  parent?: number;
  /** Grid vertices, in order.  drawn() turns them into the polyline. */
  points: Pt[];
  length: number;
  delayMs: number;
  durationMs: number;
}

export interface Pad {
  at: Pt;
  /** 1.5 (drawn filled) or 3 (drawn as a ring). */
  r: number;
  layer: Layer;
  /** Where a trace ends, where one branches, or joined to nothing at all
      (most of them: the small dots are half of the texture). */
  kind: 'end' | 'branch' | 'floating';
}

export interface Flare {
  at: Pt;
  /** Radius of the soft halo, in px. */
  halo: number;
  /** How bright the halo's middle is, 0..1. */
  strength: number;
  /** The long thin streak: level, or at 45 deg. */
  streak: 'level' | 'diagonal';
  streakLength: number;
}

export interface Geometry {
  seed: number;
  width: number;
  height: number;
  dpr: number;
  grid: number;
  chamfer: number;
  card: Rect;
  chipLabel: string;
  pins: Pin[];
  paths: Path[];
  pads: Pad[];
  flares: Flare[];
  speed: number;
}

export interface Input {
  seed: number;
  width: number;
  height: number;
  card: Rect;
  dpr: number;
  chipLabel: string;
}

export const GRID = 22;
export const CHAMFER = 6;
/** Width and alpha of each depth, and how much of the board is at it. */
export const LAYERS = [
  { width: 1.0, alpha: 0.10, share: 0.40 },
  { width: 1.5, alpha: 0.22, share: 0.40 },
  { width: 2.0, alpha: 0.55, share: 0.20 },
] as const;
export const BRIGHT = { width: 2.0, alpha: 0.95 } as const;
/** Nothing drawn on this board is wider than this. */
export const MAX_LINE_WIDTH = 2.5;

const DIRS: Pt[] = [
  { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: -1, y: 1 },
  { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
];
const STRAIGHT = 0.6, TURN90 = 0.25;   // the rest (0.15) is 45 deg
const BRANCH_P = 0.10;
const PINS_PER_SIDE = 10;
const PIN_LENGTH = 14;
const PIN_BARE_ENDS = 0.12;            // no pin in the last eighth of an edge
const CARD_KEEP_OUT = 1;
const BRIGHT_SHARE = 0.10;             // of the near layer
const DECOR_AREA = 7000;               // px^2 per decorative trace
/* Which depth a decorative trace goes to.  The chip's own traces are all
   near -- they are the ones the signal runs along -- and their branches sit
   one step back, so these are chosen to bring the whole board to the shares
   in LAYERS rather than to match them by themselves. */
const DECOR_LAYER = [0.70, 0.22] as const;   // far, mid; the rest near
const PAD_AREA = 4500;                 // px^2 per floating pad
const BIG_PAD_SHARE = 0.3;             // r = 3 against r = 1.5
const BRANCH_PAD_P = 0.45;
const FLARES_MIN = 12, FLARES_MAX = 18;
const SPEED_FITS_IN = 640;             // ms for the longest trace

/** mulberry32: a small PRNG, so the board is the same for the same seed. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The polyline as it is drawn: every right angle cut by a straight chamfer.
    Nothing here is an arc -- a rounded corner is what makes a board read as
    a ribbon -- so the result has only 0, 45, 90 and 135 deg turns. */
export function drawn(points: Pt[], chamfer = CHAMFER): Pt[] {
  if (points.length < 3) return points.slice();
  const out: Pt[] = [points[0]];
  for (let k = 1; k < points.length - 1; k++) {
    const a = points[k - 1], b = points[k], c = points[k + 1];
    const inx = b.x - a.x, iny = b.y - a.y, outx = c.x - b.x, outy = c.y - b.y;
    // Any right angle, whether between two axis segments or between two
    // diagonals: both are square corners and both get the same straight cut.
    if (inx * outx + iny * outy !== 0) { out.push(b); continue; }
    const li = Math.hypot(inx, iny), lo = Math.hypot(outx, outy);
    const ci = Math.min(chamfer, li / 2), co = Math.min(chamfer, lo / 2);
    out.push({ x: b.x - (inx / li) * ci, y: b.y - (iny / li) * ci });
    out.push({ x: b.x + (outx / lo) * co, y: b.y + (outy / lo) * co });
  }
  out.push(points[points.length - 1]);
  return out;
}

const key = (i: number, j: number) => i * 100003 + j;

class Field {
  readonly cols: number;
  readonly rows: number;
  readonly grid: number;
  private readonly vertex = new Set<number>();   // taken by a trace
  private readonly blocked = new Set<number>();  // the card's ring
  private readonly diagonal = new Set<number>();
  private box = { i0: 0, i1: -1, j0: 0, j1: -1 };
  constructor(width: number, height: number, grid: number) {
    this.grid = grid;
    this.cols = Math.floor(width / grid);
    this.rows = Math.floor(height / grid);
  }
  inside(i: number, j: number): boolean { return i >= 0 && j >= 0 && i <= this.cols && j <= this.rows; }
  takenVertex(i: number, j: number): boolean { return this.vertex.has(key(i, j)) || this.blocked.has(key(i, j)); }
  takeVertex(i: number, j: number): void { this.vertex.add(key(i, j)); }
  private cell(i: number, j: number, d: Pt): number { return key(d.x > 0 ? i : i - 1, d.y > 0 ? j : j - 1); }
  diagonalFree(i: number, j: number, d: Pt): boolean { return !this.diagonal.has(this.cell(i, j, d)); }
  takeDiagonal(i: number, j: number, d: Pt): void { this.diagonal.add(this.cell(i, j, d)); }
  free(i: number, j: number, d: Pt): boolean {
    const ni = i + d.x, nj = j + d.y;
    if (!this.inside(ni, nj)) return false;
    if (this.takenVertex(ni, nj)) return false;
    if (d.x !== 0 && d.y !== 0 && !this.diagonalFree(i, j, d)) return false;
    return true;
  }
  block(rect: Rect, pad: number): void {
    this.box = {
      i0: Math.floor(rect.x / this.grid) - pad, i1: Math.ceil((rect.x + rect.width) / this.grid) + pad,
      j0: Math.floor(rect.y / this.grid) - pad, j1: Math.ceil((rect.y + rect.height) / this.grid) + pad,
    };
    for (let i = this.box.i0; i <= this.box.i1; i++) for (let j = this.box.j0; j <= this.box.j1; j++) this.blocked.add(key(i, j));
  }
  inCard(i: number, j: number): boolean {
    return i >= this.box.i0 && i <= this.box.i1 && j >= this.box.j0 && j <= this.box.j1;
  }
  /** Opens a pin's way out: only the card's own ring, never a trace. */
  releaseOut(i: number, j: number, d: Pt): boolean {
    if (!this.inside(i, j)) return false;
    for (let n = 0; n < 6; n++) {
      this.blocked.delete(key(i + d.x * n, j + d.y * n));
      if (!this.inCard(i + d.x * n, j + d.y * n)) break;
    }
    return !this.takenVertex(i, j);
  }
}

function pinsOf(card: Rect, grid: number): Pin[] {
  const pins: Pin[] = [];
  const sides: { side: Side; n: Pt; along: 'x' | 'y'; from: number; len: number; fixed: number }[] = [
    { side: 'top', n: { x: 0, y: -1 }, along: 'x', from: card.x, len: card.width, fixed: card.y },
    { side: 'bottom', n: { x: 0, y: 1 }, along: 'x', from: card.x, len: card.width, fixed: card.y + card.height },
    { side: 'left', n: { x: -1, y: 0 }, along: 'y', from: card.y, len: card.height, fixed: card.x },
    { side: 'right', n: { x: 1, y: 0 }, along: 'y', from: card.y, len: card.height, fixed: card.x + card.width },
  ];
  for (const s of sides) {
    // Ten a side, evenly spaced over the middle of the edge: a package
    // leaves its corners bare.  Each pin is put on the grid line nearest its
    // place, so the trace that leaves it runs straight down that line.
    const first = s.from + s.len * PIN_BARE_ENDS;
    const span = s.len * (1 - 2 * PIN_BARE_ENDS);
    const taken = new Set<number>();
    for (let k = 0; k < PINS_PER_SIDE; k++) {
      const along = first + (span * k) / (PINS_PER_SIDE - 1);
      let line = Math.round(along / grid);
      while (taken.has(line)) line += 1;
      taken.add(line);
      const at = s.along === 'x' ? { x: line * grid, y: s.fixed } : { x: s.fixed, y: line * grid };
      const tip = { x: at.x + s.n.x * PIN_LENGTH, y: at.y + s.n.y * PIN_LENGTH };
      pins.push({ side: s.side, at, tip });
    }
  }
  return pins;
}

/** One self-avoiding walk.  Right angles are allowed here and cut by
    drawn(); what is never allowed is a step that is not level, upright or
    at 45 deg. */
function walk(field: Field, i: number, j: number, dir: number, maxSteps: number,
              rand: () => number, branches: { i: number; j: number; dir: number }[]): Pt[] {
  const points: Pt[] = [{ x: i * field.grid, y: j * field.grid }];
  let d = dir;
  const step = (cand: number): boolean => {
    const dd = DIRS[cand];
    if (!field.free(i, j, dd)) return false;
    if (dd.x !== 0 && dd.y !== 0) field.takeDiagonal(i, j, dd);
    i += dd.x; j += dd.y;
    field.takeVertex(i, j);
    points.push({ x: i * field.grid, y: j * field.grid });
    d = cand;
    return true;
  };
  for (let n = 0; n < maxSteps; n++) {
    const r = rand();
    const sign = rand() < 0.5 ? 1 : -1;
    const turn = (k: number) => (d + k + 8) % 8;
    const order = r < STRAIGHT ? [d, turn(sign), turn(-sign), turn(2 * sign), turn(-2 * sign)]
      : r < STRAIGHT + TURN90 ? [turn(2 * sign), turn(-2 * sign), d, turn(sign), turn(-sign)]
      : [turn(sign), turn(-sign), d, turn(2 * sign), turn(-2 * sign)];
    let moved = false;
    for (const cand of order) if (step(cand)) { moved = true; break; }
    if (!moved) break;                         // blocked: the trace ends here
    if (n > 1 && rand() < BRANCH_P) branches.push({ i, j, dir: turn(rand() < 0.5 ? 2 : -2) });
  }
  return points;
}

const lengthOf = (points: Pt[]): number => {
  let sum = 0;
  for (let k = 1; k < points.length; k++) sum += Math.hypot(points[k].x - points[k - 1].x, points[k].y - points[k - 1].y);
  return sum;
};

/** Short, middling, now and then longer: all one length and the field reads
    as a maze instead of a board. */
function steps(rand: () => number): number {
  const r = rand();
  if (r < 0.40) return 2 + Math.floor(rand() * 2);     // 2..3
  if (r < 0.85) return 5 + Math.floor(rand() * 4);     // 5..8
  return 9 + Math.floor(rand() * 6);                   // 9..14
}

export function generate(input: Input): Geometry {
  const { seed, width, height, card, dpr, chipLabel } = input;
  const rand = rng(seed);
  const field = new Field(width, height, GRID);
  field.block(card, CARD_KEEP_OUT);

  const pins = pinsOf(card, GRID);
  const paths: Path[] = [];
  const pads: Pad[] = [];
  let id = 0;
  const layerOf = (r: number): Layer => (r < DECOR_LAYER[0] ? 0 : r < DECOR_LAYER[0] + DECOR_LAYER[1] ? 1 : 2);

  const add = (points: Pt[], layer: Layer, from: Path['from'], parent?: number): Path | undefined => {
    if (points.length < 2) return undefined;
    const p: Path = { id: id++, layer, bright: false, from, parent, points, length: lengthOf(points), delayMs: 0, durationMs: 0 };
    paths.push(p);
    return p;
  };
  const padAt = (at: Pt, layer: Layer, kind: Pad['kind']): void => {
    pads.push({ at, r: rand() < BIG_PAD_SHARE ? 3 : 1.5, layer, kind });
  };

  // ---- the chip's own traces, out of every pin ---------------------------
  const pending: { i: number; j: number; dir: number }[] = [];
  for (const pin of pins) {
    const dir = pin.side === 'top' ? 6 : pin.side === 'bottom' ? 2 : pin.side === 'left' ? 4 : 0;
    const d = DIRS[dir];
    // The first grid vertex beyond the pin's tip.
    const i = d.x === 0 ? Math.round(pin.tip.x / GRID) : d.x > 0 ? Math.ceil(pin.tip.x / GRID) : Math.floor(pin.tip.x / GRID);
    const j = d.y === 0 ? Math.round(pin.tip.y / GRID) : d.y > 0 ? Math.ceil(pin.tip.y / GRID) : Math.floor(pin.tip.y / GRID);
    if (!field.releaseOut(i, j, d)) continue;
    field.takeVertex(i, j);
    const branches: typeof pending = [];
    add(walk(field, i, j, dir, steps(rand) + 2, rand, branches), 2, 'pin');
    pending.push(...branches);
  }
  for (const b of pending) {
    const parent = paths.find((p) => p.points.some((q) => q.x === b.i * GRID && q.y === b.j * GRID));
    // A branch off the chip sits one depth back, so the near layer stays the
    // fifth of the board that LAYERS asks for.
    const child = add(walk(field, b.i, b.j, b.dir, steps(rand), rand, []), 1, 'branch', parent?.id);
    if (child && rand() < BRANCH_PAD_P) padAt(child.points[0], 1, 'branch');
  }

  // ---- the board behind, by area ----------------------------------------
  const want = Math.round((width * height) / DECOR_AREA);
  for (let n = 0, tries = 0; n < want && tries < want * 25; tries++) {
    const i = Math.floor(rand() * (field.cols + 1));
    const j = Math.floor(rand() * (field.rows + 1));
    if (!field.inside(i, j) || field.takenVertex(i, j)) continue;
    field.takeVertex(i, j);
    const branches: typeof pending = [];
    const p = add(walk(field, i, j, Math.floor(rand() * 8), steps(rand), rand, branches), layerOf(rand()), 'seed');
    if (!p) continue;
    for (const b of branches) {
      const child = add(walk(field, b.i, b.j, b.dir, steps(rand), rand, []), p.layer, 'branch', p.id);
      if (child && rand() < BRANCH_PAD_P) padAt(child.points[0], p.layer, 'branch');
    }
    n++;
  }

  /* The depths, brought to the shares in LAYERS.  Which layer a trace is on
     changes nothing about where it runs, so it is settled here rather than
     guessed while walking: the chip's own traces stay near and their
     branches one step back, and the rest are dealt out to whichever depth is
     furthest from its share.  Deterministic, and exact to a trace. */
  const fixed = new Set(paths.filter((p) => p.from !== 'seed').map((p) => p.id));
  const target: number[] = LAYERS.map((l) => l.share * paths.length);
  const got: number[] = [0, 0, 0];
  for (const p of paths) if (fixed.has(p.id)) got[p.layer] += 1;
  for (const p of paths) {
    if (fixed.has(p.id)) continue;
    let pick: Layer = 0;
    for (const L of [1, 2] as Layer[]) if (got[L] / target[L] < got[pick] / target[pick]) pick = L;
    p.layer = pick;
    got[pick] += 1;
  }
  // A tenth of the near ones are brighter again and carry a flare.
  for (const p of paths) p.bright = p.layer === 2 && rand() < BRIGHT_SHARE;
  for (const pd of pads) if (pd.kind !== 'floating') {
    const owner = paths.find((p) => p.points[p.points.length - 1].x === pd.at.x && p.points[p.points.length - 1].y === pd.at.y);
    if (owner) pd.layer = owner.layer;
  }

  // ---- a pad where every trace ends -------------------------------------
  for (const p of paths) padAt(p.points[p.points.length - 1], p.layer, 'end');

  // ---- and far more that join nothing: the dots that carry the texture ---
  const wantPads = Math.round((width * height) / PAD_AREA);
  for (let n = 0, tries = 0; n < wantPads && tries < wantPads * 12; tries++) {
    const i = Math.floor(rand() * (field.cols + 1));
    const j = Math.floor(rand() * (field.rows + 1));
    if (!field.inside(i, j) || field.inCard(i, j)) continue;
    padAt({ x: i * GRID, y: j * GRID }, layerOf(rand()), 'floating');
    n++;
  }

  // ---- one speed for the board, and the stagger -------------------------
  const longest = paths.reduce((m, p) => Math.max(m, p.length), 1);
  const speed = longest / SPEED_FITS_IN;
  const centre = { x: card.x + card.width / 2, y: card.y + card.height / 2 };
  const far = Math.hypot(width, height) / 2 || 1;
  for (const p of paths) {
    p.durationMs = p.length / speed;
    p.delayMs = p.layer === 2
      ? Math.min(1, Math.hypot(p.points[0].x - centre.x, p.points[0].y - centre.y) / far) * 160 : 0;
  }

  // ---- the bright points, always on a pad that is already there ---------
  const flares: Flare[] = [];
  const count = FLARES_MIN + Math.floor(rand() * (FLARES_MAX - FLARES_MIN + 1));
  const bigPads = pads.filter((p) => p.r === 3);
  const pool = bigPads.length >= count ? bigPads : pads;
  const used = new Set<number>();
  for (let n = 0; n < count && pool.length > 0; n++) {
    let k = Math.floor(rand() * pool.length);
    for (let t = 0; t < 8 && used.has(k); t++) k = Math.floor(rand() * pool.length);
    used.add(k);
    // Three of them carry the eye; the rest sit back.
    const strength = n < 3 ? 0.8 : 0.3 + rand() * 0.2;
    flares.push({ at: pool[k].at, halo: 30, strength,
                  streak: rand() < 0.5 ? 'level' : 'diagonal', streakLength: 90 });
  }
  // A few at the pins, small: this is where the chip reads as sending signal out.
  const tips = 4 + Math.floor(rand() * 3);
  for (let n = 0; n < tips; n++) {
    const pin = pins[Math.floor(rand() * pins.length)];
    flares.push({ at: pin.tip, halo: 16, strength: 0.45 + rand() * 0.2,
                  streak: rand() < 0.5 ? 'level' : 'diagonal', streakLength: 44 });
  }

  return { seed, width, height, dpr, grid: GRID, chamfer: CHAMFER, card, chipLabel, pins, paths, pads, flares, speed };
}
