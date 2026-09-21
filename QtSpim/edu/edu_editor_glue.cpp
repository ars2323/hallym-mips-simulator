/* QtSpim-Edu: the SpimView members that connect the editor dock to the main
   window (PLAN R4).  Kept out of the upstream .cpp files so that those only
   carry one-line hooks (each marked "// EDU:"). */

#include <QAction>
#include <QFileInfo>
#include <QLabel>
#include <QMessageBox>
#include <QPushButton>
#include <QStatusBar>
#include <QToolBar>

#include "edu/core/edu_asm_errors.h"
#include "edu/edu_code_editor.h"
#include "edu/edu_editor_dock.h"
#include "spimview.h"
#include "ui_spimview.h"

// Called from eduSetupPanels(), i.e. before win_Tile() and readSettings().
void SpimView::eduSetupEditor() {
  eduCollectingErrors = false;

  eduEditor = new EduEditorDock(this);
  addDockWidget(Qt::TopDockWidgetArea, eduEditor);

  // File menu, above upstream's entries.  Upstream has three shortcuts in
  // all (F5 Run, Shift-F5 Stop, F10 Single Step), so the usual editor keys
  // are free.
  QAction* first = ui->menu_File->actions().isEmpty()
                       ? 0
                       : ui->menu_File->actions().first();
  struct {
    const char* name;
    const char* text;
    QKeySequence keys;
    const char* slot;
  } const entries[] = {
      {"action_Edu_New", "&New", QKeySequence(QKeySequence::New), SLOT(eduEditorNew())},
      {"action_Edu_Open", "&Open in Editor...", QKeySequence(QKeySequence::Open), SLOT(eduEditorOpen())},
      {"action_Edu_Save", "&Save", QKeySequence(QKeySequence::Save), SLOT(eduEditorSave())},
      {"action_Edu_SaveAs", "Save &As...", QKeySequence("Ctrl+Shift+S"), SLOT(eduEditorSaveAs())},
  };
  for (unsigned i = 0; i < sizeof(entries) / sizeof(entries[0]); i += 1) {
    QAction* action = new QAction(entries[i].text, this);
    action->setObjectName(entries[i].name);
    action->setShortcut(entries[i].keys);
    connect(action, SIGNAL(triggered(bool)), this, entries[i].slot);
    ui->menu_File->insertAction(first, action);
  }
  ui->menu_File->insertSeparator(first);

  // Simulator > Assemble, and a tool bar button in front of Run.  F3: free
  // upstream, and what MARS users already press.
  QAction* assemble = new QAction("&Assemble", this);
  assemble->setObjectName("action_Edu_Assemble");
  assemble->setShortcut(QKeySequence("F3"));
  assemble->setToolTip("Save the editor's file, reinitialize the simulator "
                       "and load the file (F3)");
  connect(assemble, SIGNAL(triggered(bool)), this, SLOT(eduAssemble()));
  ui->menu_Simulator->insertAction(ui->menu_Simulator->actions().value(0), assemble);
  ui->menu_Simulator->insertSeparator(ui->menu_Simulator->actions().value(1));
  ui->toolBar->insertAction(ui->action_Sim_Run, assemble);
  ui->toolBar->insertSeparator(ui->action_Sim_Run);

  // Window > Editor, with the other panels.
  QAction* toggle = eduEditor->toggleViewAction();
  toggle->setText("Editor");
  ui->menu_Window->insertAction(ui->action_Win_IntRegisters, toggle);

  eduAssembleBadge = new QLabel(this);
  eduAssembleBadge->setObjectName("EduAssembleBadge");
  eduAssembleBadge->setStyleSheet(
      "QLabel { background: #ffcdd2; color: black; border-radius: 3px;"
      " padding: 1px 8px; font-weight: bold; }");
  statusBar()->addPermanentWidget(eduAssembleBadge);
  eduAssembleBadge->hide();
}

// win_Tile(): the editor is a third tab beside Data and Text, in front until
// a program is loaded (there is nothing in the other two to look at).
void SpimView::eduTileEditor() {
  eduEditor->setFloating(false);
  eduEditor->show();
  tabifyDockWidget(ui->TextSegDockWidget, eduEditor);
  eduEditor->raise();
}

bool SpimView::eduEditorMaybeSave() { return eduEditor->maybeSave(); }

void SpimView::eduEditorNew() {
  if (eduEditor->newFile()) {
    eduEditor->show();
    eduEditor->raise();
    eduEditor->editor()->setFocus();
  }
}

void SpimView::eduEditorOpen() {
  if (eduEditor->open()) {
    eduEditor->show();
    eduEditor->raise();
    eduEditor->editor()->setFocus();
  }
}

void SpimView::eduEditorSave() { eduEditor->save(); }

void SpimView::eduEditorSaveAs() { eduEditor->saveAs(); }

// A file the simulator loaded by upstream's own routes (File > Load File,
// Reinitialize and Load File, the recent files, the command line) is also
// what the editor shows, unless the editor holds unsaved work on another
// file and the user wants to keep it.
void SpimView::eduEditorFileLoaded(const QString& file) {
  eduAssembleBadge->hide();
  const bool same = QFileInfo(file).canonicalFilePath() ==
                        QFileInfo(eduEditor->filePath()).canonicalFilePath() &&
                    !eduEditor->filePath().isEmpty();
  if (!eduCollectingErrors) {  // not our own Assemble: that file is open already
    if (same && eduEditor->isModified()) {
      // The simulator has the saved version; the editor's newer text stays.
    } else {
      eduEditor->openFile(file, !same);
    }
    ui->TextSegDockWidget->raise();  // a program was loaded: look at it
  }
}

// SpimView::Error() asks this first.  During an Assemble the message is kept
// for the editor's list and no modal box is shown.
bool SpimView::eduCollectError(const QString& message) {
  if (!eduCollectingErrors) {
    return false;
  }
  eduCollectedErrors << message;
  return true;
}

// Simulator > Assemble: save, then exactly File > Reinitialize and Load File
// (file_ReloadFile(), with the file named instead of asked for).  No errors:
// on to the Text tab.  Errors: stay here, list them, mark their lines.
void SpimView::eduAssemble() {
  eduEditor->show();
  eduEditor->raise();
  // The core reads files, so there has to be one, and it has to be current.
  if (eduEditor->filePath().isEmpty()) {
    if (!eduEditor->saveAs()) {
      return;
    }
  } else if (eduEditor->isModified()) {
    QMessageBox box(this);
    box.setObjectName("EduAssembleSaveQuestion");
    box.setIcon(QMessageBox::Question);
    box.setWindowTitle("Assemble");
    box.setText(QString("%1 has unsaved changes.")
                    .arg(QFileInfo(eduEditor->filePath()).fileName()));
    box.setInformativeText("The simulator assembles the file on disk.");
    QPushButton* save = box.addButton("Save and assemble", QMessageBox::AcceptRole);
    box.addButton(QMessageBox::Cancel);
    box.setDefaultButton(save);
    box.exec();
    if (box.clickedButton() != save || !eduEditor->save()) {
      return;
    }
  }

  eduCollectedErrors.clear();
  eduCollectingErrors = true;
  eduAssembleFile = eduEditor->filePath();
  file_ReloadFile();
  eduCollectingErrors = false;
  eduAssembleFile.clear();  // (a path the core cannot take: never consumed)

  QList<edu::AssemblerMessage> messages;
  for (int i = 0; i < eduCollectedErrors.size(); i += 1) {
    messages << edu::parseAssemblerMessage(eduCollectedErrors.at(i));
  }
  eduEditor->showErrors(messages);

  if (messages.isEmpty()) {
    eduAssembleBadge->hide();
    ui->TextSegDockWidget->show();
    ui->TextSegDockWidget->raise();
  } else {
    eduAssembleBadge->setText(messages.size() == 1
                                  ? QString("1 error")
                                  : QString("%1 errors").arg(messages.size()));
    eduAssembleBadge->show();
    eduEditor->raise();
  }
}
