/* See edu_path_encoding.h. */

#include "edu/core/edu_path_encoding.h"

#include <QTextCodec>

#ifdef Q_OS_WIN
// The one Win32 call in this fork: QTextCodec::codecForLocale() on Windows
// is a wrapper around the ANSI code page whose name() is just "System",
// and nothing in QtCore says which code page that is.  GetACP() does.
#include <windows.h>
#endif

namespace edu {

bool isLosslessIn(const QString& text, const QTextCodec* codec) {
  if (codec == 0) {
    return false;
  }
  // A round trip rather than QTextCodec::canEncode(): canEncode() relies on
  // the codec counting invalid characters, which not every backend does,
  // whereas a lossy conversion always shows up as a changed string.
  return codec->toUnicode(codec->fromUnicode(text)) == text;
}

QString unrepresentableIn(const QString& text, const QTextCodec* codec) {
  QString lost;
  if (codec == 0) {
    return text;
  }

  // Walk code points, not UTF-16 units, so that a character outside the
  // BMP (an emoji, say) is reported whole rather than as two halves.
  for (int i = 0; i < text.size(); i += 1) {
    QString ch;
    if (text.at(i).isHighSurrogate() && i + 1 < text.size() &&
        text.at(i + 1).isLowSurrogate()) {
      ch = text.mid(i, 2);
      i += 1;
    } else {
      ch = text.mid(i, 1);
    }
    if (!isLosslessIn(ch, codec) && !lost.contains(ch)) {
      lost += ch;
    }
  }
  return lost;
}

bool isLosslessInLocal8Bit(const QString& text) {
  return isLosslessIn(text, QTextCodec::codecForLocale());
}

QString unrepresentableInLocal8Bit(const QString& text) {
  return unrepresentableIn(text, QTextCodec::codecForLocale());
}

QString local8BitCodecName() {
  const QTextCodec* codec = QTextCodec::codecForLocale();
  if (codec == 0) {
    return QString("unknown");
  }
  const QString name = QString::fromLatin1(codec->name());
#ifdef Q_OS_WIN
  // "System" is the Windows locale codec; report the real code page, e.g.
  // "CP949" on Korean Windows or "CP1252" on English Windows.
  if (name == QLatin1String("System")) {
    return QString("CP%1").arg(GetACP());
  }
#endif
  return name;
}

}  // namespace edu
