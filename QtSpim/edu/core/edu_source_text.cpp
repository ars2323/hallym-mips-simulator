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

}  // namespace edu
