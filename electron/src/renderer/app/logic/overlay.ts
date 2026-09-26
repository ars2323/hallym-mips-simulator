/* The colour of the window's caption buttons (Windows draws them, over a
   patch the page cannot paint: titleBarOverlay) while the page is covered.
   The tutorial dims the window with navy at 26 %; a dialog's backdrop is
   navy at 35 %; both at once, one over the other.  The patch is given the
   colour that white takes under the same layers, so it does not stand out
   as a bright square at the top right. */

export type Rgb = [number, number, number];

export const NAVY: Rgb = [0, 32, 91];
export const WHITE: Rgb = [255, 255, 255];
export const TUTORIAL_DIM = { color: NAVY, alpha: 0.26 };
export const DIALOG_BACKDROP = { color: NAVY, alpha: 0.35 };

export function composite(base: Rgb, layers: { color: Rgb; alpha: number }[]): Rgb {
  let out = base;
  for (const l of layers) out = out.map((v, i) => v * (1 - l.alpha) + l.color[i] * l.alpha) as Rgb;
  return out;
}

export const hex = (c: Rgb): string => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

// The buttons' patch: white, or white under what covers the page now.
export function overlayColor(tutorial: boolean, dialog: boolean): string {
  const layers = [];
  if (tutorial) layers.push(TUTORIAL_DIM);
  if (dialog) layers.push(DIALOG_BACKDROP);
  return hex(composite(WHITE, layers));
}
