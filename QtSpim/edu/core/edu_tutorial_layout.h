/* Hallym MIPS Simulator -- where the tutorial's card goes.

   Pure geometry, no widgets: given the overlay, the panel being lit and the
   size of the card, it answers with a rectangle for the card and the side it
   ended up on (which is the way the arrow points).

   The one rule that matters: the card is always inside the overlay, with a
   margin, whatever the panel does.  A card that lands off the window cannot
   be clicked, and the tutorial is then stuck -- this is what went wrong on
   Windows in 1.0.0 (docs/ARCHITECTURE.md 12, 70).  tests/edu_core holds it
   to that at every window size the program is used at.

   All of it is in device-independent pixels, the same units as QWidget
   geometry, so a 125 % or 150 % display needs nothing special. */

#ifndef EDU_TUTORIAL_LAYOUT_H
#define EDU_TUTORIAL_LAYOUT_H

#include <QRect>
#include <QSize>

namespace edu {

enum CardSide {
  CardCentre = 0,  // no panel to point at, or nowhere else to go
  CardRight,       // the card is to the right of the panel
  CardLeft,
  CardBelow,
  CardAbove
};

struct CardPlacement {
  QRect rect;
  CardSide side;
};

// overlay: the whole area the card may use (the tutorial's overlay, at 0,0).
// spot:    the panel being lit, in the same coordinates; empty for a step
//          with no panel, which centres the card.
// card:    what the card asks for.
// margin:  how far the card stays from the edge of the overlay.
// gap:     how far the card stays from the panel.
CardPlacement placeTutorialCard(const QRect& overlay, const QRect& spot,
                                const QSize& card, int margin, int gap);

}  // namespace edu

#endif  // EDU_TUTORIAL_LAYOUT_H
