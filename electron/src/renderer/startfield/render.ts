/* Draws what generate.ts worked out, on a Canvas 2D context.  It knows the
   geometry and the clock and nothing else.

   Four things that are easy to get wrong and are done here on purpose:

   - miter joins and butt caps.  With lineJoin 'round' the same geometry
     reads as curved ribbon rather than as a board; the chamfers that make
     the corners are in the geometry (generate.ts drawn()), not in the
     stroke.  Nothing here calls arc() except for a pad.
   - The frame is cleared and drawn whole every time.  Laying a translucent
     rectangle over the last frame is cheaper, but the alpha in the code then
     has nothing to do with the brightness on screen.
   - The bright points are composited with 'lighter'.  Drawn over, a soft
     white circle is a grey smudge; added, it is light.  A core, a wide halo
     and a long thin streak together are what reads as a flare -- one blurred
     circle does not.
   - A signal moves along a path by arc length, not by segment index: with an
     index a 60 px segment and a 200 px one take the same time and the light
     jumps at every corner.

   Nothing here starts or stops the animation; index.ts owns the clock. */

import { BRIGHT, drawn, LAYERS, type Flare, type Geometry, type Pad, type Path, type Pt } from './generate.ts';

export const TRACE_START = 150;
export const TRACE_END = 900;
export const DECOR_START = 600;
export const DECOR_END = 1100;
export const SETTLED = 1100;

export const COLOURS = {
  background: '#0d0d0d',
  /* The near layer's glow: the same path once more, wider and fainter, then
     the sharp line over it.  A shadowBlur on every stroke costs far more and
     on a lab PC's built-in graphics that is what spins the fan. */
  nearGlowWidth: 4,
  nearGlowAlpha: 0.12,
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

/** The drawn polyline up to `fraction` of its length, and where it ends. */
function prefix(p: Path, fraction: number): { pts: Pt[]; head: Pt } {
  const { line, cum } = shape(p);
  const dist = cum[cum.length - 1] * fraction;
  const pts: Pt[] = [line[0]];
  for (let k = 1; k < line.length; k++) {
    if (cum[k] <= dist) { pts.push(line[k]); continue; }
    const f = (dist - cum[k - 1]) / (cum[k] - cum[k - 1] || 1);
    const head = { x: line[k - 1].x + (line[k].x - line[k - 1].x) * f, y: line[k - 1].y + (line[k].y - line[k - 1].y) * f };
    pts.push(head);
    return { pts, head };
  }
  return { pts, head: line[line.length - 1] };
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
    ctx.fillStyle = white(Math.min(0.9, alpha * 2.4));
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
    put the context into 'lighter'. */
function flare(ctx: CanvasRenderingContext2D, f: Flare, fade: number): void {
  const halo = ctx.createRadialGradient(f.at.x, f.at.y, 0, f.at.x, f.at.y, f.halo);
  halo.addColorStop(0, white(0.55 * f.strength * fade));
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
  line.addColorStop(0.5, white(0.35 * f.strength * fade));
  line.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = line;
  ctx.beginPath();
  ctx.ellipse(0, 0, f.streakLength / 2, 1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = white(fade);
  ctx.beginPath();
  ctx.arc(f.at.x, f.at.y, 2, 0, Math.PI * 2);
  ctx.fill();
}

const ease = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1 - t, 3));
const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

export function draw(ctx: CanvasRenderingContext2D, g: Geometry, t: number): void {
  ctx.save();
  ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
  ctx.fillStyle = COLOURS.background;
  ctx.fillRect(0, 0, g.width, g.height);
  ctx.lineJoin = 'miter';        // never 'round': that is what makes ribbons
  ctx.lineCap = 'butt';
  ctx.miterLimit = 4;

  const decor = ease(clamp01((t - DECOR_START) / (DECOR_END - DECOR_START)));

  // ---- the board behind -------------------------------------------------
  if (decor > 0) {
    ctx.globalAlpha = decor;
    for (const p of g.paths) {
      if (p.layer === 2) continue;
      stroke(ctx, shape(p).line, white(LAYERS[p.layer].alpha), LAYERS[p.layer].width);
    }
    for (const p of g.pads) {
      if (p.layer === 2) continue;                  // the near ones come with their traces
      pad(ctx, p, LAYERS[p.layer].alpha);
    }
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

  // ---- the chip's traces, lit as the signal passes and left lit ---------
  for (const p of g.paths) {
    if (p.layer !== 2) continue;
    const start = TRACE_START + p.delayMs;
    if (t < start) continue;
    const done = clamp01((t - start) / (p.durationMs || 1));
    const { pts, head } = prefix(p, done);
    const alpha = p.bright ? BRIGHT.alpha : LAYERS[2].alpha;
    stroke(ctx, pts, white(COLOURS.nearGlowAlpha), COLOURS.nearGlowWidth);
    stroke(ctx, pts, white(alpha), p.bright ? BRIGHT.width : LAYERS[2].width);
    if (done >= 1) continue;
    ctx.fillStyle = white(0.95);
    ctx.beginPath();
    ctx.arc(head.x, head.y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Their pads, once the trace that leads to them has arrived.
  for (const p of g.paths) {
    if (p.layer !== 2) continue;
    const start = TRACE_START + p.delayMs;
    if (t < start + (p.durationMs || 1)) continue;
    const end = p.points[p.points.length - 1];
    const own = g.pads.find((q) => q.at.x === end.x && q.at.y === end.y && q.kind === 'end');
    if (own) pad(ctx, own, LAYERS[2].alpha);
  }
  if (decor > 0) {
    ctx.globalAlpha = decor;
    for (const p of g.pads) if (p.layer === 2 && p.kind !== 'end') pad(ctx, p, LAYERS[2].alpha);
    ctx.globalAlpha = 1;
  }

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
  if (decor > 0) for (const f of g.flares) flare(ctx, f, decor);
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}
