/* The tutorial's card beside what a step points at, never over it
   (src/renderer/app/logic/placement.ts). */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { intersects, merge, place, type Rect } from '../../src/renderer/app/logic/placement.ts';

const view: Rect = { left: 0, top: 0, right: 1000, bottom: 600 };
const card = { width: 300, height: 150 };
const r = (left: number, top: number, w: number, h: number): Rect => ({ left, top, right: left + w, bottom: top + h });
const box = (p: { left: number; top: number }) => r(p.left, p.top, card.width, card.height);

test('place: right of the target first, then left, below, above', () => {
  assert.deepEqual(place([r(100, 200, 100, 40)], card, view), { left: 212, top: 145, side: 'right' });
  assert.equal(place([r(800, 200, 150, 40)], card, view)!.side, 'left');
  assert.equal(place([r(0, 50, 1000, 40)], card, view)!.side, 'below');
  assert.equal(place([r(0, 400, 1000, 150)], card, view)!.side, 'above');
});

test('place: never over any target, inside the window', () => {
  const targets = [r(100, 100, 200, 30), r(420, 80, 200, 400)];
  const p = place(targets, card, view)!;
  for (const t of targets) assert.ok(!intersects(box(p), t, 12), JSON.stringify(p));
  assert.ok(p.left >= 8 && p.top >= 8 && p.left + card.width <= 992 && p.top + card.height <= 592);
});

test('place: no side free around the targets -- the free spot nearest the first; none at all -- null', () => {
  // Targets on all four sides of the window's middle, leaving a free corner.
  const targets = [r(0, 0, 1000, 300), r(0, 300, 600, 300)];
  const p = place(targets, card, view)!;
  assert.ok(!targets.some((t) => intersects(box(p), t, 12)));
  assert.ok(p.left >= 612);
  assert.equal(place([r(0, 0, 1000, 600)], card, view), null);
});

test('merge: touching or overlapping rectangles become one box; apart ones stay apart', () => {
  assert.deepEqual(merge([r(0, 0, 10, 10), r(5, 5, 10, 10), r(100, 100, 5, 5)]), [r(0, 0, 15, 15), r(100, 100, 5, 5)]);
  assert.deepEqual(merge([r(0, 0, 10, 10), r(10, 0, 10, 10)]), [r(0, 0, 20, 10)]);
  assert.deepEqual(merge([r(0, 0, 10, 10), r(20, 0, 10, 10)]), [r(0, 0, 10, 10), r(20, 0, 10, 10)]);
});
