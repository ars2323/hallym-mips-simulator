/* QtSpim-Edu: the inspector's text for one instruction (PLAN R3).

       lw $4, 0($29)                     I-type
       0x8fa40000  at 0x00400024
       31  26 25-21 20-16 15             0
       100011 11101 00100 0000000000000000
       opcode rs    rt    immediate
       35     29    4     0
       lw     $sp   $a0   0x0000

   One column per field of the decoded word: its bit range, its bits, its
   name, its value, and what the value means (instruction name for opcode /
   funct, register name for a register number, hex or "x4" for an offset).
   Branches and jumps get their destination.  In SPIM's default branch mode
   there is also the note agreed at the stage-4 checkpoint; it is prose, not
   a table, and comes separately (instructionNoteLines) so that the widget
   can set it in a proportional font with word wrap.

   Pure text layout, QtCore only; the detail lines are meant for a
   fixed-pitch font.  The table part never exceeds kInstructionTextColumns
   characters, so it fits the inspector without wrapping; a destination line
   with a long label may be wrapped by the widget.
*/

#ifndef EDU_INSTRUCTION_TEXT_H
#define EDU_INSTRUCTION_TEXT_H

#include <QString>
#include <QStringList>

#include "edu/core/edu_decoder.h"

namespace edu {

enum { kInstructionTextColumns = 44 };

// `decoded` should come from decode(word, address, convention) so that a
// branch or jump carries its destination; `address` is where the instruction
// sits (the "PC" of the destination formula).  `disassembly` is the core's text for the
// instruction ("lw $4, 0($29)"); `destinationLabel` is the label the source
// named, or empty.
QStringList instructionDetailLines(const DecodedInstruction& decoded,
                                   quint32 address,
                                   const QString& disassembly,
                                   const QString& destinationLabel,
                                   BranchConvention convention);

// The explanation that goes with a branch in SPIM's default mode (Korean,
// then English); empty for everything else.
QStringList instructionNoteLines(const DecodedInstruction& decoded,
                                 BranchConvention convention);

}  // namespace edu

#endif  // EDU_INSTRUCTION_TEXT_H
