/* QtSpim-Edu: warn before handing the core a path it cannot open.

   See edu/core/edu_path_encoding.h for the why.  This is the GUI half: one
   function to call at every point where a QString path is about to be
   converted with toLocal8Bit() and passed to the simulator core.
*/

#ifndef EDU_PATH_CHECK_H
#define EDU_PATH_CHECK_H

#include <QString>

class QWidget;

namespace edu {

// True when `path` can be passed to the core losslessly.  Otherwise shows a
// warning explaining the problem and what to do, and returns false; the
// caller must then skip the load.  (Loading anyway is pointless: the core
// would receive "?" for every unsupported character and fail to open the
// file with a far less helpful message.)
bool confirmPathLoadable(QWidget* parent, const QString& path);

// The warning's text, for tests and for the log.
QString pathNotLoadableMessage(const QString& path);

}  // namespace edu

#endif  // EDU_PATH_CHECK_H
