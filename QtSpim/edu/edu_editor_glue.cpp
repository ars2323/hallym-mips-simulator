/* QtSpim-Edu: the SpimView members that connect the editor dock to the main
   window (PLAN R4).  Kept out of the upstream .cpp files so that those only
   carry one-line hooks (each marked "// EDU:"). */

#include <QAction>
#include <QFileInfo>
#include <QDir>
#include <QLabel>
#include <QMenu>
#include <QMenuBar>
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

  // An Editor menu between File and Simulator; upstream's File menu stays as
  // it is.  Upstream has three shortcuts in all (F5 Run, Shift-F5 Stop, F10
  // Single Step), so the usual editor keys are free.
  QMenu* menu = new QMenu("&Editor", this);
  menu->setObjectName("menu_Edu_Editor");
  menuBar()->insertMenu(ui->menu_Simulator->menuAction(), menu);
  struct {
    const char* name;
    const char* text;
    QKeySequence keys;
    const char* slot;
  } const entries[] = {
      {"action_Edu_New", "&New", QKeySequence(QKeySequence::New), SLOT(eduEditorNew())},
      {"action_Edu_Open", "&Open...", QKeySequence(QKeySequence::Open), SLOT(eduEditorOpen())},
      {"action_Edu_Save", "&Save", QKeySequence(QKeySequence::Save), SLOT(eduEditorSave())},
      {"action_Edu_SaveAs", "Save &As...", QKeySequence("Ctrl+Shift+S"), SLOT(eduEditorSaveAs())},
  };
  for (unsigned i = 0; i < sizeof(entries) / sizeof(entries[0]); i += 1) {
    QAction* action = new QAction(entries[i].text, this);
    action->setObjectName(entries[i].name);
    action->setShortcut(entries[i].keys);
    connect(action, SIGNAL(triggered(bool)), this, entries[i].slot);
    menu->addAction(action);
    if (i == 1) {
      // The editor's own recent files.  Not upstream's File > Recent Files:
      // that list's first entry is argv[0] of the next run (initStack()),
      // so merely opening a file must not change it.
      eduEditorRecentMenu = menu->addMenu("Open &Recent");
      eduEditorRecentMenu->setObjectName("menu_Edu_EditorRecent");
    }
  }
  eduRebuildEditorRecentMenu();
  connect(eduEditor, SIGNAL(fileChanged()), this, SLOT(eduEditorFileChanged()));

  // Simulator > Assemble, and a tool bar button in front of Run.  F3: free
  // upstream, and what MARS users already press.
  QAction* assemble = new QAction("&Assemble", this);
  assemble->setObjectName("action_Edu_Assemble");
  assemble->setShortcut(QKeySequence("F3"));
  assemble->setToolTip("Save the editor's file, reinitialize the simulator "
                       "and load the file (F3)");
  connect(assemble, SIGNAL(triggered(bool)), this, SLOT(eduAssemble()));
  menu->addSeparator();
  menu->addAction(assemble);
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

// Editor > Open Recent: files the editor opened or saved, newest first,
// kept in the settings under Editor/RecentFiles.
void SpimView::eduEditorFileChanged() {
  const QString path = eduEditor->filePath();
  if (path.isEmpty()) {
    return;
  }
  QStringList recent = settings.value("Editor/RecentFiles").toStringList();
  if (!recent.isEmpty() && recent.first() == path) {
    return;
  }
  recent.removeAll(path);
  recent.prepend(path);
  while (recent.size() > 8) {
    recent.removeLast();
  }
  settings.setValue("Editor/RecentFiles", recent);
  eduRebuildEditorRecentMenu();
}

void SpimView::eduRebuildEditorRecentMenu() {
  eduEditorRecentMenu->clear();
  const QStringList recent = settings.value("Editor/RecentFiles").toStringList();
  for (int i = 0; i < recent.size(); i += 1) {
    QAction* action = eduEditorRecentMenu->addAction(
        QDir::toNativeSeparators(recent.at(i)));
    action->setData(recent.at(i));
    connect(action, SIGNAL(triggered(bool)), this, SLOT(eduEditorOpenRecent()));
  }
  eduEditorRecentMenu->setEnabled(!recent.isEmpty());
}

void SpimView::eduEditorOpenRecent() {
  QAction* action = qobject_cast<QAction*>(sender());
  if (action != 0 && eduEditor->openFile(action->data().toString())) {
    eduEditor->show();
    eduEditor->raise();
    eduEditor->editor()->setFocus();
  }
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
  // Saved without asking (a new file has to be given a name first).
  if ((eduEditor->filePath().isEmpty() || eduEditor->isModified()) &&
      !eduEditor->save()) {
    return;
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
    statusBar()->showMessage("Saved and assembled", 5000);
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
