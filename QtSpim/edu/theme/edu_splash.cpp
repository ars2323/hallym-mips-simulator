/* See edu_splash.h. */

#include "edu/theme/edu_splash.h"

#include <QApplication>
#include <QCloseEvent>
#include <QCursor>
#include <QKeyEvent>
#include <QMouseEvent>
#include <QHBoxLayout>
#include <QPushButton>
#include <QVBoxLayout>
#include <QPainter>
#include <QPainterPath>
#include <QPixmap>
#include <QScreen>
#include <QTimer>

#include "edu/edu_version.h"
#include "edu/theme/edu_theme.h"
#include "edu/theme/tokens.h"

namespace edu {
namespace theme {

namespace {

const int kWidth = 480;
const int kHeight = 360;  // room for the question and the two buttons
const int kRadius = 8;
const int kSignatureWidth = 260;
const int kBarHeight = 2;
const int kPhaseSteps = 96;   // one sweep of the progress segment
const int kFrameMillis = 16;  // ~60 frames a second

}  // namespace

EduSplash::EduSplash(QWidget* parent)
    : QWidget(parent, Qt::SplashScreen | Qt::FramelessWindowHint |
                          Qt::WindowStaysOnTopHint),
      tutorial_(new QPushButton(QString::fromUtf8("튜토리얼 보기"), this)),
      straight_(new QPushButton(QString::fromUtf8("바로 시작"), this)),
      finished_(false) {
  setObjectName("EduSplash");
  setAttribute(Qt::WA_TranslucentBackground);  // the card's rounded corners
  setAttribute(Qt::WA_DeleteOnClose);
  setFixedSize(kWidth, kHeight);
  setFocusPolicy(Qt::StrongFocus);

  QFont buttonFont = uiFont();
  buttonFont.setPixelSize(kUiPixelSize);
  buttonFont.setWeight(QFont::DemiBold);
  tutorial_->setObjectName("EduSplashTutorial");
  straight_->setObjectName("EduSplashStraight");
  tutorial_->setFont(buttonFont);
  straight_->setFont(buttonFont);
  tutorial_->setCursor(Qt::PointingHandCursor);
  straight_->setCursor(Qt::PointingHandCursor);
  tutorial_->setToolTip(QString::fromUtf8(
      "화면을 하나씩 짚어 가며 사용법을 알려 줍니다\n"
      "A guided tour of the window"));
  straight_->setToolTip(QString::fromUtf8(
      "바로 시작합니다. 투어는 Help > Tutorial에서 언제든 볼 수 있습니다\n"
      "Start now; the tour is in Help > Tutorial whenever you want it"));
  tutorial_->setStyleSheet(
      QString("QPushButton { background: %1; color: %2; border: 1px solid %3;"
              " border-radius: 6px; padding: 8px 18px; }"
              "QPushButton:hover { background: %4; }"
              "QPushButton:focus { border: 2px solid %5; }")
          .arg(QColor(kWhite).name(), QColor(kNavy).name(),
               QColor(kBorder).name(), QColor(kHover).name(),
               QColor(kBlue).name()));
  straight_->setStyleSheet(
      QString("QPushButton { background: %1; color: %2; border: none;"
              " border-radius: 6px; padding: 8px 18px; }"
              "QPushButton:hover { background: %3; }"
              "QPushButton:focus { border: 2px solid %4; }")
          .arg(QColor(kBlue).name(), QColor(kWhite).name(),
               QColor(kNavy).name(), QColor(kNavy).name()));

  QHBoxLayout* buttons = new QHBoxLayout;
  buttons->setSpacing(kSpace2);
  buttons->addStretch(1);
  buttons->addWidget(tutorial_);
  buttons->addWidget(straight_);
  buttons->addStretch(1);

  QVBoxLayout* layout = new QVBoxLayout(this);
  layout->setContentsMargins(kSpace4, kSpace4, kSpace4, kSpace4 + kSpace1);
  layout->addStretch(1);
  layout->addLayout(buttons);

  connect(tutorial_, SIGNAL(clicked()), this, SLOT(chooseTutorial()));
  connect(straight_, SIGNAL(clicked()), this, SLOT(chooseStraightToWork()));
  straight_->setDefault(true);
  straight_->setFocus();
}

void EduSplash::showCentred() {
  const QScreen* screen = QGuiApplication::screenAt(QCursor::pos());
  if (screen == 0) {
    screen = QGuiApplication::primaryScreen();
  }
  if (screen != 0) {
    const QRect area = screen->availableGeometry();
    move(area.center() - QPoint(width() / 2, height() / 2));
  }
  show();
  raise();
}

void EduSplash::chooseTutorial() { finish(true); }

void EduSplash::chooseStraightToWork() { finish(false); }

void EduSplash::finish(bool withTutorial) {
  if (!finished_) {
    finished_ = true;
    emit finished(withTutorial);
  }
  close();
}

// A click anywhere else does nothing: the card is a question, and it waits
// for an answer.
void EduSplash::mousePressEvent(QMouseEvent*) {}

void EduSplash::keyPressEvent(QKeyEvent* event) {
  // Tab and the arrows move between the two buttons; Enter takes the one
  // with the focus, and Escape is "straight to work".
  if (event->key() == Qt::Key_Escape) {
    finish(false);
    return;
  }
  if (event->key() == Qt::Key_Left || event->key() == Qt::Key_Right) {
    (tutorial_->hasFocus() ? straight_ : tutorial_)->setFocus();
    return;
  }
  QWidget::keyPressEvent(event);
}

void EduSplash::closeEvent(QCloseEvent* event) {
  if (!finished_) {
    finished_ = true;
    emit finished(false);
  }
  QWidget::closeEvent(event);
}

void EduSplash::paintEvent(QPaintEvent*) {
  QPainter painter(this);
  painter.setRenderHint(QPainter::Antialiasing);
  painter.setRenderHint(QPainter::SmoothPixmapTransform);

  const QRectF card(0.5, 0.5, width() - 1.0, height() - 1.0);
  QPainterPath rounded;
  rounded.addRoundedRect(card, kRadius, kRadius);

  painter.fillPath(rounded, color(kWhite));
  painter.setClipPath(rounded);

  // The signature: symbol and logotype in the proportions of the university
  // manual (assets/ci/A4), never redrawn here -- only placed and scaled.
  const QPixmap signature =
      brandPixmap("signature-h-ko-en", kSignatureWidth, devicePixelRatioF());
  const int signatureHeight =
      signature.isNull() ? 0 : int(signature.height() / signature.devicePixelRatio());
  int y = 44;
  if (!signature.isNull()) {
    painter.drawPixmap((width() - kSignatureWidth) / 2, y, signature);
    y += signatureHeight;
  }

  y += kSpace4 + kSpace2;
  QFont title = uiFont();
  title.setPixelSize(kSplashTitleSize);
  title.setWeight(QFont::Bold);
  painter.setFont(title);
  painter.setPen(color(kNavy));
  painter.drawText(QRect(0, y, width(), kSplashTitleSize + 8),
                   Qt::AlignHCenter | Qt::AlignTop, EDU_APP_NAME);
  y += kSplashTitleSize + 10;

  QFont small = uiFont();
  small.setPixelSize(kUiPixelSize);
  painter.setFont(small);
  painter.setPen(color(kText2));
  painter.drawText(QRect(0, y, width(), kUiPixelSize + 6),
                   Qt::AlignHCenter | Qt::AlignTop, "Version " EDU_VERSION);
  y += kUiPixelSize + kSpace3;

  const int ruleWidth = 320;
  painter.setPen(color(kBorder));
  painter.drawLine((width() - ruleWidth) / 2, y, (width() + ruleWidth) / 2, y);
  y += kSpace3;

  QFont tiny = uiFont();
  tiny.setPixelSize(kFontSmall);
  painter.setFont(tiny);
  painter.setPen(color(kText2));
  painter.drawText(QRect(0, y, width(), kFontSmall + 6),
                   Qt::AlignHCenter | Qt::AlignTop,
                   QString::fromUtf8("AIAC Lab \xc2\xb7 Hallym University"));

  // The card waits for a choice, so there is nothing to show progress of.
  // The question the two buttons answer, just above them.
  QFont ask = uiFont();
  ask.setPixelSize(kUiPixelSize);
  ask.setWeight(QFont::DemiBold);
  painter.setFont(ask);
  painter.setPen(color(kText));
  painter.drawText(
      QRect(0, height() - 92, width(), kUiPixelSize + 8),
      Qt::AlignHCenter | Qt::AlignTop,
      QString::fromUtf8("처음이라면 투어를 보고 시작하세요"));

  painter.setClipping(false);
  painter.setPen(color(kBorder));
  painter.drawPath(rounded);
}

}  // namespace theme
}  // namespace edu
