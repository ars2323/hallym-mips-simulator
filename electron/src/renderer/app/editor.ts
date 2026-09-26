/* The code editor: CodeMirror 6, coloured by src/core/mips-syntax.ts (the
   core's own keyword table), with the assembler's error lines marked.

   Korean input: CodeMirror leaves composition to the browser's IME handling
   (contenteditable), so a syllable being composed is not split or doubled.
   The one thing done here is that Ctrl+S never saves in the middle of a
   composition: it waits for the syllable to be committed, then saves --
   otherwise the half-composed syllable would be missing from what is
   assembled.  Ctrl+S is not in CodeMirror's keymap: during a composition
   Chromium hands the key over with isComposing set and CodeMirror does not
   run its keymap then (tests/e2e/ime.e2e.ts), so the window's key handler
   calls requestSave() with the key event's isComposing -- Chromium's own
   word on whether a syllable is open (CodeMirror's view.composing says the
   same, a step later; one of them is enough).

   Typing: Tab inserts spaces to the next multiple of four columns (with
   lines selected, Tab / Shift+Tab indent / outdent them by four); Enter
   starts the new line at column 0, never copying the line above.

   Gutters, left to right: breakpoints (click to set or clear; a red dot),
   line numbers, errors (a "!" badge -- not a dot, so never mistaken for a
   breakpoint).  Breakpoints are kept by line and move with the text as it
   is edited; the app maps them to addresses at every assemble.

   No band on the cursor's line: while a program runs, the one band in the
   Editor is the line being executed. */

import { defaultKeymap, history, historyKeymap, indentLess, indentMore, insertNewline } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import { Compartment, EditorSelection, EditorState, RangeSet, RangeSetBuilder, StateEffect, StateField, type Extension } from '@codemirror/state';
import {
  Decoration, type DecorationSet, EditorView, gutter, GutterMarker, keymap, lineNumbers,
  ViewPlugin, type ViewUpdate,
} from '@codemirror/view';

import { tokenizeMipsLine } from '../../core/mips-syntax.ts';
import { userScrolls } from './dom.ts';

const tokenMarks = Object.fromEntries(['Comment', 'String', 'Directive', 'Instruction', 'Register',
  'LabelDefinition', 'Identifier', 'Number'].map((k) => [k, Decoration.mark({ class: `k-${k}` })]));

function colour(view: EditorView): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const line = view.state.doc.lineAt(pos);
      for (const t of tokenizeMipsLine(line.text)) {
        b.add(line.from + t.start, line.from + t.start + t.length, tokenMarks[t.kind]);
      }
      pos = line.to + 1;
    }
  }
  return b.finish();
}

const highlighter = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = colour(view); }
  update(u: ViewUpdate) { if (u.docChanged || u.viewportChanged) this.decorations = colour(u.view); }
}, { decorations: (v) => v.decorations });

// ---- error lines -------------------------------------------------------------

export const setErrorLines = StateEffect.define<number[]>();
const errorLine = Decoration.line({ class: 'cm-error-line' });
class ErrorMarker extends GutterMarker {
  toDOM() { const s = document.createElement('span'); s.className = 'cm-error-mark'; s.textContent = '!'; s.title = 'Assembly error'; return s; }
}
const errorMarker = new ErrorMarker();

const errorField = StateField.define<number[]>({
  create: () => [],
  update(lines, tr) {
    for (const e of tr.effects) if (e.is(setErrorLines)) return e.value;
    return lines; // kept until the next assemble says otherwise
  },
});

const errorDecorations = EditorView.decorations.compute([errorField], (state) => {
  const b = new RangeSetBuilder<Decoration>();
  for (const n of [...state.field(errorField)].sort((a, c) => a - c)) {
    if (n >= 1 && n <= state.doc.lines) { const l = state.doc.line(n); b.add(l.from, l.from, errorLine); }
  }
  return b.finish();
});

const errorGutter = gutter({
  class: 'cm-error-gutter',
  lineMarker(view, line) {
    const n = view.state.doc.lineAt(line.from).number;
    return view.state.field(errorField).includes(n) ? errorMarker : null;
  },
  lineMarkerChange: (u) => u.transactions.some((t) => t.effects.some((e) => e.is(setErrorLines)) || t.docChanged),
});

// ---- breakpoints -----------------------------------------------------------------------

class BreakpointMarker extends GutterMarker {
  toDOM() { const s = document.createElement('span'); s.className = 'cm-bp-dot'; return s; }
}
const breakpointMarker = new BreakpointMarker();
// The gutter's width keeper (CodeMirror renders it hidden): not a dot.
class GutterSpace extends GutterMarker {
  toDOM() { const s = document.createElement('span'); s.className = 'cm-bp-space'; return s; }
}
const toggleBreakpointAt = StateEffect.define<{ pos: number; on: boolean }>();
const setBreakpointLines = StateEffect.define<number[]>();
const breakpointField = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(set, tr) {
    set = set.map(tr.changes); // they move with the text
    for (const e of tr.effects) {
      if (e.is(toggleBreakpointAt)) {
        set = set.update({ filter: (from) => from !== e.value.pos });
        if (e.value.on) set = set.update({ add: [breakpointMarker.range(e.value.pos)] });
      } else if (e.is(setBreakpointLines)) {
        const lines = [...new Set(e.value)].filter((n) => n >= 1 && n <= tr.state.doc.lines).sort((a, b) => a - b);
        set = RangeSet.of(lines.map((n) => breakpointMarker.range(tr.state.doc.line(n).from)));
      }
    }
    return set;
  },
});
function breakpointLinesOf(state: EditorState): number[] {
  const lines: number[] = [];
  const it = state.field(breakpointField).iter();
  for (; it.value; it.next()) lines.push(state.doc.lineAt(it.from).number);
  return [...new Set(lines)];
}
function breakpointGutter(onToggle: (line: number, on: boolean) => void): Extension {
  return gutter({
    class: 'cm-bp-gutter',
    markers: (v) => v.state.field(breakpointField),
    initialSpacer: () => new GutterSpace(),
    renderEmptyElements: true, // every line can be clicked
    domEventHandlers: {
      mousedown(view, block) {
        const line = view.state.doc.lineAt(block.from);
        const on = !breakpointLinesOf(view.state).includes(line.number);
        view.dispatch({ effects: toggleBreakpointAt.of({ pos: line.from, on }) });
        onToggle(line.number, on);
        return true;
      },
    },
  });
}

// ---- typing ---------------------------------------------------------------------------

// Tab: spaces to the next multiple of four at each cursor; with a selection
// that spans lines, indent them by four.
function tab(view: EditorView): boolean {
  const { state } = view;
  if (state.selection.ranges.some((r) => !r.empty && state.doc.lineAt(r.from).number !== state.doc.lineAt(r.to).number)) {
    return indentMore(view);
  }
  view.dispatch(state.changeByRange((r) => {
    const column = r.head - state.doc.lineAt(r.head).from;
    const spaces = ' '.repeat(4 - (column % 4));
    return { changes: { from: r.from, to: r.to, insert: spaces }, range: EditorSelection.cursor(r.from + spaces.length) };
  }), { scrollIntoView: true, userEvent: 'input' });
  return true;
}

// ---- the line being executed ---------------------------------------------------------

// The source line of PC, from the Text panel's line column (the core's own
// mapping); null when the program on screen is not the one in the machine.
const setPcLine = StateEffect.define<number | null>();
const pcField = StateField.define<number | null>({
  create: () => null,
  update(line, tr) {
    for (const e of tr.effects) if (e.is(setPcLine)) return e.value;
    return tr.docChanged ? null : line; // an edit makes it stale
  },
});
const pcLine = Decoration.line({ class: 'cm-pc-line' });
const pcDecorations = EditorView.decorations.compute([pcField], (state) => {
  const n = state.field(pcField);
  const b = new RangeSetBuilder<Decoration>();
  if (n !== null && n >= 1 && n <= state.doc.lines) b.add(state.doc.line(n).from, state.doc.line(n).from, pcLine);
  return b.finish();
});

// ---- the editor ------------------------------------------------------------------

export interface Editor {
  view: EditorView;
  text(): string;
  setText(text: string): void;
  showErrors(lines: number[]): void;
  goToLine(line: number): void;
  requestSave(composing: boolean): void; // Ctrl+S; `composing`: the key event's isComposing
  // Marks the line being executed (null: none) and brings it into view --
  // unless the student has scrolled in the last two seconds.
  showPcLine(line: number | null): void;
  breakpointLines(): number[];
  setBreakpointLines(lines: number[]): void;
  // The tutorial's examples are read-only (breakpoints still set and clear).
  setReadOnly(on: boolean): void;
  // The width the editor needs to show a line of `columns` characters of
  // `ch` px each without scrolling sideways: the gutters, the line's
  // padding, the characters, a scroll bar (app.ts sizes the Editor by it).
  widthFor(columns: number, ch: number): number;
  // For the tutorial: bring line `n` into view, and where it is on screen
  // (null: not drawn); `gutter` is the breakpoint gutter's cell of the line.
  revealLine(n: number): void;
  lineRect(n: number): DOMRect | null;
  gutterRect(n: number): DOMRect | null;
}

export function createEditor(parent: HTMLElement, onSave: () => void, onChange: () => void,
                             onBreakpoint: (line: number, on: boolean) => void = () => {}): Editor {
  // Ctrl+S: save now, or right after the composition in progress ends.
  let saveAfterComposition = false;
  const requestSave = (composing: boolean): void => {
    if (composing) saveAfterComposition = true;
    else onSave();
  };
  const readOnly = new Compartment();
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: '',
      extensions: [
        breakpointField, breakpointGutter(onBreakpoint),
        lineNumbers(), errorGutter, history(), highlighter, errorField, errorDecorations,
        pcField, pcDecorations, indentUnit.of('    '),
        keymap.of([{ key: 'Tab', run: tab, shift: indentLess }, { key: 'Enter', run: insertNewline },
          ...historyKeymap, ...defaultKeymap]),
        EditorView.updateListener.of((u) => { if (u.docChanged) onChange(); }),
        EditorView.domEventHandlers({
          compositionend: () => {
            if (saveAfterComposition) {
              saveAfterComposition = false;
              // Let CodeMirror apply the committed text first.
              setTimeout(onSave, 0);
            }
            return false;
          },
        }),
        EditorState.tabSize.of(4),
        readOnly.of([]),
      ],
    }),
  });
  // Scrolling by the student: the wheel, the scroll bar, the page keys.
  const scrolledByStudent = userScrolls(view.scrollDOM);

  const showPcLine = (n: number | null): void => {
    if (n === view.state.field(pcField)) return;
    const effects: StateEffect<unknown>[] = [setPcLine.of(n)];
    if (n !== null && n >= 1 && n <= view.state.doc.lines && !scrolledByStudent()) {
      const line = view.state.doc.line(n);
      const box = view.scrollDOM.getBoundingClientRect();
      const at = view.coordsAtPos(line.from); // null when the line is not rendered (far off screen)
      const visible = at !== null && at.top >= box.top && at.bottom <= box.bottom;
      if (!visible) effects.push(EditorView.scrollIntoView(line.from, { y: 'center' }));
    }
    view.dispatch({ effects });
  };

  const widthFor = (columns: number, ch: number): number => {
    const gutters = (view.dom.querySelector('.cm-gutters') as HTMLElement | null)?.offsetWidth || 76;
    return Math.ceil(gutters + 8 + columns * ch + 14); // 8: .cm-line's padding; 14: a scroll bar
  };

  return {
    view,
    showPcLine,
    widthFor,
    breakpointLines: () => breakpointLinesOf(view.state),
    setBreakpointLines: (lines) => view.dispatch({ effects: setBreakpointLines.of(lines) }),
    text: () => view.state.doc.toString(),
    setText: (text) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, effects: setErrorLines.of([]) }),
    showErrors: (lines) => view.dispatch({ effects: setErrorLines.of(lines) }),
    goToLine: (n) => {
      const line = view.state.doc.line(Math.max(1, Math.min(n, view.state.doc.lines)));
      view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
      view.focus();
    },
    requestSave,
    setReadOnly: (on) => view.dispatch({ effects: readOnly.reconfigure(on ? [EditorState.readOnly.of(true)] : []) }),
    revealLine: (n) => {
      if (n < 1 || n > view.state.doc.lines) return;
      view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.line(n).from, { y: 'center' }) });
    },
    lineRect: (n) => editorLineRect(n),
    gutterRect: (n) => {
      const line = editorLineRect(n);
      const g = view.dom.querySelector('.cm-bp-gutter')?.getBoundingClientRect();
      return line && g ? new DOMRect(g.left, line.top, g.width, line.height) : null;
    },
  };
  // The line's box: from the text's left edge to a little past its end,
  // within the visible part of the editor; null when the line is not drawn
  // (far outside the view).
  function editorLineRect(n: number): DOMRect | null {
    if (n < 1 || n > view.state.doc.lines) return null;
    const line = view.state.doc.line(n);
    const end = view.coordsAtPos(line.to);
    if (!view.coordsAtPos(line.from) || !end) return null;
    const block = view.lineBlockAt(line.from);
    const content = view.contentDOM.getBoundingClientRect();
    const scroller = view.scrollDOM.getBoundingClientRect();
    const left = Math.max(content.left, scroller.left);
    const right = Math.min(Math.max(end.right + 8, left + 40), scroller.right);
    return new DOMRect(left, view.documentTop + block.top, right - left, block.height);
  }
}
