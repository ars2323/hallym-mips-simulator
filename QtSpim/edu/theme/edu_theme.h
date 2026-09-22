/* Hallym MIPS Simulator -- the theme, applied.

   Everything visual that is not a widget's own painting goes through here:
   the bundled fonts, the application font, the style sheet (theme/light.qss
   with the tokens filled in), the tool bar icons (Lucide SVGs coloured from
   the tokens), the brand images and the application icon.  Widgets that
   paint themselves take their colours from edu/theme/tokens.h directly. */

#ifndef EDU_THEME_H
#define EDU_THEME_H

#include <QColor>
#include <QFont>
#include <QIcon>
#include <QPixmap>
#include <QString>

class QApplication;
class QAction;
class QSplashScreen;

namespace edu {
namespace theme {

// Registers the bundled fonts, sets the application font, the style sheet
// and the window icon.  Call once, before the main window is created.
void apply(QApplication* app);

// Pretendard at the UI size / D2Coding at the code size.
QFont uiFont();
QFont codeFont();

// theme/light.qss with every @name@ replaced by the token's #rrggbb.
QString styleSheet();

// A tool bar icon (Lucide, theme/icons/lucide/<name>.svg rendered to PNG by
// tools/make-theme-icons.py): kNavy normally, kBlue when hovered
// (QIcon::Active), kGray when disabled.
QIcon toolIcon(const QString& lucideName);

// theme/brand/<name>.svg at one of the widths make-theme-icons.py rendered
// (emblem-a-navy 112, logotype-ko-en 220, signature-h-ko-en 320,
// symbol-basic 64), with the @2x file when the device pixel ratio asks.
QPixmap brandPixmap(const QString& name, int width, qreal devicePixelRatio);

// The splash image: the university signature on a white card.
QPixmap splashPixmap();

// Shows it for kSplashMillis, or until it is clicked; it deletes itself.
QSplashScreen* showSplash();

inline QColor color(QRgb rgb) { return QColor(rgb); }

}  // namespace theme
}  // namespace edu

#endif  // EDU_THEME_H
