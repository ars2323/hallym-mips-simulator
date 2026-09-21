/* QtSpim-Edu: text for the Data panel's cells and for the inspector's view
   of a memory word (PLAN R5), and the reading of what is typed into the
   panel's "Go to" box.

   QtCore only.  Values arrive already read from the core at the right
   granularity (word / half / byte), so nothing here assumes a byte order;
   bytes are always given in memory order, lowest address first.
*/

#ifndef EDU_MEMORY_TEXT_H
#define EDU_MEMORY_TEXT_H

#include <QString>
#include <QStringList>

#include "edu/core/edu_registers.h"
#include "edu/core/edu_symbols.h"

namespace edu {

enum MemoryUnit { ByteUnit = 1, HalfUnit = 2, WordUnit = 4 };

QString memoryUnitName(MemoryUnit unit);  // "Words", "Half words", "Bytes"

// One value of `unit` bytes in the Data Segment menu's base:
//   16: zero-padded hex digits, no prefix ("6c6c6548", "6548", "48")
//   10: signed decimal of that width (a byte 0xff is -1)
//    2: zero-padded binary digits
QString memoryValueText(quint32 value, MemoryUnit unit, int base);

// Widest text memoryValueText() can produce, for column sizing.
int memoryValueWidth(MemoryUnit unit, int base);

// Bytes as characters: printable ASCII as itself, everything else '.'.
QString asciiText(const quint8* bytes, int count);

// The inspector's lines for one memory word.
//   address   of the word (word aligned)
//   value     the word
//   bytes     its four bytes in memory order
//   labels    labels at the word's four addresses, as "name" or "name+2"
//   segment   "User data", "User stack", "Kernel data"
//   pointers  registers whose value lies in the word, as "$sp" or "$t0+1"
QStringList memoryDetailLines(quint32 address, quint32 value,
                              const quint8 bytes[4], const QStringList& labels,
                              const QString& segment,
                              const QStringList& pointers);

// What the text in the Go To box means.
struct GoToTarget {
  enum Kind { Invalid, Address, Register, Label };
  Kind kind;
  quint32 address;   // Address, Label
  RegisterRef reg;   // Register: the caller reads its value
  QString label;     // Label
};

// In this order: "$name" / "$number" is a register; a known label is that
// label; "0x..." or bare hex digits is an address; a register name without
// the "$" ("sp") is a register.
GoToTarget resolveGoTo(const QString& text, const LabelMap& labels);

}  // namespace edu

#endif  // EDU_MEMORY_TEXT_H
