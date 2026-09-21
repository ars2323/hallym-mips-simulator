/* See edu_inspector.h. */

#include "edu/edu_inspector.h"

#include <QAbstractTextDocumentLayout>
#include <QApplication>
#include <QEvent>
#include <QFontDatabase>
#include <QFontInfo>
#include <QFontMetrics>
#include <QFrame>
#include <QLabel>
#include <QPlainTextEdit>
#include <QTextBlock>
#include <QVBoxLayout>

#include "edu/core/edu_format.h"
#include "edu/core/edu_instruction_text.h"

EduInspector::EduInspector(QWidget* parent)
    : QDockWidget("Inspector", parent),
      body_(new QFrame(this)),
      view_(new QPlainTextEdit(body_)),
      note_(new QLabel(body_)),
      shownLines_(kMinLines) {
  setObjectName("InspectorDockWidget");  // saveState()/restoreState() key
  setAllowedAreas(Qt::LeftDockWidgetArea | Qt::TopDockWidgetArea |
                  Qt::BottomDockWidgetArea);

  view_->setReadOnly(true);
  view_->setUndoRedoEnabled(false);
  // Register and instruction tables are narrower than the dock and never
  // wrap; a branch's destination line and note do.
  view_->setLineWrapMode(QPlainTextEdit::WidgetWidth);
  view_->setWordWrapMode(QTextOption::WordWrap);
  view_->setVerticalScrollBarPolicy(Qt::ScrollBarAlwaysOff);
  view_->setHorizontalScrollBarPolicy(Qt::ScrollBarAlwaysOff);
  view_->setSizePolicy(QSizePolicy::Preferred, QSizePolicy::Fixed);
  view_->setFrameStyle(QFrame::NoFrame);  // body_ draws the one frame

  // Prose (the branch note) reads badly in a fixed-pitch face at 44
  // columns; it gets the application's proportional font and wraps at
  // words.
  note_->setWordWrap(true);
  note_->setTextFormat(Qt::PlainText);
  note_->setAlignment(Qt::AlignLeft | Qt::AlignTop);
  note_->setTextInteractionFlags(Qt::TextSelectableByMouse);
  note_->setContentsMargins(4, 0, 4, 3);
  note_->hide();

  body_->setFrameStyle(QFrame::StyledPanel | QFrame::Sunken);
  body_->setAutoFillBackground(true);
  body_->setBackgroundRole(QPalette::Base);
  body_->setSizePolicy(QSizePolicy::Preferred, QSizePolicy::Fixed);
  QVBoxLayout* layout = new QVBoxLayout(body_);
  layout->setContentsMargins(0, 0, 0, 0);
  layout->setSpacing(0);
  layout->addWidget(view_);
  layout->addWidget(note_);
  body_->installEventFilter(this);  // a new width re-wraps the note

  setPanelFont(QFontDatabase::systemFont(QFontDatabase::FixedFont));
  setWidget(body_);
  connect(view_->document()->documentLayout(),
          SIGNAL(documentSizeChanged(QSizeF)), this, SLOT(fitHeight()));

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

bool EduInspector::eventFilter(QObject* watched, QEvent* event) {
  if (watched == body_ && event->type() == QEvent::Resize) {
    fitHeight();
  }
  return QDockWidget::eventFilter(watched, event);
}

void EduInspector::setPanelFont(const QFont& font) {
  view_->setFont(fixedPitchVersionOf(font));
  QFont prose = QApplication::font();
  prose.setPointSizeF(font.pointSizeF() > 0 ? font.pointSizeF()
                                            : prose.pointSizeF());
  note_->setFont(prose);
  const QFontMetrics metrics = view_->fontMetrics();
  const int chrome = 2 * view_->frameWidth() +
                     int(2 * view_->document()->documentMargin());

  // Wide enough for the widest table row, so that those never wrap.
  view_->setMinimumWidth(
      metrics.horizontalAdvance(
          QString(edu::kInstructionTextColumns, QLatin1Char('0'))) +
      chrome + 8 - 2 * body_->frameWidth());
  fitHeight();
}

// Exactly as tall as its content, within [kMinLines, kMaxLines]: the
// inspector never needs more, and every pixel it does not take goes to the
// register list above.  A text line is height() tall; lineSpacing() adds the
// leading, which is negative for some fonts (Nimbus Mono: -2) and would clip
// the last line.
void EduInspector::fitHeight() {
  const QFontMetrics metrics = view_->fontMetrics();
  const int lineHeight = qMax(metrics.height(), metrics.lineSpacing());

  // Measured in pixels, block by block, so that a wrapped line (a
  // destination with a long label) counts.
  QAbstractTextDocumentLayout* layout = view_->document()->documentLayout();
  qreal needed = 0;
  for (QTextBlock block = view_->document()->begin(); block.isValid();
       block = block.next()) {
    needed += layout->blockBoundingRect(block).height();
  }
  // The note takes what it needs at the current width; the fixed-pitch part
  // gets the rest of the kMaxLines budget, but never under kMinLines.
  int noteHeight = 0;
  if (!note_->isHidden()) {
    const int width = qMax(body_->width() - 2 * body_->frameWidth(),
                           view_->minimumWidth());
    noteHeight = note_->heightForWidth(width);
    if (note_->minimumHeight() != noteHeight ||
        note_->maximumHeight() != noteHeight) {
      note_->setFixedHeight(noteHeight);
    }
  }
  const int budget =
      qMax(kMinLines * lineHeight, kMaxLines * lineHeight - noteHeight);
  const int content =
      qBound(kMinLines * lineHeight, int(needed + 0.999), budget);
  view_->setVerticalScrollBarPolicy(needed > budget ? Qt::ScrollBarAsNeeded
                                                    : Qt::ScrollBarAlwaysOff);
  const int chrome = int(2 * view_->document()->documentMargin());
  const int viewHeight = content + chrome + 2;
  shownLines_ = (content + noteHeight + lineHeight - 1) / lineHeight;
  if (view_->minimumHeight() != viewHeight ||
      view_->maximumHeight() != viewHeight) {
    view_->setFixedHeight(viewHeight);
  }
  const int bodyHeight = viewHeight + noteHeight + 2 * body_->frameWidth();
  if (body_->minimumHeight() != bodyHeight ||
      body_->maximumHeight() != bodyHeight) {
    body_->setFixedHeight(bodyHeight);
  }
}

void EduInspector::setText(const QString& text, const QString& note) {
  if (text != view_->toPlainText()) {
    view_->setPlainText(text);
  }
  if (note != note_->text()) {
    note_->setText(note);
  }
  note_->setVisible(!note.isEmpty());
  fitHeight();
}

QString EduInspector::text() const {
  return note_->isHidden() ? view_->toPlainText()
                           : view_->toPlainText() + "\n" + note_->text();
}

void EduInspector::showNothing() {
  setText("Select a register or an instruction\n"
          "to see its bits.");
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

  // Six lines (kMinLines), no blanks: every line here is a row the register
  // list above does not get.
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
  setText(registerText(reg, value, changed, groupTitle));
}

void EduInspector::showInstruction(const QStringList& lines,
                                   const QStringList& notes) {
  setText(lines.join("\n"), notes.join("\n"));
}
