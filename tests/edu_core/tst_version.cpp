/* The fork's identity has to stay consistent with the core it is built on
   and distinct from the standard QtSpim it is installed next to.  Both are
   easy to break by hand and neither breaks the build, so they are checked
   here. */

#include <QtTest>

#include "edu/edu_version.h"
#include "edu_test.h"
#include "version.h"  // CPU/version.h — SPIM_VERSION

class TestVersion : public QObject {
  Q_OBJECT

 private slots:
  void baseVersionMatchesSimulatorCore();
  void eduVersionExtendsBaseVersion();
  void identityDiffersFromStandardQtSpim();
};

// EDU_BASE_VERSION mirrors CPU/version.h.  CPU/version.h is never edited in
// this fork, so if the two ever disagree it is EDU_BASE_VERSION that is
// wrong -- or the fork was rebased onto a different SPIM release and the
// rest of the branding was not updated.
void TestVersion::baseVersionMatchesSimulatorCore() {
  const QString coreVersion = QString::fromLatin1(SPIM_VERSION);
  QVERIFY2(coreVersion.contains(QLatin1String(EDU_BASE_VERSION)),
           qPrintable(QString("EDU_BASE_VERSION \"%1\" does not appear in "
                              "SPIM_VERSION \"%2\"")
                          .arg(QLatin1String(EDU_BASE_VERSION), coreVersion)));
}

void TestVersion::eduVersionExtendsBaseVersion() {
  const QString eduVersion = QString::fromLatin1(EDU_VERSION);

  QVERIFY2(eduVersion.startsWith(QLatin1String(EDU_BASE_VERSION)),
           qPrintable("EDU_VERSION must start with EDU_BASE_VERSION: " +
                      eduVersion));

  const QString suffix = eduVersion.mid(qstrlen(EDU_BASE_VERSION));
  QRegExp fork("^-edu\\.[0-9]+$");
  QVERIFY2(fork.exactMatch(suffix),
           qPrintable("EDU_VERSION suffix must be -edu.<n>, got: " + suffix));
}

// QtSpim-Edu is installed next to the standard QtSpim, so the executable
// name and the settings store must not collide with it.
void TestVersion::identityDiffersFromStandardQtSpim() {
  QVERIFY(QLatin1String(EDU_TARGET_NAME) != QLatin1String("QtSpim"));
  QVERIFY(QLatin1String(EDU_SETTINGS_APP) != QLatin1String("QtSpim"));
  QVERIFY(QLatin1String(EDU_SETTINGS_ORG) != QLatin1String("LarusStone"));
  QVERIFY(qstrlen(EDU_APP_NAME) > 0);
}

EDU_TEST_FACTORY(TestVersion)

#include "tst_version.moc"
