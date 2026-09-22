/* Hallym MIPS Simulator -- the About box (Help > About).

   Two tabs.  "About": emblem A, the Korean/English logotype, the product
   name and version, and what the program is.  "License": the notices this
   program must carry -- SPIM's copyright and BSD licence and the Qt LGPL
   notice, both as upstream's About box printed them, then the licences of
   the bundled fonts (OFL) and icons (ISC). */

#ifndef EDU_ABOUT_H
#define EDU_ABOUT_H

#include <QDialog>

class EduAboutDialog : public QDialog {
  Q_OBJECT

 public:
  explicit EduAboutDialog(QWidget* parent = 0);

  // The License tab's text, for tests and the devtools.
  static QString licenseHtml();
};

#endif  // EDU_ABOUT_H
