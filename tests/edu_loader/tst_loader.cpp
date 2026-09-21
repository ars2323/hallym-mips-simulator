/* eduReadAssemblyFile() is the core's read_assembly_file() with the file's
   labels kept (QtSpim/edu/edu_loader.h).  Two things are checked, on every
   program in Tests/ and on the samples:

   1. It leaves the simulator in the state read_assembly_file() leaves it
      in: same instructions, same data, same segment bounds, same error
      messages, same symbol table afterwards.  That includes files that stop
      assembling at a syntax error half way.
   2. It sees every label the source defines, local ones included.
*/

#include <QtTest>

#include <QFile>
#include <QRegExp>
#include <QSet>

#include "../CPU/spim.h"
#include "../CPU/string-stream.h"
#include "../CPU/spim-utils.h"
#include "../CPU/inst.h"
#include "../CPU/reg.h"
#include "../CPU/mem.h"
#include "../CPU/sym-tbl.h"

#include "core_frontend_stubs.h"
#include "edu/core/edu_symbols.h"
#include "edu/edu_loader.h"

#ifndef EDU_SOURCE_ROOT
#error "EDU_SOURCE_ROOT must point at the repository root"
#endif

extern bool bare_machine;
extern bool accept_pseudo_insts;
extern bool delayed_branches;
extern bool delayed_loads;

namespace {

QString sourcePath(const QString& relative) {
  return QString::fromLocal8Bit(EDU_SOURCE_ROOT) + QLatin1Char('/') + relative;
}

struct Machine {
  QStringList errors;
  QStringList text;      // the core's own line for every instruction
  QList<quint32> data;   // non-zero words as address, value pairs
  quint32 textTop, dataTop, kTextTop, kDataTop;
  QString symbolsAfter;  // print_symbols() once the load is over
  bool opened;

  bool operator==(const Machine& o) const {
    return errors == o.errors && text == o.text && data == o.data &&
           textTop == o.textTop && dataTop == o.dataTop &&
           kTextTop == o.kTextTop && kDataTop == o.kDataTop &&
           symbolsAfter == o.symbolsAfter && opened == o.opened;
  }
};

void startWorld(bool bare, bool delayed, bool handler) {
  message_out.i = 1;
  console_out.i = 2;
  bare_machine = bare;
  accept_pseudo_insts = !bare;
  delayed_branches = delayed;
  delayed_loads = delayed;
  if (handler) {
    initialize_world(sourcePath("CPU/exceptions.s").toLocal8Bit().data(), false);
  } else {
    initialize_world(NULL, false);
  }
  takeCoreErrors();
}

Machine snapshot(bool opened) {
  Machine m;
  m.opened = opened;
  m.errors = takeCoreErrors();
  m.textTop = text_top;
  m.dataTop = data_top;
  m.kTextTop = k_text_top;
  m.kDataTop = k_data_top;

  str_stream ss;
  ss_init(&ss);
  const mem_addr text[2][2] = {{TEXT_BOT, text_top}, {K_TEXT_BOT, k_text_top}};
  for (int s = 0; s < 2; s += 1) {
    for (mem_addr a = text[s][0]; a < text[s][1]; a += 4) {
      instruction* inst = read_mem_inst(a);
      if (inst != NULL) {
        format_an_inst(&ss, inst, a);
        m.text << QString::fromLocal8Bit(ss_to_string(&ss));
        ss_clear(&ss);
      }
    }
  }
  const mem_addr data[2][2] = {{DATA_BOT, data_top}, {K_DATA_BOT, k_data_top}};
  for (int s = 0; s < 2; s += 1) {
    for (mem_addr a = data[s][0]; a < data[s][1]; a += 4) {
      const quint32 word = quint32(read_mem_word(a));
      if (word != 0) {
        m.data << quint32(a) << word;
      }
    }
  }

  eduOutputCapture = &m.symbolsAfter;
  print_symbols();
  eduOutputCapture = NULL;
  return m;
}

// Labels a source file defines, as the scanner sees them: identifiers
// ([a-zA-Z_.][a-zA-Z0-9_.]*, CPU/scanner.l) followed by ':' at the start of
// a line.  Comments are cut first; a '#' inside a string literal is not one.
struct SourceLabels {
  QMap<QString, int> definedAtLine;  // name -> first line
  QSet<QString> otherNames;          // .extern / .comm / .lcomm / name = value
};

SourceLabels labelsInSource(const QString& path) {
  SourceLabels result;
  QFile file(path);
  if (!file.open(QIODevice::ReadOnly)) {
    return result;
  }
  const QList<QByteArray> lines = file.readAll().split('\n');
  QRegExp label("^\\s*([a-zA-Z_.][a-zA-Z0-9_.]*)\\s*:");
  QRegExp other("^\\s*\\.(extern|comm|lcomm)\\s+([a-zA-Z_.][a-zA-Z0-9_.]*)");
  QRegExp constant("^\\s*([a-zA-Z_.][a-zA-Z0-9_.]*)\\s*=");
  for (int n = 0; n < lines.size(); n += 1) {
    QString line = QString::fromLatin1(lines.at(n));
    bool inString = false;
    for (int i = 0; i < line.size(); i += 1) {
      if (line.at(i) == '"' && (i == 0 || line.at(i - 1) != '\\')) {
        inString = !inString;
      } else if (line.at(i) == '#' && !inString) {
        line.truncate(i);
        break;
      }
    }
    while (label.indexIn(line) == 0) {
      if (!result.definedAtLine.contains(label.cap(1))) {
        result.definedAtLine.insert(label.cap(1), n + 1);
      }
      line.remove(0, label.matchedLength());
    }
    if (other.indexIn(line) == 0) {
      result.otherNames << other.cap(2);
    }
    if (constant.indexIn(line) == 0) {
      result.otherNames << constant.cap(1);
    }
  }
  return result;
}

// "syntax error on line N": the parser stops there (read_assembly_file()'s
// loop ends when yyparse() fails), so nothing after line N is assembled.
int firstSyntaxErrorLine(const QStringList& errors) {
  QRegExp rx("syntax error on line (\\d+) ");
  for (int i = 0; i < errors.size(); i += 1) {
    if (rx.indexIn(errors.at(i)) >= 0) {
      return rx.cap(1).toInt();
    }
  }
  return 0;
}

}  // namespace

class TestLoader : public QObject {
  Q_OBJECT

 private slots:
  void programs_data();
  void programs();
  void stopsWhereTheCoreStops();
  void missingFile();
};

void TestLoader::programs_data() {
  QTest::addColumn<QString>("file");
  QTest::addColumn<bool>("bare");
  QTest::addColumn<bool>("delayed");
  QTest::addColumn<bool>("handler");

  // Every program in Tests/, with the flags spim/Makefile's test targets
  // use where it has one, and again in the GUI's default mode (where the
  // bare-machine programs produce a long list of errors: also worth
  // comparing).
  QTest::newRow("helloworld.s") << "helloworld.s" << false << false << true;
  QTest::newRow("tt.core.s") << "Tests/tt.core.s" << false << false << true;
  QTest::newRow("tt.le.s") << "Tests/tt.le.s" << false << false << true;
  QTest::newRow("tt.be.s") << "Tests/tt.be.s" << false << false << true;
  QTest::newRow("tt.dir.s") << "Tests/tt.dir.s" << false << false << true;
  QTest::newRow("tt.io.s") << "Tests/tt.io.s" << false << false << true;
  QTest::newRow("read.s") << "Tests/read.s" << false << false << true;
  QTest::newRow("time.s") << "Tests/time.s" << false << false << true;
  QTest::newRow("timer.s") << "Tests/timer.s" << false << false << true;
  QTest::newRow("tt.bare.s") << "Tests/tt.bare.s" << false << true << false;
  QTest::newRow("tt.alu.bare.s") << "Tests/tt.alu.bare.s" << true << true << false;
  QTest::newRow("tt.fpu.bare.s") << "Tests/tt.fpu.bare.s" << true << true << false;
  QTest::newRow("tt.alu.bare.s, default mode")
      << "Tests/tt.alu.bare.s" << false << false << true;
  QTest::newRow("helloworld.s, bare machine")
      << "helloworld.s" << true << false << true;
  QTest::newRow("data-stack.s") << "tests/samples/data-stack.s" << false << false << true;
  QTest::newRow("bare-branch.s") << "tests/samples/bare-branch.s" << true << true << false;
  QTest::newRow("syntax-error-midfile.s")
      << "tests/samples/syntax-error-midfile.s" << false << false << true;
}

void TestLoader::programs() {
  QFETCH(QString, file);
  QFETCH(bool, bare);
  QFETCH(bool, delayed);
  QFETCH(bool, handler);
  const QByteArray path = sourcePath(file).toLocal8Bit();
  QVERIFY2(QFile::exists(sourcePath(file)), path.constData());

  // 1. Same machine as after the core's own loader.
  startWorld(bare, delayed, handler);
  QByteArray name = path;
  const Machine core = snapshot(read_assembly_file(name.data()));

  startWorld(bare, delayed, handler);
  QString listing;
  name = path;
  const Machine ours = snapshot(eduReadAssemblyFile(name.data(), &listing));

  QCOMPARE(ours.errors, core.errors);
  QCOMPARE(ours.text, core.text);
  QVERIFY(ours.data == core.data);
  QCOMPARE(ours.symbolsAfter, core.symbolsAfter);
  QVERIFY(ours == core);
  QVERIFY(!core.text.isEmpty());

  // 2. Every label the source defines is in the listing, with an address.
  QMap<QString, quint32> captured;
  const QList<edu::Symbol> symbols = edu::parseSymbolListing(listing);
  for (int i = 0; i < symbols.size(); i += 1) {
    if (symbols.at(i).address != 0) {
      captured.insert(symbols.at(i).name, symbols.at(i).address);
    }
  }
  const SourceLabels source = labelsInSource(sourcePath(file));
  const int stop = firstSyntaxErrorLine(core.errors);

  int expected = 0;
  QStringList missing;
  for (QMap<QString, int>::const_iterator it = source.definedAtLine.constBegin();
       it != source.definedAtLine.constEnd(); ++it) {
    if (stop != 0 && it.value() > stop) {
      QVERIFY2(!captured.contains(it.key()),
               qPrintable(it.key() + " is after the syntax error"));
      continue;
    }
    if (stop != 0 && it.value() == stop && !captured.contains(it.key())) {
      continue;  // the broken line's own label may or may not make it
    }
    expected += 1;
    if (!captured.contains(it.key())) {
      missing << it.key();
    }
  }
  QVERIFY2(missing.isEmpty(), qPrintable("not captured: " + missing.join(" ")));
  QVERIFY(expected > 0);

  // ... and nothing else is, apart from the handler's and the file's
  // globals, .extern / .comm names and constants.
  QSet<QString> handlerNames;
  if (handler) {
    const SourceLabels inHandler = labelsInSource(sourcePath("CPU/exceptions.s"));
    handlerNames = inHandler.otherNames;
    const QList<QString> defined = inHandler.definedAtLine.keys();
    for (int i = 0; i < defined.size(); i += 1) {
      handlerNames << defined.at(i);
    }
  }
  int capturedFromFile = 0;
  QStringList unexpected;
  for (QMap<QString, quint32>::const_iterator it = captured.constBegin();
       it != captured.constEnd(); ++it) {
    if (source.definedAtLine.contains(it.key())) {
      capturedFromFile += 1;
    } else if (!source.otherNames.contains(it.key()) &&
               !handlerNames.contains(it.key())) {
      unexpected << it.key();
    }
  }
  QVERIFY2(unexpected.isEmpty(), qPrintable("unexpected: " + unexpected.join(" ")));
  QCOMPARE(capturedFromFile, expected);  // labels defined == labels captured
}

// Check (b) of the decision: a syntax error half way.
void TestLoader::stopsWhereTheCoreStops() {
  startWorld(false, false, true);
  QByteArray name = sourcePath("tests/samples/syntax-error-midfile.s").toLocal8Bit();
  QString listing;
  QVERIFY(eduReadAssemblyFile(name.data(), &listing));
  const QStringList errors = takeCoreErrors();
  QCOMPARE(errors.size(), 1);
  QVERIFY2(errors.at(0).contains("syntax error on line 10 of file"),
           qPrintable(errors.at(0)));

  QMap<QString, quint32> captured;
  const QList<edu::Symbol> symbols = edu::parseSymbolListing(listing);
  for (int i = 0; i < symbols.size(); i += 1) {
    captured.insert(symbols.at(i).name, symbols.at(i).address);
  }
  QVERIFY(captured.value("before") != 0);
  QVERIFY(captured.value("main") != 0);
  QVERIFY(captured.value("first") != 0);
  QVERIFY(captured.value("broken") != 0);  // recorded before the error
  QVERIFY(!captured.contains("after"));
  QVERIFY(!captured.contains("never"));
}

void TestLoader::missingFile() {
  startWorld(false, false, false);
  QByteArray name("/nonexistent/no-such-file.s");
  const bool coreOpened = read_assembly_file(name.data());
  const QStringList coreErrors = takeCoreErrors();

  QString listing("stale");
  name = "/nonexistent/no-such-file.s";
  QVERIFY(!eduReadAssemblyFile(name.data(), &listing));
  QVERIFY(!coreOpened);
  QCOMPARE(takeCoreErrors(), coreErrors);
  QCOMPARE(coreErrors.size(), 1);
  QVERIFY(listing.isEmpty());
}

QTEST_APPLESS_MAIN(TestLoader)

#include "tst_loader.moc"
