/* Shared by the test files in this directory.

   Several Qt Test classes share one executable, since QTEST_MAIN only
   supports a single class.  Each test file defines a factory for its class
   with EDU_TEST_FACTORY, and tst_edu_core.cpp lists the factories it runs.

   The list is explicit on purpose.  An earlier version registered tests from
   static initialisers; that silently ran zero tests under MSVC, where the
   standard allows the dynamic initialisation of a translation unit nothing
   odr-uses to be deferred indefinitely ([basic.start.dynamic]).  Listing the
   factories makes main() use every test's translation unit. */

#ifndef EDU_TEST_H
#define EDU_TEST_H

#include <QObject>

#define EDU_TEST_FACTORY(TestClass) \
  QObject* create##TestClass() { return new TestClass; }

#endif  // EDU_TEST_H
