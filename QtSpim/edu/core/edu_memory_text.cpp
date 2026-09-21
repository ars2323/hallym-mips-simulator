/* See edu_memory_text.h. */

#include "edu/core/edu_memory_text.h"

#include "edu/core/edu_format.h"

namespace edu {

QString memoryUnitName(MemoryUnit unit) {
  switch (unit) {
    case ByteUnit: return QString("Bytes");
    case HalfUnit: return QString("Half words");
    default:       return QString("Words");
  }
}

QString memoryValueText(quint32 value, MemoryUnit unit, int base) {
  const int bits = 8 * int(unit);
  const quint32 mask = bits == 32 ? 0xffffffffu : ((1u << bits) - 1u);
  value &= mask;
  if (base == 10) {
    qint64 number = value;
    if (bits < 32 && (value & (1u << (bits - 1))) != 0) {
      number -= qint64(1) << bits;
    } else if (bits == 32) {
      number = qint32(value);
    }
    return QString::number(number);
  }
  if (base == 2) {
    return QString::number(value, 2).rightJustified(bits, '0');
  }
  return QString::number(value, 16).rightJustified(bits / 4, '0');
}

int memoryValueWidth(MemoryUnit unit, int base) {
  const int bits = 8 * int(unit);
  if (base == 2) {
    return bits;
  }
  if (base == 10) {
    return unit == WordUnit ? 11 : (unit == HalfUnit ? 6 : 4);  // "-2147483648"
  }
  return bits / 4;
}

QString lineOffsetName(quint32 offset) {
  return QString("+") + QString::number(offset & 15u, 16).toUpper();
}

QString nameWithOffset(const QString& name, quint32 offset) {
  return offset == 0 ? name : name + QString("+") + QString::number(offset);
}

QString asciiText(const quint8* bytes, int count) {
  QString text;
  for (int i = 0; i < count; i += 1) {
    const quint8 c = bytes[i];
    text += (c >= 0x20 && c <= 0x7e) ? QChar(c) : QChar('.');
  }
  return text;
}

QStringList memoryDetailLines(quint32 address, quint32 value,
                              const quint8 bytes[4], const QStringList& labels,
                              const QString& segment,
                              const QStringList& pointers) {
  QStringList heading;
  heading << hex32(address);
  if (!labels.isEmpty()) {
    heading << labels.join(", ");
  }
  if (!segment.isEmpty()) {
    heading << segment;
  }

  QStringList byteTexts;
  for (int i = 0; i < 4; i += 1) {
    byteTexts << memoryValueText(bytes[i], ByteUnit, 16);
  }

  QStringList lines;
  lines << heading.join(" | ");
  lines << QString("Hex       ") + hex32(value);
  lines << QString("Signed    ") + signedDec32(value);
  lines << QString("Unsigned  ") + unsignedDec32(value);
  lines << bitRuler32();
  lines << bin32Grouped(value);
  lines << QString("Bytes     ") + byteTexts.join(" ") + QString("  \"") +
               asciiText(bytes, 4) + QString("\"");
  if (!pointers.isEmpty()) {
    lines << QString("Pointers  ") + pointers.join(", ");
  }
  return lines;
}

GoToTarget resolveGoTo(const QString& input, const LabelMap& labels) {
  GoToTarget target;
  target.kind = GoToTarget::Invalid;
  target.address = 0;
  target.reg.kind = RegisterRef::General;
  target.reg.number = 0;

  const QString text = input.trimmed();
  if (text.isEmpty()) {
    return target;
  }

  if (text.startsWith('$')) {
    if (findRegister(text, &target.reg)) {
      target.kind = GoToTarget::Register;
    }
    return target;
  }

  if (labels.find(text, &target.address)) {
    target.kind = GoToTarget::Label;
    target.label = text;
    return target;
  }

  QString digits = text;
  if (digits.startsWith("0x", Qt::CaseInsensitive)) {
    digits.remove(0, 2);
  }
  bool ok = false;
  const quint32 address = digits.toUInt(&ok, 16);
  if (ok && digits.size() <= 8 && !digits.isEmpty()) {
    target.kind = GoToTarget::Address;
    target.address = address;
    return target;
  }

  if (findRegister(text, &target.reg)) {
    target.kind = GoToTarget::Register;
  }
  return target;
}

}  // namespace edu
