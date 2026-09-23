/* See edu_cross_handle.h. */

#include "edu/edu_cross_handle.h"

#include <QDockWidget>
#include <QMouseEvent>
#include <QPainter>

#include "edu/theme/tokens.h"
#include "spimview.h"

EduCrossHandle::EduCrossHandle(SpimView* window)
    : QWidget(window),
      window_(window),
      dragging_(false),
      pressedColumn_(0),
      pressedRow_(0) {
  setObjectName("EduCrossHandle");
  setFixedSize(kSize, kSize);
  setCursor(Qt::SizeAllCursor);
  setToolTip(QString::fromUtf8(
      "Drag to size all four panels at once\n"
      "끌면 네 패널의 크기가 한꺼번에 바뀝니다"));
  hide();
}

void EduCrossHandle::follow() {
  QRect crossing;
  if (!window_->eduSplitCrossing(&crossing)) {
    hide();
    return;
  }
  QPoint centre = crossing.center();
  move(centre.x() - kSize / 2, centre.y() - kSize / 2);
  show();
  raise();
}

void EduCrossHandle::paintEvent(QPaintEvent*) {
  // Four dots, the way a resize corner is drawn: enough to say "take hold
  // of this" without a box around it.
  QPainter painter(this);
  painter.setRenderHint(QPainter::Antialiasing, true);
  painter.setPen(Qt::NoPen);
  painter.setBrush(QColor(edu::theme::kScroll));
  const int r = 2;
  for (int i = 0; i < 2; i += 1) {
    for (int j = 0; j < 2; j += 1) {
      painter.drawEllipse(QPoint(4 + i * 5, 4 + j * 5), r, r);
    }
  }
}

void EduCrossHandle::mousePressEvent(QMouseEvent* event) {
  if (event->button() != Qt::LeftButton) {
    QWidget::mousePressEvent(event);
    return;
  }
  dragging_ = true;
  pressedAt_ = window_->mapFromGlobal(event->globalPos());
  window_->eduSplitSizes(&pressedColumn_, &pressedRow_);
}

void EduCrossHandle::mouseMoveEvent(QMouseEvent* event) {
  if (!dragging_) {
    QWidget::mouseMoveEvent(event);
    return;
  }
  const QPoint now = window_->mapFromGlobal(event->globalPos());
  window_->eduSetSplitSizes(pressedColumn_ + (now.x() - pressedAt_.x()),
                            pressedRow_ + (now.y() - pressedAt_.y()));
  follow();
}

void EduCrossHandle::mouseReleaseEvent(QMouseEvent* event) {
  if (event->button() == Qt::LeftButton) {
    dragging_ = false;
    follow();
  }
  QWidget::mouseReleaseEvent(event);
}
