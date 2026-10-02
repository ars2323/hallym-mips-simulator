/* The first screen's circuit board (src/renderer/startfield/).

   generate() is a pure function, so what makes the board look like a board
   is checked here rather than by looking at pictures: the grid, the angles,
   that no two traces meet, where a trace may start and end, the three
   depths, the pads, and that one speed governs them all.  The few things
   that live in the drawing rather than in the geometry -- the joins, the
   additive light, the widest stroke -- are read out of render.ts's source,
   the way tests/renderer/particles.test.ts reads the window's.

   Each check has a mutant in tools/mutants.ts that breaks exactly it.

   The golden is the hash of the geometry, not of pixels: the output is
   settled by (seed, viewport, card rectangle, dpr) alone, so there is no
   compositor rounding to make it wobble. */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { BRIGHT, drawn, generate, GRID, LAYERS, MAX_LINE_WIDTH,
         type Geometry, type Pt } from '../../src/renderer/startfield/generate.ts';

const root = path.join(import.meta.dirname, '..', '..');
const SEED = 20261002;
const SIZES: [number, number][] = [[1280, 800], [1920, 1080], [1920, 540], [1024, 768]];
/** The card as app.css sizes it: a square, clamp(360, 52vmin, 460). */
const cardFor = (w: number, h: number) => {
  const side = Math.round(Math.max(360, Math.min(460, Math.min(w, h) * 0.52)));
  return { x: Math.round((w - side) / 2), y: Math.round((h - side) / 2), width: side, height: side };
};
const at = (w: number, h: number, card = cardFor(w, h)): Geometry =>
  generate({ seed: SEED, width: w, height: h, dpr: 1, chipLabel: 'MIPS32', card });
const every = (f: (g: Geometry, name: string) => void): void => {
  for (const [w, h] of SIZES) f(at(w, h), `${w}x${h}`);
};
const vkey = (p: Pt): string => `${p.x},${p.y}`;
const render = readFileSync(path.join(root, 'src/renderer/startfield/render.ts'), 'utf8');
/** The code alone: the comments talk about arcs and round joins. */
const renderCode = render.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const glintsCode = readFileSync(path.join(root, 'src/renderer/startfield/glints.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

test('the chip is square, and the pins are on its edges with the corners left bare', () => {
  every((g, name) => {
    assert.ok(Math.abs(g.card.width - g.card.height) <= 1, `${name}: ${g.card.width}x${g.card.height} is not square`);
    assert.equal(g.pins.length, 40, `${name}: ${g.pins.length} pins`);
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      const mine = g.pins.filter((p) => p.side === side);
      assert.equal(mine.length, 10, `${name}: ${mine.length} pins on the ${side} edge`);
      const flat = side === 'top' || side === 'bottom';
      const from = flat ? g.card.x : g.card.y, len = flat ? g.card.width : g.card.height;
      for (const pin of mine) {
        const along = (flat ? pin.at.x : pin.at.y) - from;
        assert.ok(along > len * 0.06 && along < len * 0.94, `${name}: a ${side} pin sits in the corner`);
        // Perpendicular, and out of the package.
        assert.equal(flat ? pin.tip.x : pin.tip.y, flat ? pin.at.x : pin.at.y, `${name}: a ${side} pin is not perpendicular`);
        assert.ok(Math.hypot(pin.tip.x - pin.at.x, pin.tip.y - pin.at.y) > 10, `${name}: a ${side} pin is too short`);
      }
    }
  });
});

test('every vertex on the 22 px grid; every drawn segment level, upright or at 45 deg', () => {
  every((g, name) => {
    for (const p of g.paths) for (const q of p.points) {
      assert.equal(q.x % GRID, 0, `${name}: x ${q.x} off the grid`);
      assert.equal(q.y % GRID, 0, `${name}: y ${q.y} off the grid`);
    }
    const angles = new Set<number>();
    for (const p of g.paths) {
      const line = drawn(p.points);
      for (let k = 1; k < line.length; k++) {
        const dx = line[k].x - line[k - 1].x, dy = line[k].y - line[k - 1].y;
        assert.ok(Math.hypot(dx, dy) > 0.01, `${name}: a segment of no length`);
        angles.add(Math.round(((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 180));
      }
    }
    assert.deepEqual([...angles].sort((a, b) => a - b), [0, 45, 90, 135], `${name}: angles ${[...angles]}`);
  });
});

test('a right angle is cut by a straight chamfer, and no curve is ever drawn', () => {
  const g = at(1280, 800);
  let chamfers = 0;
  for (const p of g.paths) {
    const line = drawn(p.points);
    for (let k = 1; k < line.length - 1; k++) {
      const a = { x: line[k].x - line[k - 1].x, y: line[k].y - line[k - 1].y };
      const b = { x: line[k + 1].x - line[k].x, y: line[k + 1].y - line[k].y };
      assert.notEqual(a.x * b.x + a.y * b.y, 0, 'a square corner survived the chamfer');
    }
    for (let k = 1; k < line.length; k++) {
      const d = Math.hypot(line[k].x - line[k - 1].x, line[k].y - line[k - 1].y);
      if (Math.abs(d - g.chamfer * Math.SQRT2) < 0.01 || Math.abs(d - g.chamfer) < 0.01) chamfers++;
    }
  }
  assert.ok(chamfers > 20, `only ${chamfers} chamfers on the whole board`);
  // And the drawing uses straight lines and hard joins: a round join is what
  // turns a board into a ribbon.
  assert.match(renderCode, /ctx\.lineJoin = 'miter'/);
  assert.match(renderCode, /ctx\.lineCap = 'butt'/);
  assert.doesNotMatch(renderCode, /lineJoin = 'round'|lineCap = 'round'/);
  assert.doesNotMatch(renderCode, /quadraticCurveTo|bezierCurveTo|arcTo/);
  // arc() is allowed, but only for the round things: pads, the head, a halo.
  assert.doesNotMatch(renderCode.replace(/ctx\.arc\(/g, ''), /\barc\(/);
});

test('no two traces cross and none touches another, except where a branch leaves its parent', () => {
  every((g, name) => {
    const byId = new Map(g.paths.map((p) => [p.id, p]));
    const owners = new Map<string, number[]>();
    for (const p of g.paths) for (const q of p.points) {
      const list = owners.get(vkey(q)) ?? [];
      list.push(p.id);
      owners.set(vkey(q), list);
    }
    for (const [k, ids] of owners) {
      if (ids.length === 1) continue;
      assert.equal(ids.length, 2, `${name}: ${ids.length} traces at ${k}`);
      const [a, b] = ids.map((i) => byId.get(i)!);
      const child = a.from === 'branch' ? a : b.from === 'branch' ? b : undefined;
      const parent = child === a ? b : a;
      assert.ok(child && child.parent === parent.id && vkey(child.points[0]) === k,
        `${name}: two traces meet at ${k} and it is not a branch point`);
    }
    const diagonals = new Map<string, number>();
    for (const p of g.paths) for (let k = 1; k < p.points.length; k++) {
      const a = p.points[k - 1], b = p.points[k];
      if (a.x === b.x || a.y === b.y) continue;
      const cell = `${Math.min(a.x, b.x)},${Math.min(a.y, b.y)}`;
      diagonals.set(cell, (diagonals.get(cell) ?? 0) + 1);
    }
    for (const [cell, n] of diagonals) assert.equal(n, 1, `${name}: ${n} diagonals through the cell at ${cell}`);
  });
});

test('a trace starts at a pin, at a seeded vertex, or on the path it branched from', () => {
  every((g, name) => {
    const byId = new Map(g.paths.map((p) => [p.id, p]));
    let fromPins = 0;
    for (const p of g.paths) {
      if (p.from === 'pin') {
        // The first vertex is the grid point just beyond that pin's tip.
        const near = g.pins.some((pin) => Math.hypot(p.points[0].x - pin.tip.x, p.points[0].y - pin.tip.y) <= GRID + 2);
        assert.ok(near, `${name}: a pin trace starts at ${vkey(p.points[0])}, nowhere near a pin`);
        fromPins++;
      } else if (p.from === 'branch') {
        const parent = byId.get(p.parent!);
        assert.ok(parent?.points.some((q) => vkey(q) === vkey(p.points[0])), `${name}: branch ${p.id} is not on its parent`);
      }
    }
    // Not every pin gets away: at 1920x540 there are only ninety pixels
    // above and below the package, so some are blocked at once.
    assert.ok(fromPins >= 24, `${name}: only ${fromPins} traces leave the chip`);
  });
});

test('a pad where every trace ends, and far more that join nothing', () => {
  every((g, name) => {
    const ends = g.pads.filter((p) => p.kind === 'end');
    assert.equal(ends.length, g.paths.length, `${name}: ${ends.length} end pads for ${g.paths.length} traces`);
    for (const p of g.paths) {
      const end = p.points[p.points.length - 1];
      assert.ok(ends.some((q) => vkey(q.at) === vkey(end)), `${name}: trace ${p.id} ends with no pad`);
    }
    // One floating pad per 4,500 px^2, within a fifth: the small dots are
    // half of the texture and a fixed count leaves a flat window bare.
    const floating = g.pads.filter((p) => p.kind === 'floating').length;
    const expected = (g.width * g.height) / 4500;
    assert.ok(Math.abs(floating / expected - 1) <= 0.2,
      `${name}: ${floating} floating pads against ${Math.round(expected)} expected`);
    assert.ok(g.pads.some((p) => p.r === 3) && g.pads.some((p) => p.r === 1.5), `${name}: one pad size only`);
  });
});

test('three depths, in the shares the board is meant to have, and nothing wider than 2.5 px', () => {
  every((g, name) => {
    for (const L of [0, 1, 2] as const) {
      const share = g.paths.filter((p) => p.layer === L).length / g.paths.length;
      assert.ok(Math.abs(share - LAYERS[L].share) <= 0.05,
        `${name}: layer ${L} is ${(share * 100).toFixed(0)}%, meant to be ${LAYERS[L].share * 100}%`);
    }
    const widths = g.paths.map((p) => (p.bright ? BRIGHT.width : LAYERS[p.layer].width));
    assert.ok(Math.max(...widths) <= MAX_LINE_WIDTH, `${name}: a ${Math.max(...widths)} px line`);
    // Thin lines, wide apart: the look is in the ratio, not in either number.
    assert.ok(GRID / Math.max(...widths) >= 8, `${name}: grid ${GRID} against a ${Math.max(...widths)} px line`);
  });
  assert.ok(MAX_LINE_WIDTH <= 2.5);
});

test('the bright points are light, not smudges: added, and always on a pad', () => {
  every((g, name) => {
    // Enough of them, and large: most of the board's near-white is here.
    assert.ok(g.flares.length >= 22, `${name}: ${g.flares.length} flares`);
    const pads = new Set(g.pads.map((p) => vkey(p.at)));
    const tips = new Set(g.pins.map((p) => vkey(p.tip)));
    for (const f of g.flares) {
      assert.ok(pads.has(vkey(f.at)) || tips.has(vkey(f.at)), `${name}: a flare at ${vkey(f.at)} is on nothing`);
      assert.ok(f.strength > 0 && f.strength <= 1, `${name}: a flare at ${f.strength}`);
    }
    // The few that are blown out: a white core, not a bright point.
    assert.ok(g.flares.filter((f) => f.strength >= 0.9).length >= 5, `${name}: nothing blown out`);
    assert.ok(g.flares.some((f) => f.halo >= 42 && f.streakLength >= 130), `${name}: no flare of any size`);
    assert.ok(new Set(g.flares.map((f) => f.streak)).size === 2, `${name}: the streaks all point one way`);
  });
  /* A soft white circle drawn over the board is a grey smudge; added, it is
     light.  Three passes add light -- around the traces, the flares on the
     board, and the layer above -- and each puts the context back when it is
     done, so counting them is what says none has been left drawing over. */
  const added = renderCode.match(/globalCompositeOperation = 'lighter'/g) ?? [];
  const back = renderCode.match(/globalCompositeOperation = 'source-over'/g) ?? [];
  assert.ok(added.length >= 3, `only ${added.length} passes add their light`);
  assert.ok(back.length >= added.length, `${added.length} passes add light and ${back.length} put it back`);
});

/* One signal speed, and each trace's own rate against it.  The first is what
   makes a short trace and a long one look like the same light moving; the
   second is what keeps them from arriving together. */
test('one signal speed, each trace at its own rate, from 0.35x to 3x', () => {
  every((g, name) => {
    const ratios = g.paths.map((p) => p.durationMs * p.speedMul / p.length);
    for (const r of ratios) assert.ok(Math.abs(r - ratios[0]) < 1e-9, `${name}: ${r} against ${ratios[0]}`);
    assert.ok(ratios[0] > 0, `${name}: no duration`);
    const muls = g.paths.map((p) => p.speedMul);
    assert.ok(Math.min(...muls) >= 0.35 && Math.max(...muls) <= 3.0, `${name}: ${Math.min(...muls)}..${Math.max(...muls)}`);
    assert.ok(Math.max(...muls) - Math.min(...muls) >= 2.0,
      `${name}: every trace at much the same rate (${(Math.max(...muls) - Math.min(...muls)).toFixed(2)})`);
  });
});

/* The stagger, in the geometry: a trace at the far corner starts seconds
   after one at the pins.  What that looks like on screen is measured in
   tests/e2e/start.e2e.ts, off the pixels. */
test('the further from the chip a trace starts, the later it does', () => {
  every((g, name) => {
    const cx = g.card.x + g.card.width / 2, cy = g.card.y + g.card.height / 2;
    const away = (p: { points: { x: number; y: number }[] }) => Math.hypot(p.points[0].x - cx, p.points[0].y - cy);
    const sorted = g.paths.slice().sort((a, b) => away(a) - away(b));
    const take = Math.max(1, Math.floor(sorted.length / 5));
    const mean = (ps: typeof sorted) => ps.reduce((s, p) => s + p.delayMs, 0) / ps.length;
    const near = mean(sorted.slice(0, take)), far = mean(sorted.slice(-take));
    assert.ok(far - near >= 2500, `${name}: the farthest fifth starts ${Math.round(far - near)} ms after the nearest`);
    assert.ok(g.grownMs >= far, `${name}: grown at ${g.grownMs} before the last trace starts`);
  });
});

/* What is left moving: a loop of pulses worked out from the seed, so a
   window open all afternoon costs the same as one just opened. */
test('the pulses: a few at once, a couple a second, and a loop that never runs out', () => {
  every((g, name) => {
    assert.ok(g.pulses.length > 20, `${name}: ${g.pulses.length} pulses in ${g.pulsePeriodMs} ms`);
    const starts = (g.pulses.length / g.pulsePeriodMs) * 1000;
    assert.ok(starts >= 1.5 && starts <= 3, `${name}: ${starts.toFixed(2)} pulses start a second`);
    // At any moment: three to six running, and never more than eight things
    // on the layer above once the flares that beat are counted.
    let least = Infinity, most = 0;
    for (let t = 0; t < g.pulsePeriodMs; t += 50) {
      let n = 0;
      // Both t and a period later, as the renderer counts them: a lane's
      // last pulse crosses the wrap and runs on into the next turn, which is
      // what keeps the loop from having a lull at its seam.
      for (const q of g.pulses) for (const now of [t, t + g.pulsePeriodMs]) {
        if (now >= q.startMs && now < q.startMs + q.durationMs) n++;
      }
      least = Math.min(least, n); most = Math.max(most, n);
    }
    assert.ok(most <= 6, `${name}: ${most} pulses at once`);
    assert.ok(least >= 3, `${name}: only ${least} pulses at once`);
    assert.ok(most + g.beats.length <= 8, `${name}: ${most + g.beats.length} things on the layer above`);
    for (const q of g.pulses) {
      const path = g.paths[q.path];
      assert.ok(path && path.id === q.path, `${name}: a pulse on no trace`);
      assert.equal(path.layer, 2, `${name}: a pulse on a trace of the board behind`);
    }
    for (const b of g.beats) assert.ok(g.flares[b.flare], `${name}: a beat on no flare`);
  });
  // Nothing of it is a CSS animation that loops: those cannot be photographed
  // (the capture tool freezes them) and they keep a thread awake for as long
  // as the window is open.
  assert.ok(!/animation:[^;]*infinite/.test(glintsCode), 'a CSS animation that never ends');
});

test('the same input gives the same board, to the byte', () => {
  const hash = (g: Geometry): string => createHash('sha256').update(JSON.stringify(g)).digest('hex');
  for (const [w, h] of SIZES) assert.equal(hash(at(w, h)), hash(at(w, h)), `${w}x${h} differs from itself`);
  assert.equal(hash(at(1280, 800)).slice(0, 16), GOLDEN_1280x800);
  assert.notEqual(hash(at(1280, 800)),
    hash(generate({ seed: SEED + 1, width: 1280, height: 800, dpr: 1, chipLabel: 'MIPS32', card: cardFor(1280, 800) })));
});

test('the pins follow the card: a card of another size or place puts them elsewhere', () => {
  const a = at(1280, 800);
  const b = at(1280, 800, { x: 40, y: 40, width: 360, height: 360 });
  assert.notDeepEqual(a.pins.map((p) => vkey(p.at)), b.pins.map((p) => vkey(p.at)));
  for (const pin of b.pins) {
    const edge = pin.side === 'top' ? pin.at.y === b.card.y
      : pin.side === 'bottom' ? pin.at.y === b.card.y + b.card.height
      : pin.side === 'left' ? pin.at.x === b.card.x : pin.at.x === b.card.x + b.card.width;
    assert.ok(edge, 'a pin of the smaller card is not on its edge');
  }
});

// Updated on purpose when the generator changes; see the test above.
const GOLDEN_1280x800 = '65c9aea8b3ef21fb';
