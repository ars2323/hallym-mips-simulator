/* See edu_theme.h. */

#include "edu/theme/edu_theme.h"

#include <QApplication>
#include <QDir>
#include <QFile>
#include <QFontDatabase>
#include <QPainter>
#include <QScreen>
#include <QTimer>

#include "edu/theme/edu_splash.h"
#include "edu/theme/tokens.h"

namespace edu {
namespace theme {

namespace {

QString hex(QRgb rgb) {
  return QColor(rgb).name(QColor::HexRgb);
}

void installFonts() {
  static bool done = false;
  if (done) {
    return;
  }
  done = true;
  const QDir dir(":/theme/fonts");
  const QStringList files = dir.entryList(QStringList() << "*.ttf" << "*.otf");
  for (int i = 0; i < files.size(); i += 1) {
    QFontDatabase::addApplicationFont(dir.filePath(files.at(i)));
  }
}

// A PNG from the resource with its @2x twin, if there is one.  The PNGs are
// rendered from the SVG sources by tools/make-theme-icons.py; the program
// itself needs no SVG renderer.
QPixmap pixmapAt(const QString& path, qreal dpr) {
  if (dpr > 1.0) {
    QPixmap twice(path.left(path.size() - 4) + "@2x.png");
    if (!twice.isNull()) {
      twice.setDevicePixelRatio(2.0);
      return twice;
    }
  }
  return QPixmap(path);
}

}  // namespace

QFont uiFont() {
  installFonts();
  QFont font(kUiFamily);
  font.setPixelSize(kUiPixelSize);
  return font;
}

QFont codeFont() {
  installFonts();
  QFont font(kCodeFamily, kCodePointSize);
  font.setStyleHint(QFont::TypeWriter);
  font.setFixedPitch(true);
  return font;
}

QString styleSheet() {
  QFile file(":/theme/light.qss");
  if (!file.open(QIODevice::ReadOnly)) {
    return QString();
  }
  QString qss = QString::fromUtf8(file.readAll());
  for (unsigned i = 0; i < sizeof(kNamedColors) / sizeof(kNamedColors[0]);
       i += 1) {
    qss.replace(QString("@") + kNamedColors[i].name + "@",
                hex(kNamedColors[i].rgb));
  }
  qss.replace("@ui-family@", kUiFamily);
  qss.replace("@ui-px@", QString::number(kUiPixelSize));
  qss.replace("@badge-px@", QString::number(kBadgePixelSize));
  qss.replace("@icon-size@", QString::number(kToolIconSize));
  qss.replace("@space-1@", QString::number(kSpace1));
  qss.replace("@space-2@", QString::number(kSpace2));
  qss.replace("@space-3@", QString::number(kSpace3));
  return qss;
}

QIcon toolIcon(const QString& lucideName) {
  const QString base = ":/theme/icons/png/" + lucideName;
  QIcon icon;
  const struct {
    const char* state;
    QIcon::Mode mode;
  } states[] = {{"normal", QIcon::Normal},
                {"active", QIcon::Active},
                {"disabled", QIcon::Disabled}};
  for (unsigned i = 0; i < sizeof(states) / sizeof(states[0]); i += 1) {
    const QString path = base + "-" + states[i].state + ".png";
    icon.addPixmap(QPixmap(path), states[i].mode);
    icon.addPixmap(pixmapAt(path, 2.0), states[i].mode);
  }
  return icon;
}

QPixmap brandPixmap(const QString& name, int width, qreal devicePixelRatio) {
  // Only the widths make-theme-icons.py rendered exist; see BRAND there.
  return pixmapAt(QString(":/theme/brand/%1-%2.png").arg(name).arg(width),
                  devicePixelRatio);
}

void apply(QApplication* app) {
  installFonts();
  app->setFont(uiFont());
  app->setStyleSheet(styleSheet());

  // Every size the .ico carries, so that Windows and the window manager
  // pick the right mark: the symbol at 16, the emblem above it
  // (tools/make-theme-icons.py, docs/design/captures/app-icon-options.png).
  QIcon appIcon;
  const int sizes[] = {16, 24, 32, 48, 64, 256};
  for (unsigned i = 0; i < sizeof(sizes) / sizeof(sizes[0]); i += 1) {
    appIcon.addFile(QString(":/theme/brand/app-%1.png").arg(sizes[i]));
  }
  app->setWindowIcon(appIcon);
}

EduSplash* showSplash() {
  EduSplash* splash = new EduSplash;
  splash->showCentred();
  qApp->processEvents();
  return splash;
}

}  // namespace theme
}  // namespace edu
