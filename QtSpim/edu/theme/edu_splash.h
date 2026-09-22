/* Hallym MIPS Simulator -- the start-up screen.

   A frameless white card in the middle of the screen: the university
   signature, the product name and version, the lab, and an indeterminate
   progress bar along the bottom edge.  It closes itself after
   kSplashMillis, or at once when it is clicked, and emits finished() either
   way.  main() shows the main window on that signal, so nothing of the
   program appears behind the splash.

   Not shown in the scripted capture mode (edu/edu_devtools.h): a screenshot
   run must not wait for it.  --capture splash grabs one instead. */

#ifndef EDU_SPLASH_H
#define EDU_SPLASH_H

#include <QWidget>

class QTimer;

namespace edu {
namespace theme {

class EduSplash : public QWidget {
  Q_OBJECT

 public:
  explicit EduSplash(QWidget* parent = 0);

  // Centres the card on the screen the cursor is on and shows it.
  void showCentred();

 signals:
  void finished();

 protected:
  void paintEvent(QPaintEvent* event);
  void mousePressEvent(QMouseEvent* event);
  void keyPressEvent(QKeyEvent* event);
  void closeEvent(QCloseEvent* event);

 private slots:
  void animate();
  void expire();

 private:
  QTimer* animation_;
  int phase_;        // 0..kPhaseSteps, position of the progress segment
  bool finished_;    // finished() is emitted once
};

}  // namespace theme
}  // namespace edu

#endif  // EDU_SPLASH_H
