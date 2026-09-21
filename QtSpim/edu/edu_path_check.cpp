/* See edu_path_check.h. */

#include "edu/edu_path_check.h"

#include <QMessageBox>
#include <QWidget>

#include "edu/core/edu_path_encoding.h"

namespace edu {

QString pathNotLoadableMessage(const QString& path) {
  const QString lost = unrepresentableInLocal8Bit(path).toHtmlEscaped();
  const QString codec = local8BitCodecName().toHtmlEscaped();
  const QString shownPath = path.toHtmlEscaped();

  // English first, since the rest of the program is English; Korean below,
  // since the people most likely to hit this are students on Korean-named
  // accounts.  The two say the same thing.
  return QString::fromUtf8(
             "<p><b>This file's path contains characters that cannot be "
             "passed to the simulator on this computer.</b></p>"
             "<p>Path: <code>%1</code><br>"
             "Unsupported characters: <code>%2</code><br>"
             "System text encoding: %3</p>"
             "<p>Move or copy the file to a folder whose path contains only "
             "characters this encoding supports (for example "
             "<code>C:\\mips</code>), then load it again.</p>"
             "<hr>"
             "<p>이 파일의 경로에 이 컴퓨터의 문자 인코딩(%3)으로 표현할 수 "
             "없는 문자가 있어서 시뮬레이터에 넘길 수 없습니다.<br>"
             "지원되지 않는 문자: <code>%2</code></p>"
             "<p>경로에 그런 문자가 없는 폴더(예: <code>C:\\mips</code>)로 "
             "파일을 옮기거나 복사한 뒤 다시 여세요.</p>")
      .arg(shownPath, lost, codec);
}

bool confirmPathLoadable(QWidget* parent, const QString& path) {
  if (isLosslessInLocal8Bit(path)) {
    return true;
  }

  QMessageBox box(parent);
  box.setIcon(QMessageBox::Warning);
  box.setWindowTitle(QString::fromUtf8("Cannot load file / 파일을 열 수 없음"));
  box.setTextFormat(Qt::RichText);
  box.setText(pathNotLoadableMessage(path));
  box.setStandardButtons(QMessageBox::Ok);
  box.exec();
  return false;
}

}  // namespace edu
