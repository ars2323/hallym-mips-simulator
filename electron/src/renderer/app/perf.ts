/* What the panels' updates cost, for tools/measure-ui.ts to read from the
   page (window.__perf).  Kept always: a few numbers per stop. */

export interface Perf {
  registers: { ms: number; rows: number }[];            // one update: script time, rows whose text changed
  text: { ms: number; rows: number; nodes: number }[];  // Text filled: time until painted, rows, DOM rows made
}

declare global { interface Window { __perf: Perf } }

export const perf: Perf = window.__perf ??= { registers: [], text: [] };
