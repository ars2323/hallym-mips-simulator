/* QtSpim-Edu development tools: a scripted, non-interactive mode used to
   capture screenshots of the panels so that UI changes can be reviewed
   without a human driving the program.

   Compiled only when the project is configured with

       qmake CONFIG+=edu_devtools

   which defines EDU_DEVTOOLS.  A release build contains none of this.

   Usage:

       HallymMIPS --load prog.s --steps 3 \
                 --capture intregs --out regs.png \
                 --capture text    --out text.png

       HallymMIPS --load prog.s --run --dump console out.txt

       HallymMIPS --local-codec ISO-8859-1 --load "/tmp/한글/prog.s" ...

   --load and --reload go through the REAL menu actions (File > Load File,
   File > Reinitialize and Load File): the action is triggered, the file
   dialog it opens is answered, and SpimView::file_LoadFile() does the rest,
   exactly as for a user.  They may be repeated and run in command-line
   order.  (Until stage 6 --load handed the file to main.cpp as a command-
   line argument, which skips file_LoadFile() altogether; a bug there could
   not have been seen.  That way in still exists as --load-cmdline, because
   the log goldens were captured through it and because "HallymMIPS prog.s" is
   something users do as well.)

   --capture/--out may be repeated; each --capture must be followed by its
   --out.  --dump takes a stream name and a file, and may also be repeated.
   Any of --capture/--dump switches the program into this mode: it runs the
   script, writes the files and exits without waiting for the user.

   --window-size <W>x<H> resizes the main window before anything is captured
   (the offscreen platform has no window manager to object).

   --select-register <name> selects that row of the register panel (any
   spelling edu::findRegister() accepts), which fills the inspector.

   --select-instruction <hexaddr> selects that row of the Text panel, which
   fills the inspector as a click would; --expand-kernel opens the kernel
   segment first.

   --goto <text> types into the Data panel's Go to box (address, label or
   $register); --select-memory <hexaddr> is the same for a plain address.
   --expand-env and --expand-kernel-data open the Data panel's folds.

   --set-register <name>=<hex> writes a register the way the Change Value
   dialog does once the user has typed a value (same model call), after the
   run/steps; repeatable.  Used to check that user edits are not highlighted.

   --trigger <action> triggers a menu action by its object name (for example
   action_Text_DisplayKernelText) before anything runs; repeatable.

   --redisplay forces a full redraw of all panels after the triggers, as
   closing the Settings dialog does.  Upstream's Text Segment toggles do not
   redraw by themselves (their "changed" test is inverted), so without this
   a triggered toggle would not show in an upstream-rendered capture.

   --breakpoint <hex address> sets a breakpoint through the core and redraws
   the text segment; repeatable.

   --time prints how long the --steps / --run phase took, display updates
   included, for comparing builds.

   --reg-base <2|10|16> picks the Registers menu entry for that base before
   anything is captured, through the menu action itself.

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
#include <QSize>
#include <QString>
#include <QStringList>

class QAbstractItemView;
class QTimer;
class QWidget;
class SpimView;

class EduDevtools : public QObject {
  Q_OBJECT

 public:
  explicit EduDevtools(QObject* parent = 0);

  // Consumes the options this class understands and returns the remaining
  // arguments for the normal command line parser.  A --load-cmdline file is
  // appended as a trailing positional argument so that it is loaded by the
  // same path as a file named on the command line.  Sets *ok to false and
  // writes to stderr if an option is malformed.
  QStringList takeOptions(const QStringList& args, bool* ok);

  // True when these arguments would put the program into the scripted mode
  // (isActive() after takeOptions()); main() then skips the splash screen.
  static bool wantsCaptureMode(const QStringList& args);

  // --tutorial-first-run: take the start-up route into the tutorial (the one
  // the start-up card's "take the tutorial" button opens) instead of calling
  // it as Help > Tutorial does, so the two can be compared.
  static bool wantsFirstRunTutorial(const QStringList& args);

  // True when --capture or --dump was given, i.e. when the program should
  // run the script and exit instead of waiting for the user.
  bool isActive() const {
    return !captures_.isEmpty() || !dumps_.isEmpty() || reportTime_ ||
           inspectorReport_ || hscrollReport_ || !hscroll_.isEmpty() ||
           alignSweep_ || scrollbarReport_ || dockReport_ || vscrollReport_ ||
           !editorSteps_.isEmpty() || layoutReport_ ||
           tutorialReport_ || !dockDrop_.isEmpty() || !menuLoads_.isEmpty() ||
           clickThrough_ || firstRunTutorial_ || !clickTabs_.isEmpty() ||
           !tutorialExit_.isEmpty() || !consoleType_.isEmpty() ||
           !splitDrags_.isEmpty();
  }

  // Starts answering modal dialogs.  Call as soon as the mode is known and
  // before anything is loaded: the simulator already raises error dialogs
  // while assembling, i.e. before the main event loop is entered.  A modal
  // dialog runs its own event loop, so the timer fires there too.
  void beginHeadless();

  // One of the tutorial card's buttons, pressed as a mouse does it -- including
  // the activation a window manager sends when the overlay is clicked,
  // which is what used to end the tutorial (docs/ARCHITECTURE.md 12, 83).
  bool clickTutorialButton(const char* objectName);

  // Whether the panel behind a dock tab of that title is really on screen.
  bool panelOnScreen(const QString& title) const;
  void reportPanels(const QString& what);

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

  // A panel and the strip of frozen columns laid over its left edge.
  struct FrozenPair {
    QString name;
    QAbstractItemView* view;
    QAbstractItemView* frozen;
  };

  QString frontSharedPanel() const;
  QList<FrozenPair> frozenPairs() const;
  bool alignedRows(const FrozenPair& pair, const QString& state);
  int sweepPanel(const FrozenPair& pair, const QString& moment);
  void setPanelSize(const QString& panel, int steps, bool all);
  void runAlignSweep();
  void runScrollbarReport();
  void runDockReport();
  void runVerticalScrollReport();

  QWidget* panelWidget(const QString& name) const;
  bool grabToFile(QWidget* widget, const QString& path);
  bool writeDump(const Dump& dump);
  QString registerDump() const;
  void settle();
  void applyThemeOptions();

  QList<Capture> captures_;
  QList<Dump> dumps_;
  bool runToCompletion_;
  int regBase_;  // 0 = leave alone, else 2/10/16 via the Registers menu
  QString selectRegister_;  // register to select before capturing
  bool expandKernel_;
  bool hasSelectInstruction_;
  quint32 selectInstruction_;  // Text panel row to select before capturing
  bool saveSettings_;
  bool inspectorReport_;  // --inspector-report: what the inspector shows
  bool hscrollReport_;    // --hscroll-report: sideways scrolling, and that
                          // nothing moves the panels sideways by itself
  QStringList hscroll_;   // --hscroll <panel>=<n>: scroll one sideways
  bool alignSweep_;       // --align-sweep: the frozen strip and its panel
  bool scrollbarReport_;  // --scrollbar-report: every panel's scroll bars
  bool dockReport_;       // --dock-report: no panel can leave the window
  bool vscrollReport_;    // --vscroll-report: one step, one vertical move
  bool layoutReport_;
  bool expandEnvironment_;
  bool expandKernelData_;
  QStringList menuLoads_;    // "L<path>" / "R<path>", in command-line order
  QStringList editorSteps_;  // "open=<file>", "type=<text>", "save=", ...
  QStringList loadAnswers_;  // answers to "A program is already loaded"
  QString pendingMenuFile_;  // what the next file dialog should pick
  QString raisePanel_;     // dock to bring to the front of its tab group
  QStringList setMemory_;  // "addr=value" words written after running
  QStringList goTos_;  // Data panel Go to inputs, applied after running
  QSize windowSize_;        // invalid = leave the window alone
  QStringList setRegisters_;  // "name=value" edits applied after running
  QStringList triggers_;      // QAction object names to trigger first
  QList<quint32> breakpoints_;
  QList<quint32> clickBreakpoints_;  // BP cells to click after running
  bool reportTime_;
  bool redisplay_;
  int steps_;
  int tutorialStep_;  // --tutorial-step: 1-based, 0 = do not show the tutorial
  bool tutorialReport_;  // --tutorial-report: every step's card, and whether
                         // it is inside the window
  QString dockDrop_;     // --dock-drop: simulate a drop, report the split
  QString saveAnswer_;   // --editor-answer: how the "unsaved changes"
                         // question is answered (discard by default)
  bool clickThrough_;    // --tutorial-click-through: walk the tutorial with the
                         // mouse, on the card's own buttons
  bool firstRunTutorial_;    // --tutorial-first-run: let the start-up route open
                         // the tutorial, and report on that one
  QStringList clickTabs_;  // --click-tab: a dock tab pressed with the mouse
  QString tutorialExit_;       // --tutorial-exit: how to leave the tutorial before
                           // the rest of the script runs
  QString consoleType_;    // --console-type: keys typed into the Console tab
                           // before the program runs, for an input syscall
  QStringList splitDrags_; // --drag-split: a drag on one of the three lines
                           // between the four panels
  SpimView* window_;
  QString modalOut_;
  QString dialogShotDir_;
  // Theme mock-ups (PLAN stage H): applied before anything else runs.
  QString qssFile_;       // --qss: replaces the application style sheet
  QStringList fontDirs_;  // --font-dir: .ttf/.otf files to register
  QString uiFont_;        // --ui-font: "Family,13px" application font
  QString iconDir_;       // --icon-dir: <action object name>.svg icons
  QTimer* dialogTimer_;
  int dismissedDialogs_;
  int status_;
};

#endif  // EDU_DEVTOOLS_H
