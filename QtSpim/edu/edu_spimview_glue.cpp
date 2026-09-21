/* QtSpim-Edu: the SpimView members that connect the new panels to the
   upstream main window.  Kept out of the upstream .cpp files so that those
   only carry one-line hooks (each marked "// EDU:"). */

#include <QPlainTextEdit>
#include <QTextEdit>

#include "edu/core/edu_decoder.h"
#include "edu/core/edu_instruction_text.h"
#include "edu/edu_inspector.h"
#include "edu/edu_register_model.h"
#include "edu/edu_register_view.h"
#include "edu/edu_text_model.h"
#include "edu/edu_text_view.h"
#include "spimview.h"
#include "ui_spimview.h"

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

  // The same for the Text window, except that it is only filled when a log
  // is saved or printed (SpimView::eduFillTextLog() in textwin.cpp).
  eduTextLog = new QTextEdit(this);
  eduTextLog->setUndoRedoEnabled(false);
  eduTextLog->setReadOnly(true);
  eduTextLog->hide();
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

void SpimView::eduUpdateInspector() {
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
}

// highlightInstruction(): two rows repaint, and the view scrolls only if the
// PC's row is not visible.
void SpimView::eduHighlightInstruction(mem_addr pc) {
  eduTextModel->setCurrentPc(pc);
  ui->TextSegView->showAddress(pc);
}
