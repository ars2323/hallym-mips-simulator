/* See edu_text_model.h. */

#include "edu/edu_text_model.h"

#include "edu/theme/tokens.h"

#include "edu/core/edu_decoder.h"
#include "edu/core/edu_format.h"
#include "edu/core/edu_source_text.h"
#include "spimview.h"  // the core's headers (they have no include guards)

namespace {

// The core's line for one instruction (ARCHITECTURE 3.5):
//   "[0x00400000]\t0x8fa40000  lw $4, 0($29)      ; 183: lw $a0 0($sp)\n"
// with a leading '*' when a breakpoint sits on the address.  Returns the
// part between the word and the comment.
QString disassemblyOf(const char* line, const char* source) {
  QByteArray text(line);
  if (text.startsWith('*')) {
    text.remove(0, 1);
  }
  while (text.endsWith('\n')) {
    text.chop(1);
  }
  if (source != NULL) {
    // The comment is "; " + SOURCE(inst) at the end; cut by length, so a
    // ';' inside the disassembly or the source cannot confuse it.
    const int tail = 2 + int(qstrlen(source));
    if (text.size() >= tail) {
      text.chop(tail);
    }
  }
  const int tab = text.indexOf('\t');
  if (tab >= 0) {
    text.remove(0, tab + 1);
  }
  if (text.startsWith("0x") && text.size() >= 12) {
    text.remove(0, 12);  // "0x8fa40000  "
  }
  return QString::fromLatin1(text).trimmed();
}

}  // namespace

EduTextModel::EduTextModel(QObject* parent)
    : QAbstractTableModel(parent),
      pc_(0),
      showUser_(true),
      showKernel_(true),
      kernelExpanded_(false),
      kernelInstructions_(0),
      text_(Qt::black),
      background_(Qt::white) {}

void EduTextModel::appendSegment(RowKind header, quint32 from, quint32 to,
                                 bool expanded) {
  Row head;
  head.kind = header;
  head.address = from;
  head.word = to;  // a header row keeps the segment's end here
  head.known = false;
  head.startsSourceLine = false;
  head.band = 0;
  rows_.append(head);

  str_stream ss;
  ss_init(&ss);
  int count = 0;
  int firstOfLine = -1;  // row of the instruction that carries the source
  int band = 1;

  for (mem_addr a = from; a < to; a += 4) {
    instruction* inst = read_mem_inst(a);
    if (inst == NULL) {
      continue;
    }
    count += 1;
    if (!expanded) {
      continue;
    }

    // A breakpoint replaces the instruction in memory.  The core's
    // format_an_inst() looks underneath in the same way.
    const bool breakpoint = inst_is_breakpoint(a);
    if (breakpoint) {
      delete_breakpoint(a);
      inst = read_mem_inst(a);
    }

    Row row;
    row.kind = InstructionRow;
    row.address = a;
    row.word = quint32(ENCODING(inst));
    row.startsSourceLine = SOURCE(inst) != NULL;
    row.band = 0;
    format_an_inst(&ss, inst, a);
    row.disassembly = disassemblyOf(ss_to_string(&ss), SOURCE(inst));
    ss_clear(&ss);
    row.known = !row.disassembly.startsWith('<');
    if (row.startsSourceLine) {
      row.source = edu::decodeSourceBytes(QByteArray(SOURCE(inst)));
    }
    if (EXPR(inst) != NULL && EXPR(inst)->symbol != NULL) {
      // Only the name: for a branch the expression's offset is "-pc", an
      // artefact of how the core resolves labels (sym-tbl.cpp), not part of
      // what the programmer wrote.  A label that was never defined leaves
      // the field at 0, and the inspector should say so.
      label* symbol = EXPR(inst)->symbol;
      row.label = QString::fromLatin1(symbol->name);
      if (!SYMBOL_IS_DEFINED(symbol)) {
        row.label += QString(": undefined");
      }
    }

    if (breakpoint) {
      add_breakpoint(a);
    }

    // Pseudo expansion: the first instruction of a source line carries
    // SOURCE, the rest of its expansion does not (ARCHITECTURE 3.4).  Lines
    // that became several instructions get a band; neighbours alternate.
    if (row.startsSourceLine || firstOfLine < 0) {
      firstOfLine = rows_.size();
    } else {
      if (rows_[firstOfLine].band == 0) {
        rows_[firstOfLine].band = band;
        band = 3 - band;
      }
      row.band = rows_[firstOfLine].band;
    }

    rowOfAddress_.insert(a, rows_.size());
    rows_.append(row);
  }

  if (header == KernelHeader) {
    kernelInstructions_ = count;
  }
}

void EduTextModel::rebuild(bool showUser, bool showKernel) {
  beginResetModel();
  showUser_ = showUser;
  showKernel_ = showKernel;
  rows_.clear();
  rowOfAddress_.clear();
  kernelInstructions_ = 0;
  if (showUser_) {
    appendSegment(UserHeader, TEXT_BOT, text_top, true);
  }
  if (showKernel_) {
    appendSegment(KernelHeader, K_TEXT_BOT, k_text_top, kernelExpanded_);
  }
  endResetModel();
}

void EduTextModel::setKernelExpanded(bool expanded) {
  if (expanded != kernelExpanded_) {
    kernelExpanded_ = expanded;
    rebuild(showUser_, showKernel_);
  }
}

int EduTextModel::setCurrentPc(quint32 pc) {
  const int before = rowOfAddress(pc_);
  pc_ = pc;
  if (showKernel_ && !kernelExpanded_ && pc >= K_TEXT_BOT && pc < k_text_top) {
    setKernelExpanded(true);  // resets the model; nothing more to repaint
    return rowOfAddress(pc_);
  }
  const int after = rowOfAddress(pc_);
  if (before != after) {
    // Cell by cell.  QAbstractItemView repaints the WHOLE viewport for a
    // dataChanged that spans more than one cell (qabstractitemview.cpp,
    // dataChanged: only topLeft == bottomRight takes the narrow path), so
    // saying "this row changed" in one signal made every step repaint the
    // whole Text panel -- the flicker of BB.
    markRowChanged(before);
    markRowChanged(after);
  }
  return after;
}

// One signal per cell: see setCurrentPc().
void EduTextModel::markRowChanged(int row) {
  if (row < 0 || row >= rows_.size()) {
    return;
  }
  for (int column = 0; column < ColumnCount; column += 1) {
    emit dataChanged(index(row, column), index(row, column));
  }
}

int EduTextModel::rowOfAddress(quint32 address) const {
  return rowOfAddress_.value(address, -1);
}

const EduTextModel::Row* EduTextModel::rowAt(int row) const {
  return (row >= 0 && row < rows_.size()) ? &rows_.at(row) : 0;
}

QList<int> EduTextModel::headerRows() const {
  QList<int> result;
  for (int i = 0; i < rows_.size(); i += 1) {
    if (rows_.at(i).kind != InstructionRow) {
      result << i;
    }
    if (result.size() == 2) {
      break;
    }
  }
  return result;
}

void EduTextModel::breakpointChanged(quint32 address) {
  const int row = rowOfAddress(address);
  if (row >= 0) {
    emit dataChanged(index(row, BpColumn), index(row, BpColumn));
  }
}

void EduTextModel::setColors(const QColor& text, const QColor& background) {
  if (text != text_ || background != background_) {
    text_ = text;
    background_ = background;
    if (!rows_.isEmpty()) {
      emit dataChanged(index(0, 0), index(rows_.size() - 1, ColumnCount - 1));
    }
  }
}

QString EduTextModel::headerText(const Row& row) const {
  const QString range = QString("[") + edu::hex32Digits(row.address) +
                        QString("]..[") + edu::hex32Digits(row.word) +
                        QString("]");
  if (row.kind == UserHeader) {
    return QString("User Text Segment ") + range;
  }
  return QString::fromUtf8(kernelExpanded_ ? "▾ " : "▸ ") +
         QString("Kernel Text Segment ") + range +
         (kernelInstructions_ == 0
              ? QString("   (empty)")
              : QString("   (%1 instructions, click to %2)")
                    .arg(kernelInstructions_)
                    .arg(QString(kernelExpanded_ ? "collapse" : "expand")));
}

QString EduTextModel::rowText(int rowNumber) const {
  const Row* row = rowAt(rowNumber);
  if (row == 0) {
    return QString();
  }
  if (row->kind != InstructionRow) {
    return headerText(*row);
  }
  QString text = QString("[") + edu::hex32Digits(row->address) + QString("] ") +
                 edu::hex32Digits(row->word) + QString("  ") + row->disassembly;
  if (!row->source.isEmpty()) {
    text = text.leftJustified(47, ' ') + QString("; ") + row->source;
  }
  return text;
}

int EduTextModel::rowCount(const QModelIndex& parent) const {
  return parent.isValid() ? 0 : rows_.size();
}

int EduTextModel::columnCount(const QModelIndex& parent) const {
  return parent.isValid() ? 0 : int(ColumnCount);
}

Qt::ItemFlags EduTextModel::flags(const QModelIndex& index) const {
  return index.isValid() ? (Qt::ItemIsEnabled | Qt::ItemIsSelectable)
                         : Qt::NoItemFlags;
}

QVariant EduTextModel::headerData(int section, Qt::Orientation orientation,
                                  int role) const {
  if (orientation != Qt::Horizontal) {
    return QVariant();
  }
  if (role == Qt::ToolTipRole) {
    switch (section) {
      case BpColumn:
        return QString::fromUtf8(
            "Click to set or clear a breakpoint on that instruction\n"
            "눌러서 그 명령에 브레이크포인트를 걸거나 해제");
      case AddressColumn:
        return QString::fromUtf8("Where the instruction is in memory\n"
                                 "명령어가 놓인 메모리 주소");
      case CodeColumn:
        return QString::fromUtf8("The 32-bit machine word, in hexadecimal\n"
                                 "32비트 기계어를 16진수로");
      case TypeColumn:
        return QString::fromUtf8(
            "The instruction format: R, I, J, FR, FI or CP0\n"
            "명령어 형식: R, I, J, FR, FI, CP0");
      case InstructionColumn:
        return QString::fromUtf8(
            "What the machine word means, as the simulator reads it\n"
            "시뮬레이터가 읽은 기계어의 뜻");
      case SourceColumn:
        return QString::fromUtf8("The line of your file it came from\n"
                                 "이 명령이 나온 소스 줄");
      default:
        return QVariant();
    }
  }
  if (role != Qt::DisplayRole) {
    return QVariant();
  }
  switch (section) {
    case BpColumn:          return QString("BP");
    case AddressColumn:     return QString("Address");
    case CodeColumn:        return QString("Code");
    case TypeColumn:        return QString("Type");
    case InstructionColumn: return QString("Instruction");
    case SourceColumn:      return QString("Source");
    default:                return QVariant();
  }
}

QVariant EduTextModel::data(const QModelIndex& index, int role) const {
  const Row* row = rowAt(index.row());
  if (row == 0) {
    return QVariant();
  }
  const bool header = row->kind != InstructionRow;
  const bool isPc = !header && row->address == pc_;

  switch (role) {
    case RowKindRole:
      return int(row->kind);
    case IsPcRole:
      return isPc;
    case BreakpointRole:
      return !header && inst_is_breakpoint(row->address);

    case BandStartRole:
      return !header && row->band != 0 && row->startsSourceLine;

    case Qt::DisplayRole:
      if (header) {
        return index.column() == 0 ? headerText(*row) : QVariant();
      }
      switch (index.column()) {
        case AddressColumn:     return edu::hex32Digits(row->address);
        case CodeColumn:        return edu::hex32Digits(row->word);
        case TypeColumn:        return edu::formatName(edu::formatOf(row->word));
        case InstructionColumn: return row->disassembly;
        case SourceColumn:      return row->source;
        default:                return QVariant();
      }

    // Weight only on the segment header rows, which span the table and
    // line up with nothing.  The instruction column used to be bold too,
    // and on Windows a faked bold in a fixed-pitch font is wider than the
    // real one, which pushed the source column about (E).
    case Qt::FontRole:
      if (header) {
        QFont bold;  // resolved against the view's font by the delegate
        bold.setBold(true);
        return bold;
      }
      return QVariant();

    case Qt::TextAlignmentRole:
      if (!header && index.column() == TypeColumn) {
        return int(Qt::AlignCenter);
      }
      return int(Qt::AlignLeft | Qt::AlignVCenter);

    // Colours: docs/design/tokens.md 1.3.  The PC row and the pseudo bands
    // are token colours whatever the Text window's settings colours are.
    case Qt::ForegroundRole:
      if (isPc || header) {
        return QColor(edu::theme::kNavy);
      }
      if (index.column() == SourceColumn) {
        return QColor(edu::theme::kText2);
      }
      return text_;

    case Qt::BackgroundRole:
      if (isPc) {
        return QColor(edu::theme::kBlueTint);
      }
      if (header || row->band != 0) {
        return QColor(edu::theme::kWindow);
      }
      return background_;

    case Qt::ToolTipRole:
      if (!header && index.column() == TypeColumn) {
        const QString type = edu::formatName(edu::formatOf(row->word));
        QString meaning;
        if (type == "R") {
          meaning = QString::fromUtf8(
              "R: register to register; the fields are rd, shamt and funct\n"
              "R 형식: 레지스터끼리. 필드는 rd·shamt·funct");
        } else if (type == "I") {
          meaning = QString::fromUtf8(
              "I: a 16-bit constant is packed into the word\n"
              "I 형식: 16비트 상수가 명령어 안에 들어간다");
        } else if (type == "J") {
          meaning = QString::fromUtf8("J: a jump, with a 26-bit target\n"
                                      "J 형식: 26비트 목적지를 가진 점프");
        } else if (type == "FR" || type == "FI") {
          meaning = QString::fromUtf8(
              "Floating point (coprocessor 1)\n부동소수점 (코프로세서 1)");
        } else {
          meaning = QString::fromUtf8("Coprocessor 0: the system registers\n"
                                      "코프로세서 0: 시스템 레지스터");
        }
        return meaning;
      }
      if (!header && row->band != 0) {
        int first = index.row();
        while (first > 0 && !rows_.at(first).startsSourceLine &&
               rows_.at(first - 1).kind == InstructionRow) {
          first -= 1;
        }
        return QString("Expanded from source line ") + rows_.at(first).source;
      }
      return QVariant();

    default:
      return QVariant();
  }
}
