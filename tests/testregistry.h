/* Minimal registry so that several Qt Test classes can live in one test
   binary.  QTEST_MAIN only supports a single class per executable; this
   keeps "make check" to one target per directory while still letting each
   area of edu/core have its own test file.

   Usage, at the bottom of a test .cpp:

       EDU_REGISTER_TEST(TestSomething)
*/

#ifndef EDU_TEST_REGISTRY_H
#define EDU_TEST_REGISTRY_H

#include <QList>
#include <QObject>

class TestRegistry {
 public:
  static TestRegistry& instance() {
    // Function-local static: constructed on first use, so registrars in
    // other translation units cannot run before it exists.
    static TestRegistry registry;
    return registry;
  }

  void add(QObject* test) { tests_.append(test); }
  const QList<QObject*>& tests() const { return tests_; }

 private:
  TestRegistry() {}
  QList<QObject*> tests_;
};

template <typename T>
struct TestRegistrar {
  TestRegistrar() { TestRegistry::instance().add(new T); }
};

#define EDU_REGISTER_TEST(TestClass) \
  static TestRegistrar<TestClass> edu_registrar_##TestClass;

#endif  // EDU_TEST_REGISTRY_H
