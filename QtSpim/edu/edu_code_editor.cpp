/* See edu_code_editor.h. */

#include "edu/edu_code_editor.h"

#include "edu/theme/tokens.h"

#include <QHelpEvent>
#include <QPainter>
#include <QWheelEvent>
#include <QTextBlock>
#include <QToolTip>

#include "edu/core/edu_mips_syntax.h"

namespace {

// The strip on the left.  It only forwards to the editor, which knows the
// blocks' geometry (the usual arrangement for a QPlainTextEdit margin).
class Margin : public QWidget {
 public:
  explicit Margin(EduCodeEditor* editor) : QWidget(editor), editor_(editor) {}
  QSize sizeHint() const { return QSize(editor_->marginWidth(), 0); }

 protected:
  void paintEvent(QPaintEvent* event) { editor_->paintMargin(event); }
  bool event(QEvent* e) {
    if (e->type() == QEvent::ToolTip) {
      QHelpEvent* help = static_cast<QHelpEvent*>(e);
      const QString tip = editor_->marginToolTip(help->pos().y());
      if (tip.isEmpty()) {
        QToolTip::hideText();
      } else {
        QToolTip::showText(help->globalPos(), tip, this);
      }
      return true;
    }
    return QWidget::event(e);
  }

 private:
  EduCodeEditor* editor_;
};

QTextCharFormat colour(const QColor& c, int weight = QFont::Normal,
                       bool italic = false) {
  QTextCharFormat format;
  format.setForeground(c);
  if (weight != QFont::Normal) format.setFontWeight(weight);
  format.setFontItalic(italic);
  return format;
}

}  // namespace

//
// EduMipsHighlighter
//

EduMipsHighlighter::EduMipsHighlighter(QTextDocument* document)
    : QSyntaxHighlighter(document) {}

void EduMipsHighlighter::highlightBlock(const QString& text) {
  // docs/design/tokens.md 5, "문법 강조".
  using namespace edu::theme;
  static const QTextCharFormat formats[] = {
      colour(QColor(kTextMuted), QFont::Normal, true),  // Comment
      colour(QColor(kAmberText)),                       // String
      colour(QColor(kBlue)),                            // Directive
      colour(QColor(kNavy), QFont::Medium),             // Instruction
      colour(QColor(kTealText)),                        // Register
      colour(QColor(kNavy), QFont::DemiBold),           // LabelDefinition
      colour(QColor(kText)),                            // Identifier
      colour(QColor(kPurpleText)),                      // Number
  };
  const QList<edu::SyntaxToken> tokens = edu::tokenizeMipsLine(text);
  for (int i = 0; i < tokens.size(); i += 1) {
    setFormat(tokens.at(i).start, tokens.at(i).length,
              formats[int(tokens.at(i).kind)]);
  }
}

//
// EduCodeEditor
//

EduCodeEditor::EduCodeEditor(QWidget* parent)
    : QPlainTextEdit(parent),
      pointSize_(10),
      basePointSize_(10),
      baseSet_(false),
      margin_(new Margin(this)) {
  setLineWrapMode(QPlainTextEdit::NoWrap);
  new EduMipsHighlighter(document());

  connect(this, SIGNAL(blockCountChanged(int)), this, SLOT(updateMarginWidth()));
  connect(this, SIGNAL(updateRequest(QRect, int)), this,
          SLOT(updateMargin(QRect, int)));
  connect(this, SIGNAL(cursorPositionChanged()), this,
          SLOT(highlightCurrentLine()));
  updateMarginWidth();
  highlightCurrentLine();
}

// The font the settings give every panel.  The editor keeps its own size on
// top of it (Ctrl+= / Ctrl+-), but a new font from the Settings dialog wins:
// the zoom starts again from the size the user just chose.
void EduCodeEditor::setPanelFont(const QFont& font) {
  const int points = font.pointSize() > 0 ? font.pointSize() : 10;
  const bool changed =
      font.family() != baseFont_.family() || points != basePointSize_;
  if (changed) {
    baseFont_ = font;
    basePointSize_ = points;
    pointSize_ = points;
    // The first font of the session is not something the student did, and
    // must not overwrite the size they left last time -- which is read back
    // after this (SpimView::eduRestoreEditorZoom).
    if (baseSet_) {
      emit pointSizeChanged(pointSize_);
    }
    baseSet_ = true;
  }
  applyPointSize();
}

void EduCodeEditor::applyPointSize() {
  QFont font = baseFont_;
  font.setPointSize(pointSize_);
  setFont(font);
  // A tab is eight columns: SPIM's sources (and most students' files) are
  // laid out for that.
  setTabStopDistance(8 * QFontMetricsF(font).horizontalAdvance(QLatin1Char(' ')));
  updateMarginWidth();
  highlightCurrentLine();  // the band and the error rows follow the new height
  if (viewport() != 0) {
    viewport()->update();
  }
}

void EduCodeEditor::setPointSize(int points) {
  const int wanted = qBound(int(kMinPointSize), points, int(kMaxPointSize));
  if (wanted == pointSize_) {
    return;  // at either end nothing happens, and nothing is said about it
  }
  pointSize_ = wanted;
  applyPointSize();
  emit pointSizeChanged(pointSize_);
}

void EduCodeEditor::zoomInOnePoint() { setPointSize(pointSize_ + 1); }

void EduCodeEditor::zoomOutOnePoint() { setPointSize(pointSize_ - 1); }

void EduCodeEditor::resetPointSize() { setPointSize(basePointSize_); }

// Ctrl and the wheel: the same one point a step.
void EduCodeEditor::wheelEvent(QWheelEvent* event) {
  if (event->modifiers().testFlag(Qt::ControlModifier)) {
    const int ticks = event->angleDelta().y();
    if (ticks > 0) {
      zoomInOnePoint();
    } else if (ticks < 0) {
      zoomOutOnePoint();
    }
    event->accept();
    return;
  }
  QPlainTextEdit::wheelEvent(event);
}

QString EduCodeEditor::fileText() const {
  QString text = document()->toRawText();
  text.replace(QChar(QChar::ParagraphSeparator), QLatin1Char('\n'));
  return text;
}

void EduCodeEditor::setErrorLines(const QMap<int, QString>& errors) {
  errors_ = errors;
  updateMarginWidth();
  margin_->update();
  highlightCurrentLine();
}

void EduCodeEditor::goToLine(int line) {
  const QTextBlock block = document()->findBlockByNumber(line - 1);
  if (block.isValid()) {
    QTextCursor cursor(block);
    setTextCursor(cursor);
    centerCursor();
    setFocus();
  }
}

int EduCodeEditor::currentLine() const {
  return textCursor().blockNumber() + 1;
}

int EduCodeEditor::currentColumn() const {
  return textCursor().positionInBlock() + 1;
}

int EduCodeEditor::marginWidth() const {
  int digits = 1;
  for (int max = qMax(1, blockCount()); max >= 10; max /= 10) {
    digits += 1;
  }
  const int marker = fontMetrics().height();  // room for the error dot
  return marker + 6 +
         fontMetrics().horizontalAdvance(QLatin1Char('9')) * qMax(3, digits);
}

void EduCodeEditor::updateMarginWidth() {
  setViewportMargins(marginWidth(), 0, 0, 0);
}

void EduCodeEditor::updateMargin(const QRect& rect, int dy) {
  if (dy != 0) {
    margin_->scroll(0, dy);
  } else {
    margin_->update(0, rect.y(), margin_->width(), rect.height());
  }
  if (rect.contains(viewport()->rect())) {
    updateMarginWidth();
  }
}

void EduCodeEditor::resizeEvent(QResizeEvent* event) {
  QPlainTextEdit::resizeEvent(event);
  const QRect area = contentsRect();
  margin_->setGeometry(QRect(area.left(), area.top(), marginWidth(), area.height()));
}

void EduCodeEditor::highlightCurrentLine() {
  QTextEdit::ExtraSelection line;
  line.format.setBackground(QColor(edu::theme::kWindow));
  line.format.setProperty(QTextFormat::FullWidthSelection, true);
  line.cursor = textCursor();
  line.cursor.clearSelection();
  QList<QTextEdit::ExtraSelection> selections;
  selections << line;

  // Lines the assembler complained about: a light red band.  (On top of the
  // current-line tint, so the error stays visible under the cursor.)
  for (QMap<int, QString>::const_iterator it = errors_.constBegin();
       it != errors_.constEnd(); ++it) {
    const QTextBlock block = document()->findBlockByNumber(it.key() - 1);
    if (block.isValid()) {
      QTextEdit::ExtraSelection error;
      error.format.setBackground(QColor(edu::theme::kErrorTint));
      error.format.setProperty(QTextFormat::FullWidthSelection, true);
      error.cursor = QTextCursor(block);
      selections << error;
    }
  }
  setExtraSelections(selections);
}

void EduCodeEditor::paintMargin(QPaintEvent* event) {
  QPainter painter(margin_);
  painter.fillRect(event->rect(), QColor(edu::theme::kWindow));
  painter.setFont(font());

  QTextBlock block = firstVisibleBlock();
  int number = block.blockNumber() + 1;
  int top = qRound(blockBoundingGeometry(block).translated(contentOffset()).top());
  int bottom = top + qRound(blockBoundingRect(block).height());
  const int current = currentLine();
  const int dot = fontMetrics().height() - 6;

  while (block.isValid() && top <= event->rect().bottom()) {
    if (block.isVisible() && bottom >= event->rect().top()) {
      if (errors_.contains(number)) {
        painter.setRenderHint(QPainter::Antialiasing);
        painter.setPen(Qt::NoPen);
        painter.setBrush(QColor(edu::theme::kError));
        painter.drawEllipse(3, top + 3, dot, dot);
      }
      painter.setPen(number == current ? QColor(edu::theme::kNavy)
                                       : QColor(edu::theme::kTextMuted));
      painter.drawText(0, top, margin_->width() - 4, fontMetrics().height(),
                       Qt::AlignRight, QString::number(number));
    }
    block = block.next();
    top = bottom;
    bottom = top + qRound(blockBoundingRect(block).height());
    number += 1;
  }
}

QString EduCodeEditor::marginToolTip(int y) const {
  QTextBlock block = firstVisibleBlock();
  int top = qRound(blockBoundingGeometry(block).translated(contentOffset()).top());
  while (block.isValid()) {
    const int bottom = top + qRound(blockBoundingRect(block).height());
    if (y >= top && y < bottom) {
      return errors_.value(block.blockNumber() + 1);
    }
    block = block.next();
    top = bottom;
  }
  return QString();
}
