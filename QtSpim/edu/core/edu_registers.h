/* QtSpim-Edu: which integer registers exist, what they are called, and how
   the register panel groups them (PLAN R1).

   The simulator core names the general registers "r0 at v0 ... s8 ra"
   (CPU/display-utils.cpp, int_reg_names).  Textbooks and students write
   $zero and $fp, so those two get their usual names here;
   tests/edu_core/tst_registers.cpp checks every other name against the
   core's table.  Pure data, QtCore only.
*/

#ifndef EDU_REGISTERS_H
#define EDU_REGISTERS_H

#include <QList>
#include <QString>

namespace edu {

struct RegisterRef {
  enum Kind { Pc, Hi, Lo, General, Cp0 };

  Kind kind;
  int number;  // General: 0..31.  Cp0: coprocessor-0 register number.

  RegisterRef() : kind(Pc), number(0) {}
  RegisterRef(Kind k, int n) : kind(k), number(n) {}
  bool operator==(const RegisterRef& other) const {
    return kind == other.kind && number == other.number;
  }
};

// "$t0"; "$zero" for 0 and "$fp" for 30.  Empty for numbers outside 0..31.
QString generalRegisterName(int number);

// The core's own spelling of the same register ("t0", "r0", "s8").
QString generalRegisterCoreName(int number);

// "PC", "HI", "LO", "$t0", "Status", "Cause", "EPC", "BadVAddr".
QString registerName(const RegisterRef& reg);

// The "number" column: "R8" for general registers (upstream's notation),
// "$12" for coprocessor-0 registers, empty for PC/HI/LO.
QString registerNumberLabel(const RegisterRef& reg);

// The name upstream's "Change Register Contents" prompt used: "R8", "PC",
// "Status", ...
QString registerPromptName(const RegisterRef& reg);

// Looks a register up by any of its spellings, case-insensitively and with
// or without the '$': "t0", "$T0", "r8", "R8", "8", "$8", "fp", "s8", "pc",
// "status"...  Returns false if nothing matches.
bool findRegister(const QString& spelling, RegisterRef* reg);

struct RegisterGroup {
  QString title;
  QString description;
  QList<RegisterRef> registers;
};

// The panel's groups, in display order.  Every register appears exactly once.
QList<RegisterGroup> registerGroups();

}  // namespace edu

#endif  // EDU_REGISTERS_H
