/* The tutorial's card next to what a step points at, never over it
   (src/renderer/app/logic/placement.ts). */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { distance, intersects, merge, place, type Rect } from '../../src/renderer/app/logic/placement.ts';

const view: Rect = { left: 0, top: 40, right: 1000, bottom: 600 }; // under a 40-px title bar
const card = { width: 300, height: 150 };
const r = (left: number, top: number, w: number, h: number): Rect => ({ left, top, right: left + w, bottom: top + h });
const box = (p: { left: number; top: number }) => r(p.left, p.top, card.width, card.height);

test('place: right below the target, its middle over the target\'s -- a title-bar button included', () => {
  assert.deepEqual(place([r(400, 200, 100, 40)], card, view), { left: 300, top: 252, side: 'below' });
  // Two toolbar buttons 500 px apart: two places, each under its own button (not the bar's middle).
  const assemble = place([r(233, 5, 141, 28)], card, view)!;
  const step = place([r(675, 5, 94, 28)], card, view)!;
  assert.equal(assemble.side, 'below');
  assert.equal(step.side, 'below');
  assert.equal(assemble.left, 233 + 141 / 2 - 150);
  assert.equal(step.left, 675 + 94 / 2 - 150);
  assert.equal(assemble.top, 48); // right under the bar
});

test('place: no room below -- above; no room above either -- right, then left', () => {
  assert.equal(place([r(400, 480, 100, 40)], card, view)!.side, 'above');
  assert.equal(place([r(100, 200, 100, 200)], { width: 300, height: 250 }, view)!.side, 'right');
  assert.equal(place([r(800, 200, 100, 200)], { width: 300, height: 250 }, view)!.side, 'left');
});

test('place: slides along its row off the other targets and what is kept off, no further than reach', () => {
  // A toolbar button and another target under-left of it: the card slides right, clear of it, still under the button.
  const button = r(400, 5, 100, 28), other = r(200, 100, 120, 30);
  const p = place([button, other], card, view)!;
  assert.equal(p.side, 'below');
  assert.equal(p.left, 332); // the first spot clear of `other` (its right, 320, plus 12)
  assert.ok(!intersects(box(p), other, 12));
  assert.ok(distance(box(p), button) <= 48, JSON.stringify(p));
  // What the step keeps off is kept off too.
  const kept = place([r(400, 200, 100, 40)], card, view, [r(250, 240, 200, 200)])!;
  assert.ok(!intersects(box(kept), r(250, 240, 200, 200)), JSON.stringify(kept));
  assert.ok(distance(box(kept), r(400, 200, 100, 40)) <= 48, JSON.stringify(kept));
});

test('place: never over any target, inside the view', () => {
  const targets = [r(100, 100, 200, 30), r(420, 80, 200, 400)];
  const p = place(targets, card, view)!;
  for (const t of targets) assert.ok(!intersects(box(p), t, 12), JSON.stringify(p));
  assert.ok(p.left >= 8 && p.top >= 48 && p.left + card.width <= 992 && p.top + card.height <= 592);
});

test('place: nothing next to the target -- the free spot nearest it; none at all -- null', () => {
  // A target at the top with a second one filling the band under it: the only room is further down.
  const targets = [r(450, 40, 100, 40), r(0, 92, 1000, 300)];
  const p = place(targets, card, view)!;
  assert.equal(p.side, null);
  assert.ok(!targets.some((t) => intersects(box(p), t, 12)));
  assert.equal(p.top, 408); // the nearest row clear of the band (its bottom, 392, plus 12, on the 8-px grid)
  assert.equal(place([r(0, 40, 1000, 560)], card, view), null);
});

test('merge: touching or overlapping rectangles become one box; apart ones stay apart', () => {
  assert.deepEqual(merge([r(0, 0, 10, 10), r(5, 5, 10, 10), r(100, 100, 5, 5)]), [r(0, 0, 15, 15), r(100, 100, 5, 5)]);
  assert.deepEqual(merge([r(0, 0, 10, 10), r(10, 0, 10, 10)]), [r(0, 0, 20, 10)]);
  assert.deepEqual(merge([r(0, 0, 10, 10), r(20, 0, 10, 10)]), [r(0, 0, 10, 10), r(20, 0, 10, 10)]);
});
