/* Draws what generate.ts worked out, on Canvas 2D.  It knows the geometry
   and the clock and nothing else.

   Two layers, because of what each costs.  drawBoard() is the board itself
   -- the haze, the traces, the pads, the flares -- and it is drawn while it
   grows and then once more when it is finished, never again: a settled board
   that went on redrawing hundreds of strokes every frame would keep a lab
   PC's built-in graphics busy for nothing.  drawPulse() is the layer above
   it, cleared and drawn every frame for as long as the window is open, and
   it holds no more than eight things at a time.

   Four things that are easy to get wrong and are done here on purpose:

   - miter joins and butt caps.  With lineJoin 'round' the same geometry
     reads as curved ribbon rather than as a board; the chamfers that make
     the corners are in the geometry (generate.ts drawn()), not in the
     stroke.  Nothing here calls arc() except for a pad.
   - The board is cleared and drawn whole every time it is drawn at all.
     Laying a translucent rectangle over the last frame is cheaper, but the
     alpha in the code then has nothing to do with the brightness on screen.
   - Light is composited with 'lighter'.  Drawn over, a soft white circle is
     a grey smudge; added, it is light.  A core, a wide halo and a long thin
     streak together are what reads as a flare -- one blurred circle does
     not.  The haze underneath is the exception: it is the board's own
     ground, laid down before anything, so it must never brighten a line
     drawn over it.
   - A signal moves along a path by arc length, not by segment index: with an
     index a 60 px segment and a 200 px one take the same time and the light
     jumps at every corner.

   Nothing here starts or stops the animation; index.ts owns the clock. */

import { BRIGHT, drawn, LAYERS, type Flare, type Geometry, type Pad, type Path, type Pt } from './generate.ts';

/** The haze comes up first, so the opening still begins in the dark. */
export const HAZE_IN = 700;
/** How long a flare takes to light. */
export const FLARE_IN = 400;
/** The die frame's slow breath, which index.ts puts on the card. */
export const DIE = { min: 0.35, max: 0.45, periodMs: 4000 } as const;
/** How much faster a far trace's halo falls away than its own alpha does. */
export const GLOW_DEPTH = 1.8;
/** How much of its own light a beating flare adds at the top of its swell. */
export const BEAT_GAIN = 0.85;
/** The lit run behind a pulse's head, in px, and the shape of it: the three
    runs that make its falloff, and the three widths each is drawn at. */
export const PULSE_TAIL = 110;
export const PULSE_SHAPE = [
  { of: 1.0, alpha: 0.34 },
  { of: 0.55, alpha: 0.33 },
  { of: 0.22, alpha: 0.33 },
] as const;
export const PULSE_WIDTHS = [
  { width: 24, alpha: 0.26 },
  { width: 10, alpha: 0.58 },
  { width: 2.6, alpha: 1.0 },
] as const;

export const COLOURS = {
  background: '#0d0d0d',
  /* The ambient haze: the board's ground, brightest not at the chip but at a
     ring out from it, so the package still sits in the calmest part of the
     picture.  Without this the board is lines on black, and black is most of
     what is on screen however many lines there are. */
  hazeNear: '#1c1c1c',
  hazePeak: '#282828',
  hazeEdge: '#181818',
  hazePeakAt: 0.46,            // of the way to the farthest corner
  /* The light around a lit trace.  Concentric strokes, widest and faintest
     first, added: a line with light around it, not a wider line.  This and
     the haze are what fill the board -- without them a board whose traces
     are at the right brightness is still mostly black, because a 2 px line
     on a 22 px grid covers two pixels in a hundred.  A shadowBlur on every
     stroke would cost far more and on a lab PC's built-in graphics that is
     what spins the fan; all of these are stroked in one path per level. */
  glow: [
    { width: 12, alpha: 0.045 },
    { width: 7, alpha: 0.120 },
    { width: 4, alpha: 0.240 },
    { width: 3, alpha: 0.420 },
  ],
  padRing: 0.5,
  padFill: 0.15,
  pin: 0.75,
  pinWidth: 2.5,
  cardHalo: 0.10,
  cardHaloWidth: 24,
} as const;

const white = (a: number): string => `rgba(255,255,255,${Math.max(0, Math.min(1, a)).toFixed(3)})`;

const cache = new WeakMap<Path, { line: Pt[]; cum: number[] }>();
function shape(p: Path): { line: Pt[]; cum: number[] } {
  let c = cache.get(p);
  if (c) return c;
  const line = drawn(p.points);
  const cum = [0];
  for (let k = 1; k < line.length; k++) cum.push(cum[k - 1] + Math.hypot(line[k].x - line[k - 1].x, line[k].y - line[k - 1].y));
  c = { line, cum };
  cache.set(p, c);
  return c;
}

/** The point at `dist` along the drawn polyline. */
function at(line: Pt[], cum: number[], dist: number): Pt {
  for (let k = 1; k < line.length; k++) {
    if (cum[k] < dist) continue;
    const f = (dist - cum[k - 1]) / (cum[k] - cum[k - 1] || 1);
    return { x: line[k - 1].x + (line[k].x - line[k - 1].x) * f, y: line[k - 1].y + (line[k].y - line[k - 1].y) * f };
  }
  return line[line.length - 1];
}

/** The drawn polyline between two distances along it, ends cut square. */
function run(p: Path, fromDist: number, toDist: number): Pt[] {
  const { line, cum } = shape(p);
  const lo = Math.max(0, fromDist), hi = Math.min(cum[cum.length - 1], toDist);
  if (hi <= lo) return [];
  const pts: Pt[] = [at(line, cum, lo)];
  for (let k = 1; k < line.length; k++) if (cum[k] > lo && cum[k] < hi) pts.push(line[k]);
  pts.push(at(line, cum, hi));
  return pts;
}

function stroke(ctx: CanvasRenderingContext2D, pts: Pt[], colour: string, width: number): void {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.stroke();
}

function pad(ctx: CanvasRenderingContext2D, p: Pad, alpha: number): void {
  const f = alpha / LAYERS[2].alpha;             // the far layers' pads are fainter too
  ctx.beginPath();
  ctx.arc(p.at.x, p.at.y, p.r, 0, Math.PI * 2);
  if (p.r < 3) {                                 // too small for a ring to show
    ctx.fillStyle = white(Math.min(0.9, alpha * 1.6));
    ctx.fill();
    return;
  }
  ctx.fillStyle = white(COLOURS.padFill * f);
  ctx.fill();
  ctx.strokeStyle = white(COLOURS.padRing * f);
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** Core, halo and streak, added to what is there.  The caller has already
    put the context into 'lighter'.  `gain` scales the whole thing: 1 while
    it lights, less while it fades in, and a fraction of it again on the
    layer above when it beats. */
function flare(ctx: CanvasRenderingContext2D, f: Flare, gain: number): void {
  if (gain <= 0) return;
  /* The brightest few are meant to be blown out, so the middle of the halo
     is a plateau rather than a point: a core that is white across a dozen
     pixels, not one pixel of white with a gradient around it. */
  const halo = ctx.createRadialGradient(f.at.x, f.at.y, 0, f.at.x, f.at.y, f.halo);
  halo.addColorStop(0, white(f.strength * gain));
  halo.addColorStop(0.22, white(f.strength * gain * 0.85));
  halo.addColorStop(0.5, white(f.strength * gain * 0.20));
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(f.at.x, f.at.y, f.halo, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(f.at.x, f.at.y);
  if (f.streak === 'diagonal') ctx.rotate(Math.PI / 4);
  const line = ctx.createLinearGradient(-f.streakLength / 2, 0, f.streakLength / 2, 0);
  line.addColorStop(0, 'rgba(255,255,255,0)');
  line.addColorStop(0.5, white(0.4 * f.strength * gain));
  line.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = line;
  ctx.beginPath();
  ctx.ellipse(0, 0, f.streakLength / 2, 1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = white(gain);
  ctx.beginPath();
  ctx.arc(f.at.x, f.at.y, 2, 0, Math.PI * 2);
  ctx.fill();
}

const ease = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1 - t, 3));
const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

/** The alpha of the card's die frame at `t`: a slow breath, never a size. */
export const dieAlpha = (t: number): number =>
  DIE.min + (DIE.max - DIE.min) * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / DIE.periodMs));

/** The board: everything that stays once it is there.  Drawn while it grows
    and once more when it has (index.ts), and not again. */
export function drawBoard(ctx: CanvasRenderingContext2D, g: Geometry, t: number): void {
  ctx.save();
  ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = COLOURS.background;
  ctx.fillRect(0, 0, g.width, g.height);
  ctx.lineJoin = 'miter';        // never 'round': that is what makes ribbons
  ctx.lineCap = 'butt';
  ctx.miterLimit = 4;

  // ---- the ground it is all drawn on ------------------------------------
  const hazeIn = ease(clamp01(t / HAZE_IN));
  if (hazeIn > 0) {
    const cx = g.card.x + g.card.width / 2, cy = g.card.y + g.card.height / 2;
    const reach = Math.hypot(Math.max(cx, g.width - cx), Math.max(cy, g.height - cy));
    const haze = ctx.createRadialGradient(cx, cy, 0, cx, cy, reach);
    haze.addColorStop(0, COLOURS.hazeNear);
    haze.addColorStop(COLOURS.hazePeakAt, COLOURS.hazePeak);
    haze.addColorStop(1, COLOURS.hazeEdge);
    ctx.globalAlpha = hazeIn;
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, g.width, g.height);
    ctx.globalAlpha = 1;
  }

  // ---- the pins ---------------------------------------------------------
  const pinsIn = ease(clamp01((t - 60) / 240));
  if (pinsIn > 0) {
    ctx.globalAlpha = pinsIn;
    ctx.strokeStyle = white(COLOURS.pin);
    ctx.lineWidth = COLOURS.pinWidth;
    ctx.beginPath();
    for (const pin of g.pins) {
      ctx.moveTo(pin.at.x, pin.at.y);
      ctx.lineTo(pin.tip.x, pin.tip.y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /* ---- the traces, each growing at its own rate from its own moment ----
     Far first, then middle, then near, so the near ones are on top of what
     is behind them.  A trace is drawn up to how far its signal has run; the
     near ones keep a head while they run, which is what the eye follows.
     Each depth is drawn in two passes over one path -- the light around the
     lines, then the lines -- so the whole board is a dozen strokes however
     many traces are on it. */
  const trace = (pts: Pt[]): void => {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
  };
  for (const layer of [0, 1, 2] as const) {
    const plain: Pt[][] = [], lit: Pt[][] = [], heads: Pt[] = [];
    for (const p of g.paths) {
      if (p.layer !== layer || t < p.delayMs) continue;
      const done = clamp01((t - p.delayMs) / (p.durationMs || 1));
      const { cum } = shape(p);
      const pts = run(p, 0, cum[cum.length - 1] * done);
      if (pts.length < 2) continue;
      (p.bright ? lit : plain).push(pts);
      if (layer === 2 && done < 1) heads.push(pts[pts.length - 1]);
    }
    if (plain.length === 0 && lit.length === 0) continue;
    /* The light around a far trace falls away faster than the trace's own
       alpha does: scaled in proportion, every depth ends up with much the
       same halo and the board reads flat -- three depths drawn and one
       depth seen. */
    const share = Math.pow(LAYERS[layer].alpha / LAYERS[2].alpha, GLOW_DEPTH);
    ctx.globalCompositeOperation = 'lighter';
    for (const level of COLOURS.glow) {
      ctx.beginPath();
      for (const pts of plain) trace(pts);
      for (const pts of lit) trace(pts);
      ctx.strokeStyle = white(level.alpha * share);
      ctx.lineWidth = level.width;
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    if (plain.length) {
      ctx.beginPath();
      for (const pts of plain) trace(pts);
      ctx.strokeStyle = white(LAYERS[layer].alpha);
      ctx.lineWidth = LAYERS[layer].width;
      ctx.stroke();
    }
    if (lit.length) {
      ctx.beginPath();
      for (const pts of lit) trace(pts);
      ctx.strokeStyle = white(BRIGHT.alpha);
      ctx.lineWidth = BRIGHT.width;
      ctx.stroke();
    }
    for (const h of heads) {
      ctx.fillStyle = white(0.95);
      ctx.beginPath();
      ctx.arc(h.x, h.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---- the pads, each when what it belongs to has arrived ---------------
  for (const p of g.pads) if (t >= p.atMs) pad(ctx, p, LAYERS[p.layer].alpha);

  // ---- light, added ------------------------------------------------------
  ctx.globalCompositeOperation = 'lighter';
  // A quiet halo around the package, so the chip sits in light of its own.
  const glowIn = ease(clamp01((t - 120) / 400));
  if (glowIn > 0) {
    const { x, y, width, height } = g.card;
    for (let n = 6; n >= 1; n--) {
      const grow = (COLOURS.cardHaloWidth * n) / 6;
      ctx.strokeStyle = white((COLOURS.cardHalo / 6) * glowIn);
      ctx.lineWidth = grow * 2;
      ctx.strokeRect(x - grow, y - grow, width + grow * 2, height + grow * 2);
    }
  }
  for (const f of g.flares) flare(ctx, f, ease(clamp01((t - f.atMs) / FLARE_IN)));
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

/** Which pulses are running at `t`, and how far each has got.  The schedule
    is a loop, so a pulse that crosses the wrap is found a period early too
    and there is no lull at the seam. */
export function livePulses(g: Geometry, t: number): { path: Path; progress: number }[] {
  const out: { path: Path; progress: number }[] = [];
  if (t <= 0 || g.pulses.length === 0) return out;
  const period = g.pulsePeriodMs;
  const tt = t % period;
  for (const q of g.pulses) {
    for (const now of [tt, tt + period]) {
      if (now < q.startMs || now >= q.startMs + q.durationMs) continue;
      const path = g.paths[q.path];
      if (!path || path.id !== q.path || t < path.delayMs + path.durationMs) continue;
      out.push({ path, progress: (now - q.startMs) / q.durationMs });
    }
  }
  return out;
}

/** The layer above the board: cleared and drawn every frame, and never more
    than a handful of things on it.  Everything it draws is added, so the
    board underneath is left exactly as it was drawn. */
export function drawPulse(ctx: CanvasRenderingContext2D, g: Geometry, t: number): void {
  ctx.save();
  ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
  ctx.clearRect(0, 0, g.width, g.height);
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'butt';
  ctx.globalCompositeOperation = 'lighter';

  for (const { path, progress } of livePulses(g, t)) {
    const { cum } = shape(path);
    const total = cum[cum.length - 1];
    const head = total * progress;
    // Brightest at the head and gone at the tail.  Three runs, each shorter
    // than the last, make that falloff in steps: every pixel of the tail
    // changes as the steps pass over it, where one even run would only
    // change at its two ends.
    const fade = Math.sin(Math.PI * clamp01(progress));
    let drew = false;
    for (const part of PULSE_SHAPE) {
      const pts = run(path, head - PULSE_TAIL * part.of, head);
      if (pts.length < 2) continue;
      drew = true;
      for (const w of PULSE_WIDTHS) stroke(ctx, pts, white(w.alpha * part.alpha * fade), w.width);
    }
    if (!drew) continue;
    const tip = run(path, head - 1, head)[1] ?? path.points[0];
    ctx.fillStyle = white(0.9 * fade);
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const b of g.beats) {
    const f = g.flares[b.flare];
    if (!f || t < f.atMs) continue;
    const swell = 0.5 - 0.5 * Math.cos(2 * Math.PI * (t / b.periodMs + b.phase));
    flare(ctx, f, BEAT_GAIN * swell);
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}
