/* The register panel.  One DOM row per register, made once; an update
   touches only the cells whose text changed and the rows whose highlight
   changed.  (The Qt build redrew the whole table on every step and fought
   flicker over several versions.)  perf.registers records what an update
   cost.

   What to look at first:
     - the register that just changed: a yellow row with a bar (and a
       "Changed" tag where there is room), flashed once when it changes; it
       lifts at the next step.  After a step the list scrolls to it, unless
       the student is scrolling it (dom.ts userScrolls);
     - its value in hexadecimal (the strongest column); decimal quieter,
       binary quietest;
     - groups as bands (Special, Constant, Return values, Arguments,
       Temporaries, Saved, Pointers, Return address, Reserved: logic/
       machine.ts WINDOW_GROUPS), each with the registers it holds;
     - zero registers dimmed.

   Hex, Dec and Bin together are what the course is about: at a narrow width
   the panel gives up its margins and a pixel of font before a column, then
   Dec, and Bin last (logic/columns.ts).  A column given up comes back from
   the head ("+ Bin"). */

import { cells, changedKeys, registerRows, type RegisterValues } from '../logic/machine.ts';
import { fit, needed, styles, type Column, type Fit } from '../logic/columns.ts';
import { code, h, monoCh, userScrolls } from '../dom.ts';
import { perf } from '../perf.ts';
import { columnButton, panelHead, type Head } from '../ui.ts';

interface Row { el: HTMLElement; hex: HTMLElement; dec: HTMLElement; bin: HTMLElement; last: string; flags: string }

const COLUMNS: Column[] = [{ key: 'rn', ch: 7 }, { key: 'hex', ch: 10.5 }, { key: 'dec', ch: 10.5 }, { key: 'bin', ch: 28.5 }];
const TAG: Column = { key: 'tag', px: 62 };
const DROPS = [['dec'], ['bin']];
const NAMES: Record<string, string> = { dec: 'Dec', bin: 'Bin' };
// Padding and border (left and right together) and the gap between columns.
const NORMAL = { pad: 22, gap: 10 };
const TIGHT = { pad: 14, gap: 6 };

export class RegisterPanel {
  readonly root: HTMLElement;
  private readonly head: Head;
  private readonly list: HTMLElement;
  private readonly rhead: HTMLElement;
  private readonly rows = new Map<string, Row>();
  private readonly order: string[] = [];
  private readonly forced = new Set<string>();
  private readonly scrolledByStudent: () => boolean;
  columns: Fit | null = null;

  constructor(initial: RegisterValues) {
    this.rhead = h('div', { class: 'rhead' }, h('span', { class: 'rn' }, 'Name'), h('span', { class: 'hex strong' }, 'Hex'),
      h('span', { class: 'dec right' }, 'Dec'), h('span', { class: 'bin' }, 'Bin'));
    this.list = h('div', { class: 'pbody regs-list' }, this.rhead);
    const all = registerRows(initial, true); // CP0 folded below
    const groups = new Map<string, string[]>();
    for (const r of all) groups.set(r.group, [...(groups.get(r.group) ?? []), r.key]);
    let group = '';
    for (const r of all) {
      if (r.group !== group) {
        group = r.group;
        const keys = groups.get(group)!;
        const span = keys.length > 1 ? `${keys[0]}–${keys[keys.length - 1]}` : keys[0];
        this.list.append(h('div', { class: `rgroup${group === 'CP0' ? ' cp0' : ''}` },
          group === 'CP0' ? code('CP0') : h('span', { class: 'gname' }, group), code(span, 'gspan')));
      }
      const hex = code('', 'hex');
      const dec = code('', 'dec');
      const bin = code('', 'bin');
      const el = h('div', { class: `rrow${r.group === 'CP0' ? ' cp0' : ''}`, 'data-reg': r.key },
        h('span', { class: 'rn mono' }, r.key), hex, dec, bin, h('span', { class: 'tag' }, 'Changed'));
      this.list.append(el);
      this.rows.set(r.key, { el, hex, dec, bin, last: '', flags: '' });
      this.order.push(r.key);
    }
    const fold = h('div', { class: 'fold' });
    const setFold = (show: boolean) => {
      this.list.classList.toggle('show-cp0', show);
      const b = h('button', { class: 'linkbtn', type: 'button' }, show ? 'Hide' : 'Show');
      b.addEventListener('click', () => setFold(!show));
      const n = this.order.filter((k) => this.rows.get(k)!.el.classList.contains('cp0')).length;
      fold.replaceChildren(h('span', { class: 'foldtext' }, code('CP0'), show ? ` 레지스터 ${n}개 보이는 중` : ` 레지스터 ${n}개 숨김`), b);
    };
    setFold(false);
    this.head = panelHead('Registers');
    this.head.setMeta('노란 줄은 방금 바뀐 레지스터');
    this.root = h('section', { class: 'panel regs', 'aria-label': 'Registers' }, this.head.root, this.list, fold);
    this.scrolledByStudent = userScrolls(this.list);
    new ResizeObserver(() => this.fit()).observe(this.list);
    this.update(initial, null);
  }

  // The width the panel wants: all of Hex, Dec and Bin with tight margins
  // (`least`), and with room to spare (`most`).  Scroll bar and border in.
  widths(fontPx: number): { least: number; most: number } {
    const ch = monoCh(fontPx);
    const [normal, tight] = styles(NORMAL, TIGHT, fontPx);
    const chrome = (this.list.offsetWidth - this.list.clientWidth || 12) + 2;
    return { least: Math.ceil(needed(COLUMNS, tight, ch) + chrome), most: Math.ceil(needed([...COLUMNS, TAG], normal, ch) + chrome) };
  }

  // Columns and style for the width the panel has now.
  fit(): void {
    const width = this.list.clientWidth;
    if (!width) return;
    const fontPx = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs')) || 13;
    const ch = monoCh(fontPx);
    const all = styles(NORMAL, TIGHT, fontPx);
    const f = fit(width, COLUMNS, DROPS, this.forced, ch, all);
    const tag = f.style.name === 'normal' && f.hidden.size === 0 && needed([...COLUMNS, TAG], all[0], ch) <= width;
    const cols = COLUMNS.filter((c) => !f.hidden.has(c.key));
    const template = cols.map((c) => `${c.ch}ch`).join(' ') + (tag ? ` ${TAG.px}px` : '') + ' minmax(0, 1fr)';
    this.root.style.setProperty('--rcols', template);
    this.root.dataset.style = f.style.name;
    for (const key of ['dec', 'bin']) this.root.classList.toggle(`hide-${key}`, f.hidden.has(key));
    this.root.classList.toggle('hide-tag', !tag);
    this.root.classList.toggle('overflow', f.overflow);
    this.columns = f;
    // The columns the width takes away, to turn back on.
    const auto = fit(width, COLUMNS, DROPS, new Set(), ch, all).hidden;
    this.head.aside.replaceChildren(...[...auto].map((key) => {
      const on = this.forced.has(key);
      return columnButton(NAMES[key], on, () => {
        if (on) this.forced.delete(key); else this.forced.add(key);
        this.fit();
      });
    }));
    this.head.fitMeta();
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
        // Four bits to a group, the groups a few pixels apart (not a space:
        // the eight groups have to fit next to Hex and Dec).
        row.bin.replaceChildren(...c.bin.split(' ').map((n) => h('span', {}, n)));
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
    const first = this.order.find((k) => changed.has(k) && k !== 'PC');
    if (first && !this.scrolledByStudent()) this.reveal(this.rows.get(first)!.el);
  }

  // For the tutorial: a register's row into view; a column shown whatever
  // the width (true if it was not already), and let go again.
  revealRegister(key: string): void {
    const row = this.rows.get(key);
    if (row) this.reveal(row.el);
  }
  // 'already': turned on before (leave it on); 'hidden': the width had
  // taken it away; 'shown': it was there anyway.
  showColumn(key: 'dec' | 'bin'): 'already' | 'hidden' | 'shown' {
    if (this.forced.has(key)) return 'already';
    const hidden = this.columns?.hidden.has(key) ?? false;
    this.forced.add(key);
    this.fit();
    return hidden ? 'hidden' : 'shown';
  }
  releaseColumn(key: 'dec' | 'bin'): void {
    this.forced.delete(key);
    this.fit();
  }

  // Scrolls as little as possible to have `row` in view, below the sticky
  // column head, with a row to spare on either side.
  private reveal(row: HTMLElement): void {
    if (!row.offsetParent) return; // a folded CP0 row
    const list = this.list;
    const margin = row.offsetHeight;
    const top = row.offsetTop - this.rhead.offsetHeight - margin;
    const bottom = row.offsetTop + row.offsetHeight + margin;
    if (top < list.scrollTop) list.scrollTop = Math.max(0, top);
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }
}
