/* Which lines the Data panel shows for a range of memory.  A port of the Qt
   build's QtSpim/edu/core/edu_memory_rows.{h,cpp}.

   Same lines as upstream's data window (SpimView::formatMemoryContents(),
   QtSpim/datawin.cpp), so a student sees the same thing in both programs
   and in a saved log:

     - a line is up to four words at a 16-byte aligned address;
     - a range that starts inside a line begins with a short line;
     - from a line start, four or more consecutive zero words become ONE row
       "[from]..[to] 00000000" however long the run is; after the run, the
       rest of that line is again a short line.

   One addition: a "pinned" line is always shown as words, even inside a
   zero run.  That is how Go To can land on (and Change Memory Contents can
   reach) an address the zero-run row would otherwise swallow.

   Memory is reached through a MemoryReader; nothing here reads the core.
*/

export interface MemoryReader {
  word(address: number): number;
}

export interface MemoryRow {
  kind: 'Words' | 'ZeroRun';
  address: number; // of the first word in the row
  words: number;   // Words: 1..4.  ZeroRun: length of the run
}

export const rowEnd = (row: MemoryRow): number => row.address + 4 * row.words; // one past the row
export const rowContains = (row: MemoryRow, a: number): boolean => a >= row.address && a < rowEnd(row);

const WORD = 4;
const LINE = 16;

// Addresses are handled as plain numbers up to 2^32, so a range ending near
// the top of memory cannot wrap.
const roundUp = (value: number, to: number): number => Math.ceil(value / to) * to;

// The short line from `from` to the end of its line (or to `to`).
function appendPartialLine(from: number, to: number, rows: MemoryRow[]): number {
  if (from % LINE === 0 || from >= to) return from;
  const stop = Math.min(roundUp(from, LINE), to);
  rows.push({ kind: 'Words', address: from, words: (stop - from) / WORD });
  return stop;
}

// Rows for [from, to).  `from` is rounded up to a word boundary as upstream
// does; `pinnedLines` holds 16-byte aligned addresses.
export function layoutMemoryRows(from: number, to: number, memory: MemoryReader,
                                 pinnedLines: ReadonlySet<number> = new Set()): MemoryRow[] {
  const rows: MemoryRow[] = [];
  let i = appendPartialLine(roundUp(from >>> 0, WORD), to >>> 0, rows);
  to >>>= 0;
  while (i < to) { // i is line aligned here
    let zeros = 0;
    if (!pinnedLines.has(i)) {
      while (i + zeros * WORD < to) {
        const a = i + zeros * WORD;
        // A pinned line ends the run in front of it.
        if (a % LINE === 0 && zeros > 0 && pinnedLines.has(a)) break;
        if (memory.word(a) !== 0) break;
        zeros += 1;
      }
    }
    if (zeros >= 4) {
      rows.push({ kind: 'ZeroRun', address: i, words: zeros });
      i = appendPartialLine(i + zeros * WORD, to, rows);
    } else {
      const words = Math.min(4, Math.floor((to - i) / WORD));
      if (words === 0) break; // fewer than four bytes left: upstream shows nothing either
      rows.push({ kind: 'Words', address: i, words });
      i += words * WORD;
    }
  }
  return rows;
}
