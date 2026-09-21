/* edu/core/edu_text_file: a file opened and saved unchanged is the same
   bytes, whatever its encoding, byte order mark and line ends. */

#include <QtTest>

#include "edu/core/edu_text_file.h"
#include "edu_test.h"

using edu::TextFileFormat;

class TestTextFile : public QObject {
  Q_OBJECT

 private slots:
  void roundTrip_data();
  void roundTrip();
  void mixedLineEndsGoWithTheMajority();
  void newFileDefaults();
  void unrepresentableCharacterIsRefused();
  void editedCp949StaysCp949();
};

// "# 출력" in the two encodings.
static const char kUtf8Comment[] = "# \xEC\xB6\x9C\xEB\xA0\xA5";
static const char kCp949Comment[] = "# \xC3\xE2\xB7\xC2";

void TestTextFile::roundTrip_data() {
  QTest::addColumn<QByteArray>("bytes");
  QTest::addColumn<int>("encoding");
  QTest::addColumn<bool>("mark");
  QTest::addColumn<int>("lineEnd");

  const QByteArray u(kUtf8Comment);
  const QByteArray k(kCp949Comment);
  QTest::newRow("ascii lf") << QByteArray("\t.text\nmain:\tjr $ra\n")
                            << int(TextFileFormat::Utf8) << false << int(TextFileFormat::Lf);
  QTest::newRow("ascii crlf") << QByteArray("\t.text\r\nmain:\tjr $ra\r\n")
                              << int(TextFileFormat::Utf8) << false << int(TextFileFormat::CrLf);
  QTest::newRow("no final newline") << QByteArray("a\nb")
                                    << int(TextFileFormat::Utf8) << false << int(TextFileFormat::Lf);
  QTest::newRow("empty") << QByteArray("")
                         << int(TextFileFormat::Utf8) << false << int(TextFileFormat::Lf);
  QTest::newRow("tabs and trailing blanks") << QByteArray("\tli\t$v0, 4   \n\n\n")
                                            << int(TextFileFormat::Utf8) << false << int(TextFileFormat::Lf);
  QTest::newRow("utf8 hangul lf") << (QByteArray("syscall ") + u + "\n")
                                  << int(TextFileFormat::Utf8) << false << int(TextFileFormat::Lf);
  QTest::newRow("utf8 hangul crlf") << (QByteArray("syscall ") + u + "\r\nnop\r\n")
                                    << int(TextFileFormat::Utf8) << false << int(TextFileFormat::CrLf);
  QTest::newRow("utf8 with mark") << (QByteArray("\xEF\xBB\xBF") + u + "\r\n")
                                  << int(TextFileFormat::Utf8) << true << int(TextFileFormat::CrLf);
  QTest::newRow("mark only") << QByteArray("\xEF\xBB\xBF")
                             << int(TextFileFormat::Utf8) << true << int(TextFileFormat::Lf);
  QTest::newRow("cp949 hangul crlf") << (QByteArray("syscall ") + k + "\r\nnop\r\n")
                                     << int(TextFileFormat::Cp949) << false << int(TextFileFormat::CrLf);
  QTest::newRow("cp949 hangul lf") << (QByteArray("syscall ") + k + "\n")
                                   << int(TextFileFormat::Cp949) << false << int(TextFileFormat::Lf);
  // Neither UTF-8 nor CP949: every byte still comes back.
  QTest::newRow("unknown bytes") << QByteArray("x \xFF\xFE\x80 y\n")
                                 << int(TextFileFormat::Latin1) << false << int(TextFileFormat::Lf);
}

void TestTextFile::roundTrip() {
  QFETCH(QByteArray, bytes);
  QFETCH(int, encoding);
  QFETCH(bool, mark);
  QFETCH(int, lineEnd);
  if (encoding == int(TextFileFormat::Cp949) && !edu::hasKoreanCodec()) {
    QSKIP("this Qt build has no Korean codec");
  }

  const edu::DecodedTextFile decoded = edu::decodeTextFile(bytes);
  QCOMPARE(int(decoded.format.encoding), encoding);
  QCOMPARE(decoded.format.byteOrderMark, mark);
  if (bytes.contains('\n')) {
    QCOMPARE(int(decoded.format.lineEnd), lineEnd);
  }
  QVERIFY(!decoded.mixedLineEnds);
  QVERIFY(!decoded.text.contains('\r'));
  if (encoding != int(TextFileFormat::Latin1) && bytes.contains("\xEC\xB6\x9C")) {
    QVERIFY(decoded.text.contains(QString::fromUtf8("출력")));
  }
  if (encoding == int(TextFileFormat::Cp949)) {
    QVERIFY(decoded.text.contains(QString::fromUtf8("출력")));
  }

  QByteArray saved("untouched");
  int badLine = -1;
  QVERIFY(edu::encodeTextFile(decoded.text, decoded.format, &saved, &badLine));
  QCOMPARE(saved, bytes);
  QCOMPARE(badLine, 0);
}

void TestTextFile::mixedLineEndsGoWithTheMajority() {
  edu::DecodedTextFile d = edu::decodeTextFile("a\r\nb\r\nc\n");
  QVERIFY(d.mixedLineEnds);
  QCOMPARE(int(d.format.lineEnd), int(TextFileFormat::CrLf));
  QCOMPARE(d.text, QString("a\nb\nc\n"));
  QByteArray saved;
  QVERIFY(edu::encodeTextFile(d.text, d.format, &saved, 0));
  QCOMPARE(saved, QByteArray("a\r\nb\r\nc\r\n"));

  d = edu::decodeTextFile("a\nb\nc\r\n");
  QVERIFY(d.mixedLineEnds);
  QCOMPARE(int(d.format.lineEnd), int(TextFileFormat::Lf));
}

void TestTextFile::newFileDefaults() {
  const TextFileFormat format;
  QCOMPARE(int(format.encoding), int(TextFileFormat::Utf8));
  QVERIFY(!format.byteOrderMark);
  QCOMPARE(int(format.lineEnd), int(TextFileFormat::Lf));
  QByteArray saved;
  QVERIFY(edu::encodeTextFile(QString::fromUtf8("# 출력\nnop\n"), format, &saved, 0));
  QCOMPARE(saved, QByteArray(kUtf8Comment) + "\nnop\n");
  QCOMPARE(edu::encodingName(format.encoding), QString("UTF-8"));
  QCOMPARE(edu::lineEndName(format.lineEnd), QString("LF"));
}

void TestTextFile::unrepresentableCharacterIsRefused() {
  if (!edu::hasKoreanCodec()) {
    QSKIP("this Qt build has no Korean codec");
  }
  TextFileFormat cp949;
  cp949.encoding = TextFileFormat::Cp949;
  QByteArray saved("untouched");
  int badLine = 0;
  // U+1F600 (an emoji) is not in CP949; it is on line 3.
  const QString text = QString::fromUtf8("# 출력\nnop\n# \xF0\x9F\x98\x80\n");
  QVERIFY(!edu::encodeTextFile(text, cp949, &saved, &badLine));
  QCOMPARE(badLine, 3);
  QCOMPARE(saved, QByteArray("untouched"));

  TextFileFormat latin1;
  latin1.encoding = TextFileFormat::Latin1;
  QVERIFY(!edu::encodeTextFile(QString::fromUtf8("ok\n출력\n"), latin1, &saved, &badLine));
  QCOMPARE(badLine, 2);
}

void TestTextFile::editedCp949StaysCp949() {
  if (!edu::hasKoreanCodec()) {
    QSKIP("this Qt build has no Korean codec");
  }
  edu::DecodedTextFile d =
      edu::decodeTextFile(QByteArray("nop ") + kCp949Comment + "\r\n");
  d.text += QString::fromUtf8("syscall # 입력\n");
  QByteArray saved;
  QVERIFY(edu::encodeTextFile(d.text, d.format, &saved, 0));
  QCOMPARE(saved, QByteArray("nop ") + kCp949Comment +
                      "\r\nsyscall # \xC0\xD4\xB7\xC2\r\n");
}

EDU_TEST_FACTORY(TestTextFile)

#include "tst_text_file.moc"
