/* QtSpim-Edu: the SpimView members that connect the new panels to the
   upstream main window.  Kept out of the upstream .cpp files so that those
   only carry one-line hooks (each marked "// EDU:"). */

#include <QLabel>
#include <QMessageBox>
#include <QPlainTextEdit>
#include <QPushButton>
#include <QStatusBar>
#include <QTextEdit>

#include "edu/core/edu_decoder.h"
#include "edu/core/edu_instruction_text.h"
#include "edu/core/edu_memory_text.h"
#include "edu/core/edu_symbols.h"
#include "edu/edu_data_model.h"
#include "edu/edu_data_view.h"
#include "edu/edu_editor_dock.h"
#include "edu/edu_inspector.h"
#include "edu/edu_loader.h"
#include "edu/edu_register_model.h"
#include "edu/edu_register_view.h"
#include "edu/edu_text_model.h"
#include "edu/edu_text_view.h"
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
  eduRegisterModel = new EduRegisterModel(this);
  ui->IntRegView->setRegisterModel(eduRegisterModel);

  // Upstream's .ui restricts the register docks to the top area.
  ui->IntRegDockWidget->setAllowedAreas(Qt::LeftDockWidgetArea |
                                        Qt::TopDockWidgetArea);
  ui->FPRegDockWidget->setAllowedAreas(Qt::LeftDockWidgetArea |
                                       Qt::TopDockWidgetArea);

  eduInspector = new EduInspector(this);
  addDockWidget(Qt::LeftDockWidgetArea, eduInspector);
  // Shown only while a setting that changes how files are assembled or run
  // differs from QtSpim's defaults.
  eduModeBadge = new QLabel(this);
  eduModeBadge->setObjectName("EduModeBadge");
  eduModeBadge->setStyleSheet(
      "QLabel { background: #ffe082; color: black; border-radius: 3px;"
      " padding: 1px 8px; font-weight: bold; }");
  statusBar()->addPermanentWidget(eduModeBadge);
  eduModeBadge->hide();

  eduProgramLoaded = false;
  eduInspectorSubject = EduNoSubject;
  connect(ui->IntRegView, SIGNAL(registerSelectionChanged()), this,
          SLOT(eduRegisterSelected()));
  connect(ui->IntRegView, SIGNAL(clicked(QModelIndex)), this,
          SLOT(eduRegisterSelected()));

  eduTextModel = new EduTextModel(this);
  ui->TextSegView->setTextModel(eduTextModel);
  connect(ui->TextSegView, SIGNAL(instructionSelectionChanged()), this,
          SLOT(eduInstructionSelected()));
  connect(ui->TextSegView, SIGNAL(instructionRowsReset()), this,
          SLOT(eduUpdateInspector()));

  // Window > Inspector, next to the other panels' entries.
  QAction* toggle = eduInspector->toggleViewAction();
  toggle->setText("Inspector");
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
}

// The register column lives in the LEFT dock area, not in upstream's top
// row.  Upstream already hands both left corners to the left area
// (setCorner() in the constructor), so a left dock runs the full height of
// the window beside the message log instead of stopping above it.  That
// height is what lets all 47 rows (8 groups + 39 registers) and the
// inspector fit a 1080-line screen: in the top row, 1080 lines minus menus,
// tabs, log and inspector leave room for about 33 rows at any readable row
// height.
//
// Order matters: splitDockWidget() would add the inspector as a third tab if
// its target were already tabbed, so this runs before win_Tile() tabs the
// two register docks.
void SpimView::eduTileInspector() {
  addDockWidget(Qt::LeftDockWidgetArea, ui->FPRegDockWidget);
  eduInspector->setFloating(false);
  eduInspector->show();
  splitDockWidget(ui->FPRegDockWidget, eduInspector, Qt::Vertical);
  addDockWidget(Qt::LeftDockWidgetArea, ui->IntRegDockWidget);
}

void SpimView::eduBeginRunCommand() { eduRegisterModel->beginRunCommand(); }

void SpimView::eduResetRegisterChanges() { eduRegisterModel->resetChanges(); }

// The tail of DisplayIntRegisters(): settings that upstream baked into its
// HTML are pushed into the model and view instead.
void SpimView::eduRefreshRegisterPanel() {
  eduRegisterModel->setBase(st_regDisplayBase);
  eduRegisterModel->setChangedColor(QColor(st_changedRegisterColor),
                                    st_colorChangedRegisters);

  QPalette palette = ui->IntRegView->palette();
  palette.setColor(QPalette::Base, st_regWinBackgroundColor);
  palette.setColor(QPalette::Text, st_regWinFontColor);
  ui->IntRegView->setPalette(palette);
  ui->IntRegView->applyPanelFont(st_regWinFont);
  eduRegisterModel->setPanelFont(st_regWinFont);
  eduInspector->setPanelFont(st_regWinFont);

  eduRegisterModel->refresh();
  eduUpdateInspector();
}

// The inspector shows whatever was picked last, a register or an
// instruction.  After that, refreshes (a step, a redraw) keep the subject.
void SpimView::eduRegisterSelected() {
  edu::RegisterRef reg;
  if (ui->IntRegView->currentRegister(&reg)) {
    eduInspectorSubject = EduRegisterSubject;
  }
  eduUpdateInspector();
}

void SpimView::eduInstructionSelected() {
  quint32 address = 0;
  if (ui->TextSegView->currentInstruction(&address)) {
    eduInspectorSubject = EduInstructionSubject;
  }
  eduUpdateInspector();
}

void SpimView::eduMemorySelected() {
  quint32 address = 0;
  if (ui->DataSegPanel->view()->currentWord(&address)) {
    eduInspectorSubject = EduMemorySubject;
  }
  eduUpdateInspector();
}

void SpimView::eduUpdateInspector() {
  if (eduInspectorSubject == EduMemorySubject) {
    quint32 address = 0;
    EduDataModel::WordInfo info;
    if (ui->DataSegPanel->view()->currentWord(&address) &&
        eduDataModel->wordInfo(address, &info)) {
      eduInspector->showMemory(edu::memoryDetailLines(
          info.address, info.value, info.bytes, info.labels, info.segment,
          info.pointers));
      return;
    }
    eduInspectorSubject = EduRegisterSubject;  // the word went away
  }

  if (eduInspectorSubject == EduInstructionSubject) {
    quint32 address = 0;
    const EduTextModel::Row* row =
        ui->TextSegView->currentInstruction(&address)
            ? eduTextModel->rowAt(eduTextModel->rowOfAddress(address))
            : 0;
    if (row != 0) {
      // Which branch encoding this machine uses (ARCHITECTURE 13.2).
      const edu::BranchConvention convention =
          delayed_branches ? edu::MipsDelaySlot : edu::SpimNoDelaySlot;
      const edu::DecodedInstruction decoded =
          edu::decode(row->word, row->address, convention);
      eduInspector->showInstruction(
          edu::instructionDetailLines(decoded, row->address, row->disassembly,
                                      row->label, convention),
          edu::instructionNoteLines(decoded, convention));
      return;
    }
    eduInspectorSubject = EduRegisterSubject;  // the instruction went away
  }

  edu::RegisterRef reg;
  if (!ui->IntRegView->currentRegister(&reg)) {
    eduInspector->showNothing();
    return;
  }
  const QModelIndex index = eduRegisterModel->indexOf(reg);
  eduInspector->showRegister(reg, EduRegisterModel::readRegister(reg),
                             eduRegisterModel->isChanged(reg),
                             index.parent().data().toString());
}

// These settings are saved and survive a restart.  With Bare Machine on, a
// pseudo instruction such as "li" is a syntax error, and a student who left
// it on looks for the mistake in the program.  The defaults are QtSpim's
// (state.cpp): not bare, pseudo instructions accepted, no delay slots.
void SpimView::eduUpdateModeBadge() {
  QStringList modes;
  if (bare_machine) modes << "Bare Machine";
  if (!accept_pseudo_insts) modes << "Pseudo instructions off";
  if (delayed_branches) modes << "Delayed branches";
  if (delayed_loads) modes << "Delayed loads";
  const QString dot = QString(" ") + QChar(0x00b7) + QString(" ");  // middle dot
  eduModeBadge->setText(modes.join(dot));
  eduModeBadge->setToolTip(
      modes.isEmpty()
          ? QString()
          : QString("Simulator > Settings differs from the defaults.%1")
                .arg(bare_machine || !accept_pseudo_insts
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
  ui->TextSegView->applyPanelFont(st_textWinFont);
  eduTextModel->setColors(st_textWinFontColor, st_textWinBackgroundColor);
  eduEditor->setPanelFont(st_textWinFont);  // the editor follows the Text window's font

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
  if (eduEditor != 0) {
    eduUpdateStaleBanner();
  }
}

// File > Load File (and the recent files) while a program is loaded.
// Upstream loads on top without a word, which is right for a program made of
// several files and wrong for the usual case, the same file again.  Returns
// false for Cancel; reinitializes first if that was the answer.
bool SpimView::eduConfirmLoadOnTop() {
  if (!eduProgramLoaded) {
    return true;
  }
  QMessageBox box(this);
  box.setObjectName("EduLoadConfirm");
  box.setIcon(QMessageBox::Question);
  box.setWindowTitle("Load File");
  box.setText("A program is already loaded.");
  box.setInformativeText(
      "Reinitialize and load: clear memory and registers first, then load the "
      "file (what you want when loading the same program again).\n\n"
      "Add to current program: keep what is loaded and assemble the file on "
      "top of it (for a program made of several files). A label both define, "
      "such as main, is reported as an error.");
  QPushButton* reinitialize =
      box.addButton("Reinitialize and load", QMessageBox::AcceptRole);
  QPushButton* add =
      box.addButton("Add to current program", QMessageBox::ActionRole);
  box.addButton(QMessageBox::Cancel);
  reinitialize->setObjectName("EduLoadReinitialize");
  add->setObjectName("EduLoadAdd");
  box.setDefaultButton(reinitialize);
  box.exec();

  if (box.clickedButton() == reinitialize) {
    sim_ReinitializeSimulator();
    return true;
  }
  return box.clickedButton() == add;
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
