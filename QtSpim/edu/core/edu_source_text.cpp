/* See edu_source_text.h. */

#include "edu/core/edu_source_text.h"

#include <QTextCodec>

namespace edu {

bool isValidUtf8(const QByteArray& bytes) {
  QTextCodec* utf8 = QTextCodec::codecForName("UTF-8");
  if (utf8 == 0) {
    return false;
  }
  QTextCodec::ConverterState state;
  utf8->toUnicode(bytes.constData(), bytes.size(), &state);
  return state.invalidChars == 0 && state.remainingChars == 0;
}

QString decodeSourceBytes(const QByteArray& raw) {
  QByteArray bytes = raw;
  while (bytes.endsWith('\n') || bytes.endsWith('\r')) {
    bytes.chop(1);
  }
  if (isValidUtf8(bytes)) {
    return QString::fromUtf8(bytes);
  }
  QTextCodec* korean = QTextCodec::codecForName("CP949");
  if (korean == 0) {
    korean = QTextCodec::codecForName("EUC-KR");
  }
  if (korean != 0) {
    return korean->toUnicode(bytes);
  }
  return QString::fromLatin1(bytes);
}

int sourceLineNumber(const QString& source) {
  int i = 0;
  while (i < source.size() && source.at(i).isSpace()) {
    i += 1;
  }
  int digits = 0;
  int value = 0;
  while (i < source.size() && source.at(i).isDigit()) {
    value = value * 10 + (source.at(i).unicode() - '0');
    digits += 1;
    i += 1;
    if (digits > 9) {
      return 0;  // not a line number
    }
  }
  if (digits == 0 || i >= source.size() || source.at(i) != QLatin1Char(':')) {
    return 0;
  }
  return value;
}

QString sourceLineStatement(const QString& source) {
  const int colon = source.indexOf(QLatin1Char(':'));
  if (sourceLineNumber(source) == 0 || colon < 0) {
    return source.trimmed();
  }
  return source.mid(colon + 1).trimmed();
}

}  // namespace edu
