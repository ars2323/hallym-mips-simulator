/* edu/core/edu_format: every number the GUI shows goes through these, so the
   boundary values are pinned here (PLAN, verification strategy 2). */

#include <QtTest>

#include "edu/core/edu_format.h"
#include "edu_test.h"

class TestFormat : public QObject {
  Q_OBJECT

 private slots:
  void values_data();
  void values();
  void rulerLinesUpWithGroupedBinary();
  void inBaseFollowsTheMenu();
  void parse_data();
  void parse();
  void parseLeavesValueAloneOnFailure();
  void formatThenParseRoundTrips_data();
  void formatThenParseRoundTrips();
};

void TestFormat::values_data() {
  QTest::addColumn<quint32>("value");
  QTest::addColumn<QString>("hex");
  QTest::addColumn<QString>("sdec");
  QTest::addColumn<QString>("udec");
  QTest::addColumn<QString>("bin");

  QTest::newRow("0") << quint32(0) << "0x00000000" << "0" << "0"
                     << "0000 0000 0000 0000 0000 0000 0000 0000";
  QTest::newRow("1") << quint32(1) << "0x00000001" << "1" << "1"
                     << "0000 0000 0000 0000 0000 0000 0000 0001";
  QTest::newRow("-1 / 0xFFFFFFFF")
      << quint32(0xFFFFFFFFu) << "0xffffffff" << "-1" << "4294967295"
      << "1111 1111 1111 1111 1111 1111 1111 1111";
  QTest::newRow("INT32_MAX") << quint32(0x7FFFFFFFu) << "0x7fffffff"
                             << "2147483647" << "2147483647"
                             << "0111 1111 1111 1111 1111 1111 1111 1111";
  QTest::newRow("INT32_MIN / 0x80000000")
      << quint32(0x80000000u) << "0x80000000" << "-2147483648" << "2147483648"
      << "1000 0000 0000 0000 0000 0000 0000 0000";
  QTest::newRow("-2") << quint32(0xFFFFFFFEu) << "0xfffffffe" << "-2"
                      << "4294967294"
                      << "1111 1111 1111 1111 1111 1111 1111 1110";
  QTest::newRow("text base 0x00400000")
      << quint32(0x00400000u) << "0x00400000" << "4194304" << "4194304"
      << "0000 0000 0100 0000 0000 0000 0000 0000";
  QTest::newRow("stack top-ish 0x7ffff10c")
      << quint32(0x7FFFF10Cu) << "0x7ffff10c" << "2147479820" << "2147479820"
      << "0111 1111 1111 1111 1111 0001 0000 1100";
  QTest::newRow("lw encoding 0x8fa40000")
      << quint32(0x8FA40000u) << "0x8fa40000" << "-1885077504" << "2409889792"
      << "1000 1111 1010 0100 0000 0000 0000 0000";
  QTest::newRow("alternating 0xAAAAAAAA")
      << quint32(0xAAAAAAAAu) << "0xaaaaaaaa" << "-1431655766" << "2863311530"
      << "1010 1010 1010 1010 1010 1010 1010 1010";
}

void TestFormat::values() {
  QFETCH(quint32, value);
  QFETCH(QString, hex);
  QFETCH(QString, sdec);
  QFETCH(QString, udec);
  QFETCH(QString, bin);

  QCOMPARE(edu::hex32(value), hex);
  QCOMPARE(edu::signedDec32(value), sdec);
  QCOMPARE(edu::unsignedDec32(value), udec);
  QCOMPARE(edu::bin32Grouped(value), bin);
  QCOMPARE(edu::bin32(value), QString(bin).remove(QLatin1Char(' ')));
  QCOMPARE(edu::bin32(value).size(), 32);
}

// Bit n of the value must sit under the label "n" of the ruler.
void TestFormat::rulerLinesUpWithGroupedBinary() {
  const QString ruler = edu::bitRuler32();
  QCOMPARE(ruler, QString("31   27   23   19   15   11   7    3  0"));
  QCOMPARE(ruler.size(), edu::bin32Grouped(0).size());

  const int labelled[] = {31, 27, 23, 19, 15, 11, 7, 3};
  for (int i = 0; i < 8; i += 1) {
    const int bit = labelled[i];
    const QString grouped = edu::bin32Grouped(quint32(1) << bit);
    const int column = grouped.indexOf(QLatin1Char('1'));
    QCOMPARE(ruler.mid(column, QString::number(bit).size()),
             QString::number(bit));
  }
  // Bit 0 is the last character of both lines.
  QCOMPARE(edu::bin32Grouped(1).indexOf(QLatin1Char('1')), ruler.size() - 1);
  QVERIFY(ruler.endsWith(QLatin1Char('0')));
}

void TestFormat::inBaseFollowsTheMenu() {
  const quint32 v = 0xFFFFFFF6u;  // -10
  QCOMPARE(edu::inBase32(v, 16), QString("0xfffffff6"));
  QCOMPARE(edu::inBase32(v, 10), QString("-10"));
  QCOMPARE(edu::inBase32(v, 2),
           QString("1111 1111 1111 1111 1111 1111 1111 0110"));
  QCOMPARE(edu::inBase32(v, 7), QString("0xfffffff6"));  // unknown -> hex
  QCOMPARE(edu::baseName(16), QString("Hex"));
  QCOMPARE(edu::baseName(10), QString("Dec"));
  QCOMPARE(edu::baseName(2), QString("Bin"));
}

void TestFormat::parse_data() {
  QTest::addColumn<QString>("text");
  QTest::addColumn<int>("base");
  QTest::addColumn<bool>("ok");
  QTest::addColumn<quint32>("value");

  QTest::newRow("dec 0") << "0" << 10 << true << quint32(0);
  QTest::newRow("dec -1") << "-1" << 10 << true << quint32(0xFFFFFFFFu);
  QTest::newRow("dec INT32_MIN") << "-2147483648" << 10 << true
                                 << quint32(0x80000000u);
  QTest::newRow("dec below INT32_MIN") << "-2147483649" << 10 << false
                                       << quint32(0);
  QTest::newRow("dec INT32_MAX") << "2147483647" << 10 << true
                                 << quint32(0x7FFFFFFFu);
  QTest::newRow("dec unsigned max") << "4294967295" << 10 << true
                                    << quint32(0xFFFFFFFFu);
  QTest::newRow("dec above 32 bits") << "4294967296" << 10 << false
                                     << quint32(0);
  QTest::newRow("dec with spaces") << "  42 " << 10 << true << quint32(42);
  QTest::newRow("dec rejects hex digits") << "1f" << 10 << false << quint32(0);
  QTest::newRow("hex plain") << "7ffff10c" << 16 << true
                             << quint32(0x7FFFF10Cu);
  QTest::newRow("hex 0x prefix") << "0x10010000" << 16 << true
                                 << quint32(0x10010000u);
  QTest::newRow("hex upper case") << "FFFFFFFF" << 16 << true
                                  << quint32(0xFFFFFFFFu);
  QTest::newRow("hex 9 digits") << "100000000" << 16 << false << quint32(0);
  QTest::newRow("hex negative") << "-1" << 16 << false << quint32(0);
  QTest::newRow("hex garbage") << "xyz" << 16 << false << quint32(0);
  QTest::newRow("bin") << "1010" << 2 << true << quint32(10);
  QTest::newRow("bin 32 ones") << "11111111111111111111111111111111" << 2
                               << true << quint32(0xFFFFFFFFu);
  QTest::newRow("bin 33 digits") << "100000000000000000000000000000000" << 2
                                 << false << quint32(0);
  QTest::newRow("bin rejects 2") << "102" << 2 << false << quint32(0);
  QTest::newRow("empty") << "" << 16 << false << quint32(0);
  QTest::newRow("blank") << "   " << 10 << false << quint32(0);
  QTest::newRow("unsupported base") << "17" << 8 << false << quint32(0);
}

void TestFormat::parse() {
  QFETCH(QString, text);
  QFETCH(int, base);
  QFETCH(bool, ok);
  QFETCH(quint32, value);

  quint32 parsed = 0;
  QCOMPARE(edu::parseValue32(text, base, &parsed), ok);
  if (ok) {
    QCOMPARE(parsed, value);
  }
}

void TestFormat::parseLeavesValueAloneOnFailure() {
  quint32 value = 1234;
  QVERIFY(!edu::parseValue32(QString("nope"), 16, &value));
  QCOMPARE(value, quint32(1234));
}

void TestFormat::formatThenParseRoundTrips_data() {
  QTest::addColumn<quint32>("value");
  QTest::newRow("0") << quint32(0);
  QTest::newRow("1") << quint32(1);
  QTest::newRow("0x7fffffff") << quint32(0x7FFFFFFFu);
  QTest::newRow("0x80000000") << quint32(0x80000000u);
  QTest::newRow("0xffffffff") << quint32(0xFFFFFFFFu);
  QTest::newRow("0x12345678") << quint32(0x12345678u);
}

// What the panel shows can be typed back into the Change Value dialog.
void TestFormat::formatThenParseRoundTrips() {
  QFETCH(quint32, value);
  quint32 parsed = ~value;
  QVERIFY(edu::parseValue32(edu::hex32(value), 16, &parsed));
  QCOMPARE(parsed, value);
  QVERIFY(edu::parseValue32(edu::signedDec32(value), 10, &parsed));
  QCOMPARE(parsed, value);
  QVERIFY(edu::parseValue32(edu::unsignedDec32(value), 10, &parsed));
  QCOMPARE(parsed, value);
  QVERIFY(edu::parseValue32(edu::bin32(value), 2, &parsed));
  QCOMPARE(parsed, value);
}

EDU_TEST_FACTORY(TestFormat)

#include "tst_format.moc"
