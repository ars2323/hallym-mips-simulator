/* Where the tutorial's card goes: beside what a step points at, never over
   it (logic only; tutorial.ts draws).

   Tried in order: right of the first target, left, below, above; then the
   same around the other targets; then any free spot in the window, the one
   nearest the first target.  A spot counts only if the card is inside the
   window and keeps `gap` from every target.  `side` says where the card
   is against the target (for the pointer and for which end of the card
   Haram stands at: the far one); null when it is simply somewhere free. */

export interface Rect { left: number; top: number; right: number; bottom: number }
export type Side = 'right' | 'left' | 'below' | 'above';
export interface Placement { left: number; top: number; side: Side | null }

export const width = (r: Rect) => r.right - r.left;
export const height = (r: Rect) => r.bottom - r.top;

export function intersects(a: Rect, b: Rect, gap = 0): boolean {
  return a.left < b.right + gap && b.left < a.right + gap && a.top < b.bottom + gap && b.top < a.bottom + gap;
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
                      gap = 12, margin = 8): Placement | null {
  const fits = (left: number, top: number) => {
    const card = { left, top, right: left + size.width, bottom: top + size.height };
    return card.left >= view.left + margin && card.top >= view.top + margin
      && card.right <= view.right - margin && card.bottom <= view.bottom - margin
      && targets.every((t) => !intersects(card, t, gap));
  };
  const clampX = (x: number) => Math.max(view.left + margin, Math.min(x, view.right - margin - size.width));
  const clampY = (y: number) => Math.max(view.top + margin, Math.min(y, view.bottom - margin - size.height));
  for (const t of targets) {
    const cx = (t.left + t.right) / 2 - size.width / 2;
    const cy = (t.top + t.bottom) / 2 - size.height / 2;
    const tries: [Side, number, number][] = [
      ['right', t.right + gap, clampY(cy)],
      ['left', t.left - gap - size.width, clampY(cy)],
      ['below', clampX(cx), t.bottom + gap],
      ['above', clampX(cx), t.top - gap - size.height],
    ];
    for (const [side, left, top] of tries) if (fits(left, top)) return { left, top, side };
  }
  // Anywhere free, nearest the first target.
  const first = targets[0];
  const fx = first ? (first.left + first.right) / 2 : (view.left + view.right) / 2;
  const fy = first ? (first.top + first.bottom) / 2 : (view.top + view.bottom) / 2;
  let best: Placement | null = null;
  let bestD = Infinity;
  for (let top = view.top + margin; top + size.height <= view.bottom - margin; top += 8) {
    for (let left = view.left + margin; left + size.width <= view.right - margin; left += 8) {
      if (!fits(left, top)) continue;
      const d = Math.hypot(left + size.width / 2 - fx, top + size.height / 2 - fy);
      if (d < bestD) { bestD = d; best = { left, top, side: null }; }
    }
  }
  return best;
}
