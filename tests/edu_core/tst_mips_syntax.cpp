/* edu/core/edu_mips_syntax: the editor's tokens. */

#include <QtTest>

#include "edu/core/edu_mips_syntax.h"
#include "edu_test.h"

using edu::SyntaxToken;

namespace {

const char* kindName(SyntaxToken::Kind kind) {
  switch (kind) {
    case SyntaxToken::Comment:         return "comment";
    case SyntaxToken::String:          return "string";
    case SyntaxToken::Directive:       return "directive";
    case SyntaxToken::Instruction:     return "instruction";
    case SyntaxToken::Register:        return "register";
    case SyntaxToken::LabelDefinition: return "labeldef";
    case SyntaxToken::Identifier:      return "identifier";
    case SyntaxToken::Number:          return "number";
  }
  return "?";
}

// "labeldef[main:] instruction[li] register[$v0] number[4] comment[# x]"
QString show(const QString& line) {
  QStringList parts;
  const QList<SyntaxToken> tokens = edu::tokenizeMipsLine(line);
  for (int i = 0; i < tokens.size(); i += 1) {
    parts << QString("%1[%2]")
                 .arg(kindName(tokens.at(i).kind))
                 .arg(line.mid(tokens.at(i).start, tokens.at(i).length));
  }
  return parts.join(" ");
}

}  // namespace

class TestMipsSyntax : public QObject {
  Q_OBJECT

 private slots:
  void keywordTableIsTheCores();
  void helloworldLines();
  void labels();
  void registers();
  void numbers();
  void stringsAndComments();
  void tokensStayInsideTheLine();
};

void TestMipsSyntax::keywordTableIsTheCores() {
  QCOMPARE(edu::mipsKeywordCount(), 381);  // OP( lines in CPU/op.h
  QVERIFY(edu::isMipsInstruction("add"));
  QVERIFY(edu::isMipsInstruction("syscall"));
  QVERIFY(edu::isMipsInstruction("li"));      // pseudo
  QVERIFY(edu::isMipsInstruction("la"));
  QVERIFY(edu::isMipsInstruction("move"));
  QVERIFY(edu::isMipsInstruction("bnez"));
  QVERIFY(edu::isMipsInstruction("c.eq.d"));
  QVERIFY(edu::isMipsInstruction("l.d"));
  QVERIFY(!edu::isMipsInstruction("ADD"));    // the assembler is case sensitive
  QVERIFY(!edu::isMipsInstruction("main"));
  QVERIFY(!edu::isMipsInstruction(".data"));
  QVERIFY(edu::isMipsDirective(".data"));
  QVERIFY(edu::isMipsDirective(".asciiz"));
  QVERIFY(edu::isMipsDirective(".globl"));
  QVERIFY(!edu::isMipsDirective(".bogus"));
  QVERIFY(!edu::isMipsDirective("add"));
}

void TestMipsSyntax::helloworldLines() {
  QCOMPARE(show("main:   li $v0, 4       # syscall 4 (print_str)"),
           QString("labeldef[main:] instruction[li] register[$v0] number[4] "
                   "comment[# syscall 4 (print_str)]"));
  QCOMPARE(show("msg:   .asciiz \"Hello World\""),
           QString("labeldef[msg:] directive[.asciiz] string[\"Hello World\"]"));
  QCOMPARE(show("\t.extern foobar 4"),
           QString("directive[.extern] identifier[foobar] number[4]"));
  QCOMPARE(show("        lw $t1, foobar"),
           QString("instruction[lw] register[$t1] identifier[foobar]"));
  QCOMPARE(show("\tlw $a0 0($sp)\t\t# argc"),
           QString("instruction[lw] register[$a0] number[0] register[$sp] "
                   "comment[# argc]"));
  QCOMPARE(show(""), QString());
  QCOMPARE(show("   \t "), QString());
}

void TestMipsSyntax::labels() {
  QCOMPARE(show("loop: next : addi $t0, $t0, -1"),
           QString("labeldef[loop:] labeldef[next :] instruction[addi] "
                   "register[$t0] register[$t0] number[-1]"));
  // Only at the start: after an instruction "x:" is not a definition.
  QCOMPARE(show("b done"), QString("instruction[b] identifier[done]"));
  // A label may be spelled like an instruction; with the colon it is a label.
  QCOMPARE(show("add: add $t0, $t0, $t1"),
           QString("labeldef[add:] instruction[add] register[$t0] "
                   "register[$t0] register[$t1]"));
  QCOMPARE(show(".Lx: .word .Lx"),
           QString("labeldef[.Lx:] directive[.word] identifier[.Lx]"));
  QCOMPARE(show("size = 16"), QString("identifier[size] number[16]"));
}

void TestMipsSyntax::registers() {
  QCOMPARE(show("$zero $0 $31 $ra $fp $s8 $f0 $f31"),
           QString("register[$zero] register[$0] register[$31] register[$ra] "
                   "register[$fp] register[$s8] register[$f0] register[$f31]"));
  QCOMPARE(show("$32 $f32 $foo $"),
           QString("identifier[$32] identifier[$f32] identifier[$foo] "
                   "identifier[$]"));
}

void TestMipsSyntax::numbers() {
  QCOMPARE(show(".word 10, -4, 0x10010000, 0XFF, +7"),
           QString("directive[.word] number[10] number[-4] number[0x10010000] "
                   "number[0XFF] number[+7]"));
  QCOMPARE(show(".double 1.5e-3, 2.0"),
           QString("directive[.double] number[1.5e-3] number[2.0]"));
  // "-" between operands is not a sign glued to a name.
  QCOMPARE(show("la $t0, buf-4"),
           QString("instruction[la] register[$t0] identifier[buf] number[-4]"));
  QCOMPARE(show("lw $t0, 0xe-4($sp)"),
           QString("instruction[lw] register[$t0] number[0xe] number[-4] "
                   "register[$sp]"));
}

void TestMipsSyntax::stringsAndComments() {
  QCOMPARE(show(".asciiz \"a # not a comment\" # a comment"),
           QString("directive[.asciiz] string[\"a # not a comment\"] "
                   "comment[# a comment]"));
  QCOMPARE(show(".asciiz \"say \\\"hi\\\"\\n\""),
           QString("directive[.asciiz] string[\"say \\\"hi\\\"\\n\"]"));
  QCOMPARE(show("li $t0, 'a'  # char"),
           QString("instruction[li] register[$t0] string['a'] comment[# char]"));
  QCOMPARE(show(".asciiz \"unterminated"),
           QString("directive[.asciiz] string[\"unterminated]"));
  QCOMPARE(show("# li $v0, 4"), QString("comment[# li $v0, 4]"));
  // Hangul in a comment and in a string.
  QCOMPARE(show(QString::fromUtf8("syscall # 출력")),
           QString::fromUtf8("instruction[syscall] comment[# 출력]"));
  QCOMPARE(show(QString::fromUtf8(".asciiz \"안녕\"")),
           QString::fromUtf8("directive[.asciiz] string[\"안녕\"]"));
}

void TestMipsSyntax::tokensStayInsideTheLine() {
  const char* lines[] = {"\"", "'", "$", "-", "0x", "a:", ":", "\\", "\"\\",
                         "label:#c", "1e", "1e+", "x = -", ".", "$$$$"};
  for (unsigned l = 0; l < sizeof(lines) / sizeof(lines[0]); l += 1) {
    const QString line = QString::fromLatin1(lines[l]);
    const QList<SyntaxToken> tokens = edu::tokenizeMipsLine(line);
    int end = 0;
    for (int i = 0; i < tokens.size(); i += 1) {
      QVERIFY2(tokens.at(i).start >= end, lines[l]);  // ordered, no overlap
      QVERIFY2(tokens.at(i).length > 0, lines[l]);
      end = tokens.at(i).start + tokens.at(i).length;
      QVERIFY2(end <= line.size(), lines[l]);
    }
  }
}

EDU_TEST_FACTORY(TestMipsSyntax)

#include "tst_mips_syntax.moc"
