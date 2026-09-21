/* QtSpim-Edu: the one place 32-bit values are turned into text (and back).

   CLAUDE.md rule 7: widgets never format numbers themselves.  Everything
   here takes the value as quint32 -- the raw register or memory word -- and
   says in its name how the bits are interpreted.  Pure logic, QtCore only,
   covered by tests/edu_core/tst_format.cpp.
*/

#ifndef EDU_FORMAT_H
#define EDU_FORMAT_H

#include <QString>
#include <QtGlobal>

namespace edu {

// "0x0040000c": always 0x + 8 lower-case digits.
QString hex32(quint32 value);

// Two's-complement signed / plain unsigned decimal, no padding.
QString signedDec32(quint32 value);
QString unsignedDec32(quint32 value);

// "00000000010000000000000000001100"
QString bin32(quint32 value);

// "0000 0000 0100 0000 0000 0000 0000 1100": nibbles, most significant first.
QString bin32Grouped(quint32 value);

// A ruler for bin32Grouped() in a fixed-width font:
// "31   27   23   19   15   11   7    3" -- the number of each nibble's most
// significant bit, starting in the column of that nibble's first digit.
QString bitRuler32();

// The value column of a list that follows the Registers/Data "Binary /
// Decimal / Hex" menu: 16 -> hex32, 10 -> signedDec32, 2 -> bin32Grouped.
// Any other base is treated as 16, as the upstream menu code does.
QString inBase32(quint32 value, int base);

// Short column title for that base: "Hex", "Dec", "Bin".
QString baseName(int base);

// Parses what a user types into the "Change Value" dialog.  Decimal input
// may be signed and must fit in 32 bits either way (-2147483648 ..
// 4294967295); hex and binary input is unsigned, and hex may carry a 0x
// prefix.  Surrounding white space is ignored.  Returns false, leaving
// *value alone, for anything else.
//
// Upstream used QString::toLong()/toULong(), whose range depends on the
// platform's long; this gives the same answer everywhere.
bool parseValue32(const QString& text, int base, quint32* value);

}  // namespace edu

#endif  // EDU_FORMAT_H
