/* What the SPIM core expects its front end to provide (CPU/spim.h, "Exported
   functions"), reduced to what a test needs: output is swallowed, error
   messages are collected. */

#ifndef CORE_FRONTEND_STUBS_H
#define CORE_FRONTEND_STUBS_H

#include <QString>
#include <QStringList>

// Messages passed to error()/run_error() since the last call; clears them.
QStringList takeCoreErrors();

// While non-null, write_output(message_out, ...) appends here (see
// QtSpim/edu/edu_loader.h, which declares the same variable).
extern QString* eduOutputCapture;

#endif  // CORE_FRONTEND_STUBS_H
