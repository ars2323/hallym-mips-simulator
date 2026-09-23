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
#include <QStackedWidget>
#include <QHBoxLayout>
#include <QVBoxLayout>

#include "edu/edu_code_editor.h"
#include "edu/theme/edu_theme.h"
#include "edu/theme/tokens.h"

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
      pages_(0),
      startScreen_(0),
      readOnly_(false),
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

  QWidget* editorPage = new QWidget(this);
  QVBoxLayout* editorLayout = new QVBoxLayout(editorPage);
  editorLayout->setContentsMargins(0, 0, 0, 0);
  editorLayout->setSpacing(0);
  editorLayout->addWidget(splitter, 1);
  editorLayout->addWidget(info_);

  // Two pages: what to do when nothing is open, and the editor itself.
  pages_ = new QStackedWidget(this);
  startScreen_ = buildStartScreen();
  pages_->addWidget(startScreen_);
  pages_->addWidget(editorPage);
  pages_->setCurrentWidget(startScreen_);
  setWidget(pages_);

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

// Nothing is open yet: two things to do, and the one line a student needs
// to know to get going.  No list of recent files -- a lab machine is
// shared, and the last person's paths are not this person's business.
QWidget* EduEditorDock::buildStartScreen() {
  using namespace edu::theme;
  QWidget* page = new QWidget(this);
  page->setObjectName("EduStartScreen");
  page->setAutoFillBackground(true);
  QPalette colours = page->palette();
  colours.setColor(QPalette::Window, QColor(kWhite));
  page->setPalette(colours);

  QLabel* title = new QLabel(QString::fromUtf8("MIPS 어셈블리를 시작하세요"),
                             page);
  QFont titleFont = uiFont();
  titleFont.setPixelSize(kCardTitleSize + 3);
  titleFont.setWeight(QFont::Bold);
  title->setFont(titleFont);
  title->setAlignment(Qt::AlignCenter);
  title->setStyleSheet(QString("color: %1;").arg(QColor(kNavy).name()));

  QLabel* subtitle = new QLabel(QString("Start writing MIPS assembly"), page);
  QFont subtitleFont = uiFont();
  subtitleFont.setPixelSize(kCardBodySize);
  subtitleFont.setWeight(QFont::Medium);
  subtitle->setFont(subtitleFont);
  subtitle->setAlignment(Qt::AlignCenter);
  subtitle->setStyleSheet(QString("color: %1;").arg(QColor(kText2).name()));

  QPushButton* newFile =
      new QPushButton(QString::fromUtf8("새 파일  New file"), page);
  newFile->setObjectName("EduStartNew");
  QPushButton* openFile =
      new QPushButton(QString::fromUtf8("파일 열기  Open file"), page);
  openFile->setObjectName("EduStartOpen");
  QFont buttonFont = uiFont();
  buttonFont.setPixelSize(kCardBodySize);
  buttonFont.setWeight(QFont::DemiBold);
  newFile->setFont(buttonFont);
  openFile->setFont(buttonFont);
  newFile->setMinimumSize(200, 44);
  openFile->setMinimumSize(200, 44);
  newFile->setCursor(Qt::PointingHandCursor);
  openFile->setCursor(Qt::PointingHandCursor);
  newFile->setStyleSheet(
      QString("QPushButton { background: %1; color: %2; border: none;"
              " border-radius: 6px; padding: 10px 18px; }"
              "QPushButton:hover { background: %3; }")
          .arg(QColor(kBlue).name(), QColor(kWhite).name(),
               QColor(kNavy).name()));
  openFile->setStyleSheet(
      QString("QPushButton { background: %1; color: %2; border: 1px solid %3;"
              " border-radius: 6px; padding: 10px 18px; }"
              "QPushButton:hover { background: %4; }")
          .arg(QColor(kWhite).name(), QColor(kNavy).name(),
               QColor(kBorder).name(), QColor(kHover).name()));

  QLabel* hint = new QLabel(
      QString::fromUtf8("Ctrl+S로 저장하면 바로 어셈블됩니다  ·  "
                        "Ctrl+S saves and assembles"),
      page);
  QFont hintFont = uiFont();
  hintFont.setPixelSize(kFontSmall);
  hintFont.setWeight(QFont::Medium);
  hint->setFont(hintFont);
  hint->setAlignment(Qt::AlignCenter);
  hint->setStyleSheet(QString("color: %1;").arg(QColor(kTextMuted).name()));

  QHBoxLayout* buttons = new QHBoxLayout;
  buttons->addStretch(1);
  buttons->addWidget(newFile);
  buttons->addSpacing(kSpace3);
  buttons->addWidget(openFile);
  buttons->addStretch(1);

  QVBoxLayout* layout = new QVBoxLayout(page);
  layout->addStretch(2);
  layout->addWidget(title);
  layout->addSpacing(kSpace1);
  layout->addWidget(subtitle);
  layout->addSpacing(kSpace4 + kSpace2);
  layout->addLayout(buttons);
  layout->addSpacing(kSpace4);
  layout->addWidget(hint);
  layout->addStretch(3);

  connect(newFile, SIGNAL(clicked()), this, SLOT(onStartNewFile()));
  connect(openFile, SIGNAL(clicked()), this, SLOT(onStartOpenFile()));
  return page;
}

void EduEditorDock::showStartScreen() {
  pages_->setCurrentWidget(startScreen_);
  emit fileChanged();
}

bool EduEditorDock::startScreenShown() const {
  return pages_->currentWidget() == startScreen_;
}

void EduEditorDock::showEditorPage() {
  pages_->setCurrentIndex(1);
  emit fileChanged();
}

void EduEditorDock::setReadOnly(bool readOnly) {
  readOnly_ = readOnly;
  editor_->setReadOnly(readOnly);
  updateInfo();
}

// Back to the start screen, with nothing open.
bool EduEditorDock::closeFile(bool ask) {
  if (ask && !readOnly_ && !maybeSave()) {
    return false;
  }
  setReadOnly(false);
  watch(QString());
  path_.clear();
  editor_->clear();
  editor_->document()->setModified(false);
  clearErrors();
  showStartScreen();
  return true;
}

// "New file" starts by asking where it goes: an untitled buffer that is
// only saved later is one more thing to forget, and the simulator wants a
// file on disk to assemble anyway.
void EduEditorDock::onStartNewFile() {
  const QString path = QFileDialog::getSaveFileName(
      this, "New Assembly File", QString(),
      "Assembly (*.s *.asm);;All files (*)");
  if (path.isEmpty()) {
    return;  // cancelled: the start screen stays
  }
  path_ = path;
  editor_->clear();
  editor_->document()->setModified(false);
  format_ = edu::TextFileFormat();
  if (!writeTo(path_)) {
    path_.clear();
    return;
  }
  watch(path_);
  showEditorPage();
  updateTitle();
  updateInfo();
  editor_->setFocus();
}

void EduEditorDock::onStartOpenFile() { open(); }

bool EduEditorDock::isModified() const {
  return editor_->document()->isModified();
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

void EduEditorDock::forgetChanges() {
  editor_->document()->setModified(false);
}

bool EduEditorDock::newFile() {
  if (!maybeSave()) {
    return false;
  }
  showEditorPage();
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
  showEditorPage();  // whatever route brought the file here
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

// The dock's title is what its tab says, and a tab has room for a word,
// not for a path: "Editor: a-very-long-name.s*" was cut off in the middle
// (Z).  The file's name is in the window's own title bar and in the line
// under the editor, which is on screen in every arrangement.
void EduEditorDock::updateTitle() {
  setWindowTitle(QString("Editor") + (isModified() ? "*" : ""));
  setToolTip(QDir::toNativeSeparators(path_));
  updateInfo();
}

void EduEditorDock::updateInfo() {
  const QString name =
      path_.isEmpty() ? QString("untitled") : QFileInfo(path_).fileName();
  info_->setText(QString("%1%2   %3%4   %5   Ln %6, Col %7%8")
                     .arg(name)
                     .arg(isModified() ? "*" : "")
                     .arg(edu::encodingName(format_.encoding))
                     .arg(format_.byteOrderMark ? " with BOM" : "")
                     .arg(edu::lineEndName(format_.lineEnd))
                     .arg(editor_->currentLine())
                     .arg(editor_->currentColumn())
                     .arg(pointSizeNote_));
  if (readOnly_) {
    info_->setText(QString::fromUtf8("읽기 전용 / Read-only   ") +
                   info_->text());
  }
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
