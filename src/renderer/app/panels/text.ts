/* The Text and Data tabs.

   Text lists the program's instructions: breakpoint gutter, address, word,
   format badge, disassembly, source line.  Only the rows in view (and a few
   around) are in the DOM (logic/virtual.ts); `?text=full` in the page's URL
   puts every row in instead, for measuring the difference.  Kernel text (the
   exception handler) is folded away at the end until asked for.

   Data lists the data segment and the stack as memory rows
   (src/core/memory-rows.ts). */

import { layoutMemoryRows, rowEnd } from '../../../core/memory-rows.ts';
import { asciiText, memoryValueText } from '../../../core/memory-text.ts';
import { hex32 } from '../../../core/format.ts';
import { code, h } from '../dom.ts';
import type { TextRow } from '../logic/machine.ts';
import { scrollToShow, visibleRange } from '../logic/virtual.ts';
import { perf } from '../perf.ts';

export interface TextEvents {
  select(addr: number): void;
  toggleBreakpoint(addr: number): void;
  openInspector(): void;
}

const FULL = new URLSearchParams(location.search).get('text') === 'full';

export class TextPanel {
  readonly root: HTMLElement;
  private readonly viewport: HTMLElement;
  private readonly layer: HTMLElement;
  private readonly spacer: HTMLElement;
  private readonly fold: HTMLElement;
  private readonly tabText: HTMLElement;
  private readonly tabData: HTMLElement;
  private readonly textView: HTMLElement;
  readonly dataView: HTMLElement;
  private all: TextRow[] = [];
  private shown: TextRow[] = [];
  private showKernel = false;
  private pc = -1;
  private selected = -1;
  private rendered = new Map<number, HTMLElement>(); // row index -> element
  private rowHeight = 22;
  private bottomPad = 0; // room under the last row, so that any row can come above the sheet
  private readonly events: TextEvents;
  tab: 'text' | 'data' = 'text';
  onTab: (tab: 'text' | 'data') => void = () => {};

  constructor(events: TextEvents) {
    this.events = events;
    this.spacer = h('div', { class: 'spacer' });
    this.layer = h('div', { class: 'layer' });
    this.fold = h('div', { class: 'fold' });
    this.viewport = h('div', { class: 'pbody text', tabindex: '0' }, this.spacer, this.layer);
    this.viewport.addEventListener('scroll', () => this.renderWindow());
    this.viewport.addEventListener('click', (e) => this.click(e));
    this.tabText = h('button', { class: 'tab on', type: 'button' }, 'Text');
    this.tabData = h('button', { class: 'tab', type: 'button' }, 'Data');
    this.tabText.addEventListener('click', () => this.setTab('text'));
    this.tabData.addEventListener('click', () => this.setTab('data'));
    const header = h('div', { class: 'theader' }, h('span'), h('span', {}, '주소'), h('span', { class: 'word' }, '기계어'),
      h('span', {}, '형식'), h('span', {}, '명령'), h('span', { class: 'right' }, '줄'), h('span', {}, '소스'));
    this.textView = h('div', { class: 'tview' }, header, this.viewport, this.fold);
    this.dataView = h('div', { class: 'pbody data', hidden: true });
    const inspect = h('button', { class: 'linkbtn', type: 'button', title: 'Inspector (I)' }, '명령 보기');
    inspect.addEventListener('click', () => this.events.openInspector());
    this.root = h('section', { class: 'panel textpanel', 'aria-label': 'Text' },
      h('div', { class: 'phead' }, h('span', { class: 'tabs' }, this.tabText, this.tabData), h('span', { class: 'grow' }),
        h('span', { class: 'meta count' }), inspect),
      this.textView, this.dataView);
    new ResizeObserver(() => this.renderWindow()).observe(this.viewport);
  }

  setTab(tab: 'text' | 'data'): void {
    this.tab = tab;
    this.tabText.classList.toggle('on', tab === 'text');
    this.tabData.classList.toggle('on', tab === 'data');
    this.textView.hidden = tab !== 'text';
    this.dataView.hidden = tab !== 'data';
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
    this.fold.replaceChildren(`커널 코드(예외 처리기) ${kernel}개 명령 ${this.showKernel ? '보이는 중' : '숨김'} `,
      Object.assign(h('button', { class: 'linkbtn', type: 'button' }, this.showKernel ? '숨기기' : '보기'),
        { onclick: () => { this.showKernel = !this.showKernel; this.refilter(); } }));
    this.fold.hidden = kernel === 0;
    (this.root.querySelector('.count') as HTMLElement).textContent = `명령 ${this.all.length - kernel}개`;
    this.rowHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--row')) || 22;
    this.sizeSpacer();
    for (const el of this.rendered.values()) el.remove();
    this.rendered.clear();
    this.renderWindow();
  }

  private sizeSpacer(): void {
    this.spacer.style.height = `${this.shown.length * this.rowHeight + this.bottomPad}px`;
  }

  // The sheet covers `px` of the list's bottom (0: closed).
  setCovered(px: number): void {
    const pad = Math.max(0, px - this.fold.offsetHeight);
    if (pad === this.bottomPad) return;
    this.bottomPad = pad;
    this.sizeSpacer();
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
    if (scroll && i >= 0) this.reveal(i, this.bottomPad);
  }

  setSelected(addr: number): void {
    const before = this.shown.findIndex((x) => x.addr === this.selected);
    this.selected = addr;
    const i = this.shown.findIndex((x) => x.addr === addr);
    this.rendered.get(before)?.classList.remove('sel');
    this.rendered.get(i)?.classList.add('sel');
    if (i >= 0) this.reveal(i);
  }

  // Keep `index` in view -- above `covered` px at the bottom (the sheet).
  reveal(index: number, covered = 0): void {
    const view = this.viewport.clientHeight - covered;
    const top = scrollToShow(index, this.viewport.scrollTop, view, this.rowHeight);
    if (top !== this.viewport.scrollTop) this.viewport.scrollTop = top;
    this.renderWindow();
  }

  revealSelected(): void {
    const i = this.shown.findIndex((x) => x.addr === this.selected);
    if (i >= 0) this.reveal(i, this.bottomPad);
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
      h('span', { class: 'bp', title: '브레이크포인트' }),
      code(hex32(r.addr).slice(2), 'addr'), code(hex32(r.word).slice(2), 'word'),
      h('span', {}, h('span', { class: `badge b-${r.format}` }, r.format)),
      code(r.disassembly, 'dis'), code(r.line ? String(r.line) : '', 'lno'), code(r.source, 'src'));
  }

  private click(e: MouseEvent): void {
    const rowEl = (e.target as HTMLElement).closest('.trow') as HTMLElement | null;
    if (!rowEl) return;
    const addr = parseInt(rowEl.dataset.addr!, 16);
    if ((e.target as HTMLElement).classList.contains('bp')) this.events.toggleBreakpoint(addr);
    else this.events.select(addr);
  }

  // ---- Data -------------------------------------------------------------------

  showData(sections: { name: string; from: number; to: number; words: number[]; bytes: Uint8Array }[], base: 2 | 10 | 16): void {
    const out: Node[] = [];
    for (const s of sections) {
      out.push(h('div', { class: 'dsection' }, s.name, ' ', code(`[${hex32(s.from)}..${hex32(s.to)})`)));
      const word = (a: number) => s.words[(a - s.from) / 4];
      for (const r of layoutMemoryRows(s.from, s.to, { word })) {
        if (r.kind === 'ZeroRun') {
          out.push(h('div', { class: 'drow zero' }, code(hex32(r.address).slice(2), 'addr'),
            code(`..${hex32(rowEnd(r) - 1).slice(2)}  0 (${r.words}워드)`, 'vals')));
        } else {
          const values = Array.from({ length: r.words }, (_, i) => memoryValueText(word(r.address + 4 * i), 4, base));
          const bytes = s.bytes.subarray(r.address - s.from, r.address - s.from + 4 * r.words);
          out.push(h('div', { class: 'drow' }, code(hex32(r.address).slice(2), 'addr'), code(values.join('  '), 'vals'),
            code(asciiText(bytes), 'chars')));
        }
      }
    }
    this.dataView.replaceChildren(...out);
  }
}
