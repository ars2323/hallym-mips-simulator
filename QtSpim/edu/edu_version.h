/* QtSpim-Edu — identity of this fork.

   QtSpim-Edu is an educational fork of QtSpim 9.1.24 that changes only the
   GUI.  The simulator core under CPU/ is untouched, so its own version
   string (SPIM_VERSION in CPU/version.h) is the authority on which SPIM
   release this is built from and must never be edited here.

   EDU_VERSION is the version of *our* changes, MAJOR.MINOR.PATCH.  It is
   what the About box, the status bar and the download names show
   ("QtSpim-Edu 1.0.0"); which SPIM it is built on is said next to it
   ("based on QtSpim 9.1.24").
*/

#ifndef EDU_VERSION_H
#define EDU_VERSION_H

/* Upstream release this fork is based on (mirrors CPU/version.h). */
#define EDU_BASE_VERSION "9.1.24"

/* Version of this fork.  tools/package-windows.ps1 and the MSI read it from
   this line. */
#define EDU_VERSION "1.0.0"

/* Product name shown to the user. */
#define EDU_APP_NAME "QtSpim-Edu"

/* Executable / installed file name.  Deliberately different from "QtSpim"
   so that this build can be installed next to the standard one. */
#define EDU_TARGET_NAME "QtSpimEdu"

/* QSettings identity.  Also deliberately different from the standard
   build's ("LarusStone" / "QtSpim"): the two programs have different
   window layouts, so sharing a settings store would make each one restore
   the other's dock state. */
#define EDU_SETTINGS_ORG "QtSpim-Edu"
#define EDU_SETTINGS_DOMAIN "qtspim-edu.local"
#define EDU_SETTINGS_APP "QtSpimEdu"

#endif  // EDU_VERSION_H
