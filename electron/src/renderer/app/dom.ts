/* A few DOM helpers.  The rule they keep: anything that may be a
   hexadecimal literal is set in the mono font (Pretendard draws 0x1 as
   0×1), so text with code in it goes through code() or codeText(). */

import { codeParts } from '../../core/explain.ts';

type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string | boolean | undefined> = {},
                                                         ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

// One piece of code: register name, address, word, number.
export const code = (text: string, cls = ''): HTMLSpanElement => h('span', { class: `mono ${cls}`.trim() }, text);

// Prose with `code` parts (src/core/explain.ts, stop messages).  A word
// joiner holds a parenthesis to the word it belongs to -- 값(`0x…`)을 is one
// word, and Chromium would break before the "(" even with keep-all.
export function codeText(text: string): DocumentFragment {
  const f = document.createDocumentFragment();
  for (const p of codeParts(text)) f.append(p.code ? code(p.text) : document.createTextNode(p.text.replace(/([가-힣])\(/g, '$1\u2060(')));
  return f;
}

export const asset = (p: string): string => `../assets/${p}`;
export const icon = (name: string): HTMLImageElement => h('img', { class: 'icon', src: asset(`icons/lucide/${name}.svg`), alt: '' });
// Hallym characters: the original PNGs, scaled by CSS only, never under 76 px.
export const character = (name: string, height: number): HTMLImageElement =>
  h('img', { class: 'char', src: asset(`hallym/characters/${name}.png`), alt: '', style: `height:${Math.max(76, height)}px` });

// Prose from the core (error messages): the parts that look like numbers
// in hexadecimal go in the mono font.
const HEXISH = /(0[xX][0-9a-fA-F]+|\b[0-9a-fA-F]{8}\b)/;
export function withHex(text: string): DocumentFragment {
  const f = document.createDocumentFragment();
  text.split(HEXISH).forEach((p, i) => { if (p) f.append(i % 2 === 1 ? code(p) : document.createTextNode(p)); });
  return f;
}

// The width of one character of the mono font (D2Coding) at `px`: the unit
// the tables' columns are written in (logic/columns.ts).
const chCache = new Map<number, number>();
export function monoCh(px: number): number {
  let ch = chCache.get(px);
  if (ch === undefined) {
    const probe = h('span', { class: 'mono', style: `position:absolute;visibility:hidden;white-space:pre;font-size:${px}px` }, '0'.repeat(40));
    document.body.append(probe);
    ch = probe.getBoundingClientRect().width / 40;
    probe.remove();
    if (document.fonts.status === 'loaded') chCache.set(px, ch); // not the fallback's
  }
  return ch;
}

// Whether the student scrolled `el` in the last two seconds (the wheel, its
// scroll bar, the page keys): then nothing scrolls it for them.  The same
// rule as the Editor's line of PC.
export function userScrolls(el: HTMLElement): () => boolean {
  let at = 0;
  const mark = () => { at = Date.now(); };
  el.addEventListener('wheel', mark, { passive: true });
  el.addEventListener('pointerdown', (e) => { if (e.target === el) mark(); });
  el.addEventListener('keydown', (e) => { if (/^(Page|Home|End|Arrow)/.test(e.key)) mark(); });
  return () => Date.now() - at < 2000;
}
