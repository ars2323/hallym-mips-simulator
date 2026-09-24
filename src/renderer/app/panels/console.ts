/* The console: one line until there is something to show.

   It opens by itself when the program prints or asks for input, and by a
   click on its bar.  Opened while empty, it shows the talk character.

   Input (syscalls 5, 8, 12 and friends): the run stops with reason "input"
   before the syscall, the machine as it was (native/src/addon.cc).  The
   console then shows a field; Enter hands the line to the simulator and the
   run goes on from the syscall.  What was typed stays in the transcript,
   marked as input. */

import { character, h } from '../dom.ts';

const KEEP = 200_000; // characters of output kept on screen

export class ConsolePanel {
  readonly root: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly last: HTMLElement;
  private readonly log: HTMLElement;
  private readonly body: HTMLElement;
  private readonly emptyNote: HTMLElement;
  private readonly inputRow: HTMLElement;
  private readonly input: HTMLInputElement;
  private text = '';
  expanded = false;
  onInput: (line: string) => void = () => {};
  onToggle: () => void = () => {};

  constructor() {
    this.last = h('span', { class: 'last' });
    this.bar = h('button', { class: 'console-bar', type: 'button', 'aria-expanded': 'false' },
      h('b', {}, '콘솔'), this.last);
    this.bar.addEventListener('click', () => this.setExpanded(!this.expanded));
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
    this.root = h('section', { class: 'console', 'aria-label': '콘솔' }, this.bar, this.body);
    this.render();
  }

  clear(): void {
    this.text = '';
    this.log.replaceChildren();
    this.waitForInput(false);
    this.setExpanded(false);
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
    const lines = this.text.split('\n').filter((l) => l !== '');
    this.last.textContent = this.waiting ? '입력을 기다립니다'
      : lines.length ? lines[lines.length - 1]
        : '아직 출력이 없습니다 — 프로그램이 출력하면 여기가 커집니다';
    this.last.classList.toggle('mono', !this.waiting && lines.length > 0);
    this.body.hidden = !this.expanded;
    const empty = this.text === '' && !this.waiting;
    this.emptyNote.hidden = !empty;
    this.log.hidden = empty;
  }
}
