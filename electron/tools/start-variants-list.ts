/* Candidate designs for the first screen, for choosing -- not the app's.
   Each is CSS laid over the app as it is (and, where needed, a little
   script), applied at run time by tools/start-variants.ts and by the
   Windows probe (tools/probe-platform.ts); nothing in src/ changes.  The
   one chosen is then written into src/renderer/app/app.css properly.

   The app's own values, for reference (app.css, "first screen"):
     .wback img, video   filter: blur(3px) saturate(.85); transform: scale(1.03)
     .wback::after       radial navy, rgba(0,32,91,.78) centre -> .5 edges
     .wcard              opaque white, 780 px wide, padding 36/40, shadow 0 18 60 */

import type { Running } from '../tests/e2e/harness.ts';

export interface Overlay { color: string; symbolColor: string }

// The caption buttons' patch over the dark glass title bar (drawn by Windows, not the page):
// see-through if Windows takes the alpha; else an opaque navy near the bar's own mean over
// the clip (31,68,114 at every second of it, Linux: tools/start-variants.ts).
export const OVERLAYS: Record<string, Overlay> = {
  transparent: { color: '#00000000', symbolColor: '#ffffff' },
  navy: { color: '#1f4472', symbolColor: '#ffffff' },
};

export interface Variant {
  id: string;
  name: string;
  what: string;        // one or two lines: tint, blur, card, bars
  css: string;
  titlebarOverlay?: Overlay; // the caption buttons' patch (Windows), when the bar changes: pictured on the whole screen with each of OVERLAYS
  glass?: boolean;     // the card shows the ground: measure what it does to it
  probe?: boolean;     // measured (contrast), not pictured
}

// A smaller card: the character column and the padding brought to the content.
const SMALLER_CARD = `
  .wcard { grid-template-columns: 168px 460px; gap: 0 28px; width: auto; padding: 28px 32px; border-radius: 16px; }
  .wcard img.char { height: 168px !important; }`;

export const VARIANTS: Variant[] = [
  {
    id: '1-current',
    name: '1. Current',
    what: 'As released (2.5.0): tint navy .78 behind the card to .5 at the edges, blur 3 px, saturate .85; opaque white card 780 px; white title and status bars.',
    css: '',
  },
  {
    id: '2-light-tint',
    name: '2. Light tint',
    what: 'Tint navy .22 (edges .3), blur 3 px; the clip warmed and its greens back: saturate 1.25, sepia .1, hue -6°. Card as it is.',
    css: `
  .wback img, .wback video { filter: blur(3px) saturate(1.25) sepia(.1) hue-rotate(-6deg) !important; }
  .wback::after { background: radial-gradient(ellipse 70% 70% at 50% 50%, rgba(0,32,91,.22), rgba(0,32,91,.3)) !important; }`,
  },
  {
    id: '3-smeared',
    name: '3. Smeared',
    what: 'Blur 28 px (9x), scaled 1.15 to hide the blurred edge: a place no more, moving colour. Tint navy .35 even; saturate 1.3, sepia .08. Smaller card (168 px character, padding 28/32), softer shadow.',
    css: `
  .wback img, .wback video { filter: blur(28px) saturate(1.3) sepia(.08) !important; transform: scale(1.15) !important; }
  .wback::after { background: rgba(0,32,91,.35) !important; }
  .wcard { box-shadow: 0 10px 40px rgba(0,16,46,.28) !important; }` + SMALLER_CARD,
  },
  {
    id: '4-glass',
    name: '4. Glass card',
    glass: true,
    what: 'Card white at .82 with backdrop-filter blur 18 px, saturate 1.2, a light border: the ground shows through it. Buttons at .8. Ground: tint navy .35, blur 6 px. Smaller card.',
    css: `
  .wback img, .wback video { filter: blur(6px) saturate(1.1) !important; }
  .wback::after { background: rgba(0,32,91,.35) !important; }
  .wcard { background: rgba(255,255,255,.82) !important; -webkit-backdrop-filter: blur(18px) saturate(1.2); backdrop-filter: blur(18px) saturate(1.2);
           border: 1px solid rgba(255,255,255,.55) !important; box-shadow: 0 10px 40px rgba(0,16,46,.25) !important; }
  .action { background: rgba(255,255,255,.8) !important; }
  .action.main { background: rgba(232,240,250,.85) !important; }` + SMALLER_CARD,
  },
  {
    id: '5-whole-window',
    name: '5. Photo under the whole window',
    what: 'The photo under the title bar and the status bar too: both dark glass over it (navy .3, backdrop blur 16 px), white text and icons, no border lines -- one screen, not three bands. The photo a shade darker at the top and bottom for the bars. Tint navy .4, blur 8 px, saturate 1.15. Smaller card.',
    titlebarOverlay: OVERLAYS.transparent,
    css: `
  .wback { position: fixed !important; inset: 0 !important; }
  .work { background: transparent !important; }
  .titlebar, .status { position: relative; z-index: 2; background: rgba(0,20,56,.3) !important; border-color: transparent !important;
                       -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px); }
  .titlebar .appname { color: #fff !important; }
  .titlebar .iconbtn img { filter: brightness(0) invert(1); opacity: .9 !important; }
  .status { color: rgba(255,255,255,.85) !important; }
  .wback img, .wback video { filter: blur(8px) saturate(1.15) !important; transform: scale(1.06) !important; }
  .wback::after { background: linear-gradient(rgba(0,20,56,.35), transparent 12%, transparent 88%, rgba(0,20,56,.35)), rgba(0,32,91,.4) !important; }
  .wcard { box-shadow: 0 10px 40px rgba(0,16,46,.3) !important; }` + SMALLER_CARD,
  },
  {
    id: '6-neutral',
    name: '6. Neutral dark',
    what: 'No hue pushed: darkened and desaturated only (brightness .62, saturate .7, sepia .06 to take the blue edge off), blur 6 px, a black veil .18. The photo keeps its own colours, and nothing blue meets the white card. Smaller card.',
    css: `
  .wback img, .wback video { filter: blur(6px) brightness(.62) saturate(.7) sepia(.06) !important; }
  .wback::after { background: rgba(0,0,0,.18) !important; }
  .wback { background: #1e2126 !important; }
  .wcard { box-shadow: 0 10px 40px rgba(0,0,0,.35) !important; }` + SMALLER_CARD,
  },
  {
    id: '7-no-video',
    name: '7. No video: the app\'s palette',
    what: 'No photo: a soft gradient of the app\'s own colours (navy to blue, a touch of teal low right, a light glow behind the card). Smaller card.',
    css: `
  .wback video, .wback img { display: none !important; }
  .wback { background: radial-gradient(ellipse 60% 50% at 50% 48%, rgba(255,255,255,.10), transparent 70%),
                       radial-gradient(ellipse 55% 60% at 88% 92%, rgba(0,169,165,.35), transparent 70%),
                       linear-gradient(160deg, #00205b 0%, #0a3a80 55%, #0055a5 100%) !important; }
  .wback::after { display: none !important; }
  .wcard { box-shadow: 0 10px 40px rgba(0,10,30,.35) !important; }` + SMALLER_CARD,
  },
];

// ---- The combinations (second round): the photo under the whole window (5) with the glass
// card (4), with 2's colour correction, and the card opaque again for comparison.

const WHOLE_WINDOW = `
  .wback { position: fixed !important; inset: 0 !important; }
  .work { background: transparent !important; }
  .titlebar, .status { position: relative; z-index: 2; background: rgba(0,20,56,.3) !important; border-color: transparent !important;
                       -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px); }
  .titlebar .appname { color: #fff !important; }
  .titlebar .iconbtn img { filter: brightness(0) invert(1); opacity: .9 !important; }
  .status { color: rgba(255,255,255,.85) !important; }
  .wback img, .wback video { transform: scale(1.06) !important; }
  .wback::after { background: linear-gradient(rgba(0,20,56,.35), transparent 12%, transparent 88%, rgba(0,20,56,.35)), rgba(0,32,91,.4) !important; }`;
const GROUND_5 = `
  .wback img, .wback video { filter: blur(8px) saturate(1.15) !important; }`;
const GROUND_2 = `
  .wback img, .wback video { filter: blur(8px) saturate(1.25) sepia(.1) hue-rotate(-6deg) !important; }`;
const glassCard = (alpha: number) => `
  .wcard { background: rgba(255,255,255,${alpha}) !important; -webkit-backdrop-filter: blur(18px) saturate(1.2); backdrop-filter: blur(18px) saturate(1.2);
           border: 1px solid rgba(255,255,255,.55) !important; box-shadow: 0 10px 40px rgba(0,16,46,.25) !important; }
  .action { background: rgba(255,255,255,.8) !important; }
  .action.main { background: rgba(232,240,250,.85) !important; }`;
const OPAQUE_CARD = `
  .wcard { box-shadow: 0 10px 40px rgba(0,16,46,.3) !important; }`;
const DARK_TEXT = `
  .wcard p.lead, .action .sub { color: #4b5563 !important; }`;

export const COMBINED: Variant[] = [
  {
    id: 'A-window-glass', name: 'A. Whole window + glass card', glass: true, titlebarOverlay: OVERLAYS.transparent,
    what: '5 + 4: the photo under the whole window, dark glass bars; the card glass (white .82, backdrop blur 18 px). Ground: tint navy .4, blur 8 px, saturate 1.15.',
    css: WHOLE_WINDOW + GROUND_5 + glassCard(.82) + SMALLER_CARD,
  },
  {
    id: 'B-window-glass-colour', name: 'B. A + the colour correction', glass: true, titlebarOverlay: OVERLAYS.transparent,
    what: 'A with 2\'s colour correction on the photo: saturate 1.25, sepia .1, hue -6° (blur 8 px). Card glass .82.',
    css: WHOLE_WINDOW + GROUND_2 + glassCard(.82) + SMALLER_CARD,
  },
  {
    id: 'C-window-opaque-colour', name: 'C. Whole window, opaque card, colour', titlebarOverlay: OVERLAYS.transparent,
    what: 'B with the card opaque white again: one window, glass only in the two bars.',
    css: WHOLE_WINDOW + GROUND_2 + OPAQUE_CARD + SMALLER_CARD,
  },
  {
    id: 'D-window-glass-colour-90', name: 'D. B, card at .90', glass: true, titlebarOverlay: OVERLAYS.transparent,
    what: 'B with the card white at .90 (from .82): the contrast fix by opacity.',
    css: WHOLE_WINDOW + GROUND_2 + glassCard(.90) + SMALLER_CARD,
  },
];

// Contrast only (not pictured): the two ways to bring the glass card's secondary text over
// 4.5:1, and the state a mutant would make (the card thinner than the design).
export const CONTRAST_PROBES: Variant[] = [
  { id: 'B-86', name: 'B, card .86', glass: true, probe: true, what: 'B, card white .86.', css: WHOLE_WINDOW + GROUND_2 + glassCard(.86) + SMALLER_CARD },
  { id: 'B-dark-text', name: 'B, darker text', glass: true, probe: true, what: 'B (.82), secondary text #4b5563 (7.56:1 on white).', css: WHOLE_WINDOW + GROUND_2 + glassCard(.82) + SMALLER_CARD + DARK_TEXT },
  { id: 'B-86-dark-text', name: 'B, card .86, darker text', glass: true, probe: true, what: 'B at .86 with #4b5563.', css: WHOLE_WINDOW + GROUND_2 + glassCard(.86) + SMALLER_CARD + DARK_TEXT },
  { id: 'B-72', name: 'B, card .72 (a mutant\'s state)', glass: true, probe: true, what: 'B with the card at .72: too thin.', css: WHOLE_WINDOW + GROUND_2 + glassCard(.72) + SMALLER_CARD },
];

// ---- The app as built (2.6.0: B with #4b5563), and the states its mutants make, for the thresholds.
export const APP: Variant[] = [
  { id: 'app', name: 'The app', glass: true, what: 'The first screen as the app draws it: nothing laid over it.', css: '' },
  { id: 'app-72', name: 'The app, card .72', glass: true, probe: true, what: 'The card thinner (a mutant).',
    css: '.wcard { background: rgba(255,255,255,.72) !important; }' },
  { id: 'app-65', name: 'The app, card .65', glass: true, probe: true, what: 'Thinner still, in case .72 keeps 4.5:1.',
    css: '.wcard { background: rgba(255,255,255,.65) !important; }' },
];

export const SETS: Record<string, Variant[]> = { first: VARIANTS, combined: [...COMBINED, ...CONTRAST_PROBES], app: APP };

// Lays a design over the running app (its style replaces any earlier one's).
export async function applyVariant(r: Running, v: Variant, overlay: Overlay | undefined = v.titlebarOverlay): Promise<void> {
  await r.page.evaluate((css) => {
    document.getElementById('variant')?.remove();
    const st = document.createElement('style');
    st.id = 'variant';
    st.textContent = css;
    document.head.append(st);
  }, v.css);
  if (overlay) {
    await r.app.evaluate(({ BrowserWindow }, o) => {
      try { BrowserWindow.getAllWindows()[0].setTitleBarOverlay(o); } catch { /* not on this platform */ }
    }, overlay);
  }
}
