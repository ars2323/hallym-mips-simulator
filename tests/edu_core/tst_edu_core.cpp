/* Entry point for the edu/core test binary.

   Every test class in this binary is listed below.  When adding a test file:
   define its factory there with EDU_TEST_FACTORY(YourClass) and add the
   declaration and a line to the table here. */

#include <QCoreApplication>
#include <QtTest>
#include <cstdio>

#include "edu_test.h"

QObject* createTestVersion();       // tst_version.cpp
QObject* createTestPathEncoding();  // tst_path_encoding.cpp
QObject* createTestFormat();        // tst_format.cpp
QObject* createTestRegisters();     // tst_registers.cpp
QObject* createTestDecoder();       // tst_decoder.cpp
QObject* createTestInstructionText();  // tst_instruction_text.cpp
QObject* createTestSourceText();    // tst_source_text.cpp
QObject* createTestSymbols();       // tst_symbols.cpp
QObject* createTestMemoryRows();    // tst_memory_rows.cpp
QObject* createTestMemoryText();    // tst_memory_text.cpp

typedef QObject* (*TestFactory)();

static const TestFactory kTests[] = {
    createTestVersion,
    createTestPathEncoding,
    createTestFormat,
    createTestRegisters,
    createTestDecoder,
    createTestInstructionText,
    createTestSourceText,
    createTestSymbols,
    createTestMemoryRows,
    createTestMemoryText,
};

int main(int argc, char* argv[]) {
  QCoreApplication app(argc, argv);

  const int count = int(sizeof(kTests) / sizeof(kTests[0]));
  if (count == 0) {
    std::fprintf(stderr, "no test classes listed in tst_edu_core.cpp\n");
    return 1;
  }

  int failed = 0;
  for (int i = 0; i < count; i += 1) {
    QObject* test = kTests[i]();
    failed += QTest::qExec(test, argc, argv);
    delete test;
  }

  std::printf("tst_edu_core: %d test class(es), %d with failures\n", count,
              failed);
  std::fflush(stdout);
  return failed;
}
