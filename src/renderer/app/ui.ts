/* The two heads every panel is made from (one height, one font, one set of
   margins, one place for controls on the right):

     panelHead   a panel's name: Editor, Registers, Inspector, Console
     tabsHead    names that compete for one place: Text / Data

   Everything on the right (counts, switches, buttons) goes into `aside`,
   separated from each other, so that two of them never read as one. */

import { h } from './dom.ts';

export interface Head {
  root: HTMLElement;
  aside: HTMLElement;   // the right-hand slot
  setMeta(text: string | Node): void;  // a quiet count or note, left of the controls
}

function head(cls: string, left: Node): Head {
  const meta = h('span', { class: 'pmeta' });
  const aside = h('span', { class: 'paside' });
  const root = h('div', { class: `phead ${cls}` }, left, h('span', { class: 'pgrow' }), meta, aside);
  return {
    root, aside,
    setMeta: (text) => { meta.replaceChildren(text); meta.hidden = text === ''; },
  };
}

export function panelHead(title: string): Head {
  return head('', h('span', { class: 'ptitle' }, title));
}

export interface TabsHead extends Head {
  tabs: HTMLButtonElement[];
  select(index: number): void;
}

export function tabsHead(titles: string[], onSelect: (index: number) => void): TabsHead {
  const tabs = titles.map((t, i) => {
    const b = h('button', { class: 'ptab', type: 'button', role: 'tab' }, t);
    b.addEventListener('click', () => { select(i); onSelect(i); });
    return b;
  });
  const select = (i: number) => tabs.forEach((t, k) => {
    t.classList.toggle('on', k === i);
    t.setAttribute('aria-selected', String(k === i));
  });
  const hd = head('with-tabs', h('span', { class: 'ptabs', role: 'tablist' }, ...tabs));
  select(0);
  return { ...hd, tabs, select };
}

// A small button for a head's right-hand slot.
export function headButton(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const b = h('button', { class: 'hbtn', type: 'button', title }, label);
  b.addEventListener('click', onClick);
  return b;
}
