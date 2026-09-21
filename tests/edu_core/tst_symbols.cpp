/* edu/core/edu_symbols: print_symbols() parsing and the label map. */

#include <QtTest>

#include "edu/core/edu_symbols.h"
#include "edu_test.h"

class TestSymbols : public QObject {
  Q_OBJECT

 private slots:
  void parsesTheCoresFormat();
  void ignoresEverythingElse();
  void mapByAddressAndName();
  void redefinitionMovesTheLabel();
};

// Real output of Simulator > Display Symbols after loading helloworld.s.
void TestSymbols::parsesTheCoresFormat() {
  const QList<edu::Symbol> symbols = edu::parseSymbolListing(
      "g\t__eoth at 0x00400024\n"
      "g\t__start at 0x00400000\n"
      "\tlocal_one at 0x10010004\n"
      "g\tmain at 0x00400024\n"
      "g\tfoobar at 0x10000000\n");
  QCOMPARE(symbols.size(), 5);
  QCOMPARE(symbols.at(0).name, QString("__eoth"));
  QCOMPARE(symbols.at(0).address, 0x00400024u);
  QVERIFY(symbols.at(0).global);
  QCOMPARE(symbols.at(2).name, QString("local_one"));
  QCOMPARE(symbols.at(2).address, 0x10010004u);
  QVERIFY(!symbols.at(2).global);
  QCOMPARE(symbols.at(4).address, 0x10000000u);
}

void TestSymbols::ignoresEverythingElse() {
  const QList<edu::Symbol> symbols = edu::parseSymbolListing(
      "Memory and registers cleared\n"
      "\n"
      "g\tmain at 0x0040\n"            // not eight digits
      "gmain at 0x00400024\n"          // no tab
      "g\tmain at 0x00400024 extra\n"  // trailing text
      "g\tok at 0x00400024\r\n");      // CRLF is fine
  QCOMPARE(symbols.size(), 1);
  QCOMPARE(symbols.at(0).name, QString("ok"));
}

void TestSymbols::mapByAddressAndName() {
  edu::LabelMap map;
  QVERIFY(map.isEmpty());
  map.add("msg", 0x10010000u);
  map.add("alias", 0x10010000u);
  map.add("nums", 0x10010010u);
  map.add("undefined", 0);  // address 0 = not defined in the core
  map.add("msg", 0x10010000u);  // twice is once
  QCOMPARE(map.size(), 3);

  QCOMPARE(map.labelsAt(0x10010000u), QStringList() << "alias" << "msg");
  QCOMPARE(map.labelsAt(0x10010004u), QStringList());

  quint32 address = 0;
  QVERIFY(map.find("nums", &address));
  QCOMPARE(address, 0x10010010u);
  QVERIFY(!map.find("undefined", &address));
  QVERIFY(!map.find("Nums", &address));  // labels are case sensitive

  const QList<QPair<quint32, QStringList> > in =
      map.labelsIn(0x10010000u, 0x10010010u);  // half open
  QCOMPARE(in.size(), 1);
  QCOMPARE(in.at(0).first, 0x10010000u);
}

void TestSymbols::redefinitionMovesTheLabel() {
  edu::LabelMap map;
  map.add("buf", 0x10010000u);
  map.add("buf", 0x10010020u);
  QCOMPARE(map.labelsAt(0x10010000u), QStringList());
  QCOMPARE(map.labelsAt(0x10010020u), QStringList() << "buf");
  QCOMPARE(map.size(), 1);
}

EDU_TEST_FACTORY(TestSymbols)

#include "tst_symbols.moc"
