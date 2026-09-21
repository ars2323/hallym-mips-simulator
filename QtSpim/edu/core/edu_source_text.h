/* QtSpim-Edu: the core keeps each source line as the raw bytes of the .s
   file ("12: li $v0, 4   # 출력").  Students' files are UTF-8 or, when they
   come from an older Windows editor, CP949; the core does not care, but a
   QString has to be made from one or the other.

   QtCore only.
*/

#ifndef EDU_SOURCE_TEXT_H
#define EDU_SOURCE_TEXT_H

#include <QByteArray>
#include <QString>

namespace edu {

// UTF-8 if the bytes are valid UTF-8, otherwise CP949 (if this Qt has the
// codec), otherwise Latin-1.  Trailing line ends are dropped.
QString decodeSourceBytes(const QByteArray& bytes);

// True when the bytes are well-formed UTF-8 (plain ASCII included).
bool isValidUtf8(const QByteArray& bytes);

}  // namespace edu

#endif  // EDU_SOURCE_TEXT_H
