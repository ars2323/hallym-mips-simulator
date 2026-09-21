/* See edu_devtools.h. */

#include "edu/edu_devtools.h"

#include <QAbstractButton>
#include <QApplication>
#include <QDockWidget>
#include <QFile>
#include <QFileInfo>
#include <QMessageBox>
#include <QPixmap>
#include <QStatusBar>
#include <QTextStream>
#include <QTimer>
#include <QWidget>

// spimview.h already pulls in the core headers used here (str_stream from
// CPU/string-stream.h, format_registers from CPU/spim-utils.h). Those
// headers have no include guards, so they must not be included again.
#include "spimview.h"
#include "ui_spimview.h"

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
      "\n"
      "  panels:  intregs fpregs text data console log window about\n"
      "  streams: console log regs\n");
}

QStringList EduDevtools::takeOptions(const QStringList& args, bool* ok) {
  QStringList rest;
  QString loadFile;
  *ok = true;

  for (int i = 0; i < args.size(); i += 1) {
    const QString& arg = args.at(i);

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
          dump.stream != "regs") {
        err() << "unknown dump stream: " << dump.stream << "\n"
              << usage() << Qt::flush;
        *ok = false;
        return rest;
      }
      dumps_.append(dump);
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
  QWidget* modal = QApplication::activeModalWidget();
  if (modal == 0) {
    return;
  }

  dismissedDialogs_ += 1;
  QMessageBox* box = qobject_cast<QMessageBox*>(modal);
  if (box != 0) {
    out() << "dialog: " << box->text().simplified().left(160) << "\n"
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
