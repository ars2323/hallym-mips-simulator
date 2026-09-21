/* edu/core/edu_asm_errors: the assembler's messages (ARCHITECTURE 4). */

#include <QtTest>

#include "edu/core/edu_asm_errors.h"
#include "edu_test.h"

class TestAsmErrors : public QObject {
  Q_OBJECT

 private slots:
  void parserMessage();
  void pathsWithSpacesAndHangul();
  void messageThatMentionsALine();
  void otherMessagesAreKeptWhole();
};

// Real output for Tests/tt.alu.bare.s.
void TestAsmErrors::parserMessage() {
  const edu::AssemblerMessage m = edu::parseAssemblerMessage(
      "spim: (parser) immediate value (65432) out of range (-32768 .. 32767) "
      "on line 414 of file Tests/tt.alu.bare.s\n"
      "\t  addi $4 $0 0xff98\n"
      "\t                   ^\n");
  QVERIFY(m.hasLocation);
  QCOMPARE(m.message,
           QString("immediate value (65432) out of range (-32768 .. 32767)"));
  QCOMPARE(m.line, 414);
  QCOMPARE(m.file, QString("Tests/tt.alu.bare.s"));
  QCOMPARE(m.source, QString("addi $4 $0 0xff98"));
  QCOMPARE(edu::assemblerMessageSummary(m),
           QString("414: immediate value (65432) out of range (-32768 .. 32767)"));

  const edu::AssemblerMessage s = edu::parseAssemblerMessage(
      "spim: (parser) syntax error on line 40 of file /home/u/helloworld.s\n"
      "\t  main:   li $v0, 4       # syscall 4 (print_str)\n"
      "\t          ^\n");
  QVERIFY(s.hasLocation);
  QCOMPARE(s.message, QString("syntax error"));
  QCOMPARE(s.line, 40);
  QCOMPARE(s.source, QString("main:   li $v0, 4       # syscall 4 (print_str)"));
}

void TestAsmErrors::pathsWithSpacesAndHangul() {
  const edu::AssemblerMessage m = edu::parseAssemblerMessage(QString::fromUtf8(
      "spim: (parser) Label is defined for the second time on line 7 of file "
      "C:/Users/홍 길동/내 문서/lab 1.s\n\t  main:\n\t  ^\n"));
  QVERIFY(m.hasLocation);
  QCOMPARE(m.line, 7);
  QCOMPARE(m.file, QString::fromUtf8("C:/Users/홍 길동/내 문서/lab 1.s"));
  QCOMPARE(m.message, QString("Label is defined for the second time"));
}

void TestAsmErrors::messageThatMentionsALine() {
  // The LAST " on line N of file " is the location.
  const edu::AssemblerMessage m = edu::parseAssemblerMessage(
      "spim: (parser) odd message on line 3 of file x on line 12 of file a.s\n");
  QVERIFY(m.hasLocation);
  QCOMPARE(m.line, 12);
  QCOMPARE(m.file, QString("a.s"));
  QCOMPARE(m.message, QString("odd message on line 3 of file x"));
  QVERIFY(m.source.isEmpty());
}

void TestAsmErrors::otherMessagesAreKeptWhole() {
  const char* texts[] = {
      "Cannot open file: `/nonexistent/x.s'\n",
      "The following symbols are undefined:\nfoo\n",
      "Attempt to execute non-instruction at 0x0040002c\n",
      "spim: (parser) no location here\n",
      ""};
  for (unsigned i = 0; i < sizeof(texts) / sizeof(texts[0]); i += 1) {
    const edu::AssemblerMessage m =
        edu::parseAssemblerMessage(QString::fromLatin1(texts[i]));
    QVERIFY(!m.hasLocation);
    QCOMPARE(m.line, 0);
    QCOMPARE(m.raw, QString::fromLatin1(texts[i]));
    QCOMPARE(m.message, QString::fromLatin1(texts[i]).simplified());
    QCOMPARE(edu::assemblerMessageSummary(m), m.message);
  }
}

EDU_TEST_FACTORY(TestAsmErrors)

#include "tst_asm_errors.moc"
