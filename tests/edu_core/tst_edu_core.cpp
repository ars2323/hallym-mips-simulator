/* Entry point for the edu/core test binary.  Runs every test class that
   registered itself with EDU_REGISTER_TEST. */

#include <QCoreApplication>
#include <QtTest>

#include "testregistry.h"

int main(int argc, char* argv[]) {
  QCoreApplication app(argc, argv);

  int failed = 0;
  const QList<QObject*>& tests = TestRegistry::instance().tests();
  for (int i = 0; i < tests.size(); i += 1) {
    failed += QTest::qExec(tests.at(i), argc, argv);
  }
  return failed;
}
