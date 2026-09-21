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

SOURCES += tst_edu_core.cpp \
           tst_version.cpp

HEADERS += ../testregistry.h \
           ../../QtSpim/edu/edu_version.h
