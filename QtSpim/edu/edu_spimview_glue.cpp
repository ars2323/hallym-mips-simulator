/* QtSpim-Edu: the SpimView members that connect the new panels to the
   upstream main window.  Kept out of the upstream .cpp files so that those
   only carry one-line hooks (each marked "// EDU:"). */

#include <QPlainTextEdit>
#include <QTextEdit>

#include "edu/core/edu_decoder.h"
#include "edu/core/edu_instruction_text.h"
#include "edu/core/edu_memory_text.h"
#include "edu/core/edu_symbols.h"
#include "edu/edu_data_model.h"
#include "edu/edu_data_view.h"
#include "edu/edu_inspector.h"
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
  eduRegisterModel = new EduRegisterModel(this);
  ui->IntRegView->setRegisterModel(eduRegisterModel);

  // Upstream's .ui restricts the register docks to the top area.
  ui->IntRegDockWidget->setAllowedAreas(Qt::LeftDockWidgetArea |
                                        Qt::TopDockWidgetArea);
  ui->FPRegDockWidget->setAllowedAreas(Qt::LeftDockWidgetArea |
                                       Qt::TopDockWidgetArea);

  eduInspector = new EduInspector(this);
  addDockWidget(Qt::LeftDockWidgetArea, eduInspector);
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

// DisplayTextSegments(): settings that upstream baked into its HTML are
// pushed into the model and view instead.
void SpimView::eduRefreshTextPanel() {
  QPalette palette = ui->TextSegView->palette();
  palette.setColor(QPalette::Base, st_textWinBackgroundColor);
  palette.setColor(QPalette::Text, st_textWinFontColor);
  ui->TextSegView->setPalette(palette);
  ui->TextSegView->applyPanelFont(st_textWinFont);
  eduTextModel->setColors(st_textWinFontColor, st_textWinBackgroundColor);

  eduTextModel->rebuild(st_showUserTextSegment, st_showKernelTextSegment);
  ui->TextSegView->setColumnsShown(st_showTextDisassembly, st_showTextComments);

  // The text segment changes when a file is loaded (and on Reinitialize),
  // which is when labels come and go.  Every load path draws the data
  // segments right after this.
  eduCollectLabels();
}

// Labels by address for the Data panel (ARCHITECTURE 15.2).  Two sources:
// what print_symbols() lists (only global labels survive the end of a file)
// and the labels instructions refer to, which is how a local "msg" is found.
void SpimView::eduCollectLabels() {
  edu::LabelMap labels;

  QString listing;
  eduOutputCapture = &listing;
  print_symbols();
  eduOutputCapture = NULL;
  const QList<edu::Symbol> symbols = edu::parseSymbolListing(listing);
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
