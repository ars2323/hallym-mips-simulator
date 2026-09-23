/* SPIM S20 MIPS simulator.
   Terminal interface for SPIM simulator.

   Copyright (c) 1990-2015, James R. Larus.
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

#include "spimview.h"
#include "ui_spimview.h"

// EDU: fork identity.
#include "edu/theme/tokens.h"  // EDU
#include "edu/theme/edu_theme.h"  // EDU
#include "edu/edu_version.h"
// EDU: warn before passing a path the core cannot open.
#include "edu/edu_path_check.h"

#include <QStringBuilder>
#define QT_USE_FAST_CONCATENATION
#include <QMessageBox>
#include <QResource>
#include <QTemporaryFile>

SpimView::SpimView(QWidget *parent)
    : QMainWindow(parent),
      ui(new Ui::SpimView),
      settings(EDU_SETTINGS_ORG, EDU_SETTINGS_APP) {  // EDU: own settings store
  // Open windows
  //
  ui->setupUi(this);
  setWindowTitle(EDU_APP_NAME);  // EDU: spimview.ui still says "QtSpim"
  // EDU: the console exists before the panels are built: it is a tab of
  // the bottom panel now, so eduSetupPanels() needs it already there.
  SpimConsole = new Console(0);
  eduSetupPanels();              // EDU: register tree, panels, docks

  // EDU: sentinel for "use the built-in handler"; it is shown in Settings.
  stdExceptionHandler = QString("<<Built-in Exception Handler>>");

  // Set style parameters for docking widgets
  //
  setCorner(Qt::TopLeftCorner, Qt::LeftDockWidgetArea);
  setCorner(Qt::BottomLeftCorner, Qt::LeftDockWidgetArea);
  setCorner(Qt::TopRightCorner, Qt::RightDockWidgetArea);
  setCorner(Qt::BottomRightCorner, Qt::RightDockWidgetArea);

  // Dock widgets
  //
  win_Tile();

  // Wire up the menu and context menu commands
  //
  wireCommands();

  // Restore program settings and window positions
  //
  readSettings();

  // Create a console
  //
  ui->action_Win_Console->setChecked(true);

  programStatus = IDLE;
  eduConstructed = true;  // EDU: the window may be redrawn now (AA)
}

void SpimView::closeEvent(QCloseEvent *event) {
  if (!eduEditorMaybeSave()) {  // EDU: unsaved changes in the editor, Cancel
    event->ignore();
    return;
  }
  writeSettings(false);
  qApp->exit(0);
}

void SpimView::wireCommands() {
  // EDU: File > Load File is gone; Open (action_File_Reload) is the one
  // way in, and it starts from a clean simulator.
  QObject::connect(ui->action_File_Reload, SIGNAL(triggered(bool)), this,
                   SLOT(file_ReloadFile()));
  QObject::connect(ui->action_File_SaveLog, SIGNAL(triggered(bool)), this,
                   SLOT(file_SaveLogFile()));
  QObject::connect(ui->action_File_Print, SIGNAL(triggered(bool)), this,
                   SLOT(file_Print()));
  QObject::connect(ui->action_File_Exit, SIGNAL(triggered(bool)), this,
                   SLOT(file_Exit()));

  QObject::connect(ui->action_Sim_ClearRegisters, SIGNAL(triggered(bool)), this,
                   SLOT(sim_ClearRegisters()));
  // EDU: the menu's Reinitialize clears and then assembles the file the
  // editor holds again (HH); sim_ReinitializeSimulator() is the bare
  // clearing step, which the other routes still use.
  QObject::connect(ui->action_Sim_Reinitialize, SIGNAL(triggered(bool)), this,
                   SLOT(eduReinitialize()));
  QObject::connect(ui->action_Sim_SetRunParameters, SIGNAL(triggered(bool)),
                   this, SLOT(sim_SetRunParameters()));
  QObject::connect(ui->action_Sim_Run, SIGNAL(triggered(bool)), this,
                   SLOT(sim_Run()));
  QObject::connect(ui->action_Sim_Pause, SIGNAL(triggered(bool)), this,
                   SLOT(sim_Pause()));
  QObject::connect(ui->action_Sim_Stop, SIGNAL(triggered(bool)), this,
                   SLOT(sim_Stop()));
  QObject::connect(ui->action_Sim_SingleStep, SIGNAL(triggered(bool)), this,
                   SLOT(sim_SingleStep()));
  QObject::connect(ui->action_Sim_DisplaySymbols, SIGNAL(triggered(bool)), this,
                   SLOT(sim_DisplaySymbols()));
  QObject::connect(ui->action_Sim_Settings, SIGNAL(triggered(bool)), this,
                   SLOT(sim_Settings()));

  QObject::connect(ui->action_Reg_DisplayBinary, SIGNAL(triggered(bool)), this,
                   SLOT(reg_DisplayBinary()));
  QObject::connect(ui->action_Reg_DisplayHex, SIGNAL(triggered(bool)), this,
                   SLOT(reg_DisplayHex()));
  QObject::connect(ui->action_Reg_DisplayDecimal, SIGNAL(triggered(bool)), this,
                   SLOT(reg_DisplayDecimal()));

  QObject::connect(ui->action_Text_DisplayUserText, SIGNAL(triggered(bool)),
                   this, SLOT(text_DisplayUserText()));
  QObject::connect(ui->action_Text_DisplayKernelText, SIGNAL(triggered(bool)),
                   this, SLOT(text_DisplayKernelText()));
  QObject::connect(ui->action_Text_DisplayComments, SIGNAL(triggered(bool)),
                   this, SLOT(text_DisplayComments()));
  QObject::connect(ui->action_Text_DisplayInstructionValue,
                   SIGNAL(triggered(bool)), this,
                   SLOT(text_DisplayInstructionValue()));

  QObject::connect(ui->action_Data_DisplayUserData, SIGNAL(triggered(bool)),
                   this, SLOT(data_DisplayUserData()));
  QObject::connect(ui->action_Data_DisplayUserStack, SIGNAL(triggered(bool)),
                   this, SLOT(data_DisplayUserStack()));
  QObject::connect(ui->action_Data_DisplayKernelData, SIGNAL(triggered(bool)),
                   this, SLOT(data_DisplayKernelData()));
  QObject::connect(ui->action_Data_DisplayBinary, SIGNAL(triggered(bool)), this,
                   SLOT(data_DisplayBinary()));
  QObject::connect(ui->action_Data_DisplayHex, SIGNAL(triggered(bool)), this,
                   SLOT(data_DisplayHex()));
  QObject::connect(ui->action_Data_DisplayDecimal, SIGNAL(triggered(bool)),
                   this, SLOT(data_DisplayDecimal()));

  QObject::connect(ui->action_Win_IntRegisters, SIGNAL(triggered(bool)), this,
                   SLOT(win_IntRegisters()));
  QObject::connect(ui->action_Win_FPRegisters, SIGNAL(triggered(bool)), this,
                   SLOT(win_FPRegisters()));
  QObject::connect(ui->action_Win_TextSegment, SIGNAL(triggered(bool)), this,
                   SLOT(win_TextSegment()));
  QObject::connect(ui->action_Win_DataSegment, SIGNAL(triggered(bool)), this,
                   SLOT(win_DataSegment()));
  QObject::connect(ui->action_Win_Console, SIGNAL(triggered(bool)), this,
                   SLOT(win_Console()));
  QObject::connect(ui->action_Win_Tile, SIGNAL(triggered(bool)), this,
                   SLOT(win_Tile()));
  QObject::connect(ui->action_Win_Restore, SIGNAL(triggered(bool)), this,
                   SLOT(win_Restore()));

  // EDU: the "?" action opens the student guide; the original SPIM
  // documentation is Help > MIPS Reference (eduSetupHelpMenu).
  QObject::connect(ui->action_Help_ViewHelp, SIGNAL(triggered(bool)), this,
                   SLOT(eduShowUserGuide()));
  QObject::connect(ui->action_Help_AboutSPIM, SIGNAL(triggered(bool)), this,
                   SLOT(help_AboutSPIM()));

  // EDU: the Text panel (edu/edu_text_view.h) wires its own Set / Clear
  // Breakpoint actions.

  // EDU: the integer register panel (edu/edu_register_view.h) wires its own
  // "Change Register Contents" action.
  QObject::connect(ui->FPRegTextEdit->action_Context_ChangeValue,
                   SIGNAL(triggered(bool)), ui->FPRegTextEdit,
                   SLOT(changeValue()));
  // EDU: so does the Data panel (edu/edu_data_view.h), "Change Memory
  // Contents".
}

QString SpimView::windowFormattingStart(QFont font, QColor fontColor,
                                        QColor backgroundColor) {
  return QString("<span style='font-family:" + font.family() +
                 "; font-size:" + QString::number(font.pointSize(), 10) +
                 "pt; color:" + fontColor.name() +
                 ";background-color:" + backgroundColor.name() + "'>");
}

QString SpimView::windowFormattingEnd() { return "</span>"; }

void SpimView::InitializeWorld() {
  eduForgetLoadedLabels();  // EDU: initialize_world() clears the symbol table
  if (st_loadExceptionHandler) {
    // EDU: a custom handler path the core could not open falls back to the
    // built-in handler, just as a missing file does below.
    if ((st_exceptionHandlerFileName != stdExceptionHandler) &&
        !edu::confirmPathLoadable(this, st_exceptionHandlerFileName)) {
      st_exceptionHandlerFileName = stdExceptionHandler;
    }
    if ((st_exceptionHandlerFileName != stdExceptionHandler) &&
        !QFile::exists(st_exceptionHandlerFileName)) {
      QMessageBox msgBox;
      msgBox.setText(QString("%1: exception handler file not found.\n\nUsing "
                             "default exception handler.")
                         .arg(st_exceptionHandlerFileName));
      msgBox.exec();
      st_exceptionHandlerFileName = stdExceptionHandler;
    }
    if (st_exceptionHandlerFileName == stdExceptionHandler) {
      // Standard exception handler is a resource in this executable. Write it
      // to a temporary file and use that for initialization.
      //
      QResource exRes(":exceptions.s");
      QTemporaryFile tmpFile;
      tmpFile.open();
      tmpFile.write((char *)exRes.data());
      tmpFile.close();
      initialize_world(tmpFile.fileName().toLocal8Bit().data(), false);
    } else {
      // Use the file name supplied by the user.
      //
      initialize_world(st_exceptionHandlerFileName.toLocal8Bit().data(), true);
    }
  } else {
    // No exception handler.
    //
    initialize_world(NULL, true);
  }
}

void SpimView::SetExceptionHandler(QString fileName, bool loadHandler) {
  if (fileName != "") {
    st_exceptionHandlerFileName = fileName;
  }
  st_loadExceptionHandler = loadHandler;
}

void SpimView::UpdateDataDisplay() {
  // Text segment rarely changes -- update manually
  //
  if (text_modified) {
    DisplayTextSegments(true);
  }
  DisplayIntRegisters();
  DisplayFPRegisters();
  DisplayDataSegments(false);
}

void SpimView::SaveStateAndExit(int val) {
  writeSettings(false);
  exit(val);
}

QString SpimView::WriteOutput(QString message) {
  // EDU: the core prefixes an assembler error with the name of the program
  // it was written for ("spim: (parser) syntax error on line ...",
  // CPU/parser.y).  Strip that one word where the pane draws it; the
  // message itself is untouched, so the editor's error list still parses
  // the original format (edu/core/edu_asm_errors.h) and Save Log File,
  // which never writes this pane, is unaffected.  The "(parser)" tag stays:
  // it says which stage reported the error.
  if (message.startsWith("spim: ")) {
    message.remove(0, 6);
  }
  message.replace("\nspim: ", "\n");

  if (message.endsWith("\n")) {
    message.chop(1);  // Appending adds a <br>, so avoid doubling last newline
  }
  message.replace("\n", "<br>");
  message.replace(" ", "&nbsp;");

  // EDU: the display font and colour come from the theme tokens; the text
  // itself is untouched, so Save Log File (toPlainText) is byte-identical.
  Window->ui->centralWidget->append(
      QString("<span style=\"font-family:") + edu::theme::kCodeFamily +
      ";font-size:" + QString::number(edu::theme::kCodePointSize) +
      "pt;color:" + outputColor + "\">" + message + QString("</span>"));
  Window->ui->centralWidget->ensureCursorVisible();

  return message;
}

void SpimView::SetOutputColor(QString color) { outputColor = color; }

void SpimView::Error(QString message, bool fatal) {
  // EDU: nothing has been loaded, so the start stub the core puts at
  // 0x00400000 runs into a "jal main" with no main to jump to.  The
  // core names an address the student has never seen and raises a
  // box over it; say what to do instead, in the message pane, and let
  // the simulator stop exactly as it did (X).
  if (!fatal && !eduProgramLoaded &&
      message.startsWith("Instruction references undefined symbol")) {
    const QString normal = outputColor;
    outputColor = edu::theme::color(edu::theme::kError).name();
    WriteOutput("No program is loaded.\n"
                "Open one with File > Open (Ctrl+O), or write it in the "
                "Editor and press Ctrl+S.\n");
    outputColor = normal;
    eduShowLog();
    return;
  }
  // EDU: errors in the log stand out in the error colour (display only).
  const QString normalColor = outputColor;
  outputColor = edu::theme::color(edu::theme::kError).name();
  WriteOutput(message);
  outputColor = normalColor;
  eduShowLog();  // EDU: a hidden message log comes back for an error

  // EDU: while the editor assembles, errors go to its list instead of one
  // modal box each.  The message log above gets them as always.
  if (!fatal && eduCollectError(message)) {
    return;
  }

  if (fatal) {
    QMessageBox::critical(0, "Error", message,
                          QMessageBox::Ok | QMessageBox::Abort,
                          QMessageBox::Ok);
    SaveStateAndExit(1);
  } else {
    QMessageBox::StandardButton b = QMessageBox::information(
        0, "Error", message, QMessageBox::Ok | QMessageBox::Abort,
        QMessageBox::Ok);
    if (b == QMessageBox::Abort) {
      force_break = true;
    }
  }
}
