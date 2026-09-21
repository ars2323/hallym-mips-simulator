/* QtSpim-Edu development tools: a scripted, non-interactive mode used to
   capture screenshots of the panels so that UI changes can be reviewed
   without a human driving the program.

   Compiled only when the project is configured with

       qmake CONFIG+=edu_devtools

   which defines EDU_DEVTOOLS.  A release build contains none of this.

   Usage:

       QtSpimEdu --load prog.s --steps 3 \
                 --capture intregs --out regs.png \
                 --capture text    --out text.png

       QtSpimEdu --load prog.s --run --dump console out.txt

       QtSpimEdu --local-codec ISO-8859-1 --load "/tmp/한글/prog.s" ...

   --capture/--out may be repeated; each --capture must be followed by its
   --out.  --dump takes a stream name and a file, and may also be repeated.
   Any of --capture/--dump switches the program into this mode: it runs the
   script, writes the files and exits without waiting for the user.

   --local-codec replaces the codec QString::toLocal8Bit() uses, so that the
   "path cannot be passed to the simulator" warning (edu/edu_path_check.h)
   can be exercised on a UTF-8 Linux box, where it would otherwise never
   trigger.

   --run runs the program to completion through the normal Run path instead
   of single-stepping.  Combine with a shell timeout: a test program that
   loops forever will hang here exactly as it would in the GUI.

   --dialog-shots <dir> saves a PNG of every dialog answered this way, so
   that their appearance can be reviewed.

   From the moment this mode is entered until the captures are taken, any
   modal dialog the simulator raises (SPIM reports assembler and run-time
   errors through QMessageBox, one per error) is answered with OK so that a
   headless run does not block.  The number of dialogs and
   their text is reported on stdout, and the text is in the log pane, so
   they are never silently swallowed.

   Captures are taken with QWidget::grab(), which renders through QPainter
   and therefore also works under the "offscreen" platform plugin.  Fonts,
   DPI and theme there differ from a real desktop, so these images are for
   checking content and layout, not final appearance.
*/

#ifndef EDU_DEVTOOLS_H
#define EDU_DEVTOOLS_H

#include <QList>
#include <QObject>
#include <QString>
#include <QStringList>

class QTimer;
class QWidget;
class SpimView;

class EduDevtools : public QObject {
  Q_OBJECT

 public:
  explicit EduDevtools(QObject* parent = 0);

  // Consumes the options this class understands and returns the remaining
  // arguments for the normal command line parser.  A --load file is
  // appended as a trailing positional argument so that it is loaded by the
  // same path as a file named on the command line.  Sets *ok to false and
  // writes to stderr if an option is malformed.
  QStringList takeOptions(const QStringList& args, bool* ok);

  // True when --capture or --dump was given, i.e. when the program should
  // run the script and exit instead of waiting for the user.
  bool isActive() const { return !captures_.isEmpty() || !dumps_.isEmpty(); }

  // Starts answering modal dialogs.  Call as soon as the mode is known and
  // before anything is loaded: the simulator already raises error dialogs
  // while assembling, i.e. before the main event loop is entered.  A modal
  // dialog runs its own event loop, so the timer fires there too.
  void beginHeadless();

  // Runs the script once the event loop is up.  Call, then a.exec().
  void scheduleRun(SpimView* window);

  static QString usage();

 private slots:
  void run();
  void captureModalDialog();
  void dismissBlockingDialog();

 private:
  struct Capture {
    QString panel;
    QString out;
  };

  struct Dump {
    QString stream;
    QString out;
  };

  QWidget* panelWidget(const QString& name) const;
  bool grabToFile(QWidget* widget, const QString& path);
  bool writeDump(const Dump& dump);
  QString registerDump() const;
  void settle();

  QList<Capture> captures_;
  QList<Dump> dumps_;
  bool runToCompletion_;
  int steps_;
  SpimView* window_;
  QString modalOut_;
  QString dialogShotDir_;
  QTimer* dialogTimer_;
  int dismissedDialogs_;
  int status_;
};

#endif  // EDU_DEVTOOLS_H
