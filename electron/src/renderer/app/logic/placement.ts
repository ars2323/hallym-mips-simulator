/* Where the tutorial's card goes: next to what a step points at, never over
   it (logic only; tutorial.ts draws).

   The first target is what the card is about.  Tried in order: right below
   it, then right above it -- the card's middle over the target's middle --
   then right of it, then left of it (its middle level with the target's).
   Each of the four slides along its row (or column) only as far as it must
   to keep off the other targets and what the step keeps off, and no
   further than `reach` from the first target.  Failing all four, the free
   spot nearest the first target.  A spot counts only if the card is inside
   the view and keeps `gap` from every target.

   (Before 2.7.0 the card also kept off the lit panels, and they were tried
   as places to stand beside: a title-bar button's lit area is the whole
   title bar, so every toolbar step's card stood under the bar's middle,
   whichever button it was about.)

   `side` says where the card is against the first target; null when it is
   simply somewhere free. */

export interface Rect { left: number; top: number; right: number; bottom: number }
export type Side = 'right' | 'left' | 'below' | 'above';
export interface Placement { left: number; top: number; side: Side | null }

export const width = (r: Rect) => r.right - r.left;
export const height = (r: Rect) => r.bottom - r.top;

export function intersects(a: Rect, b: Rect, gap = 0): boolean {
  return a.left < b.right + gap && b.left < a.right + gap && a.top < b.bottom + gap && b.top < a.bottom + gap;
}

// The gap between two boxes (0 when they touch or overlap).
export function distance(a: Rect, b: Rect): number {
  const dx = Math.max(0, b.left - a.right, a.left - b.right);
  const dy = Math.max(0, b.top - a.bottom, a.top - b.bottom);
  return Math.hypot(dx, dy);
}

// Rectangles that touch or overlap, merged into their bounding boxes (the
// dimmed layer cuts one hole per box; overlapping holes would fill again).
export function merge(rects: readonly Rect[], gap = 1): Rect[] {
  const out = rects.map((r) => ({ ...r }));
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < out.length && !changed; i += 1) {
      for (let j = i + 1; j < out.length && !changed; j += 1) {
        if (intersects(out[i], out[j], gap)) {
          out[i] = { left: Math.min(out[i].left, out[j].left), top: Math.min(out[i].top, out[j].top),
            right: Math.max(out[i].right, out[j].right), bottom: Math.max(out[i].bottom, out[j].bottom) };
          out.splice(j, 1);
          changed = true;
        }
      }
    }
  }
  return out;
}

export function place(targets: readonly Rect[], size: { width: number; height: number }, view: Rect,
                      keepOff: readonly Rect[] = [], gap = 12, margin = 8, reach = 48): Placement | null {
  const first = targets[0];
  const box = (left: number, top: number): Rect => ({ left, top, right: left + size.width, bottom: top + size.height });
  const fits = (left: number, top: number) => {
    const card = box(left, top);
    return card.left >= view.left + margin && card.top >= view.top + margin
      && card.right <= view.right - margin && card.bottom <= view.bottom - margin
      && targets.every((t) => !intersects(card, t, gap)) && keepOff.every((k) => !intersects(card, k));
  };
  // Along a row (or a column): the position nearest `ideal` that `ok` takes, or null.
  const nearest = (ideal: number, lo: number, hi: number, ok: (v: number) => boolean): number | null => {
    for (let d = 0; ideal - d >= lo - 4 || ideal + d <= hi + 4; d += 4) {
      for (const v of d ? [ideal - d, ideal + d] : [ideal]) {
        const at = Math.max(lo, Math.min(hi, v));
        if (ok(at)) return at;
      }
    }
    return null;
  };
  if (first) {
    const cx = (first.left + first.right) / 2 - size.width / 2;
    const cy = (first.top + first.bottom) / 2 - size.height / 2;
    // Right below may start at the view's top (a title-bar button's box ends above it).
    const rows: [Side, number][] = [['below', Math.max(first.bottom + gap, view.top + margin)], ['above', first.top - gap - size.height]];
    for (const [side, top] of rows) {
      const left = nearest(cx, view.left + margin, view.right - margin - size.width,
        (l) => fits(l, top) && Math.max(0, first.left - (l + size.width), l - first.right) <= reach);
      if (left !== null) return { left, top, side };
    }
    const columns: [Side, number][] = [['right', first.right + gap], ['left', first.left - gap - size.width]];
    for (const [side, left] of columns) {
      const top = nearest(cy, view.top + margin, view.bottom - margin - size.height,
        (t) => fits(left, t) && Math.max(0, first.top - (t + size.height), t - first.bottom) <= reach);
      if (top !== null) return { left, top, side };
    }
  }
  // Anywhere free, nearest the first target (the window's middle when there is none).
  const mx = (view.left + view.right) / 2, my = (view.top + view.bottom) / 2;
  const anchor = first ?? { left: mx, top: my, right: mx, bottom: my };
  let best: Placement | null = null;
  let bestD = Infinity;
  for (let top = view.top + margin; top + size.height <= view.bottom - margin; top += 8) {
    for (let left = view.left + margin; left + size.width <= view.right - margin; left += 8) {
      if (!fits(left, top)) continue;
      const d = distance(box(left, top), anchor);
      if (d < bestD) { bestD = d; best = { left, top, side: null }; }
    }
  }
  return best;
}
