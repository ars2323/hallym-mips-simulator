/* QtSpim-Edu: can a piece of text survive the trip into the simulator core?

   The core takes file names as char* and opens them with fopen(), and the
   GUI converts QString paths with QString::toLocal8Bit().  On Windows that
   conversion goes through the system ANSI code page, which cannot represent
   every character a path may contain: a Korean user name on an English
   Windows, for example, becomes "???" and the open fails.  Fixing that
   properly would mean changing CPU/, which this fork does not do; instead
   the GUI detects the situation before loading and explains it.

   Pure logic, QtCore only.  The QTextCodec-taking overloads exist so that
   the behaviour can be unit-tested with a fixed codec on any platform.
*/

#ifndef EDU_PATH_ENCODING_H
#define EDU_PATH_ENCODING_H

#include <QString>

class QTextCodec;

namespace edu {

// True when converting `text` to `codec` and back yields `text` unchanged.
bool isLosslessIn(const QString& text, const QTextCodec* codec);

// The distinct code points of `text` that `codec` cannot represent, in order
// of first appearance.  Empty when isLosslessIn() is true.
QString unrepresentableIn(const QString& text, const QTextCodec* codec);

// The same two questions for the codec QString::toLocal8Bit() uses, i.e.
// the one a file name is converted with on its way to fopen().
bool isLosslessInLocal8Bit(const QString& text);
QString unrepresentableInLocal8Bit(const QString& text);

// Name of that codec, for messages ("windows-1252", "UTF-8", ...).
QString local8BitCodecName();

}  // namespace edu

#endif  // EDU_PATH_ENCODING_H
