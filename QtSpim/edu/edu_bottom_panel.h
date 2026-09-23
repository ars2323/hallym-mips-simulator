/* Hallym MIPS Simulator -- the panel along the bottom of the window.

   Two tabs, the way an editor's bottom panel does it:

     Console   what the program prints, and what the student types into it.
               Upstream had this as a separate top-level window, which is
               easy to lose behind the main window and gives a beginner one
               more thing to manage.
     Messages  the simulator's own log: the start-up banner, what was
               loaded, and every assembler or run-time error.

   The Console tab is the one in front to begin with, because that is where
   a program's output appears.  A message that arrives while the Console is
   in front marks the Messages tab with a dot; an error brings that tab
   forward by itself (SpimView::eduShowLog).  Ctrl+L puts the whole panel
   away and brings it back.

   Nothing about what Save Log File and Print write changes: they read the
   console and the hidden log widgets, not this panel.
*/

#ifndef EDU_BOTTOM_PANEL_H
#define EDU_BOTTOM_PANEL_H

#include <QDockWidget>

class QTabWidget;
class QWidget;

class EduBottomPanel : public QDockWidget {
  Q_OBJECT

 public:
  explicit EduBottomPanel(QWidget* parent = 0);

  // Both take a widget that already exists: the console upstream created as
  // its own window, and the central text pane the simulator logs into.
  void setConsole(QWidget* console);
  void setMessages(QWidget* messages);

  // The Console tab, in front and ready to be typed into.  withFocus is for
  // a program waiting on read_int or read_string: the keys have to land in
  // the console, wherever the focus was.
  void showConsole(bool withFocus = false);

  // The Messages tab.  quietly means "only mark it": a line of log while
  // the student is watching the console should not take the console away.
  void showMessages(bool quietly = false);

  bool consoleIsCurrent() const;
  bool hasUnread() const { return unread_; }
  QString currentTabName() const;
  QWidget* console() const { return console_; }
  QWidget* messages() const { return messages_; }
  QTabWidget* tabs() const { return tabs_; }

 private slots:
  void onCurrentChanged(int index);

 private:
  void setUnread(bool unread);

  QTabWidget* tabs_;
  QWidget* console_;
  QWidget* messages_;
  int consoleIndex_;
  int messagesIndex_;
  bool unread_;
};

#endif  // EDU_BOTTOM_PANEL_H
