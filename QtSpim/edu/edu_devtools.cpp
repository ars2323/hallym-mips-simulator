/* See edu_devtools.h. */

#include "edu/edu_devtools.h"

#include <QAbstractButton>
#include <QApplication>
#include <QCloseEvent>
#include <QDir>
#include <QDockWidget>
#include <QElapsedTimer>
#include <QFile>
#include <QFileDialog>
#include <QFileInfo>
#include <QFontDatabase>
#include <QIcon>
#include <QToolButton>
#include <QLabel>
#include <QLayout>
#include <QLineEdit>
#include <QMessageBox>
#include <QMouseEvent>
#include <QPainter>
#include <QPixmap>
#include <QStatusBar>
#include <QTextDocument>
#include <QTextCodec>
#include <QTextStream>
#include <QThread>
#include <QTimer>
#include <QWidget>
#include <QWindow>

// spimview.h already pulls in the core headers used here (str_stream from
// CPU/string-stream.h, format_registers from CPU/spim-utils.h). Those
// headers have no include guards, so they must not be included again.
#include "spimview.h"
#include "ui_spimview.h"

#include "edu/core/edu_format.h"
#include "edu/edu_inspector.h"
#include "edu/edu_register_model.h"
#include "edu/edu_data_model.h"
#include "edu/edu_data_view.h"
#include "edu/edu_code_editor.h"
#include "edu/edu_editor_dock.h"
#include "edu/edu_register_view.h"
#include "edu/edu_text_model.h"
#include "edu/edu_text_view.h"
#include "edu/edu_tutorial.h"
#include "edu/theme/edu_splash.h"
#include "edu/theme/edu_theme.h"

namespace {

QTextStream& err() {
  static QTextStream stream(stderr);
  return stream;
}

QTextStream& out() {
  static QTextStream stream(stdout);
  return stream;
}

}  // namespace

// What QTest::keyClick() calls (qtestkeyboard.h); exported by QtGui.
Q_GUI_EXPORT void qt_handleKeyEvent(QWindow* window, QEvent::Type type, int key,
                                    Qt::KeyboardModifiers modifiers,
                                    const QString& text, bool autorep,
                                    ushort count);

EduDevtools::EduDevtools(QObject* parent)
    : QObject(parent),
      runToCompletion_(false),
      regBase_(0),
      expandKernel_(false),
      hasSelectInstruction_(false),
      selectInstruction_(0),
      saveSettings_(false),
      layoutReport_(false),
      expandEnvironment_(false),
      expandKernelData_(false),
      reportTime_(false),
      redisplay_(false),
      steps_(0),
      tutorialStep_(0),
      tutorialReport_(false),
      window_(0),
      dialogTimer_(0),
      dismissedDialogs_(0),
      status_(0) {}

QString EduDevtools::usage() {
  return QString(
      "Development options (CONFIG+=edu_devtools builds only):\n"
      "  --load <file.s>        File > Load File: the real menu action and its\n"
      "                         file dialog, as a user does it (repeatable,\n"
      "                         in command-line order together with --reload)\n"
      "  --reload <file.s>      File > Reinitialize and Load File, likewise\n"
      "  --load-answer <a>      answer to \"A program is already loaded\": reinit,\n"
      "                         add or cancel; one per question, in order\n"
      "                         (default add, which is what upstream does)\n"
      "  --load-cmdline <file.s>  pass the file as a command-line argument\n"
      "                         instead (upstream's other way in: main.cpp\n"
      "                         assembles it before the window is up)\n"
      "  --steps <n>            single-step n times after loading\n"
      "  --run                  run to completion instead of stepping\n"
      "  --capture <panel>      panel to capture; repeatable, each one\n"
      "                         must be followed by --out\n"
      "  --out <file.png>       where to write the preceding --capture\n"
      "  --dump <stream> <file> write a text stream; repeatable\n"
      "  --window-size <W>x<H>  resize the main window first\n"
      "  --select-register <r>  select a register row (fills the inspector)\n"
      "  --select-instruction <hexaddr>  select a Text panel row (same)\n"
      "  --expand-kernel        open the Text panel's kernel segment\n"
      "  --click-bp <hexaddr>   click that row's BP cell (repeatable)\n"
      "  --goto <text>          type into the Data panel's Go to box\n"
      "  --select-memory <hexaddr>  select that word in the Data panel\n"
      "  --set-memory <hexaddr>=<hexvalue>  write a word as Change Memory\n"
      "                         Contents does\n"
      "  --editor-open <file>   open a file in the editor (no dialog)\n"
      "  --editor-load <file>   File > Load File, in editor-step order (so it\n"
      "                         can follow an --assemble)\n"
      "  --editor-key <key>     a real key press in the editor, on the route\n"
      "                         shortcuts are looked up: ctrl+s, f3, ctrl+=,\n"
      "                         ctrl++, ctrl+-, ctrl+0\n"
      "  --editor-click-banner  click the \"Source changed\" strip on the Text panel\n"
      "  --editor-report        print the editor's file, modified flag, whether the\n"
      "                         strip shows, which tab is in front, the status text\n"
      "  --editor-trigger <action>  trigger a QAction in editor-step order\n"
      "  --editor-goto-line <n> move the cursor there (and centre it)\n"
      "  --editor-type <text>   type text at the cursor (\\n = new line)\n"
      "  --editor-save          Editor > Save and Assemble (same as --assemble)\n"
      "  --editor-save-as <file>  Editor > Save As and Assemble, through its\n"
      "                         dialog\n"
      "  --editor-rewrite-on-disk <text>  another program rewrites the file\n"
      "  --assemble             Simulator > Assemble (the real action)\n"
      "                         editor steps run in command-line order, after\n"
      "                         --load / --reload and before --trigger\n"
      "  --drag-inspector <dy>  drag the separator above the Inspector by dy\n"
      "                         pixels with real mouse events, then report\n"
      "  --layout-report        print each panel's geometry and whether it is on\n"
      "                         screen (Editor, Text, Data, message log)\n"
      "  --inspector-report     print the Inspector dock's height, the content's\n"
      "                         preferred height and whether the user sized it\n"
      "  --save-settings        write the settings file on exit, as closing the\n"
      "                         window does (the script otherwise leaves none)\n"
      "  --raise <panel>        bring that dock's tab to the front\n"
      "  --expand-env           unfold the stack's argv/environment area\n"
      "  --expand-kernel-data   unfold the Data panel's kernel segment\n"
      "  --set-register <r>=<hex> edit a register as the user would; repeatable\n"
      "  --trigger <action>     trigger a menu action by object name; repeatable\n"
      "  --redisplay            force a full redraw after the triggers\n"
      "  --breakpoint <hexaddr> set a breakpoint; repeatable\n"
      "  --time                 report the duration of the run/step phase\n"
      "  --reg-base <2|10|16>   choose Registers > Binary/Decimal/Hex\n"
      "  --local-codec <name>   pretend the system text encoding is <name>\n"
      "  --dialog-shots <dir>   save a PNG of every dialog answered\n"
      "  --tutorial-step <n>    open the first-run tour at step n (1-based)\n"
      "  --dock-drop <h|v>      drop the editor beside (h) or under (v) the\n"
      "                         text panel, as a drag does, and report the two\n"
      "                         sizes: they should come out equal\n"
      "  --tutorial-report      walk every step of the tour and print each\n"
      "                         card's rectangle and whether it is inside the\n"
      "                         window (the check for docs/ARCHITECTURE 12, 70)\n"
      "                         before capturing; it never starts by itself\n"
      "                         in this mode\n"
      "  --qss <file>           use this application style sheet (theme mock-ups)\n"
      "  --font-dir <dir>       register every .ttf/.otf in <dir>; repeatable\n"
      "  --ui-font <family,Npx> application font, e.g. \"Pretendard,13px\"\n"
      "  --icon-dir <dir>       give each QAction the icon <dir>/<objectName>.svg\n"
      "                         (+ .active.svg / .disabled.svg) if it exists\n"
      "\n"
      "  panels:  intregs fpregs text data console log window about splash\n"
      "           inspector\n"
      "  streams: console log regs intregs-log text-log data-log\n"
      "           (*-log = what Save Log File writes for that window)\n");
}

bool EduDevtools::wantsCaptureMode(const QStringList& args) {
  EduDevtools probe;
  bool ok = true;
  probe.takeOptions(args, &ok);
  return ok && probe.isActive();
}

QStringList EduDevtools::takeOptions(const QStringList& args, bool* ok) {
  QStringList rest;
  QString loadFile;
  *ok = true;

  for (int i = 0; i < args.size(); i += 1) {
    const QString& arg = args.at(i);

    if (arg == "--redisplay") {
      redisplay_ = true;
      continue;
    }

    if (arg == "--qss" || arg == "--font-dir" || arg == "--ui-font" ||
        arg == "--icon-dir") {
      if (i + 1 >= args.size()) {
        err() << arg << " needs a value\n" << usage() << Qt::flush;
        *ok = false;
        return rest;
      }
      const QString value = args.at(i + 1);
      if (arg == "--qss") {
        qssFile_ = value;
      } else if (arg == "--font-dir") {
        fontDirs_ << value;
      } else if (arg == "--ui-font") {
        uiFont_ = value;
      } else {
        iconDir_ = value;
      }
      i += 1;
      continue;
    }

    if (arg == "--time") {
      reportTime_ = true;
      continue;
    }

    if (arg == "--trigger" || arg == "--breakpoint") {
      if (i + 1 >= args.size()) {
        err() << arg << " needs a value\n" << usage() << Qt::flush;
        *ok = false;
        return rest;
      }
      if (arg == "--trigger") {
        triggers_ << args.at(i + 1);
      } else {
        bool parsed = false;
        const quint32 address = args.at(i + 1).toUInt(&parsed, 16);
        if (!parsed) {
          err() << "--breakpoint needs a hex address\n" << Qt::flush;
          *ok = false;
          return rest;
        }
        breakpoints_ << address;
      }
      i += 1;
      continue;
    }

    if (arg == "--run") {
      runToCompletion_ = true;
      continue;
    }

    if (arg == "--dump") {
      if (i + 2 >= args.size()) {
        err() << "--dump needs a stream name and a file\n"
              << usage() << Qt::flush;
        *ok = false;
        return rest;
      }
      Dump dump;
      dump.stream = args.at(i + 1);
      dump.out = args.at(i + 2);
      i += 2;
      if (dump.stream != "console" && dump.stream != "log" &&
          dump.stream != "regs" && dump.stream != "intregs-log" &&
          dump.stream != "text-log" && dump.stream != "data-log") {
        err() << "unknown dump stream: " << dump.stream << "\n"
              << usage() << Qt::flush;
        *ok = false;
        return rest;
      }
      dumps_.append(dump);
      continue;
    }

    if (arg == "--window-size") {
      const QStringList parts =
          (i + 1 < args.size()) ? args.at(i + 1).split('x') : QStringList();
      if (parts.size() != 2 || parts.at(0).toInt() <= 0 ||
          parts.at(1).toInt() <= 0) {
        err() << "--window-size needs <W>x<H>\n" << Qt::flush;
        *ok = false;
        return rest;
      }
      windowSize_ = QSize(parts.at(0).toInt(), parts.at(1).toInt());
      i += 1;
      continue;
    }

    if (arg == "--set-register") {
      if (i + 1 >= args.size() || !args.at(i + 1).contains('=')) {
        err() << "--set-register needs <name>=<hex value>\n" << Qt::flush;
        *ok = false;
        return rest;
      }
      setRegisters_ << args.at(i + 1);
      i += 1;
      continue;
    }

    if (arg == "--select-instruction") {
      bool parsed = false;
      if (i + 1 < args.size()) {
        selectInstruction_ = args.at(i + 1).toUInt(&parsed, 16);
      }
      if (!parsed) {
        err() << "--select-instruction needs a hex address\n" << Qt::flush;
        *ok = false;
        return rest;
      }
      hasSelectInstruction_ = true;
      i += 1;
      continue;
    }

    if (arg == "--click-bp") {
      bool parsed = false;
      quint32 address = 0;
      if (i + 1 < args.size()) {
        address = args.at(i + 1).toUInt(&parsed, 16);
      }
      if (!parsed) {
        err() << "--click-bp needs a hex address\n" << Qt::flush;
        *ok = false;
        return rest;
      }
      clickBreakpoints_ << address;
      i += 1;
      continue;
    }

    if (arg == "--goto" || arg == "--select-memory") {
      if (i + 1 >= args.size()) {
        err() << arg << " needs a value\n" << Qt::flush;
        *ok = false;
        return rest;
      }
      // --select-memory takes a bare hex address; Go To reads "0x..." as one.
      goTos_ << (arg == "--goto" ? args.at(i + 1)
                                 : QString("0x") + args.at(i + 1));
      i += 1;
      continue;
    }

    if (arg == "--set-memory") {
      if (i + 1 >= args.size() || !args.at(i + 1).contains('=')) {
        err() << "--set-memory needs <hexaddr>=<hexvalue>\n" << Qt::flush;
        *ok = false;
        return rest;
      }
      setMemory_ << args.at(i + 1);
      i += 1;
      continue;
    }

    if (arg == "--load" || arg == "--reload") {
      if (i + 1 >= args.size()) {
        err() << arg << " needs a file\n" << Qt::flush;
        *ok = false;
        return rest;
      }
      menuLoads_ << (arg == "--reload" ? QString("R") : QString("L")) +
                        QFileInfo(args.at(i + 1)).absoluteFilePath();
      i += 1;
      continue;
    }

    if (arg == "--raise") {
      if (i + 1 >= args.size()) {
        err() << "--raise needs a panel name\n" << Qt::flush;
        *ok = false;
        return rest;
      }
      raisePanel_ = args.at(i + 1);
      i += 1;
      continue;
    }

    if (arg == "--load-answer") {
      const QString answer = i + 1 < args.size() ? args.at(i + 1) : QString();
      if (answer != "reinit" && answer != "add" && answer != "cancel") {
        err() << "--load-answer needs reinit, add or cancel\n" << Qt::flush;
        *ok = false;
        return rest;
      }
      loadAnswers_ << answer;
      i += 1;
      continue;
    }

    if (arg == "--editor-load") {  // File > Load File, in editor-step order
      if (i + 1 >= args.size()) {
        err() << arg << " needs a file\n" << usage() << Qt::flush;
        *ok = false;
        return rest;
      }
      editorSteps_ << QString("load=") + args.at(i + 1);
      i += 1;
      continue;
    }

    if (arg == "--editor-open" || arg == "--editor-type" ||
        arg == "--editor-goto-line" || arg == "--editor-key" ||
        arg == "--editor-trigger" ||
        arg == "--editor-save-as" || arg == "--editor-rewrite-on-disk") {
      if (i + 1 >= args.size()) {
        err() << arg << " needs a value\n" << Qt::flush;
        *ok = false;
        return rest;
      }
      editorSteps_ << arg.mid(9) + QString("=") + args.at(i + 1);
      i += 1;
      continue;
    }
    if (arg == "--editor-save" || arg == "--assemble" ||
        arg == "--editor-report" || arg == "--editor-click-banner") {
      editorSteps_ << (arg == "--assemble" ? QString("assemble=")
                                           : arg.mid(9) + QString("="));
      continue;
    }

    if (arg == "--drag-inspector") {
      bool parsed = false;
      if (i + 1 < args.size()) {
        dragInspector_ << args.at(i + 1).toInt(&parsed);
      }
      if (!parsed) {
        err() << "--drag-inspector needs a pixel count (negative = up)\n" << Qt::flush;
        *ok = false;
        return rest;
      }
      i += 1;
      continue;
    }
    if (arg == "--layout-report") {
      layoutReport_ = true;
      continue;
    }
    if (arg == "--inspector-report") {
      dragInspector_ << 0;  // a drag of nothing: just the report
      continue;
    }

    if (arg == "--save-settings") {
      saveSettings_ = true;
      continue;
    }

    if (arg == "--expand-env") {
      expandEnvironment_ = true;
      continue;
    }

    if (arg == "--expand-kernel-data") {
      expandKernelData_ = true;
      continue;
    }

    if (arg == "--expand-kernel") {
      expandKernel_ = true;
      continue;
    }

    if (arg == "--select-register") {
      if (i + 1 >= args.size()) {
        err() << "--select-register needs a register name\n" << Qt::flush;
        *ok = false;
        return rest;
      }
      selectRegister_ = args.at(i + 1);
      i += 1;
      continue;
    }

    if (arg == "--dock-drop") {
      if (i + 1 >= args.size()) {
        err() << arg << " needs h or v\n" << usage() << Qt::flush;
        *ok = false;
        return rest;
      }
      dockDrop_ = args.at(i + 1);
      i += 1;
      continue;
    }

    if (arg == "--tutorial-report") {
      tutorialReport_ = true;
      continue;
    }

    if (arg == "--tutorial-step") {
      if (i + 1 >= args.size()) {
        err() << arg << " needs a step number\n" << usage() << Qt::flush;
        *ok = false;
        return rest;
      }
      tutorialStep_ = args.at(i + 1).toInt();
      i += 1;
      continue;
    }

    if (arg == "--reg-base") {
      if (i + 1 >= args.size()) {
        err() << "--reg-base needs 2, 10 or 16\n" << usage() << Qt::flush;
        *ok = false;
        return rest;
      }
      regBase_ = args.at(i + 1).toInt();
      if (regBase_ != 2 && regBase_ != 10 && regBase_ != 16) {
        err() << "--reg-base needs 2, 10 or 16\n" << Qt::flush;
        *ok = false;
        return rest;
      }
      i += 1;
      continue;
    }

    if (arg == "--dialog-shots") {
      if (i + 1 >= args.size()) {
        err() << "--dialog-shots needs a directory\n" << usage() << Qt::flush;
        *ok = false;
        return rest;
      }
      dialogShotDir_ = args.at(i + 1);
      QDir().mkpath(dialogShotDir_);
      i += 1;
      continue;
    }

    if (arg == "--local-codec") {
      if (i + 1 >= args.size()) {
        err() << "--local-codec needs a codec name\n" << usage() << Qt::flush;
        *ok = false;
        return rest;
      }
      QTextCodec* codec = QTextCodec::codecForName(args.at(i + 1).toLatin1());
      if (codec == 0) {
        err() << "unknown codec: " << args.at(i + 1) << "\n" << Qt::flush;
        *ok = false;
        return rest;
      }
      QTextCodec::setCodecForLocale(codec);
      i += 1;
      continue;
    }

    if (arg == "--load-cmdline" || arg == "--steps" || arg == "--capture" ||
        arg == "--out") {
      if (i + 1 >= args.size()) {
        err() << arg << " needs a value\n" << usage() << Qt::flush;
        *ok = false;
        return rest;
      }
      const QString value = args.at(i + 1);
      i += 1;

      if (arg == "--load-cmdline") {
        loadFile = value;
      } else if (arg == "--steps") {
        bool parsed = false;
        steps_ = value.toInt(&parsed);
        if (!parsed || steps_ < 0) {
          err() << "--steps needs a non-negative integer, got: " << value
                << "\n"
                << Qt::flush;
          *ok = false;
          return rest;
        }
      } else if (arg == "--capture") {
        Capture capture;
        capture.panel = value;
        captures_.append(capture);
      } else {  // --out
        if (captures_.isEmpty() || !captures_.last().out.isEmpty()) {
          err() << "--out must follow a --capture\n" << usage() << Qt::flush;
          *ok = false;
          return rest;
        }
        captures_.last().out = value;
      }
      continue;
    }

    rest.append(arg);
  }

  for (int i = 0; i < captures_.size(); i += 1) {
    if (captures_.at(i).out.isEmpty()) {
      err() << "--capture " << captures_.at(i).panel << " has no --out\n"
            << usage() << Qt::flush;
      *ok = false;
      return rest;
    }
  }

  // Loaded through the same path as a file named on the command line.
  if (!loadFile.isEmpty()) {
    rest.append(loadFile);
  }
  return rest;
}

void EduDevtools::beginHeadless() {
  if (dialogTimer_ != 0) {
    return;
  }
  dialogTimer_ = new QTimer(this);
  dialogTimer_->setInterval(10);
  connect(dialogTimer_, SIGNAL(timeout()), this,
          SLOT(dismissBlockingDialog()));
  dialogTimer_->start();
}

void EduDevtools::scheduleRun(SpimView* window) {
  window_ = window;
  QTimer::singleShot(0, this, SLOT(run()));
}

// Give the widgets a chance to lay out and repaint before grabbing them.
void EduDevtools::settle() {
  for (int i = 0; i < 3; i += 1) {
    QApplication::processEvents(QEventLoop::AllEvents, 50);
  }
}

QWidget* EduDevtools::panelWidget(const QString& name) const {
  Ui::SpimView* ui = window_->ui;

  if (name == "intregs") return ui->IntRegDockWidget;
  if (name == "fpregs") return ui->FPRegDockWidget;
  if (name == "text") return ui->TextSegDockWidget;
  if (name == "data") return ui->DataSegDockWidget;
  if (name == "editor") return window_->eduEditor;
  if (name == "log") return ui->centralWidget;
  if (name == "inspector") return window_->eduInspector;
  if (name == "console") return window_->SpimConsole;
  if (name == "window") return window_;
  return 0;
}

bool EduDevtools::grabToFile(QWidget* widget, const QString& path) {
  QPixmap pixmap = widget->grab();
  // The tour is a window of its own (edu/edu_tutorial.h), so a grab of the
  // main window does not contain it.  For a screenshot of the whole window
  // the two are put back together, which is what the person sees.
  if (widget == window_ && window_->eduTutorial != 0 &&
      window_->eduTutorial->isVisible()) {
    QPixmap overlay = window_->eduTutorial->grab();
    QPainter painter(&pixmap);
    painter.drawPixmap(0, 0, overlay);
  }
  if (pixmap.isNull()) {
    err() << "nothing to grab for " << path << "\n" << Qt::flush;
    return false;
  }
  if (!pixmap.save(path, "PNG")) {
    err() << "cannot write " << path << "\n" << Qt::flush;
    return false;
  }
  out() << "wrote " << QFileInfo(path).absoluteFilePath() << " ("
        << pixmap.width() << "x" << pixmap.height() << ")\n"
        << Qt::flush;
  return true;
}

// Built by the same core function the terminal spim uses for its
// "print_all_regs" command (CPU/display-utils.cpp), so the two dumps are
// directly comparable.
QString EduDevtools::registerDump() const {
  str_stream ss;
  ss.initialized = 0;
  ss_clear(&ss);
  format_registers(&ss, 0, 0);
  // spim's print_all_regs writes "%s\n"; match it.
  return QString::fromLatin1(ss_to_string(&ss)) + QLatin1String("\n");
}

bool EduDevtools::writeDump(const Dump& dump) {
  QString text;
  if (dump.stream == "console") {
    text = window_->SpimConsole->toPlainText();
  } else if (dump.stream == "log") {
    text = window_->ui->centralWidget->toPlainText();
  } else if (dump.stream == "intregs-log") {
    text = window_->intRegistersLogText();
  } else if (dump.stream == "text-log") {
    text = window_->textSegmentLogText();
  } else if (dump.stream == "data-log") {
    text = window_->dataSegmentLogText();
  } else {
    text = registerDump();
  }

  QFile file(dump.out);
  if (!file.open(QIODevice::WriteOnly | QIODevice::Truncate)) {
    err() << "cannot write " << dump.out << "\n" << Qt::flush;
    return false;
  }
  QTextStream stream(&file);
  stream << text;
  file.close();

  out() << "wrote " << QFileInfo(dump.out).absoluteFilePath() << " ("
        << dump.stream << ", " << text.size() << " chars)\n"
        << Qt::flush;
  return true;
}

// SPIM reports run-time errors by calling error()/run_error(), which end up
// in SpimView::Error and raise a modal QMessageBox -- one per error, from
// inside run_spim().  A headless run would block there forever, so answer
// them.  OK is the dialog's default and means "carry on", which is what the
// terminal spim does; Abort would set force_break and stop the program.
void EduDevtools::dismissBlockingDialog() {
  // Upstream's breakpoint dialog is not modal, but sim_Run() spins until one
  // of its buttons is pressed.  Answer "Abort", which stops at the
  // breakpoint.
  const QWidgetList tops = QApplication::topLevelWidgets();
  for (int i = 0; i < tops.size(); i += 1) {
    QAbstractButton* abort =
        tops.at(i)->isVisible()
            ? tops.at(i)->findChild<QAbstractButton*>("abortPushButton")
            : 0;
    if (abort != 0) {
      QLabel* label = tops.at(i)->findChild<QLabel*>("label");
      out() << "breakpoint dialog: "
            << (label != 0 ? label->text() : QString()) << " -> Abort\n"
            << Qt::flush;
      if (!dialogShotDir_.isEmpty()) {
        grabToFile(tops.at(i), dialogShotDir_ + QString("/breakpoint-dialog.png"));
      }
      abort->click();
      tops.at(i)->hide();
      return;
    }
  }

  QWidget* modal = QApplication::activeModalWidget();

  if (modal == 0) {
    return;
  }

  // The editor's questions: reload a file changed on disk -> Yes; unsaved
  // changes -> Discard (a script that wants them saved says --editor-save).
  if (modal->objectName() == "EduEditorReloadQuestion" ||
      modal->objectName() == "EduEditorSaveQuestion") {
    QMessageBox* question = qobject_cast<QMessageBox*>(modal);
    const bool reload = modal->objectName() == "EduEditorReloadQuestion";
    out() << "editor question: " << question->text() << " -> "
          << (reload ? "Yes" : "Discard") << "\n" << Qt::flush;
    question->button(reload ? QMessageBox::Yes : QMessageBox::Discard)->click();
    return;
  }

  // Load File while a program is loaded (SpimView::eduConfirmLoadOnTop()).
  if (modal->objectName() == "EduLoadConfirm") {
    const QString answer =
        loadAnswers_.isEmpty() ? QString("add") : loadAnswers_.takeFirst();
    out() << "load question: answered " << answer << "\n" << Qt::flush;
    if (!dialogShotDir_.isEmpty()) {
      grabToFile(modal, dialogShotDir_ + QString("/load-question.png"));
    }
    QAbstractButton* button = modal->findChild<QAbstractButton*>(
        answer == "reinit" ? "EduLoadReinitialize" : "EduLoadAdd");
    if (answer == "cancel") {
      // A cancelled Load File never opens the file dialog.
      pendingMenuFile_.clear();
      modal->close();
    } else if (button != 0) {
      button->click();
    }
    return;
  }

  // --menu-load / --menu-reload: the file dialog the menu slot opened.  (A
  // Qt dialog: a development run has no platform theme to offer a native
  // one.  Acting before it is the active modal widget would return no file.)
  QFileDialog* files = qobject_cast<QFileDialog*>(modal);
  if (files != 0) {
    if (pendingMenuFile_.isEmpty()) {
      return;  // already answered; its queued accept() is on the way
    }
    const QString file = pendingMenuFile_;
    pendingMenuFile_.clear();
    // Type the path into the dialog's own line edit.  (selectFile() leaves
    // the line edit alone once it has the focus, which depends on timing.)
    QLineEdit* name = files->findChild<QLineEdit*>("fileNameEdit");
    if (name == 0) {
      err() << "the file dialog has no fileNameEdit\n" << Qt::flush;
      status_ = 2;
      files->reject();
      return;
    }
    name->setText(file);
    QMetaObject::invokeMethod(files, "accept", Qt::QueuedConnection);
    return;
  }

  dismissedDialogs_ += 1;
  if (!dialogShotDir_.isEmpty()) {
    grabToFile(modal, QString("%1/dialog-%2.png")
                          .arg(dialogShotDir_)
                          .arg(dismissedDialogs_, 3, 10, QLatin1Char('0')));
  }
  QMessageBox* box = qobject_cast<QMessageBox*>(modal);
  if (box != 0) {
    // Rich-text dialogs are reported as plain text so scripts can grep them.
    QTextDocument document;
    document.setHtml(box->text());
    out() << "dialog: " << document.toPlainText().simplified().left(600)
          << "\n"
          << Qt::flush;
    QAbstractButton* ok = box->button(QMessageBox::Ok);
    if (ok != 0) {
      ok->click();
      return;
    }
  }
  modal->close();
}

// The About box is modal, so it cannot be grabbed by the code that opens
// it.  This runs from the dialog's own event loop.
void EduDevtools::captureModalDialog() {
  QWidget* modal = QApplication::activeModalWidget();
  if (modal == 0) {
    err() << "no modal dialog to capture\n" << Qt::flush;
    status_ = 1;
    return;
  }
  if (!grabToFile(modal, modalOut_)) {
    status_ = 1;
  }
  modal->close();
}

// --font-dir, --ui-font, --qss and --icon-dir: the appearance-only part of a
// theme, so that a design can be captured before any widget code changes.
void EduDevtools::applyThemeOptions() {
  for (int i = 0; i < fontDirs_.size(); i += 1) {
    const QDir dir(fontDirs_.at(i));
    const QStringList files =
        dir.entryList(QStringList() << "*.ttf" << "*.otf", QDir::Files);
    for (int j = 0; j < files.size(); j += 1) {
      const int id = QFontDatabase::addApplicationFont(dir.filePath(files.at(j)));
      if (id < 0) {
        err() << "cannot load font " << files.at(j) << "\n" << Qt::flush;
        status_ = 2;
      } else {
        out() << "font: " << QFontDatabase::applicationFontFamilies(id).join(", ")
              << "\n" << Qt::flush;
      }
    }
  }

  if (!uiFont_.isEmpty()) {  // "Family,13px" or "Family,10pt"
    QFont font(uiFont_.section(',', 0, 0));
    const QString size = uiFont_.section(',', 1, 1).trimmed();
    if (size.endsWith("px")) {
      font.setPixelSize(size.left(size.size() - 2).toInt());
    } else if (size.endsWith("pt")) {
      font.setPointSizeF(size.left(size.size() - 2).toDouble());
    }
    QApplication::setFont(font);
  }

  if (!qssFile_.isEmpty()) {
    QFile file(qssFile_);
    if (!file.open(QIODevice::ReadOnly)) {
      err() << "cannot read " << qssFile_ << "\n" << Qt::flush;
      status_ = 2;
    } else {
      qApp->setStyleSheet(QString::fromUtf8(file.readAll()));
    }
  }

  if (!iconDir_.isEmpty()) {
    const QDir dir(iconDir_);
    const QList<QAction*> actions = window_->findChildren<QAction*>();
    int applied = 0;
    for (int i = 0; i < actions.size(); i += 1) {
      QAction* action = actions.at(i);
      const QString name = action->objectName();
      if (name.isEmpty() || !dir.exists(name + ".svg")) {
        continue;
      }
      QIcon icon(dir.filePath(name + ".svg"));
      if (dir.exists(name + ".active.svg")) {
        icon.addFile(dir.filePath(name + ".active.svg"), QSize(), QIcon::Active);
      }
      if (dir.exists(name + ".disabled.svg")) {
        icon.addFile(dir.filePath(name + ".disabled.svg"), QSize(),
                     QIcon::Disabled);
      }
      action->setIcon(icon);
      applied += 1;
      // The Assemble button keeps its caption next to the icon.
      QToolButton* button = qobject_cast<QToolButton*>(
          window_->ui->toolBar->widgetForAction(action));
      if (button != 0 && name == "action_Edu_Assemble") {
        button->setToolButtonStyle(Qt::ToolButtonTextBesideIcon);
      }
    }
    out() << "icons: " << applied << " actions\n" << Qt::flush;
  }
}

void EduDevtools::run() {
  settle();
  applyThemeOptions();

  // The window title is not part of a QWidget::grab() (the frame belongs to
  // the window manager), so report it here for branding checks.
  out() << "window title: " << window_->windowTitle() << "\n" << Qt::flush;

  // Single-step, but stop if the program has finished: the vanilla
  // sim_SingleStep() restarts a stopped program from its entry point
  // (menu.cpp initializePCAndStack), which would silently make the
  // screenshot show a second run.  The status bar is the only public
  // indication of that state.
  if (windowSize_.isValid()) {
    // A window manager can hand a window less than its layout's minimum
    // (tiling, a restored geometry, a small screen).  Lift the constraint so
    // that case can be reproduced here too.
    window_->layout()->setSizeConstraint(QLayout::SetNoConstraint);
    window_->setMinimumSize(1, 1);
    window_->resize(windowSize_);
    settle();
  }

  if (regBase_ == 2) {
    window_->ui->action_Reg_DisplayBinary->trigger();
  } else if (regBase_ == 10) {
    window_->ui->action_Reg_DisplayDecimal->trigger();
  } else if (regBase_ == 16) {
    window_->ui->action_Reg_DisplayHex->trigger();
  }

  // The menu actions themselves, file dialog included: what a user does.
  for (int i = 0; i < menuLoads_.size(); i += 1) {
    const bool reload = menuLoads_.at(i).startsWith('R');
    pendingMenuFile_ = menuLoads_.at(i).mid(1);
    out() << (reload ? "menu: Reinitialize and Load File " : "menu: Load File ")
          << pendingMenuFile_ << "\n" << Qt::flush;
    (reload ? window_->ui->action_File_Reload : window_->ui->action_File_Load)
        ->trigger();
    if (!pendingMenuFile_.isEmpty()) {
      err() << "the file dialog never came up\n" << Qt::flush;
      pendingMenuFile_.clear();
      status_ = 2;
    }
    settle();
    int instructions = 0;
    for (mem_addr a = TEXT_BOT; a < text_top; a += 4) {
      instructions += read_mem_inst(a) != NULL ? 1 : 0;
    }
    out() << "user text: " << instructions << " instructions\n" << Qt::flush;
  }

  for (int i = 0; i < editorSteps_.size(); i += 1) {
    const QString step = editorSteps_.at(i).section('=', 0, 0);
    const QString value = editorSteps_.at(i).section('=', 1);
    EduEditorDock* dock = window_->eduEditor;
    if (step == "open") {
      if (!dock->openFile(QFileInfo(value).absoluteFilePath(), false)) {
        err() << "editor could not open " << value << "\n" << Qt::flush;
        status_ = 2;
      }
    } else if (step == "load") {  // File > Load File, where the order matters
      pendingMenuFile_ = QFileInfo(value).absoluteFilePath();
      window_->ui->action_File_Load->trigger();
      if (!pendingMenuFile_.isEmpty()) {
        err() << "the file dialog never came up\n" << Qt::flush;
        pendingMenuFile_.clear();
        status_ = 2;
      }
      settle();
    } else if (step == "trigger") {  // an action, in step order
      QAction* action = window_->findChild<QAction*>(value);
      if (action == 0) {
        err() << "no action named " << value << "\n" << Qt::flush;
        status_ = 2;
      } else {
        action->trigger();
      }
    } else if (step == "goto-line") {
      dock->editor()->goToLine(value.toInt());
    } else if (step == "type") {
      QString text = value;
      text.replace("\\n", "\n");
      dock->editor()->insertPlainText(text);
    } else if (step == "save") {  // saving is assembling
      window_->findChild<QAction*>("action_Edu_Assemble")->trigger();
    } else if (step == "save-as") {
      pendingMenuFile_ = QFileInfo(value).absoluteFilePath();
      window_->findChild<QAction*>("action_Edu_SaveAs")->trigger();
    } else if (step == "rewrite-on-disk") {
      QFile file(dock->filePath());
      if (file.open(QIODevice::WriteOnly | QIODevice::Truncate)) {
        QString text = value;
        text.replace("\\n", "\n");
        file.write(text.toUtf8());
        file.close();
      }
      // The watcher's signal, its 150 ms delay and the question box.
      for (int n = 0; n < 40; n += 1) {
        QApplication::processEvents(QEventLoop::AllEvents, 20);
        QThread::msleep(10);
      }
    } else if (step == "key") {
      // As QTest::keyClick() does it: through the window system interface,
      // which is the only route on which shortcuts are looked up.
      window_->activateWindow();
      QApplication::setActiveWindow(window_);
      // "text:ctrl+=" sends the key with the Text panel focused instead, to
      // show that the editor's own shortcuts do not reach across panels.
      QString what = value.toLower();
      if (what.startsWith("text:")) {
        what = what.mid(5);
        window_->ui->TextSegDockWidget->raise();
        window_->ui->TextSegView->setFocus();
      } else {
        dock->editor()->setFocus();
      }
      settle();
      int key = Qt::Key_F3;
      Qt::KeyboardModifiers mods = Qt::NoModifier;
      if (what == "ctrl+s") {
        key = Qt::Key_S;
        mods = Qt::ControlModifier;
      } else if (what == "ctrl+=" || what == "ctrl++") {
        key = (what == "ctrl+=") ? Qt::Key_Equal : Qt::Key_Plus;
        mods = Qt::ControlModifier;
      } else if (what == "ctrl+-") {
        key = Qt::Key_Minus;
        mods = Qt::ControlModifier;
      } else if (what == "ctrl+0") {
        key = Qt::Key_0;
        mods = Qt::ControlModifier;
      }
      qt_handleKeyEvent(window_->windowHandle(), QEvent::KeyPress, key, mods,
                        QString(), false, 1);
      qt_handleKeyEvent(window_->windowHandle(), QEvent::KeyRelease, key, mods,
                        QString(), false, 1);
      settle();
      out() << "key " << value << ": " << dock->errorCount()
            << " error(s), editor " << dock->editor()->pointSize() << "pt\n"
            << Qt::flush;
    } else if (step == "click-banner") {
      QAbstractButton* banner =
          window_->ui->TextSegDockWidget->findChild<QAbstractButton*>("EduStaleBanner");
      if (banner != 0 && !banner->isHidden()) {
        banner->click();
      } else {
        err() << "the strip is not showing\n" << Qt::flush;
        status_ = 2;
      }
    } else if (step == "report") {
      const QAbstractButton* banner =
          window_->ui->TextSegDockWidget->findChild<QAbstractButton*>("EduStaleBanner");
      const QLabel* badge = window_->findChild<QLabel*>("EduAssembleBadge");
      // isVisible() is true for every tab of a dock group; the tab in front
      // is the one with something to paint.
      const QString front =
          !window_->ui->TextSegView->visibleRegion().isEmpty()
              ? QString("Text")
              : (!dock->editor()->visibleRegion().isEmpty() ? QString("Editor")
                                                            : QString("other"));
      const bool editorOn = !dock->editor()->visibleRegion().isEmpty();
      out() << "editor: file=" << QFileInfo(dock->filePath()).fileName()
            << " modified=" << (dock->isModified() ? 1 : 0)
            << " banner=" << (banner != 0 && !banner->isHidden() ? 1 : 0)
            << " front=" << front << " errors=" << dock->errorCount()
            << " status=\"" << window_->statusBar()->currentMessage() << "\""
            << " badge=\""
            << (badge != 0 && !badge->isHidden() ? badge->text() : QString())
            << "\" editor_onscreen=" << (editorOn ? 1 : 0)
            // New fields go at the end: the checks match on runs of the
            // older ones (tools/check-editor.sh).
            << " pt=" << dock->editor()->pointSize() << " bannertext=\""
            << (banner != 0 && !banner->isHidden() ? banner->text() : QString())
            << "\"\n" << Qt::flush;
    } else if (step == "assemble") {
      window_->findChild<QAction*>("action_Edu_Assemble")->trigger();
      out() << "assemble: " << dock->errorCount() << " error(s)\n" << Qt::flush;
    }
    settle();
  }

  for (int i = 0; i < triggers_.size(); i += 1) {
    QAction* action = window_->findChild<QAction*>(triggers_.at(i));
    if (action == 0) {
      err() << "no action named " << triggers_.at(i) << "\n" << Qt::flush;
      status_ = 2;
    } else {
      action->trigger();
    }
  }
  for (int i = 0; i < breakpoints_.size(); i += 1) {
    add_breakpoint(breakpoints_.at(i));
  }
  if (!breakpoints_.isEmpty() || redisplay_) {
    window_->DisplayTextSegments(true);
    window_->UpdateDataDisplay();
  }
  settle();

  QElapsedTimer stopwatch;
  stopwatch.start();

  if (runToCompletion_) {
    window_->sim_Run();
  }

  for (int i = 0; i < steps_; i += 1) {
    if (window_->statusBar()->currentMessage() == "Stopped") {
      out() << "program stopped after " << i << " of " << steps_
            << " steps\n"
            << Qt::flush;
      break;
    }
    window_->sim_SingleStep();
  }

  for (int i = 0; i < setRegisters_.size(); i += 1) {
    const QString name = setRegisters_.at(i).section('=', 0, 0);
    const QString text = setRegisters_.at(i).section('=', 1);
    edu::RegisterRef reg;
    quint32 value = 0;
    if (edu::findRegister(name, &reg) && edu::parseValue32(text, 16, &value)) {
      window_->eduRegisterModel->writeRegister(reg, value);
      window_->DisplayIntRegisters();
      window_->DisplayFPRegisters();
    } else {
      err() << "bad --set-register: " << setRegisters_.at(i) << "\n"
            << Qt::flush;
      status_ = 2;
    }
  }

  if (!selectRegister_.isEmpty()) {
    edu::RegisterRef reg;
    if (edu::findRegister(selectRegister_, &reg)) {
      window_->ui->IntRegView->selectRegister(reg);
    } else {
      err() << "unknown register: " << selectRegister_ << "\n" << Qt::flush;
      status_ = 2;
    }
  }

  if (expandKernel_) {
    window_->eduTextModel->setKernelExpanded(true);
  }
  for (int i = 0; i < clickBreakpoints_.size(); i += 1) {
    // A real mouse click on the BP cell, through the view's own handlers.
    const quint32 address = clickBreakpoints_.at(i);
    EduTextView* view = window_->ui->TextSegView;
    const int row = window_->eduTextModel->rowOfAddress(address);
    if (row < 0) {
      err() << "no instruction shown at 0x" << QString::number(address, 16)
            << "\n" << Qt::flush;
      status_ = 2;
      continue;
    }
    const QModelIndex cell =
        window_->eduTextModel->index(row, EduTextModel::BpColumn);
    view->scrollTo(cell);
    const QPoint at = view->visualRect(cell).center();
    QMouseEvent press(QEvent::MouseButtonPress, at, Qt::LeftButton,
                      Qt::LeftButton, Qt::NoModifier);
    QMouseEvent release(QEvent::MouseButtonRelease, at, Qt::LeftButton,
                        Qt::NoButton, Qt::NoModifier);
    QApplication::sendEvent(view->viewport(), &press);
    QApplication::sendEvent(view->viewport(), &release);
    out() << "clicked BP cell of 0x" << edu::hex32Digits(address) << ": "
          << (inst_is_breakpoint(address) ? "breakpoint set" : "no breakpoint")
          << "\n" << Qt::flush;
  }

  if (hasSelectInstruction_) {
    if (window_->eduTextModel->rowOfAddress(selectInstruction_) >= 0) {
      window_->ui->TextSegView->selectAddress(selectInstruction_);
    } else {
      err() << "no instruction shown at 0x"
            << QString::number(selectInstruction_, 16) << "\n" << Qt::flush;
      status_ = 2;
    }
  }

  if (!raisePanel_.isEmpty()) {
    QWidget* panel = panelWidget(raisePanel_);
    if (panel != 0) {
      panel->show();
      panel->raise();
    } else {
      err() << "unknown panel: " << raisePanel_ << "\n" << Qt::flush;
      status_ = 2;
    }
  }
  if (layoutReport_) {
    settle();
    struct { const char* name; QWidget* w; QWidget* content; } const panels[] = {
        {"editor", window_->eduEditor, window_->eduEditor->editor()},
        {"text", window_->ui->TextSegDockWidget, window_->ui->TextSegView},
        {"data", window_->ui->DataSegDockWidget, window_->ui->DataSegPanel},
        {"log", window_->ui->centralWidget, window_->ui->centralWidget},
    };
    for (unsigned i = 0; i < sizeof(panels) / sizeof(panels[0]); i += 1) {
      const QRect r(panels[i].w->mapTo(window_, QPoint(0, 0)), panels[i].w->size());
      out() << "layout: " << panels[i].name << " x=" << r.x() << " y=" << r.y()
            << " w=" << r.width() << " h=" << r.height() << " onscreen="
            << (!panels[i].w->isHidden() && !panels[i].content->visibleRegion().isEmpty() ? 1 : 0)
            << "\n" << Qt::flush;
    }
    out() << "layout: text instruction column " 
          << window_->ui->TextSegView->columnWidth(EduTextModel::InstructionColumn)
          << " source column " << window_->ui->TextSegView->columnWidth(EduTextModel::SourceColumn)
          << "\n" << Qt::flush;
  }

  for (int i = 0; i < dragInspector_.size(); i += 1) {
    const int dy = dragInspector_.at(i);
    EduInspector* dock = window_->eduInspector;
    if (dy != 0) {
      // The separator is the gap just above the dock; QMainWindow handles
      // the mouse events on it itself (no child widget there).
      const QPoint top = dock->mapTo(window_, QPoint(dock->width() / 2, 0));
      const QPoint from(top.x(), top.y() - 2);
      const QPoint to(from.x(), from.y() + dy);
      const QPoint fromG = window_->mapToGlobal(from);
      const QPoint toG = window_->mapToGlobal(to);
      if (window_->childAt(from) != 0) {
        err() << "no separator at " << from.x() << "," << from.y() << "\n"
              << Qt::flush;
        status_ = 2;
      }
      QMouseEvent press(QEvent::MouseButtonPress, from, fromG, Qt::LeftButton,
                        Qt::LeftButton, Qt::NoModifier);
      QMouseEvent move(QEvent::MouseMove, to, toG, Qt::NoButton, Qt::LeftButton,
                       Qt::NoModifier);
      QMouseEvent release(QEvent::MouseButtonRelease, to, toG, Qt::LeftButton,
                          Qt::NoButton, Qt::NoModifier);
      QApplication::sendEvent(window_, &press);
      QApplication::sendEvent(window_, &move);
      settle();
      QApplication::sendEvent(window_, &release);
      settle();
    }
    settle();
    out() << "inspector: height=" << dock->widget()->height()
          << " preferred=" << dock->preferredHeight()
          << " locked=" << (dock->isHeightLocked() ? 1 : 0)
          << " userSized=" << (window_->eduInspectorUserSized ? 1 : 0)
          << " intregs_height=" << window_->ui->IntRegDockWidget->height()
          << " column_width=" << dock->width()
          << "\n" << Qt::flush;
  }

  if (expandEnvironment_) {
    window_->eduDataModel->setEnvironmentExpanded(true);
  }
  if (expandKernelData_) {
    window_->eduDataModel->setSegmentExpanded(EduDataModel::KernelData, true);
  }
  for (int i = 0; i < setMemory_.size(); i += 1) {
    bool okAddress = false;
    bool okValue = false;
    const quint32 address = setMemory_.at(i).section('=', 0, 0).toUInt(&okAddress, 16);
    const quint32 value = setMemory_.at(i).section('=', 1).toUInt(&okValue, 16);
    if (okAddress && okValue) {
      window_->ui->DataSegPanel->view()->writeWord(address, value);
    } else {
      err() << "bad --set-memory: " << setMemory_.at(i) << "\n" << Qt::flush;
      status_ = 2;
    }
  }
  for (int i = 0; i < goTos_.size(); i += 1) {
    if (!window_->ui->DataSegPanel->goTo(goTos_.at(i))) {
      err() << "Go to failed: " << goTos_.at(i) << "\n" << Qt::flush;
      status_ = 2;
    }
  }

  if (reportTime_) {
    out() << "elapsed_ms " << stopwatch.elapsed() << " (run="
          << (runToCompletion_ ? 1 : 0) << " steps=" << steps_ << ")\n"
          << Qt::flush;
  }

  // A drag and drop of the editor onto the text panel, which is what
  // splitDockWidget() is: the program should even the two out afterwards.
  if (!dockDrop_.isEmpty()) {
    const bool horizontal = dockDrop_.startsWith('h');
    // What a drag and drop leaves behind: the two panels split along one
    // axis, with whatever proportion the drop indicator happened to show.
    // Qt gives no way to drive a real drag here, so the lopsided result is
    // made directly and the program is then asked to even it out.
    window_->addDockWidget(Qt::TopDockWidgetArea, window_->eduEditor);
    window_->addDockWidget(Qt::TopDockWidgetArea, window_->ui->TextSegDockWidget);
    window_->splitDockWidget(window_->eduEditor, window_->ui->TextSegDockWidget,
                             horizontal ? Qt::Horizontal : Qt::Vertical);
    QList<QDockWidget*> pair;
    pair << window_->eduEditor << window_->ui->TextSegDockWidget;
    QList<int> lopsided;
    lopsided << 1700 << 220;
    window_->resizeDocks(pair, lopsided, horizontal ? Qt::Horizontal
                                                    : Qt::Vertical);
    const char* const axis = horizontal ? "horizontal" : "vertical";
    out() << "dock drop " << axis << " requested: editor " << lopsided.at(0)
          << " text " << lopsided.at(1) << "\n" << Qt::flush;

    // The move itself is what the program answers, through
    // dockLocationChanged: by the time the events have been delivered it
    // has evened the two out by itself.  That is the behaviour under test,
    // so it is measured first and on its own.
    settle();
    QRect text = window_->ui->TextSegDockWidget->geometry();
    QRect editor = window_->eduEditor->geometry();
    int a = horizontal ? text.width() : text.height();
    int b = horizontal ? editor.width() : editor.height();
    out() << "dock drop " << axis << " after the drop: editor " << b
          << " text " << a << " difference " << qAbs(a - b) << "\n"
          << Qt::flush;
    if (qAbs(a - b) > 2) {
      status_ = 1;
    }

    // And again on demand, which must not move anything further.
    window_->eduEqualiseDocks();
    settle();
    text = window_->ui->TextSegDockWidget->geometry();
    editor = window_->eduEditor->geometry();
    a = horizontal ? text.width() : text.height();
    b = horizontal ? editor.width() : editor.height();
    out() << "dock drop " << axis << " asked again: editor " << b << " text "
          << a << " difference " << qAbs(a - b) << "\n" << Qt::flush;
    if (qAbs(a - b) > 2) {
      status_ = 1;
    }
  }

  // Every step of the tour, with the card's rectangle: the harness checks
  // that it never leaves the window (docs/ARCHITECTURE.md 12, 70).
  if (tutorialReport_) {
    window_->eduShowTutorial();
    EduTutorial* tour = window_->eduTutorial;
    if (tour == 0) {
      err() << "no tutorial\n" << Qt::flush;
      status_ = 2;
    } else {
      // Which program the tour is walking through, and what its first step
      // says about it: the sample only opens over an empty editor.
      out() << "tutorial sample=" << (tour->usingOwnProgram() ? 0 : 1)
            << " steps=" << tour->stepCount() << "\n" << Qt::flush;
      tour->start(0);
      settle();
      out() << "tutorial welcome: " << tour->bodyText().simplified() << "\n"
            << Qt::flush;
      const QRect window(QPoint(0, 0), window_->size());
      for (int i = 0; i < tour->stepCount(); i += 1) {
        tour->start(i);
        settle();
        const QRect card = tour->cardRect();
        const bool inside = window.contains(card);
        out() << "tutorial step " << (i + 1) << "/" << tour->stepCount()
              << " card " << card.x() << "," << card.y() << " "
              << card.width() << "x" << card.height() << " window "
              << window.width() << "x" << window.height() << " inside="
              << (inside ? 1 : 0) << " " << tour->stepName(i) << "\n"
              << Qt::flush;
        if (!inside) {
          status_ = 1;
        }
      }
    }
  }

  // The first-run tour, at one step, for a screenshot of it.
  if (tutorialStep_ > 0) {
    window_->eduShowTutorial();
    if (window_->eduTutorial != 0) {
      window_->eduTutorial->start(tutorialStep_ - 1);
      out() << "tutorial: step " << tutorialStep_ << " of "
            << window_->eduTutorial->stepCount() << "\n" << Qt::flush;
    }
    settle();
    settle();  // a raised tab needs one more turn before its geometry is right
  }

  // Stop before the captures: the About box below is a modal dialog this
  // harness opens on purpose and must not answer for itself.
  if (dialogTimer_ != 0) {
    dialogTimer_->stop();
  }
  if (dismissedDialogs_ > 0) {
    out() << "answered " << dismissedDialogs_ << " dialog(s) with OK\n"
          << Qt::flush;
  }
  settle();

  for (int i = 0; i < captures_.size(); i += 1) {
    const Capture& capture = captures_.at(i);

    if (capture.panel == "about") {
      modalOut_ = capture.out;
      QTimer::singleShot(100, this, SLOT(captureModalDialog()));
      window_->help_AboutSPIM();  // blocks until captureModalDialog closes it
      continue;
    }

    if (capture.panel == "splash") {  // the screen main() shows at start-up
      edu::theme::EduSplash splash;
      splash.setAttribute(Qt::WA_DontShowOnScreen);
      splash.show();
      settle();
      const QPixmap pixmap = splash.grab();
      splash.close();
      if (!pixmap.save(capture.out, "PNG")) {
        err() << "cannot write " << capture.out << "\n" << Qt::flush;
        status_ = 1;
      } else {
        out() << "wrote " << QFileInfo(capture.out).absoluteFilePath() << " ("
              << pixmap.width() << "x" << pixmap.height() << ")\n" << Qt::flush;
      }
      continue;
    }

    QWidget* widget = panelWidget(capture.panel);
    if (widget == 0) {
      err() << "unknown panel: " << capture.panel << "\n"
            << usage() << Qt::flush;
      status_ = 2;
      continue;
    }

    // Text/Data and IntRegs/FPRegs are tabbed onto each other, so the one
    // being captured has to be brought to the front first.
    QDockWidget* dock = qobject_cast<QDockWidget*>(widget);
    if (dock != 0) {
      dock->show();
      dock->raise();
    } else {
      widget->show();
    }
    settle();

    if (!grabToFile(widget, capture.out)) {
      status_ = 1;
    }
  }

  for (int i = 0; i < dumps_.size(); i += 1) {
    if (!writeDump(dumps_.at(i))) {
      status_ = 1;
    }
  }

  if (saveSettings_) {
    // What closing the window does before it exits (SpimView::closeEvent()).
    QCloseEvent closing;
    QApplication::sendEvent(window_, &closing);
  }
  QApplication::exit(status_);
}
