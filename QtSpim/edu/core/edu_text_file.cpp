/* See edu_text_file.h. */

#include "edu/core/edu_text_file.h"

#include <QTextCodec>

#include "edu/core/edu_source_text.h"

namespace edu {

namespace {

QTextCodec* koreanCodec() {
  QTextCodec* codec = QTextCodec::codecForName("CP949");
  return codec != 0 ? codec : QTextCodec::codecForName("EUC-KR");
}

const char kUtf8Mark[] = "\xEF\xBB\xBF";

}  // namespace

bool hasKoreanCodec() { return koreanCodec() != 0; }

QString encodingName(TextFileFormat::Encoding encoding) {
  switch (encoding) {
    case TextFileFormat::Cp949:  return QString("CP949");
    case TextFileFormat::Latin1: return QString("Latin-1");
    default:                     return QString("UTF-8");
  }
}

QString lineEndName(TextFileFormat::LineEnd lineEnd) {
  return lineEnd == TextFileFormat::CrLf ? QString("CRLF") : QString("LF");
}

DecodedTextFile decodeTextFile(const QByteArray& input) {
  DecodedTextFile result;
  result.mixedLineEnds = false;
  QByteArray bytes = input;

  if (bytes.startsWith(kUtf8Mark)) {
    result.format.byteOrderMark = true;
    bytes.remove(0, 3);
  }

  if (isValidUtf8(bytes)) {
    result.format.encoding = TextFileFormat::Utf8;
    result.text = QString::fromUtf8(bytes);
  } else {
    result.format.byteOrderMark = false;  // not UTF-8 after all: keep the bytes
    bytes = input;
    // Qt's CP949 codec does not reliably count invalid input (it substitutes
    // and carries on), so "is this CP949" is decided by the round trip: the
    // text must encode back to exactly these bytes.
    QTextCodec* korean = koreanCodec();
    if (korean != 0) {
      result.text = korean->toUnicode(bytes);
    }
    if (korean != 0 && korean->fromUnicode(result.text) == bytes) {
      result.format.encoding = TextFileFormat::Cp949;
    } else {
      result.format.encoding = TextFileFormat::Latin1;
      result.text = QString::fromLatin1(bytes);
    }
  }

  const int crlf = result.text.count("\r\n");
  const int lf = result.text.count('\n') - crlf;
  result.format.lineEnd =
      crlf > lf ? TextFileFormat::CrLf : TextFileFormat::Lf;
  result.mixedLineEnds = crlf > 0 && lf > 0;
  result.text.replace("\r\n", "\n");
  return result;
}

bool encodeTextFile(const QString& text, const TextFileFormat& format,
                    QByteArray* bytes, int* firstBadLine) {
  if (firstBadLine != 0) {
    *firstBadLine = 0;
  }

  // Find a character the encoding cannot carry before writing anything.
  if (format.encoding != TextFileFormat::Utf8) {
    QTextCodec* codec = format.encoding == TextFileFormat::Cp949
                            ? koreanCodec()
                            : QTextCodec::codecForName("ISO-8859-1");
    int line = 1;
    for (int i = 0; i < text.size(); i += 1) {
      const QChar c = text.at(i);
      if (c == '\n') {
        line += 1;
      } else if (c.unicode() >= 128) {
        bool representable = codec != 0;
        if (format.encoding == TextFileFormat::Latin1) {
          representable = c.unicode() < 256;
        } else if (codec != 0) {
          int length = 1;
          if (c.isHighSurrogate() && i + 1 < text.size()) {
            length = 2;
          }
          // canEncode() says yes to anything (the codec substitutes '?');
          // ask for the character back instead.
          const QString piece = text.mid(i, length);
          representable = codec->toUnicode(codec->fromUnicode(piece)) == piece;
          i += length - 1;
        }
        if (!representable) {
          if (firstBadLine != 0) {
            *firstBadLine = line;
          }
          return false;
        }
      }
    }
  }

  QString out = text;
  if (format.lineEnd == TextFileFormat::CrLf) {
    out.replace("\n", "\r\n");
  }

  QByteArray encoded;
  switch (format.encoding) {
    case TextFileFormat::Utf8:
      encoded = out.toUtf8();
      if (format.byteOrderMark) {
        encoded.prepend(kUtf8Mark);
      }
      break;
    case TextFileFormat::Cp949: {
      QTextCodec* korean = koreanCodec();
      if (korean == 0) {
        return false;
      }
      // No ConverterState: a fresh encoder per call, and no byte order mark.
      encoded = korean->fromUnicode(out);
      break;
    }
    case TextFileFormat::Latin1:
      encoded = out.toLatin1();
      break;
  }
  *bytes = encoded;
  return true;
}

}  // namespace edu
