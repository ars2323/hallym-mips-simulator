/* See edu_instruction_inspector.h. */

#include "edu/edu_instruction_inspector.h"

#include <QFontMetrics>
#include <QPaintEvent>
#include <QPainter>
#include <QScrollArea>
#include <QVBoxLayout>
#include <QWidget>

#include "edu/core/edu_format.h"
#include "edu/core/edu_instruction_text.h"
#include "edu/core/edu_registers.h"
#include "edu/theme/edu_theme.h"
#include "edu/theme/tokens.h"

namespace {

using namespace edu::theme;

const int kMargin = 12;
const int kCellHeight = 24;
const int kCellWidthMax = 30;
const int kCellWidthMin = 13;
const int kEndLabel = 30;   // room for MSB / LSB beside the grid
const int kScrollBar = 16;  // always allowed for, see cellWidth()

// Six pairs, in the order the fields come: every one of them is a token
// pair that passes AA for text on its own tint (tokens.md 1.4).
struct FieldColours {
  QRgb tint;
  QRgb text;
};
const FieldColours kFieldColours[] = {
    {kBlueTint, kBlue},   {kTealTint, kTealText}, {kAmberTint, kAmberText},
    {kBlueTint2, kNavy},  {kCp0Tint, kCp0Text},   {kWindow, kText2},
};
const int kFieldColourCount =
    int(sizeof(kFieldColours) / sizeof(kFieldColours[0]));

QString binaryOf(quint32 value, int width) {
  QString bits;
  for (int i = width - 1; i >= 0; i -= 1) {
    bits += ((value >> i) & 1) ? '1' : '0';
  }
  return bits;
}

}  // namespace

// The drawing surface.  It is its own widget so that the dock can scroll it
// when the panel is shorter than the content.
class EduInstructionCanvas : public QWidget {
 public:
  explicit EduInstructionCanvas(EduInstructionInspector* owner)
      : QWidget(owner), owner_(owner) {
    setObjectName("EduInspectorCanvas");
    setAutoFillBackground(true);
    QPalette colours = palette();
    colours.setColor(QPalette::Window, QColor(kWhite));
    setPalette(colours);
  }

  QSize sizeHint() const { return QSize(420, contentHeight(420)); }
  QSize minimumSizeHint() const { return QSize(240, 120); }

 protected:
  void paintEvent(QPaintEvent* event);
  void resizeEvent(QResizeEvent*) {
    const int wanted = contentHeight(width());
    if (minimumHeight() != wanted) {
      setMinimumHeight(wanted);
    }
  }

 private:
  // How the grid is laid out at this width: one row of 32 or two of 16.
  // The scroll bar's width is always taken off, whether it is showing or
  // not: otherwise the bar appearing would change the fold, the fold would
  // change the height, and the height would put the bar away again.
  int cellWidth(int forWidth, bool* twoRows) const {
    const int usable = forWidth - 2 * kMargin - 2 * kEndLabel - kScrollBar;
    int cell = usable / 32;
    *twoRows = false;
    if (cell < kCellWidthMin) {
      cell = usable / 16;
      *twoRows = true;
    }
    return qBound(kCellWidthMin, cell, kCellWidthMax);
  }

  int contentHeight(int forWidth) const;

  EduInstructionInspector* owner_;
};

int EduInstructionCanvas::contentHeight(int forWidth) const {
  if (!owner_->hasInstruction()) {
    return 90;
  }
  bool twoRows = false;
  cellWidth(forWidth, &twoRows);
  const int header = kSpace4 + 22 + kSpace2 + 18;
  const int gridRows = twoRows ? 2 : 1;
  const int grid = kSpace3 + gridRows * (12 + kCellHeight + 14) + kSpace2;
  const int fields = owner_->fieldLines().size() * 20 + kSpace2;
  const int destination = owner_->destinationLine().isEmpty() ? 0 : 22;
  const int expansion =
      edu::mnemonicExpansion(owner_->decoded_.name).isEmpty() ? 0 : 18;
  return header + expansion + grid + fields + destination + kMargin;
}

void EduInstructionCanvas::paintEvent(QPaintEvent*) {
  QPainter painter(this);
  painter.setRenderHint(QPainter::Antialiasing, true);
  painter.fillRect(rect(), QColor(kWhite));

  QFont ui = uiFont();
  ui.setPixelSize(kUiPixelSize);
  QFont small = uiFont();
  small.setPixelSize(kUiPixelSize);
  small.setWeight(QFont::Medium);
  // One step smaller than the body, never half of it: the bit numbers are
  // what a student counts along, and the labels are read as often as the
  // values (P).
  QFont tiny = uiFont();
  tiny.setPixelSize(kFontSmall);
  tiny.setWeight(QFont::DemiBold);
  QFont code = owner_->codeFont_;
  code.setPixelSize(kUiPixelSize);
  QFont codeSmall = owner_->codeFont_;
  codeSmall.setPixelSize(kUiPixelSize);

  if (!owner_->hasInstruction()) {
    painter.setFont(ui);
    painter.setPen(QColor(kText));
    painter.drawText(rect().adjusted(kMargin, kMargin, -kMargin, -kMargin),
                     Qt::AlignCenter | Qt::TextWordWrap,
                     QString::fromUtf8(
                         "Text 패널에서 명령어를 고르면 여기에 비트가 "
                         "분해됩니다.\nSelect an instruction in the Text panel "
                         "to see its bits here."));
    return;
  }

  const edu::DecodedInstruction& d = owner_->decoded_;
  int y = kMargin;

  // 1. What instruction this is: its text, its format, where it lives and
  //    the word itself.
  painter.setFont(code);
  painter.setPen(QColor(kNavy));
  const QString title = owner_->disassembly_.trimmed();
  const QFontMetrics codeMetrics(code);
  const int titleWidth =
      qMin(codeMetrics.horizontalAdvance(title), width() - 2 * kMargin - 60);
  painter.drawText(QRect(kMargin, y, titleWidth, 20),
                   Qt::AlignLeft | Qt::AlignVCenter,
                   codeMetrics.elidedText(title, Qt::ElideRight, titleWidth));

  const QString badge = edu::formatName(d.format);
  QRgb badgeTint = kBlueTint;
  QRgb badgeText = kBlue;
  for (unsigned i = 0; i < sizeof(kBadges) / sizeof(kBadges[0]); i += 1) {
    if (badge == QLatin1String(kBadges[i].type)) {
      badgeTint = kBadges[i].background;
      badgeText = kBadges[i].text;
      break;
    }
  }
  const QFontMetrics smallMetrics(small);
  const int badgeWidth = smallMetrics.horizontalAdvance(badge) + 14;
  const QRect badgeRect(kMargin + titleWidth + kSpace2, y + 1, badgeWidth, 18);
  painter.setBrush(QColor(badgeTint));
  painter.setPen(Qt::NoPen);
  painter.drawRoundedRect(badgeRect, 4, 4);
  painter.setPen(QColor(badgeText));
  painter.setFont(small);
  painter.drawText(badgeRect, Qt::AlignCenter, badge);
  y += 22;

  painter.setFont(codeSmall);
  painter.setPen(QColor(kText));
  painter.drawText(kMargin, y + 12,
                   edu::hex32(owner_->address_) + "   " + edu::hex32(d.word));
  y += 18;

  // What the letters of the mnemonic stand for, for the instructions whose
  // names are abbreviations.
  const QString expansion = edu::mnemonicExpansion(d.name);
  if (!expansion.isEmpty()) {
    painter.setFont(small);
    painter.setPen(QColor(kNavy));
    painter.drawText(QRect(kMargin, y, width() - 2 * kMargin, 16),
                     Qt::AlignLeft | Qt::AlignVCenter, expansion);
    y += 18;
  }
  y += kSpace3;

  // 2. The word, as boxes: one group per field, MSB on the left.
  bool twoRows = false;
  const int cell = cellWidth(width(), &twoRows);
  const int rows = twoRows ? 2 : 1;
  const int perRow = twoRows ? 16 : 32;
  const int gridWidth = perRow * cell;
  const int left = kMargin + kEndLabel;

  for (int row = 0; row < rows; row += 1) {
    const int top = y + row * (12 + kCellHeight + 14) + 12;
    const int highBit = 31 - row * perRow;

    // MSB / LSB, so that which end is which is never a guess.
    painter.setFont(tiny);
    painter.setPen(QColor(kText));
    if (row == 0) {
      painter.drawText(QRect(kMargin, top, kEndLabel - 4, kCellHeight),
                       Qt::AlignRight | Qt::AlignVCenter, "MSB");
    }
    if (row == rows - 1) {
      painter.drawText(QRect(left + gridWidth + 4, top, kEndLabel, kCellHeight),
                       Qt::AlignLeft | Qt::AlignVCenter, "LSB");
    }

    for (int i = 0; i < perRow; i += 1) {
      const int bit = highBit - i;
      const QRect box(left + i * cell, top, cell, kCellHeight);

      // Which field owns this bit decides the colour.
      int fieldIndex = -1;
      for (int f = 0; f < d.fields.size(); f += 1) {
        if (bit <= d.fields.at(f).high && bit >= d.fields.at(f).low) {
          fieldIndex = f;
          break;
        }
      }
      const FieldColours colour =
          kFieldColours[fieldIndex < 0 ? kFieldColourCount - 1
                                       : fieldIndex % kFieldColourCount];
      painter.setPen(Qt::NoPen);
      painter.setBrush(QColor(colour.tint));
      painter.drawRect(box);

      painter.setFont(codeSmall);
      painter.setPen(QColor(colour.text));
      painter.drawText(box, Qt::AlignCenter,
                       ((d.word >> bit) & 1) ? "1" : "0");

      // The bit's number above it, as often as there is room for it.
      const bool everyFourth = cell < 20;
      if (!everyFourth || bit % 4 == 0) {
        painter.setFont(tiny);
        painter.setPen(QColor(kText));
        painter.drawText(QRect(box.x(), top - 12, cell, 11), Qt::AlignCenter,
                         QString::number(bit));
      }
    }

    // The lines between fields, and each field's name under its group.
    painter.setFont(tiny);
    for (int f = 0; f < d.fields.size(); f += 1) {
      const edu::InstructionField& field = d.fields.at(f);
      if (field.high < highBit - perRow + 1 || field.low > highBit) {
        continue;  // not on this row
      }
      const int high = qMin(field.high, highBit);
      const int low = qMax(field.low, highBit - perRow + 1);
      const QRect group(left + (highBit - high) * cell, top,
                        (high - low + 1) * cell, kCellHeight);
      painter.setBrush(Qt::NoBrush);
      painter.setPen(QColor(kBorder));
      painter.drawRect(group);
      painter.setPen(QColor(kText));
      const QString name = field.name;
      if (smallMetrics.horizontalAdvance(name) < group.width()) {
        painter.drawText(QRect(group.x(), group.bottom() + 1, group.width(), 12),
                         Qt::AlignCenter, name);
      }
    }
  }
  y += rows * (12 + kCellHeight + 14) + kSpace2;

  // 3. One line per field: what it is called, which bits it is, what it
  //    holds and what that means.
  const QList<EduInstructionInspector::FieldLine> lines = owner_->fieldLines();
  const int nameWidth = 64;
  const int rangeWidth = 52;
  const int bitsWidth = 124;  // sixteen binary digits, in the code font
  const int valueWidth = 54;
  for (int i = 0; i < lines.size(); i += 1) {
    const EduInstructionInspector::FieldLine& line = lines.at(i);
    const FieldColours colour = kFieldColours[i % kFieldColourCount];
    const QRect swatch(kMargin, y + 5, 8, 8);
    painter.setPen(Qt::NoPen);
    painter.setBrush(QColor(colour.text));
    painter.drawRoundedRect(swatch, 2, 2);

    int x = kMargin + 14;
    painter.setFont(small);
    painter.setPen(QColor(kText));
    painter.drawText(QRect(x, y, nameWidth, 18), Qt::AlignLeft | Qt::AlignVCenter,
                     line.name);
    x += nameWidth;
    painter.setPen(QColor(kText));
    painter.drawText(QRect(x, y, rangeWidth, 18),
                     Qt::AlignLeft | Qt::AlignVCenter, line.range);
    x += rangeWidth;
    painter.setFont(codeSmall);
    painter.setPen(QColor(colour.text));
    painter.drawText(QRect(x, y, bitsWidth, 18),
                     Qt::AlignLeft | Qt::AlignVCenter, line.bits);
    x += bitsWidth;
    painter.setPen(QColor(kText));
    painter.drawText(QRect(x, y, valueWidth, 18),
                     Qt::AlignRight | Qt::AlignVCenter, line.value);
    x += valueWidth + kSpace2;
    painter.setFont(small);
    painter.setPen(QColor(kText));
    const QFontMetrics metrics(small);
    const int room = width() - kMargin - x;
    if (room > 20) {
      painter.drawText(QRect(x, y, room, 18), Qt::AlignLeft | Qt::AlignVCenter,
                       metrics.elidedText(line.meaning, Qt::ElideRight, room));
    }
    y += 20;
  }

  // 4. Where a branch or a jump goes, and the sum that says so.
  const QString destination = owner_->destinationLine();
  if (!destination.isEmpty()) {
    y += kSpace1;
    painter.setFont(codeSmall);
    painter.setPen(QColor(kBlue));
    painter.drawText(QRect(kMargin, y, width() - 2 * kMargin, 18),
                     Qt::AlignLeft | Qt::AlignVCenter, destination);
    y += 22;
  }
}

//
// The dock
//

EduInstructionInspector::EduInstructionInspector(QWidget* parent)
    : QDockWidget(parent),
      canvas_(0),
      hasInstruction_(false),
      address_(0),
      convention_(edu::SpimNoDelaySlot),
      codeFont_(codeFont()) {
  setObjectName("InspectorDockWidget");  // saved layouts, and the harness
  setWindowTitle("Instruction Inspector");
  setFeatures(QDockWidget::DockWidgetClosable | QDockWidget::DockWidgetMovable |
              QDockWidget::DockWidgetFloatable);

  EduInstructionCanvas* canvas = new EduInstructionCanvas(this);
  canvas_ = canvas;
  QScrollArea* area = new QScrollArea(this);
  area->setObjectName("EduInspectorScroll");
  area->setWidget(canvas);
  area->setWidgetResizable(true);
  area->setFrameShape(QFrame::NoFrame);
  setWidget(area);
}

void EduInstructionInspector::showInstruction(
    const edu::DecodedInstruction& decoded, quint32 address,
    const QString& disassembly, const QString& destinationLabel,
    edu::BranchConvention convention) {
  hasInstruction_ = true;
  decoded_ = decoded;
  address_ = address;
  disassembly_ = disassembly;
  destinationLabel_ = destinationLabel;
  convention_ = convention;
  canvas_->updateGeometry();
  canvas_->update();
}

void EduInstructionInspector::showNothing() {
  hasInstruction_ = false;
  disassembly_.clear();
  destinationLabel_.clear();
  canvas_->updateGeometry();
  canvas_->update();
}

void EduInstructionInspector::setPanelFont(const QFont& font) {
  codeFont_ = font;
  canvas_->update();
}

QList<EduInstructionInspector::FieldLine> EduInstructionInspector::fieldLines()
    const {
  QList<FieldLine> lines;
  if (!hasInstruction_) {
    return lines;
  }
  for (int i = 0; i < decoded_.fields.size(); i += 1) {
    const edu::InstructionField& field = decoded_.fields.at(i);
    FieldLine line;
    line.name = field.name;
    line.range = field.width() == 1
                     ? QString::number(field.high)
                     : QString::number(field.high) + "-" +
                           QString::number(field.low);
    line.bits = binaryOf(field.value, field.width());
    line.value = QString::number(field.value);

    // What the number is for.  Registers are named, the two ends of an
    // R-type say which instruction they pick, and the rest say what they
    // are counted in.
    const QString name = field.name;
    if (name == "rs" || name == "rt" || name == "rd") {
      line.meaning = edu::generalRegisterName(int(field.value));
    } else if (name == "opcode") {
      line.meaning = decoded_.known && decoded_.format != edu::DecodedInstruction::R
                         ? decoded_.name
                         : QString("SPECIAL");
      if (decoded_.format == edu::DecodedInstruction::J) {
        line.meaning = decoded_.name;
      }
    } else if (name == "funct") {
      line.meaning = decoded_.known ? decoded_.name : QString();
    } else if (name == "shamt") {
      line.meaning = field.value == 0
                         ? QString()
                         : QString("shift by %1").arg(field.value);
    } else if (name == "immediate") {
      line.meaning = QString::number(decoded_.simm) + " (signed)";
    } else if (name == "target") {
      line.meaning = edu::hex32((address_ & 0xf0000000u) | (decoded_.target << 2));
    } else if (name == "ft" || name == "fs" || name == "fd") {
      line.meaning = "$f" + QString::number(field.value);
    }
    lines << line;
  }
  return lines;
}

QString EduInstructionInspector::destinationLine() const {
  if (!hasInstruction_ || !decoded_.hasDestination) {
    return QString();
  }
  const QString where = edu::hex32(decoded_.destination) +
                        (destinationLabel_.isEmpty()
                             ? QString()
                             : " [" + destinationLabel_ + "]");
  if (decoded_.kind == edu::DecodedInstruction::Branch) {
    const QString base = convention_ == edu::MipsDelaySlot ? "PC + 4" : "PC";
    return QString("Dest = %1 + (%2 x 4) = %3")
        .arg(base)
        .arg(decoded_.simm)
        .arg(where);
  }
  return QString("Dest = (PC & 0xf0000000) | (target x 4) = %1").arg(where);
}

QString EduInstructionInspector::text() const {
  if (!hasInstruction_) {
    return QString("no instruction selected");
  }
  QStringList out;
  out << disassembly_.trimmed() + "  " + edu::formatName(decoded_.format) +
             "-type";
  out << edu::hex32(address_) + "  " + edu::hex32(decoded_.word);
  const QString expansion = edu::mnemonicExpansion(decoded_.name);
  if (!expansion.isEmpty()) {
    out << expansion;
  }
  const QList<FieldLine> lines = fieldLines();
  for (int i = 0; i < lines.size(); i += 1) {
    QString line = lines.at(i).name + " " + lines.at(i).range + " " +
                   lines.at(i).bits + " = " + lines.at(i).value;
    if (!lines.at(i).meaning.isEmpty()) {
      line += "  " + lines.at(i).meaning;
    }
    out << line;
  }
  const QString destination = destinationLine();
  if (!destination.isEmpty()) {
    out << destination;
  }
  return out.join("\n");
}
