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

   --capture/--out may be repeated; each --capture must be followed by its
   --out.  Presence of --capture is what switches the program into this
   mode: it runs the requested steps, writes the images and exits without
   entering the normal event loop.

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

  // True when --capture was given, i.e. when the program should run the
  // script and exit instead of waiting for the user.
  bool isActive() const { return !captures_.isEmpty(); }

  // Runs the script once the event loop is up.  Call, then a.exec().
  void scheduleRun(SpimView* window);

  static QString usage();

 private slots:
  void run();
  void captureModalDialog();

 private:
  struct Capture {
    QString panel;
    QString out;
  };

  QWidget* panelWidget(const QString& name) const;
  bool grabToFile(QWidget* widget, const QString& path);
  void settle();

  QList<Capture> captures_;
  int steps_;
  SpimView* window_;
  QString modalOut_;
  int status_;
};

#endif  // EDU_DEVTOOLS_H
