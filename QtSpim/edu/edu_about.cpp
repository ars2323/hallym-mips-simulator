/* See edu_about.h. */

#include "edu/edu_about.h"

#include <QApplication>
#include <QDialogButtonBox>
#include <QFile>
#include <QHBoxLayout>
#include <QLabel>
#include <QTabWidget>
#include <QTextBrowser>
#include <QVBoxLayout>

#include "edu/edu_version.h"
#include "edu/theme/edu_theme.h"
#include "edu/theme/tokens.h"
#include "version.h"  // CPU/version.h -- SPIM_VERSION

namespace {

QString resourceText(const QString& path) {
  QFile file(path);
  if (!file.open(QIODevice::ReadOnly)) {
    return QString();
  }
  return QString::fromUtf8(file.readAll());
}

QString preformatted(const QString& text) {
  return "<pre style='white-space: pre-wrap;'>" + text.toHtmlEscaped() + "</pre>";
}

}  // namespace

QString EduAboutDialog::licenseHtml() {
  // The first block is upstream's About text, unaltered from "Based on" down
  // (QtSpim/menu.cpp before this program replaced the box).
  QString html =
      QString("<p><strong>Based on QtSpim</strong></p>") +
      QString("<p>") + QString(SPIM_VERSION) + QString("</p>") +
      QString("<p>SPIM is a simulator of the MIPS R3000 processor.</p>"
              "<p>Copyright (c) 1990-2015, James R. Larus "
              "(larus@larusstone.org).</p>"
              "<p>SPIM is distributed under a BSD license.</p>"
              "<p>For more information, source code, and binaries:</p>"
              "<p><a "
              "href='https://sourceforge.net/projects/spimsimulator/"
              "'>https://sourceforge.net/projects/spimsimulator/</a></p>"
              "<p>QtSPIM is linked to the Qt library, which is distributed "
              "under the GNU Lesser General Public License version 3 and "
              "GNU Lesser General Public License version 2.1.</p>"
              "<p><a "
              "href='http://www.gnu.org/licenses/old-licenses/"
              "lgpl-2.1.html'>GNU Lesser General Public License, version "
              "2.1</a></p>"
              "<p><a href='http://www.gnu.org/licenses/lgpl-3.0.html'>GNU "
              "Lesser General Public License, version 3</a></p>") +
      QString("<p>This program is a modified version of QtSpim (through "
              "QtSpim-Edu) and is not endorsed by or affiliated with the "
              "SPIM project. Its changes are offered under the same BSD "
              "terms; the simulator core is unmodified.</p>"
              "<hr>"
              "<p><strong>Fonts</strong> &mdash; Pretendard (Kil Hyung-jin) "
              "and D2Coding (NAVER Corporation), both under the SIL Open "
              "Font License 1.1:</p>") +
      preformatted(resourceText(":/theme/fonts/OFL-Pretendard.txt")) +
      preformatted(resourceText(":/theme/fonts/OFL-D2Coding.txt")) +
      QString("<hr><p><strong>Icons</strong> &mdash; Lucide, ISC license:</p>") +
      preformatted(resourceText(":/theme/icons/lucide/LICENSE.txt")) +
      QString("<hr><p>The university symbol, logotype, emblem and signature "
              "are the property of Hallym University and are used under its "
              "UI regulations for non-commercial university purposes.</p>");
  return html;
}

EduAboutDialog::EduAboutDialog(QWidget* parent) : QDialog(parent) {
  setObjectName("EduAboutDialog");
  setWindowTitle(QString("About ") + EDU_APP_NAME);
  const qreal dpr = devicePixelRatioF();

  // ---- About tab ----
  QWidget* about = new QWidget(this);
  QLabel* emblem = new QLabel(about);
  emblem->setPixmap(edu::theme::brandPixmap("emblem-a-navy", 112, dpr));
  emblem->setAlignment(Qt::AlignTop | Qt::AlignHCenter);

  QLabel* logotype = new QLabel(about);
  logotype->setPixmap(edu::theme::brandPixmap("logotype-ko-en", 220, dpr));

  QLabel* name = new QLabel(EDU_APP_NAME, about);
  name->setObjectName("EduAboutName");
  QFont nameFont = edu::theme::uiFont();
  nameFont.setPixelSize(edu::theme::kDisplayPixelSize);
  nameFont.setWeight(QFont::DemiBold);
  name->setFont(nameFont);
  QPalette navy = name->palette();
  navy.setColor(QPalette::WindowText, edu::theme::color(edu::theme::kNavy));
  name->setPalette(navy);

  QLabel* version = new QLabel(
      QString("Version " EDU_VERSION "  \xc2\xb7  based on QtSpim "
              EDU_BASE_VERSION),
      about);
  QPalette muted = version->palette();
  muted.setColor(QPalette::WindowText, edu::theme::color(edu::theme::kText2));
  version->setPalette(muted);

  QLabel* blurb = new QLabel(
      "A MIPS32 assembler and simulator for the computer architecture "
      "courses of Hallym University: an editor, registers grouped by role, "
      "the machine word of every instruction broken into its fields, and "
      "a data view with labels and stack markers. Programs assemble and run "
      "exactly as in the standard simulator.",
      about);
  blurb->setWordWrap(true);

  QVBoxLayout* text = new QVBoxLayout;
  text->setSpacing(edu::theme::kSpace2);
  text->addWidget(logotype);
  text->addSpacing(edu::theme::kSpace2);
  text->addWidget(name);
  text->addWidget(version);
  text->addSpacing(edu::theme::kSpace1);
  text->addWidget(blurb);
  text->addStretch(1);

  QHBoxLayout* row = new QHBoxLayout(about);
  row->setContentsMargins(edu::theme::kSpace4, edu::theme::kSpace4,
                          edu::theme::kSpace4, edu::theme::kSpace4);
  row->setSpacing(edu::theme::kSpace4 + edu::theme::kSpace2);
  row->addWidget(emblem, 0, Qt::AlignTop);
  row->addLayout(text, 1);

  // ---- License tab ----
  QTextBrowser* license = new QTextBrowser(this);
  license->setObjectName("EduAboutLicense");
  license->setOpenExternalLinks(true);
  license->setHtml(licenseHtml());

  QTabWidget* tabs = new QTabWidget(this);
  tabs->setObjectName("EduAboutTabs");
  tabs->addTab(about, "About");
  tabs->addTab(license, "License");

  QDialogButtonBox* buttons =
      new QDialogButtonBox(QDialogButtonBox::Ok, Qt::Horizontal, this);
  connect(buttons, SIGNAL(accepted()), this, SLOT(accept()));

  QVBoxLayout* layout = new QVBoxLayout(this);
  layout->setContentsMargins(edu::theme::kSpace3, edu::theme::kSpace3,
                             edu::theme::kSpace3, edu::theme::kSpace3);
  layout->setSpacing(edu::theme::kSpace3);
  layout->addWidget(tabs, 1);
  layout->addWidget(buttons);
  resize(560, 400);
}
