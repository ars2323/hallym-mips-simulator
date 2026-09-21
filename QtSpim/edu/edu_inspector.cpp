/* See edu_inspector.h. */

#include "edu/edu_inspector.h"

#include <QFontDatabase>
#include <QPlainTextEdit>

#include "edu/core/edu_format.h"

EduInspector::EduInspector(QWidget* parent)
    : QDockWidget("Inspector", parent), view_(new QPlainTextEdit(this)) {
  setObjectName("InspectorDockWidget");  // saveState()/restoreState() key
  setAllowedAreas(Qt::TopDockWidgetArea | Qt::BottomDockWidgetArea);

  view_->setReadOnly(true);
  view_->setUndoRedoEnabled(false);
  view_->setLineWrapMode(QPlainTextEdit::NoWrap);
  view_->setMinimumHeight(150);
  setPanelFont(QFontDatabase::systemFont(QFontDatabase::FixedFont));
  setWidget(view_);

  showNothing();
}

void EduInspector::setPanelFont(const QFont& font) {
  view_->setFont(font);
  // Wide enough for the 39-character binary line without a scroll bar.
  const int textWidth =
      view_->fontMetrics().horizontalAdvance(QString(39, QLatin1Char('0')));
  view_->setMinimumWidth(textWidth + 2 * view_->frameWidth() +
                         int(2 * view_->document()->documentMargin()) + 8);
}

QString EduInspector::text() const { return view_->toPlainText(); }

void EduInspector::showNothing() {
  view_->setPlainText("Select a register to see its value in hex, decimal "
                      "and binary.");
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

  QStringList lines;
  lines << heading.join("  |  ");
  lines << (changed ? QString("changed by the last run command") : QString());
  lines << QString("Hex       ") + edu::hex32(value);
  lines << QString("Signed    ") + edu::signedDec32(value);
  lines << QString("Unsigned  ") + edu::unsignedDec32(value);
  lines << QString();
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
