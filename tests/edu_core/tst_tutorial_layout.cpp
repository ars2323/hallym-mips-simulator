/* edu/core/edu_tutorial_layout: the tour's card must always be inside the
   window.  In 1.0.0 it could land outside on Windows, where the card's size
   differs from the one measured here, and the tour was then stuck because
   its buttons could not be reached (docs/ARCHITECTURE.md 12, 70). */

#include <QtTest>

#include "edu/core/edu_tutorial_layout.h"
#include "edu_test.h"

class TestTutorialLayout : public QObject {
  Q_OBJECT

 private slots:
  void insideEveryWindowSize_data();
  void insideEveryWindowSize();
  void besideThePanelWhenThereIsRoom();
  void panelAtTheRightEdgeGetsTheCardOnItsLeft();
  void panelFillingTheWindowCentresTheCard();
  void noPanelCentresTheCard();
  void cardLargerThanTheWindowStaysReachable();
};

namespace {

const int kMargin = 16;
const int kGap = 22;

// What the card asks for.  The width is fixed by the design; the height
// varies with the text and the platform's font, so the range is generous.
const QSize kCards[] = {QSize(360, 150), QSize(360, 190), QSize(360, 240),
                        QSize(360, 300)};

// The panels, as they sit in a window of the given size: the register column
// on the left, the editor in the middle, the text and data panels on the
// right, plus two awkward ones.
QList<QRect> panelsFor(const QSize& window) {
  const int w = window.width();
  const int h = window.height();
  QList<QRect> panels;
  panels << QRect(0, 83, 380, h - 200)                    // registers, left edge
         << QRect(0, h - 170, 380, 170)                   // inspector, bottom left
         << QRect(388, 83, w / 2 - 100, h - 330)          // editor, middle
         << QRect(w / 2 + 300, 83, w - (w / 2 + 300), h - 330)  // text, right edge
         << QRect(w / 2 + 300, 83, w - (w / 2 + 300), h - 330)  // data, same place
         << QRect(0, 0, w, h)                             // a panel filling the window
         << QRect(w - 40, h - 40, 40, 40);                // a sliver in the corner
  return panels;
}

}  // namespace

void TestTutorialLayout::insideEveryWindowSize_data() {
  QTest::addColumn<QSize>("window");
  QTest::newRow("1366x768") << QSize(1366, 768);
  QTest::newRow("1600x900") << QSize(1600, 900);
  QTest::newRow("1920x1080") << QSize(1920, 1080);
  QTest::newRow("2000x1080 maximised") << QSize(2000, 1080);
  QTest::newRow("1280x720") << QSize(1280, 720);
}

void TestTutorialLayout::insideEveryWindowSize() {
  QFETCH(QSize, window);
  const QRect overlay(QPoint(0, 0), window);
  const QRect area = overlay.adjusted(kMargin, kMargin, -kMargin, -kMargin);

  const QList<QRect> panels = panelsFor(window);
  for (int c = 0; c < int(sizeof(kCards) / sizeof(kCards[0])); c += 1) {
    const QSize card = kCards[c];
    // The step with no panel at all, and then every panel.
    QList<QRect> spots = panels;
    spots.prepend(QRect());
    for (int p = 0; p < spots.size(); p += 1) {
      const edu::CardPlacement placed =
          edu::placeTutorialCard(overlay, spots.at(p), card, kMargin, kGap);
      const QString what = QString("card %1x%2, panel %3")
                               .arg(card.width())
                               .arg(card.height())
                               .arg(p);
      QVERIFY2(placed.rect.size() == card, qPrintable(what + ": resized"));
      QVERIFY2(area.contains(placed.rect), qPrintable(what + ": outside the window"));
    }
  }
}

void TestTutorialLayout::besideThePanelWhenThereIsRoom() {
  const QRect overlay(0, 0, 1920, 1080);
  const QRect panel(0, 100, 380, 800);  // the register column
  const edu::CardPlacement placed =
      edu::placeTutorialCard(overlay, panel, QSize(360, 200), kMargin, kGap);
  QCOMPARE(placed.side, edu::CardRight);
  QCOMPARE(placed.rect.left(), panel.right() + 1 + kGap);
  // Centred on the panel, which is taller than the card.  Integer centres
  // of an even-sized rectangle round down, so one pixel out is exact.
  QVERIFY(qAbs(placed.rect.center().y() - panel.center().y()) <= 1);
}

void TestTutorialLayout::panelAtTheRightEdgeGetsTheCardOnItsLeft() {
  const QRect overlay(0, 0, 1920, 1080);
  const QRect panel(1150, 100, 770, 640);  // the text panel, against the edge
  const edu::CardPlacement placed =
      edu::placeTutorialCard(overlay, panel, QSize(360, 200), kMargin, kGap);
  QCOMPARE(placed.side, edu::CardLeft);
  QCOMPARE(placed.rect.right() + 1, panel.left() - kGap);
  QVERIFY(overlay.adjusted(kMargin, kMargin, -kMargin, -kMargin)
              .contains(placed.rect));
}

void TestTutorialLayout::panelFillingTheWindowCentresTheCard() {
  const QRect overlay(0, 0, 1366, 768);
  const edu::CardPlacement placed =
      edu::placeTutorialCard(overlay, overlay, QSize(360, 200), kMargin, kGap);
  QCOMPARE(placed.side, edu::CardCentre);
  QVERIFY(qAbs(placed.rect.center().x() - overlay.center().x()) <= 1);
  QVERIFY(qAbs(placed.rect.center().y() - overlay.center().y()) <= 1);
}

void TestTutorialLayout::noPanelCentresTheCard() {
  const QRect overlay(0, 0, 1600, 900);
  const edu::CardPlacement placed =
      edu::placeTutorialCard(overlay, QRect(), QSize(360, 220), kMargin, kGap);
  QCOMPARE(placed.side, edu::CardCentre);
  QVERIFY(qAbs(placed.rect.center().x() - overlay.center().x()) <= 1);
  QVERIFY(qAbs(placed.rect.center().y() - overlay.center().y()) <= 1);
}

// A window smaller than the card is not a case the program has, but the
// answer still has to be usable rather than off-screen.
void TestTutorialLayout::cardLargerThanTheWindowStaysReachable() {
  const QRect overlay(0, 0, 320, 200);
  const edu::CardPlacement placed =
      edu::placeTutorialCard(overlay, QRect(0, 0, 320, 120), QSize(360, 240),
                             kMargin, kGap);
  QCOMPARE(placed.rect.topLeft(), QPoint(kMargin, kMargin));
}

EDU_TEST_FACTORY(TestTutorialLayout)

#include "tst_tutorial_layout.moc"
