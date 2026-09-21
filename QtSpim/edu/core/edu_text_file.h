/* QtSpim-Edu: bytes of a source file <-> text in the editor (PLAN R4).

   Opening: a UTF-8 byte order mark is noted and removed; valid UTF-8 is
   UTF-8; anything else is tried as CP949 (what Korean Windows editors wrote
   for decades), and as Latin-1 if this Qt has no such codec or the bytes are
   not CP949 either.  Latin-1 maps every byte to a character and back, so
   even a file in an unknown encoding survives an edit elsewhere in it.

   Saving: the same encoding, the same byte order mark, the same line ends.
   A file opened and saved without a change is the same bytes.  New files are
   UTF-8, no mark, LF.

   The editor holds text with '\n' line ends only.  A file that mixes CRLF
   and LF cannot keep both; it is saved with the kind it has more of, and
   `mixedLineEnds` says so.

   QtCore only.
*/

#ifndef EDU_TEXT_FILE_H
#define EDU_TEXT_FILE_H

#include <QByteArray>
#include <QString>

namespace edu {

struct TextFileFormat {
  enum Encoding { Utf8, Cp949, Latin1 };
  enum LineEnd { Lf, CrLf };

  Encoding encoding;
  bool byteOrderMark;  // UTF-8 only
  LineEnd lineEnd;

  TextFileFormat() : encoding(Utf8), byteOrderMark(false), lineEnd(Lf) {}
};

struct DecodedTextFile {
  QString text;  // '\n' line ends
  TextFileFormat format;
  bool mixedLineEnds;
};

DecodedTextFile decodeTextFile(const QByteArray& bytes);

// False (and *bytes untouched) when the text has a character the encoding
// cannot represent; *firstBadLine is then its 1-based line.
bool encodeTextFile(const QString& text, const TextFileFormat& format,
                    QByteArray* bytes, int* firstBadLine);

QString encodingName(TextFileFormat::Encoding encoding);  // "UTF-8", "CP949", ...
QString lineEndName(TextFileFormat::LineEnd lineEnd);     // "LF", "CRLF"
bool hasKoreanCodec();

}  // namespace edu

#endif  // EDU_TEXT_FILE_H
