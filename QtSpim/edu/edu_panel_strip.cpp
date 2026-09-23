/* See edu_panel_strip.h. */

#include "edu/edu_panel_strip.h"

#include <QDockWidget>
#include <QHBoxLayout>
#include <QFontMetrics>
#include <QTabBar>
#include <QToolButton>

#include "edu/theme/tokens.h"

namespace {

// A tab as wide as its name.  QTabBar asks the style for a tab's width,
// and with a style sheet in force the answer came up a few pixels short
// of a long name such as "Instruction Inspector", which then lost its
// first and last letters (DD).
class StripTabBar : public QTabBar {
 public:
  explicit StripTabBar(QWidget* parent) : QTabBar(parent) {}

 protected:
  QSize tabSizeHint(int index) const {
    QSize size = QTabBar::tabSizeHint(index);
    const QFontMetrics metrics(font());
    size.setWidth(qMax(size.width(),
                       metrics.horizontalAdvance(tabText(index)) +
                           edu::theme::kTabTextPadding));
    return size;
  }
};

}  // namespace

QToolButton* EduPanelStrip::makeCloseButton(QWidget* parent) {
  QToolButton* close = new QToolButton(parent);
  close->setObjectName("EduPanelClose");
  close->setText(QString(QChar(0x2715)));  // the same mark as before
  close->setCursor(Qt::ArrowCursor);
  close->setFocusPolicy(Qt::NoFocus);
  close->setToolTip(QString::fromUtf8(
      "Close this panel; the Window menu brings it back\n"
      "이 패널을 닫습니다. Window 메뉴에서 다시 켤 수 있습니다"));
  close->setFixedSize(edu::theme::kPanelCloseSize, edu::theme::kPanelCloseSize);
  return close;
}

EduPanelStrip::EduPanelStrip(QDockWidget* dock)
    : QWidget(dock), dock_(dock), tabs_(new StripTabBar(this)) {
  setObjectName("EduPanelStrip");
  tabs_->setObjectName("EduPanelStripTabs");
  tabs_->setDocumentMode(true);
  tabs_->setExpanding(false);
  tabs_->setDrawBase(false);
  tabs_->setFocusPolicy(Qt::NoFocus);
  tabs_->addTab(dock->windowTitle());

  QToolButton* close = makeCloseButton(this);
  connect(close, SIGNAL(clicked()), dock, SLOT(close()));

  QHBoxLayout* layout = new QHBoxLayout(this);
  layout->setContentsMargins(0, 0, edu::theme::kSpace1, 0);
  layout->setSpacing(0);
  layout->addWidget(tabs_);
  layout->addStretch(1);
  layout->addWidget(close);

  connect(dock, SIGNAL(windowTitleChanged(QString)), this, SLOT(followTitle()));
  fitTab();
}

void EduPanelStrip::followTitle() {
  if (tabs_->count() > 0 && tabs_->tabText(0) != dock_->windowTitle()) {
    tabs_->setTabText(0, dock_->windowTitle());
  }
  fitTab();
}

void EduPanelStrip::fitTab() {
  tabs_->updateGeometry();  // the tab's width comes from StripTabBar above
}
