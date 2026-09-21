/* See edu_format.h. */

#include "edu/core/edu_format.h"

namespace edu {

QString hex32(quint32 value) {
  return QString("0x") + QString::number(value, 16).rightJustified(8, '0');
}

QString signedDec32(quint32 value) {
  return QString::number(static_cast<qint32>(value));
}

QString unsignedDec32(quint32 value) { return QString::number(value); }

QString bin32(quint32 value) {
  return QString::number(value, 2).rightJustified(32, '0');
}

QString bin32Grouped(quint32 value) {
  const QString bits = bin32(value);
  QString grouped;
  for (int nibble = 0; nibble < 8; nibble += 1) {
    if (nibble > 0) {
      grouped += QLatin1Char(' ');
    }
    grouped += bits.mid(nibble * 4, 4);
  }
  return grouped;
}

QString bitRuler32() {
  // One 5-character cell per nibble ("0000 "), label left-aligned over the
  // nibble's top bit; the last cell is 4 wide and ends with bit 0's label.
  QString ruler;
  for (int nibble = 0; nibble < 8; nibble += 1) {
    const int topBit = 31 - nibble * 4;
    const int width = (nibble < 7) ? 5 : 3;
    ruler += QString::number(topBit).leftJustified(width, ' ');
  }
  ruler += QLatin1Char('0');
  return ruler;
}

QString inBase32(quint32 value, int base) {
  switch (base) {
    case 2:
      return bin32Grouped(value);
    case 10:
      return signedDec32(value);
    default:
      return hex32(value);
  }
}

QString baseName(int base) {
  switch (base) {
    case 2:
      return QString("Bin");
    case 10:
      return QString("Dec");
    default:
      return QString("Hex");
  }
}

bool parseValue32(const QString& text, int base, quint32* value) {
  const QString trimmed = text.trimmed();
  if (trimmed.isEmpty()) {
    return false;
  }

  bool ok = false;
  if (base == 10) {
    const qlonglong parsed = trimmed.toLongLong(&ok, 10);
    if (!ok || parsed < -2147483648LL || parsed > 4294967295LL) {
      return false;
    }
    *value = static_cast<quint32>(parsed);
    return true;
  }

  if (base != 16 && base != 2) {
    return false;
  }
  if (trimmed.startsWith(QLatin1Char('-')) ||
      trimmed.startsWith(QLatin1Char('+'))) {
    return false;  // bit patterns are unsigned
  }
  const qulonglong parsed = trimmed.toULongLong(&ok, base);
  if (!ok || parsed > 4294967295ULL) {
    return false;
  }
  *value = static_cast<quint32>(parsed);
  return true;
}

}  // namespace edu
