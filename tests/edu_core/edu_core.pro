# Unit tests for QtSpim/edu/core — pure logic, no GUI.
#
# These link against QtCore and QtTest only.  Anything that needs QtWidgets
# does not belong here.

QT       += testlib
QT       -= gui
CONFIG   += console testcase
CONFIG   -= app_bundle
TEMPLATE  = app
TARGET    = tst_edu_core

INCLUDEPATH += $$PWD/.. $$PWD/../../QtSpim $$PWD/../../CPU

# Code under test.
SOURCES += ../../QtSpim/edu/core/edu_path_encoding.cpp \
           ../../QtSpim/edu/core/edu_format.cpp \
           ../../QtSpim/edu/core/edu_registers.cpp \
           ../../QtSpim/edu/core/edu_decoder.cpp \
           ../../QtSpim/edu/core/edu_instruction_text.cpp \
           ../../QtSpim/edu/core/edu_source_text.cpp \
           ../../QtSpim/edu/core/edu_symbols.cpp \
           ../../QtSpim/edu/core/edu_memory_rows.cpp \
           ../../QtSpim/edu/core/edu_memory_text.cpp \
           ../../QtSpim/edu/core/edu_mips_syntax.cpp \
           ../../QtSpim/edu/core/edu_asm_errors.cpp \
           ../../QtSpim/edu/core/edu_text_file.cpp
HEADERS += ../../QtSpim/edu/core/edu_path_encoding.h \
           ../../QtSpim/edu/core/edu_format.h \
           ../../QtSpim/edu/core/edu_registers.h \
           ../../QtSpim/edu/core/edu_decoder.h \
           ../../QtSpim/edu/core/edu_instruction_text.h \
           ../../QtSpim/edu/core/edu_source_text.h \
           ../../QtSpim/edu/core/edu_symbols.h \
           ../../QtSpim/edu/core/edu_memory_rows.h \
           ../../QtSpim/edu/core/edu_memory_text.h \
           ../../QtSpim/edu/core/edu_mips_syntax.h \
           ../../QtSpim/edu/core/edu_asm_errors.h \
           ../../QtSpim/edu/core/edu_text_file.h \
           ../../QtSpim/edu/edu_version.h

# Tests.
SOURCES += tst_edu_core.cpp \
           tst_version.cpp \
           tst_path_encoding.cpp \
           tst_format.cpp \
           tst_registers.cpp \
           tst_decoder.cpp \
           tst_instruction_text.cpp \
           tst_source_text.cpp \
           tst_symbols.cpp \
           tst_memory_rows.cpp \
           tst_memory_text.cpp \
           tst_mips_syntax.cpp \
           tst_asm_errors.cpp \
           tst_text_file.cpp

# tst_registers.cpp reads the core's tables out of CPU/*.
DEFINES += EDU_SOURCE_ROOT=\\\"$$clean_path($$PWD/../..)\\\"
HEADERS += ../edu_test.h

# Test sources contain Korean text in string literals.
win32-msvc: QMAKE_CXXFLAGS += /utf-8
