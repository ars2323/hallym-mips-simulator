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
           ../../QtSpim/edu/core/edu_instruction_text.cpp
HEADERS += ../../QtSpim/edu/core/edu_path_encoding.h \
           ../../QtSpim/edu/core/edu_format.h \
           ../../QtSpim/edu/core/edu_registers.h \
           ../../QtSpim/edu/core/edu_decoder.h \
           ../../QtSpim/edu/core/edu_instruction_text.h \
           ../../QtSpim/edu/edu_version.h

# Tests.
SOURCES += tst_edu_core.cpp \
           tst_version.cpp \
           tst_path_encoding.cpp \
           tst_format.cpp \
           tst_registers.cpp \
           tst_decoder.cpp \
           tst_instruction_text.cpp

# tst_registers.cpp reads the core's tables out of CPU/*.
DEFINES += EDU_SOURCE_ROOT=\\\"$$clean_path($$PWD/../..)\\\"
HEADERS += ../edu_test.h

# Test sources contain Korean text in string literals.
win32-msvc: QMAKE_CXXFLAGS += /utf-8
