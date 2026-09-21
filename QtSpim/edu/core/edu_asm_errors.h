/* QtSpim-Edu: reading the assembler's error messages (PLAN R4).

   The core reports a problem in a source file as one string (CPU/parser.y
   yywarn(), ARCHITECTURE section 4):

       spim: (parser) <message> on line <N> of file <path>
       <tab>  <the source line>
       <tab>  <spaces>^

   The editor lists these and jumps to line N.  Anything that does not have
   that shape (run-time errors, "Cannot open file", warnings about undefined
   symbols) is kept as it came, without a line.

   QtCore only.
*/

#ifndef EDU_ASM_ERRORS_H
#define EDU_ASM_ERRORS_H

#include <QString>
#include <QStringList>

namespace edu {

struct AssemblerMessage {
  bool hasLocation;  // the first line had the "on line N of file P" shape
  QString message;   // "<message>", or the whole text on one line if not
  int line;          // 1-based; 0 without a location
  QString file;      // as the core printed it
  QString source;    // the quoted source line, trimmed; may be empty
  QString raw;       // the text exactly as received
};

AssemblerMessage parseAssemblerMessage(const QString& text);

// The line of `fileLines` (the file's text, one entry per line) the message
// is about, 1-based.  The core's number is not always it: an operand that is
// out of range is only reported once the parser has read the first token of
// the NEXT statement, so the number is that of a later line, while the
// quoted source line is the right one.  This looks for the quoted line at
// the reported number and then upwards; if it is not found (the file has
// changed, the message quotes nothing) the core's number stands.
int resolveMessageLine(const AssemblerMessage& message,
                       const QStringList& fileLines);

// One line for the error list: "12: syntax error" or the message alone.
QString assemblerMessageSummary(const AssemblerMessage& message);
QString assemblerMessageSummary(const AssemblerMessage& message, int line);

}  // namespace edu

#endif  // EDU_ASM_ERRORS_H
