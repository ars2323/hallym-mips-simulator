/* SPIM S20 MIPS simulator.
   Terminal interface for SPIM simulator.

   Copyright (c) 1990-2020, James R. Larus.
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

#ifndef SPIMVIEW_H
#define SPIMVIEW_H

#include <QMainWindow>
#include <QPrinter>
#include <QSettings>
#include <QList>
#include <QByteArray>
#include <QString>
#include <QStringList>

#include "ui_spimview.h"
#include "console.h"

#include "../CPU/spim.h"
#include "../CPU/string-stream.h"
#include "../CPU/spim-utils.h"
#include "../CPU/inst.h"
#include "../CPU/reg.h"
#include "../CPU/mem.h"
#include "../CPU/sym-tbl.h"
#include "../CPU/version.h"

namespace Ui {
class SpimView;
}

// EDU: new panels (QtSpim/edu/).
class EduDataModel;
class EduTutorial;
class EduEditorDock;
class EduInspector;
class EduRegisterModel;
class EduTextModel;
class QLabel;
class QMenu;
class QPlainTextEdit;
class QPushButton;
class QTextEdit;

class SpimView : public QMainWindow {
  Q_OBJECT

 public:
  explicit SpimView(QWidget* parent = 0);

  virtual void closeEvent(QCloseEvent*);

  QString WriteOutput(QString message);
  void Error(QString message, bool fatal);

  void SaveStateAndExit(int val);

  void InitializeWorld();
  void SetExceptionHandler(QString fileName, bool loadHandler);

  void CaptureIntRegisters();
  void CaptureSFPRegisters();
  void CaptureDFPRegisters();

  void DisplayIntRegisters();
  void DisplayFPRegisters();

  // EDU: what "Save Log File" writes and "Print" prints for the integer
  // registers.  One seam for both, so the output can be held byte-identical
  // to the upstream rendering (tools/regress.sh compares it to goldens).
  QString intRegistersLogText();
  void printIntRegisters(QPrinter* printer);
  QString textSegmentLogText();  // EDU: same seam for the Text window
  void printTextSegment(QPrinter* printer);
  QString dataSegmentLogText();  // EDU: and for the Data window
  void printDataSegment(QPrinter* printer);

  // EDU: register panel and inspector; implemented in
  // edu/edu_spimview_glue.cpp.
  EduRegisterModel* eduRegisterModel;
  EduInspector* eduInspector;
  EduTutorial* eduTutorial;  // EDU: the first-run tour (edu/edu_tutorial.h)
  bool eduLayoutSettled;     // EDU: start-up is over; dock moves are the user's
  bool eduTourOnStart;       // EDU: false in the scripted capture mode
  void eduSetupPanels();
  void eduTileInspector();
  void eduInspectorSizing(bool byUser);  // false: follow the content again
  bool eduInspectorUserSized;
  bool eduInspectorSeparatorPressed;
  int eduInspectorPressHeight;
  bool eventFilter(QObject* watched, QEvent* event);
  void eduUpdateModeBadge();  // status bar: settings that change assembling

  // EDU: the editor (edu/edu_editor_dock.h); implemented in
  // edu/edu_editor_glue.cpp.
  EduEditorDock* eduEditor;
  void eduSetupEditor();
  void eduTileEditor();
  void eduShowLog();                 // the message log, if hidden
  void eduSetLogVisible(bool on);
  QAction* eduLogAction;             // Window > Message Log
  void eduArrangePanels(int layout); // 0 tabs, 1 side by side, 2 stacked
  void eduEditorAtStartup();
  bool eduEditorMaybeSave();                     // false = the user cancelled
  void eduEditorFileLoaded(const QString& file); // File > Load File, command line
  bool eduCollectError(const QString& message);  // true = taken, show no box
  QString eduAssembleFile;                       // set for file_LoadFile()
  QMenu* eduEditorRecentMenu;                    // Editor > Open Recent
  QList<QPushButton*> eduStaleBanners;           // "Source changed" strips
  QString eduSyncedPath;                         // file the simulator last took
  QByteArray eduSyncedDigest;                    // the editor text it took
  bool eduEverAssembled;                         // anything assembled yet?
  bool eduExtraProgram;                          // something else was added on top
  void eduUpdateStaleBanner();
  void eduRebuildEditorRecentMenu();
  void eduBeginRunCommand();       // a Step/Run/Continue is about to start
  void eduResetRegisterChanges();  // Reinitialize / Load / Clear Registers
  void eduInsetDockContent(QDockWidget* dock);  // 4 px under the title
  void eduSetupHelpMenu();                      // User Guide, MIPS Reference
  void eduElideDockTabs();                      // long tab titles get an ellipsis
  void eduUpdateWindowTitle();                  // "file.s -- Hallym MIPS Simulator"
  QByteArray eduEditorDigest() const;           // the editor text, hashed
  void eduRestoreEditorZoom();                  // the saved editor text size
  bool eduLoadTutorialSample();                 // samples/tutorial.s, for the tour
  QString eduTutorialSamplePath() const;        // where it is, or empty
  bool eduSwitchToTutorialSample();             // the tour's "use the example"
  void eduRefreshRegisterPanel();

  // EDU: Text panel (edu/edu_text_model.h, edu/edu_text_view.h).
  EduTextModel* eduTextModel;
  void eduRefreshTextPanel();                // rows, columns, font, colours
  void eduHighlightInstruction(mem_addr pc);

  // EDU: Data panel (edu/edu_data_model.h, edu/edu_data_view.h).
  EduDataModel* eduDataModel;
  void eduRefreshDataPanel();     // rows, base, segments, font, colours
  bool eduDataPointersMoved();    // $sp/$fp/$gp differ from what is shown
  int eduDataUnit();              // 4 / 2 / 1, for the settings file
  void eduSetDataUnit(int bytes);
  void eduCollectLabels();        // after the text segment changed (a load)
  bool eduLoadAssemblyFile(const QString& file);  // read_assembly_file() + labels
  void eduForgetLoadedLabels();   // the symbol table was cleared
  bool eduConfirmLoadOnTop();     // Load File while a program is loaded
  void eduNoteStackInitialized(); // right after the core's initialize_stack()

  void DisplayTextSegments(bool force);
  void DisplayDataSegments(bool force);
  void UpdateDataDisplay();

  int RegDisplayBase() { return st_regDisplayBase; }
  int DataDisplayBase() { return st_dataSegmentDisplayBase; }

  Ui::SpimView* ui;

  void SetOutputColor(QString color);

 private:
  QString outputColor;

  //
  // Program state
  //
  QSettings settings;
  void readSettings();
  void writeSettings(bool omitWindowState);
  QString stdExceptionHandler;

  // File menu
  //
  int st_recentFilesLength;
  QList<QString> st_recentFiles;
  void rebuildRecentFilesMenu();

  // Simulator menu
  //
  bool st_loadExceptionHandler;
  QString st_exceptionHandlerFileName;
  int st_startAddress;
  QString st_commandLine;

  // Register window
  //
  bool st_colorChangedRegisters;
  QString st_changedRegisterColor;
  int st_regDisplayBase;
  QFont st_regWinFont;
  QColor st_regWinFontColor;
  QColor st_regWinBackgroundColor;

  // Text window
  //
  bool st_showUserTextSegment;
  bool st_showKernelTextSegment;
  bool st_showTextComments;
  bool st_showTextDisassembly;
  QFont st_textWinFont;
  QColor st_textWinFontColor;
  QColor st_textWinBackgroundColor;

  // Data window
  //
  bool st_showUserDataSegment;
  bool st_showUserStackSegment;
  bool st_showKernelDataSegment;
  int st_dataSegmentDisplayBase;

  //
  // End of state

  //
  // Methods:
  //

  // Establish text formatting for a window
  //
  QString windowFormattingStart(QFont font, QColor fontColor,
                                QColor backgroundColor);
  QString windowFormattingEnd();

  // Integer registers window
  //
  QString formatSpecialIntRegister(int value, char* name, bool changed);
  QString formatIntRegister(int regNum, int value, char* name, bool changed);

  // Value in register at previous call on displayIntRegister, so changed values
  // can be highlighted.
  //
  QPlainTextEdit* eduIntRegLog;  // EDU: hidden; source of log/print text
  QTextEdit* eduTextLog;         // EDU: same for the Text window, filled on demand
  void eduFillTextLog();
  QPlainTextEdit* eduDataLog;    // EDU: and for the Data window
  QLabel* eduAssembleBadge;      // EDU: status bar, "2 errors"
  bool eduCollectingErrors;      // EDU: an Assemble is in progress
  QStringList eduCollectedErrors;
  QLabel* eduModeBadge;          // EDU: status bar, see eduUpdateModeBadge()
  bool eduProgramLoaded;         // EDU: a file was assembled since Reinitialize
  QString eduLoadedSymbols;      // EDU: print_symbols() text of every file loaded
  void eduFillDataLog();
  enum { EduNoSubject, EduRegisterSubject, EduInstructionSubject,
         EduMemorySubject };
  int eduInspectorSubject;       // EDU: what the inspector is showing

  reg_word oldR[R_LENGTH];
  mem_addr oldPC;
  reg_word oldEPC;
  reg_word oldCause;
  reg_word oldBadVAddr;
  reg_word oldStatus;
  reg_word oldHI;
  reg_word oldLO;

  // Single precision FP registers window
  //
  QString formatSFPRegisters();
  QString formatSpecialSFPRegister(int value, char* name, bool changed);
  QString formatSFPRegister(int regNum, float value, bool changed);

  float oldFPR_S[FGR_LENGTH];
  reg_word oldFIR;
  reg_word oldFCSR;

  // Double precision FP registers window
  //
  QString formatDFPRegisters();
  QString formatDFPRegister(int regNum, double value, bool changed);

  double oldFPR_D[FPR_LENGTH];

  // Common register methods
  //
  QString formatInt(int value);
  QString formatFloat(float value);
  QString formatDouble(double value);
  QString formatReg(QString reg, QString value, bool changed);
  QString registerBefore(bool changed);
  QString registerAfter(bool changed);
  QString nnbsp(int n);

  // Text segment window
  //
  QString formatUserTextSeg();
  QString formatKernelTextSeg();
  QString formatInstructions(mem_addr from, mem_addr to);
  void highlightInstruction(mem_addr pc);

  // Data segment window
  //
  QString formatUserDataSeg();
  QString formatUserStack();
  QString formatKernelDataSeg();
  QString formatMemoryContents(mem_addr from, mem_addr to);
  QString formatPartialQuadWord(mem_addr from, mem_addr to);
  QString formatAsChars(mem_addr from, mem_addr to);

  //
  // Menu functions
  //
  void wireCommands();
  void initStack();
  void executeProgram(mem_addr pc, int steps, bool display, bool contBkpt);
  void initializePCAndStack();
  enum PROGSTATE { IDLE, STOPPED, PAUSED, RUNNING, SINGLESTEP } programStatus;
  void updateStatus(PROGSTATE status);

  //
  // Console
  //
 public:
  Console* SpimConsole;

 public slots:
  void file_LoadFile();
  void file_ReloadFile();
  void file_SaveLogFile();
  void file_Print();
  void file_Exit();

  void sim_ClearRegisters();
  void sim_ReinitializeSimulator();
  void sim_SetRunParameters();
  void sim_Run();
  void sim_Pause();
  void sim_Stop();
  void sim_SingleStep();
  void sim_DisplaySymbols();
  void sim_Settings();

  void reg_DisplayBinary();
  void reg_DisplayHex();
  void reg_DisplayDecimal();
  int setCheckedRegBase(int base);
  int setBaseInternal(int base, QAction* actionBinary, QAction* actionDecimal,
                      QAction* actionHex);

  void text_DisplayUserText();
  void text_DisplayKernelText();
  void text_DisplayComments();
  void text_DisplayInstructionValue();

  void data_DisplayUserData();
  void data_DisplayUserStack();
  void data_DisplayKernelData();
  void data_DisplayBinary();
  void data_DisplayHex();
  void data_DisplayDecimal();
  int setCheckedDataSegmentDisplayBase(int base);

  void win_IntRegisters();
  void win_FPRegisters();
  void win_TextSegment();
  void win_DataSegment();
  void win_Console();
  void win_Tile();
  void win_Restore();

  void help_ViewHelp();          // EDU: Help > MIPS Reference
  void eduShowUserGuide();       // EDU: Help > User Guide ("?" in the tool bar)
  void eduRevealWindows();       // EDU: after the splash closes
  void eduShowTutorial();        // EDU: Help > Tutorial
  void eduDockMoved();           // EDU: a dock was dragged somewhere new
  void eduEqualiseDocks();       // EDU: after a drag, share the room evenly
  void eduEditorFontSizeChanged(int points);  // EDU: remember the zoom
  void help_AboutSPIM();

  void continueBreakpoint();
  void singleStepBreakpoint();
  void abortBreakpoint();

  void eduUpdateInspector();  // EDU
  void eduRegisterSelected();
  void eduInstructionSelected();
  void eduMemorySelected();
  void eduAssemble();
  void eduEditorNew();
  void eduEditorOpen();
  void eduEditorSaveAs();
  void eduEditorOpenRecent();
  void eduToggleLog(bool on);
  void eduLayoutTabs();
  void eduLayoutSideBySide();
  void eduLayoutStacked();
  void eduEditorFileChanged();

};

extern SpimView* Window;
extern QApplication* App;

// Format SPIM abstractions for display
//
QString formatAddress(mem_addr addr);
QString formatWord(mem_word word, int base);
QString formatChar(int chr);
QString formatSegLabel(QString segName, mem_addr low, mem_addr high);

QString promptForNewValue(QString text, int* base);

#endif  // SPIMVIEW_H
