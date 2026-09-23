/* SPIM S20 MIPS simulator.
   Terminal interface for SPIM simulator.

   Copyright (c) 1990-2010, James R. Larus.
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

#include <QDesktopWidget>
#include <QMessageBox>

#include "spimview.h"
#include "edu/edu_bottom_panel.h"  // EDU
#include "ui_spimview.h"
#include <QStatusBar>
#include "edu/edu_version.h"  // EDU
#include "edu/theme/tokens.h"  // EDU: settings defaults
#include "edu/theme/edu_theme.h"

//
// Restore program settings and window positions
//

// EDU: the state of the screen is not carried from one run to the next
// (AA).  A machine in the laboratory is used by one student after another,
// and the second one should not inherit the first one's arrangement,
// column widths and text sizes -- they have no way of telling what they
// did wrong.  Upstream restores all of it; we deliberately do not, and we
// delete what earlier versions of this program left behind.
void SpimView::eduForgetScreenSettings() {
  settings.remove("MainWin");  // Geometry, WindowState, LogVisible
  const char* const keys[] = {
      "RegWin/RegisterDisplayBase", "TextWin/ShowUserTextSeg",
      "TextWin/ShowKernelTextSeg",  "TextWin/ShowTextComments",
      "TextWin/ShowInstDisassembly", "DataWin/ShowUserDataSeg",
      "DataWin/ShowUserStackSeg",   "DataWin/ShowKernelDataSeg",
      "DataWin/DataSegmentDisplayBase", "DataWin/EduDisplayUnit",
      "Text/FontPointSize",         "Data/FontPointSize",
      "Inspector/FontPointSize",    "Console/FontPointSize",
      "Editor/FontPointSize",       "Tutorial/Shown"};
  for (unsigned i = 0; i < sizeof(keys) / sizeof(keys[0]); i += 1) {
    settings.remove(keys[i]);
  }
}

void SpimView::readSettings() {
  eduForgetScreenSettings();  // EDU: nothing about the screen is restored

  settings.beginGroup("RegWin");
  st_colorChangedRegisters = settings.value("ColorChangedRegs", true).toBool();
  st_changedRegisterColor =  // EDU: default was "red"
      settings.value("ChangedRegColor", edu::theme::color(edu::theme::kTealText).name()).toString();
  st_regDisplayBase = setCheckedRegBase(16);  // EDU: a run starts in hex (AA)

  st_regWinFont = settings.value("Font", edu::theme::codeFont()).value<QFont>();
  st_regWinFontColor =
      settings.value("FontColor", edu::theme::color(edu::theme::kText)).value<QColor>();  // EDU
  st_regWinBackgroundColor =
      settings.value("BackgroundColor", edu::theme::color(edu::theme::kWhite)).value<QColor>();  // EDU

  ui->action_Win_IntRegisters->setChecked(!ui->IntRegDockWidget->isHidden());
  ui->action_Win_FPRegisters->setChecked(!ui->FPRegDockWidget->isHidden());
  settings.endGroup();

  settings.beginGroup("TextWin");
  // EDU: what the Text panel shows is screen state, not a preference (AA).
  st_showUserTextSegment = true;
  ui->action_Text_DisplayUserText->setChecked(true);
  st_showKernelTextSegment = true;
  ui->action_Text_DisplayKernelText->setChecked(true);
  st_showTextComments = true;
  ui->action_Text_DisplayComments->setChecked(true);
  st_showTextDisassembly = true;
  ui->action_Text_DisplayInstructionValue->setChecked(true);

  st_textWinFont = settings.value("Font", edu::theme::codeFont()).value<QFont>();
  st_textWinFontColor =
      settings.value("FontColor", edu::theme::color(edu::theme::kText)).value<QColor>();  // EDU
  st_textWinBackgroundColor =
      settings.value("BackgroundColor", edu::theme::color(edu::theme::kWhite)).value<QColor>();  // EDU

  ui->action_Win_TextSegment->setChecked(!ui->TextSegDockWidget->isHidden());
  settings.endGroup();

  settings.beginGroup("DataWin");
  // EDU: likewise for the Data panel (AA).
  st_showUserDataSegment = true;
  ui->action_Data_DisplayUserData->setChecked(true);
  st_showUserStackSegment = true;
  ui->action_Data_DisplayUserStack->setChecked(true);
  st_showKernelDataSegment = true;
  ui->action_Data_DisplayKernelData->setChecked(true);
  st_dataSegmentDisplayBase = setCheckedDataSegmentDisplayBase(16);
  eduSetDataUnit(4);  // Words / Half words / Bytes (4 / 2 / 1)

  ui->action_Win_DataSegment->setChecked(!ui->DataSegDockWidget->isHidden());
  settings.endGroup();

  settings.beginGroup("FileMenu");
  st_recentFilesLength = settings.value("RecentFilesLength", 4).toInt();
  st_recentFiles.clear();
  int i;
  for (i = 0; i < st_recentFilesLength; i++) {
    QString file = settings.value("RecentFile" + QString(i), "").toString();
    st_recentFiles.append(file);
  }
  rebuildRecentFilesMenu();
  settings.endGroup();

  settings.beginGroup("Spim");
  quiet = settings.value("Quiet", false).toBool();

  bare_machine = false;  // EDU: not a mode this build offers
  accept_pseudo_insts = settings.value("AcceptPseudoInsts", 1).toBool();
  delayed_branches = settings.value("DelayedBranches", 0).toBool();
  delayed_loads = settings.value("DelayedLoads", 0).toBool();
  mapped_io = settings.value("MappedIO", 0).toBool();

  st_loadExceptionHandler =
      settings.value("LoadExceptionHandler", true).toBool();
  st_exceptionHandlerFileName =
      settings.value("ExceptionHandlerFileName", stdExceptionHandler)
          .toString();
  st_startAddress =
      settings.value("StartingAddress", starting_address()).toInt();
  st_commandLine = settings.value("CommandLineArguments", "").toString();
  settings.endGroup();

  eduApplyDefaultState();  // EDU: the one screen every run starts from (AA)
}

void SpimView::writeSettings(bool omitWindowState) {
  // EDU: the window's size, its arrangement and which panels were open are
  // not written at all (AA): every run starts from the same screen, and
  // nothing of this student's is left for the next one.
  (void)omitWindowState;

  settings.beginGroup("RegWin");
  settings.setValue("ColorChangedRegs", st_colorChangedRegisters);
  settings.setValue("ChangedRegColor", st_changedRegisterColor);

  settings.setValue("Font", st_regWinFont);
  settings.setValue("FontColor", st_regWinFontColor);
  settings.setValue("BackgroundColor", st_regWinBackgroundColor);
  settings.endGroup();

  settings.beginGroup("TextWin");

  settings.setValue("Font", st_textWinFont);
  settings.setValue("FontColor", st_textWinFontColor);
  settings.setValue("BackgroundColor", st_textWinBackgroundColor);
  settings.endGroup();

  settings.beginGroup("DataWin");
  settings.endGroup();

  settings.beginGroup("FileMenu");
  settings.setValue("RecentFilesLength", st_recentFilesLength);
  int i;
  for (i = 0; i < st_recentFilesLength; i++) {
    if (i < st_recentFiles.length()) {
      settings.setValue("RecentFile" + QString(i), st_recentFiles[i]);
    } else {
      settings.setValue("RecentFile" + QString(i), "");
    }
  }
  settings.endGroup();

  settings.beginGroup("Spim");
  settings.setValue("Quiet", quiet);

  settings.setValue("AcceptPseudoInsts", accept_pseudo_insts);
  settings.setValue("DelayedBranches", delayed_branches);
  settings.setValue("DelayedLoads", delayed_loads);
  settings.setValue("MappedIO", mapped_io);

  settings.setValue("LoadExceptionHandler", st_loadExceptionHandler);
  settings.setValue("ExceptionHandlerFileName", st_exceptionHandlerFileName);
  settings.setValue("StartingAddress", st_startAddress);
  settings.setValue("CommandLine", st_commandLine);
  settings.endGroup();

  settings.sync();
}

// EDU: Window > Reset Layout.  Upstream's "Restore to default" removed
// the saved window state and told the user to restart; nothing is saved
// any more (AA), so this simply puts the screen back to the state a run
// starts from, without losing the program or the file being edited.
void SpimView::win_Restore() {
  eduApplyDefaultState();
  statusBar()->showMessage("Layout reset", 5000);
}
