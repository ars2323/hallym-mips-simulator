/* See edu_data_model.h. */

#include "edu/edu_data_model.h"

#include "edu/theme/tokens.h"

#include "edu/core/edu_format.h"
#include "edu/core/edu_memory_rows.h"
#include "edu/core/edu_registers.h"
#include "spimview.h"  // the core's headers (they have no include guards)

namespace {

// Registers whose target gets a marker (PLAN R5).  The core names $sp and
// $gp (CPU/reg.h) but not $fp, which is register 30 (int_reg_names[]).
const int kFramePointer = 30;
const int kMarked[] = {REG_SP, kFramePointer, REG_GP};

class CoreMemory : public edu::MemoryReader {
 public:
  quint32 word(quint32 address) const { return quint32(read_mem_word(address)); }
};

// Segment bounds as upstream's formatUserDataSeg() / formatUserStack() /
// formatKernelDataSeg() take them (QtSpim/datawin.cpp).
void segmentBounds(EduDataModel::Segment segment, quint32* from, quint32* to) {
  switch (segment) {
    case EduDataModel::UserData:
      *from = DATA_BOT;
      *to = data_top;
      break;
    case EduDataModel::UserStack: {
      // Upstream starts at $sp rounded down to a word.  A $sp outside the
      // stack (Clear Registers leaves it 0) would make that a walk through
      // unmapped memory; show the whole allocated stack then.
      const quint32 sp = quint32(R[REG_SP]) & ~quint32(3);
      *from = (sp >= stack_bot && sp < STACK_TOP) ? sp : quint32(stack_bot);
      *to = STACK_TOP;
      break;
    }
    default:
      *from = K_DATA_BOT;
      *to = k_data_top;
      break;
  }
}

}  // namespace

EduDataModel::EduDataModel(QObject* parent)
    : QAbstractTableModel(parent),
      environmentExpanded_(false),
      environmentStart_(0),
      unit_(edu::WordUnit),
      base_(16),
      text_(Qt::black),
      background_(Qt::white) {
  for (int s = 0; s < SegmentCount; s += 1) {
    shown_[s] = true;
    expanded_[s] = s != KernelData;
  }
  for (int r = 0; r < 32; r += 1) {
    registers_[r] = 0;
  }
}

QString EduDataModel::segmentName(Segment segment) {
  switch (segment) {
    case UserData:  return QString("User data");
    case UserStack: return QString("User stack");
    default:        return QString("Kernel data");
  }
}

void EduDataModel::appendRange(Segment segment, quint32 from, quint32 to,
                               QVector<Row>* rows) const {
  const CoreMemory memory;
  const QVector<edu::MemoryRow> layout =
      edu::layoutMemoryRows(from, to, memory, pinnedLines_);
  for (int i = 0; i < layout.size(); i += 1) {
    Row row;
    row.segment = segment;
    row.address = layout.at(i).address;
    row.words = layout.at(i).words;
    row.end = layout.at(i).end();
    if (layout.at(i).kind == edu::MemoryRow::ZeroRun) {
      row.kind = ZeroRunRow;
    } else {
      row.kind = WordsRow;
      const quint32 base = row.lineBase();
      for (int slot = 0; slot < 4; slot += 1) {
        const quint32 a = base + 4 * quint32(slot);
        const bool present = a >= row.address && a < row.end;
        row.word[slot] = present ? quint32(read_mem_word(a)) : 0;
        for (int h = 0; h < 2; h += 1) {
          row.half[2 * slot + h] =
              present ? quint16(read_mem_half(a + 2 * quint32(h)) & 0xffff) : 0;
        }
        for (int b = 0; b < 4; b += 1) {
          row.byte[4 * slot + b] =
              present ? quint8(read_mem_byte(a + quint32(b)) & 0xff) : 0;
        }
      }
    }
    row.labels = labelText(row);
    rows->append(row);
  }
}

QVector<EduDataModel::Row> EduDataModel::buildRows() const {
  QVector<Row> rows;
  for (int s = 0; s < SegmentCount; s += 1) {
    const Segment segment = Segment(s);
    if (!shown_[s]) {
      continue;
    }
    quint32 from = 0;
    quint32 to = 0;
    segmentBounds(segment, &from, &to);

    Row header;
    header.kind = SegmentHeader;
    header.segment = segment;
    header.address = from;
    header.words = 0;
    header.end = to;
    rows.append(header);
    if (!expanded_[s]) {
      continue;
    }

    if (segment == UserStack && environmentStart_ != 0 &&
        environmentStart_ < to) {
      const quint32 fold = qMax(environmentStart_ & ~quint32(3), from);
      appendRange(segment, from, fold, &rows);
      Row foldRow;
      foldRow.kind = EnvironmentFold;
      foldRow.segment = segment;
      foldRow.address = fold;
      foldRow.words = 0;
      foldRow.end = to;
      rows.append(foldRow);
      if (environmentExpanded_) {
        appendRange(segment, fold, to, &rows);
      }
    } else {
      appendRange(segment, from, to, &rows);
    }
  }
  return rows;
}

void EduDataModel::refresh() {
  for (int r = 0; r < 32; r += 1) {
    registers_[r] = quint32(R[r]);
  }
  const QVector<Row> rows = buildRows();

  bool sameShape = rows.size() == rows_.size();
  for (int i = 0; sameShape && i < rows.size(); i += 1) {
    const Row& a = rows.at(i);
    const Row& b = rows_.at(i);
    sameShape = a.kind == b.kind && a.segment == b.segment &&
                a.address == b.address && a.words == b.words && a.end == b.end;
  }

  if (sameShape) {
    // The usual case while stepping: values change, lines do not.  The view
    // keeps its selection and scroll position and repaints what is visible.
    rows_ = rows;
    if (!rows_.isEmpty()) {
      emit dataChanged(index(0, 0), index(rows_.size() - 1, ColumnCount - 1));
    }
  } else {
    beginResetModel();
    rows_ = rows;
    endResetModel();
  }
}

bool EduDataModel::markedRegistersDiffer() const {
  for (unsigned i = 0; i < sizeof(kMarked) / sizeof(kMarked[0]); i += 1) {
    if (registers_[kMarked[i]] != quint32(R[kMarked[i]])) {
      return true;
    }
  }
  return false;
}

void EduDataModel::setSegmentsShown(bool userData, bool userStack,
                                    bool kernelData) {
  shown_[UserData] = userData;
  shown_[UserStack] = userStack;
  shown_[KernelData] = kernelData;
}

void EduDataModel::setBase(int base) { base_ = base; }

void EduDataModel::setUnit(edu::MemoryUnit unit) {
  if (unit != unit_) {
    unit_ = unit;
    if (!rows_.isEmpty()) {
      emit dataChanged(index(0, 0), index(rows_.size() - 1, ColumnCount - 1));
    }
  }
}

void EduDataModel::setColors(const QColor& text, const QColor& background) {
  text_ = text;
  background_ = background;
}

void EduDataModel::setLabels(const edu::LabelMap& labels) { labels_ = labels; }

void EduDataModel::setEnvironmentStart(quint32 address) {
  environmentStart_ = address;
}

void EduDataModel::setEnvironmentExpanded(bool expanded) {
  if (expanded != environmentExpanded_) {
    environmentExpanded_ = expanded;
    refresh();
  }
}

void EduDataModel::setSegmentExpanded(Segment segment, bool expanded) {
  if (expanded != expanded_[segment]) {
    expanded_[segment] = expanded;
    refresh();
  }
}

void EduDataModel::clearPins() { pinnedLines_.clear(); }

QModelIndex EduDataModel::reveal(quint32 address) {
  address &= ~quint32(3);
  for (int s = 0; s < SegmentCount; s += 1) {
    quint32 from = 0;
    quint32 to = 0;
    segmentBounds(Segment(s), &from, &to);
    if (!shown_[s] || address < from || address >= to) {
      continue;
    }
    bool changed = false;
    if (!expanded_[s]) {
      expanded_[s] = true;
      changed = true;
    }
    if (s == UserStack && environmentStart_ != 0 &&
        address >= (environmentStart_ & ~quint32(3)) && !environmentExpanded_) {
      environmentExpanded_ = true;
      changed = true;
    }
    if (changed) {
      refresh();
    }
    if (!indexOfAddress(address).isValid()) {
      pinnedLines_.insert(address & ~quint32(15));  // inside a zero run
      refresh();
    }
    return indexOfAddress(address);
  }
  return QModelIndex();
}

QModelIndex EduDataModel::indexOfAddress(quint32 address) const {
  address &= ~quint32(3);
  // Rows are in ascending address order within a segment; segments are few.
  for (int i = 0; i < rows_.size(); i += 1) {
    const Row& row = rows_.at(i);
    if (row.kind == WordsRow && address >= row.address && address < row.end) {
      return index(i, Word0Column + int((address - row.lineBase()) / 4));
    }
  }
  return QModelIndex();
}

const EduDataModel::Row* EduDataModel::rowAt(int row) const {
  return (row >= 0 && row < rows_.size()) ? &rows_.at(row) : 0;
}

bool EduDataModel::wordAt(const QModelIndex& index, quint32* address) const {
  const Row* row = rowAt(index.row());
  if (row == 0 || row->kind != WordsRow || index.column() < Word0Column ||
      index.column() > Word3Column) {
    return false;
  }
  const quint32 a = row->lineBase() + 4 * quint32(index.column() - Word0Column);
  if (a < row->address || a >= row->end) {
    return false;
  }
  *address = a;
  return true;
}

bool EduDataModel::wordInfo(quint32 address, WordInfo* info) const {
  const QModelIndex cell = indexOfAddress(address);
  quint32 a = 0;
  if (!wordAt(cell, &a)) {
    return false;
  }
  const Row& row = rows_.at(cell.row());
  const int slot = cell.column() - Word0Column;
  info->address = a;
  info->value = row.word[slot];
  for (int b = 0; b < 4; b += 1) {
    info->bytes[b] = row.byte[4 * slot + b];
  }
  info->segment = segmentName(row.segment);

  info->labels.clear();
  const QList<QPair<quint32, QStringList> > labelled = labels_.labelsIn(a, a + 4);
  for (int i = 0; i < labelled.size(); i += 1) {
    const quint32 offset = labelled.at(i).first - a;
    for (int n = 0; n < labelled.at(i).second.size(); n += 1) {
      info->labels << edu::nameWithOffset(labelled.at(i).second.at(n), offset);
    }
  }

  // Registers as they are now, not as of the last refresh(): the table is
  // only redrawn after memory writes, but the inspector is refreshed after
  // every run command, and "which register points here" is about now.
  info->pointers.clear();
  for (int r = 1; r < 32; r += 1) {  // $zero points nowhere
    const quint32 value = quint32(R[r]);
    if (value >= a && value - a < 4) {
      info->pointers << edu::nameWithOffset(edu::generalRegisterName(r),
                                            value - a);
    }
  }
  return true;
}

int EduDataModel::pointerInto(quint32 from, quint32 to) const {
  for (unsigned i = 0; i < sizeof(kMarked) / sizeof(kMarked[0]); i += 1) {
    const quint32 value = registers_[kMarked[i]];
    if (value >= from && value < to) {
      return kMarked[i];
    }
  }
  return -1;
}

// "+0 msg, +8 total   $sp -> +4": offsets are those of the column headers.
QString EduDataModel::labelText(const Row& row) const {
  QStringList parts;
  const bool run = row.kind == ZeroRunRow;
  const QList<QPair<quint32, QStringList> > labelled =
      labels_.labelsIn(row.address, row.end);
  for (int i = 0; i < labelled.size() && i < 6; i += 1) {
    const QString where =
        run ? edu::hex32Digits(labelled.at(i).first)
            : edu::lineOffsetName(labelled.at(i).first - row.lineBase());
    parts << where + QString(" ") + labelled.at(i).second.join(" ");
  }
  if (labelled.size() > 6) {
    parts << QString("...");
  }
  QString text = parts.join(", ");

  QStringList pointers;
  for (unsigned i = 0; i < sizeof(kMarked) / sizeof(kMarked[0]); i += 1) {
    const quint32 value = registers_[kMarked[i]];
    if (value >= row.address && value < row.end) {
      pointers << edu::generalRegisterName(kMarked[i]) + QString(" -> ") +
                      (run ? edu::hex32Digits(value)
                           : edu::lineOffsetName(value - row.lineBase()));
    }
  }
  if (!pointers.isEmpty()) {
    text += (text.isEmpty() ? QString() : QString("   ")) + pointers.join(", ");
  }
  return text;
}

QString EduDataModel::fullRowText(const Row& row) const {
  const QString range = QString("[") + edu::hex32Digits(row.address) +
                        QString("]..[") + edu::hex32Digits(row.end) +
                        QString("]");
  switch (row.kind) {
    case SegmentHeader: {
      // Upstream's titles ("User data segment", "User Stack", "Kernel data
      // segment"), with a fold mark in front.
      const QString title =
          row.segment == UserData
              ? QString("User data segment ")
              : (row.segment == UserStack ? QString("User Stack ")
                                          : QString("Kernel data segment "));
      // U+25BE / U+25B8: small down / right triangle
      return QString(QChar(expanded_[row.segment] ? 0x25BE : 0x25B8)) +
             QString(" ") + title + range +
             (expanded_[row.segment] ? QString()
                                     : QString("   (click to expand)"));
    }
    case EnvironmentFold:
      return QString(QChar(environmentExpanded_ ? 0x25BE : 0x25B8)) +
             QString(" Program arguments and environment ") + range +
             QString("   (%1 bytes, click to %2)")
                 .arg(row.end - row.address)
                 .arg(QString(environmentExpanded_ ? "collapse" : "expand"));
    case ZeroRunRow:
      // Upstream: "[10000000]..[1000ffff]  00000000"
      return QString("[") + edu::hex32Digits(row.address) + QString("]..[") +
             edu::hex32Digits(row.end - 1) + QString("]  ") +
             edu::memoryValueText(0, edu::WordUnit, base_) +
             QString("   (%1 zero words)").arg(row.words);
    default:
      return QString();
  }
}

QString EduDataModel::cellText(const Row& row, int slot) const {
  const quint32 a = row.lineBase() + 4 * quint32(slot);
  if (a < row.address || a >= row.end) {
    return QString();
  }
  if (unit_ == edu::WordUnit) {
    return edu::memoryValueText(row.word[slot], edu::WordUnit, base_);
  }
  QStringList parts;
  if (unit_ == edu::HalfUnit) {
    for (int h = 0; h < 2; h += 1) {
      parts << edu::memoryValueText(row.half[2 * slot + h], edu::HalfUnit, base_);
    }
  } else {
    for (int b = 0; b < 4; b += 1) {
      parts << edu::memoryValueText(row.byte[4 * slot + b], edu::ByteUnit, base_);
    }
  }
  return parts.join(" ");
}

int EduDataModel::rowCount(const QModelIndex& parent) const {
  return parent.isValid() ? 0 : rows_.size();
}

int EduDataModel::columnCount(const QModelIndex& parent) const {
  return parent.isValid() ? 0 : int(ColumnCount);
}

Qt::ItemFlags EduDataModel::flags(const QModelIndex& index) const {
  quint32 address = 0;
  if (wordAt(index, &address)) {
    return Qt::ItemIsEnabled | Qt::ItemIsSelectable;
  }
  return index.isValid() ? Qt::ItemIsEnabled : Qt::NoItemFlags;
}

QVariant EduDataModel::headerData(int section, Qt::Orientation orientation,
                                  int role) const {
  if (orientation != Qt::Horizontal) {
    return QVariant();
  }
  if (role == Qt::ToolTipRole) {
    switch (section) {
      case AddressColumn:
        return QString::fromUtf8(
            "The address the row starts at, always a multiple of 16\n"
            "그 줄이 시작하는 주소. 항상 16의 배수");
      case Word0Column:
      case Word1Column:
      case Word2Column:
      case Word3Column:
        return QString::fromUtf8(
            "The word this many bytes after the row's address\n"
            "줄의 주소에서 이만큼 떨어진 워드");
      case AsciiColumn:
        return QString::fromUtf8(
            "The same bytes read as characters; a dot is one that does not "
            "print\n같은 바이트를 글자로 읽은 것. 점은 출력할 수 없는 문자");
      case LabelColumn:
        return QString::fromUtf8(
            "Labels declared in the source at these addresses, and the "
            "registers pointing here\n소스에서 이 주소에 선언한 라벨과, "
            "여기를 가리키는 레지스터");
      default:
        return QVariant();
    }
  }
  if (role != Qt::DisplayRole) {
    return QVariant();
  }
  switch (section) {
    case AddressColumn: return QString("Address");
    case Word0Column:
    case Word1Column:
    case Word2Column:
    case Word3Column:
      return edu::lineOffsetName(4 * quint32(section - Word0Column));
    case AsciiColumn:   return QString("ASCII");
    case LabelColumn:   return QString("Labels");
    default:            return QVariant();
  }
}

QVariant EduDataModel::data(const QModelIndex& index, int role) const {
  const Row* row = rowAt(index.row());
  if (row == 0) {
    return QVariant();
  }
  const bool words = row->kind == WordsRow;
  const int column = index.column();
  const int slot = column - Word0Column;
  quint32 address = 0;
  const bool isWord = wordAt(index, &address);

  switch (role) {
    case RowKindRole:
      return int(row->kind);
    case AddressRole:
      return isWord ? QVariant(address) : QVariant();
    case PointerRole:
      return isWord ? pointerInto(address, address + 4) : -1;
    case FullRowTextRole:
      return words ? QVariant() : QVariant(fullRowText(*row));

    case Qt::DisplayRole:
      if (!words) {
        return column == LabelColumn && row->kind == ZeroRunRow
                   ? QVariant(row->labels)
                   : QVariant();
      }
      // The line's base, which is what +0 / +4 / +8 / +C count from; a line
      // that starts later (the first stack line) has empty cells in front.
      if (column == AddressColumn) return edu::hex32Digits(row->lineBase());
      if (column == AsciiColumn) {
        const int first = int(row->address - row->lineBase());
        return QString(first, QLatin1Char(' ')) +
               edu::asciiText(row->byte + first, int(row->end - row->address));
      }
      if (column == LabelColumn) return row->labels;
      return cellText(*row, slot);

    case Qt::ToolTipRole:
      if (isWord) {
        // What the inspector used to say about a word of memory is said
        // here instead, where the word is: its address, its value in
        // hexadecimal and in decimal, the names the source gave it and any
        // register pointing at it.
        WordInfo info;
        if (wordInfo(address, &info)) {
          QString tip = edu::hex32(address) + "\n" + edu::hex32(info.value) +
                        "  " + edu::signedDec32(info.value);
          const QString unsignedText = edu::unsignedDec32(info.value);
          if (unsignedText != edu::signedDec32(info.value)) {
            tip += QString::fromUtf8(" (unsigned ") + unsignedText + ")";
          }
          if (!info.labels.isEmpty()) {
            tip += "\n" + info.labels.join(", ");
          }
          if (!info.pointers.isEmpty()) {
            tip += QString::fromUtf8("\n<- ") + info.pointers.join(", ") +
                   QString::fromUtf8(
                       "\nA register points at this word / 레지스터가 "
                       "가리키는 워드");
          }
          return tip;
        }
      }
      if (row->kind == EnvironmentFold) {
        return QString::fromUtf8(
            "The environment strings the program was started with; click to "
            "unfold\n프로그램이 받은 환경변수 문자열. 눌러서 펼칩니다");
      }
      if (words && column == LabelColumn &&
          !index.data(Qt::DisplayRole).toString().trimmed().isEmpty()) {
        return QString::fromUtf8(
            "A name declared in your source, at this address\n"
            "소스에서 선언한 이름이 이 주소에 있습니다");
      }
      return QVariant();

    case Qt::TextAlignmentRole:
      return int(Qt::AlignLeft | Qt::AlignVCenter);

    case Qt::FontRole:
      if (row->kind == SegmentHeader) {
        QFont bold;
        bold.setBold(true);
        return bold;
      }
      return QVariant();

    // Colours: docs/design/tokens.md 1.3 and 5 ("Data").
    case Qt::ForegroundRole:
      if (row->kind == SegmentHeader) {
        return QColor(edu::theme::kNavy);
      }
      if (row->kind == ZeroRunRow || row->kind == EnvironmentFold ||
          (words && (column == AsciiColumn || column == AddressColumn))) {
        return QColor(edu::theme::kText2);
      }
      if (words && column == LabelColumn) {
        return QColor(edu::theme::kBlue);  // labels stand out from values
      }
      if (isWord && pointerInto(address, address + 4) >= 0) {
        return QColor(edu::theme::kTealText);  // the word $sp/$fp/$gp points to
      }
      return text_;

    case Qt::BackgroundRole:
      if (row->kind == SegmentHeader) {
        return QColor(edu::theme::kWindow);
      }
      if (row->kind == EnvironmentFold) {
        return QColor(edu::theme::kHover);
      }
      if (isWord && pointerInto(address, address + 4) >= 0) {
        return QColor(edu::theme::kTealTint);
      }
      return background_;

    default:
      return QVariant();
  }
}
