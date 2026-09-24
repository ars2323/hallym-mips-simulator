/* The source line the core keeps with each instruction ("183: jal main").
   A port of the Qt build's QtSpim/edu/core/edu_source_text.{h,cpp}.

   decodeSourceBytes() and isValidUtf8() are not here: in this build the core
   only ever receives UTF-8 (native/index.ts decodes the file first, by
   src/node/text-file.ts), so its lines arrive as JS strings and there is
   nothing left to guess.  isValidUtf8() lives on in src/node/text-file.ts.
*/

// The line number the core put at the front of a source line ("183: jal
// main" -> 183), or 0 when there is none.  Breakpoints are remembered by
// this rather than by address, so that an edit above them does not leave
// them on a different statement.
export function sourceLineNumber(source: string): number {
  const m = /^\s*(\d+):/.exec(source);
  if (!m || m[1].length > 9) return 0; // ten digits and more are not a line number
  return Number(m[1]);
}

// What is left of that line once the number and the colon are taken off,
// with the ends trimmed: "183: jal main" -> "jal main".
export function sourceLineStatement(source: string): string {
  const colon = source.indexOf(':');
  if (sourceLineNumber(source) === 0 || colon < 0) return source.trim();
  return source.slice(colon + 1).trim();
}
