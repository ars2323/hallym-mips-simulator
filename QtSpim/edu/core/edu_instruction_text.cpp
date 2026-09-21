/* See edu_instruction_text.h. */

#include "edu/core/edu_instruction_text.h"

#include "edu/core/edu_format.h"
#include "edu/core/edu_registers.h"

namespace edu {

namespace {

struct Column {
  QString range;    // "31  26"
  QString bits;     // "100011"
  QString name;     // "opcode"
  QString value;    // "35"
  QString meaning;  // "lw"
  int width;
};

QString majorOpcodeClass(int opcode) {
  switch (opcode) {
    case 0x00: return QString("SPECIAL");
    case 0x01: return QString("REGIMM");
    case 0x10: return QString("COP0");
    case 0x11: return QString("COP1");
    case 0x12: return QString("COP2");
    case 0x13: return QString("COP1X");
    case 0x1c: return QString("SPECIAL2");
    default:   return QString();
  }
}

QString cp0RegisterName(int number) {
  switch (number) {
    case 8:  return QString("BadVAddr");
    case 12: return QString("Status");
    case 13: return QString("Cause");
    case 14: return QString("EPC");
    default: return QString();
  }
}

QString fpFormatName(int fmt) {
  switch (fmt) {
    case 16: return QString("single");
    case 17: return QString("double");
    case 20: return QString("word");
    case 8:  return QString("BC");
    default: return QString();
  }
}

// What a field's value stands for, given the whole instruction.
QString meaningOf(const InstructionField& field, const DecodedInstruction& d) {
  const bool named = d.known;
  const int v = int(field.value);

  if (field.name == "opcode") {
    const QString group = majorOpcodeClass(d.opcode);
    return group.isEmpty() ? (named ? d.name : QString("?")) : group;
  }
  if (field.name == "funct") {
    return named ? d.name : QString("?");
  }
  if (field.name == "immediate") {
    if (d.kind == DecodedInstruction::Branch) {
      return QString("x4=%1").arg(d.simm * 4);
    }
    return QString("0x") + QString::number(d.imm, 16).rightJustified(4, '0');
  }
  if (field.name == "target") {
    return QString("x4=0x") +
           QString::number(d.target << 2, 16).rightJustified(8, '0');
  }

  switch (d.format) {
    case DecodedInstruction::R:
    case DecodedInstruction::I:
      if (field.name == "rt" && d.opcode == 0x01) {
        return named ? d.name : QString("?");  // REGIMM: rt selects the instruction
      }
      if (field.name == "rs" || field.name == "rt" || field.name == "rd") {
        return generalRegisterName(v);
      }
      break;

    case DecodedInstruction::Cp0:
      if (field.name == "rs") return named ? d.name : QString("?");
      if (field.name == "rt") return generalRegisterName(v);
      if (field.name == "rd") return cp0RegisterName(v);
      break;

    case DecodedInstruction::FR:
      if (field.name == "fmt") {
        const QString fmt = fpFormatName(v);
        return fmt.isEmpty() && named ? d.name : fmt;  // mfc1, mtc1, ...
      }
      if (field.name == "ft" && d.rs < 8) {
        return generalRegisterName(v);  // mfc1 $t0, $f12: rt is a CPU register
      }
      if (field.name == "ft" || field.name == "fs" || field.name == "fd") {
        return QString("$f%1").arg(v);
      }
      break;

    case DecodedInstruction::FI:
      if (field.name == "fmt") return fpFormatName(v);
      if (field.name == "tf") return named ? d.name : QString("?");  // bc1t / bc1f
      break;

    case DecodedInstruction::J:
      break;
  }
  return QString();
}

QString rangeLabel(const InstructionField& field, int width) {
  if (field.high == field.low) {
    return QString::number(field.high);
  }
  const QString high = QString::number(field.high);
  const QString low = QString::number(field.low);
  if (width >= high.size() + low.size() + 2) {  // "25 21" would read as two fields
    return high + QString(width - high.size() - low.size(), QLatin1Char(' ')) + low;
  }
  return high + QLatin1Char('-') + low;
}

QString joinRow(const QList<Column>& columns, QString Column::*member) {
  QStringList cells;
  for (int i = 0; i < columns.size(); i += 1) {
    const QString text = columns.at(i).*member;
    cells << (i + 1 < columns.size() ? text.leftJustified(columns.at(i).width, ' ')
                                     : text);
  }
  QString row = cells.join(QString(" "));
  while (row.endsWith(QLatin1Char(' '))) {
    row.chop(1);
  }
  return row;
}

}  // namespace

QStringList instructionDetailLines(const DecodedInstruction& d,
                                   quint32 address,
                                   const QString& disassembly,
                                   const QString& destinationLabel,
                                   BranchConvention convention) {
  QList<Column> columns;
  for (int i = 0; i < d.fields.size(); i += 1) {
    const InstructionField& field = d.fields.at(i);
    Column c;
    c.bits = QString::number(field.value, 2).rightJustified(field.width(), '0');
    c.name = field.name;
    c.value = (field.name == "immediate") ? QString::number(d.simm)
                                          : QString::number(field.value);
    c.meaning = meaningOf(field, d);
    c.width = qMax(qMax(c.bits.size(), c.name.size()),
                   qMax(c.value.size(), c.meaning.size()));
    // A range that does not fit as "31  26" falls back to "31-26", which
    // may itself need room.
    c.width = qMax(c.width, rangeLabel(field, c.width).size());
    c.range = rangeLabel(field, c.width);
    columns << c;
  }

  const QString type = formatName(d.format) + QString("-type");
  const QString what =
      d.known ? disassembly : QString("(not an instruction SPIM implements)");
  const int gap = qMax(2, kInstructionTextColumns - what.size() - type.size());

  QStringList lines;
  lines << what + QString(gap, QLatin1Char(' ')) + type;
  lines << hex32(d.word) + QString("  at ") + hex32(address);
  lines << joinRow(columns, &Column::range);
  lines << joinRow(columns, &Column::bits);
  lines << joinRow(columns, &Column::name);
  lines << joinRow(columns, &Column::value);
  lines << joinRow(columns, &Column::meaning);

  if (d.hasDestination) {
    const QString where =
        hex32(d.destination) + (destinationLabel.isEmpty()
                                    ? QString()
                                    : QString(" [") + destinationLabel + QString("]"));
    if (d.kind == DecodedInstruction::Jump) {
      lines << QString::fromUtf8("Dest = (PC & 0xf0000000) | (target×4)");
      lines << QString("     = ") + where;
    } else if (convention == MipsDelaySlot) {
      lines << QString::fromUtf8("Dest = PC + 4 + (offset×4) = ") + where;
    } else {
      lines << QString::fromUtf8("Dest = PC + (offset×4) = ") + where;
    }
  }
  return lines;
}

QStringList instructionNoteLines(const DecodedInstruction& d,
                                 BranchConvention convention) {
  QStringList notes;
  if (d.hasDestination && d.kind == DecodedInstruction::Branch &&
      convention == SpimNoDelaySlot) {
    notes << QString::fromUtf8(
        "SPIM 기본 모드는 지연 분기가 없어 PC 기준으로 인코딩합니다. "
        "교재의 MIPS(PC+4 기준)와 offset 값이 1 다릅니다.");
    notes << QString(
        "SPIM's default mode has no delayed branches and encodes from PC. "
        "Textbook MIPS encodes from PC+4, so its offset is 1 less.");
  }
  return notes;
}

}  // namespace edu
