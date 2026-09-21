/* QtSpim-Edu: tokens of one line of SPIM assembly, for the editor's syntax
   highlighting (PLAN R4).

   Which words are instructions and which are directives is not decided
   here: the list is the core's own keyword table, CPU/op.h, compiled in with
   a macro that keeps only each entry's name and kind.  So what the editor
   colours as an instruction is exactly what the assembler accepts as one,
   pseudo instructions included.

   QtCore only.
*/

#ifndef EDU_MIPS_SYNTAX_H
#define EDU_MIPS_SYNTAX_H

#include <QList>
#include <QString>

namespace edu {

struct SyntaxToken {
  enum Kind {
    Comment,          // # to the end of the line
    String,           // "..." with \ escapes; 'c' character literals
    Directive,        // .data .word ...      (CPU/op.h, ASM_DIR)
    Instruction,      // add li syscall ...   (CPU/op.h, everything else)
    Register,         // $t0 $29 $f12
    LabelDefinition,  // name:  at the start of the line
    Identifier,       // any other name: a label being referred to
    Number            // 10 -4 0x10010000 1.5e3
  };
  int start;
  int length;
  Kind kind;
};

// Whitespace, commas, parentheses and the like produce no token.  A '$'
// word that is not a register ("$foo") and a '.' word that is not a
// directive (".Lloop", legal in a label) come out as Identifier.
QList<SyntaxToken> tokenizeMipsLine(const QString& line);

bool isMipsInstruction(const QString& word);  // case sensitive, as the core is
bool isMipsDirective(const QString& word);
int mipsKeywordCount();                       // entries in CPU/op.h

}  // namespace edu

#endif  // EDU_MIPS_SYNTAX_H
