/* See edu_registers.h. */

#include "edu/core/edu_registers.h"

namespace edu {

namespace {

// Same order as the core's int_reg_names; [0] and [30] are the two
// deliberate differences (r0 -> zero, s8 -> fp).
const char* const kGeneralNames[32] = {
    "zero", "at", "v0", "v1", "a0", "a1", "a2", "a3", "t0", "t1", "t2",
    "t3",   "t4", "t5", "t6", "t7", "s0", "s1", "s2", "s3", "s4", "s5",
    "s6",   "s7", "t8", "t9", "k0", "k1", "gp", "sp", "fp", "ra"};

// Coprocessor-0 register numbers, as in CPU/reg.h (CP0_*_Reg).
const int kCp0BadVAddr = 8;
const int kCp0Status = 12;
const int kCp0Cause = 13;
const int kCp0Epc = 14;

QList<RegisterRef> generalRange(int first, int last) {
  QList<RegisterRef> list;
  for (int n = first; n <= last; n += 1) {
    list.append(RegisterRef(RegisterRef::General, n));
  }
  return list;
}

RegisterGroup makeGroup(const char* title, const char* description,
                        const QList<RegisterRef>& registers) {
  RegisterGroup group;
  group.title = QString::fromLatin1(title);
  group.description = QString::fromLatin1(description);
  group.registers = registers;
  return group;
}

}  // namespace

QString generalRegisterName(int number) {
  if (number < 0 || number > 31) {
    return QString();
  }
  return QString("$") + QString::fromLatin1(kGeneralNames[number]);
}

QString generalRegisterCoreName(int number) {
  if (number < 0 || number > 31) {
    return QString();
  }
  if (number == 0) {
    return QString("r0");
  }
  if (number == 30) {
    return QString("s8");
  }
  return QString::fromLatin1(kGeneralNames[number]);
}

QString registerName(const RegisterRef& reg) {
  switch (reg.kind) {
    case RegisterRef::Pc:
      return QString("PC");
    case RegisterRef::Hi:
      return QString("HI");
    case RegisterRef::Lo:
      return QString("LO");
    case RegisterRef::General:
      return generalRegisterName(reg.number);
    case RegisterRef::Cp0:
      switch (reg.number) {
        case kCp0BadVAddr:
          return QString("BadVAddr");
        case kCp0Status:
          return QString("Status");
        case kCp0Cause:
          return QString("Cause");
        case kCp0Epc:
          return QString("EPC");
        default:
          return QString();
      }
  }
  return QString();
}

QString registerNumberLabel(const RegisterRef& reg) {
  switch (reg.kind) {
    case RegisterRef::General:
      return QString("R%1").arg(reg.number);
    case RegisterRef::Cp0:
      return QString("$%1").arg(reg.number);
    default:
      return QString();
  }
}

QString registerPromptName(const RegisterRef& reg) {
  if (reg.kind == RegisterRef::General) {
    return QString("R%1").arg(reg.number);
  }
  return registerName(reg);
}

bool findRegister(const QString& spelling, RegisterRef* reg) {
  QString s = spelling.trimmed().toLower();
  if (s.startsWith(QLatin1Char('$'))) {
    s.remove(0, 1);
  }
  if (s.isEmpty()) {
    return false;
  }

  if (s == "pc") { *reg = RegisterRef(RegisterRef::Pc, 0); return true; }
  if (s == "hi") { *reg = RegisterRef(RegisterRef::Hi, 0); return true; }
  if (s == "lo") { *reg = RegisterRef(RegisterRef::Lo, 0); return true; }
  if (s == "status") { *reg = RegisterRef(RegisterRef::Cp0, kCp0Status); return true; }
  if (s == "cause") { *reg = RegisterRef(RegisterRef::Cp0, kCp0Cause); return true; }
  if (s == "epc") { *reg = RegisterRef(RegisterRef::Cp0, kCp0Epc); return true; }
  if (s == "badvaddr") { *reg = RegisterRef(RegisterRef::Cp0, kCp0BadVAddr); return true; }

  for (int n = 0; n < 32; n += 1) {
    if (s == QLatin1String(kGeneralNames[n]) || s == generalRegisterCoreName(n)) {
      *reg = RegisterRef(RegisterRef::General, n);
      return true;
    }
  }

  // "8", "r8"
  QString digits = s;
  if (digits.startsWith(QLatin1Char('r'))) {
    digits.remove(0, 1);
  }
  bool ok = false;
  const int number = digits.toInt(&ok, 10);
  if (ok && number >= 0 && number <= 31 && !digits.startsWith(QLatin1Char('+')) &&
      !digits.startsWith(QLatin1Char('-'))) {
    *reg = RegisterRef(RegisterRef::General, number);
    return true;
  }
  return false;
}

QList<RegisterGroup> registerGroups() {
  QList<RegisterGroup> groups;

  QList<RegisterRef> special;
  special << RegisterRef(RegisterRef::Pc, 0) << RegisterRef(RegisterRef::Hi, 0)
          << RegisterRef(RegisterRef::Lo, 0);
  groups << makeGroup("Special", "Program counter and the multiply/divide result registers",
                      special);

  groups << makeGroup("Return values", "$v0-$v1: function results; $v0 also selects the syscall",
                      generalRange(2, 3));
  groups << makeGroup("Arguments", "$a0-$a3: the first four arguments of a call",
                      generalRange(4, 7));

  QList<RegisterRef> temporaries = generalRange(8, 15);
  temporaries << generalRange(24, 25);
  groups << makeGroup("Temporaries", "$t0-$t9: not preserved across a call", temporaries);

  groups << makeGroup("Saved", "$s0-$s7: a callee must preserve these",
                      generalRange(16, 23));

  QList<RegisterRef> pointers = generalRange(28, 31);
  groups << makeGroup("Pointers", "$gp global pointer, $sp stack pointer, "
                                  "$fp frame pointer (= $s8), $ra return address",
                      pointers);

  QList<RegisterRef> reserved;
  reserved << RegisterRef(RegisterRef::General, 0) << RegisterRef(RegisterRef::General, 1)
           << RegisterRef(RegisterRef::General, 26) << RegisterRef(RegisterRef::General, 27);
  groups << makeGroup("Reserved", "$zero is always 0; $at belongs to the assembler; "
                                  "$k0-$k1 belong to the exception handler",
                      reserved);

  QList<RegisterRef> cp0;
  cp0 << RegisterRef(RegisterRef::Cp0, kCp0Status) << RegisterRef(RegisterRef::Cp0, kCp0Cause)
      << RegisterRef(RegisterRef::Cp0, kCp0Epc) << RegisterRef(RegisterRef::Cp0, kCp0BadVAddr);
  groups << makeGroup("CP0", "Coprocessor 0: exception and interrupt state", cp0);

  return groups;
}

}  // namespace edu
