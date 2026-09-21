/* See edu_code_editor.h. */

#include "edu/edu_code_editor.h"

#include <QHelpEvent>
#include <QPainter>
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

QTextCharFormat colour(const QColor& c, bool bold = false, bool italic = false) {
  QTextCharFormat format;
  format.setForeground(c);
  if (bold) format.setFontWeight(QFont::Bold);
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
  static const QTextCharFormat formats[] = {
      colour(QColor(117, 117, 117), false, true),  // Comment: grey italic
      colour(QColor(46, 125, 50)),                 // String: green
      colour(QColor(106, 27, 154)),                // Directive: purple
      colour(QColor(21, 101, 192), true),          // Instruction: blue bold
      colour(QColor(191, 54, 12)),                 // Register: rust
      colour(QColor(0, 0, 0), true),               // LabelDefinition: bold
      colour(QColor(0, 96, 100)),                  // Identifier: teal
      colour(QColor(173, 20, 87)),                 // Number: magenta
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
    : QPlainTextEdit(parent), margin_(new Margin(this)) {
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

void EduCodeEditor::setPanelFont(const QFont& font) {
  setFont(font);
  // A tab is eight columns: SPIM's sources (and most students' files) are
  // laid out for that.
  setTabStopDistance(8 * QFontMetricsF(font).horizontalAdvance(QLatin1Char(' ')));
  updateMarginWidth();
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
  line.format.setBackground(QColor(255, 249, 196));  // pale yellow
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
      error.format.setBackground(QColor(255, 205, 210));
      error.format.setProperty(QTextFormat::FullWidthSelection, true);
      error.cursor = QTextCursor(block);
      selections << error;
    }
  }
  setExtraSelections(selections);
}

void EduCodeEditor::paintMargin(QPaintEvent* event) {
  QPainter painter(margin_);
  painter.fillRect(event->rect(), QColor(240, 240, 240));
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
        painter.setBrush(QColor(211, 47, 47));
        painter.drawEllipse(3, top + 3, dot, dot);
      }
      painter.setPen(number == current ? QColor(33, 33, 33)
                                       : QColor(140, 140, 140));
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
