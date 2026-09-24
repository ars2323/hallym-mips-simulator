/* The Inspector: the chosen instruction taken apart, in a sheet that comes
   up from the bottom of the Text panel.

     head      disassembly, format, source line, word and address
     bits      the fields as one strip, each as wide as its bits
     table     field, bits, binary, value, meaning (instruction-text.ts)
     explain   one sentence with the values it will use (core/explain.ts)

   Kept low: at 1280x800 the sheet has to leave most of the Text rows
   visible (docs/screens/README.md).  Before anything is chosen it shows the
   sign character and says where to choose. */

import { decode, formatName, type BranchConvention } from '../../../core/decoder.ts';
import { explain } from '../../../core/explain.ts';
import { hex32 } from '../../../core/format.ts';
import { instructionNoteLines, meaningOf } from '../../../core/instruction-text.ts';
import { character, code, codeText, h } from '../dom.ts';
import type { TextRow } from '../logic/machine.ts';

export class Inspector {
  readonly root: HTMLElement;
  private readonly body: HTMLElement;
  onClose: () => void = () => {};

  constructor() {
    this.body = h('div', { class: 'ibody' });
    this.root = h('section', { class: 'insp sheet', 'aria-label': 'Inspector', hidden: true }, h('div', { class: 'grip' }), this.body);
    this.empty();
  }

  get open(): boolean { return !this.root.hidden; }
  set open(on: boolean) { this.root.hidden = !on; }

  private closeButton(): HTMLElement {
    const b = h('button', { class: 'iconbtn close', type: 'button', title: '닫기 (Esc)', 'aria-label': '닫기' }, '✕');
    b.addEventListener('click', () => this.onClose());
    return b;
  }

  empty(): void {
    this.body.replaceChildren(
      h('div', { class: 'ihead' }, h('span', { class: 'grow' }), this.closeButton()),
      h('div', { class: 'empty' }, character('sign', 96),
        h('div', { class: 'say' }, h('h3', {}, 'Text 에서 명령어를 고르세요'),
          h('p', {}, '고른 명령의 비트 필드와 하는 일이 여기에 나옵니다.'))));
  }

  // `convention`: how the machine was assembled (Settings > delayed branches).
  show(row: TextRow, general: readonly number[], convention: BranchConvention = 'SpimNoDelaySlot'): void {
    const d = decode(row.word, row.addr, convention);
    const fields = d.fields.map((f) => {
      const width = f.high - f.low + 1;
      return {
        name: f.name, high: f.high, low: f.low, width,
        bits: f.value.toString(2).padStart(width, '0'),
        value: f.name === 'immediate' ? String(d.simm) : String(f.value),
        meaning: meaningOf(f, d),
      };
    });
    const cls = (name: string) => `f-${name}`;
    const strip = h('div', { class: 'bits' }, ...fields.map((f) =>
      h('div', { class: `f ${cls(f.name)}`, style: `flex:${f.width}` },
        h('div', { class: 'range mono' }, h('span', {}, String(f.high)), h('span', {}, f.high !== f.low ? String(f.low) : '')),
        h('div', { class: 'b mono' }, f.bits), h('div', { class: 'fn' }, f.name))));
    const table = h('table', { class: 'ftable' },
      h('tr', {}, ...['필드', '비트', '값(2진)', '값', '뜻'].map((t) => h('th', {}, t))),
      ...fields.map((f) => h('tr', {},
        h('td', {}, h('span', { class: `sw ${cls(f.name)}` }), f.name),
        h('td', { class: 'mono' }, `${f.high}–${f.low}`), h('td', { class: 'mono' }, f.bits),
        h('td', { class: 'mono' }, f.value), h('td', { class: 'mono' }, f.meaning))));
    const e = explain(d, general, row.addr);
    const note = instructionNoteLines(d, convention)[0];
    const format = formatName(d.format);
    this.body.replaceChildren(
      h('div', { class: 'ihead' },
        code(row.disassembly, 'dis'), h('span', { class: `badge b-${format}` }, format),
        row.source ? h('span', { class: 'isrc' }, '소스 ', code(row.source)) : null,
        h('span', { class: 'grow' }),
        h('span', { class: 'where' }, code(hex32(row.word)), ' · ', code(hex32(row.addr))),
        this.closeButton()),
      strip, table,
      h('div', { class: 'explain' }, h('b', {}, e.title), e.sentence ? ' — ' : '', codeText(e.sentence),
        note ? h('div', { class: 'note' }, note) : null));
  }

  // How much of the Text panel the sheet covers, for scrolling the chosen row above it.
  get height(): number {
    return this.open ? this.root.offsetHeight : 0;
  }
}
