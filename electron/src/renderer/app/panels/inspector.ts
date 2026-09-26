/* The Inspector: one instruction taken apart, as the Qt build draws it
   (QtSpim/edu/edu_instruction_inspector.cpp): the word as thirty-two bits,
   MSB on the left, grouped into its fields; under it one line per field;
   then what the instruction does, with the values it will use; for a branch
   or a jump, the sum that gives its destination.

   It follows the program: after every step it shows the instruction at PC
   (the next to run).  Choosing a row in Text pins it to that instruction
   until "Follow PC" (or Esc).  Before the first step, with nothing
   chosen, it says how to fill it. */

import { decode, formatName, type BranchConvention } from '../../../core/decoder.ts';
import { explain } from '../../../core/explain.ts';
import { hex32 } from '../../../core/format.ts';
import { instructionDetailLines, instructionNoteLines, meaningOf } from '../../../core/instruction-text.ts';
import { code, codeText, h } from '../dom.ts';
import { notice } from '../notice.ts';
import type { TextRow } from '../logic/machine.ts';
import { headButton, panelHead, type Head } from '../ui.ts';

export class Inspector {
  readonly root: HTMLElement;
  readonly head: Head;
  private readonly body: HTMLElement;
  private readonly follow: HTMLButtonElement;
  onFollow: () => void = () => {};

  constructor() {
    this.head = panelHead('Inspector');
    this.follow = headButton('Follow PC', '다시 PC 위치의 명령을 따라갑니다 (Esc)', () => this.onFollow());
    this.head.aside.append(this.follow);
    this.body = h('div', { class: 'pbody ibody' });
    this.root = h('section', { class: 'panel insp', 'aria-label': 'Inspector' }, this.head.root, this.body);
    this.guide();
  }

  // Nothing to show yet: what this panel is for, and how to get something into it.
  guide(): void {
    this.setMode(null);
    this.body.classList.add('is-empty');
    this.body.replaceChildren(h('div', { class: 'notice-host' }, notice({
      pose: 'sign', title: '명령 하나를 32비트로 나누어 보는 곳입니다',
      body: codeText('`F10` 키로 한 줄 실행하거나 Text 탭에서 명령을 누르면 그 명령이 여기에 나옵니다.'),
    })));
  }

  // `pinned`: chosen in Text (else the instruction at PC).
  // `convention`: how the machine was assembled (Settings > delayed branches).
  show(row: TextRow, general: readonly number[], pinned: boolean, convention: BranchConvention = 'SpimNoDelaySlot'): void {
    this.setMode(pinned ? row.addr : 'pc');
    this.body.classList.remove('is-empty');
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
    // The word as 32 cells, one per bit, each field a coloured group.
    const grid = h('div', { class: 'bitgrid' }, ...fields.map((f) =>
      h('div', { class: `fbox ${cls(f.name)}`, style: `grid-column: span ${f.width}` },
        h('div', { class: 'franges mono' }, h('span', {}, String(f.high)), h('span', {}, f.high !== f.low ? String(f.low) : '')),
        h('div', { class: 'fbits mono', style: `grid-template-columns: repeat(${f.width}, 1fr)` },
          ...[...f.bits].map((b) => h('span', { class: 'bit' }, b))),
        h('div', { class: 'fname' }, f.name),
        h('div', { class: 'fmean mono' }, f.meaning || f.value))));
    const table = h('table', { class: 'ftable' },
      h('tr', {}, ...['Field', 'Bits', 'Binary', 'Value', 'Meaning'].map((t) => h('th', {}, t))),
      ...fields.map((f) => h('tr', {},
        h('td', {}, h('span', { class: `sw ${cls(f.name)}` }), f.name),
        h('td', { class: 'mono', 'data-label': 'Bits' }, `${f.high}–${f.low}`), h('td', { class: 'mono', 'data-label': 'Binary' }, f.bits),
        h('td', { class: 'mono' }, f.value), h('td', { class: 'mono' }, f.meaning))));
    const e = explain(d, general, row.addr);
    const note = instructionNoteLines(d, convention)[0];
    // "Dest = PC + (offset×4) = 0x..." for a branch or a jump.
    const dest = instructionDetailLines(d, row.addr, row.disassembly, '', convention).slice(7);
    const format = formatName(d.format);
    this.body.replaceChildren(
      h('div', { class: 'ihead' },
        code(row.disassembly, 'dis'), h('span', { class: `badge b-${format}` }, format),
        row.source ? h('span', { class: 'isrc' }, 'Source ', code(row.source)) : null,
        h('span', { class: 'grow' }),
        h('span', { class: 'where' }, code(hex32(row.word)), ' · ', code(hex32(row.addr)))),
      grid,
      h('div', { class: 'explain' }, h('b', {}, e.title), e.sentence ? ' — ' : '', codeText(e.sentence),
        note ? h('div', { class: 'note' }, note) : null),
      ...(dest.length ? [h('pre', { class: 'dest mono' }, dest.join('\n'))] : []),
      table);
  }

  private setMode(mode: 'pc' | number | null): void {
    this.follow.hidden = typeof mode !== 'number';
    this.root.classList.toggle('pinned', typeof mode === 'number');
    this.head.setMeta(mode === null ? '' : mode === 'pc'
      ? h('span', { class: 'mode' }, 'Following PC')
      : h('span', { class: 'mode pin' }, 'Pinned ', code(hex32(mode))));
  }
}
