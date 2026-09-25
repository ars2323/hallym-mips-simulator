/* The Data tab: memory as a table, the way the Qt build's Data panel shows
   it (QtSpim/edu/edu_data_model.{h,cpp}):

     Address | +0 | +4 | +8 | +C | ASCII

   with the Labels column of the Qt build drawn as a thin row above the line
   it belongs to (a narrow panel has no room for a seventh column):

   - One section per segment -- user data, the stack (from $sp up), kernel
     data -- each under a header row with its range; kernel data starts
     folded.  The stack is drawn apart from the data (its own colour).
   - Rows are src/core/memory-rows.ts's: up to four words on a 16-byte line,
     a run of zero words as ONE row that says how long it is.
   - Every address is written the same way: 0x10010000.
   - ASCII is grouped by word, four characters under each +0..+C; pointing
     at a word lights its four characters, and the other way round.
   - Labels: the source's labels on the line (by offset), and $sp / $fp /
     $gp when they point into it (their word is tinted too), on a row of
     their own just above the line.
   - A narrow tab gives up margins, then a pixel of font, then the ASCII
     column (logic/columns.ts); "+ ASCII" in the head brings it back.  The
     four words stay. */

import { layoutMemoryRows, rowEnd } from '../../../core/memory-rows.ts';
import { memoryValueText } from '../../../core/memory-text.ts';
import { hex32 } from '../../../core/format.ts';
import type { LabelMap } from '../../../core/symbols.ts';
import { code, h, monoCh } from '../dom.ts';
import { fit, styles, type Column } from '../logic/columns.ts';
import { columnButton } from '../ui.ts';

export interface DataSection {
  kind: 'data' | 'stack' | 'kernel';
  from: number;
  to: number;          // one past the end
  words: number[];     // (to - from) / 4 of them
  bytes: Uint8Array;   // to - from of them
}

export interface Pointer { name: string; value: number } // $sp, $fp, $gp

const TITLES: Record<DataSection['kind'], string> = { data: 'User data', stack: 'Stack', kernel: 'Kernel data' };
// A word's cell in each base, in ch; ASCII: four groups of four, 5 px apart.
const CELL: Record<2 | 10 | 16, number> = { 16: 8, 10: 11, 2: 32 };
const ASCII: Column = { key: 'ascii', ch: 16, px: 19 };
// Padding (left and right together) and the gap between columns.
const NORMAL = { pad: 27, gap: 10 };
const TIGHT = { pad: 16, gap: 6 };
const printable = (c: number) => (c >= 0x20 && c <= 0x7e ? String.fromCharCode(c) : '·');
const offsetName = (n: number) => `+${n.toString(16).toUpperCase()}`;
const size = (bytes: number) => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KB`);

export class DataView {
  readonly root: HTMLElement;
  private folded = new Set<DataSection['kind']>(['kernel']);
  private last: { sections: DataSection[]; base: 2 | 10 | 16; labels: LabelMap; pointers: Pointer[] } | null = null;
  private forceAscii = false;
  private base: 2 | 10 | 16 = 16;
  onToggles: (buttons: HTMLElement[]) => void = () => {};

  constructor() {
    this.root = h('div', { class: 'pbody data' });
    new ResizeObserver(() => this.fit()).observe(this.root);
    // A word and its four characters light up together.
    this.root.addEventListener('pointerover', (e) => this.hover(e, true));
    this.root.addEventListener('pointerout', (e) => this.hover(e, false));
  }

  clear(): void {
    this.last = null;
    this.root.replaceChildren();
  }

  // Margins, font and the ASCII column for the width the tab has now.
  fit(): void {
    const width = this.root.clientWidth;
    if (!width) return;
    const fontPx = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs')) || 13) - 0.5;
    const ch = monoCh(fontPx);
    const all = styles(NORMAL, TIGHT, fontPx);
    const columns: Column[] = [{ key: 'daddr', ch: 10 }, ...[0, 1, 2, 3].map((i) => ({ key: `w${i}`, ch: CELL[this.base] })), ASCII];
    const f = fit(width, columns, [['ascii']], new Set(this.forceAscii ? ['ascii'] : []), ch, all);
    this.root.dataset.style = f.style.name;
    this.root.classList.toggle('hide-ascii', f.hidden.has('ascii'));
    const auto = fit(width, columns, [['ascii']], new Set(), ch, all).hidden.has('ascii');
    this.onToggles(auto ? [columnButton('ASCII', this.forceAscii, () => { this.forceAscii = !this.forceAscii; this.fit(); })] : []);
  }

  show(sections: DataSection[], base: 2 | 10 | 16, labels: LabelMap, pointers: Pointer[]): void {
    this.last = { sections, base, labels, pointers };
    if (base !== this.base) { this.base = base; this.fit(); }
    const table = h('div', { class: `dtable base-${base}` },
      h('div', { class: 'dhead' }, h('span', {}, 'Address'),
        ...['+0', '+4', '+8', '+C'].map((t) => h('span', { class: 'dval' }, t)),
        h('span', { class: 'ascii' }, 'ASCII')));
    for (const s of sections) table.append(...this.section(s, base, labels, pointers));
    this.root.replaceChildren(table);
  }

  private section(s: DataSection, base: 2 | 10 | 16, labels: LabelMap, pointers: Pointer[]): HTMLElement[] {
    const folded = this.folded.has(s.kind);
    const toggle = h('button', { class: 'dfold', type: 'button', 'aria-expanded': String(!folded) }, folded ? '▸' : '▾');
    const header = h('div', { class: `dsec dsec-${s.kind}` }, toggle,
      h('b', {}, TITLES[s.kind]), ' ', code(`${hex32(s.from)} – ${hex32(s.to - 1)}`, 'range'),
      h('span', { class: 'dsize' }, size(s.to - s.from)),
      folded ? h('span', { class: 'dhint' }, '눌러서 펼치기') : null);
    header.addEventListener('click', () => {
      if (this.folded.has(s.kind)) this.folded.delete(s.kind); else this.folded.add(s.kind);
      if (this.last) this.show(this.last.sections, this.last.base, this.last.labels, this.last.pointers);
    });
    if (folded) return [header];
    const word = (a: number) => s.words[(a - s.from) / 4];
    const out: HTMLElement[] = [header];
    for (const r of layoutMemoryRows(s.from, s.to, { word })) {
      const end = rowEnd(r);
      const tags = this.tags(r.address, end, labels, pointers, r.kind === 'ZeroRun');
      if (tags.length) out.push(h('div', { class: `dtags dsec-${s.kind}` }, ...tags));
      if (r.kind === 'ZeroRun') {
        out.push(h('div', { class: `drow dzero dsec-${s.kind}` },
          code(hex32(r.address), 'daddr'),
          h('span', { class: 'dzerotext' }, '~ ', code(hex32(end - 1)), ` · 모두 0 · ${r.words.toLocaleString('en-US')} words`)));
        continue;
      }
      const base16 = r.address & ~15;
      const cells: HTMLElement[] = [];
      const chars: HTMLElement[] = [];
      for (let slot = 0; slot < 4; slot += 1) {
        const a = base16 + 4 * slot;
        const present = a >= r.address && a < end;
        const pointed = present && pointers.some((p) => p.value >= a && p.value < a + 4);
        const v = present ? word(a) : 0;
        cells.push(h('span', { class: `dval${present ? '' : ' none'}${present && v === 0 ? ' zero' : ''}${pointed ? ' pointed' : ''}`,
          'data-slot': String(slot), title: present ? `${hex32(a)}` : undefined },
        present ? code(memoryValueText(v, 4, base)) : ''));
        const bytes = present ? [...s.bytes.subarray(a - s.from, a - s.from + 4)].map(printable).join('') : '    ';
        chars.push(h('span', { class: 'dch', 'data-slot': String(slot) }, bytes));
      }
      out.push(h('div', { class: `drow dsec-${s.kind}` }, code(hex32(base16), 'daddr'), ...cells,
        h('span', { class: 'dascii mono ascii' }, ...chars)));
    }
    return out;
  }

  // "+0 msg  +8 total   $sp → +4"
  private tags(from: number, to: number, labels: LabelMap, pointers: Pointer[], run: boolean): (HTMLElement | string)[] {
    const base16 = from & ~15;
    const where = (a: number) => (run ? hex32(a) : offsetName(a - base16));
    const out: (HTMLElement | string)[] = [];
    for (const [a, names] of labels.labelsIn(from, to).slice(0, 6)) {
      out.push(h('span', { class: 'dlabel' }, code(where(a), 'off'), ' ', code(names.join(' '))));
    }
    for (const p of pointers) {
      if (p.value >= from && p.value < to) out.push(h('span', { class: 'dptr' }, code(`${p.name} → ${where(p.value)}`)));
    }
    return out;
  }

  private hover(e: Event, on: boolean): void {
    const cell = (e.target as HTMLElement).closest('[data-slot]') as HTMLElement | null;
    const row = cell?.closest('.drow');
    if (!cell || !row) return;
    for (const el of row.querySelectorAll(`[data-slot="${cell.dataset.slot}"]`)) el.classList.toggle('lit', on);
  }
}
