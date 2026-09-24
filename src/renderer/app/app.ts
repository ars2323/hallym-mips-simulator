/* The window: direction 1, "무대 전환" (docs/mockups/README.md).

     A  first screen     welcome.ts
     B  code             editor + error list; Ctrl+S saves and assembles
     C  run              registers | Text/Data, console; F10 F5, 처음으로
     D  Inspector        a sheet over the bottom of Text, for a chosen instruction

   [코드]/[실행] at the top switches between B and C/D; a successful
   assemble goes to C by itself.  Execution control is what the simulator
   process already has: run, step, stop, breakpoints and the stop reasons
   (src/sim/protocol.ts).

   Nothing is restored from an earlier session.  The settings file keeps the
   font size and the Data panel's base; Ctrl+/- change the size for this
   session only. */

import { parseAssemblerMessage, resolveMessageLine, type AssemblerMessage } from '../../core/asm-errors.ts';
import { hex32 } from '../../core/format.ts';
import { generalRegisterName } from '../../core/registers.ts';
import type { Settings } from '../../main/main.ts';
import type { TextFileFormat } from '../../node/text-file.ts';
import type { RunResult } from '../../sim/protocol.ts';
import './api.ts';
import { character, code, codeText, h, icon, withHex } from './dom.ts';
import { createEditor } from './editor.ts';
import { stateAfter, stopMessage, textRows, type RegisterValues, type RunState, type TextRow } from './logic/machine.ts';
import { ConsolePanel } from './panels/console.ts';
import { Inspector } from './panels/inspector.ts';
import { RegisterPanel } from './panels/registers.ts';
import { TextPanel } from './panels/text.ts';
import { welcome } from './panels/welcome.ts';
import { aboutDialog } from './panels/about.ts';
import { defaultAdvanced, sameAdvanced, settingsDialog, type Advanced } from './panels/settings.ts';

type Phase = 'welcome' | 'code' | 'run';
const api = window.app;
const UNTITLED = '제목 없음.s';

// ---- state ------------------------------------------------------------------

let phase: Phase = 'welcome';
let file: { name: string; path: string | null; format: TextFileFormat | null } = { name: UNTITLED, path: null, format: null };
let dirty = false;
let settings: Settings = { fontSize: 13, dataBase: 16 };
let zoom = 0;                         // Ctrl+/-: this session only
let assembledText: string | null = null; // the program the machine holds
let lastProgram: string | null = null;   // the last one assembled, for 처음으로 (also after a crash)
let runState: RunState = 'ready';
let busy = false;                      // a call is on its way; keys wait
let steps = 0;
let lastRegs: RegisterValues | null = null;
let rows: TextRow[] = [];
let selected = -1;
const breakpoints = new Set<number>();
let resumeWith: 'run' | 'step' = 'run';
let congratsShown = false;             // once a session
let errors: { message: AssemblerMessage; line: number }[] = [];
let saveNote = '';
let crashNote = '';
let progress: { pc: number; instructions: number } | null = null;
let size: 'wide' | 'mid' | 'narrow' = 'mid';

// ---- the frame ----------------------------------------------------------------

function button(label: string, ic: string, key: string, onClick: () => void): HTMLButtonElement {
  const b = h('button', { class: 'btn', type: 'button', title: key ? `${label} (${key})` : label }, icon(ic),
    h('span', { class: 'label' }, label), key ? h('kbd', {}, key) : null);
  b.addEventListener('click', onClick);
  return b;
}
function iconButton(title: string, ic: string, onClick: () => void): HTMLButtonElement {
  const b = h('button', { class: 'iconbtn', type: 'button', title, 'aria-label': title }, icon(ic));
  b.addEventListener('click', onClick);
  return b;
}

const fileLabel = h('span', { class: 'file' });
const segCode = h('button', { class: 'on', type: 'button' }, '코드');
const segRun = h('button', { type: 'button' }, '실행');
segCode.addEventListener('click', () => setPhase('code'));
segRun.addEventListener('click', () => { if (assembledText !== null) setPhase('run'); });
const seg = h('span', { class: 'seg', role: 'tablist' }, segCode, segRun);
const bAssemble = button('어셈블', 'hammer', 'Ctrl+S', () => void saveAndAssemble());
const bRun = button('실행', 'play', 'F5', () => void runOrStop());
const bStep = button('한 줄', 'step-forward', 'F10', () => void step());
const bRestart = button('처음으로', 'rotate-ccw', '', () => void restart());
const bSettings = iconButton('설정', 'settings', () => settingsBox.open());
const top = h('header', { class: 'top' },
  h('span', { class: 'title' }, '한림 MIPS'), h('span', { class: 'sep' }), fileLabel, seg, h('span', { class: 'grow' }),
  bAssemble, bRun, bStep, bRestart, h('span', { class: 'sep' }),
  iconButton('튜토리얼 열기', 'circle-question-mark', () => void openTutorial()),
  iconButton('새 파일', 'file-plus', () => newFile()),
  iconButton('파일 열기 (Ctrl+O)', 'folder-open', () => void openFile()),
  bSettings);
const status = h('footer', { class: 'status' });

// A: first screen
const stageWelcome = h('main', { class: 'main stage-welcome' }, welcome({
  tutorial: () => void openTutorial(), newFile: () => newFile(), openFile: () => void openFile(),
}));

// B: code
const editorHost = h('div', { class: 'pbody edhost' });
const editorMeta = h('span', { class: 'meta' });
const errorList = h('section', { class: 'errors', hidden: true });
const editor = createEditor(editorHost, () => void saveAndAssemble(), () => {
  if (!dirty) { dirty = true; renderChrome(); }
});
const stageCode = h('main', { class: 'main stage-code', hidden: true },
  h('section', { class: 'panel editor-panel' },
    h('div', { class: 'phead' }, h('span', { class: 'name' }, '편집기'), editorMeta), editorHost, errorList));

// C, D: run
const text = new TextPanel({
  select: (addr) => select(addr),
  toggleBreakpoint: (addr) => void toggleBreakpoint(addr),
  openInspector: () => openInspector(),
});
text.onTab = (tab) => { if (tab === 'data') void refreshData(); };
const inspector = new Inspector();
inspector.onClose = () => closeInspector();
const consolePanel = new ConsolePanel();
consolePanel.onInput = (line) => void giveInput(line);
consolePanel.onToggle = () => layoutRun();
const congrats = h('div', { class: 'congrats', hidden: true });
const textWrap = h('div', { class: 'textwrap' }, text.root, inspector.root, congrats);
const regsHost = h('div', { class: 'regshost' });
let registers: RegisterPanel | null = null;
new ResizeObserver(() => text.setCovered(inspector.height)).observe(inspector.root);
const stageRun = h('main', { class: 'main stage-run', hidden: true }, regsHost, textWrap, consolePanel.root);

document.body.append(h('div', { class: 'app' }, top, stageWelcome, stageCode, stageRun, status));

// ---- phases and layout ---------------------------------------------------------

function setPhase(p: Phase): void {
  phase = p;
  stageWelcome.hidden = p !== 'welcome';
  stageCode.hidden = p !== 'code';
  stageRun.hidden = p !== 'run';
  if (p === 'code') requestAnimationFrame(() => editor.view.focus());
  if (p === 'run') layoutRun();
  renderChrome();
}

function measure(): void {
  const w = window.innerWidth;
  const next = w >= 1600 ? 'wide' : w >= 1100 ? 'mid' : 'narrow';
  const changed = (next === 'narrow') !== (size === 'narrow');
  size = next;
  document.documentElement.dataset.size = size;
  if (changed || !registers) buildRegisters();
  layoutRun();
}

function buildRegisters(): void {
  registers = new RegisterPanel(size === 'narrow' ? 'compact' : 'full', lastRegs ?? ZERO_REGS);
  regsHost.replaceChildren(registers.root);
}

function layoutRun(): void {
  stageRun.classList.toggle('narrow', size === 'narrow');
  stageRun.classList.toggle('sheet-open', inspector.open);
  stageRun.classList.toggle('console-open', consolePanel.expanded);
  text.setCovered(inspector.height);
  if (inspector.open) text.revealSelected();
}

const ZERO_REGS: RegisterValues = {
  pc: 0, hi: 0, lo: 0, epc: 0, cause: 0, badVAddr: 0, status: 0, general: new Array(32).fill(0), fp: new Array(32).fill(0),
};

// ---- font size ---------------------------------------------------------------------

function applyFont(): void {
  const fs = Math.max(10, Math.min(24, settings.fontSize + zoom));
  const root = document.documentElement.style;
  root.setProperty('--fs', `${fs}px`);
  root.setProperty('--row', `${Math.round(fs * 1.7)}px`);
  root.setProperty('--rrow', `${Math.round(fs * 1.62)}px`);
  root.setProperty('--regw', `${Math.round(fs * 40.8)}px`);
  text.relayout();
  editor.view.requestMeasure();
}

// ---- settings and about -----------------------------------------------------------

// 고급: this session only, from QtSpim's defaults at every start.  `applied`
// is what the machine on screen was assembled with.
let advanced: Advanced = defaultAdvanced();
let applied: Advanced = defaultAdvanced();

const about = aboutDialog();
const settingsBox = settingsDialog({
  fontSize: () => settings.fontSize,
  setFontSize: async (px) => {
    settings = await api.setSettings({ ...settings, fontSize: Math.max(10, Math.min(24, px)) });
    applyFont();
    return settings.fontSize;
  },
  dataBase: () => settings.dataBase,
  setDataBase: async (base) => {
    settings = await api.setSettings({ ...settings, dataBase: base });
    if (text.tab === 'data') void refreshData();
  },
  advanced: () => advanced,
  setAdvanced: (a) => { advanced = a; renderStatus(); },
  pickHandler: () => api.openHandler(),
  about: () => void about.open(),
});
document.body.append(settingsBox.root, about.root);

const assembleOptions = (a: Advanced) => ({
  fileName: file.name,
  machine: a.machine,
  run: { argv: ['program.s', ...a.args.split(/\s+/).filter(Boolean)], env: [] },
  handler: a.handler.kind === 'default' ? undefined : a.handler.kind === 'none' ? null : a.handler.text,
});

// ---- chrome: top bar and status bar ----------------------------------------------------

function renderChrome(): void {
  document.title = `${file.name}${dirty ? ' •' : ''} — 한림 MIPS 시뮬레이터`;
  fileLabel.replaceChildren(phase === 'welcome' ? '' : h('b', { class: 'mono' }, file.name), dirty ? h('span', { class: 'dirty', title: '저장하지 않은 변경' }, ' •') : '');
  seg.hidden = phase === 'welcome';
  segCode.className = phase === 'code' ? 'on' : '';
  segRun.className = phase === 'run' ? 'on' : assembledText === null ? 'dim' : '';
  segRun.disabled = assembledText === null;
  const running = runState === 'running';
  const setBtn = (b: HTMLButtonElement, on: boolean, primary: boolean) => {
    b.disabled = !on;
    b.classList.toggle('primary', primary && on);
  };
  setBtn(bAssemble, phase !== 'welcome' && !running, phase === 'code');
  bRun.replaceChildren(icon(running ? 'square' : 'play'), h('span', { class: 'label' }, running ? '멈춤' : '실행'),
    h('kbd', {}, running ? 'Esc' : 'F5'));
  bRun.title = running ? '멈춤 (Esc)' : '실행 (F5)';
  setBtn(bRun, phase !== 'welcome' && (running || (runState !== 'finished' && runState !== 'input')), running);
  setBtn(bStep, phase !== 'welcome' && !running && runState !== 'finished', phase === 'run' && !running);
  setBtn(bRestart, lastProgram !== null && phase === 'run' && !busy, false);
  editorMeta.replaceChildren(code(file.name), ` · ${file.format?.encoding ?? 'UTF-8'} · ${file.format?.lineEnd ?? 'LF'}`);
  renderStatus();
}

function renderStatus(): void {
  const parts: (Node | string)[] = [];
  const span = (cls: string, ...c: (Node | string)[]) => h('span', { class: cls }, ...c);
  if (crashNote) parts.push(span('err', crashNote));
  if (phase === 'welcome') parts.push(span('', '준비'));
  else if (phase === 'code' || assembledText === null) {
    if (errors.length) {
      parts.push(span('err', `오류 ${errors.length}개`));
      const e = errors[0];
      parts.push(span('', e.line ? `${e.line}행 · ` : '', withHex(e.message.message)));
    } else if (assembledText !== null && !dirty) parts.push(span('ok', '어셈블됨'));
    else parts.push(span('', dirty ? '고친 뒤 Ctrl+S 로 저장·어셈블' : '준비'));
    if (saveNote) parts.push(span('', saveNote));
  } else {
    const pc = lastRegs ? hex32(lastRegs.pc) : '';
    if (runState === 'running') {
      parts.push(span('run', '실행 중'));
      if (progress) parts.push(span('', 'PC ', code(hex32(progress.pc))), span('', `${progress.instructions.toLocaleString()}개 명령`));
      parts.push(span('', 'Esc 로 멈춤'));
    } else {
      const reason = lastReason;
      if (runState === 'ready') parts.push(span('', 'F10 한 줄 · F5 실행'));
      else if (runState === 'finished') parts.push(span(reason === 'error' ? 'err' : 'ok', stopMessageFor(reason, pc)));
      else parts.push(span('run', codeText(stopMessage(reason, pc))));
      if (steps > 0 && runState !== 'finished') parts.push(span('', `${steps}단계`));
      if (runState !== 'finished' && reason !== 'limit' && pc) parts.push(span('', 'PC ', code(pc)));
      if (changedNow) parts.push(span('', '방금 바뀜: ', code(changedNow)));
      if (inspector.open && selected >= 0) parts.push(span('', '고른 명령 ', code(hex32(selected))));
    }
    if (dirty) parts.push(span('warn', '코드가 바뀌었습니다 — Ctrl+S 로 다시 어셈블'));
    else if (!sameAdvanced(advanced, applied)) parts.push(span('warn', '고급 설정이 바뀌었습니다 — 처음으로 또는 Ctrl+S 로 다시 어셈블'));
  }
  status.replaceChildren(...parts);
}
let lastReason: RunResult['reason'] = 'limit';
let changedNow = '';
const stopMessageFor = (reason: RunResult['reason'], pc: string) =>
  reason === 'exit' ? '프로그램이 끝났습니다 — 처음으로 눌러 다시' : reason === 'error' ? '실행 오류로 멈췄습니다 — 콘솔을 보세요' : stopMessage(reason, pc);

// ---- files -------------------------------------------------------------------------

function confirmDiscard(): boolean {
  return !dirty || window.confirm('저장하지 않은 변경이 있습니다. 버리고 계속할까요?');
}

async function load(opened: { name: string; path: string | null; text: string; format: TextFileFormat } | null): Promise<void> {
  if (!opened) return;
  await forgetMachine();
  file = { name: opened.name, path: opened.path, format: opened.format };
  editor.setText(opened.text);
  dirty = false;
  errors = [];
  saveNote = '';
  renderErrors();
  setPhase('code');
}

function newFile(): void {
  if (!confirmDiscard()) return;
  void load({ name: UNTITLED, path: null, text: '', format: { encoding: 'UTF-8', byteOrderMark: false, lineEnd: 'LF' } })
    .then(() => { file.format = null; renderChrome(); });
}
async function openFile(): Promise<void> {
  if (!confirmDiscard()) return;
  await load(await api.openFile().catch((e: Error) => { saveNote = e.message; renderChrome(); return null; }));
}
async function openTutorial(): Promise<void> {
  if (!confirmDiscard()) return;
  await load(await api.openExample('tutorial.s'));
}

// The machine no longer matches what is on screen: a new file.
async function forgetMachine(): Promise<void> {
  if (runState === 'running') await api.stop();
  assembledText = null;
  lastProgram = null;
  runState = 'ready';
  breakpoints.clear();
  rows = [];
  text.setRows([]);
  lastRegs = null;
  closeInspector();
  consolePanel.clear();
}

// ---- assemble -------------------------------------------------------------------------

async function saveAndAssemble(): Promise<boolean> {
  if (busy || phase === 'welcome') return false;
  const source = editor.text();
  saveNote = '';
  try {
    const saved = await api.saveFile({ path: file.path, name: file.name, text: source, format: file.format });
    if (saved) {
      file.path = saved.path;
      file.name = saved.name;
      dirty = editor.text() !== source; // typed on while the dialog was up
      saveNote = '저장됨';
    } else saveNote = '저장하지 않음 (어셈블은 했습니다)';
  } catch (e) {
    saveNote = (e as Error).message;
  }
  return assemble(source, false);
}

// Assembles `source` into a fresh machine.  `again`: the same program as
// before (처음으로), so its breakpoints stay.
async function assemble(source: string, again: boolean): Promise<boolean> {
  busy = true;
  congrats.hidden = true;
  try {
    if (runState === 'running') await api.stop();
    const same = again || source === lastProgram;
    let r: Awaited<ReturnType<typeof api.call<'assemble'>>>;
    try {
      r = await api.call('assemble', source, assembleOptions(advanced));
    } catch {
      return false; // the process died (a .err directive): onCrashed says so
    }
    crashNote = '';
    consolePanel.clear();
    steps = 0;
    progress = null;
    changedNow = '';
    lastReason = 'limit';
    const lines = source.split('\n');
    errors = r.ok ? [] : r.errors.map((raw) => {
      const message = parseAssemblerMessage(raw);
      return { message, line: resolveMessageLine(message, lines) };
    });
    renderErrors();
    if (!r.ok) {
      assembledText = null;
      runState = 'ready';
      setPhase('code');
      return false;
    }
    if (!same) breakpoints.clear();
    for (const a of breakpoints) await api.call('setBreakpoint', a);
    assembledText = source;
    lastProgram = source;
    applied = structuredClone(advanced);
    runState = 'ready';
    rows = textRows(await api.call('textSegment'));
    text.setRows(rows);
    const regs = await api.call('registers');
    registers?.update(regs, null);
    lastRegs = regs;
    text.setPc(regs.pc);
    if (selected >= 0 && !rows.some((x) => x.addr === selected)) closeInspector();
    else if (inspector.open && selected >= 0) showSelected();
    if (!again) text.setTab('text');
    if (text.tab === 'data') void refreshData();
    setPhase('run');
    return true;
  } finally {
    busy = false;
    renderChrome();
  }
}

function renderErrors(): void {
  editor.showErrors(errors.map((e) => e.line).filter((n) => n > 0));
  errorList.hidden = errors.length === 0;
  if (!errors.length) { errorList.replaceChildren(); return; }
  errorList.replaceChildren(
    h('div', { class: 'phead' }, h('span', { class: 'name' }, '오류'),
      h('span', { class: 'meta' }, `${errors.length}개 · 어셈블은 여기서 멈췄습니다. 고친 뒤 다시 Ctrl+S`)),
    h('div', { class: 'items' }, ...errors.map((e) => {
      const go = h('button', { class: 'linkbtn go', type: 'button' }, '이 줄로 가기');
      const item = h('div', { class: 'item' }, h('span', { class: 'dot' }),
        h('span', { class: 'line' }, e.line ? `${e.line}행` : ''),
        h('span', { class: 'msg' }, withHex(e.message.message), e.message.source ? code(e.message.source, 'src') : null),
        e.line ? go : h('span'));
      go.addEventListener('click', () => editor.goToLine(e.line));
      return item;
    })));
}

// ---- running ----------------------------------------------------------------------------

// Before F5 or F10: the program on screen has to be the one in the machine.
async function ready(): Promise<boolean> {
  if (busy) return false;
  if (assembledText === null || dirty) {
    if (phase === 'welcome') return false;
    return saveAndAssemble();
  }
  return true;
}

async function runOrStop(): Promise<void> {
  if (runState === 'running') return stop();
  return run();
}

async function run(): Promise<void> {
  if (!(await ready())) return;
  if (runState === 'finished') { renderStatus(); return; }
  if (runState === 'input') { consolePanel.waitForInput(true); return; }
  setPhase('run');
  resumeWith = 'run';
  runState = 'running';
  steps = 0;
  progress = null;
  renderChrome();
  if (applied.machine.mappedIo) consolePanel.waitForInput(true); // the program polls the receiver as it runs
  await go(() => api.call('run'));
}

async function step(): Promise<void> {
  if (!(await ready())) return;
  if (runState === 'finished' || runState === 'running') return;
  setPhase('run');
  resumeWith = 'step';
  await go(() => api.call('step', 1));
}

async function go(call: () => Promise<RunResult>): Promise<void> {
  busy = true;
  congrats.hidden = true;
  const before = lastRegs;
  let result: RunResult;
  try {
    result = await call();
  } catch {
    busy = false; // the crash report (onCrashed) says what happened
    return;
  }
  try {
    const now = await api.call('registers');
    if (result.reason !== 'input' && resumeWith === 'step') steps += 1;
    lastReason = result.reason;
    runState = stateAfter(result.reason);
    registers?.update(now, before);
    changedNow = changedKey(before, now);
    lastRegs = now;
    text.setPc(now.pc);
    if (inspector.open && selected >= 0) showSelected();
    for (const e of result.errors) consolePanel.append(e.endsWith('\n') ? e : e + '\n');
    consolePanel.waitForInput(result.reason === 'input');
    if (text.tab === 'data') void refreshData();
    if (result.reason === 'exit' && result.errors.length === 0 && !congratsShown) showCongrats();
  } finally {
    busy = false;
    renderChrome();
  }
}

function changedKey(before: RegisterValues | null, now: RegisterValues): string {
  if (!before) return '';
  for (let n = 0; n < 32; n += 1) if (before.general[n] !== now.general[n]) return generalRegisterName(n);
  if (before.hi !== now.hi) return 'HI';
  if (before.lo !== now.lo) return 'LO';
  return '';
}

async function stop(): Promise<void> {
  if (runState !== 'running') return;
  await api.stop(); // the run's own answer ('stopped') updates the window
}

async function restart(): Promise<void> {
  if (busy || lastProgram === null) return;
  await assemble(lastProgram, true);
}

async function giveInput(line: string): Promise<void> {
  await api.call('provideInput', line + '\n');
  if (runState === 'running') return; // mapped I/O: the program reads it as it runs
  consolePanel.waitForInput(false);
  runState = 'paused';
  if (resumeWith === 'run') await run();
  else await step();
}

async function toggleBreakpoint(addr: number): Promise<void> {
  const on = !breakpoints.has(addr);
  if (on) breakpoints.add(addr); else breakpoints.delete(addr);
  await api.call(on ? 'setBreakpoint' : 'clearBreakpoint', addr);
  text.setBreakpoint(addr, on);
}

// ---- the Inspector ----------------------------------------------------------------------

function select(addr: number): void {
  selected = addr;
  text.setSelected(addr);
  openInspector();
}

function showSelected(): void {
  const row = text.rowFor(selected);
  if (row) inspector.show(row, (lastRegs ?? ZERO_REGS).general, applied.machine.delayedBranches ? 'MipsDelaySlot' : 'SpimNoDelaySlot');
  else inspector.empty();
}

function openInspector(): void {
  if (selected >= 0) showSelected(); else inspector.empty();
  inspector.open = true;
  layoutRun();
  renderStatus();
}

function closeInspector(): void {
  inspector.open = false;
  selected = -1;
  text.setSelected(-1);
  layoutRun();
  renderStatus();
}

// ---- Data ------------------------------------------------------------------------------

async function refreshData(): Promise<void> {
  if (assembledText === null) { text.dataView.replaceChildren(); return; }
  const s = await api.call('segments');
  const regs = lastRegs ?? await api.call('registers');
  const sp = regs.general[29] >>> 0;
  const part = async (name: string, from: number, to: number) => ({
    name, from, to, words: await api.call('readWords', from, (to - from) / 4),
    bytes: await api.call('readBytes', from, to - from),
  });
  const stackTop = 0x80000000;
  const sections = [await part('데이터', s.dataBot, s.dataTop)];
  if (sp < stackTop && stackTop - sp <= 0x10000) sections.push(await part('스택', sp & ~15, stackTop));
  text.showData(sections, settings.dataBase);
}

// ---- first successful run -------------------------------------------------------------------

function showCongrats(): void {
  congratsShown = true;
  const close = h('button', { class: 'btn small', type: 'button' }, '닫기');
  close.addEventListener('click', () => { congrats.hidden = true; });
  congrats.replaceChildren(character('congrats', 120),
    h('div', { class: 'say' }, h('h3', {}, '첫 실행 성공!'), h('p', {}, '프로그램이 끝까지 실행되었습니다.'), close));
  congrats.hidden = false;
}

// ---- keys -----------------------------------------------------------------------------------

window.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]')) return; // the dialog has the keys (Esc closes it)
  const mod = e.ctrlKey || e.metaKey;
  const inEditor = editorHost.contains(e.target as Node);
  if (e.key === 'F5') { e.preventDefault(); void runOrStop(); return; }
  if (e.key === 'F10') { e.preventDefault(); void step(); return; }
  if (e.key === 'Escape') {
    if (runState === 'running') { e.preventDefault(); void stop(); }
    else if (inspector.open) closeInspector();
    return;
  }
  if (!mod) return;
  const k = e.key.toLowerCase();
  if (k === 's') { e.preventDefault(); if (inEditor) editor.requestSave(e.isComposing); else void saveAndAssemble(); }
  else if (k === 'o') { e.preventDefault(); void openFile(); }
  else if (k === '=' || k === '+') { e.preventDefault(); zoom += 1; applyFont(); }
  else if (k === '-') { e.preventDefault(); zoom -= 1; applyFont(); }
  else if (k === '0') { e.preventDefault(); zoom = 0; applyFont(); }
}, true);

// ---- events from the simulator ------------------------------------------------------------------

api.onConsole((t) => consolePanel.append(t));
api.onProgress((p) => { progress = p; if (runState === 'running') renderStatus(); });
api.onCrashed((message, detail) => {
  // detail: "시뮬레이터가 중단되었습니다 (fatal error in the simulator core: File contains an .err directive)"
  crashNote = `${detail || message} — 다시 어셈블하세요`;
  assembledText = null;
  runState = 'ready';
  busy = false;
  consolePanel.waitForInput(false);
  renderChrome();
});

// ---- start ----------------------------------------------------------------------------

async function start(): Promise<void> {
  settings = await api.getSettings();
  applyFont();
  measure();
  new ResizeObserver(() => measure()).observe(document.body);
  setPhase('welcome');
}
void start();
