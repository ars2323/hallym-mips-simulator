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

// Prose with `code` parts (src/core/explain.ts, stop messages).
export function codeText(text: string): DocumentFragment {
  const f = document.createDocumentFragment();
  for (const p of codeParts(text)) f.append(p.code ? code(p.text) : document.createTextNode(p.text));
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
