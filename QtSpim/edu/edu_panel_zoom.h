/* Hallym MIPS Simulator -- text size for one panel.

   The editor has had Ctrl+= / Ctrl+- / Ctrl+0 and Ctrl+wheel since 1.0.1.
   The other panels are read for just as long -- the machine code, the
   memory, the bits of an instruction, what the program printed -- and a
   projector or a small laptop asks the same question of all of them.

   One of these objects looks after one panel: it answers the shortcuts
   while the focus is inside that panel, answers Ctrl+wheel over it, adds
   Zoom In / Zoom Out / Reset Zoom to its context menu, and remembers the
   size under its own settings key.  What the size *means* is the panel's
   business: this only says the number, through pointSizeChanged().
*/

#ifndef EDU_PANEL_ZOOM_H
#define EDU_PANEL_ZOOM_H

#include <QObject>
#include <QString>

class QMenu;
class QWidget;

class EduPanelZoom : public QObject {
  Q_OBJECT

 public:
  enum { kMinPointSize = 8, kMaxPointSize = 32 };

  // `panel` is the widget the wheel and the shortcuts belong to (the view
  // itself, not its dock).  `settingsKey` is where the size is kept, for
  // example "Text/FontPointSize".
  EduPanelZoom(QWidget* panel, const QString& settingsKey, QObject* parent);

  // The size on screen: the base chosen in Settings plus what the keys
  // have added (GG).  The base is kept in the settings file; the offset
  // is this run's and starts at zero again at the next one.
  int pointSize() const;
  // Silently clamped to the range; nothing happens at the ends.
  void setPointSize(int points);
  void setBasePointSize(int points);
  int basePointSize() const { return base_; }
  int offset() const { return offset_; }
  void setOffset(int points);

  void addMenuActions(QMenu* menu);
  QString settingsKey() const { return key_; }

 signals:
  void pointSizeChanged(int points);

 public slots:
  void zoomIn();
  void zoomOut();
  void resetZoom();

 protected:
  bool eventFilter(QObject* watched, QEvent* event);

 private:
  QWidget* panel_;
  QString key_;
  int base_;
  int offset_;
};

#endif  // EDU_PANEL_ZOOM_H
