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
SOURCES += ../../QtSpim/edu/core/edu_path_encoding.cpp
HEADERS += ../../QtSpim/edu/core/edu_path_encoding.h \
           ../../QtSpim/edu/edu_version.h

# Tests.
SOURCES += tst_edu_core.cpp \
           tst_version.cpp \
           tst_path_encoding.cpp
HEADERS += ../testregistry.h

# Test sources contain Korean text in string literals.
win32-msvc: QMAKE_CXXFLAGS += /utf-8
