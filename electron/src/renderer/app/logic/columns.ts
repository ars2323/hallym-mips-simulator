/* Which columns a table shows at a width (Registers, Text).

   A lab PC (1366x768 at 125%) gives the whole window 1093 CSS px, and the
   columns this course is about -- Registers' Hex, Dec and Bin, Text's
   Address, Encoding and Instruction -- have to be there.  So a table gives
   way in this order, and only as far as it has to:

     1. its margins (the gaps between columns, the padding),
     2. its font, one pixel smaller,
     3. then whole columns, in the order the table names (`drops`): Text
        gives up Source and Line (the Editor shows both), then Format, then
        Address, and Encoding last; Registers gives up Dec, and Bin last;
        Data gives up its ASCII column, never a word.

   A column the student turns back on (`forced`) is added to what the width
   shows by itself, never in place of another; the table then scrolls
   sideways if it has to (`overflow`). */

export interface Column {
  key: string;
  ch?: number;     // width in the table's own ch (its monospaced font)
  px?: number;     // and/or in pixels: a dot, a badge, gaps inside a cell
}

export interface Style {
  name: 'normal' | 'tight' | 'small';
  pad: number;     // padding and border, left and right together, px
  gap: number;     // between two columns, px
  scale: number;   // font size against the normal one
}

export interface Fit {
  style: Style;
  hidden: Set<string>;   // columns not shown
  overflow: boolean;     // even this is wider than `width`
}

// The normal style, then tighter margins, then the smaller font.
export function styles(normal: { pad: number; gap: number }, tight: { pad: number; gap: number }, fontPx: number): Style[] {
  return [
    { name: 'normal', ...normal, scale: 1 },
    { name: 'tight', ...tight, scale: 1 },
    { name: 'small', ...tight, scale: (fontPx - 1) / fontPx },
  ];
}

// The width `columns` take in `style`, `ch` being the normal font's ch.
export function needed(columns: readonly Column[], style: Style, ch: number): number {
  const sum = columns.reduce((s, c) => s + (c.px ?? 0) + (c.ch ?? 0) * ch * style.scale, 0);
  return style.pad + sum + style.gap * Math.max(0, columns.length - 1);
}

// What the width shows by itself, then the columns turned back on added to
// it: turning one on never costs another.
export function fit(width: number, columns: readonly Column[], drops: readonly (readonly string[])[],
                    forced: ReadonlySet<string>, ch: number, all: readonly Style[]): Fit {
  const auto = fitting(width, columns, drops, ch, all);
  if (![...forced].some((key) => auto.hidden.has(key))) return auto;
  const hidden = new Set([...auto.hidden].filter((key) => !forced.has(key)));
  return best(width, columns.filter((c) => !hidden.has(c.key)), hidden, ch, all);
}

function fitting(width: number, columns: readonly Column[], drops: readonly (readonly string[])[],
                 ch: number, all: readonly Style[]): Fit {
  let last: Fit | null = null;
  for (let k = 0; k <= drops.length; k += 1) {
    const hidden = new Set(drops.slice(0, k).flat());
    last = best(width, columns.filter((c) => !hidden.has(c.key)), hidden, ch, all);
    if (!last.overflow) return last;
  }
  return last!;
}

// The roomiest style `shown` fits in; the tightest if none does.
function best(width: number, shown: readonly Column[], hidden: Set<string>, ch: number, all: readonly Style[]): Fit {
  for (const style of all) {
    if (needed(shown, style, ch) <= width) return { style, hidden, overflow: false };
  }
  return { style: all[all.length - 1], hidden, overflow: true };
}
