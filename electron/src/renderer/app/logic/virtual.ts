/* Which rows of a long list are worth having in the DOM: those in view and a
   few on each side.  The Text panel holds up to thousands of instructions
   (tt.core.s: 4,758) at a fixed row height. */

export interface Range { first: number; last: number } // [first, last)

export function visibleRange(scrollTop: number, viewport: number, rowHeight: number, count: number,
                             overscan = 10): Range {
  if (count === 0 || rowHeight <= 0) return { first: 0, last: 0 };
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const last = Math.min(count, Math.ceil((scrollTop + viewport) / rowHeight) + overscan);
  return { first, last: Math.max(first, last) };
}

// The scrollTop that shows row `index` with `margin` rows around it, moving
// as little as possible (not at all when it is already in view).
export function scrollToShow(index: number, scrollTop: number, viewport: number, rowHeight: number,
                             margin = 2): number {
  const top = (index - margin) * rowHeight;
  const bottom = (index + 1 + margin) * rowHeight;
  if (top < scrollTop) return Math.max(0, top);
  if (bottom > scrollTop + viewport) return Math.max(0, bottom - viewport);
  return scrollTop;
}
