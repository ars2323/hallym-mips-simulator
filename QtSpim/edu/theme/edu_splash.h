/* Hallym MIPS Simulator -- the start-up screen.

   A frameless white card in the middle of the screen: the university
   signature, the product name and version, the lab, and two buttons --
   take the tutorial, or go straight to work.  It asks every time the program
   starts, because a lab machine has a different student in front of it
   every hour and a setting remembered from the last one would hide the
   tutorial from the next.  Nothing closes it but a choice.

   Not shown in the scripted capture mode (edu/edu_devtools.h): a screenshot
   run must not wait for it.  --capture splash grabs one instead. */

#ifndef EDU_SPLASH_H
#define EDU_SPLASH_H

#include <QWidget>

class QPushButton;

namespace edu {
namespace theme {

class EduSplash : public QWidget {
  Q_OBJECT

 public:
  explicit EduSplash(QWidget* parent = 0);

  // Centres the card on the screen the cursor is on and shows it.
  void showCentred();

 signals:
  // True when the student asked for the tutorial.  main() brings the window up
  // on this signal, so nothing of the program appears behind the card.
  void finished(bool withTutorial);

 protected:
  void paintEvent(QPaintEvent* event);
  void mousePressEvent(QMouseEvent* event);
  void keyPressEvent(QKeyEvent* event);
  void closeEvent(QCloseEvent* event);

 private slots:
  void chooseTutorial();
  void chooseStraightToWork();

 private:
  void finish(bool withTutorial);

  QPushButton* tutorial_;
  QPushButton* straight_;
  bool finished_;    // finished() is emitted once
};

}  // namespace theme
}  // namespace edu

#endif  // EDU_SPLASH_H
