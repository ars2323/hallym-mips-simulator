/* Reading the assembler's error messages.  A port of the Qt build's
   QtSpim/edu/core/edu_asm_errors.{h,cpp}.

   The core reports a problem in a source file as one string (CPU/parser.y
   yywarn()):

       spim: (parser) <message> on line <N> of file <name>
       <tab>  <the source line>
       <tab>  <spaces>^

   The editor lists these and jumps to line N.  Anything that does not have
   that shape (run-time errors, "Cannot open file", warnings about undefined
   symbols) is kept as it came, without a line.
*/

export interface AssemblerMessage {
  hasLocation: boolean; // the first line had the "on line N of file P" shape
  message: string;      // "<message>", or the whole text on one line if not
  line: number;         // 1-based; 0 without a location
  file: string;         // as the core printed it
  source: string;       // the quoted source line, trimmed; may be ''
  raw: string;          // the text exactly as received
}

// Qt's QString::simplified(): ends trimmed, inner white space runs to one blank.
export const simplified = (s: string): string => s.replace(/\s+/g, ' ').trim();

export function parseAssemblerMessage(text: string): AssemblerMessage {
  const lines = text.split('\n');
  // Greedy on the message, so that a message that itself contains
  // " on line " keeps it; the file runs to the end of the first line.
  const head = /^spim: \(parser\) (.*) on line (\d+) of file (.*)$/s.exec(lines[0]);
  if (!head) return { hasLocation: false, message: simplified(text), line: 0, file: '', source: '', raw: text };
  // erroneous_line(): tab, two blanks, the source line; the caret line that
  // follows is not used (the editor marks the whole line).
  const source = lines.length >= 2 && !lines[1].includes('^') ? lines[1].trim() : '';
  return { hasLocation: true, message: head[1], line: Number(head[2]), file: head[3], source, raw: text };
}

// The line of `fileLines` (the file's text, one entry per line) the message
// is about, 1-based.  The core's number is not always it: an operand that is
// out of range is only reported once the parser has read the first token of
// the NEXT statement, so the number is that of a later line, while the
// quoted source line is the right one.  This looks for the quoted line at
// the reported number and then upwards; if it is not found (the file has
// changed, the message quotes nothing) the core's number stands.
export function resolveMessageLine(message: AssemblerMessage, fileLines: readonly string[]): number {
  if (!message.hasLocation || message.source === '') return message.line;
  const wanted = simplified(message.source);
  const from = Math.min(message.line, fileLines.length);
  for (let line = from; line >= 1 && line > from - 200; line -= 1) {
    if (simplified(fileLines[line - 1]) === wanted) return line;
  }
  return message.line;
}

// One line for the error list: "12: syntax error" or the message alone.
export function assemblerMessageSummary(message: AssemblerMessage, line: number = message.line): string {
  return message.hasLocation ? `${line}: ${message.message}` : message.message;
}
