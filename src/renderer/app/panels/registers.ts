/* The register panel.  One DOM row per register, made once; an update
   touches only the cells whose text changed and the rows whose highlight
   changed.  (The Qt build redrew the whole table on every step and fought
   flicker over several versions.)  perf.registers records what an update
   cost.

   What to look at first:
     - the register that just changed: a yellow row with a bar and a tag,
       flashed once when it changes; it lifts at the next step;
     - its value in hexadecimal (the strongest column); decimal quieter,
       binary quietest -- and only where the panel is wide enough;
     - groups as bands (특수, 반환값, 인자, 임시, 보존, 포인터, 예약), each with the
       registers it holds;
     - zero registers dimmed. */

import { cells, changedKeys, registerRows, type RegisterValues } from '../logic/machine.ts';
import { code, h } from '../dom.ts';
import { perf } from '../perf.ts';
import { panelHead } from '../ui.ts';

interface Row { el: HTMLElement; hex: HTMLElement; dec: HTMLElement; bin: HTMLElement; last: string; flags: string }

export class RegisterPanel {
  readonly root: HTMLElement;
  private readonly rows = new Map<string, Row>();

  constructor(initial: RegisterValues) {
    const head = h('div', { class: 'rhead' }, h('span', {}, '이름'), h('span', { class: 'strong' }, '16진'),
      h('span', { class: 'right' }, '10진'), h('span', { class: 'binh' }, '2진'));
    const list = h('div', { class: 'pbody regs-list' });
    const all = registerRows(initial, true); // CP0 folded below
    const groups = new Map<string, string[]>();
    for (const r of all) groups.set(r.group, [...(groups.get(r.group) ?? []), r.key]);
    let group = '';
    for (const r of all) {
      if (r.group !== group) {
        group = r.group;
        const keys = groups.get(group)!;
        const span = keys.length > 1 ? `${keys[0]}–${keys[keys.length - 1]}` : keys[0];
        list.append(h('div', { class: `rgroup${group === 'CP0' ? ' cp0' : ''}` },
          group === 'CP0' ? code('CP0') : h('span', { class: 'gname' }, group), code(span, 'gspan')));
      }
      const hex = code('', 'hex');
      const dec = code('', 'dec');
      const bin = code('', 'bin');
      const el = h('div', { class: `rrow${r.group === 'CP0' ? ' cp0' : ''}`, 'data-reg': r.key },
        h('span', { class: 'rn mono' }, r.key), hex, dec, bin, h('span', { class: 'tag' }, '바뀜'));
      list.append(el);
      this.rows.set(r.key, { el, hex, dec, bin, last: '', flags: '' });
    }
    const fold = h('div', { class: 'fold' });
    const setFold = (show: boolean) => {
      list.classList.toggle('show-cp0', show);
      const b = h('button', { class: 'linkbtn', type: 'button' }, show ? '숨기기' : '보기');
      b.addEventListener('click', () => setFold(!show));
      fold.replaceChildren(code('CP0'), show ? ' 레지스터' : ' 레지스터는 기본으로 숨김', b);
    };
    setFold(false);
    const title = panelHead('Registers');
    title.setMeta('노란 줄: 방금 바뀐 것');
    this.root = h('section', { class: 'panel regs', 'aria-label': 'Registers' }, title.root, head, list, fold);
    this.update(initial, null);
  }

  update(now: RegisterValues, before: RegisterValues | null): void {
    const t0 = performance.now();
    const changed = changedKeys(before, now);
    let touched = 0;
    for (const r of registerRows(now, true)) {
      const row = this.rows.get(r.key)!;
      const c = cells(r.value);
      if (c.hex !== row.last) {
        row.hex.textContent = c.hex;
        row.dec.textContent = c.dec;
        row.bin.textContent = c.bin;
        row.last = c.hex;
        touched += 1;
      }
      const isChanged = changed.has(r.key);
      const flags = `${isChanged ? 'c' : ''}${r.value === 0 ? 'z' : ''}`;
      if (flags !== row.flags) {
        row.el.classList.toggle('chg', isChanged);
        row.el.classList.toggle('zero', r.value === 0 && !isChanged);
        row.flags = flags;
      }
      if (isChanged) { // flash again, even if it was changed at the last step too
        row.el.classList.remove('flash');
        void row.el.offsetWidth;
        row.el.classList.add('flash');
      }
    }
    perf.registers.push({ ms: performance.now() - t0, rows: touched }); // rows whose text changed
  }
}
