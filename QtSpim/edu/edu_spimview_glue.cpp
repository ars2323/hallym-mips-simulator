/* QtSpim-Edu: the SpimView members that connect the new panels to the
   upstream main window.  Kept out of the upstream .cpp files so that those
   only carry one-line hooks (each marked "// EDU:"). */

#include <QApplication>
#include <QDesktopWidget>
#include <QEvent>
#include <QUrl>
#include <QFileInfo>
#include <QDesktopServices>
#include <QTabBar>
#include <QTimer>
#include <QMouseEvent>
#include <QLabel>
#include <QLayout>
#include <QMessageBox>
#include <QPlainTextEdit>
#include <QPushButton>
#include <QScrollBar>
#include <QVBoxLayout>
#include <QStatusBar>
#include <QTextEdit>

#include "edu/core/edu_decoder.h"
#include "edu/theme/edu_theme.h"
#include "edu/theme/tokens.h"
#include "edu/core/edu_instruction_text.h"
#include "edu/core/edu_memory_text.h"
#include "edu/core/edu_symbols.h"
#include "edu/edu_data_model.h"
#include "edu/edu_data_view.h"
#include "edu/edu_code_editor.h"
#include "edu/edu_editor_dock.h"
#include "edu/edu_bottom_panel.h"
#include "edu/edu_cross_handle.h"
#include "edu/edu_panel_zoom.h"
#include "edu/edu_instruction_inspector.h"
#include "edu/edu_path_check.h"
#include "edu/edu_tutorial.h"
#include "edu/edu_loader.h"
#include "edu/edu_register_model.h"
#include "edu/edu_register_view.h"
#include "edu/edu_text_model.h"
#include "edu/edu_text_view.h"
#include "edu/edu_version.h"
#include "spimview.h"
#include "ui_spimview.h"

// While this points at a string, write_output() (spim_support.cpp) appends
// the core's messages to it instead of showing them.
QString* eduOutputCapture = NULL;

// Called from the constructor right after setupUi(), i.e. before win_Tile()
// lays the docks out and before readSettings() restores a saved layout (the
// inspector has to exist for restoreState() to place it).
void SpimView::eduSetupPanels() {
  eduEditor = 0;  // until eduSetupEditor() at the end of this function
  eduLogAction = 0;
  eduTutorial = 0;  // built on the first run of the tutorial
  eduLayoutSettled = false;  // until the saved layout has been restored
  eduLayoutFromDefaults = true;  // readSettings() decides for real
  eduLayoutPreset = 0;
  eduLayoutSizesPending = false;
  eduTutorialOnStart = true;     // main.cpp turns this off for a scripted run
  eduEverAssembled = false;  // nothing has been assembled this session yet
  eduExtraProgram = false;   // nothing has been added on top of it
  eduRegisterModel = new EduRegisterModel(this);
  ui->IntRegView->setRegisterModel(eduRegisterModel);

  // Upstream's .ui restricts the register docks to the top area.
  ui->IntRegDockWidget->setAllowedAreas(Qt::LeftDockWidgetArea |
                                        Qt::TopDockWidgetArea);
  ui->FPRegDockWidget->setAllowedAreas(Qt::LeftDockWidgetArea |
                                       Qt::TopDockWidgetArea);

  // The instruction inspector, under the Text / Data panel.
  eduInspector = new EduInstructionInspector(this);
  addDockWidget(Qt::RightDockWidgetArea, eduInspector);

  // The bottom panel takes over the window's central widget -- the text
  // pane the simulator logs into -- and the console window upstream kept
  // separate.  With no central widget left, the docks fill the window.
  eduBottom = new EduBottomPanel(this);
  eduCrossHandle = new EduCrossHandle(this);
  eduSeparatorDragging = false;
  eduDragMiddleTop = 0;
  eduDragRightTop = 0;
  QWidget* logPane = takeCentralWidget();
  // A window with no central widget at all leaves QMainWindow's layout
  // with nothing to arrange the docks around; a zero-sized one keeps the
  // layout in its usual shape and takes no room.
  QWidget* filler = new QWidget(this);
  filler->setObjectName("EduNoCentralWidget");
  filler->setFixedSize(0, 0);
  setCentralWidget(filler);
  eduBottom->setConsole(SpimConsole);
  eduBottom->setMessages(logPane);
  addDockWidget(Qt::BottomDockWidgetArea, eduBottom);
  installEventFilter(this);  // the window chrome follows the system theme
  // Which program and version this is, at the far right of the status bar
  // (a student's screenshot then says which build it came from).
  QLabel* version = new QLabel(QString(EDU_APP_NAME " " EDU_VERSION), this);
  version->setObjectName("EduVersionLabel");  // styled by theme/light.qss
  statusBar()->addPermanentWidget(version);

  // Shown only while a setting that changes how files are assembled or run
  // differs from QtSpim's defaults.
  eduModeBadge = new QLabel(this);
  eduModeBadge->setObjectName("EduModeBadge");  // styled by theme/light.qss
  statusBar()->addPermanentWidget(eduModeBadge);
  eduModeBadge->hide();

  eduProgramLoaded = false;
  eduBannerShown = false;  // the start-up banner is printed once
  eduConstructed = false;  // the window is still being put together
  st_panelPointSize = int(edu::theme::kCodePointSize);  // until Settings is read
  eduLayoutSizeTries = 0;
  eduLayoutLastRegisterWidth = -1;
  eduTutorialSettings.saved = false;  // nothing borrowed by the tutorial yet
  eduTutorialScrollTries = 0;

  eduTextModel = new EduTextModel(this);
  ui->TextSegView->setTextModel(eduTextModel);
  connect(ui->TextSegView, SIGNAL(instructionSelectionChanged()), this,
          SLOT(eduInstructionSelected()));
  connect(ui->TextSegView, SIGNAL(instructionRowsReset()), this,
          SLOT(eduUpdateInspector()));

  // Window > Instruction Inspector, next to the other panels' entries.
  QAction* toggle = eduInspector->toggleViewAction();
  toggle->setText("Instruction Inspector");
  toggle->setObjectName("action_Edu_ToggleInspector");  // devtools --trigger
  ui->menu_Window->insertAction(ui->action_Win_Console, toggle);

  // Never shown.  It receives exactly the HTML upstream put into the
  // visible register window, so that Save Log File and Print produce what
  // they always did (tools/regress.sh check 4 holds it to that).
  eduIntRegLog = new QPlainTextEdit(this);
  eduIntRegLog->setUndoRedoEnabled(false);
  eduIntRegLog->setReadOnly(true);
  eduIntRegLog->hide();

  eduDataModel = new EduDataModel(this);
  ui->DataSegPanel->setDataModel(eduDataModel);
  connect(ui->DataSegPanel->view(), SIGNAL(memorySelectionChanged()), this,
          SLOT(eduMemorySelected()));
  connect(ui->DataSegPanel->view(), SIGNAL(memoryRowsReset()), this,
          SLOT(eduUpdateInspector()));
  // Data Segment > Words / Half words / Bytes, under the base entries.
  ui->menu_Data_Segment->addSeparator();
  ui->menu_Data_Segment->addActions(ui->DataSegPanel->view()->unitActions());

  // The same for the Text window, except that it is only filled when a log
  // is saved or printed (SpimView::eduFillTextLog() in textwin.cpp).
  eduTextLog = new QTextEdit(this);
  eduTextLog->setUndoRedoEnabled(false);
  eduTextLog->setReadOnly(true);
  eduTextLog->hide();

  eduDataLog = new QPlainTextEdit(this);  // upstream's was a QPlainTextEdit
  eduDataLog->setUndoRedoEnabled(false);
  eduDataLog->setReadOnly(true);
  eduDataLog->hide();

  eduSetupEditor();
  eduSetupPanelZoom();

  // Every tool bar button says what it is and what its shortcut is, in both
  // languages (docs/ARCHITECTURE.md 12, 71).
  struct {
    QAction* action;
    const char* tip;
  } const tips[] = {
      {ui->action_File_Reload,
       "Open a program: the simulator starts clean and loads it (Ctrl+O)\n"
       "프로그램 열기. 시뮬레이터를 비우고 새로 올립니다 (Ctrl+O)"},
      {ui->action_File_SaveLog,
       "Write the registers, the text and the data windows to a text file\n"
       "레지스터·Text·Data 창의 내용을 텍스트 파일로 저장합니다"},
      {ui->action_File_Print, "Print those same windows\n같은 창들을 인쇄합니다"},
      {ui->action_Sim_ClearRegisters,
       "Set every register to zero, leaving memory as it is\n"
       "메모리는 그대로 두고 레지스터를 모두 0으로 만듭니다"},
      {ui->action_Sim_Reinitialize,
       "Clear the registers and the memory: start over\n"
       "레지스터와 메모리를 비웁니다. 처음부터 다시"},
      {ui->action_Sim_Run,
       "Run the program to its end or to the next breakpoint (F5)\n"
       "프로그램을 끝까지, 또는 다음 브레이크포인트까지 실행 (F5)"},
      {ui->action_Sim_Pause, "Pause a running program\n실행 중인 프로그램을 멈춥니다"},
      {ui->action_Sim_Stop,
       "Stop the program where it is\n프로그램을 그 자리에서 중지합니다"},
      {ui->action_Sim_SingleStep,
       "Run one instruction and stop (F10)\n한 명령만 실행하고 멈춥니다 (F10)"},
      {ui->action_Sim_Settings,
       "Fonts, colours and how the simulator assembles and runs\n"
       "글꼴·색과 어셈블·실행 방식 설정"},
      {ui->action_Help_ViewHelp,
       "The written guide for this program\n이 프로그램의 사용 안내문"},
  };
  for (unsigned i = 0; i < sizeof(tips) / sizeof(tips[0]); i += 1) {
    if (tips[i].action != 0) {
      tips[i].action->setToolTip(QString::fromUtf8(tips[i].tip));
    }
  }

  eduModeBadge->setToolTip(QString::fromUtf8(
      "A setting that changes how files are assembled or run is on; see "
      "Simulator > Settings\n어셈블·실행 방식을 바꾸는 설정이 켜져 있습니다. "
      "Simulator > Settings에서 끌 수 있습니다"));
  version->setToolTip(QString::fromUtf8(
      "The version of this program; Help > About has the rest\n"
      "이 프로그램의 버전. 자세한 것은 Help > About"));

  // Tool bar and menu icons: Lucide, coloured from the tokens (tokens.md 5).
  struct {
    QAction* action;
    const char* icon;
  } const icons[] = {
      {ui->action_File_Reload, "folder-open"},

      {ui->action_File_SaveLog, "save"},
      {ui->action_File_Print, "printer"},
      {ui->action_Sim_ClearRegisters, "eraser"},
      {ui->action_Sim_Reinitialize, "rotate-ccw"},
      {ui->action_Sim_Run, "play"},
      {ui->action_Sim_Pause, "pause"},
      {ui->action_Sim_Stop, "square"},
      {ui->action_Sim_SingleStep, "step-forward"},
      {ui->action_Sim_Settings, "settings"},
      {ui->action_Help_ViewHelp, "circle-question-mark"},
      {findChild<QAction*>("action_Edu_Assemble"), "hammer"},
      {findChild<QAction*>("action_Edu_New"), "file-plus"},
      {findChild<QAction*>("action_Edu_Open"), "file-text"},
  };
  for (unsigned i = 0; i < sizeof(icons) / sizeof(icons[0]); i += 1) {
    if (icons[i].action != 0) {
      icons[i].action->setIcon(edu::theme::toolIcon(icons[i].icon));
    }
  }

  // The register docks show their table right under the title; the token
  // layout wants a 4 px breath between the title bar and the header.
  eduInsetDockContent(ui->IntRegDockWidget);
  eduInsetDockContent(ui->FPRegDockWidget);

  eduSetupHelpMenu();
}

// Help > User Guide (also the "?" tool bar button) and Help > MIPS
// Reference.  Upstream had one entry, "View Help", which opened the QtSpim
// manual; that manual describes another program's windows, so the students'
// own guide takes its place and the original SPIM documentation -- the
// assembler, linker and instruction-set appendix by James Larus -- stays
// reachable under its own name.
void SpimView::eduSetupHelpMenu() {
  ui->action_Help_ViewHelp->setText("&User Guide");
  ui->action_Help_ViewHelp->setToolTip(
      "How to use this program, and what differs from the standard simulator");

  QAction* reference = new QAction("MIPS &Reference", this);
  reference->setObjectName("action_Edu_MipsReference");
  reference->setToolTip(
      "The original SPIM documentation by James Larus: assemblers, linkers "
      "and the MIPS instruction set");
  connect(reference, SIGNAL(triggered(bool)), this, SLOT(help_ViewHelp()));
  ui->menu_Help->insertAction(ui->action_Help_AboutSPIM, reference);

  // The first-run tutorial, from the menu at any time.  The label is English
  // like the rest of the menu bar; the tutorial itself follows the system
  // language and can be switched inside it.
  QAction* tutorial = new QAction("&Tutorial", this);
  tutorial->setObjectName("action_Edu_Tutorial");
  tutorial->setToolTip("Show what differs from the standard simulator, "
                       "panel by panel");
  connect(tutorial, SIGNAL(triggered(bool)), this, SLOT(eduShowTutorial()));
  ui->menu_Help->insertAction(ui->action_Help_AboutSPIM, tutorial);
  ui->menu_Help->insertSeparator(ui->action_Help_AboutSPIM);
}

// The windows come up when the splash closes (main.cpp), and the tutorial --
// once, on the first run -- after them.
void SpimView::eduRevealWindows(bool withTutorial) {
  SpimConsole->show();
  show();
  raise();
  activateWindow();
  eduElideDockTabs();
  edu::theme::applyWindowChrome(this);  // a light title bar on Windows
  eduRestoreEditorZoom();               // the text size the student left
  // From here on, a dock that moves was moved by the user.
  // The proportions were set while the window was still its start-up size;
  // now that it has its real one, say them again -- unless a saved layout
  // is in force, which is the student's own arrangement.
  if (eduLayoutFromDefaults) {
    eduApplyLayout(0);
  }
  eduLayoutSettled = true;
  // The tutorial starts when the start-up card was answered with "take the
  // tutorial", and never by itself: a scripted run would have it load the
  // example over whatever the script is testing, and a student who said
  // "start now" has said what they want.  --tutorial-step and
  // --tutorial-first-run still open it on purpose.
  if (eduTutorialOnStart && withTutorial) {
    QTimer::singleShot(250, this, SLOT(eduShowTutorial()));
  }
}

// What the tutorial needs the screen to be showing, and what the student had
// before it.  Everything here is a display setting: nothing about how a
// program assembles or runs is touched.
void SpimView::eduTutorialTakeSettings() {
  if (eduTutorialSettings.saved) {
    return;  // a second tutorial before the first was put back
  }
  eduTutorialSettings.saved = true;
  eduTutorialSettings.registerBase = st_regDisplayBase;
  eduTutorialSettings.dataBase = eduDataModel != 0 ? eduDataModel->base() : 16;
  eduTutorialSettings.dataUnit =
      eduDataModel != 0 ? int(eduDataModel->unit()) : int(edu::WordUnit);
  eduTutorialSettings.showUserText = st_showUserTextSegment;
  eduTutorialSettings.showKernelText = st_showKernelTextSegment;
  eduTutorialSettings.layoutPreset = eduLayoutPreset;
  // Which of the panels that share a place was in front.  The tutorial
  // brings each one forward as it points at it, and the student should
  // find the one they were on when it ends (Z).
  eduTutorialSettings.frontPanel.clear();
  QDockWidget* const sharing[] = {(QDockWidget*)eduEditor,
                                  ui->TextSegDockWidget,
                                  ui->DataSegDockWidget};
  for (unsigned i = 0; i < sizeof(sharing) / sizeof(sharing[0]); i += 1) {
    if (sharing[i] != 0 && !sharing[i]->isHidden() &&
        !sharing[i]->visibleRegion().isEmpty()) {
      eduTutorialSettings.frontPanel = sharing[i]->objectName();
      break;
    }
  }
  // The tutorial scrolls the panels sideways to reach the cell it is pointing
  // at; it starts from the left and gives the student's own position back
  // at the end (S).
  eduTutorialSettings.textSideways =
      ui->TextSegView->horizontalScrollBar()->value();
  eduTutorialSettings.dataSideways =
      ui->DataSegPanel->view()->horizontalScrollBar()->value();
  eduTutorialSettings.registerSideways =
      ui->IntRegView->horizontalScrollBar()->value();
  ui->TextSegView->horizontalScrollBar()->setValue(0);
  ui->DataSegPanel->view()->horizontalScrollBar()->setValue(0);
  ui->IntRegView->horizontalScrollBar()->setValue(0);

  st_regDisplayBase = 16;
  setCheckedRegBase(st_regDisplayBase);
  if (ui->DataSegPanel != 0) {
    eduDataModel->setBase(16);
    ui->DataSegPanel->view()->setUnit(edu::WordUnit);
  }
  st_showUserTextSegment = true;
  st_showKernelTextSegment = true;
  ui->action_Text_DisplayUserText->setChecked(true);
  ui->action_Text_DisplayKernelText->setChecked(true);
  eduApplyLayout(0);
  DisplayIntRegisters();
  DisplayTextSegments(false);
  UpdateDataDisplay();
}

void SpimView::eduTutorialPutSettingsBack() {
  if (!eduTutorialSettings.saved) {
    return;
  }
  eduTutorialSettings.saved = false;
  st_regDisplayBase = eduTutorialSettings.registerBase;
  setCheckedRegBase(st_regDisplayBase);
  if (ui->DataSegPanel != 0) {
    eduDataModel->setBase(eduTutorialSettings.dataBase);
    ui->DataSegPanel->view()->setUnit(
        edu::MemoryUnit(eduTutorialSettings.dataUnit));
  }
  st_showUserTextSegment = eduTutorialSettings.showUserText;
  st_showKernelTextSegment = eduTutorialSettings.showKernelText;
  ui->action_Text_DisplayUserText->setChecked(st_showUserTextSegment);
  ui->action_Text_DisplayKernelText->setChecked(st_showKernelTextSegment);
  if (eduTutorialSettings.layoutPreset != 0) {
    eduApplyLayout(eduTutorialSettings.layoutPreset);
  }
  DisplayIntRegisters();
  DisplayTextSegments(false);
  UpdateDataDisplay();
}

// Last of all, and not in one go: closing the example and reinitialising
// the simulator rebuild the panels, and a view only works out how far it
// can be scrolled at its next layout pass.  Asking before that would clamp
// the value to nothing, so this comes back every few milliseconds until
// each panel has the room again -- or until it is plain that it never
// will, because the program it was showing is gone (S).
void SpimView::eduTutorialPutScrollBack() {
  // The panel the student was on, too: the tutorial brings each one
  // forward as it points at it (Z).
  if (!eduTutorialSettings.frontPanel.isEmpty()) {
    QDockWidget* front =
        findChild<QDockWidget*>(eduTutorialSettings.frontPanel);
    if (front != 0 && !front->isHidden()) {
      eduBringToFront(front);
    }
  }
  struct { QAbstractScrollArea* view; int want; } const back[] = {
      {ui->TextSegView, eduTutorialSettings.textSideways},
      {ui->DataSegPanel->view(), eduTutorialSettings.dataSideways},
      {ui->IntRegView, eduTutorialSettings.registerSideways}};
  bool waiting = false;
  for (unsigned i = 0; i < sizeof(back) / sizeof(back[0]); i += 1) {
    QScrollBar* bar = back[i].view->horizontalScrollBar();
    bar->setValue(back[i].want);
    if (bar->value() != back[i].want) {
      waiting = true;
    }
  }
  eduTutorialScrollTries += 1;
  if (waiting && eduTutorialScrollTries < 20) {
    QTimer::singleShot(10, this, SLOT(eduTutorialPutScrollBack()));
  } else if (waiting) {
    // Out of tries.  The panels stay wherever they are -- at the left
    // edge, most likely -- which is not wrong enough to tell the student
    // about, but is worth knowing about while developing.  See
    // docs/ARCHITECTURE.md 117.
#ifndef QT_NO_DEBUG
    qWarning("the tutorial gave up putting the panels back sideways after "
             "%d tries; they are further left than the student left them",
             eduTutorialScrollTries);
#endif
  }
}

// The tutorial is over, whichever way it ended.  What it borrowed goes back:
// the display settings the student had, the editor (its example is closed
// rather than left for someone to edit by accident), and the simulator.
// What is left is the start screen, which is where a student begins.
void SpimView::eduTutorialFinished() {
  eduTutorialPutSettingsBack();
  if (eduEditor != 0) {
    eduEditor->setReadOnly(false);
    eduEditor->closeFile(false);  // read-only: there is nothing to save
  }
  sim_ReinitializeSimulator();
  eduProgramLoaded = false;
  eduSyncedPath.clear();
  eduSyncedDigest.clear();
  eduEverAssembled = false;
  eduUpdateStaleBanner();
  eduUpdateWindowTitle();
  eduTutorialScrollTries = 0;
  eduTutorialPutScrollBack();
}

void SpimView::eduShowTutorial() {
  // The tutorial always walks the example program, so that every step has the
  // same thing to point at whoever starts it.  That means taking the
  // editor away from whatever it held, which is worth one question when
  // there is unsaved work in it; Cancel means the tutorial does not start and
  // nothing has changed.
  if (eduEditor != 0) {
    if (!eduEditor->maybeSave()) {
      return;
    }
    eduEditor->forgetChanges();  // answered: opening must not ask again
  }
  if (eduTutorial == 0) {
    eduTutorial = new EduTutorial(this);
  }
  connect(eduTutorial, SIGNAL(closed()), this, SLOT(eduTutorialFinished()),
          Qt::UniqueConnection);
  eduTutorialTakeSettings();
  eduTutorial->setProgramLoaded(eduLoadTutorialSample());
  eduTutorial->start();
}

// samples/tutorial.s, which ships next to the program.  Returns false when
// it is not there; the tutorial then leaves out the steps that need it.
QString SpimView::eduTutorialSamplePath() const {
  const QString appDir = QCoreApplication::applicationDirPath();
  const char* const places[] = {"/samples/tutorial.s", "/tutorial.s",
                                "/../samples/tutorial.s",
                                "/../../samples/tutorial.s"};
  for (unsigned i = 0; i < sizeof(places) / sizeof(places[0]); i += 1) {
    const QFileInfo candidate(appDir + QString(places[i]));
    if (candidate.exists()) {
      return candidate.absoluteFilePath();
    }
  }
  return QString();
}

bool SpimView::eduLoadTutorialSample() {
  const QString path = eduTutorialSamplePath();
  if (path.isEmpty() || !edu::confirmPathLoadable(this, path)) {
    return false;
  }
  // Reinitialize first, always: assembled on top of a program that already
  // has a main:, the example is a duplicate-label error.  This is what
  // File > Reinitialize and Load File does.
  sim_ReinitializeSimulator();
  eduLoadAssemblyFile(path);
  eduEditorFileLoaded(path);
  DisplayTextSegments(true);
  UpdateDataDisplay();
  eduRunToTutorialStop();
  // The example belongs to the tutorial while the tutorial is running: a student
  // editing it would be editing a file in the installation folder, and
  // the tutorial would be describing something that had changed under it.
  if (eduEditor != 0) {
    eduEditor->setReadOnly(true);
  }
  return eduProgramLoaded;
}

// Where the tutorial wants the example to be: inside sum_array, the third time
// the loop comes round.  The frame is on the stack, $sp has moved, two
// elements have been added and the running total has been written to
// memory twice -- so the register panel, the data panel and the stack
// markers all have something true to show.  The stop is a label, not a
// number of steps: editing the example cannot silently move it.
void SpimView::eduRunToTutorialStop() {
  const int kWantedVisits = 3;
  const int kMaxSteps = 800;
  quint32 stop = 0;
  const bool known =
      eduDataModel != 0 && eduDataModel->labels().find("sum_loop", &stop);
  if (!known) {
    const QString file = QFileInfo(eduTutorialSamplePath()).fileName();
    qWarning("tutorial: sum_loop is not in %s; the example is left at its "
             "entry point", qPrintable(file));
    return;
  }
  // One run command, so that the register panel marks everything it
  // changed -- which is what the step about changed values points at.
  // Single stepping takes a new baseline each time, so it is held for the
  // length of this run.
  eduBeginRunCommand();
  eduRegisterModel->setSnapshotHeld(true);
  int visits = 0;
  bool arrived = false;
  for (int i = 0; i < kMaxSteps && !arrived; i += 1) {
    if (quint32(PC) == stop) {
      visits += 1;
      arrived = visits >= kWantedVisits;
    }
    if (!arrived && statusBar()->currentMessage() == "Stopped") {
      break;
    }
    if (!arrived) {
      sim_SingleStep();
    }
  }
  if (!arrived) {
    qWarning("tutorial: sum_loop was not reached %d times in %d steps",
             kWantedVisits, kMaxSteps);
  }
  eduRegisterModel->setSnapshotHeld(false);
  eduRefreshRegisterPanel();
  eduRegisterModel->refresh();
  DisplayIntRegisters();
  DisplayTextSegments(false);
  UpdateDataDisplay();
}

// The title bar names the file the editor has open, as editors do:
// "helloworld.s \u2014 Hallym MIPS Simulator".
void SpimView::eduUpdateWindowTitle() {
  QString name;
  if (eduEditor != 0 && !eduEditor->filePath().isEmpty()) {
    name = QFileInfo(eduEditor->filePath()).fileName();
  }
  setWindowTitle(name.isEmpty()
                     ? QString(EDU_APP_NAME)
                     : name + QString::fromUtf8(" \xe2\x80\x94 ") + EDU_APP_NAME);
}

// Dragging a dock to a new place in the same row leaves Qt's idea of the
// split, which is whatever the drop indicator happened to show -- often a
// narrow strip at the edge.  Anything the user does afterwards with the
// splitter itself is left alone; this runs only when a dock lands somewhere
// new, and only once.
void SpimView::eduDockMoved() {
  eduSyncDockTitles();  // it may have joined or left a tab group
  if (eduLayoutSettled) {
    QTimer::singleShot(0, this, SLOT(eduEqualiseDocks()));
  }
}

void SpimView::eduEqualiseDocks() {
  QDockWidget* const candidates[] = {eduEditor, ui->TextSegDockWidget,
                                     ui->DataSegDockWidget};
  QList<QDockWidget*> open;
  for (unsigned i = 0; i < sizeof(candidates) / sizeof(candidates[0]); i += 1) {
    QDockWidget* dock = candidates[i];
    // A dock that is behind another tab is parked off the window; it shares
    // its neighbour's rectangle and has nothing of its own to even out.
    if (dock != 0 && dock->isVisible() && !dock->isFloating() &&
        rect().contains(dock->geometry().center())) {
      open << dock;
    }
  }
  if (open.size() < 2) {
    return;
  }

  // Side by side or stacked?  Compare where they sit, not how big they are.
  bool sideBySide = true;
  bool stacked = true;
  for (int i = 0; i < open.size(); i += 1) {
    for (int j = i + 1; j < open.size(); j += 1) {
      const QRect a = open.at(i)->geometry();
      const QRect b = open.at(j)->geometry();
      sideBySide = sideBySide && a.center().x() != b.center().x();
      stacked = stacked && a.center().y() != b.center().y();
    }
  }
  if (!sideBySide && !stacked) {
    return;
  }
  QList<int> sizes;
  for (int i = 0; i < open.size(); i += 1) {
    sizes << 1000;  // equal values: Qt shares the room out in proportion
  }
  resizeDocks(open, sizes, sideBySide ? Qt::Horizontal : Qt::Vertical);
}

// A dock tab whose title does not fit is cut off in the middle of a word;
// an ellipsis says that there is more.  The tab bars are made by
// QMainWindow when docks are tabbed together, so this runs after every
// arrangement as well as at start-up.
// A panel that sits in a tab group is named by its tab; its own title bar
// would say the same thing again, one line below.  It is put back the
// moment the panel is on its own, because then the title bar is the only
// name it has -- and the only thing to drag it by.
// Every panel answers the same three shortcuts and the same wheel, each
// with its own size.  What a size means is the panel's own business, which
// is what eduApplyPanelZoom() sorts out.
void SpimView::eduSetupPanelZoom() {
  struct {
    QWidget* panel;
    const char* key;
    EduPanelZoom** slot;
  } const panels[] = {
      {ui->TextSegView, "Text/FontPointSize", &eduTextZoom},
      {ui->DataSegPanel->view(), "Data/FontPointSize", &eduDataZoom},
      {eduInspector->widget(), "Inspector/FontPointSize", &eduInspectorZoom},
      {SpimConsole, "Console/FontPointSize", &eduConsoleZoom},
  };
  for (unsigned i = 0; i < sizeof(panels) / sizeof(panels[0]); i += 1) {
    EduPanelZoom* zoom =
        new EduPanelZoom(panels[i].panel, QString(panels[i].key), this);
    // The base is the one chosen in Settings and kept between runs; the
    // offset the keys make is this run's only (GG).
    zoom->setBasePointSize(st_panelPointSize > 0
                               ? st_panelPointSize
                               : int(edu::theme::kCodePointSize));
    zoom->setOffset(0);
    connect(zoom, SIGNAL(pointSizeChanged(int)), this,
            SLOT(eduPanelZoomChanged(int)));
    *panels[i].slot = zoom;
  }
}

// The size for one panel changed: apply it, and remember it.
void SpimView::eduPanelZoomChanged(int points) {
  EduPanelZoom* zoom = qobject_cast<EduPanelZoom*>(sender());
  if (zoom == 0) {
    return;
  }
  (void)zoom;  // the size is not remembered between runs (AA)
  eduApplyPanelZoom(zoom->settingsKey(), points);
}

void SpimView::eduApplyPanelZoom(const QString& key, int points) {
  if (key.startsWith("Text/")) {
    // The editor is a panel of its own with its own keys; it does not
    // follow the Text panel's size (GG).
    QFont font = st_textWinFont;
    font.setPointSize(points);
    ui->TextSegView->applyPanelFont(font);
  } else if (key.startsWith("Data/")) {
    QFont font = st_textWinFont;  // the Data panel follows the Text window
    font.setPointSize(points);
    ui->DataSegPanel->view()->applyPanelFont(font);
  } else if (key.startsWith("Inspector/")) {
    QFont font = edu::theme::codeFont();
    font.setPointSize(points);
    eduInspector->setPanelFont(font);
  } else if (key.startsWith("Console/")) {
    QFont font = edu::theme::codeFont();
    font.setPointSize(points);
    SpimConsole->setFont(font);
    if (eduBottom != 0 && eduBottom->messages() != 0) {
      eduBottom->messages()->setFont(font);
    }
  }
}

// Simulator > Settings: one size for all of them at once.
// Settings > "All panels text size": the base every panel starts from.
// It is kept in the settings file, and it does not throw away a zoom the
// student has going (GG).
void SpimView::eduSetAllPanelSizes(int points) {
  st_panelPointSize = qBound(int(EduPanelZoom::kMinPointSize), points,
                             int(EduPanelZoom::kMaxPointSize));
  EduPanelZoom* const zooms[] = {eduTextZoom, eduDataZoom, eduInspectorZoom,
                                 eduConsoleZoom};
  for (unsigned i = 0; i < sizeof(zooms) / sizeof(zooms[0]); i += 1) {
    if (zooms[i] != 0) {
      zooms[i]->setBasePointSize(st_panelPointSize);
    }
  }
  eduSetRegisterPointSize(st_panelPointSize);  // "all panels" includes these
  if (eduEditor != 0) {
    eduEditor->editor()->setBasePointSize(st_panelPointSize);
    eduEditor->editor()->setPointSize(st_panelPointSize);
  }
}

// The Registers panel has no EduPanelZoom: its font is the one in Settings
// (st_regWinFont), so its size is changed there and the panel refreshed.
void SpimView::eduSetRegisterPointSize(int points) {
  QFont font = st_regWinFont;
  font.setPointSize(qBound(int(EduPanelZoom::kMinPointSize), points,
                           int(EduPanelZoom::kMaxPointSize)));
  if (font == st_regWinFont) {
    return;
  }
  st_regWinFont = font;
  eduRefreshRegisterPanel();
}

int SpimView::eduRegisterPointSize() const { return st_regWinFont.pointSize(); }

void SpimView::eduSyncDockTitles() {
  QDockWidget* const docks[] = {
      ui->IntRegDockWidget,     ui->FPRegDockWidget,
      ui->TextSegDockWidget,    ui->DataSegDockWidget,
      eduEditor,                (QDockWidget*)eduBottom,
      (QDockWidget*)eduInspector};
  for (unsigned i = 0; i < sizeof(docks) / sizeof(docks[0]); i += 1) {
    QDockWidget* dock = docks[i];
    if (dock == 0) {
      continue;
    }
    const bool tabbed =
        !dock->isFloating() && !tabifiedDockWidgets(dock).isEmpty();
    if (tabbed && dock->titleBarWidget() == 0) {
      dock->setTitleBarWidget(new QWidget(dock));
    } else if (!tabbed && dock->titleBarWidget() != 0) {
      QWidget* bar = dock->titleBarWidget();
      dock->setTitleBarWidget(0);
      delete bar;
    }
  }
}

// The tabs over a shared place (Z).  A panel behind its tab cannot show
// its "Source changed" strip, so its tab carries a dot instead, and the
// dot goes as soon as that tab is the one in front.
//
// The mark goes in the dock's window title, not in the tab's text: Qt
// takes a tab's text from the dock's title on every layout pass, so
// anything written straight into the tab is gone at the next one.
//
// Called whenever the arrangement, a title or the strip changes.
void SpimView::eduSyncDockTabs() {
  eduElideDockTabs();  // bars can be made after an arrangement is applied
  if (eduInDockTabSync) {
    return;  // setWindowTitle() below comes back here
  }
  eduInDockTabSync = true;
  const QChar dot(0x25CF);
  struct { QDockWidget* dock; const char* base; } const marked[] = {
      {ui->TextSegDockWidget, "Text"}, {ui->DataSegDockWidget, "Data"}};
  for (unsigned i = 0; i < sizeof(marked) / sizeof(marked[0]); i += 1) {
    QDockWidget* dock = marked[i].dock;
    if (dock == 0) {
      continue;
    }
    const bool behind = dock->isHidden() || dock->visibleRegion().isEmpty();
    QString wanted = QLatin1String(marked[i].base);
    if (eduStaleBannerShowing() && behind) {
      wanted += QLatin1Char(' ');
      wanted += dot;
    }
    if (dock->windowTitle() != wanted) {
      dock->setWindowTitle(wanted);
    }
  }
  const QList<QTabBar*> bars = findChildren<QTabBar*>();
  for (int b = 0; b < bars.size(); b += 1) {
    connect(bars.at(b), SIGNAL(currentChanged(int)), this,
            SLOT(eduSyncDockTabs()), Qt::UniqueConnection);
  }
  eduInDockTabSync = false;
}

void SpimView::eduElideDockTabs() {
  const QList<QTabBar*> bars = findChildren<QTabBar*>();
  for (int i = 0; i < bars.size(); i += 1) {
    if (bars.at(i)->elideMode() != Qt::ElideRight) {
      bars.at(i)->setElideMode(Qt::ElideRight);
    }
  }
}

// The student guide that ships with the program: the PDFs in the Windows
// zip, or the Markdown sources in a development checkout.
void SpimView::eduShowUserGuide() {
  const QString appDir = QCoreApplication::applicationDirPath();
  const char* const dirs[] = {"", "/docs", "/../docs", "/../../docs"};
  const char* const names[] = {"HallymMIPS-GUIDE-ko.pdf", "HallymMIPS-GUIDE.pdf",
                               "GUIDE-ko.md", "GUIDE.md"};
  for (unsigned d = 0; d < sizeof(dirs) / sizeof(dirs[0]); d += 1) {
    for (unsigned n = 0; n < sizeof(names) / sizeof(names[0]); n += 1) {
      const QFileInfo guide(appDir + QString(dirs[d]) + "/" + names[n]);
      if (guide.exists()) {
        QDesktopServices::openUrl(QUrl::fromLocalFile(guide.absoluteFilePath()));
        return;
      }
    }
  }
  QMessageBox box(this);
  box.setObjectName("EduGuideMissing");
  box.setIcon(QMessageBox::Information);
  box.setWindowTitle("User Guide");
  box.setText(QString("The user guide is not next to the program.\n\n"
                      "It is on the release page of ") + EDU_APP_NAME +
              " as HallymMIPS-GUIDE-ko.pdf.");
  box.exec();
}

// Re-parents a dock's content into a box with the token's top margin.
void SpimView::eduInsetDockContent(QDockWidget* dock) {
  QWidget* content = dock->widget();
  QWidget* box = new QWidget(dock);
  QVBoxLayout* layout = new QVBoxLayout(box);
  layout->setContentsMargins(0, edu::theme::kSpace1, 0, 0);
  layout->setSpacing(0);
  layout->addWidget(content, 1);
  dock->setWidget(box);
}

// The window, in two arrangements:
//
//   preset 0        registers | editor        | text / data
//                             | console / msg | inspector
//
//   preset 1        registers | text / data   | editor
//                             | inspector     | console / msg
//
//   preset 2        registers | editor / text / data
//                             | console / msg | inspector
//
// Preset 2 is for a window that is only half a screen wide (Z): with two
// columns of code there is not enough of either to read, so the editor and
// the two panels share one place and the tabs above them say which is in
// front.  The registers keep the left and the bottom row keeps the bottom.
//
// The register column is the LEFT dock area, which runs the full height of
// the window (setCorner() in the constructor gives it both left corners),
// so all eight groups and their thirty-nine registers are one column with
// no second tab bar down the side.  There is no central widget: the docks
// have the window to themselves.
void SpimView::eduApplyLayout(int preset) {
  const bool mirrored = preset == 1;
  QDockWidget* const all[] = {
      ui->IntRegDockWidget,     ui->FPRegDockWidget,
      eduEditor,                ui->TextSegDockWidget,
      ui->DataSegDockWidget,    (QDockWidget*)eduBottom,
      (QDockWidget*)eduInspector};
  for (unsigned i = 0; i < sizeof(all) / sizeof(all[0]); i += 1) {
    if (all[i] == 0) {
      continue;
    }
    all[i]->setFloating(false);
    all[i]->show();
  }

  // Everything goes into one dock area, side by side: docks in different
  // areas cannot be sized against each other (resizeDocks() works within
  // an area), and the window has no central widget to arrange them around.
  // The .ui asks for vertical tabs, which would run the titles down the
  // side of the window; tabs belong above what they open.
  setDockOptions(dockOptions() & ~QMainWindow::VerticalTabs);
  setTabPosition(Qt::AllDockWidgetAreas, QTabWidget::North);

  if (preset == 2) {
    addDockWidget(Qt::RightDockWidgetArea, ui->IntRegDockWidget);
    splitDockWidget(ui->IntRegDockWidget, eduEditor, Qt::Horizontal);
    splitDockWidget(eduEditor, (QDockWidget*)eduBottom, Qt::Vertical);
    splitDockWidget((QDockWidget*)eduBottom, (QDockWidget*)eduInspector,
                    Qt::Horizontal);
    tabifyDockWidget(eduEditor, ui->TextSegDockWidget);
    tabifyDockWidget(ui->TextSegDockWidget, ui->DataSegDockWidget);
    tabifyDockWidget(ui->IntRegDockWidget, ui->FPRegDockWidget);
    ui->IntRegDockWidget->raise();
    eduEditor->raise();
  } else {
    QDockWidget* const middleTop = mirrored ? ui->TextSegDockWidget : eduEditor;
    QDockWidget* const rightTop = mirrored ? eduEditor : ui->TextSegDockWidget;
    QDockWidget* const middleBottom =
        mirrored ? (QDockWidget*)eduInspector : (QDockWidget*)eduBottom;
    QDockWidget* const rightBottom =
        mirrored ? (QDockWidget*)eduBottom : (QDockWidget*)eduInspector;

    addDockWidget(Qt::RightDockWidgetArea, ui->IntRegDockWidget);
    splitDockWidget(ui->IntRegDockWidget, middleTop, Qt::Horizontal);
    splitDockWidget(middleTop, rightTop, Qt::Horizontal);
    splitDockWidget(middleTop, middleBottom, Qt::Vertical);
    splitDockWidget(rightTop, rightBottom, Qt::Vertical);

    // The two pairs that share a place: the registers, and Text with Data.
    tabifyDockWidget(ui->IntRegDockWidget, ui->FPRegDockWidget);
    ui->IntRegDockWidget->raise();
    tabifyDockWidget(ui->TextSegDockWidget, ui->DataSegDockWidget);
    ui->TextSegDockWidget->raise();
  }

  eduElideDockTabs();   // the tab bars are new
  eduSyncDockTitles();  // a tabbed panel needs no second title
  eduSyncDockTabs();    // short labels, and the dot for a hidden strip
  QTimer::singleShot(0, this, SLOT(eduFollowCrossHandle()));

  // The proportions are set once this arrangement has been through the
  // layout, and again whenever the window's size changes under it.
  eduLayoutPreset = preset;
  eduLayoutSizesPending = true;
  eduLayoutSizeTries = 0;
  eduLayoutLastRegisterWidth = -1;
  QTimer::singleShot(0, this, SLOT(eduApplyLayoutSizes()));
}

// The register column keeps to the width of its table; the other two
// columns share what is left of the window, half each; and in both of them
// the panel above is about twice the height of the one below it (65:35).
// This runs after the splits have been through the layout: asked for in
// the same breath, the sizes are worked out against the window's old shape
// and then redistributed.
void SpimView::eduApplyLayoutSizes() {
  if (eduLayoutPreset == 2) {
    // One column of code beside the registers, and the bottom row shared
    // between Console/Messages and the Instruction Inspector.
    const int columnWidth = edu::theme::kRegisterColumnWidth;
    const int rest = qMax(200, width() - columnWidth);
    QList<QDockWidget*> columns;
    columns << ui->IntRegDockWidget << eduEditor;
    QList<int> widths;
    widths << columnWidth << rest;
    resizeDocks(columns, widths, Qt::Horizontal);

    const int usable = qMax(200, height() - 140);
    QList<QDockWidget*> rows;
    rows << eduEditor << (QDockWidget*)eduBottom;
    QList<int> heights;
    heights << usable * 65 / 100 << usable * 35 / 100;
    resizeDocks(rows, heights, Qt::Vertical);

    QList<QDockWidget*> bottom;
    bottom << (QDockWidget*)eduBottom << (QDockWidget*)eduInspector;
    QList<int> bottomWidths;
    bottomWidths << rest / 2 << rest / 2;
    resizeDocks(bottom, bottomWidths, Qt::Horizontal);

    eduHoldDockSize(ui->IntRegDockWidget, columnWidth, -1);
    eduHoldDockSize((QDockWidget*)eduBottom, -1, usable * 35 / 100);
    eduLayoutSizesPending = width() < 900;
    return;
  }
  const bool mirrored = eduLayoutPreset == 1;
  QDockWidget* const middleTop = mirrored ? ui->TextSegDockWidget : eduEditor;
  QDockWidget* const rightTop = mirrored ? eduEditor : ui->TextSegDockWidget;
  QDockWidget* const middleBottom =
      mirrored ? (QDockWidget*)eduInspector : (QDockWidget*)eduBottom;
  QDockWidget* const rightBottom =
      mirrored ? (QDockWidget*)eduBottom : (QDockWidget*)eduInspector;

  const int columnWidth = edu::theme::kRegisterColumnWidth;
  const int rest = qMax(200, width() - columnWidth);
  QList<QDockWidget*> columns;
  columns << ui->IntRegDockWidget << middleTop << rightTop;
  QList<int> widths;
  widths << columnWidth << rest / 2 << rest / 2;
  resizeDocks(columns, widths, Qt::Horizontal);

  const int usable = qMax(200, height() - 140);  // menus, tool bar, status
  QList<QDockWidget*> rows;
  rows << middleTop << middleBottom << rightTop << rightBottom;
  QList<int> heights;
  heights << usable * 65 / 100 << usable * 35 / 100 << usable * 65 / 100
          << usable * 35 / 100;
  resizeDocks(rows, heights, Qt::Vertical);

  // resizeDocks() only reaches docks that sit directly in the same
  // splitter, and these are nested one level deeper, so the sizes above
  // are a wish rather than an instruction.  Holding a dock to a size for
  // one pass of the layout is what actually moves the splitter; the hold
  // is let go immediately, so nothing is fixed afterwards.
  eduHoldDockSize(ui->IntRegDockWidget, columnWidth, -1);
  eduHoldDockSize(middleBottom, -1, usable * 35 / 100);
  eduHoldDockSize(rightBottom, -1, usable * 35 / 100);

  // Until the window has its real size the proportions are worked out
  // against a shape it will not keep.  Waiting for a resize is not enough
  // -- a window that opens at its final size never sends one -- so this
  // comes back a few times until the register column has the width it was
  // given, or until it is plain that the window is too narrow for it.
  const int registerWidth = ui->IntRegDockWidget->width();
  const bool wide = registerWidth >= columnWidth - 8;
  // Stop when the column has the width it was given, or when coming back
  // has stopped helping -- in a narrow window the three columns cannot all
  // have what they ask for, and that is not a failure.
  const bool settled =
      wide || (eduLayoutSizeTries > 0 &&
               registerWidth == eduLayoutLastRegisterWidth);
  eduLayoutLastRegisterWidth = registerWidth;
  eduLayoutSizesPending = !settled;
  if (!settled && eduLayoutSizeTries < 10) {
    eduLayoutSizeTries += 1;
    QTimer::singleShot(10, this, SLOT(eduApplyLayoutSizes()));
  } else if (!settled) {
    // Out of tries: the columns keep whatever widths the layout gave them,
    // so the register column is narrower than it should be and the two
    // beside it wider.  See docs/ARCHITECTURE.md 117.
#ifndef QT_NO_DEBUG
    qWarning("the column widths did not settle after %d tries; the register "
             "column is %d wide, not %d",
             eduLayoutSizeTries, registerWidth, columnWidth);
#endif
  }
}

// Sizes one dock by holding it there for a single layout pass.  -1 leaves
// that direction alone.
void SpimView::eduHoldDockSize(QDockWidget* dock, int width, int height) {
  if (dock == 0 || dock->isHidden()) {
    return;
  }
  if (width > 0) {
    dock->setMinimumWidth(width);
    dock->setMaximumWidth(width);
  }
  if (height > 0) {
    dock->setMinimumHeight(height);
    dock->setMaximumHeight(height);
  }
  // Twice, with the posted layout requests flushed in between: one pass
  // is not always enough for the splitter to move, and a hold that is let
  // go too early leaves the dock where it was (AA).
  QApplication::processEvents(QEventLoop::ExcludeUserInputEvents);
  QCoreApplication::sendPostedEvents(0, QEvent::LayoutRequest);
  QApplication::processEvents(QEventLoop::ExcludeUserInputEvents);
  if (width > 0) {
    dock->setMinimumWidth(0);
    dock->setMaximumWidth(QWIDGETSIZE_MAX);
  }
  if (height > 0) {
    dock->setMinimumHeight(0);
    dock->setMaximumHeight(QWIDGETSIZE_MAX);
  }
}

// The four panels of the two by two block, in the order they are on
// screen.  False when the block is not there: a panel closed, floated, or
// dragged somewhere else.
bool SpimView::eduSplitPanels(QDockWidget** middleTop,
                              QDockWidget** middleBottom,
                              QDockWidget** rightTop,
                              QDockWidget** rightBottom) const {
  if (eduLayoutPreset == 2) {
    return false;  // one column of code: there is no two by two block (Z)
  }
  const bool mirrored = eduLayoutPreset == 1;
  QDockWidget* const top = mirrored ? ui->TextSegDockWidget : eduEditor;
  QDockWidget* const other = mirrored ? eduEditor : ui->TextSegDockWidget;
  QDockWidget* const under =
      mirrored ? (QDockWidget*)eduInspector : (QDockWidget*)eduBottom;
  QDockWidget* const underOther =
      mirrored ? (QDockWidget*)eduBottom : (QDockWidget*)eduInspector;
  QDockWidget* const all[] = {top, under, other, underOther};
  for (unsigned i = 0; i < sizeof(all) / sizeof(all[0]); i += 1) {
    if (all[i] == 0 || all[i]->isHidden() || all[i]->isFloating() ||
        all[i]->visibleRegion().isEmpty()) {
      return false;
    }
  }
  // They have to be where the arrangement puts them: two columns, two rows.
  if (top->x() >= other->x() || under->y() <= top->y() ||
      underOther->y() <= other->y()) {
    return false;
  }
  *middleTop = top;
  *middleBottom = under;
  *rightTop = other;
  *rightBottom = underOther;
  return true;
}

// Where the line down the middle meets the line across: the gap between
// the four panels.
bool SpimView::eduSplitCrossing(QRect* crossing) const {
  QDockWidget *middleTop = 0, *middleBottom = 0, *rightTop = 0,
              *rightBottom = 0;
  if (!eduSplitPanels(&middleTop, &middleBottom, &rightTop, &rightBottom)) {
    return false;
  }
  const int left = middleTop->geometry().right() + 1;
  const int right = rightTop->geometry().left();
  const int top = middleTop->geometry().bottom() + 1;
  const int bottom = middleBottom->geometry().top();
  *crossing = QRect(QPoint(left, top), QPoint(right, bottom));
  return true;
}

void SpimView::eduSplitSizes(int* columnWidth, int* rowHeight) const {
  QDockWidget *middleTop = 0, *middleBottom = 0, *rightTop = 0,
              *rightBottom = 0;
  *columnWidth = 0;
  *rowHeight = 0;
  if (eduSplitPanels(&middleTop, &middleBottom, &rightTop, &rightBottom)) {
    *columnWidth = middleTop->width();
    *rowHeight = middleTop->height();
  }
}

// The crossing handle's drag: both lines at once.
void SpimView::eduSetSplitSizes(int columnWidth, int rowHeight) {
  QDockWidget *middleTop = 0, *middleBottom = 0, *rightTop = 0,
              *rightBottom = 0;
  if (!eduSplitPanels(&middleTop, &middleBottom, &rightTop, &rightBottom)) {
    return;
  }
  const int columns = middleTop->width() + rightTop->width();
  const int rows = middleTop->height() + middleBottom->height();
  const int wantedWidth = qBound(120, columnWidth, columns - 120);
  const int wantedHeight = qBound(80, rowHeight, rows - 80);

  QList<QDockWidget*> horizontal;
  horizontal << middleTop << rightTop;
  QList<int> widths;
  widths << wantedWidth << columns - wantedWidth;
  resizeDocks(horizontal, widths, Qt::Horizontal);

  QList<QDockWidget*> vertical;
  vertical << middleTop << middleBottom << rightTop << rightBottom;
  QList<int> heights;
  heights << wantedHeight << rows - wantedHeight << wantedHeight
          << rows - wantedHeight;
  resizeDocks(vertical, heights, Qt::Vertical);
  eduDragMiddleTop = wantedHeight;
  eduDragRightTop = wantedHeight;
}

// One of the two horizontal lines was dragged: the other goes with it, so
// that the block reads as one grid rather than two columns that happen to
// be side by side.
void SpimView::eduSyncSplits() {
  QDockWidget *middleTop = 0, *middleBottom = 0, *rightTop = 0,
              *rightBottom = 0;
  if (!eduSplitPanels(&middleTop, &middleBottom, &rightTop, &rightBottom)) {
    eduFollowCrossHandle();
    return;
  }
  // The two columns start out with their lines level, though their top
  // panels are not the same height: one of them has a tab bar above it.
  // So the follower moves by the same amount the leader moved, which
  // keeps whatever alignment they had.
  const int middleMoved = middleTop->height() - eduDragMiddleTop;
  const int rightMoved = rightTop->height() - eduDragRightTop;
  if (middleMoved != 0 || rightMoved != 0) {
    QDockWidget* const leaderBottom =
        middleMoved != 0 ? middleBottom : rightBottom;
    QDockWidget* const followerBottom =
        middleMoved != 0 ? rightBottom : middleBottom;
    // Where the line has to end up, and how much of the follower's column
    // is below it.  resizeDocks() only asks; holding the panel at that
    // height for one pass of the layout is what moves the line exactly
    // (the same trick the register column's width uses).
    const int wantedLine = leaderBottom->y();
    const int height =
        followerBottom->geometry().bottom() - wantedLine + 1;
    if (height >= 80) {
      eduHoldDockSize(followerBottom, -1, height);
    }
  }
  eduDragMiddleTop = middleTop->height();
  eduDragRightTop = rightTop->height();
  eduFollowCrossHandle();
}

void SpimView::eduFollowCrossHandle() {
  if (eduCrossHandle != 0) {
    eduCrossHandle->follow();
  }
}

// The one screen every run starts from (AA), and what Window > Reset
// Layout puts back.  A machine in the laboratory is used by one student
// after another; the second should not inherit the first one's
// arrangement, column widths, text sizes and number bases and wonder what
// they did wrong.  Everything about the screen is here, in one place, so
// that "the default" is one thing and not a dozen scattered ones.
void SpimView::eduApplyDefaultState() {
  // The window: a comfortable part of the screen, in the middle of it,
  // and never larger than what the screen has.  Half a 1920 screen
  // (960x1080) is a shape students use, so nothing may depend on width.
  const QRect available = QApplication::desktop()->availableGeometry(this);
  const int wanted = qBound(800, available.width() * 5 / 6, 1600);
  const int high = qBound(600, available.height() * 5 / 6, 1000);
  resize(qMin(wanted, available.width()), qMin(high, available.height()));
  move(available.center() - QPoint(width() / 2, height() / 2));

  // Every panel open, the bottom panel showing, the first arrangement.
  const QList<QDockWidget*> docks = eduAllDocks();
  for (int i = 0; i < docks.size(); i += 1) {
    docks.at(i)->setFloating(false);
    docks.at(i)->show();
  }
  eduSetLogVisible(true);
  eduApplyLayout(0);

  // What each panel shows.
  st_regDisplayBase = setCheckedRegBase(16);
  st_dataSegmentDisplayBase = setCheckedDataSegmentDisplayBase(16);
  if (eduDataModel != 0) {
    eduDataModel->setBase(16);  // the menu and the model are two things
  }
  eduSetDataUnit(4);
  st_showUserTextSegment = true;
  st_showKernelTextSegment = true;
  st_showTextComments = true;
  st_showTextDisassembly = true;
  ui->action_Text_DisplayUserText->setChecked(true);
  ui->action_Text_DisplayKernelText->setChecked(true);
  ui->action_Text_DisplayComments->setChecked(true);
  ui->action_Text_DisplayInstructionValue->setChecked(true);
  st_showUserDataSegment = true;
  st_showUserStackSegment = true;
  st_showKernelDataSegment = true;
  ui->action_Data_DisplayUserData->setChecked(true);
  ui->action_Data_DisplayUserStack->setChecked(true);
  ui->action_Data_DisplayKernelData->setChecked(true);
  if (eduTextModel != 0) {
    eduTextModel->setKernelExpanded(false);
  }
  if (eduDataModel != 0) {
    eduDataModel->setEnvironmentExpanded(false);
  }

  // Text sizes: back to the base chosen in Settings, which is kept, by
  // throwing away only what the keys added in this run (GG).
  EduPanelZoom* const zooms[] = {eduTextZoom, eduDataZoom, eduInspectorZoom,
                                 eduConsoleZoom};
  for (unsigned i = 0; i < sizeof(zooms) / sizeof(zooms[0]); i += 1) {
    if (zooms[i] != 0) {
      zooms[i]->setOffset(0);
    }
  }
  eduSetAllPanelSizes(st_panelPointSize);

  // Not while the window is still being built: readSettings() calls this
  // from the constructor, and the register and floating-point views are
  // not ready to be drawn into yet.  The first display happens right
  // afterwards anyway.
  if (eduConstructed) {
    eduRefreshRegisterPanel();
    eduRefreshTextPanel();
    UpdateDataDisplay();
  }
  ui->TextSegView->resetColumnWidths();
  ui->DataSegPanel->view()->resetColumnWidths();

  // Where each panel is looking: the top, and the left.
  QAbstractScrollArea* const views[] = {ui->IntRegView, ui->TextSegView,
                                        ui->DataSegPanel->view()};
  for (unsigned i = 0; i < sizeof(views) / sizeof(views[0]); i += 1) {
    views[i]->verticalScrollBar()->setValue(
        views[i]->verticalScrollBar()->minimum());
    views[i]->horizontalScrollBar()->setValue(0);
  }

  // And which tab is in front of each pair.
  eduBringToFront(ui->IntRegDockWidget);
  eduBringToFront(ui->TextSegDockWidget);
  eduBringToFront(eduEditor);
  if (eduBottom != 0) {
    eduBottom->showConsole(false);
  }
}

// raise() alone is not enough to bring a panel out from behind its tab:
// it speaks to Qt only when the z-order really changes, and a panel that
// was raised once is already on top of the stack even after the tab bar
// has moved on to another panel.  So the tab bar is told as well (Z).
void SpimView::eduBringToFront(QDockWidget* dock) {
  if (dock == 0) {
    return;
  }
  dock->show();
  dock->lower();  // so that raise() is a real change and Qt hears about it
  dock->raise();
  const QList<QTabBar*> bars = findChildren<QTabBar*>();
  for (int b = 0; b < bars.size(); b += 1) {
    for (int t = 0; t < bars.at(b)->count(); t += 1) {
      if (bars.at(b)->tabText(t) == dock->windowTitle()) {
        bars.at(b)->setCurrentIndex(t);
        return;
      }
    }
  }
}

// Every panel of the window, in no particular order.  One list, so that a
// rule about the panels -- what they may do, where they may go, that none
// of them is floating -- is stated once (Y).
QList<QDockWidget*> SpimView::eduAllDocks() const {
  QList<QDockWidget*> docks;
  docks << ui->IntRegDockWidget << ui->FPRegDockWidget
        << ui->TextSegDockWidget << ui->DataSegDockWidget
        << (QDockWidget*)eduEditor << (QDockWidget*)eduBottom
        << (QDockWidget*)eduInspector;
  QList<QDockWidget*> real;
  for (int i = 0; i < docks.size(); i += 1) {
    if (docks.at(i) != 0) {
      real << docks.at(i);
    }
  }
  return real;
}

// Puts any panel that is floating back into the window.  Nothing in this
// build can float a panel any more, but a settings file written by an
// earlier one can still name a floating dock (Y).
void SpimView::eduDockEverything() {
  const QList<QDockWidget*> docks = eduAllDocks();
  for (int i = 0; i < docks.size(); i += 1) {
    if (docks.at(i)->isFloating()) {
      docks.at(i)->setFloating(false);
    }
  }
}

void SpimView::eduLayoutPrimary() { eduApplyLayout(0); }

void SpimView::eduLayoutMirrored() { eduApplyLayout(1); }

void SpimView::eduLayoutTabbed() { eduApplyLayout(2); }

bool SpimView::eventFilter(QObject* watched, QEvent* event) {
  // The system switched between its light and dark theme: say again what
  // this window's title bar should look like.
  if (watched == this && (event->type() == QEvent::ThemeChange ||
                          event->type() == QEvent::ApplicationPaletteChange)) {
    edu::theme::applyWindowChrome(this);
  }
  // The window has grown into its real size at last: the arrangement's
  // proportions were waiting for exactly that.
  if (watched == this && event->type() == QEvent::Resize &&
      eduLayoutSizesPending) {
    QTimer::singleShot(0, this, SLOT(eduApplyLayoutSizes()));
  }
  if (watched == this && event->type() == QEvent::Resize) {
    QTimer::singleShot(0, this, SLOT(eduFollowCrossHandle()));
  }

  // A dock separator is a gap, not a child widget, so a press with no
  // child under it is a press on one of the lines between the panels.
  // QMainWindow moves the line itself; what is added here is the second
  // horizontal line following the first, so that the block stays a block.
  if (watched == this && event->type() == QEvent::MouseButtonPress) {
    QMouseEvent* mouse = static_cast<QMouseEvent*>(event);
    if (mouse->button() == Qt::LeftButton && childAt(mouse->pos()) == 0) {
      eduSeparatorDragging = true;
      QDockWidget *middleTop = 0, *middleBottom = 0, *rightTop = 0,
                  *rightBottom = 0;
      if (eduSplitPanels(&middleTop, &middleBottom, &rightTop, &rightBottom)) {
        eduDragMiddleTop = middleTop->height();
        eduDragRightTop = rightTop->height();
      }
    }
  } else if (watched == this && event->type() == QEvent::MouseMove &&
             eduSeparatorDragging) {
    QTimer::singleShot(0, this, SLOT(eduSyncSplits()));
  } else if (watched == this && event->type() == QEvent::MouseButtonRelease &&
             eduSeparatorDragging) {
    eduSeparatorDragging = false;
    QTimer::singleShot(0, this, SLOT(eduSyncSplits()));
  }
  return QMainWindow::eventFilter(watched, event);
}

void SpimView::eduBeginRunCommand() { eduRegisterModel->beginRunCommand(); }

void SpimView::eduResetRegisterChanges() { eduRegisterModel->resetChanges(); }

// The tail of DisplayIntRegisters(): settings that upstream baked into its
// HTML are pushed into the model and view instead.
void SpimView::eduRefreshRegisterPanel() {
  eduRegisterModel->setBase(st_regDisplayBase);
  eduRegisterModel->setChangedColor(QColor(st_changedRegisterColor),
                                    st_colorChangedRegisters);

  // Setting a palette repaints the whole panel, and this runs on every
  // step, so it is only set when it is not already right (BB).
  QPalette palette = ui->IntRegView->palette();
  if (palette.color(QPalette::Base) != st_regWinBackgroundColor ||
      palette.color(QPalette::Text) != st_regWinFontColor) {
    palette.setColor(QPalette::Base, st_regWinBackgroundColor);
    palette.setColor(QPalette::Text, st_regWinFontColor);
    ui->IntRegView->setPalette(palette);
  }
  ui->IntRegView->applyPanelFont(st_regWinFont);
  eduRegisterModel->setPanelFont(st_regWinFont);
  eduInspector->setPanelFont(st_regWinFont);

  eduRegisterModel->refresh();
  eduUpdateInspector();
}

// The inspector follows the Text panel: selecting an instruction fills it,
// and a redraw keeps it on that instruction.  Choosing a register or a word
// of memory does not disturb it -- a register's bits are in the register
// panel itself (Registers > Binary) and a word of memory says what it holds
// in the tool tip of its cell.
void SpimView::eduRegisterSelected() {}

void SpimView::eduInstructionSelected() { eduUpdateInspector(); }

void SpimView::eduMemorySelected() {}

void SpimView::eduUpdateInspector() {
  quint32 address = 0;
  const EduTextModel::Row* row =
      ui->TextSegView->currentInstruction(&address)
          ? eduTextModel->rowAt(eduTextModel->rowOfAddress(address))
          : 0;
  if (row == 0) {
    eduInspector->showNothing();
    return;
  }
  // Which branch encoding this machine uses (ARCHITECTURE 13.2).
  const edu::BranchConvention convention =
      delayed_branches ? edu::MipsDelaySlot : edu::SpimNoDelaySlot;
  eduInspector->showInstruction(
      edu::decode(row->word, row->address, convention), row->address,
      row->disassembly, row->label, convention);
}

// These settings are saved and survive a restart.  With Bare Machine on, a
// pseudo instruction such as "li" is a syntax error, and a student who left
// it on looks for the mistake in the program.  The defaults are QtSpim's
// (state.cpp): not bare, pseudo instructions accepted, no delay slots.
void SpimView::eduUpdateModeBadge() {
  QStringList modes;
  if (!accept_pseudo_insts) modes << "Pseudo instructions off";
  if (delayed_branches) modes << "Delayed branches";
  if (delayed_loads) modes << "Delayed loads";
  const QString dot = QString(" ") + QChar(0x00b7) + QString(" ");  // middle dot
  eduModeBadge->setText(modes.join(dot));
  eduModeBadge->setToolTip(
      modes.isEmpty()
          ? QString()
          : QString("Simulator > Settings differs from the defaults.%1")
                .arg(!accept_pseudo_insts
                         ? "\nPseudo instructions (li, la, move, ...) are "
                           "syntax errors in this mode."
                         : ""));
  eduModeBadge->setVisible(!modes.isEmpty());
}

// DisplayTextSegments(): settings that upstream baked into its HTML are
// pushed into the model and view instead.
void SpimView::eduRefreshTextPanel() {
  // Every place that changes the machine settings (start-up, command-line
  // flags, the Settings dialog) redraws the text segment next.
  eduUpdateModeBadge();

  QPalette palette = ui->TextSegView->palette();
  palette.setColor(QPalette::Base, st_textWinBackgroundColor);
  palette.setColor(QPalette::Text, st_textWinFontColor);
  ui->TextSegView->setPalette(palette);
  // The family comes from Settings, the size from the panel's own base
  // and offset -- otherwise every refresh would undo a zoom (GG).
  QFont textFont = st_textWinFont;
  if (eduTextZoom != 0) {
    textFont.setPointSize(eduTextZoom->pointSize());
  }
  ui->TextSegView->applyPanelFont(textFont);
  eduTextModel->setColors(st_textWinFontColor, st_textWinBackgroundColor);
  QFont editorFont = st_textWinFont;  // the editor: same family, own size
  editorFont.setPointSize(eduEditor->editor()->pointSize());
  eduEditor->setPanelFont(editorFont);

  eduTextModel->rebuild(st_showUserTextSegment, st_showKernelTextSegment);
  ui->TextSegView->setColumnsShown(st_showTextDisassembly, st_showTextComments);

  // The text segment changes when a file is loaded (and on Reinitialize),
  // which is when labels come and go.  Every load path draws the data
  // segments right after this.
  eduCollectLabels();
}

// What File > Load File and the command line call in place of the core's
// read_assembly_file(): the same, plus the file's labels (edu/edu_loader.h).
bool SpimView::eduLoadAssemblyFile(const QString& file) {
  QString listing;
  const bool opened = eduReadAssemblyFile(file.toLocal8Bit().data(), &listing);
  eduLoadedSymbols += listing;
  eduProgramLoaded = eduProgramLoaded || opened;
  return opened;
}

void SpimView::eduForgetLoadedLabels() {
  eduLoadedSymbols.clear();
  eduProgramLoaded = false;
  // Reinitialize: whatever the editor shows is no longer in the simulator.
  // (An Assemble comes through here too and sets this again when it is done.)
  eduSyncedPath.clear();
  eduSyncedDigest.clear();
  eduExtraProgram = false;
  if (eduEditor != 0) {
    eduUpdateStaleBanner();
  }
}


// Labels by address for the Data panel (ARCHITECTURE 15.2).  Three sources:
//   - print_symbols() as of the end of each file we loaded, local labels
//     included (eduLoadAssemblyFile());
//   - print_symbols() now: the global labels, the exception handler's too
//     (the core loads that file itself, so its locals are not in the first);
//   - the labels instructions refer to, which covers the handler's locals.
void SpimView::eduCollectLabels() {
  edu::LabelMap labels;

  QString listing;
  eduOutputCapture = &listing;
  print_symbols();
  eduOutputCapture = NULL;
  const QList<edu::Symbol> symbols =
      edu::parseSymbolListing(eduLoadedSymbols + listing);
  for (int i = 0; i < symbols.size(); i += 1) {
    labels.add(symbols.at(i).name, symbols.at(i).address);
  }

  const mem_addr bounds[2][2] = {{TEXT_BOT, text_top}, {K_TEXT_BOT, k_text_top}};
  for (int s = 0; s < 2; s += 1) {
    for (mem_addr a = bounds[s][0]; a < bounds[s][1]; a += 4) {
      instruction* inst = read_mem_inst(a);
      if (inst != NULL && EXPR(inst) != NULL && EXPR(inst)->symbol != NULL &&
          SYMBOL_IS_DEFINED(EXPR(inst)->symbol)) {
        labels.add(QString::fromLatin1(EXPR(inst)->symbol->name),
                   EXPR(inst)->symbol->addr);
      }
    }
  }
  eduDataModel->setLabels(labels);
}

// initialize_run_stack() (CPU/spim-utils.cpp) leaves $a2 = &envp[0]: the
// lowest address of what it copied from the process environment.  Above it
// are the envp pointers and all the strings (environment and command line).
void SpimView::eduNoteStackInitialized() {
  eduDataModel->setEnvironmentStart(quint32(R[REG_A2]));
}

// Words / Half words / Bytes is kept in the settings (state.cpp).
int SpimView::eduDataUnit() { return int(eduDataModel->unit()); }

void SpimView::eduSetDataUnit(int bytes) {
  ui->DataSegPanel->view()->setUnit(
      bytes == 1 ? edu::ByteUnit : (bytes == 2 ? edu::HalfUnit : edu::WordUnit));
}

bool SpimView::eduDataPointersMoved() {
  return eduDataModel->markedRegistersDiffer();
}

// DisplayDataSegments(): settings that upstream baked into its HTML are
// pushed into the model and view instead.  The Data window has always used
// the Text window's font and colours.
void SpimView::eduRefreshDataPanel() {
  EduDataView* view = ui->DataSegPanel->view();
  QPalette palette = view->palette();
  palette.setColor(QPalette::Base, st_textWinBackgroundColor);
  palette.setColor(QPalette::Text, st_textWinFontColor);
  view->setPalette(palette);
  view->applyPanelFont(st_textWinFont);

  eduDataModel->setColors(st_textWinFontColor, st_textWinBackgroundColor);
  eduDataModel->setSegmentsShown(st_showUserDataSegment, st_showUserStackSegment,
                                 st_showKernelDataSegment);
  eduDataModel->setBase(st_dataSegmentDisplayBase);
  eduDataModel->refresh();
  view->fitColumns();
  eduUpdateInspector();
}

// highlightInstruction(): two rows repaint, and the view scrolls only if the
// PC's row is not visible.
void SpimView::eduHighlightInstruction(mem_addr pc) {
  eduTextModel->setCurrentPc(pc);
  ui->TextSegView->showAddress(pc);
}
