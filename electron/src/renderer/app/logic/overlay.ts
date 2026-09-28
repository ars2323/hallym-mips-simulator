/* The colour of the window's caption buttons (Windows draws them, over a
   patch the page cannot paint: titleBarOverlay) on the first screen and
   while the page is covered.
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

// The patch and its symbols' colour.  On the first screen the title bar is
// dark glass over the photo: the patch is transparent there (Windows takes
// the alpha: docs/start-variants/combined/README.md), so the bar shows
// through it -- and so does whatever covers the page -- and the symbols are
// white.  Everywhere else the bar is white: the patch white, or white under
// what covers the page, with navy symbols.
export interface CaptionPatch { color: string; symbolColor: string }
export const WHITE_PATCH: CaptionPatch = { color: '#ffffff', symbolColor: hex(NAVY) };
export const FIRST_SCREEN_PATCH: CaptionPatch = { color: '#00000000', symbolColor: '#ffffff' };
export function captionPatch(firstScreen: boolean, tutorial: boolean, dialog: boolean): CaptionPatch {
  if (firstScreen) return FIRST_SCREEN_PATCH;
  return { color: overlayColor(tutorial, dialog), symbolColor: WHITE_PATCH.symbolColor };
}
