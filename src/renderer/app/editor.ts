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
   calls requestSave(). */

import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { EditorState, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import {
  Decoration, type DecorationSet, EditorView, gutter, GutterMarker, highlightActiveLine, keymap, lineNumbers,
  ViewPlugin, type ViewUpdate,
} from '@codemirror/view';

import { tokenizeMipsLine } from '../../core/mips-syntax.ts';

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
class ErrorMarker extends GutterMarker { toDOM() { const s = document.createElement('span'); s.className = 'cm-error-dot'; return s; } }
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
}

export function createEditor(parent: HTMLElement, onSave: () => void, onChange: () => void): Editor {
  // Ctrl+S: save now, or right after the composition in progress ends.
  let saveAfterComposition = false;
  const requestSave = (composing: boolean): void => {
    if (composing || view.composing || view.compositionStarted) saveAfterComposition = true;
    else onSave();
  };
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: '',
      extensions: [
        lineNumbers(), errorGutter, history(), highlightActiveLine(), highlighter, errorField, errorDecorations,
        pcField, pcDecorations,
        keymap.of([indentWithTab, ...historyKeymap, ...defaultKeymap]),
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
        EditorState.tabSize.of(8),
      ],
    }),
  });
  // Scrolling by the student: the wheel, the scroll bar, the page keys.
  let userScrolled = 0;
  const mark = () => { userScrolled = Date.now(); };
  view.scrollDOM.addEventListener('wheel', mark, { passive: true });
  view.scrollDOM.addEventListener('pointerdown', (e) => { if (e.target === view.scrollDOM) mark(); });
  view.scrollDOM.addEventListener('keydown', (e) => { if (/^(Page|Home|End|Arrow)/.test(e.key)) mark(); });

  const showPcLine = (n: number | null): void => {
    if (n === view.state.field(pcField)) return;
    const effects: StateEffect<unknown>[] = [setPcLine.of(n)];
    if (n !== null && n >= 1 && n <= view.state.doc.lines && Date.now() - userScrolled > 2000) {
      const line = view.state.doc.line(n);
      const box = view.scrollDOM.getBoundingClientRect();
      const at = view.coordsAtPos(line.from); // null when the line is not rendered (far off screen)
      const visible = at !== null && at.top >= box.top && at.bottom <= box.bottom;
      if (!visible) effects.push(EditorView.scrollIntoView(line.from, { y: 'center' }));
    }
    view.dispatch({ effects });
  };

  return {
    view,
    showPcLine,
    text: () => view.state.doc.toString(),
    setText: (text) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, effects: setErrorLines.of([]) }),
    showErrors: (lines) => view.dispatch({ effects: setErrorLines.of(lines) }),
    goToLine: (n) => {
      const line = view.state.doc.line(Math.max(1, Math.min(n, view.state.doc.lines)));
      view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
      view.focus();
    },
    requestSave,
  };
}
