/* Hallym MIPS Simulator -- design tokens.

   The only place in the program where a colour, a font or a spacing value is
   written down.  docs/design/tokens.md is the human-readable version and the
   record of where each value comes from (Pantone references in the
   university's UI manual, WCAG contrast table); the two must agree.

   Colours are QRgb constants so that they can be used before QApplication
   exists and in switch-like tables.  theme/light.qss refers to them by name
   through the @name@ placeholders that edu::theme::styleSheet() fills in from
   kNamedColors below, so the style sheet cannot drift from this file. */

#ifndef EDU_THEME_TOKENS_H
#define EDU_THEME_TOKENS_H

#include <QtGlobal>
#include <QRgb>

namespace edu {
namespace theme {

// ---- Colours (tokens.md 1.1 / 1.2) ---------------------------------------

// University identity colours (Pantone 281 / 2945 / 326 / Cool Gray 4).
const QRgb kNavy = 0xff00205b;  // titles, group headers, icons, primary text on tints
const QRgb kBlue = 0xff0055a5;  // active tab, primary button, PC bar, labels
const QRgb kTeal = 0xff00a9a5;  // identity only; never as text (contrast 2.9)
const QRgb kGray = 0xffbcbec0;  // disabled, pseudo-instruction band bar

// Neutrals.
const QRgb kWhite = 0xffffffff;
const QRgb kWindow = 0xfff5f7fa;     // window background, current line, band rows
const QRgb kBorder = 0xffe1e5ea;     // 1 px lines
const QRgb kHover = 0xfff3f6f9;      // table row hover
const QRgb kText = 0xff1f2933;       // body text
const QRgb kText2 = 0xff5a6472;      // secondary text (source column, version)
const QRgb kTextMuted = 0xff65707e;  // line numbers, comments (AA on the tinted rows)
const QRgb kTextLog = 0xff2b3440;    // message log body
const QRgb kScroll = 0xffc9d0d8;
const QRgb kScrollHover = 0xffaeb7c2;

// Tints of the identity colours and the AA-safe text versions.
const QRgb kBlueTint = 0xffe8f0f9;    // PC row, badge R, hover on bars
const QRgb kBlueTint2 = 0xffd3e2f3;   // selected row (with kNavy text)
const QRgb kTealTint = 0xffe6f6f5;    // badge I, $sp/$fp/$gp marker
const QRgb kTealText = 0xff00736f;    // changed values, markers, registers
const QRgb kAmberTint = 0xfffdf3e1;   // badge J, "Source changed" strip, mode badge
const QRgb kAmberText = 0xff8a5a00;   // their text; strings in the editor
const QRgb kPurpleText = 0xff6b4c9a;  // numbers in the editor
const QRgb kCp0Tint = 0xffeef0f2;     // badge CP0
const QRgb kCp0Text = 0xff4a5560;

// Status.
const QRgb kError = 0xffc0392b;      // error text, error markers
const QRgb kErrorTint = 0xfffbeae8;  // error badge / error line background
const QRgb kErrorText = 0xff8e2a1f;  // text on kErrorTint
const QRgb kWarning = 0xffb7791f;    // warning icons only (contrast 3.6)

// ---- Fonts (tokens.md 2) --------------------------------------------------

const char* const kUiFamily = "Pretendard";  // bundled, OFL
const int kUiPixelSize = 13;
const char* const kCodeFamily = "D2Coding";  // bundled, OFL; Hangul = 2 cells
const int kCodePointSize = 10;               // ~13 px at 96 dpi
const int kBadgePixelSize = 11;
const int kFontSmall = 12;        // status bar, splash version line
const int kTitlePixelSize = 15;   // About: name
const int kDisplayPixelSize = 20; // About: product name
const int kSplashTitleSize = 22;  // the start-up screen: product name (Bold)

// ---- Metrics (tokens.md 3) ------------------------------------------------

const int kSpace1 = 4;
const int kSpace2 = 8;
const int kSpace3 = 12;
const int kSpace4 = 16;
const int kRowHeight = 16;       // code tables
const int kBadgeRadius = 4;
const int kBadgeHeight = 16;
const int kPcBarWidth = 3;       // left bar of the PC row
const int kBandBarWidth = 2;     // left bar of a pseudo-instruction band
const int kToolIconSize = 20;
const int kSplashMillis = 1500;

// ---- Type badges (tokens.md 4) --------------------------------------------

struct BadgeColors {
  const char* type;  // as edu::formatName() spells it
  QRgb background;
  QRgb text;
};
const BadgeColors kBadges[] = {
    {"R", kBlueTint, kBlue},       {"I", kTealTint, kTealText},
    {"J", kAmberTint, kAmberText}, {"FR", kBlueTint, kNavy},
    {"FI", kTealTint, kNavy},      {"CP0", kCp0Tint, kCp0Text},
};

// ---- Names for the style sheet --------------------------------------------

struct NamedColor {
  const char* name;
  QRgb rgb;
};
const NamedColor kNamedColors[] = {
    {"navy", kNavy},           {"blue", kBlue},
    {"teal", kTeal},           {"gray", kGray},
    {"white", kWhite},         {"window", kWindow},
    {"border", kBorder},       {"hover", kHover},
    {"text", kText},           {"text-2", kText2},
    {"text-muted", kTextMuted}, {"text-log", kTextLog},
    {"scroll", kScroll},       {"scroll-hover", kScrollHover},
    {"blue-tint", kBlueTint},  {"blue-tint2", kBlueTint2},
    {"teal-tint", kTealTint},  {"teal-text", kTealText},
    {"amber-tint", kAmberTint}, {"amber-text", kAmberText},
    {"error", kError},         {"error-tint", kErrorTint},
    {"error-text", kErrorText},
};

}  // namespace theme
}  // namespace edu

#endif  // EDU_THEME_TOKENS_H
