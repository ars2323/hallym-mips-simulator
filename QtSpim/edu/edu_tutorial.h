/* Hallym MIPS Simulator -- the first-run tour.

   An overlay over the main window that dims everything except one panel,
   with a card beside it saying what that panel does and how it differs from
   the standard simulator.  Seven steps; a step whose panel the user has
   closed is left out and the rest are renumbered.

   It runs once, after the splash has closed and the window is up, and can
   be started again from Help > Tutorial.  The scripted capture mode never
   starts it by itself; --tutorial-step N opens it at one step so that the
   spotlight and the card can be reviewed in a screenshot. */

#ifndef EDU_TUTORIAL_H
#define EDU_TUTORIAL_H

#include <QList>
#include <QRect>
#include <QString>
#include <QWidget>

class QLabel;
class QPushButton;
class QTimer;
class QFrame;

class EduTutorial : public QWidget {
  Q_OBJECT

 public:
  // The overlay lives on top of the main window and follows its size.
  explicit EduTutorial(QWidget* mainWindow);

  // Opens the tour at the given step (1-based, 0 = the first one).  Steps
  // whose panel is closed are dropped first, so the number is an index into
  // what is actually shown.
  void start(int step = 0);

  // How many steps this run has, after the closed panels were dropped.
  int stepCount() const { return steps_.size(); }

  // True while the user has Korean as their system language.
  static bool systemIsKorean();

 signals:
  void closed();

 protected:
  void paintEvent(QPaintEvent* event);
  void keyPressEvent(QKeyEvent* event);
  void mousePressEvent(QMouseEvent* event);
  void resizeEvent(QResizeEvent* event);
  bool eventFilter(QObject* watched, QEvent* event);

 private slots:
  void next();
  void back();
  void finish();
  void toggleLanguage();
  void reposition();

 private:
  struct Step {
    const char* target;  // object name of the dock, or "" for the centre
    const char* titleKo;
    const char* bodyKo;
    const char* titleEn;
    const char* bodyEn;
  };

  void buildSteps();
  void showStep(int index);
  QWidget* targetWidget(const Step& step) const;
  QRect spotlightRect() const;
  void placeCard(const QRect& spot);

  QWidget* window_;
  QList<Step> steps_;
  int current_;
  bool korean_;
  QRect spot_;       // in overlay coordinates; empty for a centred step
  QRect arrowFrom_;  // the card's edge the arrow leaves from

  QFrame* card_;
  QLabel* title_;
  QLabel* body_;
  QLabel* progress_;
  QPushButton* language_;
  QPushButton* skip_;
  QPushButton* back_;
  QPushButton* next_;
  QTimer* follow_;  // panels can be dragged while the tour is up
};

#endif  // EDU_TUTORIAL_H
