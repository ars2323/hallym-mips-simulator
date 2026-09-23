/* QtSpim-Edu: 32-bit MIPS instruction word -> format, fields, name and
   branch/jump destination (PLAN R3, stage 4).  Pure logic, QtCore only.

   The decoder looks at the word and nothing else.  The simulator core is
   NOT linked in here; tests/edu_oracle links both and checks this decoder
   against the core over the core's whole instruction table and over every
   instruction of the upstream test programs.

   Format (stage-1 checkpoint decision: from the word alone, never from
   op.h's operand-shape classes):

       opcode 0x00 (SPECIAL)         R
       opcode 0x1c (SPECIAL2)        R    -- mul, clz...: same field layout
       opcode 0x02, 0x03             J
       opcode 0x10 (COP0)            CP0
       opcode 0x11 (COP1)            FI if the fmt field is 8 (bc1f/bc1t...),
                                     otherwise FR
       everything else               I

   Names cover what SPIM 9.1.24 can assemble and execute.  The MIPS32
   Release 2 instructions listed in op.h are rejected by SPIM's own parser
   ("not implemented. Instruction ignored"), so they decode as unknown here
   too.  Where SPIM's encoding differs from the MIPS32 manual, SPIM wins,
   because SPIM produced the words a student is looking at; the differences
   are listed in docs/ARCHITECTURE.md.
*/

#ifndef EDU_DECODER_H
#define EDU_DECODER_H

#include <QList>
#include <QString>
#include <QtGlobal>

namespace edu {

struct InstructionField {
  QString name;   // "opcode", "rs", "immediate", ...
  int high;       // most significant bit, 31..0
  int low;        // least significant bit
  quint32 value;  // the bits, right-aligned

  int width() const { return high - low + 1; }
};

// How a branch's 16-bit offset relates to its destination.
//
// SPIM assembles and executes branches differently depending on its
// "delayed branches" setting (CPU/run.cpp BRANCH_INST, CPU/sym-tbl.cpp
// resolve_a_label_sub):
//
//   off (QtSpim's default)  destination = PC     + (offset << 2)
//   on  (bare machine)      destination = PC + 4 + (offset << 2)   <- MIPS
//
// so the same source line yields a different word in the two modes, and the
// textbook formula only holds in the second.
enum BranchConvention { SpimNoDelaySlot, MipsDelaySlot };

struct DecodedInstruction {
  enum Format { R, I, J, Cp0, FR, FI };
  enum Kind { Plain, Branch, Jump };

  quint32 word;
  Format format;
  Kind kind;
  bool known;    // false: no instruction SPIM implements has this encoding
  QString name;  // mnemonic as SPIM spells it ("addu", "c.eq.d"); empty if !known

  // Raw bit fields, always extracted, whatever the format.
  int opcode;      // [31:26]
  int rs;          // [25:21]  (fmt in FR/FI)
  int rt;          // [20:16]  (ft)
  int rd;          // [15:11]  (fs)
  int shamt;       // [10:6]   (fd)
  int funct;       // [5:0]
  quint32 imm;     // [15:0], zero-extended
  qint32 simm;     // [15:0], sign-extended
  quint32 target;  // [25:0]

  // The fields that make up this format, most significant first.  They tile
  // the word exactly: reassemble() gives back `word`.
  QList<InstructionField> fields;

  // Branch or jump destination; meaningful only when hasDestination.
  bool hasDestination;
  quint32 destination;
};

// Decodes without a PC: hasDestination is false.
DecodedInstruction decode(quint32 word);

// Decodes an instruction located at `pc`.  Branches get
// pc (+4 under MipsDelaySlot) + (simm << 2); j/jal get
// (pc & 0xf0000000) | (target << 2), which is how SPIM computes it.
DecodedInstruction decode(quint32 word, quint32 pc, BranchConvention convention);

// ORs the fields back together.
quint32 reassemble(const DecodedInstruction& instruction);

// "R", "I", "J", "CP0", "FR", "FI".
QString formatName(DecodedInstruction::Format format);

// "lui" -> "Load Upper Immediate".  Empty for an instruction whose name is
// a word already ("add", "or", "nop"): spelling those out says nothing.
QString mnemonicExpansion(const QString& name);

// The format rule on its own.
DecodedInstruction::Format formatOf(quint32 word);

}  // namespace edu

#endif  // EDU_DECODER_H
