/* The window.

     title bar   logo, name, file, the toolbar; the system's own caption
                 buttons on the right (titleBarOverlay, src/main/main.ts)
     work        the first screen (welcome.ts), then Editor | Run side by
                 side: a splitter between them, either side can be folded
     status bar

   The Run side shows the machine only while it holds the program in the
   Editor.  Before the first assemble, or once the code has changed, it shows
   a card that says so instead of a wall of stale panels.  While a program
   runs, the Editor marks the line being executed (the Text panel's line
   column: the core's own PC -> source mapping).

   Narrow windows (under NARROW_PX CSS pixels) show one side at a time, with
   Editor / Run tabs in the title bar.

   Nothing is restored from an earlier session.  The settings file keeps the
   font size and the Data panel's base; Ctrl+/- change the size for this
   session only; the splitter and the folds are this session's too. */

import { parseAssemblerMessage, resolveMessageLine, simplified, type AssemblerMessage } from '../../core/asm-errors.ts';
import { hex32 } from '../../core/format.ts';
import { LabelMap, parseSymbolListing } from '../../core/symbols.ts';
import { generalRegisterName } from '../../core/registers.ts';
import type { Settings } from '../../main/main.ts';
import type { TextFileFormat } from '../../node/text-file.ts';
import type { RunResult } from '../../sim/protocol.ts';
import './api.ts';
import { asset, character, code, codeText, h, icon, withHex } from './dom.ts';
import { createEditor } from './editor.ts';
import { stateAfter, stopMessage, textRows, type RegisterValues, type RunState, type TextRow } from './logic/machine.ts';
import { aboutDialog } from './panels/about.ts';
import { ConsolePanel } from './panels/console.ts';
import { Inspector } from './panels/inspector.ts';
import { RegisterPanel } from './panels/registers.ts';
import { defaultAdvanced, sameAdvanced, settingsDialog, type Advanced } from './panels/settings.ts';
import { TextPanel } from './panels/text.ts';
import { welcome } from './panels/welcome.ts';
import type { DataSection } from './panels/data.ts';
import { panelHead } from './ui.ts';

const api = window.app;
const UNTITLED = '제목 없음.s';
const APP_NAME = 'Hallym MIPS';
// Below this width (CSS px) the Editor and Run sides take turns.  A lab PC
// (1366x768 at 125%) gives 1093: still side by side.  1366 at 150% gives
// 910, and a half-screen window on a 1920 display 960: one at a time.
const NARROW_PX = 980;

// ---- state ------------------------------------------------------------------

let open = false;                      // a document is open (past the first screen)
let file: { name: string; path: string | null; format: TextFileFormat | null } = { name: UNTITLED, path: null, format: null };
let dirty = false;
let settings: Settings = { fontSize: 13, dataBase: 16 };
let zoom = 0;                          // Ctrl+/-: this session only
let assembledText: string | null = null; // the program the machine holds
let lastProgram: string | null = null;   // the last one assembled, for 처음으로 (also after a crash)
let runState: RunState = 'ready';
let busy = false;                      // a call is on its way; keys wait
let steps = 0;
let lastRegs: RegisterValues | null = null;
let rows: TextRow[] = [];
let selected = -1;
const breakpoints = new Set<number>();
const labels = new LabelMap();          // the program's, for Data
let resumeWith: 'run' | 'step' = 'run';
let congratsShown = false;             // once a session
let errors: { message: AssemblerMessage; line: number }[] = [];
let saveNote = '';
let crashNote = '';
let progress: { pc: number; instructions: number } | null = null;
let lastReason: RunResult['reason'] = 'limit';
let changedNow = '';
let narrow = false;
let view: 'editor' | 'run' = 'editor'; // narrow windows: the side on show
let editorWidth: number | null = null; // px, from the splitter; null: the default share
let speed: 'fast' | 'slow' = 'fast';   // this session only
let slow: { cancel(): void } | null = null; // a slow run going on
let switchTo: 'fast' | 'slow' | null = null; // a run being switched to the other speed

// ---- the title bar --------------------------------------------------------------

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
const bAssemble = button('어셈블', 'hammer', 'Ctrl+S', () => void saveAndAssemble());
const bRun = button('실행', 'play', 'F5', () => void runOrStop());
const bStep = button('한 줄', 'step-forward', 'F10', () => void step());
const bRestart = button('처음으로', 'rotate-ccw', '', () => void restart());
// The speed of 실행: 즉시 (the core runs on its own) or one line a second.
const speedFast = h('button', { type: 'button', role: 'radio', title: '즉시 실행' }, '즉시');
const speedSlow = h('button', { type: 'button', role: 'radio', title: '한 줄에 1초씩 실행' }, '1줄/1초');
speedFast.addEventListener('click', () => void setSpeed('fast'));
speedSlow.addEventListener('click', () => void setSpeed('slow'));
const speedSwitch = h('span', { class: 'seg speed', role: 'radiogroup', 'aria-label': '실행 속도' }, speedFast, speedSlow);
const bSettings = iconButton('설정', 'settings', () => settingsBox.open());
const viewEditor = h('button', { type: 'button', role: 'tab' }, 'Editor');
const viewRun = h('button', { type: 'button', role: 'tab' }, 'Run');
viewEditor.addEventListener('click', () => showView('editor'));
viewRun.addEventListener('click', () => showView('run'));
const viewSwitch = h('span', { class: 'seg viewswitch', role: 'tablist', hidden: true }, viewEditor, viewRun);
const titlebar = h('header', { class: 'titlebar' },
  h('span', { class: 'brand' },
    h('img', { class: 'logo', src: asset('hallym/marks/symbol-basic.svg'), alt: '' }),
    h('span', { class: 'appname' }, APP_NAME)),
  fileLabel,
  h('span', { class: 'toolbar' }, bAssemble, bRun, speedSwitch, bStep, bRestart),
  viewSwitch,
  h('span', { class: 'drag' }),
  h('span', { class: 'tools' },
    iconButton('튜토리얼 예제 열기', 'circle-question-mark', () => void openTutorial()),
    iconButton('새 파일', 'file-plus', () => newFile()),
    iconButton('파일 열기 (Ctrl+O)', 'folder-open', () => void openFile()),
    bSettings));
const status = h('footer', { class: 'status' });

// ---- the first screen ------------------------------------------------------------

const stageWelcome = h('div', { class: 'stage-welcome' }, welcome({
  tutorial: () => void openTutorial(), newFile: () => newFile(), openFile: () => void openFile(),
}));

// ---- the Editor side -------------------------------------------------------------------

const editorHost = h('div', { class: 'pbody edhost' });
const errorList = h('section', { class: 'errors', hidden: true });
const editor = createEditor(editorHost, () => void saveAndAssemble(), () => {
  if (!dirty) { dirty = true; renderChrome(); }
});
const editorHead = panelHead('Editor');
const editorPanel = h('section', { class: 'panel editor-panel', 'aria-label': 'Editor' }, editorHead.root, editorHost, errorList);

// ---- the Run side ----------------------------------------------------------------------

const text = new TextPanel({
  select: (addr) => select(addr),
  toggleBreakpoint: (addr) => void toggleBreakpoint(addr),
});
text.onTab = (tab) => { if (tab === 'data') void refreshData(); };
const inspector = new Inspector();
const consolePanel = new ConsolePanel();
consolePanel.onInput = (line) => void giveInput(line);
consolePanel.onToggle = () => layout();
const congrats = h('div', { class: 'congrats', hidden: true });
const regsHost = h('div', { class: 'regshost' });
let registers: RegisterPanel | null = null;
const centre = h('div', { class: 'centre' }, text.root, inspector.root, congrats);
const runGrid = h('div', { class: 'run-grid' }, regsHost, centre, consolePanel.root);
const placeholder = h('div', { class: 'run-placeholder' });
const runPanel = h('div', { class: 'run-side' }, placeholder, runGrid);

// ---- the split -------------------------------------------------------------------------

const railEditor = h('button', { class: 'rail', type: 'button', title: 'Editor 펼치기', 'aria-label': 'Editor 펼치기' }, h('span', {}, 'Editor ›'));
const railRun = h('button', { class: 'rail', type: 'button', title: 'Run 펼치기', 'aria-label': 'Run 펼치기' }, h('span', {}, '‹ Run'));
railEditor.addEventListener('click', () => unfold());
railRun.addEventListener('click', () => unfold());
// The splitter: drag to share the width, double-click for the default
// share; its two small buttons fold one side away (a rail brings it back).
const foldEditor = h('button', { class: 'foldbtn', type: 'button', title: 'Editor 접기', 'aria-label': 'Editor 접기' }, '‹');
const foldRun = h('button', { class: 'foldbtn', type: 'button', title: 'Run 접기', 'aria-label': 'Run 접기' }, '›');
foldEditor.addEventListener('click', () => fold('editor'));
foldRun.addEventListener('click', () => fold('run'));
const splitter = h('div', { class: 'splitter', role: 'separator', 'aria-orientation': 'vertical', title: '끌어서 폭 조절 · 두 번 눌러 되돌리기' },
  foldEditor, h('span', { class: 'grip' }), foldRun);
const paneEditor = h('div', { class: 'pane pane-editor' }, editorPanel, railEditor);
const paneRun = h('div', { class: 'pane pane-run' }, runPanel, railRun);
const split = h('div', { class: 'split' }, paneEditor, splitter, paneRun);
const work = h('main', { class: 'work' }, stageWelcome, split);

document.body.append(h('div', { class: 'app' }, titlebar, work, status));

let folded: 'none' | 'editor' | 'run' = 'none';
function fold(side: 'editor' | 'run'): void { folded = side; layout(); }
function unfold(): void { folded = 'none'; layout(); }

splitter.addEventListener('pointerdown', (e) => {
  if ((e.target as HTMLElement).closest('.foldbtn')) return;
  splitter.setPointerCapture(e.pointerId);
  const left = split.getBoundingClientRect().left;
  const move = (m: PointerEvent) => {
    const total = split.clientWidth;
    editorWidth = Math.max(280, Math.min(total - 360, m.clientX - left));
    layout();
  };
  const up = () => { splitter.removeEventListener('pointermove', move); splitter.removeEventListener('pointerup', up); };
  splitter.addEventListener('pointermove', move);
  splitter.addEventListener('pointerup', up);
});
splitter.addEventListener('dblclick', () => { editorWidth = null; layout(); });

function showView(v: 'editor' | 'run'): void {
  view = v;
  layout();
  if (v === 'editor') requestAnimationFrame(() => editor.view.focus());
}

// ---- layout ------------------------------------------------------------------------------

function measure(): void {
  const wasNarrow = narrow;
  narrow = window.innerWidth < NARROW_PX;
  document.documentElement.dataset.narrow = String(narrow);
  if (!registers) buildRegisters();
  void wasNarrow;
  layout();
}

function buildRegisters(): void {
  registers = new RegisterPanel(lastRegs ?? ZERO_REGS);
  regsHost.replaceChildren(registers.root);
}

// The Run side shows the machine only while it holds the Editor's program.
const machineShown = () => assembledText !== null && !dirty;

function layout(): void {
  stageWelcome.hidden = open;
  split.hidden = !open;
  viewSwitch.hidden = !open || !narrow;
  split.classList.toggle('narrow', narrow);
  split.dataset.view = view;
  split.dataset.folded = narrow ? 'none' : folded;
  viewEditor.classList.toggle('on', view === 'editor');
  viewRun.classList.toggle('on', view === 'run');
  if (editorWidth !== null) split.style.setProperty('--editor-w', `${editorWidth}px`);
  else split.style.removeProperty('--editor-w');

  const shown = machineShown();
  runGrid.hidden = !shown;
  placeholder.hidden = shown;
  if (!shown) renderPlaceholder();
  runGrid.classList.toggle('console-open', consolePanel.expanded);
  editor.showPcLine(shown && runState !== 'ready' ? pcSourceLine() : null);
}

function renderPlaceholder(): void {
  const changed = assembledText !== null || (lastProgram !== null && dirty);
  const [title, body] = changed
    ? ['코드가 바뀌었습니다', '지금 기계에 있는 것은 바뀌기 전의 코드입니다. 저장하고 다시 어셈블하면 새 코드로 여기가 채워집니다.']
    : errors.length
      ? ['어셈블하지 못했습니다', '왼쪽 Editor 아래의 오류를 고친 뒤 다시 어셈블하면 여기에 나타납니다.']
      : ['아직 어셈블하지 않았습니다', '어셈블하면 여기에 레지스터 · 명령 · 콘솔이 나타납니다.'];
  const go = h('button', { class: 'btn primary', type: 'button' }, icon('hammer'), h('span', {}, '어셈블'), h('kbd', {}, 'Ctrl+S'));
  go.addEventListener('click', () => void saveAndAssemble());
  // The text first, then Haram pointing left past it, at the Editor.
  placeholder.replaceChildren(h('div', { class: 'card' },
    h('div', { class: 'say' }, h('h3', {}, title), h('p', {}, body), go),
    character('guide', 150)));
  placeholder.dataset.kind = changed ? 'changed' : errors.length ? 'errors' : 'fresh';
}

// The Editor line of PC: the Text row's line, or that of the source line a
// pseudo instruction's later words belong to.  Only the student's own lines:
// the start-up code comes from the exception handler, whose line numbers
// are not the Editor's (the row's source text must be on that line).
function pcSourceLine(): number | null {
  if (!lastRegs) return null;
  let i = rows.findIndex((r) => r.addr === lastRegs!.pc);
  if (i < 0 || rows[i].kernel) return null;
  while (i > 0 && rows[i].line === 0) i -= 1;
  const row = rows[i];
  if (row.line === 0 || row.line > editor.view.state.doc.lines) return null;
  const onLine = simplified(editor.view.state.doc.line(row.line).text);
  return row.source && onLine.includes(simplified(row.source)) ? row.line : null;
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

// ---- chrome: title bar and status bar ----------------------------------------------------

function renderChrome(): void {
  document.title = open ? `${file.name}${dirty ? ' •' : ''} — ${APP_NAME}` : APP_NAME;
  fileLabel.replaceChildren(open ? h('b', { class: 'mono' }, file.name) : '',
    open && dirty ? h('span', { class: 'dirty', title: '저장하지 않은 변경' }, ' •') : '');
  const running = runState === 'running';
  const setBtn = (b: HTMLButtonElement, on: boolean, primary: boolean) => {
    b.disabled = !on;
    b.classList.toggle('primary', primary && on);
  };
  setBtn(bAssemble, open && !running, !machineShown());
  bRun.replaceChildren(icon(running ? 'square' : 'play'), h('span', { class: 'label' }, running ? '멈춤' : '실행'),
    h('kbd', {}, running ? 'Esc' : 'F5'));
  bRun.title = running ? '멈춤 (Esc)' : '실행 (F5)';
  setBtn(bRun, open && (running || (runState !== 'finished' && runState !== 'input')), running);
  setBtn(bStep, open && !running && runState !== 'finished', machineShown() && !running);
  setBtn(bRestart, lastProgram !== null && !busy, false);
  speedFast.classList.toggle('on', speed === 'fast');
  speedSlow.classList.toggle('on', speed === 'slow');
  speedFast.setAttribute('aria-checked', String(speed === 'fast'));
  speedSlow.setAttribute('aria-checked', String(speed === 'slow'));
  editorHead.setMeta(open ? h('span', {}, code(file.name), ` · ${file.format?.encoding ?? 'UTF-8'} · ${file.format?.lineEnd ?? 'LF'}`) : '');
  layout();
  renderStatus();
}

function renderStatus(): void {
  const parts: (Node | string)[] = [];
  const span = (cls: string, ...c: (Node | string)[]) => h('span', { class: cls }, ...c);
  if (crashNote) parts.push(span('err', crashNote));
  if (!open) parts.push(span('', '준비'));
  else if (assembledText === null) {
    if (errors.length) {
      parts.push(span('err', `오류 ${errors.length}개`));
      const e = errors[0];
      parts.push(span('', e.line ? `${e.line}행 · ` : '', withHex(e.message.message)));
    } else parts.push(span('', dirty ? '고친 뒤 Ctrl+S 로 저장·어셈블' : 'Ctrl+S 로 저장·어셈블'));
    if (saveNote) parts.push(span('', saveNote));
  } else {
    const pc = lastRegs ? hex32(lastRegs.pc) : '';
    if (runState === 'running' && slow) {
      parts.push(span('run', '천천히 실행 중 (1줄/1초)'));
      if (steps > 0) parts.push(span('', `${steps}단계`));
      if (pc) parts.push(span('', 'PC ', code(pc)));
      if (changedNow) parts.push(span('', '방금 바뀜: ', code(changedNow)));
      parts.push(span('', 'Esc 로 멈춤 · 속도를 즉시로 바꿔도 됩니다'));
    } else if (runState === 'running') {
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
      if (selected >= 0) parts.push(span('', '고른 명령 ', code(hex32(selected))));
    }
    if (dirty) parts.push(span('warn', '코드가 바뀌었습니다 — Ctrl+S 로 다시 어셈블'));
    else if (!sameAdvanced(advanced, applied)) parts.push(span('warn', '고급 설정이 바뀌었습니다 — 처음으로 또는 Ctrl+S 로 다시 어셈블'));
  }
  status.replaceChildren(...parts);
}
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
  crashNote = '';
  renderErrors();
  open = true;
  view = 'editor';
  renderChrome();
  requestAnimationFrame(() => editor.view.focus());
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
  clearSelection();
  consolePanel.clear();
}

// ---- assemble -------------------------------------------------------------------------

async function saveAndAssemble(): Promise<boolean> {
  if (busy || !open) return false;
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
      view = 'editor';
      return false;
    }
    if (!same) breakpoints.clear();
    for (const a of breakpoints) await api.call('setBreakpoint', a);
    assembledText = source;
    lastProgram = source;
    labels.clear();
    for (const sym of parseSymbolListing(r.symbols)) labels.add(sym.name, sym.address);
    applied = structuredClone(advanced);
    runState = 'ready';
    rows = textRows(await api.call('textSegment'));
    text.setRows(rows);
    const regs = await api.call('registers');
    registers?.update(regs, null);
    lastRegs = regs;
    text.setPc(regs.pc);
    if (selected >= 0 && !rows.some((x) => x.addr === selected)) clearSelection();
    else showInspector();
    if (!again) text.setTab('text');
    if (text.tab === 'data') void refreshData();
    if (narrow) view = 'run';
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
    h('div', { class: 'phead' }, h('span', { class: 'ptitle' }, '오류'),
      h('span', { class: 'pmeta' }, `${errors.length}개 · 어셈블은 여기서 멈췄습니다. 고친 뒤 다시 Ctrl+S`)),
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
    if (!open) return false;
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
  if (speed === 'slow') return runSlow();
  resumeWith = 'run';
  runState = 'running';
  steps = 0;
  progress = null;
  renderChrome();
  if (applied.machine.mappedIo) consolePanel.waitForInput(true); // the program polls the receiver as it runs
  await go(() => api.call('run'));
  if (switchTo === 'slow' && (runState as RunState) === 'paused') { switchTo = null; await runSlow(); }
}

async function step(): Promise<void> {
  if (!(await ready())) return;
  if (runState === 'finished' || runState === 'running') return;
  resumeWith = 'step';
  await go(() => api.call('step', 1));
}

async function go(call: () => Promise<RunResult>): Promise<RunResult | null> {
  busy = true;
  congrats.hidden = true;
  const before = lastRegs;
  let result: RunResult;
  try {
    result = await call();
  } catch {
    busy = false; // the crash report (onCrashed) says what happened
    return null;
  }
  try {
    const now = await api.call('registers');
    if (result.reason !== 'input' && resumeWith === 'step') steps += 1;
    lastReason = result.reason;
    // A slow run between two of its steps is still running.
    runState = slow && result.reason === 'limit' ? 'running' : stateAfter(result.reason);
    registers?.update(now, before);
    changedNow = changedKey(before, now);
    lastRegs = now;
    text.setPc(now.pc);
    showInspector();
    for (const e of result.errors) consolePanel.append(e.endsWith('\n') ? e : e + '\n');
    consolePanel.waitForInput(result.reason === 'input');
    if (text.tab === 'data') void refreshData();
    if (result.reason === 'exit' && result.errors.length === 0 && !congratsShown) showCongrats();
    return result;
  } finally {
    busy = false;
    renderChrome();
  }
}

/* 실행 at one line a second.  The window steps the core itself, one
   instruction per call, and waits a second in between; stopping (Esc, 멈춤)
   cancels the wait at once, so a slow run of a billion-step loop is never
   more than a click away from ending.  Every step updates what a step
   updates: registers, the Inspector, the Editor's line.  A breakpoint stops
   it before its instruction; switching to 즉시 hands the rest to the core. */
async function runSlow(): Promise<void> {
  resumeWith = 'run';
  runState = 'running';
  steps = 0;
  let cancelled = false;
  let wake: (() => void) | null = null;
  slow = { cancel: () => { cancelled = true; wake?.(); } };
  renderChrome();
  try {
    for (let first = true; !cancelled; first = false) {
      if (!first && lastRegs && breakpoints.has(lastRegs.pc)) { // stop before it, as the core does
        runState = 'paused';
        lastReason = 'breakpoint';
        return;
      }
      resumeWith = 'step';
      const result = await go(() => api.call('step', 1));
      resumeWith = 'run';
      if (!result || result.reason !== 'limit') return; // the end, an error, input, a crash
      if (cancelled) break;   // stopped while that step was on its way
      runState = 'running';
      renderChrome();
      await new Promise<void>((done) => { wake = done; setTimeout(done, 1000); });
    }
    runState = 'paused';        // stopped, or switched to 즉시
    lastReason = 'stopped';
  } finally {
    slow = null;
    renderChrome();
  }
  if (switchTo === 'fast') { switchTo = null; await run(); }
}

async function setSpeed(next: 'fast' | 'slow'): Promise<void> {
  if (next === speed) return;
  speed = next;
  renderChrome();
  if (runState !== 'running') return;
  switchTo = next;
  if (next === 'fast') slow?.cancel();   // runSlow() then goes on with run()
  else await api.stop();                // run() then goes on with runSlow()
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
  switchTo = null;
  if (slow) { slow.cancel(); return; } // the wait ends now; runSlow() says 'stopped'
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

// A row chosen in Text pins the Inspector to it; otherwise it follows PC.
function select(addr: number): void {
  selected = addr;
  text.setSelected(addr);
  showInspector();
  renderStatus();
}

function clearSelection(): void {
  selected = -1;
  text.setSelected(-1);
  showInspector();
}

function showInspector(): void {
  const convention = applied.machine.delayedBranches ? 'MipsDelaySlot' : 'SpimNoDelaySlot';
  const regs = (lastRegs ?? ZERO_REGS).general;
  const pinned = selected >= 0 ? text.rowFor(selected) : undefined;
  if (pinned) { inspector.show(pinned, regs, true, convention); return; }
  const started = runState !== 'ready' || steps > 0;
  const atPc = lastRegs && started ? text.rowFor(lastRegs.pc) : undefined;
  if (atPc) inspector.show(atPc, regs, false, convention);
  else inspector.guide();
}
inspector.onFollow = () => { clearSelection(); renderStatus(); };

// ---- Data ------------------------------------------------------------------------------

async function refreshData(): Promise<void> {
  if (assembledText === null) { text.data.clear(); return; }
  const s = await api.call('segments');
  const regs = lastRegs ?? await api.call('registers');
  const sp = regs.general[29] >>> 0;
  const part = async (kind: DataSection['kind'], from: number, to: number): Promise<DataSection> => ({
    kind, from, to, words: await api.call('readWords', from, (to - from) / 4),
    bytes: await api.call('readBytes', from, to - from),
  });
  const stackTop = 0x80000000;
  const sections = [await part('data', s.dataBot, s.dataTop)];
  if (sp < stackTop && stackTop - sp <= 0x10000) sections.push(await part('stack', sp & ~15, stackTop));
  sections.push(await part('kernel', s.kDataBot, s.kDataTop));
  const pointers = [29, 30, 28].map((n) => ({ name: generalRegisterName(n), value: regs.general[n] >>> 0 }));
  text.data.show(sections, settings.dataBase, labels, pointers);
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
    else if (selected >= 0) { clearSelection(); renderStatus(); }
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
  renderChrome();
}
void start();
