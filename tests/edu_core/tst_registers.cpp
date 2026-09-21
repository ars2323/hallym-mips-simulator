/* edu/core/edu_registers against the simulator core's own tables.

   The core is not linked into this test binary (that is stage 4's oracle
   harness); instead the two facts needed are read straight out of the core's
   source files, which this fork never edits: the name table in
   CPU/display-utils.cpp and the CP0 register numbers in CPU/reg.h. */

#include <QFile>
#include <QRegExp>
#include <QSet>
#include <QtTest>

#include "edu/core/edu_registers.h"
#include "edu_test.h"

#ifndef EDU_SOURCE_ROOT
#error "EDU_SOURCE_ROOT must point at the repository root"
#endif

class TestRegisters : public QObject {
  Q_OBJECT

 private slots:
  void namesMatchTheCoreExceptZeroAndFp();
  void cp0NumbersMatchTheCore();
  void everyRegisterIsInExactlyOneGroup();
  void groupsAreThePlannedOnes();
  void labels();
  void lookup_data();
  void lookup();
};

static QString readSource(const char* relativePath) {
  QFile file(QString::fromLocal8Bit(EDU_SOURCE_ROOT) + QLatin1Char('/') +
             QString::fromLatin1(relativePath));
  if (!file.open(QIODevice::ReadOnly)) {
    return QString();
  }
  return QString::fromLatin1(file.readAll());
}

void TestRegisters::namesMatchTheCoreExceptZeroAndFp() {
  const QString source = readSource("CPU/display-utils.cpp");
  QVERIFY2(!source.isEmpty(), "cannot read CPU/display-utils.cpp");

  QRegExp table("int_reg_names\\[32\\]\\s*=\\s*\\{([^}]*)\\}");
  QVERIFY(table.indexIn(source) >= 0);
  QStringList coreNames;
  QRegExp name("\"([a-z0-9]+)\"");
  int pos = 0;
  const QString body = table.cap(1);
  while ((pos = name.indexIn(body, pos)) >= 0) {
    coreNames << name.cap(1);
    pos += name.matchedLength();
  }
  QCOMPARE(coreNames.size(), 32);

  for (int n = 0; n < 32; n += 1) {
    QCOMPARE(edu::generalRegisterCoreName(n), coreNames.at(n));
    if (n == 0) {
      QCOMPARE(edu::generalRegisterName(n), QString("$zero"));
    } else if (n == 30) {
      QCOMPARE(edu::generalRegisterName(n), QString("$fp"));
    } else {
      QCOMPARE(edu::generalRegisterName(n), QString("$") + coreNames.at(n));
    }
  }
  QCOMPARE(edu::generalRegisterName(-1), QString());
  QCOMPARE(edu::generalRegisterName(32), QString());
}

void TestRegisters::cp0NumbersMatchTheCore() {
  const QString source = readSource("CPU/reg.h");
  QVERIFY2(!source.isEmpty(), "cannot read CPU/reg.h");

  const char* const names[] = {"BadVAddr", "Status", "Cause", "EPC"};
  for (int i = 0; i < 4; i += 1) {
    QRegExp define(QString("#define CP0_%1_Reg\\s+(\\d+)").arg(names[i]));
    QVERIFY2(define.indexIn(source) >= 0, names[i]);
    edu::RegisterRef reg;
    QVERIFY(edu::findRegister(QString::fromLatin1(names[i]), &reg));
    QCOMPARE(reg.kind, edu::RegisterRef::Cp0);
    QCOMPARE(reg.number, define.cap(1).toInt());
    QCOMPARE(edu::registerName(reg), QString::fromLatin1(names[i]));
  }
}

void TestRegisters::everyRegisterIsInExactlyOneGroup() {
  QSet<QString> seen;
  int general = 0;
  const QList<edu::RegisterGroup> groups = edu::registerGroups();
  for (int g = 0; g < groups.size(); g += 1) {
    for (int r = 0; r < groups.at(g).registers.size(); r += 1) {
      const edu::RegisterRef reg = groups.at(g).registers.at(r);
      const QString name = edu::registerName(reg);
      QVERIFY(!name.isEmpty());
      QVERIFY2(!seen.contains(name), qPrintable(name + " listed twice"));
      seen.insert(name);
      if (reg.kind == edu::RegisterRef::General) {
        general += 1;
      }
    }
  }
  QCOMPARE(general, 32);
  QCOMPARE(seen.size(), 32 + 3 + 4);  // general + PC/HI/LO + four CP0
}

void TestRegisters::groupsAreThePlannedOnes() {
  QStringList summary;
  const QList<edu::RegisterGroup> groups = edu::registerGroups();
  for (int g = 0; g < groups.size(); g += 1) {
    QStringList names;
    for (int r = 0; r < groups.at(g).registers.size(); r += 1) {
      names << edu::registerName(groups.at(g).registers.at(r));
    }
    summary << groups.at(g).title + ": " + names.join(" ");
  }
  QCOMPARE(summary.join("\n"),
           QString("Special: PC HI LO\n"
                   "Return values: $v0 $v1\n"
                   "Arguments: $a0 $a1 $a2 $a3\n"
                   "Temporaries: $t0 $t1 $t2 $t3 $t4 $t5 $t6 $t7 $t8 $t9\n"
                   "Saved: $s0 $s1 $s2 $s3 $s4 $s5 $s6 $s7\n"
                   "Pointers: $gp $sp $fp $ra\n"
                   "Reserved: $zero $at $k0 $k1\n"
                   "CP0: Status Cause EPC BadVAddr"));
}

void TestRegisters::labels() {
  const edu::RegisterRef t0(edu::RegisterRef::General, 8);
  QCOMPARE(edu::registerNumberLabel(t0), QString("R8"));
  QCOMPARE(edu::registerPromptName(t0), QString("R8"));
  const edu::RegisterRef pc(edu::RegisterRef::Pc, 0);
  QCOMPARE(edu::registerNumberLabel(pc), QString());
  QCOMPARE(edu::registerPromptName(pc), QString("PC"));
  const edu::RegisterRef status(edu::RegisterRef::Cp0, 12);
  QCOMPARE(edu::registerNumberLabel(status), QString("$12"));
  QCOMPARE(edu::registerPromptName(status), QString("Status"));
}

void TestRegisters::lookup_data() {
  QTest::addColumn<QString>("spelling");
  QTest::addColumn<QString>("expected");  // registerName(), empty = not found

  QTest::newRow("$t0") << "$t0" << "$t0";
  QTest::newRow("T0") << "T0" << "$t0";
  QTest::newRow("r8") << "r8" << "$t0";
  QTest::newRow("$8") << "$8" << "$t0";
  QTest::newRow("8") << "8" << "$t0";
  QTest::newRow("zero") << "zero" << "$zero";
  QTest::newRow("r0") << "r0" << "$zero";
  QTest::newRow("fp") << "$fp" << "$fp";
  QTest::newRow("s8") << "s8" << "$fp";
  QTest::newRow("31") << "31" << "$ra";
  QTest::newRow("pc") << "pc" << "PC";
  QTest::newRow("Hi") << "Hi" << "HI";
  QTest::newRow("STATUS") << "STATUS" << "Status";
  QTest::newRow("epc") << " epc " << "EPC";
  QTest::newRow("32") << "32" << "";
  QTest::newRow("-1") << "-1" << "";
  QTest::newRow("t10") << "t10" << "";
  QTest::newRow("empty") << "" << "";
  QTest::newRow("$") << "$" << "";
}

void TestRegisters::lookup() {
  QFETCH(QString, spelling);
  QFETCH(QString, expected);
  edu::RegisterRef reg;
  const bool found = edu::findRegister(spelling, &reg);
  QCOMPARE(found, !expected.isEmpty());
  if (found) {
    QCOMPARE(edu::registerName(reg), expected);
  }
}

EDU_TEST_FACTORY(TestRegisters)

#include "tst_registers.moc"
