/* Hallym MIPS Simulator -- the first-run tour.

   An overlay over the main window.  Everything is dimmed except the thing
   the current step is about -- a panel, a group of tool bar buttons, two
   column headers, one cell -- and a card beside it says what that thing
   does and how it differs from the standard simulator.  Some steps also
   draw the tool tip of what they point at, so the reader sees it rather
   than being told about it.

   The overlay is a frameless window of its own, not a child of the main
   window.  A child would be a sibling of the dock widgets, and on Windows a
   dock that has been promoted to a native window covers every non-native
   sibling whatever Qt's stacking says -- which is why 1.0.0 showed the
   spotlight and the card but no dim at all, and lost the card entirely in
   the tabbed layout.  A top-level window is above all of that, on every
   platform.  It follows the main window's position and size, never takes
   the focus, and hides while the main window is minimised or inactive.

   Two rules the card obeys, both of which were broken in 1.0.0 on Windows
   (docs/ARCHITECTURE.md 12, 70):

     - it is always completely inside the window (edu/core/edu_tutorial_layout.h),
     - it is opaque: the dim is painted around it, never under it.

   Enter, Space and the right arrow move on, the left arrow goes back and
   Escape leaves, so the tour can be finished from the keyboard even if the
   card were ever unreachable.

   It runs once, after the splash, and again from Help > Tutorial.  The
   scripted capture mode never starts it by itself; --tutorial-step N opens
   it at one step for a screenshot. */

#ifndef EDU_TUTORIAL_H
#define EDU_TUTORIAL_H

#include <QList>
#include <QRect>
#include <QString>
#include <QStringList>
#include <QWidget>

#include "edu/core/edu_tutorial_layout.h"

class QLabel;
class QPushButton;
class QTimer;
class QFrame;
class SpimView;

class EduTutorial : public QWidget {
  Q_OBJECT

 public:
  // What a step is about.  The order is the order of the tour.
  enum StepId {
    Welcome,
    ToolbarFile,
    ToolbarAssemble,
    ToolbarRun,
    RegisterGroups,
    RegisterColumns,
    RegisterChanged,
    EditorPanel,
    ConsoleTab,
    MessagesTab,
    TextColumns,
    TextBadge,
    TextPcAndBreakpoints,
    InspectorBits,
    DataWords,
    DataLabels,
    DataString,
    DataStack,
    DataEnvironment,
    Finish
  };

  struct Step {
    StepId id;
    const char* sectionKo;
    const char* sectionEn;
    const char* titleKo;
    const char* bodyKo;
    const char* titleEn;
    const char* bodyEn;
  };

  explicit EduTutorial(SpimView* window);

  // Whether a program is loaded: the steps about instructions, labels and
  // the stack are left out when there is nothing to point at.
  void setProgramLoaded(bool loaded);

  // The card's text, for the harness.
  QString titleText() const;
  QString bodyText() const;

  // Between start() and finish(), whatever the window manager is doing.
  bool isRunning() const { return running_; }

  // The language the card is in.  The harness reads both, so it does not
  // depend on the locale the check happens to run under.
  void setKorean(bool korean);

  // Steps that were left out because what they point at was not on the
  // screen, by name.  Empty is the expected result with the example open.
  QStringList skippedSteps() const { return skipped_; }

  // Opens the tour at the given step (0-based, counted after the steps with
  // nothing to show were dropped).
  void start(int step = 0);

  int stepCount() const { return steps_.size(); }
  int currentStep() const { return current_; }  // 0-based

  // The card, in overlay coordinates.  The capture harness checks that it is
  // inside the window at every step and every window size.
  QRect cardRect() const;

  // "Registers/Eight groups by role", for the harness's report.
  QString stepName(int index) const;

  static bool systemIsKorean();

 signals:
  void closed();

 protected:
  void paintEvent(QPaintEvent* event);
  void keyPressEvent(QKeyEvent* event);
  void mousePressEvent(QMouseEvent* event);
  void resizeEvent(QResizeEvent* event);
  void closeEvent(QCloseEvent* event);
  bool eventFilter(QObject* watched, QEvent* event);

 private slots:
  void next();
  void back();
  void finish();
  void toggleLanguage();
  void reposition();
  void updateForActivation();  // another program came forward, or we did

 private:
  static const Step kStepData[];
  static const int kStepCount;

  void buildSteps();
  void showStep(int index);
  // Puts the program into the state the step talks about (raises a panel,
  // selects a row, scrolls something into view) and collects what to light
  // up.  False means the step has nothing to show and is skipped.
  bool collectSpots(StepId id, QList<QRect>* spots, QString* tip,
                    QRect* tipAnchor);
  QRect rectOf(QWidget* widget) const;  // in overlay coordinates

  // What the steps point at is found by label and by address, never by row
  // number: the example can be edited without silently moving a spotlight
  // onto the wrong thing.
  bool labelAddress(const char* name, quint32* address) const;
  int textRowOfAddress(quint32 address) const;
  int textRowOfMnemonic(const QString& mnemonic,
                        const QString& mentioning = QString()) const;
  QRect textCell(int row, int column) const;
  QRect textRowRect(int row, int firstColumn, int lastColumn) const;
  QRect dataCellAt(quint32 address) const;   // reveals it first
  QRect dataLabelCellAt(quint32 address) const;
  QRect registerRowRect(const char* name) const;
  QRect tabBarRect(const QString& title) const;  // the tab of that name
  bool dockIsOpen(const char* name) const;
  void raiseDock(const char* name) const;
  void placeCard();
  QRect tipBubbleRect() const;  // the drawn tool tip, or empty
  void followWindow();          // sit exactly over the main window
  bool handleTourKey(int key);  // the keys the tour answers to

  SpimView* window_;
  QList<Step> steps_;
  int current_;
  bool korean_;
  bool programLoaded_;
  bool running_;  // between start() and finish(), whatever is on screen
  QStringList skipped_;  // steps with nothing to point at, for the harness
  QString bodyPlain_;   // the body as text, for the harness and the tests
  QList<QRect> spots_;  // what is lit; the first one is what the arrow means
  QString tip_;         // a tool tip drawn next to tipAnchor_, or empty
  QRect tipAnchor_;
  QRect tipBubble_;  // where tipBubbleRect() put it, for the card to avoid
  edu::CardSide side_;

  QFrame* card_;
  QLabel* title_;
  QLabel* body_;
  QLabel* progress_;
  QPushButton* language_;
  QPushButton* skip_;
  QPushButton* back_;
  QPushButton* next_;
  QTimer* follow_;
};

#endif  // EDU_TUTORIAL_H
