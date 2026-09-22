/* Hallym MIPS Simulator — identity of this program.

   Hallym MIPS Simulator is the Hallym University edition of QtSpim-Edu, an
   educational fork of QtSpim 9.1.24 that changes only the GUI.  The simulator core under CPU/ is untouched, so its own version
   string (SPIM_VERSION in CPU/version.h) is the authority on which SPIM
   release this is built from and must never be edited here.

   EDU_VERSION is the version of *our* changes, MAJOR.MINOR.PATCH.  It is
   what the About box, the status bar and the download names show
   ("Hallym MIPS Simulator 1.0.0"); which SPIM it is built on is said in the
   About box's License tab.
*/

#ifndef EDU_VERSION_H
#define EDU_VERSION_H

/* Upstream release this fork is based on (mirrors CPU/version.h). */
#define EDU_BASE_VERSION "9.1.24"

/* Version of this fork.  tools/package-windows.ps1 and the MSI read it from
   this line. */
#define EDU_VERSION "1.0.4"

/* Product name shown to the user. */
#define EDU_APP_NAME "Hallym MIPS Simulator"

/* The same, in Korean, for the student guides only. */
#define EDU_APP_NAME_KO "\ud55c\ub9bc MIPS \uc2dc\ubbac\ub808\uc774\ud130"

/* Executable / installed file name.  Deliberately different from "QtSpim"
   so that this build can be installed next to the standard one. */
#define EDU_TARGET_NAME "HallymMIPS"

/* QSettings identity.  Also deliberately different from the standard
   build's ("LarusStone" / "QtSpim"): the two programs have different
   window layouts, so sharing a settings store would make each one restore
   the other's dock state. */
#define EDU_SETTINGS_ORG "HallymMIPS"
#define EDU_SETTINGS_APP "HallymMIPS"

#endif  // EDU_VERSION_H
