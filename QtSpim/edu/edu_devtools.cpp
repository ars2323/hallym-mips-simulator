/* See edu_devtools.h. */

#include "edu/edu_devtools.h"

#include <QAbstractButton>
#include <QApplication>
#include <QDir>
#include <QDockWidget>
#include <QElapsedTimer>
#include <QFile>
#include <QFileInfo>
#include <QLabel>
#include <QLayout>
#include <QMessageBox>
#include <QMouseEvent>
#include <QPixmap>
#include <QStatusBar>
#include <QTextDocument>
#include <QTextCodec>
#include <QTextStream>
#include <QTimer>
#include <QWidget>

// spimview.h already pulls in the core headers used here (str_stream from
// CPU/string-stream.h, format_registers from CPU/spim-utils.h). Those
// headers have no include guards, so they must not be included again.
#include "spimview.h"
#include "ui_spimview.h"

#include "edu/core/edu_format.h"
#include "edu/edu_inspector.h"
#include "edu/edu_register_model.h"
#include "edu/edu_register_view.h"
#include "edu/edu_text_model.h"
#include "edu/edu_text_view.h"

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

EduDevtools::EduDevtools(QObject* parent)
    : QObject(parent),
      runToCompletion_(false),
      regBase_(0),
      expandKernel_(false),
      hasSelectInstruction_(false),
      selectInstruction_(0),
      reportTime_(false),
      redisplay_(false),
      steps_(0),
      window_(0),
      dialogTimer_(0),
      dismissedDialogs_(0),
      status_(0) {}

QString EduDevtools::usage() {
  return QString(
      "QtSpim-Edu development options (CONFIG+=edu_devtools builds only):\n"
      "  --load <file.s>        assembly file to load\n"
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
      "  --set-register <r>=<hex> edit a register as the user would; repeatable\n"
      "  --trigger <action>     trigger a menu action by object name; repeatable\n"
      "  --redisplay            force a full redraw after the triggers\n"
      "  --breakpoint <hexaddr> set a breakpoint; repeatable\n"
      "  --time                 report the duration of the run/step phase\n"
      "  --reg-base <2|10|16>   choose Registers > Binary/Decimal/Hex\n"
      "  --local-codec <name>   pretend the system text encoding is <name>\n"
      "  --dialog-shots <dir>   save a PNG of every dialog answered\n"
      "\n"
      "  panels:  intregs fpregs text data console log window about\n"
      "           inspector\n"
      "  streams: console log regs intregs-log text-log\n"
      "           (intregs-log = what Save Log File writes for Int Regs)\n");
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
          dump.stream != "text-log") {
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

    if (arg == "--load" || arg == "--steps" || arg == "--capture" ||
        arg == "--out") {
      if (i + 1 >= args.size()) {
        err() << arg << " needs a value\n" << usage() << Qt::flush;
        *ok = false;
        return rest;
      }
      const QString value = args.at(i + 1);
      i += 1;

      if (arg == "--load") {
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
  if (name == "log") return ui->centralWidget;
  if (name == "inspector") return window_->eduInspector;
  if (name == "console") return window_->SpimConsole;
  if (name == "window") return window_;
  return 0;
}

bool EduDevtools::grabToFile(QWidget* widget, const QString& path) {
  const QPixmap pixmap = widget->grab();
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

void EduDevtools::run() {
  settle();

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

  if (reportTime_) {
    out() << "elapsed_ms " << stopwatch.elapsed() << " (run="
          << (runToCompletion_ ? 1 : 0) << " steps=" << steps_ << ")\n"
          << Qt::flush;
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

  QApplication::exit(status_);
}
