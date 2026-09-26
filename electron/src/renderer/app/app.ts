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

   Widths: the Run side first gets what Registers (Hex, Dec, Bin) and Text
   (Address, Encoding, Format, Instruction) need; the Editor takes 40% of
   the rest of the window, or less, never under 300 px (a lab PC: 1093 px in
   all).  The title bar gives way in steps (fitTitlebar): key hints, the
   buttons' icons, the speed as one button, last the program's name -- the
   buttons keep their names.

   Nothing is restored from an earlier run: the font size, the Data radix,
   Ctrl+/-, the splitter and the folds are this run's only (src/main/main.ts
   keeps nothing on disk). */

import { parseAssemblerMessage, resolveMessageLine, simplified, type AssemblerMessage } from '../../core/asm-errors.ts';
import { hex32 } from '../../core/format.ts';
import { LabelMap, parseSymbolListing } from '../../core/symbols.ts';
import { generalRegisterName } from '../../core/registers.ts';
import type { Settings } from '../../main/main.ts';
import type { TextFileFormat } from '../../node/text-file.ts';
import type { RunResult } from '../../sim/protocol.ts';
import './api.ts';
import { asset, character, code, codeText, h, icon, monoCh, withHex } from './dom.ts';
import { overlayColor } from './logic/overlay.ts';
import { notice } from './notice.ts';
import { nearMiss } from '../../core/near-miss.ts';
import { createEditor } from './editor.ts';
import { shortName } from './logic/names.ts';
import { stateAfter, stopMessage, textRows, type RegisterValues, type RunState, type TextRow } from './logic/machine.ts';
import { aboutDialog } from './panels/about.ts';
import { ConsolePanel } from './panels/console.ts';
import { Inspector } from './panels/inspector.ts';
import { RegisterPanel } from './panels/registers.ts';
import { defaultAdvanced, sameAdvanced, settingsDialog, type Advanced } from './panels/settings.ts';
import { TextPanel } from './panels/text.ts';
import { welcome } from './panels/welcome.ts';
import { ask } from './panels/ask.ts';
import { Tutorial, type Example, type Signal } from './tutorial.ts';
import type { DataSection } from './panels/data.ts';
import { panelHead } from './ui.ts';

const api = window.app;
const UNTITLED = 'untitled.s';
const APP_NAME = 'Hallym MIPS';
// Below this width (CSS px) the Editor and Run sides take turns.  A lab PC
// (1366x768 at 125%) gives 1093: still side by side.  1366 at 150% gives
// 910, and a half-screen window on a 1920 display 960: one at a time.
const NARROW_PX = 980;

// ---- state ------------------------------------------------------------------

let open = false;                      // a document is open (past the first screen)
// `example`: one of the tutorial's, read-only, never saved.
let file: { name: string; path: string | null; format: TextFileFormat | null; example?: Example } = { name: UNTITLED, path: null, format: null };
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
let note = '';                          // a one-off word in the status bar (breakpoints)
let crashNote = '';
let progress: { pc: number; instructions: number } | null = null;
let lastReason: RunResult['reason'] = 'limit';
let changedNow = '';
let narrow = false;
let view: 'editor' | 'run' = 'editor'; // narrow windows: the side on show
let editorWidth: number | null = null; // px, from the splitter; null: the default share
let consoleHeight: number | null = null; // px, from the grip over the Console; null: the default
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
const bAssemble = button('Assemble', 'hammer', 'Ctrl+S', () => void saveAndAssemble());
const bRun = button('Run', 'play', 'F5', () => void runOrStop());
const bStep = button('Step', 'step-forward', 'F10', () => void step());
const bRestart = button('Reset', 'rotate-ccw', '', () => void restart());
bAssemble.dataset.tut = 'assemble';
bRun.dataset.tut = 'run';
bStep.dataset.tut = 'step';
bRestart.dataset.tut = 'reset';
// The speed of Run: Instant (the core runs on its own) or one line a second.
const speedFast = h('button', { type: 'button', role: 'radio', title: 'Run at full speed' }, 'Instant');
const speedSlow = h('button', { type: 'button', role: 'radio', title: 'Run one line a second' }, '1 line/s');
speedFast.addEventListener('click', () => void setSpeed('fast'));
speedSlow.addEventListener('click', () => void setSpeed('slow'));
const speedSwitch = h('span', { class: 'seg speed', role: 'radiogroup', 'aria-label': 'Run speed' }, speedFast, speedSlow);
// A narrow title bar: the same choice as one button that says what it is.
const speedOne = h('button', { class: 'btn speedone', type: 'button', title: 'Run speed (Instant / 1 line/s): 누르면 바뀝니다' });
speedOne.addEventListener('click', () => void setSpeed(speed === 'fast' ? 'slow' : 'fast'));
const speedBox = h('span', { class: 'speedbox' }, h('span', { class: 'speedlabel' }, 'Run speed'), speedSwitch, speedOne);
const toolbar = h('span', { class: 'toolbar' }, bAssemble, bRun, speedBox, bStep, bRestart);
const bSettings = iconButton('Settings', 'settings', () => settingsBox.open());
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
  toolbar,
  viewSwitch,
  h('span', { class: 'drag' }),
  h('span', { class: 'tools' },
    iconButton('Tutorial', 'circle-question-mark', () => void startTutorial()),
    iconButton('New file', 'file-plus', () => void newFile()),
    iconButton('Open file (Ctrl+O)', 'folder-open', () => void openFile()),
    bSettings));
const status = h('footer', { class: 'status' });

// ---- the first screen ------------------------------------------------------------

const stageWelcome = h('div', { class: 'stage-welcome' }, welcome({
  tutorial: () => void startTutorial(), newFile: () => void newFile(), openFile: () => void openFile(),
}));

// ---- the Editor side -------------------------------------------------------------------

const editorHost = h('div', { class: 'pbody edhost' });
// Assembly errors: on the Run side, the larger one (renderErrors).
const errorHead = panelHead('Errors');
const errorBody = h('div', { class: 'pbody ebody' });
const errorList = h('section', { class: 'panel errors', 'aria-label': 'Errors', hidden: true }, errorHead.root, errorBody);
const editor = createEditor(editorHost, () => void saveAndAssemble(), () => {
  if (!dirty) { dirty = true; renderChrome(); }
}, (line, on) => void editorBreakpoint(line, on));
const editorHead = panelHead('Editor');
const editorPanel = h('section', { class: 'panel editor-panel', 'aria-label': 'Editor' }, editorHead.root, editorHost);

// ---- the Run side ----------------------------------------------------------------------

const text = new TextPanel({
  select: (addr) => select(addr),
  toggleBreakpoint: (addr) => void toggleBreakpoint(addr),
});
text.onTab = (tab) => { if (tab === 'data') void refreshData(); emit({ kind: 'tab', tab }); };
const inspector = new Inspector();
const consolePanel = new ConsolePanel();
consolePanel.onInput = (line) => void giveInput(line);
consolePanel.onToggle = () => layout();
const congrats = h('div', { class: 'congrats', hidden: true });
const regsHost = h('div', { class: 'regshost' });
let registers: RegisterPanel | null = null;
const centre = h('div', { class: 'centre' }, text.root, inspector.root, congrats);
// Registers over the Console on the left, Text/Data over the Inspector on
// the right: both of those get the whole height (a lab PC has ~480 px).
// Between Registers and the Console, a grip: drag to share the height,
// double-click for the default (the Console as tall as its words while it
// is empty, its share once there is output: app.css).
const consoleGrip = h('div', { class: 'vgrip', role: 'separator', 'aria-orientation': 'horizontal', title: '끌어서 높이 조절 · 두 번 눌러 되돌리기' },
  h('span', { class: 'grip' }));
const leftCol = h('div', { class: 'leftcol' }, regsHost, consoleGrip, consolePanel.root);
const runGrid = h('div', { class: 'run-grid' }, leftCol, centre);
const placeholder = h('div', { class: 'run-placeholder notice-host' });
const runPanel = h('div', { class: 'run-side' }, placeholder, errorList, runGrid);

// ---- the split -------------------------------------------------------------------------

const railEditor = h('button', { class: 'rail', type: 'button', title: 'Expand Editor', 'aria-label': 'Expand Editor' }, h('span', {}, 'Editor ›'));
const railRun = h('button', { class: 'rail', type: 'button', title: 'Expand Run', 'aria-label': 'Expand Run' }, h('span', {}, '‹ Run'));
railEditor.addEventListener('click', () => unfold());
railRun.addEventListener('click', () => unfold());
// The splitter: drag to share the width, double-click for the default
// share; its two small buttons fold one side away (a rail brings it back).
const foldEditor = h('button', { class: 'foldbtn', type: 'button', title: 'Collapse Editor', 'aria-label': 'Collapse Editor' }, '‹');
const foldRun = h('button', { class: 'foldbtn', type: 'button', title: 'Collapse Run', 'aria-label': 'Collapse Run' }, '›');
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

consoleGrip.addEventListener('pointerdown', (e) => {
  if (!consolePanel.expanded) return; // folded: the Expand button opens it
  consoleGrip.setPointerCapture(e.pointerId);
  const bottom = leftCol.getBoundingClientRect().bottom;
  const move = (m: PointerEvent) => {
    // At least the Console's head and a line; Registers keeps its head and a few rows.
    consoleHeight = Math.round(Math.max(72, Math.min(leftCol.clientHeight - 8 - 120, bottom - m.clientY)));
    layout();
  };
  const up = () => { consoleGrip.removeEventListener('pointermove', move); consoleGrip.removeEventListener('pointerup', up); };
  consoleGrip.addEventListener('pointermove', move);
  consoleGrip.addEventListener('pointerup', up);
});
consoleGrip.addEventListener('dblclick', () => { consoleHeight = null; layout(); });

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
  fitTitlebar();
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
  sizeRunSide();
  const inner = split.clientWidth - 16 - 8; // the split's padding, the splitter
  if (editorWidth !== null) split.style.setProperty('--editor-w', `${editorWidth}px`);
  else if (inner > 0) split.style.setProperty('--editor-w', `${Math.round(Math.max(300, Math.min(editorMost(), inner - runLeast)))}px`);

  const shown = machineShown();
  const showErrors = !shown && errors.length > 0;
  runGrid.hidden = !shown;
  errorList.hidden = !showErrors;
  placeholder.hidden = shown || showErrors;
  if (!shown && !showErrors) renderPlaceholder();
  runGrid.classList.toggle('console-open', consolePanel.expanded);
  if (consoleHeight === null) leftCol.style.removeProperty('--console-h');
  else leftCol.style.setProperty('--console-h', `${consoleHeight}px`);
  editor.showPcLine(shown && runState !== 'ready' ? pcSourceLine() : null);
}

// The Editor's width by default: what a line of EDITOR_COLUMNS characters
// needs (gutters and all), and no more -- a student's longest line is far
// shorter, and every pixel past that is a pixel the Run side reads with:
// Text's Source column and the Inspector are what grow with the window.
// Never a share of the window: a share is right at one width only.
// The character's width is measured with the code font itself, at the
// Editor's size (dom.ts monoCh; not CodeMirror's own figure, which can be
// taken before the font has loaded), and the layout is done again once the
// fonts are in (below, "fonts").
const EDITOR_COLUMNS = 72;
const editorMost = (): number => (editorPanel.offsetWidth - editorHost.clientWidth) + editor.widthFor(EDITOR_COLUMNS, monoCh(fontPx() + 0.5));

// The Run side's width: what Registers and Text need (their panels say).
let runLeast = 0;
const fontPx = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs')) || 13;
function sizeRunSide(): void {
  if (!registers) return;
  const fs = fontPx();
  const r = registers.widths(fs);
  runGrid.style.setProperty('--regs-least', `${r.least}px`);
  runGrid.style.setProperty('--regs-most', `${r.most}px`);
  // Text needs its four columns; Data its four words and the ASCII column --
  // where the window has the room (the Editor stays at 300 px or more).
  runLeast = r.least + 8 + Math.max(text.leastWidth(fs), text.data.leastWidth(fs));
}

function renderPlaceholder(): void {
  const changed = assembledText !== null || (lastProgram !== null && dirty);
  const [title, body] = changed
    ? ['코드가 바뀌었습니다', '지금 실행되는 것은 고치기 전의 코드입니다. 다시 어셈블해서 고친 코드로 바꾸세요.']
    : ['아직 어셈블하지 않았습니다', '어셈블하면 여기에 레지스터와 명령, 콘솔 출력이 나옵니다.'];
  const go = h('button', { class: 'btn primary', type: 'button' }, icon('hammer'), h('span', {}, 'Assemble'), h('kbd', {}, 'Ctrl+S'));
  go.addEventListener('click', () => void saveAndAssemble());
  // The words first, then Haram at the far end from the Editor they are about.
  placeholder.replaceChildren(notice({ pose: 'guide', title, body, more: [h('div', { class: 'row' }, go)] }));
  placeholder.dataset.kind = changed ? 'changed' : 'fresh';
}

// The Editor line of PC: the Text row's line, or that of the source line a
// pseudo instruction's later words belong to.  Only the student's own lines:
// the start-up code comes from the exception handler, whose line numbers
// are not the Editor's (the row's source text must be on that line).
function pcSourceLine(): number | null {
  return lastRegs ? lineOf(lastRegs.pc) : null;
}

function lineOf(addr: number): number | null {
  let i = rows.findIndex((r) => r.addr === addr);
  if (i < 0 || rows[i].kernel) return null;
  while (i > 0 && rows[i].line === 0) i -= 1;
  return userLine(rows[i]) ? rows[i].line : null;
}

// The row's source line is one of the Editor's (not the start-up code's).
function userLine(row: TextRow): boolean {
  if (row.kernel || row.line === 0 || row.line > editor.view.state.doc.lines || !row.source) return false;
  return simplified(editor.view.state.doc.line(row.line).text).includes(simplified(row.source));
}

// The first word of an Editor line, if the line made any.
const addressOfLine = (line: number): number | null => rows.find((r) => r.line === line && userLine(r))?.addr ?? null;

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
  text.fit();
  registers?.fit();
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
  showFileName(FILE_MOST);
  const running = runState === 'running';
  const setBtn = (b: HTMLButtonElement, on: boolean, primary: boolean) => {
    b.disabled = !on;
    b.classList.toggle('primary', primary && on);
  };
  setBtn(bAssemble, open && !running, !machineShown());
  bRun.replaceChildren(icon(running ? 'square' : 'play'), h('span', { class: 'label' }, running ? 'Stop' : 'Run'),
    h('kbd', {}, running ? 'Esc' : 'F5'));
  bRun.title = running ? 'Stop (Esc)' : 'Run (F5)';
  setBtn(bRun, open && (running || (runState !== 'finished' && runState !== 'input')), running);
  setBtn(bStep, open && !running && runState !== 'finished', machineShown() && !running);
  setBtn(bRestart, lastProgram !== null && !busy, false);
  speedFast.classList.toggle('on', speed === 'fast');
  speedSlow.classList.toggle('on', speed === 'slow');
  speedFast.setAttribute('aria-checked', String(speed === 'fast'));
  speedSlow.setAttribute('aria-checked', String(speed === 'slow'));
  speedOne.replaceChildren(h('span', { class: 'label' }, `Speed: ${speed === 'fast' ? 'Instant' : '1 line/s'}`));
  // No file, nothing to run: the first screen has no toolbar.
  toolbar.hidden = !open;
  editorHead.setMeta(open ? h('span', {}, code(file.name), ` · ${file.format?.encoding ?? 'UTF-8'} · ${file.format?.lineEnd ?? 'LF'}`) : '');
  layout();
  renderStatus();
  fitTitlebar();
}

// The file's name in the title bar, at most `cols` columns (logic/names.ts);
// the whole name in its tooltip.
const FILE_MOST = 32;
const FILE_LEAST = 10;
function showFileName(cols: number): void {
  fileLabel.title = open ? file.name : '';
  fileLabel.replaceChildren(open ? h('b', { class: 'mono' }, shortName(file.name, cols)) : '',
    open && dirty ? h('span', { class: 'dirty', title: 'Unsaved changes' }, ' •') : '');
}

// The title bar gives way one step at a time, as far as it has to: the key
// hints, the buttons' icons (their names stay), the speed as one button,
// tighter spacing, the file's name (down to FILE_LEAST columns), and last
// the program's name (the logo stays) -- the file's name then takes back
// what the program's name left.
// It fits when its last item ends before the padding kept for the system's
// caption buttons (scrollWidth does not count what spills into padding).
const TITLE_STEPS = 4;
const tools = titlebar.querySelector('.tools') as HTMLElement;
function fitTitlebar(): void {
  const end = () => titlebar.getBoundingClientRect().right - parseFloat(getComputedStyle(titlebar).paddingRight);
  const fits = () => tools.getBoundingClientRect().right <= end() + 0.5;
  titlebar.classList.remove('c5');
  showFileName(FILE_MOST);
  for (let level = 0; level <= TITLE_STEPS; level += 1) {
    for (let k = 1; k <= TITLE_STEPS; k += 1) titlebar.classList.toggle(`c${k}`, level >= k);
    if (fits()) return;
  }
  // The longest name that fits, between FILE_LEAST and FILE_MOST columns.
  const longest = (): boolean => {
    let lo = FILE_LEAST;
    let hi = FILE_MOST;
    showFileName(lo);
    if (!fits()) return false;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      showFileName(mid);
      if (fits()) lo = mid; else hi = mid - 1;
    }
    showFileName(lo);
    return true;
  };
  if (longest()) return;
  titlebar.classList.add('c5');
  if (!longest()) showFileName(FILE_LEAST);
}
window.addEventListener('resize', () => fitTitlebar());

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
    } else parts.push(span('', dirty ? '고친 뒤 저장·어셈블 (Ctrl+S)' : '저장·어셈블 (Ctrl+S)'));
    if (saveNote) parts.push(span('', saveNote));
  } else {
    const pc = lastRegs ? hex32(lastRegs.pc) : '';
    if (runState === 'running' && slow) {
      parts.push(span('run', '천천히 실행 중 (1 line/s)'));
      if (steps > 0) parts.push(span('', `${steps}단계`));
      if (pc) parts.push(span('', 'PC ', code(pc)));
      if (changedNow) parts.push(span('', '방금 바뀜: ', code(changedNow)));
      parts.push(span('', '멈추려면 Esc · 빨리 가려면 Instant'));
    } else if (runState === 'running') {
      parts.push(span('run', '실행 중'));
      if (progress) parts.push(span('', 'PC ', code(hex32(progress.pc))), span('', `${progress.instructions.toLocaleString()}개 명령`));
      parts.push(span('', '멈춤 (Esc)'));
    } else {
      const reason = lastReason;
      if (runState === 'ready') parts.push(span('', code('F10'), ' Step · ', code('F5'), ' Run'));
      else if (runState === 'finished') parts.push(span(reason === 'error' ? 'err' : 'ok', stopMessageFor(reason, pc)));
      else parts.push(span('run', codeText(stopMessage(reason, pc))));
      if (steps > 0 && runState !== 'finished') parts.push(span('', `${steps}단계`));
      if (runState !== 'finished' && reason !== 'limit' && pc) parts.push(span('', 'PC ', code(pc)));
      if (changedNow) parts.push(span('', '방금 바뀜: ', code(changedNow)));
      if (selected >= 0) parts.push(span('', '고른 명령 ', code(hex32(selected))));
    }
    if (dirty) parts.push(span('warn', '코드가 바뀌었습니다 — 다시 어셈블 (Ctrl+S)'));
    else if (!sameAdvanced(advanced, applied)) parts.push(span('warn', '설정이 바뀌었습니다 — 다시 어셈블하면(Ctrl+S) 적용됩니다'));
  }
  if (note) parts.push(span('warn', note));
  status.replaceChildren(...parts);
}
const stopMessageFor = (reason: RunResult['reason'], pc: string) =>
  reason === 'exit' ? '프로그램이 끝났습니다 — 다시 하려면 Reset' : reason === 'error' ? '실행 오류로 멈췄습니다 — 콘솔을 보세요' : stopMessage(reason, pc);

// ---- files -------------------------------------------------------------------------

// Before another file takes the Editor's place.  Unsaved changes are always
// asked about; a new file is asked about even when everything is saved --
// it empties the Editor, which a student does not expect from one click.
async function mayReplace(what: 'new' | 'open'): Promise<boolean> {
  if (!open) return true;
  if (dirty) {
    return ask({
      title: '저장하지 않은 변경이 있습니다',
      file: file.name,
      body: `${what === 'new' ? '새 파일을 열면' : '다른 파일을 열면'} 저장하지 않은 내용은 사라집니다.`,
      ok: '버리고 계속', cancel: '돌아가기', danger: true,
    });
  }
  if (what === 'new') {
    return ask({
      title: '새 파일을 열까요?',
      file: file.name,
      body: '이 파일은 저장되어 있습니다. 편집기를 비우고 새 파일을 시작합니다.',
      ok: '새 파일', cancel: '돌아가기',
    });
  }
  return true;
}

async function load(opened: { name: string; path: string | null; text: string; format: TextFileFormat } | null, example?: Example): Promise<void> {
  if (!opened) return;
  await forgetMachine();
  file = { name: opened.name, path: opened.path, format: opened.format, example };
  editor.setReadOnly(false);
  editor.setText(opened.text);
  editor.setReadOnly(example !== undefined);
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

async function newFile(): Promise<void> {
  if (!(await mayReplace('new'))) return;
  await load({ name: UNTITLED, path: null, text: '', format: { encoding: 'UTF-8', byteOrderMark: false, lineEnd: 'LF' } });
  file.format = null;
  renderChrome();
}
async function openFile(): Promise<void> {
  if (!(await mayReplace('open'))) return;
  await load(await api.openFile().catch((e: Error) => { saveNote = e.message; renderChrome(); return null; }));
}
// ---- the tutorial ----------------------------------------------------------------------

// What was on screen before the tutorial, put back when it ends (unsaved
// changes too: nothing of the student's is lost or written).
let beforeTutorial: { file: typeof file; text: string; dirty: boolean; breakpoints: number[] } | null = null;

async function startTutorial(): Promise<void> {
  if (tutorial.active || busy) return;
  if (open && dirty && !file.example) {
    const go = await ask({
      title: '저장하지 않은 변경이 있습니다', file: file.name,
      body: '튜토리얼을 하는 동안 이 파일은 잠시 내려갑니다. 끝나면 바뀐 내용 그대로 돌아옵니다. 먼저 저장하려면 돌아가서 Ctrl+S 키를 누르세요.',
      ok: '튜토리얼 시작', cancel: '돌아가기',
    });
    if (!go) return;
  }
  beforeTutorial = open && !file.example
    ? { file: { ...file }, text: editor.text(), dirty, breakpoints: editor.breakpointLines() } : null;
  await tutorial.start();
}

const listeners: ((s: Signal) => void)[] = [];
function emit(s: Signal): void { for (const l of listeners) l(s); }

async function waitWhileRunning(): Promise<void> {
  for (let i = 0; i < 200 && runState === 'running'; i += 1) await new Promise((r) => setTimeout(r, 20));
}

const tutorial = new Tutorial({
  narrow: () => narrow,
  view: () => view,
  showView: (v) => showView(v),
  open: async (name) => { await load(await api.openExample(name), name); },
  example: () => file.example ?? null,
  source: () => editor.text(),
  assembled: () => machineShown(),
  assemble: () => saveAndAssemble(),
  step: () => step(),
  runUntil: async (addr) => {
    if (!machineShown() && !(await saveAndAssemble())) return;
    for (let i = 0; i < 500 && lastRegs && lastRegs.pc !== addr && runState !== 'finished' && runState !== 'input'; i += 1) {
      resumeWith = 'step';
      await go(() => api.call('step', 1));
    }
  },
  run: async () => { await run(); await waitWhileRunning(); },
  stop: async () => { await stop(); await waitWhileRunning(); },
  restart: () => restart(),
  setSpeed: (sp) => setSpeed(sp),
  pc: () => lastRegs?.pc ?? null,
  running: () => runState === 'running',
  finished: () => runState === 'finished',
  addressOfLine: (line) => addressOfLine(line),
  labelAddress: (name) => labels.find(name) ?? null,
  quietPc: (on) => text.root.classList.toggle('quiet-pc', on),
  pin: (addr) => { if (addr === null) { if (selected >= 0) { clearSelection(); renderStatus(); } } else select(addr); },
  setTab: (t) => text.setTab(t),
  tab: () => text.tab,
  breakpointLines: () => editor.breakpointLines(),
  setBreakpointLine: async (line, on) => {
    const lines = new Set(editor.breakpointLines());
    if (on) lines.add(line); else lines.delete(line);
    editor.setBreakpointLines([...lines]);
    await editorBreakpoint(line, on);
  },
  goToLine: (n) => goToErrorLine(n),
  errorLine: () => errors.find((e) => e.line > 0)?.line ?? null,
  expandConsole: () => {
    const was = consolePanel.expanded;
    consolePanel.setExpanded(true);
    layout();
    return !was;
  },
  revealLine: (n) => editor.revealLine(n),
  lineRect: (n) => editor.lineRect(n),
  gutterRect: (n) => editor.gutterRect(n),
  revealRegister: (key) => registers?.revealRegister(key),
  revealAddr: (addr) => text.revealAddr(addr),
  showColumn: (panel, key) => (panel === 'regs' ? registers?.showColumn(key as 'dec' | 'bin') ?? 'already' : text.showColumn(key as 'word')),
  releaseColumn: (panel, key) => { if (panel === 'regs') registers?.releaseColumn(key as 'dec' | 'bin'); else text.releaseColumn(key as 'word'); },
  on: (l) => { listeners.push(l); },
  close: async () => {
    await forgetMachine();
    const back = beforeTutorial;
    beforeTutorial = null;
    if (back) {
      await load({ name: back.file.name, path: back.file.path, text: back.text, format: back.file.format ?? { encoding: 'UTF-8', byteOrderMark: false, lineEnd: 'LF' } });
      file.format = back.file.format;
      editor.setBreakpointLines(back.breakpoints);
      dirty = back.dirty;
    } else {
      open = false;
      file = { name: UNTITLED, path: null, format: null };
      editor.setReadOnly(false);
      editor.setText('');
      dirty = false;
      errors = [];
      renderErrors();
    }
    renderChrome();
  },
});
(window as unknown as { __tutorial: Tutorial }).__tutorial = tutorial; // for the tests

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
  if (file.example) {
    saveNote = '예제라서 저장하지 않습니다';
    return assemble(source, false);
  }
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
  let after: Signal | null = null;
  note = '';
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
      view = 'run'; // a narrow window: the errors are on the Run side
      after = { kind: 'assembled', ok: false };
      return false;
    }
    rows = textRows(await api.call('textSegment'));
    // Breakpoints: the Editor's lines, mapped to this program's words, and
    // (for the same program) those set in Text on words with no line of the
    // Editor's, such as the start-up code.
    const kept = same ? [...breakpoints].filter((a) => lineOf(a) === null && rows.some((r) => r.addr === a)) : [];
    const mapped = editor.breakpointLines().map((n) => [n, addressOfLine(n)] as const);
    const dropped = mapped.filter(([, a]) => a === null).map(([n]) => n);
    if (dropped.length) {
      editor.setBreakpointLines(mapped.filter(([, a]) => a !== null).map(([n]) => n));
      note = `${dropped.join(', ')}행에는 명령이 없어 브레이크포인트를 뺐습니다`;
    }
    breakpoints.clear();
    for (const a of [...kept, ...mapped.map(([, a]) => a).filter((a): a is number => a !== null)]) breakpoints.add(a);
    for (const a of breakpoints) await api.call('setBreakpoint', a);
    for (const r of rows) r.breakpoint = breakpoints.has(r.addr);
    assembledText = source;
    lastProgram = source;
    labels.clear();
    for (const sym of parseSymbolListing(r.symbols)) labels.add(sym.name, sym.address);
    applied = structuredClone(advanced);
    runState = 'ready';
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
    after = { kind: 'assembled', ok: true };
    return true;
  } finally {
    busy = false;
    renderChrome();
    if (after) emit(after);
  }
}

// What to do about an assembler message, before what went wrong.  For a
// syntax error, first the slip the line shows when there is one to name
// (src/core/near-miss.ts): a name a letter or two from one the assembler
// knows, a register that does not exist, a register without its $.
function hintFor(message: string, source: string): string {
  if (/syntax error/i.test(message)) {
    const near = nearMiss(source);
    if (near?.why === 'spelling') {
      const noSuch = { directive: '지시어는 없습니다', instruction: '명령은 없습니다', register: '레지스터는 없습니다' }[near.kind];
      return `\`${near.token}\` ${noSuch}. 혹시 \`${near.meant}\`?`;
    }
    if (near?.why === 'no-such-register') return `\`${near.token}\` 레지스터는 없습니다. \`${near.family}\` 레지스터는 \`${near.range}\` 입니다.`;
    if (near?.why === 'missing-dollar') return `레지스터 이름 앞에는 \`$\` 기호가 있어야 합니다: \`${near.token}\` → \`${near.meant}\`.`;
    return '명령 이름, 레지스터 이름(예: `$t0`), 쉼표를 확인해 보세요.';
  }
  if (/defined for the second time|already defined/i.test(message)) return '같은 이름의 라벨이 두 번 있습니다. 한쪽 이름을 바꾸세요.';
  if (/shift distance/i.test(message)) return '옮길 비트 수는 0 부터 31 까지만 쓸 수 있습니다.';
  if (/too large|out of range|immediate/i.test(message)) return '값이 이 명령이 담을 수 있는 크기를 넘었습니다. 먼저 `li` 명령으로 레지스터에 넣어 보세요.';
  if (/undefined|unknown/i.test(message)) return '쓰기 전에 정의하지 않은 이름입니다. 철자와 `.globl` 선언을 확인해 보세요.';
  return ''; // nothing to add to "고친 뒤 Ctrl+S 키를 다시 누르세요" above: no hint
}

// "N행으로 가기": the Editor (a narrow window: its tab), the line.
function goToErrorLine(n: number): void {
  if (narrow) showView('editor');
  editor.goToLine(n);
  emit({ kind: 'goto', line: n });
}

function renderErrors(): void {
  editor.showErrors(errors.map((e) => e.line).filter((n) => n > 0));
  if (!errors.length) { errorBody.replaceChildren(); return; }
  const toLine = (n: number) => goToErrorLine(n);
  const first = errors.find((e) => e.line > 0) ?? errors[0];
  const go = h('button', { class: 'btn primary', type: 'button' }, first.line ? `${first.line}행으로 가기` : '고치러 가기');
  go.addEventListener('click', () => (first.line ? toLine(first.line) : showView('editor')));
  const items = errors.map((e) => {
    const where = h('button', { class: 'linkbtn line', type: 'button', disabled: !e.line }, e.line ? `${e.line}행` : '');
    where.addEventListener('click', () => { if (e.line) toLine(e.line); });
    return h('div', { class: 'item' }, h('span', { class: 'mark', 'aria-hidden': 'true' }, '!'), where,
      h('span', { class: 'msg' },
        h('span', { class: 'what' }, withHex(e.message.message)),
        e.message.source ? code(e.message.source, 'src') : null,
        ((hint) => (hint ? h('span', { class: 'hint' }, codeText(hint)) : null))(hintFor(e.message.message, e.message.source))));
  });
  errorHead.setMeta(errors.length === 1 ? '1 error' : `${errors.length} errors`);
  // What is wrong (the title), what to do (the line under it), then the
  // errors, each with its line; the button goes to the first.  The line's
  // number is said twice at most: in the error and on the button.  Haram
  // once, at the far end: not between the words and the Editor they are
  // about, and no arrow.
  const title = errors.length > 1 ? `코드에 오류가 ${errors.length}개 있습니다` : '코드에 오류가 있습니다';
  const todo = errors.length > 1 ? '위에서부터 하나씩 고친 뒤 Ctrl+S 키를 다시 누르세요.' : '아래 줄을 고친 뒤 Ctrl+S 키를 다시 누르세요.';
  errorBody.replaceChildren(h('div', { class: 'notice-host' },
    notice({ pose: 'curious', title, body: todo, more: [h('div', { class: 'items' }, ...items), h('div', { class: 'row' }, go)] })));
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
  note = '';
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
    if (result.reason === 'exit' && result.errors.length === 0 && !congratsShown && !tutorial.active) showCongrats();
    return result;
  } finally {
    busy = false;
    renderChrome();
    emit({ kind: 'stopped', reason: result.reason });
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
    runState = 'paused';        // stopped, or switched to Instant
    lastReason = 'stopped';
  } finally {
    slow = null;
    renderChrome();
    emit({ kind: 'slow-ended' });
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
  emit({ kind: 'reset' });
}

async function giveInput(line: string): Promise<void> {
  await api.call('provideInput', line + '\n');
  if (runState === 'running') return; // mapped I/O: the program reads it as it runs
  consolePanel.waitForInput(false);
  runState = 'paused';
  if (resumeWith === 'run') await run();
  else await step();
}

// A breakpoint set or cleared in Text: the machine, and the Editor's gutter.
async function toggleBreakpoint(addr: number): Promise<void> {
  const on = !breakpoints.has(addr);
  await setBreakpoint(addr, on);
  const line = lineOf(addr);
  if (line !== null) {
    const lines = new Set(editor.breakpointLines());
    if (on) lines.add(line); else if (![...breakpoints].some((a) => lineOf(a) === line)) lines.delete(line);
    editor.setBreakpointLines([...lines]);
  }
}

async function setBreakpoint(addr: number, on: boolean): Promise<void> {
  if (on) breakpoints.add(addr); else breakpoints.delete(addr);
  await api.call(on ? 'setBreakpoint' : 'clearBreakpoint', addr);
  text.setBreakpoint(addr, on);
}

// A breakpoint set or cleared in the Editor's gutter.  Before an assemble
// (or with changed code) it is only kept by line, for the next assemble.
async function editorBreakpoint(line: number, on: boolean): Promise<void> {
  emit({ kind: 'breakpoint', line, on });
  if (!machineShown()) return;
  const addr = addressOfLine(line);
  if (addr === null) {
    editor.setBreakpointLines(editor.breakpointLines().filter((n) => n !== line));
    note = `${line}행에는 명령이 없습니다 — 브레이크포인트는 명령이 있는 줄에만`;
    renderStatus();
    return;
  }
  if (on) await setBreakpoint(addr, true);
  else for (const a of [...breakpoints].filter((a) => lineOf(a) === line)) await setBreakpoint(a, false);
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
  const close = h('button', { class: 'btn small', type: 'button' }, 'Close');
  close.addEventListener('click', () => { congrats.hidden = true; });
  congrats.replaceChildren(character('congrats', 120),
    h('div', { class: 'say' }, h('h3', {}, '첫 실행 성공!'), h('p', {}, '프로그램이 끝까지 실행되었습니다.'), close));
  congrats.hidden = false;
}

// ---- the caption buttons' patch -----------------------------------------------------------
// Windows draws the minimise / maximise / close buttons on a patch the page
// cannot paint (titleBarOverlay).  While the tutorial dims the window, or a
// dialog's backdrop covers it, the patch takes the colour white has under
// the same layers (logic/overlay.ts), or it would stay a bright square at
// the top right; white again after.  The buttons keep working throughout.
let overlayNow = '#ffffff';
function updateOverlay(): void {
  const c = overlayColor(document.body.classList.contains('tutorial-on'), document.querySelector('dialog[open]') !== null);
  if (c === overlayNow) return;
  overlayNow = c;
  void api.setOverlay(c === '#ffffff' ? null : c);
}
new MutationObserver(updateOverlay).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'open'] });

// ---- keys -----------------------------------------------------------------------------------

window.addEventListener('keydown', (e) => {
  if (tutorial.handleKey(e)) return;
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
  // fonts: a width measured in the code font before it had loaded is
  // measured again (the Editor's 72 columns, the tables' columns).
  document.fonts.addEventListener('loadingdone', () => measure());
  void document.fonts.ready.then(() => measure());
  renderChrome();
  // The columns are measured in the mono font: again once it is in.
  void document.fonts.ready.then(() => { text.fit(); registers?.fit(); renderChrome(); });
}
void start();
