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
  fitMeta(): void;   // no room for the whole note next to the controls: none of it
}

function head(cls: string, left: Node): Head {
  const meta = h('span', { class: 'pmeta', hidden: true }); // no note: nothing, not even its divider
  const aside = h('span', { class: 'paside' });
  const root = h('div', { class: `phead ${cls}` }, left, h('span', { class: 'pgrow' }), meta, aside);
  let empty = true;
  return {
    root, aside,
    setMeta: (text) => { meta.replaceChildren(text); empty = text === ''; meta.hidden = empty; },
    fitMeta: () => {
      if (empty) return;
      meta.hidden = false;
      meta.hidden = meta.scrollWidth > meta.clientWidth + 1;
    },
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

// A column the width took away, to turn back on ("+ Bin"), or one turned
// back on, to let go again ("Bin", pressed).  Compact: a narrow head holds
// two or three of them.
export function columnButton(name: string, on: boolean, onClick: () => void): HTMLButtonElement {
  const b = headButton(on ? name : `+ ${name}`, on ? '폭에 맞춰 다시 숨깁니다' : '좁아서 숨긴 열입니다. 누르면 보입니다', onClick);
  b.classList.add('colbtn');
  b.classList.toggle('on', on);
  b.setAttribute('aria-pressed', String(on));
  return b;
}

// A small button for a head's right-hand slot.
export function headButton(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const b = h('button', { class: 'hbtn', type: 'button', title }, label);
  b.addEventListener('click', onClick);
  return b;
}
