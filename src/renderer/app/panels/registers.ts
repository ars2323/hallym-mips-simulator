/* The register panel.  One DOM row per register, made once; an update
   touches only the cells whose text changed and the rows whose highlight
   changed.  (The Qt build redrew the whole table on every step and fought
   flicker over several versions.)  perf.registers records what an update
   cost. */

import { cells, changedKeys, registerRows, type RegisterValues } from '../logic/machine.ts';
import { code, h } from '../dom.ts';
import { perf } from '../perf.ts';

interface Row { el: HTMLElement; hex: HTMLElement; dec: HTMLElement; bin: HTMLElement | null; last: string; flags: string }

export type RegisterMode = 'full' | 'compact';


export class RegisterPanel {
  readonly root: HTMLElement;
  private readonly rows = new Map<string, Row>();
  private readonly just: HTMLElement;
  private readonly mode: RegisterMode;

  constructor(mode: RegisterMode, initial: RegisterValues) {
    this.mode = mode;
    const full = mode === 'full';
    this.just = h('div', { class: 'justchanged', hidden: true });
    const head = h('div', { class: 'rhead' }, h('span', {}, '이름'), h('span', {}, '16진'), h('span', { class: 'right' }, '10진'),
      full ? h('span', {}, '2진') : null);
    const list = h('div', { class: `pbody regs-list${full ? '' : ' rsplit'}` });
    let group = '';
    const columns = full ? [list] : [h('div'), h('div')];
    const all = registerRows(initial, full); // CP0 only in the full panel, folded
    all.forEach((r, i) => {
      const target = full ? list : columns[i < Math.ceil(all.length / 2) ? 0 : 1];
      if (full && r.group !== group) {
        group = r.group;
        target.append(h('div', { class: `rgroup${group === 'CP0' ? ' cp0' : ''}` }, group === 'CP0' ? code('CP0') : group));
      }
      const hex = code('', 'hex');
      const dec = code('', 'dec');
      const bin = full ? code('', 'bin') : null;
      const el = h('div', { class: `rrow${r.group === 'CP0' ? ' cp0' : ''}`, 'data-reg': r.key }, h('span', { class: 'rn mono' }, r.key), hex, dec, bin);
      target.append(el);
      this.rows.set(r.key, { el, hex, dec, bin, last: '', flags: '' });
    });
    if (!full) list.append(...columns);
    const fold = h('div', { class: 'fold' });
    const setFold = (show: boolean) => {
      list.classList.toggle('show-cp0', show);
      const b = h('button', { class: 'linkbtn', type: 'button' }, show ? '숨기기' : '보기');
      b.addEventListener('click', () => setFold(!show));
      fold.replaceChildren(code('CP0'), show ? ' 레지스터' : ' 레지스터는 기본으로 숨김', b);
    };
    if (full) setFold(false);
    else fold.replaceChildren(code('CP0'), ' 레지스터는 넓은 화면에서');
    this.root = h('section', { class: `panel regs r-${mode}`, 'aria-label': '레지스터' },
      h('div', { class: 'phead' }, h('span', { class: 'name' }, '레지스터'), h('span', { class: 'grow' }),
        h('span', { class: 'meta' }, full ? '16진 · 10진 · 2진' : '16진 · 10진 — 2진은 바뀐 것만')),
      full ? null : this.just, head, list, fold);
    this.update(initial, null);
  }

  update(now: RegisterValues, before: RegisterValues | null): void {
    const t0 = performance.now();
    const changed = changedKeys(before, now);
    let touched = 0;
    const rows = registerRows(now, this.mode === 'full');
    for (const r of rows) {
      const row = this.rows.get(r.key)!;
      const c = cells(r.value);
      const text = c.hex;
      if (text !== row.last) {
        row.hex.textContent = c.hex;
        row.dec.textContent = c.dec;
        if (row.bin) row.bin.textContent = c.bin;
        row.last = text;
        touched += 1;
      }
      const flags = `${changed.has(r.key) ? 'c' : ''}${r.value === 0 ? 'z' : ''}`;
      if (flags !== row.flags) {
        row.el.classList.toggle('chg', changed.has(r.key));
        row.el.classList.toggle('zero', r.value === 0 && !changed.has(r.key));
        row.flags = flags;
      }
    }
    if (this.mode === 'compact') {
      const first = [...changed].find((k) => this.rows.has(k));
      this.just.hidden = first === undefined;
      if (first !== undefined) {
        const v = rows.find((r) => r.key === first)!.value;
        const c = cells(v);
        this.just.replaceChildren(h('b', {}, '방금 바뀜 '), code(`${first} ← ${c.hex} = ${c.dec}`), h('br'), code(c.bin));
      }
    }
    perf.registers.push({ ms: performance.now() - t0, rows: touched }); // rows whose text changed
  }
}
