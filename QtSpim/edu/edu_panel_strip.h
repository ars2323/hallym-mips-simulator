/* Hallym MIPS Simulator -- one strip over every panel.

   Until 1.2.2 a window held three kinds of panel heading at once: a tab
   bar with no title (the registers, Text and Data, which Qt tabs
   together), a title bar with no tabs (the editor, the Instruction
   Inspector), and a title bar with a tab bar *under* it saying the same
   thing twice (Console / Messages).  Since panels can no longer be
   floated (Y) the title bars had nothing left in them but a name and a
   close button, and the three styles made one window look like three.

   This is the strip a panel that Qt has not tabbed with another uses
   instead: a tab bar with one tab, which is the panel's name, and the
   close button at its right end -- the same shape, font and height as
   the tab bar Qt draws over a tabbed group, because both are QTabBars
   and the look is in one place (theme/light.qss, QTabBar).

   Panels that Qt has tabbed together keep Qt's own tab bar; the close
   button is put at its right end by SpimView::eduSyncDockTabs().
*/

#ifndef EDU_PANEL_STRIP_H
#define EDU_PANEL_STRIP_H

#include <QWidget>

class QDockWidget;
class QTabBar;
class QToolButton;

class EduPanelStrip : public QWidget {
  Q_OBJECT

 public:
  // The strip becomes `dock`'s title bar widget; it follows the dock's
  // window title and closes it.
  explicit EduPanelStrip(QDockWidget* dock);

  // The close button a tab bar of Qt's own borrows, so that every strip
  // has one in the same place.
  static QToolButton* makeCloseButton(QWidget* parent);

 private slots:
  void followTitle();

 private:
  void fitTab();

 private:
  QDockWidget* dock_;
  QTabBar* tabs_;
};

#endif  // EDU_PANEL_STRIP_H
