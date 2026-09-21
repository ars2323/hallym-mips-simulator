/* See edu_inspector.h. */

#include "edu/edu_inspector.h"

#include <QFontDatabase>
#include <QFontInfo>
#include <QFontMetrics>
#include <QPlainTextEdit>

#include "edu/core/edu_format.h"

EduInspector::EduInspector(QWidget* parent)
    : QDockWidget("Inspector", parent), view_(new QPlainTextEdit(this)) {
  setObjectName("InspectorDockWidget");  // saveState()/restoreState() key
  setAllowedAreas(Qt::LeftDockWidgetArea | Qt::TopDockWidgetArea |
                  Qt::BottomDockWidgetArea);

  view_->setReadOnly(true);
  view_->setUndoRedoEnabled(false);
  view_->setLineWrapMode(QPlainTextEdit::NoWrap);
  view_->setVerticalScrollBarPolicy(Qt::ScrollBarAlwaysOff);
  view_->setHorizontalScrollBarPolicy(Qt::ScrollBarAlwaysOff);
  view_->setSizePolicy(QSizePolicy::Preferred, QSizePolicy::Fixed);
  setPanelFont(QFontDatabase::systemFont(QFontDatabase::FixedFont));
  setWidget(view_);

  showNothing();
}

// The bit ruler only lines up with the bits in a fixed-pitch font.  The
// Register window font from the settings is normally one ("Courier"), but
// that is a request, not a guarantee: if the system resolves it to a
// proportional face, the system's fixed font is used at the same size.
static QFont fixedPitchVersionOf(const QFont& requested) {
  QFont font = requested;
  font.setStyleHint(QFont::TypeWriter);
  font.setFixedPitch(true);
  if (QFontInfo(font).fixedPitch()) {
    return font;
  }
  QFont fallback = QFontDatabase::systemFont(QFontDatabase::FixedFont);
  fallback.setPointSizeF(requested.pointSizeF());
  return fallback;
}

void EduInspector::setPanelFont(const QFont& font) {
  view_->setFont(fixedPitchVersionOf(font));
  const QFontMetrics metrics = view_->fontMetrics();
  const int chrome = 2 * view_->frameWidth() +
                     int(2 * view_->document()->documentMargin());

  // Wide enough for the longest line (heading, about 40 characters) so that
  // no horizontal scroll bar ever takes a line of the fixed height.
  view_->setMinimumWidth(
      metrics.horizontalAdvance(QString(42, QLatin1Char('0'))) + chrome + 8);

  // Exactly as tall as its content (kLines lines): the inspector never needs
  // more, and every pixel it does not take goes to the register list above.
  // A text line is height() tall; lineSpacing() adds the leading, which is
  // negative for some fonts (Nimbus Mono: -2) and would clip the last line.
  view_->setFixedHeight(
      kLines * qMax(metrics.height(), metrics.lineSpacing()) + chrome + 2);
}

QString EduInspector::text() const { return view_->toPlainText(); }

void EduInspector::showNothing() {
  view_->setPlainText("Select a register to see its value\n"
                      "in hex, decimal and binary.");
}

QString EduInspector::registerText(const edu::RegisterRef& reg, quint32 value,
                                   bool changed, const QString& groupTitle) {
  QStringList heading;
  heading << edu::registerName(reg);
  const QString number = edu::registerNumberLabel(reg);
  if (!number.isEmpty()) {
    heading << number;
  }
  if (!groupTitle.isEmpty()) {
    heading << groupTitle;
  }

  if (changed) {
    heading << "changed";  // by the last run command
  }

  // Six lines, no blanks: every line here is a row the register list above
  // does not get (see kLines).
  QStringList lines;
  lines << heading.join(" | ");
  lines << QString("Hex       ") + edu::hex32(value);
  lines << QString("Signed    ") + edu::signedDec32(value);
  lines << QString("Unsigned  ") + edu::unsignedDec32(value);
  // The ruler and the bits start at the left edge: at 39 characters they
  // set the width of the whole dock, and an indent would widen it further.
  lines << edu::bitRuler32();
  lines << edu::bin32Grouped(value);
  return lines.join("\n");
}

void EduInspector::showRegister(const edu::RegisterRef& reg, quint32 value,
                                bool changed, const QString& groupTitle) {
  view_->setPlainText(registerText(reg, value, changed, groupTitle));
}
