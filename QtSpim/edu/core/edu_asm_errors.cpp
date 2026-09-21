/* See edu_asm_errors.h. */

#include "edu/core/edu_asm_errors.h"

#include <QRegExp>
#include <QStringList>

namespace edu {

AssemblerMessage parseAssemblerMessage(const QString& text) {
  AssemblerMessage result;
  result.hasLocation = false;
  result.line = 0;
  result.raw = text;

  const QStringList lines = text.split('\n');
  // Greedy on the message, so that a message that itself contains
  // " on line " keeps it; the file runs to the end of the first line.
  QRegExp head("^spim: \\(parser\\) (.*) on line (\\d+) of file (.*)$");
  if (lines.isEmpty() || !head.exactMatch(lines.at(0))) {
    result.message = text.simplified();
    return result;
  }

  result.hasLocation = true;
  result.message = head.cap(1);
  result.line = head.cap(2).toInt();
  result.file = head.cap(3);

  // erroneous_line(): tab, two blanks, the source line; the caret line that
  // follows is not used (the editor marks the whole line).
  if (lines.size() >= 2 && !lines.at(1).contains('^')) {
    result.source = lines.at(1).trimmed();
  }
  return result;
}

int resolveMessageLine(const AssemblerMessage& message,
                       const QStringList& fileLines) {
  if (!message.hasLocation || message.source.isEmpty()) {
    return message.line;
  }
  const QString wanted = message.source.simplified();
  const int from = qMin(message.line, fileLines.size());
  for (int line = from; line >= 1 && line > from - 200; line -= 1) {
    if (fileLines.at(line - 1).simplified() == wanted) {
      return line;
    }
  }
  return message.line;
}

QString assemblerMessageSummary(const AssemblerMessage& message) {
  return assemblerMessageSummary(message, message.line);
}

QString assemblerMessageSummary(const AssemblerMessage& message, int line) {
  if (!message.hasLocation) {
    return message.message;
  }
  return QString::number(line) + QString(": ") + message.message;
}

}  // namespace edu
