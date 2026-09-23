/* See edu_panel_zoom.h. */

#include "edu/edu_panel_zoom.h"

#include <QAction>
#include <QEvent>
#include <QMenu>
#include <QShortcut>
#include <QWheelEvent>
#include <QWidget>

#include "edu/edu_version.h"

EduPanelZoom::EduPanelZoom(QWidget* panel, const QString& settingsKey,
                           QObject* parent)
    : QObject(parent), panel_(panel), key_(settingsKey), base_(0), offset_(0) {
  if (panel_ == 0) {
    return;
  }
  panel_->installEventFilter(this);  // Ctrl+wheel

  // The shortcuts belong to the panel: Ctrl+0 in the register panel is not
  // the editor's Ctrl+0, and neither is the other way round.
  struct {
    const char* keys;
    const char* slot;
  } const shortcuts[] = {{"Ctrl+=", SLOT(zoomIn())},
                         {"Ctrl++", SLOT(zoomIn())},
                         {"Ctrl+-", SLOT(zoomOut())},
                         {"Ctrl+0", SLOT(resetZoom())}};
  for (unsigned i = 0; i < sizeof(shortcuts) / sizeof(shortcuts[0]); i += 1) {
    QShortcut* shortcut =
        new QShortcut(QKeySequence(shortcuts[i].keys), panel_);
    shortcut->setContext(Qt::WidgetWithChildrenShortcut);
    connect(shortcut, SIGNAL(activated()), this, shortcuts[i].slot);
  }
}

int EduPanelZoom::pointSize() const {
  return qBound(int(kMinPointSize), base_ + offset_, int(kMaxPointSize));
}

// The size chosen in Settings.  The offset the keys made is kept, so that
// a student who has zoomed in and then changes the base stays zoomed in.
void EduPanelZoom::setBasePointSize(int points) {
  const int was = pointSize();
  base_ = points;
  if (pointSize() != was) {
    emit pointSizeChanged(pointSize());
  }
}

void EduPanelZoom::setOffset(int points) {
  const int was = pointSize();
  offset_ = points;
  if (pointSize() != was) {
    emit pointSizeChanged(pointSize());
  }
}

void EduPanelZoom::setPointSize(int points) {
  setOffset(qBound(int(kMinPointSize), points, int(kMaxPointSize)) - base_);
}

void EduPanelZoom::zoomIn() { setPointSize(pointSize() + 1); }

void EduPanelZoom::zoomOut() { setPointSize(pointSize() - 1); }

// Back to the size Settings chose, not to a size of its own.
void EduPanelZoom::resetZoom() { setOffset(0); }

void EduPanelZoom::addMenuActions(QMenu* menu) {
  if (menu == 0) {
    return;
  }
  menu->addSeparator();
  QAction* in = menu->addAction("Zoom In");
  in->setShortcut(QKeySequence("Ctrl+="));
  connect(in, SIGNAL(triggered(bool)), this, SLOT(zoomIn()));
  QAction* out = menu->addAction("Zoom Out");
  out->setShortcut(QKeySequence("Ctrl+-"));
  connect(out, SIGNAL(triggered(bool)), this, SLOT(zoomOut()));
  QAction* reset = menu->addAction("Reset Zoom");
  reset->setShortcut(QKeySequence("Ctrl+0"));
  connect(reset, SIGNAL(triggered(bool)), this, SLOT(resetZoom()));
}

bool EduPanelZoom::eventFilter(QObject* watched, QEvent* event) {
  if (event->type() == QEvent::Wheel) {
    QWheelEvent* wheel = static_cast<QWheelEvent*>(event);
    if (wheel->modifiers() & Qt::ControlModifier) {
      const int steps = wheel->angleDelta().y();
      if (steps > 0) {
        zoomIn();
      } else if (steps < 0) {
        zoomOut();
      }
      return true;  // the panel must not scroll as well
    }
  }
  return QObject::eventFilter(watched, event);
}
