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

EDU_TEST_FACTORY(TestSourceText)

#include "tst_source_text.moc"
