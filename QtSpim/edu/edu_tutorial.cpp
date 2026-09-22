/* See edu_tutorial.h. */

#include "edu/edu_tutorial.h"

#include <QAbstractButton>
#include <QApplication>
#include <QAction>
#include <QDockWidget>
#include <QEvent>
#include <QFrame>
#include <QHBoxLayout>
#include <QKeyEvent>
#include <QLabel>
#include <QLocale>
#include <QPainter>
#include <QPainterPath>
#include <QPushButton>
#include <QResizeEvent>
#include <QTimer>
#include <QVBoxLayout>

#include "edu/theme/edu_theme.h"
#include "edu/theme/tokens.h"

namespace {

using namespace edu::theme;

const int kCardWidth = 360;
const int kMargin = 16;
const int kArrow = 10;
const int kDim = 115;  // black at 45 %

// The tour.  Each step names the dock it shines a light on; an empty name
// puts the card in the middle of the window with no spotlight.
const struct EduTutorialStepData {
  const char* target;
  const char* titleKo;
  const char* bodyKo;
  const char* titleEn;
  const char* bodyEn;
} kSteps[] = {
    {"",
     "한림 MIPS 시뮬레이터에 오신 것을 환영합니다",
     "표준 QtSpim과 시뮬레이션 결과는 같고, 화면과 편집 기능이 다릅니다. "
     "7단계로 바뀐 점을 보여 드립니다.",
     "Welcome to Hallym MIPS Simulator",
     "Programs assemble and run exactly as in the standard QtSpim; what "
     "changed is the screen and the editing. Seven steps show you what is "
     "different."},
    {"IntRegDockWidget",
     "레지스터 패널",
     "레지스터를 용도별 8개 그룹으로 묶었습니다. 실행으로 값이 바뀐 "
     "레지스터는 청록색으로 강조되고, 16진수와 10진수를 나란히 보여 줍니다.",
     "Registers",
     "The registers are grouped by role into eight groups. Whatever the run "
     "changed is picked out in teal, and hexadecimal and decimal are side by "
     "side."},
    {"InspectorDockWidget",
     "인스펙터",
     "레지스터나 명령어, 메모리 워드를 고르면 여기에 2진수와 기계어 필드 "
     "분해가 나옵니다. 표준 QtSpim에는 없는 기능입니다.",
     "Inspector",
     "Select a register, an instruction or a memory word and its bits and "
     "instruction fields appear here. The standard QtSpim has nothing like "
     "it."},
    {"TextSegDockWidget",
     "Text 패널",
     "주소·기계어 16진수·타입 배지(R/I/J)·명령어·소스 줄이 열로 나뉘어 "
     "있습니다. 명령어를 클릭하면 인스펙터에 필드 분해가 나오고, 커널 "
     "세그먼트는 접혀 있습니다.",
     "Text panel",
     "Address, machine word, a type badge (R / I / J), the instruction and "
     "the source line, in columns. Click an instruction and the inspector "
     "breaks its word into fields; the kernel segment stays folded."},
    {"EditorDockWidget",
     "에디터",
     "외부 편집기가 필요 없습니다. Ctrl+S가 저장과 어셈블을 함께 하고, "
     "어셈블 에러는 아래 목록에 뜹니다. 목록의 줄을 클릭하면 그 줄로 "
     "이동합니다.",
     "Editor",
     "No external editor needed. Ctrl+S saves and assembles in one step, and "
     "assembler errors appear in a list below; click one to jump to its "
     "line."},
    {"DataSegDockWidget",
     "Data 패널",
     "주소 열이 고정된 표입니다. `.data`의 라벨을 해당 주소에 보여 주고, "
     "$sp·$fp·$gp가 가리키는 워드에 표시가 붙습니다. 스택 위쪽 환경변수 "
     "영역은 접혀 있습니다.",
     "Data panel",
     "A table with a fixed address column. The labels of `.data` sit on "
     "their addresses, the words $sp, $fp and $gp point at are marked, and "
     "the environment area at the top of the stack is folded away."},
    {"",
     "준비되었습니다",
     "Window > Layout으로 에디터와 Text를 나란히 놓을 수 있고, "
     "Help > User Guide에 안내문이 있습니다. 이 투어는 Help > Tutorial로 "
     "언제든 다시 볼 수 있습니다.",
     "You are ready",
     "Window > Layout puts the editor and the text panel side by side, and "
     "Help > User Guide has the written guide. You can see this tour again "
     "at any time from Help > Tutorial."},
};

QString hex(QRgb rgb) { return QColor(rgb).name(QColor::HexRgb); }

}  // namespace

bool EduTutorial::systemIsKorean() {
  return QLocale::system().language() == QLocale::Korean;
}

EduTutorial::EduTutorial(QWidget* mainWindow)
    : QWidget(mainWindow),
      window_(mainWindow),
      current_(0),
      korean_(systemIsKorean()),
      card_(new QFrame(this)),
      title_(new QLabel(card_)),
      body_(new QLabel(card_)),
      progress_(new QLabel(card_)),
      language_(new QPushButton(card_)),
      skip_(new QPushButton(card_)),
      back_(new QPushButton(card_)),
      next_(new QPushButton(card_)),
      follow_(new QTimer(this)) {
  setObjectName("EduTutorial");
  setFocusPolicy(Qt::StrongFocus);
  hide();

  card_->setObjectName("EduTutorialCard");
  card_->setFixedWidth(kCardWidth);
  title_->setObjectName("EduTutorialTitle");
  title_->setWordWrap(true);
  body_->setObjectName("EduTutorialBody");
  body_->setWordWrap(true);
  progress_->setObjectName("EduTutorialProgress");
  language_->setObjectName("EduTutorialLanguage");
  language_->setFlat(true);
  language_->setCursor(Qt::PointingHandCursor);
  skip_->setObjectName("EduTutorialSkip");
  back_->setObjectName("EduTutorialBack");
  next_->setObjectName("EduTutorialNext");
  next_->setDefault(true);
  QAbstractButton* const buttons[] = {language_, skip_, back_, next_};
  for (unsigned i = 0; i < sizeof(buttons) / sizeof(buttons[0]); i += 1) {
    buttons[i]->setFocusPolicy(Qt::NoFocus);
  }

  QFont titleFont = uiFont();
  titleFont.setPixelSize(kTitlePixelSize);
  titleFont.setWeight(QFont::DemiBold);
  title_->setFont(titleFont);
  QFont bodyFont = uiFont();
  bodyFont.setPixelSize(kUiPixelSize);
  body_->setFont(bodyFont);
  QFont smallFont = uiFont();
  smallFont.setPixelSize(kFontSmall);
  progress_->setFont(smallFont);
  language_->setFont(smallFont);

  // The card is the only lit thing on the overlay, so it carries its own
  // colours rather than the window's (theme/light.qss cannot reach a
  // widget that is drawn over everything).
  card_->setStyleSheet(
      QString("QFrame#EduTutorialCard { background: %1; border: 1px solid %2;"
              " border-radius: 8px; }"
              "QLabel#EduTutorialTitle { color: %3; }"
              "QLabel#EduTutorialBody { color: %4; }"
              "QLabel#EduTutorialProgress { color: %5; }"
              "QPushButton#EduTutorialLanguage { color: %5; border: none;"
              " padding: 2px 4px; background: transparent; }"
              "QPushButton#EduTutorialLanguage:hover { color: %3; }"
              "QPushButton { background: %1; color: %3; border: 1px solid %2;"
              " border-radius: 4px; padding: 5px 14px; font-weight: 600; }"
              "QPushButton:hover { background: %6; }"
              "QPushButton#EduTutorialNext { background: %7; color: %1;"
              " border-color: %7; }"
              "QPushButton#EduTutorialNext:hover { background: %3;"
              " border-color: %3; }")
          .arg(hex(kWhite), hex(kBorder), hex(kNavy), hex(kText), hex(kText2),
               hex(kHover), hex(kBlue)));

  QHBoxLayout* head = new QHBoxLayout;
  head->setContentsMargins(0, 0, 0, 0);
  head->setSpacing(kSpace2);
  head->addWidget(title_, 1);
  head->addWidget(language_, 0, Qt::AlignTop);

  QHBoxLayout* foot = new QHBoxLayout;
  foot->setContentsMargins(0, 0, 0, 0);
  foot->setSpacing(kSpace2);
  foot->addWidget(progress_);
  foot->addStretch(1);
  foot->addWidget(skip_);
  foot->addWidget(back_);
  foot->addWidget(next_);

  QVBoxLayout* layout = new QVBoxLayout(card_);
  layout->setContentsMargins(kSpace4, kSpace4, kSpace4, kSpace4);
  layout->setSpacing(kSpace3);
  layout->addLayout(head);
  layout->addWidget(body_);
  layout->addLayout(foot);

  connect(skip_, SIGNAL(clicked()), this, SLOT(finish()));
  connect(back_, SIGNAL(clicked()), this, SLOT(back()));
  connect(next_, SIGNAL(clicked()), this, SLOT(next()));
  connect(language_, SIGNAL(clicked()), this, SLOT(toggleLanguage()));

  // A panel can be dragged or a tab raised while the tour is up.
  connect(follow_, SIGNAL(timeout()), this, SLOT(reposition()));
  window_->installEventFilter(this);
}

void EduTutorial::buildSteps() {
  steps_.clear();
  for (unsigned i = 0; i < sizeof(kSteps) / sizeof(kSteps[0]); i += 1) {
    Step step;
    step.target = kSteps[i].target;
    step.titleKo = kSteps[i].titleKo;
    step.bodyKo = kSteps[i].bodyKo;
    step.titleEn = kSteps[i].titleEn;
    step.bodyEn = kSteps[i].bodyEn;
    if (step.target[0] != '\0') {
      QDockWidget* dock = window_->findChild<QDockWidget*>(step.target);
      // A panel the user has closed is left out; one that is merely behind
      // another tab is brought to the front when its step comes up.
      if (dock == 0 || (dock->toggleViewAction() != 0 &&
                        !dock->toggleViewAction()->isChecked())) {
        continue;
      }
    }
    steps_ << step;
  }
}

QWidget* EduTutorial::targetWidget(const Step& step) const {
  if (step.target[0] == '\0') {
    return 0;
  }
  return window_->findChild<QDockWidget*>(step.target);
}

void EduTutorial::start(int step) {
  buildSteps();
  if (steps_.isEmpty()) {
    return;
  }
  setGeometry(window_->rect());
  show();
  raise();
  setFocus();
  follow_->start(250);
  showStep(qBound(0, step, steps_.size() - 1));
}

void EduTutorial::showStep(int index) {
  current_ = qBound(0, index, steps_.size() - 1);
  const Step& step = steps_.at(current_);

  QDockWidget* dock = qobject_cast<QDockWidget*>(targetWidget(step));
  if (dock != 0 && (!dock->isVisible() || dock->visibleRegion().isEmpty())) {
    // It is open, but another tab of its group is in front.  Qt parks a
    // tab that is not current off-screen, so its geometry is only right
    // once the raise has been through the event loop.
    dock->show();  // raise() alone does not make a parked tab the current one
    dock->raise();
    QApplication::processEvents(QEventLoop::ExcludeUserInputEvents);
    QTimer::singleShot(0, this, SLOT(reposition()));
  }

  title_->setText(korean_ ? QString::fromUtf8(step.titleKo)
                          : QString::fromUtf8(step.titleEn));
  body_->setText(korean_ ? QString::fromUtf8(step.bodyKo)
                         : QString::fromUtf8(step.bodyEn));
  progress_->setText(
      QString("%1 / %2").arg(current_ + 1).arg(steps_.size()));
  language_->setText(korean_ ? "EN" : QString::fromUtf8("\355\225\234\352\265\255\354\226\264"));
  skip_->setText(korean_ ? QString::fromUtf8("\352\261\264\353\204\210\353\233\260\352\270\260")
                         : QString("Skip"));
  back_->setText(korean_ ? QString::fromUtf8("\354\235\264\354\240\204") : QString("Back"));
  const bool last = current_ == steps_.size() - 1;
  if (last) {
    next_->setText(korean_ ? QString::fromUtf8("\354\213\234\354\236\221\355\225\230\352\270\260")
                           : QString("Get started"));
  } else {
    next_->setText(korean_ ? QString::fromUtf8("\353\213\244\354\235\214") : QString("Next"));
  }
  back_->setEnabled(current_ > 0);
  skip_->setVisible(!last);

  reposition();
}

QRect EduTutorial::spotlightRect() const {
  if (steps_.isEmpty()) {
    return QRect();
  }
  QWidget* target = targetWidget(steps_.at(current_));
  if (target == 0) {
    return QRect();
  }
  // Grow first, then clip: an empty rectangle grown by two pixels would be
  // a four-pixel box in the corner, which is not a panel.
  const QRect inWindow(target->mapTo(window_, QPoint(0, 0)), target->size());
  const QRect spot = inWindow.adjusted(-2, -2, 2, 2).intersected(rect());
  if (spot.width() < 48 || spot.height() < 48) {
    return QRect();  // closed, behind another tab, or off the window
  }
  return spot;
}

void EduTutorial::placeCard(const QRect& spot) {
  // The card's width is fixed, so the wrapped labels decide its height.
  // QLabel::sizeHint() does not know that width yet; ask it directly.
  const int inner = kCardWidth - 2 * kSpace4;
  title_->setFixedHeight(title_->heightForWidth(inner - language_->sizeHint().width() -
                                                kSpace2));
  body_->setFixedHeight(body_->heightForWidth(inner));
  card_->layout()->activate();
  card_->adjustSize();
  const QSize size = card_->size();
  const QRect area = rect().adjusted(kMargin, kMargin, -kMargin, -kMargin);
  arrowFrom_ = QRect();

  if (spot.isEmpty()) {
    card_->move(area.center() - QPoint(size.width() / 2, size.height() / 2));
    return;
  }

  // Beside the panel if there is room, otherwise under or over it.
  const int gap = kSpace3 + kArrow;
  QList<QPoint> places;
  places << QPoint(spot.right() + gap, spot.center().y() - size.height() / 2)
         << QPoint(spot.left() - gap - size.width(),
                   spot.center().y() - size.height() / 2)
         << QPoint(spot.center().x() - size.width() / 2, spot.bottom() + gap)
         << QPoint(spot.center().x() - size.width() / 2,
                   spot.top() - gap - size.height());
  for (int i = 0; i < places.size(); i += 1) {
    QRect candidate(places.at(i), size);
    if (area.contains(candidate)) {
      card_->move(candidate.topLeft());
      arrowFrom_ = candidate;
      return;
    }
  }
  // Nothing fits cleanly: keep it inside the window, next to the panel.
  QRect fallback(places.at(0), size);
  fallback.moveLeft(qBound(area.left(), fallback.left(), area.right() - size.width()));
  fallback.moveTop(qBound(area.top(), fallback.top(), area.bottom() - size.height()));
  card_->move(fallback.topLeft());
  arrowFrom_ = fallback;
}

void EduTutorial::reposition() {
  if (!isVisible()) {
    return;
  }
  if (size() != window_->size()) {
    setGeometry(window_->rect());
  }
  const QRect spot = spotlightRect();
  if (spot != spot_) {
    spot_ = spot;
  }
  placeCard(spot_);
  update();
}

void EduTutorial::paintEvent(QPaintEvent*) {
  QPainter painter(this);
  painter.setRenderHint(QPainter::Antialiasing);

  QPainterPath dim;
  dim.addRect(rect());
  if (!spot_.isEmpty()) {
    QPainterPath hole;
    hole.addRoundedRect(spot_, 6, 6);
    dim = dim.subtracted(hole);
  }
  painter.fillPath(dim, QColor(0, 0, 0, kDim));

  if (!spot_.isEmpty()) {
    painter.setPen(QPen(QColor(kBlue), 2));
    painter.setBrush(Qt::NoBrush);
    painter.drawRoundedRect(QRectF(spot_).adjusted(1, 1, -1, -1), 6, 6);

    // An arrow from the card towards the panel.
    if (!arrowFrom_.isEmpty()) {
      const QPoint from = arrowFrom_.center();
      const QPoint to = spot_.center();
      QPolygonF head;
      if (arrowFrom_.left() > spot_.right()) {
        const int y = qBound(arrowFrom_.top() + 12, to.y(), arrowFrom_.bottom() - 12);
        head << QPointF(arrowFrom_.left(), y - kArrow)
             << QPointF(arrowFrom_.left() - kArrow, y)
             << QPointF(arrowFrom_.left(), y + kArrow);
      } else if (arrowFrom_.right() < spot_.left()) {
        const int y = qBound(arrowFrom_.top() + 12, to.y(), arrowFrom_.bottom() - 12);
        head << QPointF(arrowFrom_.right(), y - kArrow)
             << QPointF(arrowFrom_.right() + kArrow, y)
             << QPointF(arrowFrom_.right(), y + kArrow);
      } else if (arrowFrom_.top() > spot_.bottom()) {
        const int x = qBound(arrowFrom_.left() + 12, to.x(), arrowFrom_.right() - 12);
        head << QPointF(x - kArrow, arrowFrom_.top())
             << QPointF(x, arrowFrom_.top() - kArrow)
             << QPointF(x + kArrow, arrowFrom_.top());
      } else if (arrowFrom_.bottom() < spot_.top()) {
        const int x = qBound(arrowFrom_.left() + 12, to.x(), arrowFrom_.right() - 12);
        head << QPointF(x - kArrow, arrowFrom_.bottom())
             << QPointF(x, arrowFrom_.bottom() + kArrow)
             << QPointF(x + kArrow, arrowFrom_.bottom());
      }
      if (!head.isEmpty()) {
        painter.setPen(QPen(QColor(kBorder), 1));
        painter.setBrush(QColor(kWhite));
        painter.drawPolygon(head);
      }
      (void)from;
    }
  }
}

void EduTutorial::keyPressEvent(QKeyEvent* event) {
  switch (event->key()) {
    case Qt::Key_Escape:
      finish();
      return;
    case Qt::Key_Right:
    case Qt::Key_Return:
    case Qt::Key_Enter:
      next();
      return;
    case Qt::Key_Left:
      back();
      return;
    default:
      QWidget::keyPressEvent(event);
  }
}

// Clicks anywhere but on the card do nothing: the tour is left through its
// own buttons or Escape, never by a stray click.
void EduTutorial::mousePressEvent(QMouseEvent*) {}

void EduTutorial::resizeEvent(QResizeEvent* event) {
  QWidget::resizeEvent(event);
  reposition();
}

bool EduTutorial::eventFilter(QObject* watched, QEvent* event) {
  if (watched == window_ && isVisible() &&
      (event->type() == QEvent::Resize || event->type() == QEvent::Move)) {
    reposition();
  }
  return QWidget::eventFilter(watched, event);
}

void EduTutorial::next() {
  if (current_ + 1 >= steps_.size()) {
    finish();
    return;
  }
  showStep(current_ + 1);
}

void EduTutorial::back() {
  if (current_ > 0) {
    showStep(current_ - 1);
  }
}

void EduTutorial::toggleLanguage() {
  korean_ = !korean_;
  showStep(current_);
}

void EduTutorial::finish() {
  follow_->stop();
  hide();
  emit closed();
}
