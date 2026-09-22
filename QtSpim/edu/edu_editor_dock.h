/* QtSpim-Edu: the Editor dock (PLAN R4).

   One source file at a time: EduCodeEditor on top, the list of assembler
   errors under it (hidden while empty), a line with the file's encoding,
   line ends and the cursor position at the bottom.

   File handling is here (new / open / save / save as, "save changes?",
   reloading a file another program changed).  Bytes <-> text goes through
   edu::decodeTextFile() / encodeTextFile(), so a file saved unchanged is the
   same bytes.  Assembling is the main window's business (it owns the
   simulator); this class only shows what came of it.
*/

#ifndef EDU_EDITOR_DOCK_H
#define EDU_EDITOR_DOCK_H

#include <QDockWidget>
#include <QList>

#include "edu/core/edu_asm_errors.h"
#include "edu/core/edu_text_file.h"

class EduCodeEditor;
class QFileSystemWatcher;
class QLabel;
class QListWidget;
class QTimer;
class QListWidgetItem;

class EduEditorDock : public QDockWidget {
  Q_OBJECT

 public:
  explicit EduEditorDock(QWidget* parent = 0);

  EduCodeEditor* editor() const { return editor_; }
  QString filePath() const { return path_; }  // empty: not saved yet
  bool isModified() const;
  // No file, nothing typed: the tour may open its sample here without
  // asking anything or touching anyone's work.
  bool isUntouched() const;
  edu::TextFileFormat format() const { return format_; }

  // Each returns false if the user cancelled or the file could not be
  // read / written (a message box has then been shown).
  bool newFile();               // asks about unsaved changes first
  bool open();                  // file dialog, then openFile()
  bool openFile(const QString& path, bool askAboutChanges = true);
  bool save();                  // Save As if the file has no name yet
  bool saveAs();
  bool maybeSave();             // "Save changes?"  true = go on

  void setPanelFont(const QFont& font);

  // The assembler's verdict on the file being edited.  Messages for other
  // files (or without a location) are listed but mark no line.
  void showErrors(const QList<edu::AssemblerMessage>& messages);
  void clearErrors();
  int errorCount() const;

 signals:
  void fontSizeChanged(int points);  // the editor was zoomed; save it
  void fileChanged();  // path, modified flag or format changed: retitle

 private slots:
  void onPointSizeChanged(int points);  // show it in the status line for a moment
  void clearPointSizeNote();

  void onModificationChanged();
  void onCursorMoved();
  void onErrorActivated(QListWidgetItem* item);
  void onFileChangedOnDisk(const QString& path);
  void askAboutDiskChange();

 private:
  bool writeTo(const QString& path);
  void watch(const QString& path);
  void updateTitle();
  void updateInfo();

  EduCodeEditor* editor_;
  QListWidget* errorList_;
  QLabel* info_;
  QString pointSizeNote_;  // "14pt", shown briefly after a zoom
  QFileSystemWatcher* watcher_;
  QTimer* pointSizeTimer_;
  QString path_;
  edu::TextFileFormat format_;
  QByteArray bytesOnDisk_;  // what we last read or wrote
  bool askingAboutDisk_;
  QString lastDirectory_;
};

#endif  // EDU_EDITOR_DOCK_H
