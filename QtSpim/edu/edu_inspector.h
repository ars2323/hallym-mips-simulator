/* QtSpim-Edu: the inspector dock (PLAN "공통: 인스펙터 패널").

   One dock, below the register dock, whose content depends on what is
   selected: a register (PLAN R2) or an instruction (PLAN R3); memory words
   follow in stage 6.

   All numbers come from edu/core/ (edu_format.h, edu_instruction_text.h);
   this class only shows them.

   Height: as many lines as the content needs, never fewer than kMinLines
   (what a register takes, so that selecting registers never moves the
   register list above) and never more than kMaxLines (beyond that the
   text scrolls).  Every line the inspector takes is a row the register
   list loses.
*/

#ifndef EDU_INSPECTOR_H
#define EDU_INSPECTOR_H

#include <QDockWidget>
#include <QStringList>

#include "edu/core/edu_registers.h"

class QFrame;
class QLabel;
class QPlainTextEdit;

class EduInspector : public QDockWidget {
  Q_OBJECT

 public:
  explicit EduInspector(QWidget* parent = 0);

  enum { kMinLines = 6, kMaxLines = 16 };

  void showNothing();
  void showRegister(const edu::RegisterRef& reg, quint32 value, bool changed,
                    const QString& groupTitle);

  // The lines of edu::instructionDetailLines() (fixed pitch) and of
  // edu::instructionNoteLines() (prose: proportional font, word wrap).
  void showInstruction(const QStringList& lines, const QStringList& notes);

  void setPanelFont(const QFont& font);

  // How many text lines tall the inspector currently is.
  int shownLines() const { return shownLines_; }

  // The text being shown, for tests and the screenshot harness.
  QString text() const;

  // Pure layout, exposed so it can be checked without a widget.
  static QString registerText(const edu::RegisterRef& reg, quint32 value,
                              bool changed, const QString& groupTitle);

 private slots:
  void fitHeight();

 protected:
  bool eventFilter(QObject* watched, QEvent* event);

 private:
  void setText(const QString& text, const QString& note = QString());

  QFrame* body_;          // frame around the two parts below
  QPlainTextEdit* view_;  // fixed pitch: values, bit tables
  QLabel* note_;          // proportional, word-wrapped; hidden when empty
  int shownLines_;
};

#endif  // EDU_INSPECTOR_H
