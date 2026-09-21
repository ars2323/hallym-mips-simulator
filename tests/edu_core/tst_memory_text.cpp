/* edu/core/edu_memory_text: Data panel cells, the inspector's memory view,
   and the Go To box. */

#include <QtTest>

#include "edu/core/edu_memory_text.h"
#include "edu_test.h"

class TestMemoryText : public QObject {
  Q_OBJECT

 private slots:
  void values_data();
  void values();
  void widthsCoverTheExtremes();
  void ascii();
  void detailLines();
  void goTo();
};

void TestMemoryText::values_data() {
  QTest::addColumn<quint32>("value");
  QTest::addColumn<int>("unit");
  QTest::addColumn<int>("base");
  QTest::addColumn<QString>("text");

  QTest::newRow("word hex") << 0x6c6c6548u << 4 << 16 << "6c6c6548";
  QTest::newRow("word hex zero") << 0u << 4 << 16 << "00000000";
  QTest::newRow("word dec negative") << 0xffffffffu << 4 << 10 << "-1";
  QTest::newRow("word dec min") << 0x80000000u << 4 << 10 << "-2147483648";
  QTest::newRow("word dec max") << 0x7fffffffu << 4 << 10 << "2147483647";
  QTest::newRow("word bin") << 5u << 4 << 2
                            << "00000000000000000000000000000101";
  QTest::newRow("half hex") << 0xabcdu << 2 << 16 << "abcd";
  QTest::newRow("half dec negative") << 0xabcdu << 2 << 10 << "-21555";
  QTest::newRow("half dec positive") << 0x1234u << 2 << 10 << "4660";
  QTest::newRow("half bin") << 0x8001u << 2 << 2 << "1000000000000001";
  QTest::newRow("byte hex") << 0x41u << 1 << 16 << "41";
  QTest::newRow("byte dec negative") << 0xffu << 1 << 10 << "-1";
  QTest::newRow("byte dec 127") << 0x7fu << 1 << 10 << "127";
  QTest::newRow("byte dec -128") << 0x80u << 1 << 10 << "-128";
  QTest::newRow("byte bin") << 0x05u << 1 << 2 << "00000101";
  // A sign-extended value from the core (read_mem_byte returns an int).
  QTest::newRow("byte from sign-extended int") << 0xffffff80u << 1 << 16 << "80";
  QTest::newRow("half from sign-extended int") << 0xffffabcdu << 2 << 16 << "abcd";
}

void TestMemoryText::values() {
  QFETCH(quint32, value);
  QFETCH(int, unit);
  QFETCH(int, base);
  QFETCH(QString, text);
  QCOMPARE(edu::memoryValueText(value, edu::MemoryUnit(unit), base), text);
}

void TestMemoryText::widthsCoverTheExtremes() {
  const int units[] = {1, 2, 4};
  const int bases[] = {2, 10, 16};
  const quint32 samples[] = {0u, 1u, 0x7fu, 0x80u, 0xffu, 0x7fffu, 0x8000u,
                             0xffffu, 0x7fffffffu, 0x80000000u, 0xffffffffu};
  for (int u = 0; u < 3; u += 1) {
    for (int b = 0; b < 3; b += 1) {
      for (unsigned s = 0; s < sizeof(samples) / sizeof(samples[0]); s += 1) {
        const edu::MemoryUnit unit = edu::MemoryUnit(units[u]);
        QVERIFY(edu::memoryValueText(samples[s], unit, bases[b]).size() <=
                edu::memoryValueWidth(unit, bases[b]));
      }
    }
  }
}

void TestMemoryText::ascii() {
  const quint8 bytes[] = {'H', 'i', ' ', '~', 0x00, 0x1f, 0x7f, 0x80, 0xff, '<'};
  QCOMPARE(edu::asciiText(bytes, 10), QString("Hi ~.....<"));
  QCOMPARE(edu::asciiText(bytes, 0), QString());
}

void TestMemoryText::detailLines() {
  const quint8 bytes[4] = {0x48, 0x65, 0x6c, 0x6c};
  QStringList lines = edu::memoryDetailLines(
      0x10010000u, 0x6c6c6548u, bytes, QStringList() << "msg", "User data",
      QStringList() << "$a0" << "$t0+1");
  QCOMPARE(lines.join("\n"),
           QString("0x10010000 | msg | User data\n"
                   "Hex       0x6c6c6548\n"
                   "Signed    1819043144\n"
                   "Unsigned  1819043144\n"
                   "31   27   23   19   15   11   7    3\n"
                   "0110 1100 0110 1100 0110 0101 0100 1000\n"
                   "Bytes     48 65 6c 6c  \"Hell\"\n"
                   "Pointers  $a0, $t0+1"));

  const quint8 zeros[4] = {0, 0, 0, 0};
  lines = edu::memoryDetailLines(0x7fffff84u, 0, zeros, QStringList(),
                                 "User stack", QStringList());
  QCOMPARE(lines.size(), 7);  // no Pointers line
  QCOMPARE(lines.at(0), QString("0x7fffff84 | User stack"));
  QCOMPARE(lines.at(6), QString("Bytes     00 00 00 00  \"....\""));
}

void TestMemoryText::goTo() {
  edu::LabelMap labels;
  labels.add("msg", 0x10010000u);
  labels.add("sp", 0x10010040u);        // a label that looks like a register
  labels.add("deadbeef", 0x10010080u);  // ... and one that looks like hex

  edu::GoToTarget t = edu::resolveGoTo(" $sp ", labels);
  QCOMPARE(t.kind, edu::GoToTarget::Register);
  QVERIFY(t.reg == edu::RegisterRef(edu::RegisterRef::General, 29));
  t = edu::resolveGoTo("$29", labels);
  QVERIFY(t.reg == edu::RegisterRef(edu::RegisterRef::General, 29));
  t = edu::resolveGoTo("$gp", labels);
  QVERIFY(t.reg == edu::RegisterRef(edu::RegisterRef::General, 28));
  QCOMPARE(edu::resolveGoTo("$nosuch", labels).kind, edu::GoToTarget::Invalid);

  t = edu::resolveGoTo("msg", labels);
  QCOMPARE(t.kind, edu::GoToTarget::Label);
  QCOMPARE(t.address, 0x10010000u);
  QCOMPARE(t.label, QString("msg"));
  // A label wins over a register name without "$" and over hex digits.
  QCOMPARE(edu::resolveGoTo("sp", labels).kind, edu::GoToTarget::Label);
  QCOMPARE(edu::resolveGoTo("deadbeef", labels).address, 0x10010080u);

  t = edu::resolveGoTo("0x10010004", labels);
  QCOMPARE(t.kind, edu::GoToTarget::Address);
  QCOMPARE(t.address, 0x10010004u);
  QCOMPARE(edu::resolveGoTo("10010004", labels).address, 0x10010004u);
  QCOMPARE(edu::resolveGoTo("7FFFFF84", labels).address, 0x7fffff84u);
  // "a0" is hex 0xa0 unless written "$a0".
  QCOMPARE(edu::resolveGoTo("a0", labels).kind, edu::GoToTarget::Address);
  QCOMPARE(edu::resolveGoTo("$a0", labels).kind, edu::GoToTarget::Register);

  // Without "$" and not hex: a register name still works.
  edu::LabelMap none;
  t = edu::resolveGoTo("fp", none);
  QCOMPARE(t.kind, edu::GoToTarget::Register);
  QVERIFY(t.reg == edu::RegisterRef(edu::RegisterRef::General, 30));

  QCOMPARE(edu::resolveGoTo("", none).kind, edu::GoToTarget::Invalid);
  QCOMPARE(edu::resolveGoTo("0x", none).kind, edu::GoToTarget::Invalid);
  QCOMPARE(edu::resolveGoTo("123456789", none).kind, edu::GoToTarget::Invalid);
  QCOMPARE(edu::resolveGoTo("no such label", none).kind,
           edu::GoToTarget::Invalid);
}

EDU_TEST_FACTORY(TestMemoryText)

#include "tst_memory_text.moc"
