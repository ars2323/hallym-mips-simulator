/* See edu_editor_dock.h. */

#include "edu/edu_editor_dock.h"

#include <QDir>
#include <QFile>
#include <QFileDialog>
#include <QFileInfo>
#include <QFileSystemWatcher>
#include <QLabel>
#include <QListWidget>
#include <QMessageBox>
#include <QPushButton>
#include <QSplitter>
#include <QTimer>
#include <QVBoxLayout>

#include "edu/edu_code_editor.h"

namespace {

const char kFilter[] = "Assembly (*.s *.asm *.a);;Text files (*.txt);;All files (*)";

}  // namespace

EduEditorDock::EduEditorDock(QWidget* parent)
    : QDockWidget("Editor", parent),
      editor_(new EduCodeEditor(this)),
      errorList_(new QListWidget(this)),
      info_(new QLabel(this)),
      watcher_(new QFileSystemWatcher(this)),
      pointSizeTimer_(new QTimer(this)),
      askingAboutDisk_(false) {
  setObjectName("EditorDockWidget");  // saveState()/restoreState() key
  setAllowedAreas(Qt::TopDockWidgetArea | Qt::BottomDockWidgetArea);

  errorList_->setObjectName("EditorErrorList");
  errorList_->setToolTip(QString::fromUtf8(
      "What the assembler refused; click a line to go to it\n"
      "어셈블러가 거부한 것들. 한 줄을 누르면 그 줄로 갑니다"));
  errorList_->setSelectionMode(QAbstractItemView::SingleSelection);
  errorList_->hide();
  info_->setContentsMargins(4, 1, 4, 1);
  info_->setToolTip(QString::fromUtf8(
      "The file's text encoding and line endings, and where the cursor is. "
      "Both are kept as they were when the file was opened.\n"
      "파일의 인코딩과 줄바꿈, 그리고 커서 위치. 둘 다 파일을 열 때 상태를 "
      "유지합니다"));

  QSplitter* splitter = new QSplitter(Qt::Vertical, this);
  splitter->addWidget(editor_);
  splitter->addWidget(errorList_);
  splitter->setStretchFactor(0, 4);
  splitter->setStretchFactor(1, 1);
  splitter->setChildrenCollapsible(false);

  QWidget* body = new QWidget(this);
  QVBoxLayout* layout = new QVBoxLayout(body);
  layout->setContentsMargins(0, 0, 0, 0);
  layout->setSpacing(0);
  layout->addWidget(splitter, 1);
  layout->addWidget(info_);
  setWidget(body);

  connect(editor_->document(), SIGNAL(modificationChanged(bool)), this,
          SLOT(onModificationChanged()));
  connect(editor_, SIGNAL(cursorPositionChanged()), this, SLOT(onCursorMoved()));
  // The size after a zoom, in the status line, for a second and a half.
  pointSizeTimer_->setSingleShot(true);
  pointSizeTimer_->setInterval(1500);
  connect(pointSizeTimer_, SIGNAL(timeout()), this, SLOT(clearPointSizeNote()));
  connect(editor_, SIGNAL(pointSizeChanged(int)), this,
          SLOT(onPointSizeChanged(int)));
  connect(errorList_, SIGNAL(itemClicked(QListWidgetItem*)), this,
          SLOT(onErrorActivated(QListWidgetItem*)));
  connect(errorList_, SIGNAL(itemActivated(QListWidgetItem*)), this,
          SLOT(onErrorActivated(QListWidgetItem*)));
  connect(watcher_, SIGNAL(fileChanged(QString)), this,
          SLOT(onFileChangedOnDisk(QString)));

  updateTitle();
  updateInfo();
}

bool EduEditorDock::isModified() const {
  return editor_->document()->isModified();
}

bool EduEditorDock::isUntouched() const {
  return path_.isEmpty() && !isModified() && editor_->document()->isEmpty();
}

void EduEditorDock::setPanelFont(const QFont& font) {
  editor_->setPanelFont(font);
  errorList_->setFont(font);
}

//
// Files
//

bool EduEditorDock::maybeSave() {
  if (!isModified()) {
    return true;
  }
  QMessageBox box(this);
  box.setObjectName("EduEditorSaveQuestion");
  box.setIcon(QMessageBox::Warning);
  box.setWindowTitle("Editor");
  box.setText(QString("%1 has unsaved changes.")
                  .arg(path_.isEmpty() ? QString("The new file")
                                       : QFileInfo(path_).fileName()));
  box.setStandardButtons(QMessageBox::Save | QMessageBox::Discard |
                         QMessageBox::Cancel);
  box.setDefaultButton(QMessageBox::Save);
  const int answer = box.exec();
  if (answer == QMessageBox::Save) {
    return save();
  }
  return answer == QMessageBox::Discard;
}

bool EduEditorDock::newFile() {
  if (!maybeSave()) {
    return false;
  }
  watch(QString());
  path_.clear();
  format_ = edu::TextFileFormat();  // UTF-8, no mark, LF
  bytesOnDisk_.clear();
  editor_->setPlainText(QString());
  editor_->document()->setModified(false);
  clearErrors();
  updateTitle();
  updateInfo();
  emit fileChanged();
  return true;
}

bool EduEditorDock::open() {
  if (!maybeSave()) {
    return false;
  }
  const QString start =
      !path_.isEmpty() ? QFileInfo(path_).absolutePath() : lastDirectory_;
  const QString path =
      QFileDialog::getOpenFileName(this, "Open in Editor", start, kFilter);
  return !path.isNull() && openFile(path, false);
}

bool EduEditorDock::openFile(const QString& path, bool askAboutChanges) {
  if (askAboutChanges && !maybeSave()) {
    return false;
  }
  QFile file(path);
  if (!file.open(QIODevice::ReadOnly)) {
    QMessageBox::warning(this, "Editor",
                         QString("Cannot open %1:\n%2")
                             .arg(QDir::toNativeSeparators(path))
                             .arg(file.errorString()));
    return false;
  }
  const QByteArray bytes = file.readAll();
  file.close();

  const edu::DecodedTextFile decoded = edu::decodeTextFile(bytes);
  path_ = QFileInfo(path).absoluteFilePath();
  lastDirectory_ = QFileInfo(path_).absolutePath();
  format_ = decoded.format;
  bytesOnDisk_ = bytes;
  editor_->setPlainText(decoded.text);
  editor_->document()->setModified(false);
  clearErrors();
  watch(path_);
  updateTitle();
  updateInfo();
  if (decoded.mixedLineEnds) {
    info_->setText(info_->text() +
                   QString("   (mixed line ends; saving makes them all %1)")
                       .arg(edu::lineEndName(format_.lineEnd)));
  }
  emit fileChanged();
  return true;
}

bool EduEditorDock::save() {
  return path_.isEmpty() ? saveAs() : writeTo(path_);
}

bool EduEditorDock::saveAs() {
  const QString start =
      !path_.isEmpty() ? path_
                       : (lastDirectory_.isEmpty() ? QString("untitled.s")
                                                   : lastDirectory_ + "/untitled.s");
  QString path = QFileDialog::getSaveFileName(this, "Save As", start, kFilter);
  if (path.isNull()) {
    return false;
  }
  if (QFileInfo(path).suffix().isEmpty()) {
    path += ".s";
  }
  return writeTo(path);
}

bool EduEditorDock::writeTo(const QString& path) {
  QByteArray bytes;
  int badLine = 0;
  if (!edu::encodeTextFile(editor_->fileText(), format_, &bytes, &badLine)) {
    // A character the file's encoding (CP949, Latin-1) cannot hold.
    QMessageBox box(this);
    box.setObjectName("EduEditorEncodingQuestion");
    box.setIcon(QMessageBox::Warning);
    box.setWindowTitle("Editor");
    box.setText(QString("Line %1 has a character that %2 cannot represent.")
                    .arg(badLine)
                    .arg(edu::encodingName(format_.encoding)));
    box.setInformativeText("Save the file as UTF-8 instead?");
    QPushButton* utf8 = box.addButton("Save as UTF-8", QMessageBox::AcceptRole);
    box.addButton(QMessageBox::Cancel);
    box.exec();
    if (box.clickedButton() != utf8) {
      editor_->goToLine(badLine);
      return false;
    }
    format_.encoding = edu::TextFileFormat::Utf8;
    format_.byteOrderMark = false;
    if (!edu::encodeTextFile(editor_->fileText(), format_, &bytes, &badLine)) {
      return false;
    }
  }

  watch(QString());  // our own write is not an "external change"
  QFile file(path);
  if (!file.open(QIODevice::WriteOnly | QIODevice::Truncate) ||
      file.write(bytes) != bytes.size()) {
    QMessageBox::warning(this, "Editor",
                         QString("Cannot write %1:\n%2")
                             .arg(QDir::toNativeSeparators(path))
                             .arg(file.errorString()));
    watch(path_);
    return false;
  }
  file.close();

  path_ = QFileInfo(path).absoluteFilePath();
  lastDirectory_ = QFileInfo(path_).absolutePath();
  bytesOnDisk_ = bytes;
  editor_->document()->setModified(false);
  watch(path_);
  updateTitle();
  updateInfo();
  emit fileChanged();
  return true;
}

//
// Changes made by another program
//

void EduEditorDock::watch(const QString& path) {
  const QStringList watched = watcher_->files();
  if (!watched.isEmpty()) {
    watcher_->removePaths(watched);
  }
  if (!path.isEmpty() && QFile::exists(path)) {
    watcher_->addPath(path);
  }
}

void EduEditorDock::onFileChangedOnDisk(const QString& path) {
  if (path != path_ || askingAboutDisk_) {
    return;
  }
  // Editors that save by renaming a temporary file make the watcher lose the
  // path, and the new file may not be complete yet: look a moment later.
  askingAboutDisk_ = true;
  QTimer::singleShot(150, this, SLOT(askAboutDiskChange()));
}

void EduEditorDock::askAboutDiskChange() {
  askingAboutDisk_ = false;
  if (path_.isEmpty()) {
    return;
  }
  watch(path_);
  QFile file(path_);
  if (!file.open(QIODevice::ReadOnly)) {
    return;  // deleted: keep what is in the editor
  }
  const QByteArray bytes = file.readAll();
  file.close();
  if (bytes == bytesOnDisk_) {
    return;  // touched, not changed
  }

  QMessageBox box(this);
  box.setObjectName("EduEditorReloadQuestion");
  box.setIcon(QMessageBox::Question);
  box.setWindowTitle("Editor");
  box.setText(QString("%1 was changed by another program.")
                  .arg(QFileInfo(path_).fileName()));
  box.setInformativeText(isModified()
                             ? "Reload it? Your unsaved changes here will be lost."
                             : "Reload it?");
  box.setStandardButtons(QMessageBox::Yes | QMessageBox::No);
  box.setDefaultButton(isModified() ? QMessageBox::No : QMessageBox::Yes);
  if (box.exec() == QMessageBox::Yes) {
    openFile(path_, false);
  } else {
    bytesOnDisk_ = bytes;  // do not ask again for this version
    editor_->document()->setModified(true);  // the editor differs from the disk
  }
}

//
// Errors
//

void EduEditorDock::showErrors(const QList<edu::AssemblerMessage>& messages) {
  errorList_->clear();
  QMap<int, QString> lines;
  const QString mine = QFileInfo(path_).canonicalFilePath();
  const QStringList fileLines = editor_->fileText().split('\n');
  for (int i = 0; i < messages.size(); i += 1) {
    const edu::AssemblerMessage& m = messages.at(i);
    const bool here = m.hasLocation && !mine.isEmpty() &&
                      QFileInfo(m.file).canonicalFilePath() == mine;
    // The core's number can be that of a later line (edu_asm_errors.h).
    const int line = here ? edu::resolveMessageLine(m, fileLines) : m.line;
    QString text = edu::assemblerMessageSummary(m, line);
    if (m.hasLocation && !here) {
      text += QString("   (%1)").arg(QFileInfo(m.file).fileName());
    }
    if (!m.source.isEmpty()) {
      text += QString("      ") + m.source;
    }
    QListWidgetItem* item = new QListWidgetItem(text, errorList_);
    item->setData(Qt::UserRole, here ? line : 0);
    item->setToolTip(m.raw.trimmed());
    if (here) {
      lines.insert(line, lines.contains(line)
                             ? lines.value(line) + "\n" + m.message
                             : m.message);
    }
  }
  errorList_->setVisible(!messages.isEmpty());
  editor_->setErrorLines(lines);
  if (!lines.isEmpty()) {
    editor_->goToLine(lines.constBegin().key());
  }
}

void EduEditorDock::clearErrors() {
  showErrors(QList<edu::AssemblerMessage>());
}

int EduEditorDock::errorCount() const { return errorList_->count(); }

void EduEditorDock::onErrorActivated(QListWidgetItem* item) {
  const int line = item->data(Qt::UserRole).toInt();
  if (line > 0) {
    editor_->goToLine(line);
  }
}

//
// Title and info line
//

void EduEditorDock::onModificationChanged() {
  updateTitle();
  emit fileChanged();
}

void EduEditorDock::onCursorMoved() { updateInfo(); }

void EduEditorDock::updateTitle() {
  const QString name =
      path_.isEmpty() ? QString("untitled") : QFileInfo(path_).fileName();
  setWindowTitle(QString("Editor: ") + name + (isModified() ? "*" : ""));
  setToolTip(QDir::toNativeSeparators(path_));
}

void EduEditorDock::updateInfo() {
  info_->setText(QString("%1%2   %3   Ln %4, Col %5%6")
                     .arg(edu::encodingName(format_.encoding))
                     .arg(format_.byteOrderMark ? " with BOM" : "")
                     .arg(edu::lineEndName(format_.lineEnd))
                     .arg(editor_->currentLine())
                     .arg(editor_->currentColumn())
                     .arg(pointSizeNote_));
}

void EduEditorDock::onPointSizeChanged(int points) {
  pointSizeNote_ = QString("      %1pt").arg(points);
  updateInfo();
  pointSizeTimer_->start();
  emit fontSizeChanged(points);
}

void EduEditorDock::clearPointSizeNote() {
  pointSizeNote_.clear();
  updateInfo();
}
