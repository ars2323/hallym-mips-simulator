/* See edu_splash.h. */

#include "edu/theme/edu_splash.h"

#include <QApplication>
#include <QCloseEvent>
#include <QCursor>
#include <QKeyEvent>
#include <QMouseEvent>
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
const int kHeight = 300;
const int kRadius = 8;
const int kSignatureWidth = 260;
const int kBarHeight = 2;
const int kPhaseSteps = 96;   // one sweep of the progress segment
const int kFrameMillis = 16;  // ~60 frames a second

}  // namespace

EduSplash::EduSplash(QWidget* parent)
    : QWidget(parent, Qt::SplashScreen | Qt::FramelessWindowHint |
                          Qt::WindowStaysOnTopHint),
      animation_(new QTimer(this)),
      phase_(kPhaseSteps / 3),  // a still capture shows the bar too
      finished_(false) {
  setObjectName("EduSplash");
  setAttribute(Qt::WA_TranslucentBackground);  // the card's rounded corners
  setAttribute(Qt::WA_DeleteOnClose);
  setFixedSize(kWidth, kHeight);
  setFocusPolicy(Qt::StrongFocus);

  connect(animation_, SIGNAL(timeout()), this, SLOT(animate()));
  animation_->start(kFrameMillis);
  QTimer::singleShot(kSplashMillis, this, SLOT(expire()));
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

void EduSplash::animate() {
  phase_ = (phase_ + 1) % kPhaseSteps;
  update();
}

void EduSplash::expire() { close(); }

void EduSplash::mousePressEvent(QMouseEvent*) { close(); }

void EduSplash::keyPressEvent(QKeyEvent* event) {
  if (event->key() == Qt::Key_Escape || event->key() == Qt::Key_Return ||
      event->key() == Qt::Key_Space) {
    close();
    return;
  }
  QWidget::keyPressEvent(event);
}

void EduSplash::closeEvent(QCloseEvent* event) {
  animation_->stop();
  if (!finished_) {
    finished_ = true;
    emit finished();
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

  // An indeterminate progress bar: a segment sweeping left to right.  It
  // says "still starting", not how far along it is.
  const int track = height() - kBarHeight;
  painter.fillRect(QRect(0, track, width(), kBarHeight), color(kBorder));
  const int segment = width() / 3;
  const int span = width() + segment;
  const int x = (span * phase_) / kPhaseSteps - segment;
  painter.fillRect(QRect(x, track, segment, kBarHeight), color(kBlue));

  painter.setClipping(false);
  painter.setPen(color(kBorder));
  painter.drawPath(rounded);
}

}  // namespace theme
}  // namespace edu
