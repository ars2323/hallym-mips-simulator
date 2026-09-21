# eduReadAssemblyFile() (QtSpim/edu/edu_loader.cpp) against the core's own
# read_assembly_file(), with the real SPIM core linked in.

QT       += testlib
QT       -= gui
CONFIG   += console testcase
CONFIG   -= app_bundle
TEMPLATE  = app
TARGET    = tst_edu_loader

INCLUDEPATH += $$PWD/.. $$PWD/../../QtSpim $$PWD/../edu_oracle

include(../spim_core.pri)

# Code under test.
SOURCES += ../../QtSpim/edu/edu_loader.cpp \
           ../../QtSpim/edu/core/edu_symbols.cpp
HEADERS += ../../QtSpim/edu/edu_loader.h \
           ../../QtSpim/edu/core/edu_symbols.h

# The front-end functions the core expects (shared with edu_oracle).
SOURCES += ../edu_oracle/core_frontend_stubs.cpp \
           tst_loader.cpp
HEADERS += ../edu_oracle/core_frontend_stubs.h

DEFINES += EDU_SOURCE_ROOT=\\\"$$clean_path($$PWD/../..)\\\"
