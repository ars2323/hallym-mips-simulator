# Oracle tests: edu/core checked against the real SPIM core, which is linked
# into this binary (and only this one).  PLAN.md, verification strategy 1.

QT       += testlib
QT       -= gui
CONFIG   += console testcase
CONFIG   -= app_bundle
TEMPLATE  = app
TARGET    = tst_edu_oracle

INCLUDEPATH += $$PWD/.. $$PWD/../../QtSpim

include(../spim_core.pri)

# Code under test.
SOURCES += ../../QtSpim/edu/core/edu_decoder.cpp
HEADERS += ../../QtSpim/edu/core/edu_decoder.h

# The front-end functions the core expects, and the tests.
SOURCES += core_frontend_stubs.cpp \
           tst_decoder_oracle.cpp
HEADERS += core_frontend_stubs.h

DEFINES += EDU_SOURCE_ROOT=\\\"$$clean_path($$PWD/../..)\\\"
