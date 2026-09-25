/* The Text and Data tabs.

   Text lists the program's instructions: breakpoint gutter, address, word,
   format badge, disassembly, source line.  Only the rows in view (and a few
   around) are in the DOM (logic/virtual.ts); `?text=full` in the page's URL
   puts every row in instead, for measuring the difference.  Kernel text (the
   exception handler) is folded away at the end until asked for.

   Its columns give way to a narrow panel in this order (logic/columns.ts):
   margins, a pixel of font, Source and Line (the Editor shows both),
   Format, Address -- Encoding last: the machine code is what the course is
   about.  A column given up comes back from the head ("+ Encoding").

   Data is ./data.ts. */

import { hex32 } from '../../../core/format.ts';
import { code, h, monoCh } from '../dom.ts';
import { fit, needed, styles, type Column, type Fit } from '../logic/columns.ts';
import { columnButton, tabsHead, type TabsHead } from '../ui.ts';
import { DataView } from './data.ts';
import type { TextRow } from '../logic/machine.ts';
import { scrollToShow, visibleRange } from '../logic/virtual.ts';
import { perf } from '../perf.ts';

export interface TextEvents {
  select(addr: number): void;
  toggleBreakpoint(addr: number): void;
}

const FULL = new URLSearchParams(location.search).get('text') === 'full';

const COLUMNS: Column[] = [{ key: 'bpc', px: 12 }, { key: 'addr', ch: 8 }, { key: 'word', ch: 8 }, { key: 'fmt', px: 38 },
  { key: 'dis', ch: 18 }, { key: 'lno', ch: 4 }, { key: 'src', ch: 14 }];
const DROPS = [['src', 'lno'], ['fmt'], ['addr'], ['word']];
const NAMES: Record<string, string> = { src: 'Source', fmt: 'Format', addr: 'Address', word: 'Encoding' };
// Padding and border (left and right together) and the gap between columns.
const NORMAL = { pad: 19, gap: 12 };
const TIGHT = { pad: 11, gap: 6 };

export class TextPanel {
  readonly root: HTMLElement;
  private readonly viewport: HTMLElement;
  private readonly layer: HTMLElement;
  private readonly spacer: HTMLElement;
  private readonly fold: HTMLElement;
  readonly head: TabsHead;
  private readonly textView: HTMLElement;
  readonly dataView: HTMLElement;
  readonly data = new DataView();
  private all: TextRow[] = [];
  private shown: TextRow[] = [];
  private showKernel = false;
  private pc = -1;
  private selected = -1;
  private rendered = new Map<number, HTMLElement>(); // row index -> element
  private rowHeight = 22;
  private readonly events: TextEvents;
  private readonly header: HTMLElement;
  private readonly forced = new Set<string>();
  columns: Fit | null = null;
  tab: 'text' | 'data' = 'text';
  onTab: (tab: 'text' | 'data') => void = () => {};

  constructor(events: TextEvents) {
    this.events = events;
    this.spacer = h('div', { class: 'spacer' });
    this.layer = h('div', { class: 'layer' });
    this.fold = h('div', { class: 'fold' });
    this.viewport = h('div', { class: 'pbody text', tabindex: '0' }, this.spacer, this.layer);
    this.viewport.addEventListener('scroll', () => { this.renderWindow(); this.header.scrollLeft = this.viewport.scrollLeft; });
    this.viewport.addEventListener('click', (e) => this.click(e));
    this.head = tabsHead(['Text', 'Data'], (i) => this.setTab(i === 0 ? 'text' : 'data'));
    this.header = h('div', { class: 'theader' }, h('span', { class: 'bpc' }), h('span', { class: 'addr' }, 'Address'), h('span', { class: 'word' }, 'Encoding'),
      h('span', { class: 'fmt' }, 'Format'), h('span', { class: 'dis' }, 'Instruction'), h('span', { class: 'lno right' }, 'Line'), h('span', { class: 'src' }, 'Source'));
    this.textView = h('div', { class: 'tview' }, this.header, this.viewport, this.fold);
    this.dataView = this.data.root;
    this.data.onToggles = (buttons) => { if (this.tab === 'data') this.setAside(buttons); };
    this.dataView.hidden = true;
    this.root = h('section', { class: 'panel textpanel', 'aria-label': 'Text' }, this.head.root, this.textView, this.dataView);
    // Resized (a window maximised, a fold line wrapping): PC stays in view.
    new ResizeObserver(() => {
      this.fit();
      const i = this.shown.findIndex((x) => x.addr === this.pc);
      if (i >= 0) this.reveal(i); else this.renderWindow();
    }).observe(this.viewport);
  }

  // The least width Address, Encoding, Format and Instruction take, with
  // tight margins; scroll bar and border in.
  leastWidth(fontPx: number): number {
    const [, tight] = styles(NORMAL, TIGHT, fontPx);
    const chrome = (this.viewport.offsetWidth - this.viewport.clientWidth || 12) + 2;
    return Math.ceil(needed(COLUMNS.filter((c) => c.key !== 'src' && c.key !== 'lno'), tight, monoCh(fontPx)) + chrome);
  }

  // Columns and style for the width the panel has now.
  fit(): void {
    const width = this.viewport.clientWidth;
    if (!width) return;
    const fontPx = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs')) || 13;
    const ch = monoCh(fontPx);
    const all = styles(NORMAL, TIGHT, fontPx);
    const f = fit(width, COLUMNS, DROPS, this.forced, ch, all);
    const width_ = (c: Column) => (c.px !== undefined ? `${c.px}px` : `${c.ch}ch`);
    const src = !f.hidden.has('src');
    const template = COLUMNS.filter((c) => !f.hidden.has(c.key)).map((c) =>
      c.key === 'dis' ? (src ? 'minmax(18ch, 36ch)' : 'minmax(18ch, 1fr)') : c.key === 'src' ? 'minmax(14ch, 1fr)' : width_(c)).join(' ');
    this.root.style.setProperty('--tcols', template);
    this.root.style.setProperty('--tmin', `${Math.ceil(needed(COLUMNS.filter((c) => !f.hidden.has(c.key)), f.style, ch))}px`);
    this.root.dataset.style = f.style.name;
    for (const key of ['src', 'lno', 'fmt', 'addr', 'word']) this.root.classList.toggle(`hide-${key}`, f.hidden.has(key));
    this.root.classList.toggle('overflow', f.overflow);
    this.columns = f;
    this.renderToggles(fit(width, COLUMNS, DROPS, new Set(), ch, all).hidden);
  }

  // The columns the width takes away, to turn back on (Text tab only).
  private renderToggles(auto: Set<string>): void {
    const keys = [...auto].filter((k) => k in NAMES);
    if (this.tab !== 'text') return;
    this.setAside(keys.map((key) => {
      const on = this.forced.has(key);
      return columnButton(NAMES[key], on, () => {
        if (on) this.forced.delete(key); else this.forced.add(key);
        if (key === 'src') { if (on) this.forced.delete('lno'); else this.forced.add('lno'); }
        this.fit();
      });
    }));
  }

  private setAside(buttons: HTMLElement[]): void {
    this.head.aside.replaceChildren(...buttons);
    this.head.aside.hidden = buttons.length === 0;
    this.head.fitMeta();
  }

  setTab(tab: 'text' | 'data'): void {
    this.tab = tab;
    this.head.select(tab === 'text' ? 0 : 1);
    this.textView.hidden = tab !== 'text';
    this.dataView.hidden = tab !== 'data';
    if (tab === 'text') this.fit(); else this.data.fit();
    this.onTab(tab);
  }

  setRows(rows: TextRow[]): void {
    const t0 = performance.now();
    this.all = rows;
    this.refilter();
    // Measured to the frame after, so that style and layout are in it.
    requestAnimationFrame(() => setTimeout(() => perf.text.push(
      { ms: performance.now() - t0, rows: this.shown.length, nodes: this.rendered.size })));
  }

  // After a font size change: the row height follows it.
  relayout(): void {
    this.refilter();
  }

  private refilter(): void {
    this.shown = this.showKernel ? this.all : this.all.filter((r) => !r.kernel);
    const kernel = this.all.filter((r) => r.kernel).length;
    this.fold.replaceChildren(this.showKernel ? `Kernel code(예외 처리기) 명령 ${kernel}개도 보이는 중 ` : `Kernel code(예외 처리기) 명령 ${kernel}개는 숨겨 두었습니다 `,
      Object.assign(h('button', { class: 'linkbtn', type: 'button' }, this.showKernel ? 'Hide' : 'Show'),
        { onclick: () => { this.showKernel = !this.showKernel; this.refilter(); } }));
    this.fold.hidden = kernel === 0;
    this.head.setMeta(this.all.length ? `${this.all.length - kernel} instructions` : '');
    this.rowHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--row')) || 22;
    this.sizeSpacer();
    for (const el of this.rendered.values()) el.remove();
    this.rendered.clear();
    this.renderWindow();
  }

  private sizeSpacer(): void {
    this.spacer.style.height = `${this.shown.length * this.rowHeight}px`;
  }

  setBreakpoint(addr: number, on: boolean): void {
    const r = this.all.find((x) => x.addr === addr);
    if (r) r.breakpoint = on;
    const i = this.shown.findIndex((x) => x.addr === addr);
    this.rendered.get(i)?.classList.toggle('bp-on', on);
  }

  setPc(addr: number, scroll = true): void {
    const before = this.shown.findIndex((x) => x.addr === this.pc);
    this.pc = addr;
    const i = this.shown.findIndex((x) => x.addr === addr);
    this.rendered.get(before)?.classList.remove('pc');
    this.rendered.get(i)?.classList.add('pc');
    if (scroll && i >= 0) this.reveal(i);
  }

  setSelected(addr: number): void {
    const before = this.shown.findIndex((x) => x.addr === this.selected);
    this.selected = addr;
    const i = this.shown.findIndex((x) => x.addr === addr);
    this.rendered.get(before)?.classList.remove('sel');
    this.rendered.get(i)?.classList.add('sel');
    if (i >= 0) this.reveal(i);
  }

  // Keep `index` in view.
  reveal(index: number): void {
    const view = this.viewport.clientHeight;
    const top = scrollToShow(index, this.viewport.scrollTop, view, this.rowHeight);
    if (top !== this.viewport.scrollTop) this.viewport.scrollTop = top;
    this.renderWindow();
  }

  // For the tutorial: the row of `addr` into view; a column shown whatever
  // the width (true if it was not already), and let go again.
  revealAddr(addr: number): void {
    const i = this.shown.findIndex((x) => x.addr === addr);
    if (i >= 0) this.reveal(i);
  }
  // As RegisterPanel.showColumn.
  showColumn(key: 'word' | 'addr' | 'fmt'): 'already' | 'hidden' | 'shown' {
    if (this.forced.has(key)) return 'already';
    const hidden = this.columns?.hidden.has(key) ?? false;
    this.forced.add(key);
    this.fit();
    return hidden ? 'hidden' : 'shown';
  }
  releaseColumn(key: 'word' | 'addr' | 'fmt'): void {
    this.forced.delete(key);
    this.fit();
  }

  rowFor(addr: number): TextRow | undefined {
    return this.all.find((x) => x.addr === addr);
  }

  private renderWindow(): void {
    const { first, last } = FULL ? { first: 0, last: this.shown.length }
      : visibleRange(this.viewport.scrollTop, this.viewport.clientHeight || 800, this.rowHeight, this.shown.length);
    for (const [i, el] of this.rendered) {
      if (i < first || i >= last) { el.remove(); this.rendered.delete(i); }
    }
    for (let i = first; i < last; i += 1) {
      if (this.rendered.has(i)) continue;
      const el = this.row(this.shown[i]);
      el.style.top = `${i * this.rowHeight}px`;
      this.rendered.set(i, el);
      this.layer.append(el);
    }
  }

  private row(r: TextRow): HTMLElement {
    const cls = ['trow', r.addr === this.pc ? 'pc' : '', r.addr === this.selected ? 'sel' : '', r.band ? 'band' : '',
      r.breakpoint ? 'bp-on' : ''].filter(Boolean).join(' ');
    return h('div', { class: cls, 'data-addr': hex32(r.addr) },
      h('span', { class: 'bp', title: 'Breakpoint' }),
      code(hex32(r.addr).slice(2), 'addr'), code(hex32(r.word).slice(2), 'word'),
      h('span', { class: 'fmt' }, h('span', { class: `badge b-${r.format}` }, r.format)),
      code(r.disassembly, 'dis'), code(r.line ? String(r.line) : '', 'lno'), code(r.source, 'src'));
  }

  private click(e: MouseEvent): void {
    const rowEl = (e.target as HTMLElement).closest('.trow') as HTMLElement | null;
    if (!rowEl) return;
    const addr = parseInt(rowEl.dataset.addr!, 16);
    if ((e.target as HTMLElement).classList.contains('bp')) this.events.toggleBreakpoint(addr);
    else this.events.select(addr);
  }

}
