/* See edu_bottom_panel.h. */

#include "edu/edu_bottom_panel.h"

#include <QIcon>
#include <QPainter>
#include <QPixmap>
#include <QTabBar>
#include <QTabWidget>
#include <QVBoxLayout>
#include <QWidget>

#include "edu/theme/tokens.h"

namespace {

using namespace edu::theme;

// The mark on the Messages tab: a filled dot in the colour the program uses
// for things that want attention, the size of a full stop.
QIcon unreadDot() {
  const int size = 10;
  QPixmap pixmap(size, size);
  pixmap.fill(Qt::transparent);
  QPainter painter(&pixmap);
  painter.setRenderHint(QPainter::Antialiasing, true);
  painter.setPen(Qt::NoPen);
  painter.setBrush(QColor(kWarning));
  painter.drawEllipse(1, 1, size - 2, size - 2);
  painter.end();
  return QIcon(pixmap);
}

}  // namespace

EduBottomPanel::EduBottomPanel(QWidget* parent)
    : QDockWidget(parent),
      tabs_(new QTabWidget(this)),
      console_(0),
      messages_(0),
      consoleIndex_(-1),
      messagesIndex_(-1),
      unread_(false) {
  setObjectName("BottomDockWidget");  // saved layouts and the harness
  setWindowTitle("Console / Messages");
  setFeatures(QDockWidget::DockWidgetClosable | QDockWidget::DockWidgetMovable |
              QDockWidget::DockWidgetFloatable);

  tabs_->setObjectName("EduBottomTabs");
  tabs_->setDocumentMode(true);
  tabs_->tabBar()->setElideMode(Qt::ElideRight);
  tabs_->tabBar()->setExpanding(false);

  QWidget* box = new QWidget(this);
  QVBoxLayout* layout = new QVBoxLayout(box);
  layout->setContentsMargins(0, kSpace1, 0, 0);  // a breath under the title
  layout->setSpacing(0);
  layout->addWidget(tabs_);
  setWidget(box);

  connect(tabs_, SIGNAL(currentChanged(int)), this,
          SLOT(onCurrentChanged(int)));
}

void EduBottomPanel::setConsole(QWidget* console) {
  console_ = console;
  if (console_ == 0) {
    return;
  }
  consoleIndex_ = tabs_->insertTab(0, console_, "Console");
  tabs_->setTabToolTip(consoleIndex_,
                       QString::fromUtf8(
                           "What the program prints, and what you type into "
                           "it\n프로그램의 출력과, 프로그램에 입력하는 곳"));
  tabs_->setCurrentIndex(consoleIndex_);
}

void EduBottomPanel::setMessages(QWidget* messages) {
  messages_ = messages;
  if (messages_ == 0) {
    return;
  }
  messagesIndex_ = tabs_->addTab(messages_, "Messages");
  tabs_->setTabToolTip(messagesIndex_,
                       QString::fromUtf8(
                           "The simulator's own log: what was loaded, and any "
                           "error\n시뮬레이터의 기록. 무엇을 불러왔는지와 "
                           "오류 메시지"));
}

void EduBottomPanel::showConsole(bool withFocus) {
  if (isHidden()) {
    show();
  }
  raise();
  if (consoleIndex_ >= 0) {
    tabs_->setCurrentIndex(consoleIndex_);
  }
  if (withFocus && console_ != 0) {
    console_->setFocus(Qt::OtherFocusReason);
  }
}

void EduBottomPanel::showMessages(bool quietly) {
  if (messagesIndex_ < 0) {
    return;
  }
  if (quietly && tabs_->currentIndex() != messagesIndex_) {
    setUnread(true);
    return;
  }
  if (isHidden()) {
    show();
  }
  raise();
  tabs_->setCurrentIndex(messagesIndex_);
}

QString EduBottomPanel::currentTabName() const {
  return tabs_->tabText(tabs_->currentIndex());
}

bool EduBottomPanel::consoleIsCurrent() const {
  return consoleIndex_ >= 0 && tabs_->currentIndex() == consoleIndex_;
}

void EduBottomPanel::onCurrentChanged(int index) {
  if (index == messagesIndex_) {
    setUnread(false);
  }
}

void EduBottomPanel::setUnread(bool unread) {
  if (unread_ == unread || messagesIndex_ < 0) {
    return;
  }
  unread_ = unread;
  tabs_->setTabIcon(messagesIndex_, unread ? unreadDot() : QIcon());
}
