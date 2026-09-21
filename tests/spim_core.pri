# The SPIM simulator core, for test binaries that use it as an oracle.
#
# Mirrors the core-related parts of QtSpim/QtSpim.pro (sources, bison/flex
# setup and the per-platform flags the core needs).  If that file changes how
# the core is built, this one has to follow.  Nothing under CPU/ is modified:
# the parser and scanner are generated into the build directory.

CPU_DIR = $$PWD/../CPU

INCLUDEPATH += $$CPU_DIR

YACCSOURCES += $$CPU_DIR/parser.y
LEXSOURCES  += $$CPU_DIR/scanner.l

SOURCES += $$CPU_DIR/data.cpp \
           $$CPU_DIR/display-utils.cpp \
           $$CPU_DIR/inst.cpp \
           $$CPU_DIR/mem.cpp \
           $$CPU_DIR/run.cpp \
           $$CPU_DIR/spim-utils.cpp \
           $$CPU_DIR/string-stream.cpp \
           $$CPU_DIR/sym-tbl.cpp \
           $$CPU_DIR/syscall.cpp

QMAKE_YACC             = bison
QMAKE_YACCFLAGS        = --defines=parser_yacc.h --output=parser_yacc.cpp
QMAKE_YACCFLAGS_MANGLE = -p yy
QMAKE_YACC_HEADER      = parser_yacc.h
QMAKE_YACC_SOURCE      = parser_yacc.cpp

QMAKE_LEX              = flex
QMAKE_LEXFLAGS_MANGLE  = -Pyy
QMAKE_LEXFLAGS         = -I -8 --outfile=lex.scanner.c

linux-g++ {
  # The core passes string literals as char* throughout.
  QMAKE_CXXFLAGS += -Wno-write-strings
  # yacc.prf "moves" parser_yacc.h onto itself, which GNU mv refuses.
  QMAKE_MOVE = touch
}

win32-msvc {
  DEFINES += _CRT_SECURE_NO_WARNINGS
  QMAKE_CXXFLAGS += /utf-8
  QMAKE_YACC = win_bison
  QMAKE_LEX  = win_flex
  QMAKE_CXXFLAGS_RELEASE -= -Zc:strictStrings
  QMAKE_CXXFLAGS_RELEASE_WITH_DEBUGINFO -= -Zc:strictStrings
  QMAKE_CXXFLAGS += -Zc:strictStrings-
}
