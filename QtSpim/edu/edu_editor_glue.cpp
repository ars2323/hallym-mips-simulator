/* QtSpim-Edu: the SpimView members that connect the editor dock to the main
   window (PLAN R4).  Kept out of the upstream .cpp files so that those only
   carry one-line hooks (each marked "// EDU:"). */

#include <QAction>
#include <QCryptographicHash>
#include <QFileInfo>
#include <QDir>
#include <QLabel>
#include <QDockWidget>
#include <QMenu>
#include <QMenuBar>
#include <QPushButton>
#include <QToolButton>
#include <QStatusBar>
#include <QToolBar>
#include <QVBoxLayout>

#include "edu/core/edu_asm_errors.h"
#include "edu/theme/tokens.h"
#include "edu/edu_code_editor.h"
#include "edu/edu_bottom_panel.h"
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

  // Saving IS assembling (PLAN decision "저장 = 어셈블"): one action, reached
  // by Ctrl+S, by F3 (free upstream, and what MARS users press) and by the
  // tool bar button.  There is no save that leaves the simulator behind.
  QAction* assemble = new QAction("&Save and Assemble", this);
  assemble->setObjectName("action_Edu_Assemble");
  assemble->setShortcuts(QList<QKeySequence>()
                         << QKeySequence(QKeySequence::Save) << QKeySequence("F3"));
  assemble->setIconText("Assemble");  // the tool bar button's caption
  assemble->setToolTip("Save the editor's file, reinitialize the simulator "
                       "and load the file (Ctrl+S, F3)");
  connect(assemble, SIGNAL(triggered(bool)), this, SLOT(eduAssemble()));
  menu->addAction(assemble);

  // The editor's own text size.  The shortcuts belong to the editor, not to
  // the window: Ctrl+- and Ctrl+= mean nothing in the other panels, and a
  // student who has clicked into the Text panel should not be zooming the
  // editor by accident.  The menu entries are how they find out this exists.
  menu->addSeparator();
  struct {
    const char* name;
    const char* text;
    const char* slot;
    QKeySequence keys;
    QKeySequence alternate;
  } const zooms[] = {
      {"action_Edu_ZoomIn", "Zoom &In", SLOT(zoomInOnePoint()),
       QKeySequence("Ctrl++"), QKeySequence("Ctrl+=")},
      {"action_Edu_ZoomOut", "Zoom &Out", SLOT(zoomOutOnePoint()),
       QKeySequence("Ctrl+-"), QKeySequence()},
      {"action_Edu_ZoomReset", "&Reset Zoom", SLOT(resetPointSize()),
       QKeySequence("Ctrl+0"), QKeySequence()},
  };
  for (unsigned i = 0; i < sizeof(zooms) / sizeof(zooms[0]); i += 1) {
    QAction* action = new QAction(zooms[i].text, this);
    action->setObjectName(zooms[i].name);
    QList<QKeySequence> keys;
    keys << zooms[i].keys;
    if (!zooms[i].alternate.isEmpty()) {
      keys << zooms[i].alternate;
    }
    action->setShortcuts(keys);
    action->setShortcutContext(Qt::WidgetWithChildrenShortcut);
    connect(action, SIGNAL(triggered(bool)), eduEditor->editor(),
            zooms[i].slot);
    eduEditor->addAction(action);  // the shortcut only fires inside the editor
    menu->addAction(action);
  }
  connect(eduEditor, SIGNAL(fontSizeChanged(int)), this,
          SLOT(eduEditorFontSizeChanged(int)));

  QAction* saveAs = new QAction("Save &As and Assemble...", this);
  saveAs->setObjectName("action_Edu_SaveAs");
  saveAs->setShortcut(QKeySequence("Ctrl+Shift+S"));
  connect(saveAs, SIGNAL(triggered(bool)), this, SLOT(eduEditorSaveAs()));
  menu->addAction(saveAs);

  ui->menu_Simulator->insertAction(ui->menu_Simulator->actions().value(0), assemble);
  ui->menu_Simulator->insertSeparator(ui->menu_Simulator->actions().value(1));
  // The one primary button of the tool bar: icon and caption, filled blue
  // (theme/light.qss, QToolButton#EduAssembleButton).
  ui->toolBar->insertAction(ui->action_Sim_Run, assemble);
  QToolButton* assembleButton =
      qobject_cast<QToolButton*>(ui->toolBar->widgetForAction(assemble));
  if (assembleButton != 0) {
    assembleButton->setObjectName("EduAssembleButton");
    assembleButton->setToolButtonStyle(Qt::ToolButtonTextBesideIcon);
  }

  // Window > Editor, with the other panels.
  QAction* toggle = eduEditor->toggleViewAction();
  toggle->setText("Editor");
  ui->menu_Window->insertAction(ui->action_Win_IntRegisters, toggle);

  // Window > Console & Messages: the whole bottom panel can be put away,
  // and the panels above take its room.  Ctrl+L: free upstream (F5,
  // Shift-F5, F10) and in the editor (Ctrl+N/O/S, Ctrl+Shift+S, F3).  It
  // comes back by itself when the simulator reports an error
  // (SpimView::Error()) or when a program prints.
  eduLogAction = new QAction("&Console && Messages", this);
  eduLogAction->setObjectName("action_Edu_ToggleLog");
  eduLogAction->setCheckable(true);
  eduLogAction->setChecked(true);
  eduLogAction->setShortcut(QKeySequence("Ctrl+L"));
  connect(eduLogAction, SIGNAL(toggled(bool)), this, SLOT(eduToggleLog(bool)));
  ui->menu_Window->insertAction(ui->action_Win_Console, eduLogAction);

  // Window > Layout: which side the editor is on.  Everything else about
  // the arrangement is the same in both, and any other arrangement can
  // still be made by dragging a tab or a title bar (AllowNestedDocks in
  // spimview.ui).
  QMenu* layouts = new QMenu("&Layout", this);
  layouts->setObjectName("menu_Edu_Layout");
  struct {
    const char* name;
    const char* text;
    const char* slot;
  } const presets[] = {
      {"action_Edu_LayoutPrimary", "&Editor | Text / Data",
       SLOT(eduLayoutPrimary())},
      {"action_Edu_LayoutMirrored", "Text / Data | Edi&tor",
       SLOT(eduLayoutMirrored())},
  };
  for (unsigned i = 0; i < sizeof(presets) / sizeof(presets[0]); i += 1) {
    QAction* action = new QAction(presets[i].text, this);
    action->setObjectName(presets[i].name);
    connect(action, SIGNAL(triggered(bool)), this, presets[i].slot);
    layouts->addAction(action);
  }
  ui->menu_Window->insertMenu(ui->action_Win_Tile, layouts);
  // The three panels can be moved and floated; closing is what the Window
  // menu entries do.
  QDockWidget* const movable[] = {
      eduEditor,           ui->TextSegDockWidget, ui->DataSegDockWidget,
      (QDockWidget*)eduBottom, (QDockWidget*)eduInspector};
  for (unsigned i = 0; i < sizeof(movable) / sizeof(movable[0]); i += 1) {
    // Dropped somewhere new: share the room out evenly (eduEqualiseDocks).
    // A drag ends either in a new area (dockLocationChanged) or by the dock
    // being unplugged and put back (topLevelChanged); both mean the user has
    // just rearranged the panels.
    connect(movable[i], SIGNAL(dockLocationChanged(Qt::DockWidgetArea)), this,
            SLOT(eduDockMoved()));
    connect(movable[i], SIGNAL(topLevelChanged(bool)), this,
            SLOT(eduDockMoved()));
    movable[i]->setFeatures(QDockWidget::DockWidgetClosable |
                            QDockWidget::DockWidgetMovable |
                            QDockWidget::DockWidgetFloatable);
  }

  eduAssembleBadge = new QLabel(this);
  eduAssembleBadge->setObjectName("EduAssembleBadge");  // styled by theme/light.qss
  eduAssembleBadge->setToolTip(QString::fromUtf8(
      "The last assemble failed; the errors are in the editor's list\n"
      "마지막 어셈블이 실패했습니다. 에러는 에디터 아래 목록에 있습니다"));
  statusBar()->addPermanentWidget(eduAssembleBadge);
  eduAssembleBadge->hide();

  // "The editor's source is not what the simulator holds": a strip across
  // the top of the Text and Data panels, which is where one is looking when
  // it matters.  A click saves and assembles.
  QDockWidget* const docks[] = {ui->TextSegDockWidget, ui->DataSegDockWidget};
  for (unsigned i = 0; i < sizeof(docks) / sizeof(docks[0]); i += 1) {
    QWidget* panel = docks[i]->widget();
    QWidget* box = new QWidget(docks[i]);
    QVBoxLayout* layout = new QVBoxLayout(box);
    layout->setContentsMargins(0, edu::theme::kSpace1, 0, 0);  // under the title
    layout->setSpacing(0);
    QPushButton* banner = new QPushButton(
        QString("Source changed ") + QChar(0x2014) +
            QString(" save (Ctrl+S) to assemble"),
        box);
    banner->setObjectName("EduStaleBanner");  // styled by theme/light.qss
    banner->setToolTip(QString::fromUtf8(
        "What you are looking at is older than the editor's text; click to "
        "save and assemble\n지금 보는 내용이 에디터의 코드보다 오래되었습니다. "
        "누르면 저장하고 어셈블합니다"));
    banner->setFlat(true);
    banner->setCursor(Qt::PointingHandCursor);
    banner->setFocusPolicy(Qt::NoFocus);
    banner->hide();
    connect(banner, SIGNAL(clicked()), this, SLOT(eduAssemble()));
    layout->addWidget(banner);
    layout->addWidget(panel, 1);
    docks[i]->setWidget(box);
    eduStaleBanners << banner;
  }

  // The file the editor had open last time, if it is still there.  It is
  // NOT assembled: the simulator starts as upstream's does, and the strip
  // above says what to press.
  const QString last = settings.value("Editor/LastFile").toString();
  if (!last.isEmpty() && QFileInfo(last).isFile() && QFileInfo(last).isReadable()) {
    eduEditor->openFile(last, false);
  }
  eduUpdateStaleBanner();
}

// The strip says that what the Text and Data panels show is not this file.
// There are three ways that happens and the strip names the one that did,
// because "Source changed" after Reinitialize is simply untrue -- nothing
// was changed, the program was cleared (docs/ARCHITECTURE.md 12, 79).
//
// The comparison is against the editor's text as it was at the last
// assemble, not the modified flag: a file saved by another program, or
// undone back to what it was, is judged on what it says now.  A failed
// assemble counts as in step -- its outcome is in the error list, and the
// strip would only repeat "press Ctrl+S".
QByteArray SpimView::eduEditorDigest() const {
  return QCryptographicHash::hash(eduEditor->editor()->fileText().toUtf8(),
                                  QCryptographicHash::Md5);
}

void SpimView::eduUpdateStaleBanner() {
  const QString path = eduEditor->filePath();
  const QString canonical =
      path.isEmpty() ? QString() : QFileInfo(path).canonicalFilePath();
  const bool empty = path.isEmpty() && eduEditor->editor()->document()->isEmpty();

  QString message;
  QString explanation;
  if (!empty) {
    if (eduSyncedPath.isEmpty()) {
      // Nothing of this editor's is in the simulator.
      if (eduEverAssembled) {
        message = QString::fromUtf8(
            "Simulator was reinitialized \xe2\x80\x94 save (Ctrl+S) to "
            "assemble this file");
        explanation = QString::fromUtf8(
            "The program that was assembled has been cleared; the file itself "
            "is unchanged.\n시뮬레이터가 초기화되어 어셈블된 프로그램이 "
            "없습니다. 파일은 그대로입니다");
      } else {
        message = QString::fromUtf8(
            "Not assembled yet \xe2\x80\x94 save (Ctrl+S) to assemble this "
            "file");
        explanation = QString::fromUtf8(
            "The simulator has no program yet.\n아직 어셈블한 프로그램이 "
            "없습니다");
      }
    } else if (eduExtraProgram ||
               (!canonical.isEmpty() && canonical != eduSyncedPath)) {
      message = QString::fromUtf8(
          "Text shows a different program \xe2\x80\x94 save (Ctrl+S) to "
          "assemble this file");
      explanation = QString::fromUtf8(
          "What the simulator holds came from another file.\n"
          "시뮬레이터에 올라간 것은 다른 파일에서 온 것입니다");
    } else if (eduEditorDigest() != eduSyncedDigest) {
      message = QString::fromUtf8(
          "Source changed \xe2\x80\x94 save (Ctrl+S) to assemble");
      explanation = QString::fromUtf8(
          "The editor's text is newer than what was assembled.\n"
          "에디터의 내용이 어셈블된 것보다 새롭습니다");
    }
  }

  for (int i = 0; i < eduStaleBanners.size(); i += 1) {
    QAbstractButton* strip = eduStaleBanners.at(i);
    if (!message.isEmpty()) {
      strip->setText(message);
      strip->setToolTip(explanation + QString::fromUtf8(
                            "\nClick to save and assemble / 누르면 저장하고 "
                            "어셈블합니다"));
    }
    strip->setVisible(!message.isEmpty());
  }
}

// Editor > Open Recent: files the editor opened or saved, newest first,
// kept in the settings under Editor/RecentFiles.
// The editor's text size is the student's, not a window setting: it is
// remembered and put back at the next start.
void SpimView::eduEditorFontSizeChanged(int points) {
  settings.setValue("Editor/FontPointSize", points);
}

void SpimView::eduRestoreEditorZoom() {
  const int points = settings.value("Editor/FontPointSize", 0).toInt();
  if (points > 0) {
    eduEditor->editor()->setPointSize(points);
  }
}

void SpimView::eduEditorFileChanged() {
  eduUpdateStaleBanner();
  eduUpdateWindowTitle();  // EDU: the title bar names the open file
  const QString path = eduEditor->filePath();
  if (path != settings.value("Editor/LastFile").toString()) {
    settings.setValue("Editor/LastFile", path);  // reopened at the next start
  }
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

// main.cpp, once the command line's files are loaded.  A restored window
// layout brings back whichever tab was in front when the program was closed
// (usually Text, after an assemble); with no program loaded there is nothing
// in Text or Data to look at, so the editor goes in front -- unless the user
// has closed it.
void SpimView::eduEditorAtStartup() {
  if (!eduProgramLoaded && !eduEditor->isHidden()) {
    eduEditor->raise();
  }
}

//
// Message log
//

void SpimView::eduSetLogVisible(bool on) {
  if (eduBottom != 0) {
    eduBottom->setVisible(on);
  }
  if (eduLogAction->isChecked() != on) {
    eduLogAction->setChecked(on);  // triggers eduToggleLog(), harmless
  }
}

void SpimView::eduToggleLog(bool on) { eduSetLogVisible(on); }

// Something was logged that the student should see: the panel comes back
// if it was put away, and the Messages tab comes to the front.
void SpimView::eduShowLog() {
  if (eduLogAction == 0 || eduBottom == 0) {
    return;
  }
  if (eduBottom->isHidden()) {
    eduSetLogVisible(true);
  }
  eduBottom->showMessages();
}

// A program is printing, or waiting for something to be typed.
void SpimView::eduRevealConsole(bool withFocus) {
  if (eduBottom == 0) {
    return;
  }
  if (eduBottom->isHidden()) {
    eduSetLogVisible(true);
  }
  eduBottom->showConsole(withFocus);
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

// Save As is "save under a new name, then assemble that".
void SpimView::eduEditorSaveAs() {
  if (eduEditor->saveAs()) {
    eduAssemble();
  }
}

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
    if (ui->TextSegView->visibleRegion().isEmpty()) {
      ui->TextSegDockWidget->raise();  // a program was loaded: look at it
    }
    eduSyncedPath = QFileInfo(file).canonicalFilePath();
    eduSyncedDigest = eduEditorDigest();
    eduEverAssembled = true;
    eduUpdateStaleBanner();
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
  eduSyncedPath = QFileInfo(eduEditor->filePath()).canonicalFilePath();
  eduSyncedDigest = eduEditorDigest();
  eduEverAssembled = true;
  eduExtraProgram = false;  // this assemble started from a clean simulator
  eduUpdateStaleBanner();

  QList<edu::AssemblerMessage> messages;
  for (int i = 0; i < eduCollectedErrors.size(); i += 1) {
    messages << edu::parseAssemblerMessage(eduCollectedErrors.at(i));
  }
  eduEditor->showErrors(messages);

  if (messages.isEmpty()) {
    eduAssembleBadge->hide();
    statusBar()->showMessage("Saved and assembled", 5000);
    // On to the Text panel -- unless it is on screen already (side by side
    // with the editor), where a "switch" would only take the editor away.
    ui->TextSegDockWidget->show();
    if (ui->TextSegView->visibleRegion().isEmpty()) {
      ui->TextSegDockWidget->raise();
    }
  } else {
    // The file is saved (the student's work is safe), but what ran before is
    // gone: Assemble reinitializes first, exactly as upstream's Reinitialize
    // and Load File does.  Say so.
    eduAssembleBadge->setText(
        QString("Assemble failed ") + QChar(0x2014) +
        (messages.size() == 1 ? QString(" 1 error")
                              : QString(" %1 errors").arg(messages.size())) +
        QString(". Simulator was reset."));
    eduAssembleBadge->show();
    statusBar()->clearMessage();  // an earlier "Saved and assembled"
    if (eduEditor->editor()->visibleRegion().isEmpty()) {
      eduEditor->raise();
    }
  }
}
