/* SPIM S20 MIPS simulator.
   Terminal interface for SPIM simulator.

   Copyright (c) 1990-2022, James R. Larus.
   All rights reserved.

   Redistribution and use in source and binary forms, with or without
   modification, are permitted provided that the following conditions are met:

   Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.

   Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

   Neither the name of the James R. Larus nor the names of its contributors may
   be used to endorse or promote products derived from this software without
   specific prior written permission.

   THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
   AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
   IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
   ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
   LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
   CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
   SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
   INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
   CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
   ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
   POSSIBILITY OF SUCH DAMAGE.
*/
#include <clocale>
#include <QApplication>
#include "spimview.h"

// EDU: fork identity (name, version, settings store).
#include "edu/edu_version.h"
// EDU: warn before passing a path the core cannot open.
#include "edu/edu_path_check.h"
#include "edu/theme/edu_theme.h"  // EDU: fonts, style sheet, splash
#include "edu/theme/edu_splash.h"
#ifdef Q_OS_WIN
#include <shobjidl.h>  // EDU: SetCurrentProcessExplicitAppUserModelID
#endif

#ifdef EDU_DEVTOOLS
// EDU: scripted screenshot mode, development builds only.
#include "edu/edu_devtools.h"
#endif

static QStringList parseCommandLine(QStringList args);

SpimView* Window;
QApplication* App;

int main(int argc, char* argv[]) {
  QApplication a(argc, argv);
  setlocale(
      LC_NUMERIC,
      "C");  // Qt Linux has wrong default
             // https://doc.qt.io/qt-5/qcoreapplication.html#locale-settings
  // EDU: this fork keeps its own settings store so that it can be installed
  // and run next to the standard QtSpim without the two overwriting each
  // other's window layout.
  QCoreApplication::setOrganizationName(EDU_SETTINGS_ORG);
  QCoreApplication::setApplicationName(EDU_SETTINGS_APP);
  QCoreApplication::setApplicationVersion(EDU_VERSION);

  App = &a;
  edu::theme::apply(&a);  // EDU: before any widget exists

#ifdef Q_OS_WIN
  // EDU: without an explicit identity Windows groups the task bar button
  // under whatever launched the program and shows that program's icon.
  SetCurrentProcessExplicitAppUserModelID(L"HallymMIPS.Simulator");
#endif

  // EDU: the start-up screen, while the window is built behind it.  Not in
  // the scripted capture mode (a screenshot run must not wait for it).
  // The arguments are decoded once, here: --local-codec (below) changes the
  // locale codec, and QCoreApplication::arguments() decodes with it anew on
  // every call.
  const QStringList rawArguments = a.arguments();
#ifdef EDU_DEVTOOLS
  const bool scripted = EduDevtools::wantsCaptureMode(rawArguments);
#else
  const bool scripted = false;
#endif
#ifdef EDU_DEVTOOLS
  const bool firstRunTour = EduDevtools::wantsFirstRunTour(rawArguments);
#else
  const bool firstRunTour = false;
#endif
  edu::theme::EduSplash* splash = scripted ? 0 : edu::theme::showSplash();

  SpimView win;
  Window = &win;
  // EDU: a scripted run never opens the tour by itself -- it would load the
  // sample over whatever the script is doing.  --tutorial-step still does,
  // and --tutorial-first-run asks for exactly the start-up route.
  win.eduTourOnStart = !scripted || firstRunTour;

  // Initialize Spim
  //
  message_out.i = 1;
  console_out.i = 2;

  // EDU: with a splash up, the windows appear when it closes, so that
  // nothing of the program shows behind it.
  if (splash == 0) {
    // EDU: a scripted run has no card to answer; --tutorial-first-run asks
    // for the route the card's "take the tour" button takes.
    win.eduRevealWindows(firstRunTour);
  }

  QStringList arguments = rawArguments;

#ifdef EDU_DEVTOOLS
  // EDU: strip the development options before the vanilla parser sees them;
  // a --load file comes back as a trailing positional argument.
  EduDevtools devtools;
  bool devtoolsOk = true;
  arguments = devtools.takeOptions(arguments, &devtoolsOk);
  if (!devtoolsOk) {
    return 2;
  }
  // Before the first load: assembling a file can already raise modal error
  // dialogs, which would block a headless run.
  if (devtools.isActive()) {
    devtools.beginHeadless();
  }
#endif

  QStringList fileNames = parseCommandLine(arguments);

  win.sim_ReinitializeSimulator();

  for (int i = 0; i < fileNames.length(); i++) {
    if (fileNames[i] != "") {
      // EDU: same check as File > Load; see edu/core/edu_path_encoding.h.
      if (!edu::confirmPathLoadable(&win, fileNames[i])) {
        continue;
      }
      // EDU: read_assembly_file() with the file's labels kept; see
      // edu/edu_loader.h.
      win.eduLoadAssemblyFile(fileNames[i]);
      win.eduEditorFileLoaded(fileNames[i]);  // EDU
    }
  }

  win.eduEditorAtStartup();  // EDU: Editor tab in front unless a file was given

  win.DisplayTextSegments(true);
  win.UpdateDataDisplay();

  // EDU: the start-up card asks whether to take the tour and waits for an
  // answer; the window comes up when it has one, and the tour with it if
  // that is what was asked for (SpimView::eduRevealWindows).
  if (splash != 0) {
    QObject::connect(splash, SIGNAL(finished(bool)), &win,
                     SLOT(eduRevealWindows(bool)));
  }

#ifdef EDU_DEVTOOLS
  // EDU: run the capture script from inside the event loop, then exit.
  if (devtools.isActive()) {
    devtools.scheduleRun(&win);
  }
#endif

  return a.exec();
}

static QStringList parseCommandLine(QStringList args) {
  for (int i = 1; i < args.length(); i++) {
#ifdef WIN32
    if (args[i][0] == '/') {
      args[i][0] = '-';
    }
#endif
    if ((args[i] == "-asm") || (args[i] == "-a")) {
      bare_machine = false;
      delayed_branches = false;
      delayed_loads = false;
    } else if ((args[i] == "-bare") || (args[i] == "-b")) {
      // EDU: the bare machine is not offered in the window any more, but
      // the flag still works: the upstream test programs in Tests/ are
      // written for it, and tools/regress.sh runs them that way against a
      // vanilla build.
      bare_machine = true;
      delayed_branches = true;
      delayed_loads = true;
      quiet = true;
    } else if ((args[i] == "-delayed_branches") || (args[i] == "-db")) {
      delayed_branches = true;
    } else if ((args[i] == "-delayed_loads") || (args[i] == "-dl")) {
      delayed_loads = true;
    } else if ((args[i] == "-exception") || (args[i] == "-e")) {
      Window->SetExceptionHandler("", true);
    } else if ((args[i] == "-noexception") || (args[i] == "-ne")) {
      Window->SetExceptionHandler("", false);
    } else if ((args[i] == "-exception_file") || (args[i] == "-ef")) {
      Window->SetExceptionHandler(args[++i], true);
    } else if ((args[i] == "-mapped_io") || (args[i] == "-mio")) {
      mapped_io = true;
    } else if ((args[i] == "-nomapped_io") || (args[i] == "-nmio")) {
      mapped_io = false;
    } else if ((args[i] == "-pseudo") || (args[i] == "-p")) {
      accept_pseudo_insts = true;
    } else if ((args[i] == "-nopseudo") || (args[i] == "-np")) {
      accept_pseudo_insts = false;
    } else if ((args[i] == "-quiet") || (args[i] == "-q")) {
      quiet = true;
    } else if ((args[i] == "-noquiet") || (args[i] == "-nq")) {
      quiet = false;
    } else if ((args[i] == "-trap") || (args[i] == "-t")) {
      Window->SetExceptionHandler("", true);
    } else if ((args[i] == "-notrap") || (args[i] == "-nt")) {
      Window->SetExceptionHandler("", false);
    } else if ((args[i] == "-trap_file") || (args[i] == "-tf")) {
      Window->SetExceptionHandler(args[++i], true);
    } else if ((args[i] == "-stext") || (args[i] == "-st")) {
      initial_text_size = args[++i].toInt();
    } else if ((args[i] == "-sdata") || (args[i] == "-sd")) {
      initial_data_size = args[++i].toInt();
    } else if ((args[i] == "-ldata") || (args[i] == "-ld")) {
      initial_data_limit = args[++i].toInt();
    } else if ((args[i] == "-sstack") || (args[i] == "-ss")) {
      initial_stack_size = args[++i].toInt();
    } else if ((args[i] == "-lstack") || (args[i] == "-ls")) {
      initial_stack_limit = args[++i].toInt();
    } else if ((args[i] == "-sktext") || (args[i] == "-skt")) {
      initial_k_text_size = args[++i].toInt();
    } else if ((args[i] == "-skdata") || (args[i] == "-skd")) {
      initial_k_data_size = args[++i].toInt();
    } else if ((args[i] == "-lkdata") || (args[i] == "-lkd")) {
      initial_k_data_limit = args[++i].toInt();
    } else if ((args[i] == "-file") || (args[i] == "-f")) {
      return args.mid(i + 1);
    } else if (args[i][0] != '-') {
      return args.mid(i);
    } else {
      error(
          "Unknown argument: %s (ignored)\n\n\
        Usage: QtSpim\n\
	-bare			Bare machine (no pseudo-ops, delayed branches and loads)\n\
	-asm			Extended machine (pseudo-ops, no delayed branches and loads) (default)\n\
	-delayed_branches	Execute delayed branches\n\
	-delayed_loads		Execute delayed loads\n\
	-exception		Load exception handler (default)\n\
	-noexception		Do not load exception handler\n\
	-exception_file <file>	Specify exception handler in place of default\n\
	-quiet			Do not print warnings\n\
	-noquiet		Print warnings (default)\n\
	-mapped_io		Enable memory-mapped IO\n\
	-nomapped_io		Do not enable memory-mapped IO (default)\n\
	-file <file> ...	Assembly code file(s)\n\
	\n\
	If argument does not start with a '-', it and all subsequent arguments are file names.\n",
          args[i].toLocal8Bit().data());
    }
  }
  return QStringList();
}
