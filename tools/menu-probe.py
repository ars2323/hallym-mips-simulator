#!/usr/bin/env python3
"""Insert a menu-action probe into QtSpim/main.cpp of a SCRATCH worktree.

    tools/menu-probe.py <worktree>

Works on any revision (vanilla-9.1.24 included), which the development
harness (edu_devtools) cannot: it does not exist there.  The probed binary
reads two environment variables:

    QTSPIM_PROBE       comma separated steps: "load" = File > Load File,
                       "reload" = File > Reinitialize and Load File
    QTSPIM_PROBE_FILE  the file to pick in the file dialog each time

It triggers the real QActions, answers the file dialog, prints every message
box as "DIALOG: ...", prints "DONE" and quits.  Used by
tools/check-menu-load.sh --compare to show what upstream does for the same
clicks.  Never run it on the main working tree.
"""
import sys

INCLUDES = '''#include <QAction>
#include <QFileDialog>
#include <QLineEdit>
#include <QMessageBox>
#include <QTextDocument>
#include <QTimer>
#include <cstdio>
'''

PROBE = r'''
  // MENU PROBE (tools/menu-probe.py) -- scratch worktrees only.
  if (!qEnvironmentVariableIsEmpty("QTSPIM_PROBE")) {
    static QStringList probeSteps =
        QString::fromLocal8Bit(qgetenv("QTSPIM_PROBE")).split(',');
    static QString probeFile =
        QString::fromLocal8Bit(qgetenv("QTSPIM_PROBE_FILE"));
    static SpimView* probeWindow = &win;
    // One answer per dialog.  Not keyed on the dialog's address: the static
    // QFileDialog::getOpenFileName() builds every dialog at the same one.
    static bool probeAnswered = false;
    QTimer* answer = new QTimer(&a);
    answer->setInterval(20);
    QObject::connect(answer, &QTimer::timeout, []() {
      QWidget* modal = QApplication::activeModalWidget();
      if (modal == 0) return;
      if (QFileDialog* files = qobject_cast<QFileDialog*>(modal)) {
        // Type the path into the dialog's own line edit.  (selectFile()
        // leaves the line edit alone once it has the focus.)
        QLineEdit* name = files->findChild<QLineEdit*>("fileNameEdit");
        if (!probeAnswered && name != 0) {
          probeAnswered = true;
          name->setText(probeFile);
          QMetaObject::invokeMethod(files, "accept", Qt::QueuedConnection);
        }
        return;
      }
      if (QMessageBox* box = qobject_cast<QMessageBox*>(modal)) {
        QTextDocument text;
        text.setHtml(box->text());
        std::printf("DIALOG: %s\n",
                    qPrintable(text.toPlainText().simplified()));
        std::fflush(stdout);
      }
      modal->close();
    });
    answer->start();
    QTimer::singleShot(300, []() {
      for (int i = 0; i < probeSteps.size(); i += 1) {
        const char* name = probeSteps.at(i) == "reload" ? "action_File_Reload"
                                                        : "action_File_Load";
        std::printf("STEP: %s\n", name);
        std::fflush(stdout);
        probeAnswered = false;
        probeWindow->findChild<QAction*>(name)->trigger();
      }
      std::printf("DONE\n");
      std::fflush(stdout);
      std::exit(0);
    });
  }
'''

def main():
    path = sys.argv[1].rstrip('/') + '/QtSpim/main.cpp'
    text = open(path, newline='').read()
    if 'MENU PROBE' in text:
        return
    eol = '\r\n' if '\r\n' in text else '\n'
    marker = 'return a.exec();'
    assert text.count(marker) == 1, 'main.cpp: no single "return a.exec();"'
    first_include = text.index('#include')
    text = (text[:first_include] + INCLUDES.replace('\n', eol) +
            text[first_include:])
    at = text.index(marker)
    line_start = text.rfind(eol, 0, at) + len(eol)
    text = text[:line_start] + PROBE.replace('\n', eol) + eol + text[line_start:]
    open(path, 'w', newline='').write(text)

main()
