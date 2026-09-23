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
    : QObject(parent), panel_(panel), key_(settingsKey), points_(0), base_(0) {
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

void EduPanelZoom::setBasePointSize(int points) {
  base_ = points;
  if (points_ == 0) {
    points_ = points;
  }
}

void EduPanelZoom::setPointSize(int points) {
  const int wanted = qBound(int(kMinPointSize), points, int(kMaxPointSize));
  if (wanted == points_) {
    return;  // at the end of the range: nothing happens, quietly
  }
  points_ = wanted;
  emit pointSizeChanged(points_);
}

void EduPanelZoom::zoomIn() { setPointSize(points_ + 1); }

void EduPanelZoom::zoomOut() { setPointSize(points_ - 1); }

void EduPanelZoom::resetZoom() { setPointSize(base_); }

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
