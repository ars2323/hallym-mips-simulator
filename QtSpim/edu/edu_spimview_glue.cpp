/* QtSpim-Edu: the SpimView members that connect the new panels to the
   upstream main window.  Kept out of the upstream .cpp files so that those
   only carry one-line hooks (each marked "// EDU:"). */

#include <QPlainTextEdit>

#include "edu/edu_inspector.h"
#include "edu/edu_register_model.h"
#include "edu/edu_register_view.h"
#include "spimview.h"
#include "ui_spimview.h"

// Called from the constructor right after setupUi(), i.e. before win_Tile()
// lays the docks out and before readSettings() restores a saved layout (the
// inspector has to exist for restoreState() to place it).
void SpimView::eduSetupPanels() {
  eduRegisterModel = new EduRegisterModel(this);
  ui->IntRegView->setRegisterModel(eduRegisterModel);

  eduInspector = new EduInspector(this);
  addDockWidget(Qt::TopDockWidgetArea, eduInspector);
  connect(ui->IntRegView, SIGNAL(registerSelectionChanged()), this,
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
}

// Places the inspector under the register docks.  splitDockWidget() would
// add it as a third tab if its target were already tabbed, so the register
// docks are split first and tabbed afterwards (see win_Tile()).
void SpimView::eduTileInspector() {
  eduInspector->setFloating(false);
  eduInspector->show();
  splitDockWidget(ui->FPRegDockWidget, eduInspector, Qt::Vertical);
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
  ui->IntRegView->setFont(st_regWinFont);
  eduRegisterModel->setPanelFont(st_regWinFont);
  eduInspector->setPanelFont(st_regWinFont);

  eduRegisterModel->refresh();
  eduUpdateInspector();
}

void SpimView::eduUpdateInspector() {
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
