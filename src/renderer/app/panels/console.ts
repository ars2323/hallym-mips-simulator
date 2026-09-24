/* The console.  Open from the start (a student with a small screen folds
   it); it opens by itself again when the program prints or asks for input.
   What the program printed is in the body only -- nothing in the head, so
   nothing reads as printed twice.  Empty, it shows the talk character.

   Input (syscalls 5, 8, 12 and friends): the run stops with reason "input"
   before the syscall, the machine as it was (native/src/addon.cc).  The
   console then shows a field; Enter hands the line to the simulator and the
   run goes on from the syscall.  What was typed stays in the transcript,
   marked as input. */

import { character, h } from '../dom.ts';
import { headButton, panelHead, type Head } from '../ui.ts';

const KEEP = 200_000; // characters of output kept on screen

export class ConsolePanel {
  readonly root: HTMLElement;
  private readonly bar: HTMLButtonElement;
  readonly head: Head;
  private readonly log: HTMLElement;
  private readonly body: HTMLElement;
  private readonly emptyNote: HTMLElement;
  private readonly inputRow: HTMLElement;
  private readonly input: HTMLInputElement;
  private text = '';
  expanded = true;
  onInput: (line: string) => void = () => {};
  onToggle: () => void = () => {};

  constructor() {
    this.head = panelHead('Console');
    this.bar = headButton('접기', '콘솔 접기/펼치기', () => this.setExpanded(!this.expanded));
    this.head.aside.append(this.bar);
    this.head.root.addEventListener('dblclick', () => this.setExpanded(!this.expanded));
    this.log = h('pre', { class: 'clog mono' });
    this.emptyNote = h('div', { class: 'empty' }, character('talk', 96),
      h('div', { class: 'say' }, h('h3', {}, '아직 출력이 없습니다'),
        h('p', {}, '프로그램이 출력하거나 입력을 받으면 여기에 나옵니다.')));
    this.input = h('input', { class: 'cinput mono', type: 'text', 'aria-label': '콘솔 입력', spellcheck: 'false', autocomplete: 'off' });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        const line = this.input.value;
        this.input.value = '';
        this.echo(line);
        this.onInput(line);
      }
    });
    this.inputRow = h('label', { class: 'cinrow', hidden: true }, h('span', { class: 'prompt' }, '입력'), this.input,
      h('span', { class: 'hint' }, 'Enter'));
    this.body = h('div', { class: 'cbody' }, this.emptyNote, this.log, this.inputRow);
    this.root = h('section', { class: 'panel console', 'aria-label': 'Console' }, this.head.root, this.body);
    this.render();
  }

  clear(): void {
    this.text = '';
    this.log.replaceChildren();
    this.waitForInput(false);
  }

  append(text: string): void {
    if (text === '') return;
    this.text += text;
    this.log.append(text);
    if (this.text.length > KEEP) {
      this.text = this.text.slice(-KEEP);
      this.log.replaceChildren(this.text);
    }
    if (!this.expanded) this.setExpanded(true);
    else this.render();
    this.log.scrollTop = this.log.scrollHeight;
  }

  private echo(line: string): void {
    this.text += line + '\n';
    this.log.append(h('span', { class: 'typed' }, line + '\n'));
    this.render();
  }

  waitForInput(on: boolean): void {
    this.inputRow.hidden = !on;
    if (on) {
      if (!this.expanded) this.setExpanded(true);
      this.input.focus();
    }
    this.render();
  }

  get waiting(): boolean { return !this.inputRow.hidden; }

  setExpanded(on: boolean): void {
    this.expanded = on;
    this.render();
    this.onToggle();
  }

  private render(): void {
    this.root.classList.toggle('open', this.expanded);
    this.bar.setAttribute('aria-expanded', String(this.expanded));
    this.bar.textContent = this.expanded ? '접기' : '펼치기';
    this.head.setMeta(this.waiting ? '입력을 기다립니다' : '');
    this.body.hidden = !this.expanded;
    const empty = this.text === '' && !this.waiting;
    this.emptyNote.hidden = !empty;
    this.log.hidden = empty;
  }
}
