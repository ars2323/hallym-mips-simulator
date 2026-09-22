/* See edu_tutorial_layout.h. */

#include "edu/core/edu_tutorial_layout.h"

#include <QtGlobal>

namespace edu {

namespace {

int clamp(int value, int low, int high) {
  return high < low ? low : qBound(low, value, high);
}

// Puts the rectangle inside the area, moving it as little as possible.  A
// card larger than the area is pinned to the top left: it will be clipped,
// but its buttons stay reachable.
QRect insideOf(const QRect& area, QRect rect) {
  rect.moveLeft(clamp(rect.left(), area.left(), area.right() - rect.width() + 1));
  rect.moveTop(clamp(rect.top(), area.top(), area.bottom() - rect.height() + 1));
  return rect;
}

}  // namespace

CardPlacement placeTutorialCard(const QRect& overlay, const QRect& spot,
                                const QSize& card, int margin, int gap) {
  CardPlacement placement;
  placement.side = CardCentre;

  const QRect area = overlay.adjusted(margin, margin, -margin, -margin);
  const int width = card.width();
  const int height = card.height();

  if (spot.isEmpty() || area.isEmpty()) {
    QRect centred(QPoint(area.center().x() - width / 2,
                         area.center().y() - height / 2),
                  card);
    placement.rect = insideOf(area, centred);
    return placement;
  }

  // Beside a tall panel, under or over a wide flat one (a tool bar, a row of
  // column headings): a card beside a strip along the top would cover the
  // menu bar.  The cross axis is clamped into the area before the fit is
  // judged, so a panel near a corner still gets a card beside it instead of
  // falling through to the centre.
  const bool strip = spot.height() * 2 < card.height();
  const CardSide beside[] = {CardRight, CardLeft, CardBelow, CardAbove};
  const CardSide under[] = {CardBelow, CardAbove, CardRight, CardLeft};
  const CardSide* order = strip ? under : beside;
  for (unsigned i = 0; i < 4; i += 1) {
    QRect candidate(QPoint(0, 0), card);
    bool fits = false;
    switch (order[i]) {
      case CardRight:
        candidate.moveLeft(spot.right() + 1 + gap);
        candidate.moveTop(clamp(spot.center().y() - height / 2, area.top(),
                                area.bottom() - height + 1));
        fits = candidate.right() <= area.right();
        break;
      case CardLeft:
        candidate.moveLeft(spot.left() - gap - width);
        candidate.moveTop(clamp(spot.center().y() - height / 2, area.top(),
                                area.bottom() - height + 1));
        fits = candidate.left() >= area.left();
        break;
      case CardBelow:
        candidate.moveTop(spot.bottom() + 1 + gap);
        candidate.moveLeft(clamp(spot.center().x() - width / 2, area.left(),
                                 area.right() - width + 1));
        fits = candidate.bottom() <= area.bottom();
        break;
      default:
        candidate.moveTop(spot.top() - gap - height);
        candidate.moveLeft(clamp(spot.center().x() - width / 2, area.left(),
                                 area.right() - width + 1));
        fits = candidate.top() >= area.top();
        break;
    }
    // The cross axis was clamped, so only the axis tested above can fail;
    // area.contains() is the belt to that braces.
    if (fits && area.contains(candidate)) {
      placement.rect = candidate;
      placement.side = order[i];
      return placement;
    }
  }

  // The panel fills the window (or nearly): the card goes in the middle of
  // it, still inside the overlay.
  QRect centred(QPoint(area.center().x() - width / 2,
                       area.center().y() - height / 2),
                card);
  placement.rect = insideOf(area, centred);
  placement.side = CardCentre;
  return placement;
}

}  // namespace edu
