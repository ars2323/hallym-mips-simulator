/* edu/core/edu_source_text: source lines kept by the core as raw bytes. */

#include <QtTest>
#include <QTextCodec>

#include "edu/core/edu_source_text.h"
#include "edu_test.h"

class TestSourceText : public QObject {
  Q_OBJECT

 private slots:
  void asciiAndUtf8();
  void cp949();
  void lineEndsAreDropped();
  void lineNumberAndStatement();
};

void TestSourceText::asciiAndUtf8() {
  QCOMPARE(edu::decodeSourceBytes("7: li $v0, 4"), QString("7: li $v0, 4"));
  const QByteArray utf8("12: syscall  # \xEC\xB6\x9C\xEB\xA0\xA5");  // 출력
  QVERIFY(edu::isValidUtf8(utf8));
  QCOMPARE(edu::decodeSourceBytes(utf8),
           QString::fromUtf8("12: syscall  # \xEC\xB6\x9C\xEB\xA0\xA5"));
}

void TestSourceText::cp949() {
  if (QTextCodec::codecForName("CP949") == 0 &&
      QTextCodec::codecForName("EUC-KR") == 0) {
    QSKIP("this Qt build has no Korean codec");
  }
  const QByteArray cp949("12: syscall  # \xC3\xE2\xB7\xC2");  // 출력
  QVERIFY(!edu::isValidUtf8(cp949));
  QCOMPARE(edu::decodeSourceBytes(cp949),
           QString::fromUtf8("12: syscall  # \xEC\xB6\x9C\xEB\xA0\xA5"));
}

void TestSourceText::lineEndsAreDropped() {
  QCOMPARE(edu::decodeSourceBytes("3: nop\r\n"), QString("3: nop"));
  QCOMPARE(edu::decodeSourceBytes("3: nop\n"), QString("3: nop"));
}

// The number the core puts at the front of a source line, and the
// statement after it.  A breakpoint is remembered by these two (X).
void TestSourceText::lineNumberAndStatement() {
  QCOMPARE(edu::sourceLineNumber("183: jal main"), 183);
  QCOMPARE(edu::sourceLineStatement("183: jal main"), QString("jal main"));
  QCOMPARE(edu::sourceLineNumber("  7:\tli $v0, 4  "), 7);
  QCOMPARE(edu::sourceLineStatement("  7:\tli $v0, 4  "),
           QString("li $v0, 4"));
  // A colon that is a label, not a line number.
  QCOMPARE(edu::sourceLineNumber("main: nop"), 0);
  QCOMPARE(edu::sourceLineStatement("main: nop"), QString("main: nop"));
  // No colon at all, and nothing there.
  QCOMPARE(edu::sourceLineNumber("42 nop"), 0);
  QCOMPARE(edu::sourceLineNumber(QString()), 0);
  QCOMPARE(edu::sourceLineStatement(QString()), QString());
  // A number so long it cannot be one.
  QCOMPARE(edu::sourceLineNumber("1234567890123: nop"), 0);
  // The statement keeps its comment: two lines with the same code but
  // different comments are different statements.
  QCOMPARE(edu::sourceLineStatement("9: syscall # print"),
           QString("syscall # print"));
}

EDU_TEST_FACTORY(TestSourceText)

#include "tst_source_text.moc"
