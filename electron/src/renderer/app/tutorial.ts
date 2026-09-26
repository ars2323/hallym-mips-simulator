/* The tutorial: twenty steps over src/examples/tutorial.s (and
   tutorial-error.s at step 19), both opened read-only and put away at the
   end.  Nothing of it is kept: a new start of the program always begins at
   step 1; within one run, coming back offers to go on where it stopped.

   Two kinds of step:
     explain   points at something; [다음] (or →) goes on;
     practice  the student does the thing (Assemble, F10, a click in the
               gutter...), the tutorial sees it happen; [건너뛰기] turns up
               after a few seconds, and does it for them, so that the steps
               after have what they need.  A practice step whose result is
               something to see (a register changed, a word in memory, a
               stop at a breakpoint, output in the Console) then points at
               that result on the same card and waits for [다음]: told to,
               done, shown what it did, and only then on.  A step whose
               result the next step points at anyway goes straight on.
   A card is one text, a title and a body: a practice step's body says what
   to do and, in its last sentence, what happens once it is done; there is
   no separate line of instructions under it.  No [다음] on the card is the
   other sign that it waits for the student.

   What a step points at is ringed, the rest of the window only lightly
   dimmed (the surroundings are what the student is learning); clicks
   outside the targets do nothing.  The card goes beside the targets, never
   over them (logic/placement.ts), with Haram at its far end: never between
   the words and what they are about, always on the card's white.  Before
   drawing, a step makes its targets really visible: the right side of a
   narrow window, the right tab, the line scrolled in, a column the width
   took away turned back on, the Console opened.

   Keys: → next, ← back, Esc stop (asks first); while a program runs Esc
   stops the program instead.  Keys a step does not ask for (F5 at step 3,
   say) do nothing, so the machine stays where the next steps expect it. */

import { character, codeText, h } from './dom.ts';
import { merge, place, type Rect } from './logic/placement.ts';
import { ask } from './panels/ask.ts';

export type Signal =
  | { kind: 'assembled'; ok: boolean }
  | { kind: 'stopped'; reason: string }
  | { kind: 'slow-ended' }
  | { kind: 'tab'; tab: 'text' | 'data' }
  | { kind: 'breakpoint'; line: number; on: boolean }
  | { kind: 'reset' }
  | { kind: 'goto'; line: number };

export type Example = 'tutorial.s' | 'tutorial-error.s';

// What the window does for the tutorial (app.ts).
export interface TutorialHost {
  narrow(): boolean;
  view(): 'editor' | 'run';
  showView(v: 'editor' | 'run'): void;
  open(name: Example): Promise<void>;       // read-only, not assembled
  example(): Example | null;                // the example on screen
  source(): string;
  assembled(): boolean;                     // the machine holds the Editor's program
  assemble(): Promise<boolean>;
  step(): Promise<void>;
  runUntil(addr: number): Promise<void>;    // steps (quietly) until PC is `addr`
  run(): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  setSpeed(s: 'fast' | 'slow'): Promise<void>;
  pc(): number | null;
  running(): boolean;
  finished(): boolean;
  addressOfLine(line: number): number | null;
  labelAddress(name: string): number | null;
  pin(addr: number | null): void;
  quietPc(on: boolean): void;               // Text without its PC band (the pinned row alone)
  setTab(t: 'text' | 'data'): void;
  tab(): 'text' | 'data';
  breakpointLines(): number[];
  setBreakpointLine(line: number, on: boolean): Promise<void>;
  goToLine(line: number): void;             // what "N행으로 가기" does
  errorLine(): number | null;
  expandConsole(): boolean;                 // true: it was folded
  revealLine(n: number): void;
  lineRect(n: number): DOMRect | null;
  gutterRect(n: number): DOMRect | null;
  revealRegister(key: string): void;
  revealAddr(addr: number): void;
  showColumn(panel: 'regs' | 'text', key: string): 'already' | 'hidden' | 'shown';
  releaseColumn(panel: 'regs' | 'text', key: string): void;
  on(listener: (s: Signal) => void): void;
  close(): Promise<void>;                   // the example down, back to what was there
}

// An element, or a box inside one (an Editor line, a gutter cell): the
// element is what the box is cut to and what a click there must reach.
type Target = Element | { rect: DOMRect | null; within: Element | null } | null | undefined;
type Key = 'F5' | 'F10' | 'Ctrl+S';

// A practice step's result beat: what to point at once it is done.
interface Result {
  view?: 'editor' | 'run';
  tab?: 'text' | 'data';
  title(t: Tutorial): string;
  body(t: Tutorial): string;
  targets(t: Tutorial): Target[];
  reveal?(t: Tutorial): void;
}

interface Step {
  kind: 'explain' | 'practice' | 'end';
  file?: Example;
  view?: 'editor' | 'run';                  // the side a narrow window shows
  tab?: 'text' | 'data';
  pose?: string;
  keys?: Key[];
  title(t: Tutorial): string;
  body(t: Tutorial): string;                // `code` in backticks
  targets(t: Tutorial): Target[];
  avoid?(t: Tutorial): Target[];           // not pointed at, but the card keeps off it
  prepare?(t: Tutorial): Promise<void>;     // the machine where the step needs it
  reveal?(t: Tutorial): void;               // the targets into view
  done?(t: Tutorial, s: Signal): 'next' | 'phase' | null;
  result?: Result;                          // shown after `done`, before the next step
  skip?(t: Tutorial): Promise<void>;
  leave?(t: Tutorial): Promise<void>;
}

const $ = (sel: string) => document.querySelector(sel);
const $$ = (sel: string) => [...document.querySelectorAll(sel)];

export class Tutorial {
  readonly host: TutorialHost;
  active = false;
  index = 0;
  phase = 0;
  result = false;                       // a practice step done: its result on the card, [다음] awaited
  private lastStep = 0;                 // this run of the program only
  private busy = false;
  private readonly forced: ['regs' | 'text', string][] = [];
  private root: HTMLElement | null = null;
  private dim: SVGPathElement | null = null;
  private rings: HTMLElement | null = null;
  private card: HTMLElement | null = null;
  private skipTimer = 0;
  private skipShown = false;
  private frame = 0;
  private lastLayout = '';
  private lastReveal = 0;
  private advanceTimer = 0;
  // The last layout, for the tests: what is pointed at and where the card is.
  shown: { step: number; phase: number; result: boolean; targets: Rect[]; card: Rect | null; hits: boolean[]; did: string[] } = { step: 0, phase: 0, result: false, targets: [], card: null, hits: [], did: [] };
  // What this step had to do to show its targets (for the report and tests).
  did: string[] = [];

  constructor(host: TutorialHost) {
    this.host = host;
    host.on((s) => this.signal(s));
  }

  // ---- lines and addresses of the example ------------------------------------

  line(re: RegExp): number {
    return this.host.source().split('\n').findIndex((l) => re.test(l)) + 1;
  }
  addr(re: RegExp): number {
    return this.host.addressOfLine(this.line(re)) ?? -1;
  }
  // PC has passed every instruction before `re`'s line (and the program has
  // not ended): if not, start over if need be and step there quietly.
  async atLeast(re: RegExp): Promise<void> {
    if (!this.host.assembled()) await this.host.assemble();
    if (this.host.finished()) await this.host.restart();
    const pc = this.host.pc() ?? 0;
    if (pc < this.addr(re) || pc >= 0x80000000) await this.host.runUntil(this.addr(re));
  }
  async notFinished(): Promise<void> {
    if (!this.host.assembled()) await this.host.assemble();
    if (this.host.finished()) await this.host.restart();
  }
  column(panel: 'regs' | 'text', key: string): void {
    const was = this.host.showColumn(panel, key);
    if (was !== 'already') this.forced.push([panel, key]);
    if (was === 'hidden') this.did.push(`column ${key} on`);
  }

  // ---- start and end ----------------------------------------------------------------

  async start(): Promise<void> {
    let from = 0;
    if (this.lastStep > 0) {
      const again = await ask({
        title: '이어서 할까요?',
        body: `지난번에 ${this.lastStep + 1}단계에서 그만두었습니다. 프로그램을 끄면 이 기록은 없어지고 다시 1단계부터입니다.`,
        ok: `이어서 (${this.lastStep + 1}단계부터)`, cancel: '처음부터',
      });
      from = again ? this.lastStep : 0;
    }
    this.active = true;
    document.body.classList.add('tutorial-on');
    await this.host.open('tutorial.s');
    this.mount();
    await this.go(from);
  }

  async quit(): Promise<void> {
    if (this.busy) return;
    const sure = this.index === STEPS.length - 1 || await ask({
      title: '튜토리얼을 그만둘까요?',
      body: '예제는 내려가고 튜토리얼을 시작하기 전의 화면으로 돌아갑니다.',
      ok: '그만두기', cancel: '계속하기',
    });
    if (sure) await this.end();
  }

  async end(): Promise<void> {
    this.busy = true;
    try {
      await STEPS[this.index].leave?.(this);
      if (this.host.running()) await this.host.stop();
      await this.host.setSpeed('fast');
      this.host.pin(null);
      this.host.quietPc(false);
      for (const [panel, key] of this.forced.splice(0)) this.host.releaseColumn(panel, key);
      this.lastStep = this.index === STEPS.length - 1 ? 0 : this.index;
      this.unmount();
      this.active = false;
      document.body.classList.remove('tutorial-on');
      await this.host.close();
    } finally {
      this.busy = false;
    }
  }

  // ---- steps ----------------------------------------------------------------------

  async go(i: number): Promise<void> {
    if (this.busy || i < 0 || i >= STEPS.length) return;
    this.busy = true;
    clearTimeout(this.skipTimer);
    clearTimeout(this.advanceTimer);
    try {
      if (this.active && i !== this.index) await STEPS[this.index].leave?.(this);
      this.index = i;
      this.phase = 0;
      this.result = false;
      this.did = [];
      const step = STEPS[i];
      if (step.file && this.host.example() !== step.file) await this.host.open(step.file);
      await step.prepare?.(this);
      // Steps 8 and 9 are about the instruction just run, pinned in Text: its
      // row is the one highlight there, not the PC's band as well.
      this.host.quietPc(i === 7 || i === 8);
      if (step.tab && this.host.tab() !== step.tab) { this.host.setTab(step.tab); this.did.push(`tab ${step.tab}`); }
      if (step.view && this.host.narrow() && this.host.view() !== step.view) { this.host.showView(step.view); this.did.push(`side ${step.view}`); }
      this.renderCard();
      this.lastLayout = '';
      this.lastReveal = 0;
      if (step.kind === 'practice') this.armSkip();
    } finally {
      this.busy = false;
    }
  }

  private armSkip(): void {
    this.skipShown = false;
    clearTimeout(this.skipTimer);
    this.skipTimer = window.setTimeout(() => { this.skipShown = true; this.renderCard(); }, 6000);
  }

  next(): void { void this.go(this.index + 1); }
  back(): void { void this.go(this.index - 1); }

  async skip(): Promise<void> {
    if (this.busy) return;
    const step = STEPS[this.index];
    this.busy = true;
    try {
      await step.skip?.(this);
    } finally {
      this.busy = false;
    }
    // A step with phases goes on to its next phase, one with a result to
    // that, the others to the next step.
    if (this.index === 18 && this.phase === 0) { this.phase = 1; this.renderCard(); this.armSkip(); return; }
    if (step.result) { this.showResult(); return; }
    this.next();
  }

  // The result beat: the card points at what the step just did and waits.
  private showResult(): void {
    const res = STEPS[this.index].result!;
    this.result = true;
    clearTimeout(this.skipTimer);
    if (res.tab && this.host.tab() !== res.tab) { this.host.setTab(res.tab); this.did.push(`tab ${res.tab}`); }
    if (res.view && this.host.narrow() && this.host.view() !== res.view) { this.host.showView(res.view); this.did.push(`side ${res.view}`); }
    this.renderCard();
    this.lastLayout = '';
    this.lastReveal = 0;
  }

  private signal(s: Signal): void {
    if (!this.active || this.busy) return;
    const verdict = STEPS[this.index].done?.(this, s) ?? null;
    if (verdict === 'phase') {
      this.phase += 1;
      if (STEPS[this.index].view && this.host.narrow()) this.host.showView('run');
      this.renderCard();
      this.armSkip();
    } else if (verdict === 'next') {
      if (STEPS[this.index].result) { if (!this.result) this.showResult(); return; }
      const at = this.index;
      clearTimeout(this.advanceTimer);
      this.advanceTimer = window.setTimeout(() => { if (this.index === at && this.active) this.next(); }, 500);
    }
  }

  // The window's keys go through here first; true: taken (or refused).
  handleKey(e: KeyboardEvent): boolean {
    if (!this.active || document.querySelector('dialog[open]')) return false;
    const step = STEPS[this.index];
    const allowed = new Set(step.keys ?? []);
    const key: Key | null = e.key === 'F5' ? 'F5' : e.key === 'F10' ? 'F10'
      : (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' ? 'Ctrl+S' : null;
    const take = () => { e.preventDefault(); e.stopPropagation(); return true; };
    if (e.key === 'Escape') {
      if (this.host.running()) return false; // Esc stops the program
      take();
      void this.quit();
      return true;
    }
    if (e.key === 'ArrowRight' && !(e.target as HTMLElement).closest?.('input')) {
      take();
      if (step.kind === 'explain' || this.result) this.next();
      else if (step.kind === 'practice' && this.skipShown) void this.skip();
      return true;
    }
    if (e.key === 'ArrowLeft' && !(e.target as HTMLElement).closest?.('input')) { take(); this.back(); return true; }
    if (key) {
      if (this.phase > 0 && this.index === 18) return take(); // the file is assembled: now the Errors panel
      if (this.result) return take();                       // done: the result is what to look at
      return allowed.has(key) ? false : take();
    }
    if (e.ctrlKey || e.metaKey) return take(); // Ctrl+O and the like: not now
    return false;
  }

  // ---- drawing -----------------------------------------------------------------

  private mount(): void {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'tut-dim');
    this.dim = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.dim.setAttribute('fill-rule', 'evenodd');
    svg.append(this.dim);
    this.rings = h('div', { class: 'tut-rings' });
    this.card = h('div', { class: 'tut-card', role: 'dialog', 'aria-label': 'Tutorial' });
    this.root = h('div', { class: 'tut' }, svg as unknown as HTMLElement, this.rings, this.card);
    document.body.append(this.root);
    const tick = () => { this.layout(); this.frame = requestAnimationFrame(tick); };
    this.frame = requestAnimationFrame(tick);
  }

  private unmount(): void {
    cancelAnimationFrame(this.frame);
    clearTimeout(this.skipTimer);
    clearTimeout(this.advanceTimer);
    this.root?.remove();
    this.root = this.dim = this.rings = this.card = null;
  }

  private renderCard(): void {
    const card = this.card;
    if (!card) return;
    const step = STEPS[this.index];
    const n = this.index + 1;
    const button = (label: string, cls: string, onClick: () => void, disabled = false) => {
      const b = h('button', { class: `btn small ${cls}`, type: 'button', disabled }, label);
      b.addEventListener('click', onClick);
      return b;
    };
    const res = this.result ? step.result : undefined;
    const buttons: HTMLElement[] = [button('이전', 'tut-back', () => this.back(), n === 1)];
    if (step.kind === 'explain' || res) buttons.push(button('다음', 'primary tut-next', () => this.next()));
    if (step.kind === 'practice' && !res && this.skipShown) buttons.push(button('건너뛰기', 'tut-skip', () => void this.skip()));
    if (step.kind === 'end') buttons.push(button('끝내기', 'primary tut-finish', () => void this.end()));
    card.className = `tut-card kind-${step.kind}${res ? ' done' : ''}`;
    card.replaceChildren(
      h('div', { class: 'tut-say' },
        h('div', { class: 'tut-top' }, h('span', { class: 'tut-count' }, `${n} / ${STEPS.length}`),
          step.kind === 'end' ? null : button('그만두기', 'tut-quit linkish', () => void this.quit())),
        h('h3', {}, (res ?? step).title(this)),
        h('p', {}, codeText((res ?? step).body(this))),
        h('div', { class: 'tut-buttons' }, ...buttons)),
      character(step.pose ?? 'haram', 76));
    (card.querySelector('img.char') as HTMLElement).classList.add('tut-char');
    this.lastLayout = '';
  }

  // Every frame: where the targets are now; the dimmed layer, the rings and
  // the card follow them (the Data tab redraws itself, lists scroll...).
  private layout(): void {
    if (!this.card || !this.dim || !this.rings || this.busy) return;
    const step = STEPS[this.index];
    const now: { targets(t: Tutorial): Target[]; reveal?(t: Tutorial): void } = this.result ? step.result! : step;
    const rects = targetRects(now.targets(this));
    // A target not (wholly) in view: bring it in, at most five times a second.
    if (now.reveal && (rects.missing || rects.clipped) && performance.now() - this.lastReveal > 200) {
      this.lastReveal = performance.now();
      now.reveal(this);
      if (!this.did.includes('scrolled')) this.did.push('scrolled');
    }
    const w = window.innerWidth;
    const hh = window.innerHeight;
    const key = JSON.stringify([rects.list, w, hh, this.card.offsetWidth, this.card.offsetHeight, this.index, this.phase, this.result]);
    if (key === this.lastLayout) return;
    this.lastLayout = key;
    const holes = merge(rects.list.map((r) => grow(r, 4)));
    this.dim.setAttribute('d', `M0 0H${w}V${hh}H0Z ${holes.map((r) => `M${r.left} ${r.top}H${r.right}V${r.bottom}H${r.left}Z`).join(' ')}`);
    // A ring 4 px around its target, or closer when another target is near:
    // neighbours (the bit fields) keep a ring each, never one fused outline.
    this.rings.replaceChildren(...rects.list.map((r, i) => {
      const near = Math.min(Infinity, ...rects.list.filter((_, j) => j !== i).map((q) => distance(r, q)));
      const out = Math.max(0, Math.min(4, Math.floor((near - 4) / 2)));
      return h('div', {
        class: `tut-ring${out < 2 ? ' tight' : ''}`,
        style: `left:${r.left - out}px;top:${r.top - out}px;width:${r.right - r.left + 2 * out}px;height:${r.bottom - r.top + 2 * out}px`,
      });
    }));
    const size = { width: this.card.offsetWidth, height: this.card.offsetHeight };
    // Below the title bar: the card never hides the toolbar.
    const view = { left: 0, top: ($('.titlebar')?.getBoundingClientRect().bottom ?? 0), right: w, bottom: hh };
    // Beside the targets and off what the step keeps off; failing that,
    // beside the targets alone (over what was kept off: the Editor at step
    // 19, whose line is worth seeing but not what the card talks about);
    // never over a target.
    const keepOff = targetRects(step.avoid?.(this) ?? []).list;
    const grown = rects.list.map((r) => grow(r, 4));
    const at = step.kind === 'end' || rects.list.length === 0
      ? { left: (w - size.width) / 2, top: (hh - size.height) / 2, side: null }
      : place([...grown, ...keepOff], size, view) ?? place(grown, size, view) ?? { left: w - size.width - 8, top: hh - size.height - 8, side: null };
    this.card.style.left = `${Math.round(at.left)}px`;
    this.card.style.top = `${Math.round(at.top)}px`;
    // Haram at the card's far end from the targets.
    const first = rects.list[0];
    const far = at.side === 'left' ? 'left' : at.side === 'right' ? 'right'
      : first && (first.left + first.right) / 2 > at.left + size.width / 2 ? 'left' : 'right';
    this.card.classList.toggle('haram-left', far === 'left');
    // A click in the middle of each target reaches it (not the card, not
    // something else drawn over it).
    const hits = rects.list.map((r, i) => {
      const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
      return !!hit && !!rects.owners[i]?.contains(hit);
    });
    this.shown = {
      step: this.index + 1, phase: this.phase, result: this.result, targets: rects.list, hits, did: [...this.did],
      card: { left: at.left, top: at.top, right: at.left + size.width, bottom: at.top + size.height },
    };
  }
}

// The gap between two boxes (0 when they touch or overlap).
function distance(a: Rect, b: Rect): number {
  const dx = Math.max(0, b.left - a.right, a.left - b.right);
  const dy = Math.max(0, b.top - a.bottom, a.top - b.bottom);
  return Math.hypot(dx, dy);
}

function grow(r: Rect, by: number): Rect {
  return { left: r.left - by, top: r.top - by, right: r.right + by, bottom: r.bottom + by };
}

// The targets' boxes, cut to what their scrolling boxes show; whether one
// is missing or cut short (then the step brings it into view).
function targetRects(targets: Target[]): { list: Rect[]; owners: Element[]; missing: boolean; clipped: boolean } {
  const list: Rect[] = [];
  const owners: Element[] = [];
  let missing = false;
  let clipped = false;
  for (const t of targets) {
    const owner = t instanceof Element ? t : t?.within ?? null;
    const box = t instanceof Element ? t.getBoundingClientRect() : t?.rect ?? null;
    if (!owner || !box || !owner.isConnected || !(owner as HTMLElement).checkVisibility?.()) { missing = true; continue; }
    let r: Rect = box;
    if (r.right - r.left <= 0 || r.bottom - r.top <= 0) { missing = true; continue; }
    const full = { ...r };
    for (let p: Element | null = t instanceof Element ? owner.parentElement : owner; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
      const c = p.getBoundingClientRect();
      r = { left: Math.max(r.left, c.left), top: Math.max(r.top, c.top), right: Math.min(r.right, c.right), bottom: Math.min(r.bottom, c.bottom) };
    }
    r = { left: Math.max(r.left, 0), top: Math.max(r.top, 0), right: Math.min(r.right, window.innerWidth), bottom: Math.min(r.bottom, window.innerHeight) };
    if (r.right - r.left < 4 || r.bottom - r.top < 4) { missing = true; continue; }
    if (r.bottom - r.top < full.bottom - full.top - 1 || r.right - r.left < full.right - full.left - 1) clipped = true;
    list.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    owners.push(owner);
  }
  return { list, owners, missing, clipped };
}

// ---- the twenty steps ---------------------------------------------------------------

const ADD = /^\s+add\s+\$t3/;
const SUB = /^\s+sub\s+\$t4/;
const BIG = /li\s+\$t0, 0x12345678/;
const SW = /^\s+sw\s+\$t3, total/;
const LW = /^\s+lw\s+\$s0, total/;
const PRINT = /^\s+li\s+\$v0, 4\b/;
const OUT_SYSCALL = /^\s+la\s+\$a0, msg/;   // the syscall after it prints msg
const trow = (addr: number) => $(`.trow[data-addr="0x${(addr >>> 0).toString(16).padStart(8, '0')}"]`);
const regCells = (key: string) => ['.hex', '.dec', '.bin'].map((c) => $(`.rrow[data-reg="${key}"] ${c}`));
const button = (name: string) => $(`[data-tut="${name}"]`);
const scrollIn = (el: Element | null) => el?.scrollIntoView({ block: 'center', inline: 'nearest' });
const dataCell = (t: Tutorial) => {
  const a = t.host.labelAddress('total');
  return a === null ? null : $(`.drow .dval[title="0x${a.toString(16).padStart(8, '0')}"]`);
};
// The box of the text an element draws (not of the block it fills).
function textOf(el: Element | null): Target {
  if (!el) return null;
  const range = document.createRange();
  range.selectNodeContents(el);
  const r = range.getBoundingClientRect();
  return { rect: r.width > 0 ? r : null, within: el };
}

// Editor lines m..n as one box; a gutter cell.
const scroller = () => $('.editor-panel .cm-scroller');
function lines(t: Tutorial, m: number, n = m): Target {
  const rects = [];
  for (let i = m; i <= n; i += 1) rects.push(t.host.lineRect(i));
  if (rects.some((r) => !r)) return { rect: null, within: scroller() };
  const rs = rects as DOMRect[];
  const left = Math.min(...rs.map((r) => r.left));
  const top = Math.min(...rs.map((r) => r.top));
  return { rect: new DOMRect(left, top, Math.max(...rs.map((r) => r.right)) - left, Math.max(...rs.map((r) => r.bottom)) - top), within: scroller() };
}
function gutterAndLine(t: Tutorial, n: number): Target {
  const g = t.host.gutterRect(n);
  const l = t.host.lineRect(n);
  if (!g || !l) return { rect: null, within: scroller() };
  return { rect: new DOMRect(g.left, Math.min(g.top, l.top), l.right - g.left, Math.max(g.bottom, l.bottom) - Math.min(g.top, l.top)), within: scroller() };
}
const msgTags = () => $$('.dtags').find((e) => /\bmsg\b/.test(e.textContent ?? '')) ?? null;
const status = () => $('.status .run') ?? $('.status');

export const STEPS: Step[] = [
  // ---- the screen
  { kind: 'explain', file: 'tutorial.s', view: 'editor', pose: 'hello',
    title: () => '여기가 Editor 패널입니다',
    body: () => '어셈블리 코드를 쓰는 곳입니다. 지금 열린 것은 튜토리얼 예제라서 고칠 수 없습니다(읽기 전용).',
    targets: (t) => [$('.editor-panel .phead'), lines(t, 1, 6)],
    reveal: (t) => t.host.revealLine(1),
    prepare: async (t) => { if (t.host.running()) await t.host.stop(); } },
  { kind: 'practice', file: 'tutorial.s', keys: ['Ctrl+S'],
    title: () => 'Assemble: 코드를 기계어로',
    body: () => '쓴 코드를 기계어로 바꾸는 것이 어셈블입니다. Assemble 버튼을 누르거나 Ctrl+S 키를 눌러 보세요. 내 파일에서는 이 버튼이 저장도 함께 합니다(Save & Assemble 버튼). 어셈블이 끝나면 오른쪽 Run 쪽이 켜지고 다음 단계로 넘어갑니다.',
    targets: () => [button('assemble')],
    done: (_t, s) => (s.kind === 'assembled' && s.ok ? 'next' : null),
    skip: async (t) => { await t.host.assemble(); } },
  { kind: 'explain', file: 'tutorial.s', view: 'run',
    title: () => 'Registers 패널',
    body: () => 'MIPS 레지스터 32개가 쓰임새대로 묶여 있습니다. 표시한 Temporaries 묶음은 계산하는 동안 값을 잠시 두는 레지스터들입니다.',
    targets: () => [$('.regs .phead'), $$('.rgroup').find((g) => g.textContent?.includes('Temporaries'))],
    prepare: async (t) => { if (!t.host.assembled()) await t.host.assemble(); },
    reveal: () => scrollIn($$('.rgroup').find((g) => g.textContent?.includes('Temporaries')) ?? null) },
  { kind: 'explain', file: 'tutorial.s', view: 'run', tab: 'text',
    title: () => '소스 한 줄이 명령 두 개가 되었습니다',
    body: () => '`li $t0, 0x12345678` → `lui`(위 16비트) + `ori`(아래 16비트). 명령 하나에는 32비트 상수가 다 들어가지 않아서, 어셈블러가 두 명령으로 나누었습니다.',
    // Both ends of it: the Editor's line and the two Text rows (a narrow
    // window shows one side: the rows).
    targets: (t) => [...(t.host.narrow() ? [] : [lines(t, t.line(BIG))]), trow(t.addr(BIG)), trow(t.addr(BIG) + 4)],
    prepare: async (t) => { if (!t.host.assembled()) await t.host.assemble(); },
    reveal: (t) => { t.host.revealAddr(t.addr(BIG) + 4); if (!t.host.narrow()) t.host.revealLine(t.line(BIG)); } },
  // ---- one line at a time
  { kind: 'practice', file: 'tutorial.s', view: 'editor', keys: ['F10'],
    title: () => 'Step: 한 줄 실행',
    body: () => '파란 줄이 다음에 실행할 줄입니다. 시작 코드와 앞의 `li` 두 줄은 미리 실행해 두었습니다. F10 키(또는 Step 버튼)를 눌러 이 줄을 실행해 보세요. 실행하면 무엇이 바뀌었는지 짚어 드립니다.',
    targets: (t) => [button('step'), lines(t, t.line(ADD))],
    prepare: async (t) => {
      if (!t.host.assembled()) await t.host.assemble();
      const pc = t.host.pc() ?? 0;
      if (t.host.finished() || pc < t.addr(ADD) || pc >= 0x80000000) await t.atLeast(ADD);
    },
    reveal: (t) => t.host.revealLine(t.line(ADD)),
    done: (_t, s) => (s.kind === 'stopped' ? 'next' : null),
    result: { view: 'run',
      title: () => '한 줄을 실행했습니다',
      body: () => '파란 줄이 다음 줄로 내려갔고, 오른쪽 Registers 패널에서 `$t3` 레지스터가 노란 줄이 되었습니다.',
      targets: (t) => [$('.rrow[data-reg="$t3"]'), ...(t.host.narrow() ? [] : [$('.editor-panel .cm-pc-line')])],
      reveal: (t) => t.host.revealRegister('$t3') },
    skip: async (t) => { await t.host.step(); } },
  { kind: 'explain', file: 'tutorial.s', view: 'run',
    title: () => '노란 줄: 방금 바뀐 레지스터',
    body: () => '노란 줄은 방금 실행한 줄이 바꾼 레지스터입니다. `add $t3, $t1, $t2` 명령이 두 값을 더한 결과(5 + 7 = 12)를 `$t3` 레지스터에 넣었습니다.',
    targets: () => [$('.rrow[data-reg="$t3"]')],
    prepare: async (t) => { await t.atLeast(SUB); },
    reveal: (t) => t.host.revealRegister('$t3') },
  { kind: 'explain', file: 'tutorial.s', view: 'run',
    title: () => '같은 값의 세 얼굴',
    body: () => 'Hex = 16진수, Dec = 10진수, Bin = 2진수. 셋 모두 같은 값 12입니다. 2진수는 읽기 쉽게 네 자리씩 띄어 두었습니다.',
    targets: () => regCells('$t3'),
    prepare: async (t) => { await t.atLeast(SUB); t.column('regs', 'dec'); t.column('regs', 'bin'); },
    reveal: (t) => t.host.revealRegister('$t3') },
  { kind: 'explain', file: 'tutorial.s', view: 'run', tab: 'text',
    title: () => 'Inspector 패널: 방금 그 명령의 32비트',
    body: () => '방금 실행한 `add` 명령을 32비트로 나누어 보여 줍니다. 필드마다 이름과 값, 뜻이 적혀 있습니다.',
    targets: () => [$('.insp .phead'), $('.insp .ihead'), $('.insp .bitgrid')],
    prepare: async (t) => { await t.atLeast(SUB); t.host.pin(t.addr(ADD)); },
    leave: async (t) => { if (t.index !== 8) t.host.pin(null); } },
  { kind: 'explain', file: 'tutorial.s', view: 'run', tab: 'text',
    title: () => '비트 그리드 = Encoding 값',
    body: (t) => {
      const word = document.querySelector('.trow.sel .word')?.textContent ?? '';
      void t;
      return `opcode · rs · rt · rd … 칸의 0과 1을 왼쪽부터 이어 붙이면 32비트 워드 하나입니다. 이것을 16진수로 쓴 것이 Text 탭 Encoding 열의 \`${word}\` — 같은 명령, 같은 값입니다.`;
    },
    targets: () => [...['opcode', 'rs', 'rt', 'rd'].map((f) => $(`.insp .fbox.f-${f}`)), $('.trow.sel .word')],
    prepare: async (t) => { await t.atLeast(SUB); t.host.pin(t.addr(ADD)); t.column('text', 'word'); },
    reveal: (t) => t.host.revealAddr(t.addr(ADD)),
    leave: async (t) => { if (t.index !== 7) t.host.pin(null); } },
  // ---- memory
  { kind: 'practice', file: 'tutorial.s', view: 'run',
    title: () => 'Data 탭',
    body: () => 'Data 탭에서는 프로그램의 `.data` 부분에 적은 문자열과 워드가 메모리 어디에 있는지 볼 수 있습니다. Data 탭을 눌러 보세요. 누르면 다음 단계로 넘어갑니다.',
    targets: () => [$$('.textpanel .ptab').find((b) => b.textContent === 'Data')],
    prepare: async (t) => { if (!t.host.assembled()) await t.host.assemble(); if (t.host.tab() === 'data') t.host.setTab('text'); },
    done: (_t, s) => (s.kind === 'tab' && s.tab === 'data' ? 'next' : null),
    skip: async (t) => { t.host.setTab('data'); } },
  { kind: 'explain', file: 'tutorial.s', view: 'run', tab: 'data',
    title: () => '라벨: 주소에 붙인 이름',
    body: () => '`msg` · `total` 같은 라벨은 메모리 주소에 붙인 이름입니다. 윗줄의 +0 · +8 표시는 아랫줄 주소에서 몇 바이트 떨어졌는지를 뜻합니다.',
    targets: () => [msgTags(), msgTags()?.nextElementSibling],
    prepare: async (t) => { if (!t.host.assembled()) await t.host.assemble(); },
    reveal: () => scrollIn(msgTags()) },
  { kind: 'practice', file: 'tutorial.s', view: 'run', tab: 'data', keys: ['F10'],
    title: () => 'sw: 메모리에 쓰기',
    body: (t) => `${t.host.narrow() ? '' : '왼쪽에 표시한 '}\`sw $t3, total\` 줄은 \`$t3\` 레지스터의 값을 메모리의 \`total\` 자리에 씁니다. F10 키를 몇 번 눌러 이 줄까지 실행해 보세요. 실행하고 나면 \`total\` 자리가 어떻게 바뀌었는지 보여 드립니다.`,
    targets: (t) => [...(t.host.narrow() ? [] : [lines(t, t.line(SW))]), dataCell(t)],
    prepare: async (t) => {
      await t.atLeast(SUB);
      if ((t.host.pc() ?? 0) >= t.addr(LW)) { await t.host.restart(); await t.host.runUntil(t.addr(SW)); }
    },
    reveal: (t) => { if (!t.host.narrow()) t.host.revealLine(t.line(SW)); scrollIn(dataCell(t)); },
    done: (t, s) => (s.kind === 'stopped' && ((t.host.pc() ?? 0) >= t.addr(LW) || t.host.finished()) ? 'next' : null),
    result: { view: 'run', tab: 'data',
      title: () => '메모리에 썼습니다',
      body: () => '`sw` 명령이 `$t3` 레지스터의 값 12 를 `total` 자리에 썼습니다. 표시한 칸이 0 에서 12 로 바뀌었습니다(16진수 0000000c).',
      targets: (t) => [dataCell(t)],
      reveal: (t) => scrollIn(dataCell(t)) },
    skip: async (t) => { await t.host.runUntil(t.addr(LW)); } },
  { kind: 'explain', file: 'tutorial.s', view: 'run', tab: 'data',
    title: () => '스택은 어디에 있나',
    body: () => '`$sp` 레지스터가 스택의 맨 위(가장 낮은 주소)를 가리킵니다. 조금 전 `addi $sp, $sp, -4` 줄이 한 칸(4바이트)을 만들어서 `$sp` 값이 4 줄었습니다. 스택은 낮은 주소 쪽으로 자랍니다.',
    targets: () => [$('.dsec-stack'), $('.rrow[data-reg="$sp"]')],
    prepare: async (t) => { await t.atLeast(LW); },
    reveal: (t) => { scrollIn($('.dsec-stack')); t.host.revealRegister('$sp'); } },
  // ---- control
  { kind: 'practice', file: 'tutorial.s', view: 'editor',
    title: (t) => `브레이크포인트: ${t.line(PRINT)}행에서 멈추게`,
    body: (t) => `${t.line(PRINT)}행의 맨 왼쪽, 줄 번호 왼쪽 칸을 눌러 빨간 점을 찍어 보세요. 실행하다가 이 줄 앞에서 멈추게 하는 표시이고, 같은 칸을 한 번 더 누르면 지워집니다. 점을 찍으면 다음으로 넘어갑니다.`,
    // The gutter cell and its line, one ring: one thing to do.
    targets: (t) => [gutterAndLine(t, t.line(PRINT))],
    prepare: async (t) => {
      await t.notFinished();
      if (t.host.breakpointLines().includes(t.line(PRINT))) await t.host.setBreakpointLine(t.line(PRINT), false);
    },
    reveal: (t) => t.host.revealLine(t.line(PRINT)),
    done: (t, s) => (s.kind === 'breakpoint' && s.on && s.line === t.line(PRINT) ? 'next' : null),
    skip: async (t) => { await t.host.setBreakpointLine(t.line(PRINT), true); } },
  { kind: 'practice', file: 'tutorial.s', keys: ['F5'],
    title: () => 'Run: 끝까지, 또는 브레이크포인트까지',
    body: () => 'Run 버튼(F5 키)은 한 줄씩이 아니라 프로그램을 쭉 실행합니다. 프로그램이 끝나거나 빨간 점을 만나면 멈춥니다. F5 키를 눌러 보세요. 어디서 멈췄는지 알려 드립니다.',
    targets: () => [button('run')],
    prepare: async (t) => {
      await t.notFinished();
      if (!t.host.breakpointLines().includes(t.line(PRINT))) await t.host.setBreakpointLine(t.line(PRINT), true);
      if ((t.host.pc() ?? 0) >= t.addr(PRINT) && (t.host.pc() ?? 0) < 0x80000000) await t.host.restart();
    },
    done: (_t, s) => (s.kind === 'stopped' && (s.reason === 'breakpoint' || s.reason === 'exit') ? 'next' : null),
    result: {
      title: (t) => (t.host.finished() ? '끝까지 실행되었습니다' : '빨간 점에서 멈췄습니다'),
      body: (t) => (t.host.finished() ? '빨간 점이 없어서 프로그램이 끝까지 실행되었습니다.'
        : '빨간 점을 찍은 줄 앞에서 멈췄습니다. 이 줄은 아직 실행되지 않았습니다. 아래 상태 표시줄에도 멈춘 자리가 나옵니다.'),
      targets: (t) => [status(), ...(t.host.narrow() || t.host.finished() ? [] : [$('.editor-panel .cm-pc-line')])],
      reveal: (t) => { if (!t.host.narrow() && !t.host.finished()) t.host.revealLine(t.line(PRINT)); } },
    skip: async (t) => { await t.host.run(); } },
  { kind: 'practice', file: 'tutorial.s', keys: ['F5'],
    title: () => 'Run speed: 천천히 실행',
    body: () => 'Run speed 칸에서 1 line/s 쪽을 고른 뒤 F5 키를 누르세요. 1초에 한 줄씩 실행되면서 파란 줄과 노란 줄이 옮겨 갑니다. 몇 줄 지켜본 뒤 Esc 키(또는 Stop 버튼)로 멈추면 다음으로 넘어갑니다.',
    targets: () => [$('.speedbox'), button('run')],
    prepare: async (t) => { await t.notFinished(); },
    done: (_t, s) => (s.kind === 'slow-ended' ? 'next' : null),
    skip: async (t) => { if (t.host.running()) await t.host.stop(); },
    leave: async (t) => { if (t.host.running()) await t.host.stop(); await t.host.setSpeed('fast'); } },
  { kind: 'practice', file: 'tutorial.s',
    title: () => 'Reset: 처음으로',
    body: () => 'Reset 버튼은 프로그램을 다시 어셈블해 처음부터 실행할 수 있게 합니다. Reset 버튼을 눌러 보세요. 무엇이 처음으로 돌아가는지 보여 드립니다.',
    targets: () => [button('reset')],
    prepare: async (t) => { if (!t.host.assembled()) await t.host.assemble(); },
    done: (_t, s) => (s.kind === 'reset' ? 'next' : null),
    result: { view: 'run',
      title: () => '처음으로 돌아왔습니다',
      body: () => '`$t3` 레지스터가 다시 0 이 되었습니다. 프로그램이 처음 상태로 돌아가서, F10 키나 F5 키로 처음부터 다시 실행할 수 있습니다. 찍어 둔 빨간 점은 그대로 남아 있습니다.',
      targets: () => [$('.rrow[data-reg="$t3"]'), status()],
      reveal: (t) => t.host.revealRegister('$t3') },
    skip: async (t) => { await t.host.restart(); } },
  // ---- input, output, errors
  { kind: 'practice', file: 'tutorial.s', view: 'run', keys: ['F5'],
    title: () => '출력은 Console 패널에',
    body: (t) => `${t.host.narrow() ? '' : `${t.line(OUT_SYSCALL) + 1}행의 \`syscall\` 줄이 문자열을 출력합니다(\`$v0\` 값 4 = 문자열 출력). `}F5 키로 끝까지 실행해 보세요. 빨간 점에서 멈추면 F5 키를 한 번 더 누르세요. 프로그램이 끝나면 출력이 어디에 나왔는지 보여 드립니다.`,
    targets: (t) => [...(t.host.narrow() ? [] : [lines(t, t.line(OUT_SYSCALL) + 1)]), $('.console')],
    prepare: async (t) => { await t.notFinished(); if (t.host.expandConsole()) t.did.push('console opened'); },
    reveal: (t) => { if (!t.host.narrow()) t.host.revealLine(t.line(OUT_SYSCALL) + 1); },
    done: (_t, s) => (s.kind === 'stopped' && (s.reason === 'exit' || s.reason === 'error') ? 'next' : null),
    result: { view: 'run',
      title: () => '출력이 나왔습니다',
      body: () => '`syscall` 명령이 출력한 문자열이 Console 패널에 나왔습니다. 프로그램은 여기서 끝났습니다(아래 상태 표시줄).',
      targets: () => [$('.console .clog'), status()] },
    skip: async (t) => { for (let i = 0; i < 3 && !t.host.finished(); i += 1) await t.host.run(); } },
  { kind: 'practice', file: 'tutorial-error.s', view: 'editor', keys: ['Ctrl+S'], pose: 'curious',
    title: (t) => (t.phase === 0 ? '오류가 나면' : 'Errors 패널'),
    body: (t) => (t.phase === 0
      ? '이번에는 일부러 한 줄을 틀리게 쓴 예제입니다. Assemble 버튼(또는 Ctrl+S 키)을 눌러 보세요. 오류가 어디에 어떻게 나오는지 이어서 보여 드립니다.'
      : `맨 위에 무엇이 잘못됐는지와 할 일이, 그 아래에 틀린 줄과 고치는 요령이 있습니다. ${t.host.errorLine() ?? ''}행으로 가기 버튼을 누르면 Editor 패널의 그 줄로 가고, 튜토리얼도 다음으로 넘어갑니다.`),
    targets: (t) => (t.phase === 0 ? [button('assemble')]
      : [textOf($('.run-side .errors .notice h3')), textOf($('.run-side .errors .item')), $('.run-side .errors .row .btn')]),
    // The Editor's line with the error is part of what to look at.
    avoid: (t) => (t.phase === 1 && !t.host.narrow() ? [$('.editor-panel')] : []),
    prepare: async (t) => { t.host.showView('editor'); },
    done: (_t, s) => (s.kind === 'assembled' && !s.ok ? 'phase' : s.kind === 'goto' ? 'next' : null),
    skip: async (t) => {
      if (t.phase === 0) { await t.host.assemble(); return; }
      const n = t.host.errorLine();
      if (n) t.host.goToLine(n);
    } },
  { kind: 'end', file: 'tutorial.s', pose: 'congrats',
    // Ends on the example, assembled and whole (not on step 19's errors).
    prepare: async (t) => { if (!t.host.assembled()) await t.host.assemble(); },
    title: () => '튜토리얼 끝!',
    body: () => '이제 새 파일을 열어 직접 써 보세요. 끝내기를 누르면 예제는 내려가고 튜토리얼 전의 화면으로 돌아갑니다. 튜토리얼은 오른쪽 위 물음표 버튼으로 언제든 다시 볼 수 있습니다.',
    targets: () => [] },
];
