/* The first screen's background: 12 seconds of Hallym University's
   promotional video (assets/hallym/start/, NOTICE 8), without sound, looping.

   - Its still (the clip's first frame) is there at once; the clip fades in
     over it once it plays, so nothing waits for the video.
   - prefers-reduced-motion: the still only, and the clip is not loaded.
   - A clip that cannot play: neither, the brand's navy (app.css) -- never
     white, and no message.
   - Off the first screen the clip is unloaded, not only paused.

   One element for both steps of the first screen (welcome.ts): a step
   changes the card's buttons, never this, so the video runs on.

   The files come from tools/start-video.ts; the blur and the tint that
   keep the card readable are app.css's (.wback), not the file's. */

import { asset, h } from '../dom.ts';

export const START_CLIP = asset('hallym/start/start.webm');
export const START_STILL = asset('hallym/start/start.jpg');

export interface Backdrop {
  root: HTMLElement;
  show(on: boolean): void;
}

export function backdrop(): Backdrop {
  const still = h('img', { class: 'still', src: START_STILL, alt: '', decoding: 'async' });
  // No sound track in the file; muted all the same, so a replacement with one stays silent.
  const clip = h('video', { class: 'clip', muted: true, loop: true, playsinline: true, disablepictureinpicture: true, preload: 'auto', tabindex: '-1' });
  clip.muted = true;
  const root = h('div', { class: 'wback', 'aria-hidden': 'true' }, still, clip);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let shown = false;

  const fail = () => { root.classList.add('failed'); unload(); };
  const unload = () => {
    root.classList.remove('playing');
    if (!clip.hasAttribute('src')) return;
    clip.pause();
    clip.removeAttribute('src');
    clip.load(); // lets go of the file and the decoder
  };
  const update = () => {
    if (!shown || reduce.matches || root.classList.contains('failed')) { unload(); return; }
    if (!clip.hasAttribute('src')) clip.src = START_CLIP;
    clip.play().catch((e: Error) => { if (e.name !== 'AbortError') fail(); }); // AbortError: unloaded meanwhile
  };
  still.addEventListener('error', () => root.classList.add('nostill'));
  clip.addEventListener('playing', () => root.classList.add('playing'));
  clip.addEventListener('error', () => { if (clip.hasAttribute('src')) fail(); });
  reduce.addEventListener('change', update);
  return { root, show: (on) => { if (on !== shown) { shown = on; update(); } } }; // layout() calls it often
}
