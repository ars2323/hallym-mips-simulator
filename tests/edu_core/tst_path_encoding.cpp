/* edu/core/edu_path_encoding: does a path survive the trip to fopen()?

   The functions take a codec explicitly so the behaviour can be pinned on
   any platform: ISO-8859-1 and UTF-8 are built into Qt everywhere, so those
   two cases are mandatory.  A Korean code page is checked when available,
   because that is the case students on Korean Windows actually hit. */

#include <QTextCodec>
#include <QtTest>

#include "edu/core/edu_path_encoding.h"
#include "edu_test.h"

class TestPathEncoding : public QObject {
  Q_OBJECT

 private slots:
  void asciiIsLosslessEverywhere();
  void hangulIsLostInLatin1();
  void hangulSurvivesUtf8();
  void lostCharactersAreListedOnceInOrder();
  void nonBmpCharacterIsReportedWhole();
  void hangulSurvivesKoreanCodePage();
  void nullCodecIsNeverLossless();
};

static const QTextCodec* latin1() {
  return QTextCodec::codecForName("ISO-8859-1");
}

static const QTextCodec* utf8() { return QTextCodec::codecForName("UTF-8"); }

// U+1F600 GRINNING FACE: outside the BMP, two UTF-16 code units.
static QString grinningFace() {
  const uint codePoint = 0x1F600;
  return QString::fromUcs4(&codePoint, 1);
}

void TestPathEncoding::asciiIsLosslessEverywhere() {
  const QString path = QString::fromUtf8("C:/Users/student/mips/hello.s");
  QVERIFY(latin1() != 0);
  QVERIFY(edu::isLosslessIn(path, latin1()));
  QVERIFY(edu::isLosslessIn(path, utf8()));
  QCOMPARE(edu::unrepresentableIn(path, latin1()), QString());
}

void TestPathEncoding::hangulIsLostInLatin1() {
  const QString path = QString::fromUtf8("C:/Users/홍길동/mips/hello.s");
  QVERIFY(!edu::isLosslessIn(path, latin1()));
  QCOMPARE(edu::unrepresentableIn(path, latin1()), QString::fromUtf8("홍길동"));
}

void TestPathEncoding::hangulSurvivesUtf8() {
  const QString path = QString::fromUtf8("/home/홍길동/과제/hello.s");
  QVERIFY(edu::isLosslessIn(path, utf8()));
  QCOMPARE(edu::unrepresentableIn(path, utf8()), QString());
}

// Each lost character once, in order of first appearance, so that the
// message stays short for a path like "한글한글한글".
void TestPathEncoding::lostCharactersAreListedOnceInOrder() {
  const QString path = QString::fromUtf8("a/한글/b/글한/c");
  QCOMPARE(edu::unrepresentableIn(path, latin1()), QString::fromUtf8("한글"));
}

// U+1F600 is two UTF-16 units; the report must not split it.
void TestPathEncoding::nonBmpCharacterIsReportedWhole() {
  const QString grin = grinningFace();
  const QString path = QString::fromUtf8("x/") + grin + QString::fromUtf8("/y.s");
  QCOMPARE(grin.size(), 2);
  QVERIFY(!edu::isLosslessIn(path, latin1()));
  QCOMPARE(edu::unrepresentableIn(path, latin1()), grin);
  QCOMPARE(edu::unrepresentableIn(path, latin1()).size(), 2);
}

void TestPathEncoding::hangulSurvivesKoreanCodePage() {
  const QTextCodec* cp949 = QTextCodec::codecForName("CP949");
  if (cp949 == 0) {
    cp949 = QTextCodec::codecForName("EUC-KR");
  }
  if (cp949 == 0) {
    QSKIP("no Korean codec in this Qt build");
  }
  const QString hangul = QString::fromUtf8("C:/Users/홍길동/mips/hello.s");
  QVERIFY(edu::isLosslessIn(hangul, cp949));

  // ... but a character outside the code page is still caught.
  const QString grin = grinningFace();
  QVERIFY(!edu::isLosslessIn(hangul + grin, cp949));
  QCOMPARE(edu::unrepresentableIn(hangul + grin, cp949), grin);
}

void TestPathEncoding::nullCodecIsNeverLossless() {
  QVERIFY(!edu::isLosslessIn(QString("abc"), 0));
}

EDU_TEST_FACTORY(TestPathEncoding)

#include "tst_path_encoding.moc"
