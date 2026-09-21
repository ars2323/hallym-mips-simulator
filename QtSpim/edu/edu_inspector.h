/* QtSpim-Edu: the inspector dock (PLAN "공통: 인스펙터 패널").

   One dock, below the register dock, whose content depends on what is
   selected.  Stage 3 knows registers (PLAN R2); instructions and memory
   words are added in stages 5 and 6.

   All numbers come from edu/core/edu_format.h; this class only lays them
   out.
*/

#ifndef EDU_INSPECTOR_H
#define EDU_INSPECTOR_H

#include <QDockWidget>

#include "edu/core/edu_registers.h"

class QPlainTextEdit;

class EduInspector : public QDockWidget {
  Q_OBJECT

 public:
  explicit EduInspector(QWidget* parent = 0);

  void showNothing();
  void showRegister(const edu::RegisterRef& reg, quint32 value, bool changed,
                    const QString& groupTitle);

  void setPanelFont(const QFont& font);

  // The text being shown, for tests and the screenshot harness.
  QString text() const;

  // Pure layout, exposed so it can be checked without a widget.
  static QString registerText(const edu::RegisterRef& reg, quint32 value,
                              bool changed, const QString& groupTitle);

 private:
  QPlainTextEdit* view_;
};

#endif  // EDU_INSPECTOR_H
