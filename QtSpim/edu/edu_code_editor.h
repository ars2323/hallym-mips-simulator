/* QtSpim-Edu: the editor widget (PLAN R4).

   A QPlainTextEdit with a line number margin, the current line tinted, MIPS
   syntax colours and markers for the lines the assembler complained about.
   Tabs stay tabs (8 columns wide, as SPIM's own sources assume).

   The colours come from edu::tokenizeMipsLine(); nothing about MIPS is
   decided in this file.
*/

#ifndef EDU_CODE_EDITOR_H
#define EDU_CODE_EDITOR_H

#include <QMap>
#include <QPlainTextEdit>
#include <QSyntaxHighlighter>

class EduMipsHighlighter : public QSyntaxHighlighter {
  Q_OBJECT

 public:
  explicit EduMipsHighlighter(QTextDocument* document);

 protected:
  void highlightBlock(const QString& text);
};

class EduCodeEditor : public QPlainTextEdit {
  Q_OBJECT

 public:
  explicit EduCodeEditor(QWidget* parent = 0);

  void setPanelFont(const QFont& font);

  // The document as the file's text: '\n' line ends, nothing substituted
  // (QPlainTextEdit::toPlainText() turns no-break spaces into blanks).
  QString fileText() const;

  // 1-based line -> message shown as the marker's tool tip.
  void setErrorLines(const QMap<int, QString>& errors);
  QMap<int, QString> errorLines() const { return errors_; }
  void goToLine(int line);
  int currentLine() const;
  int currentColumn() const;

  int marginWidth() const;
  void paintMargin(QPaintEvent* event);
  QString marginToolTip(int y) const;

 protected:
  void resizeEvent(QResizeEvent* event);

 private slots:
  void updateMarginWidth();
  void updateMargin(const QRect& rect, int dy);
  void highlightCurrentLine();

 private:
  QWidget* margin_;
  QMap<int, QString> errors_;
};

#endif  // EDU_CODE_EDITOR_H
