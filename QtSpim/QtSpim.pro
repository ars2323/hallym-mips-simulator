#  SPIM S20 MIPS simulator.
#  Qt interface for SPIM simulator.
#
#  Copyright (c) 1990-2020, James R. Larus.
#  All rights reserved.
#
#  Redistribution and use in source and binary forms, with or without modification,
#  are permitted provided that the following conditions are met:
#
#  Redistributions of source code must retain the above copyright notice,
#  this list of conditions and the following disclaimer.
#
#  Redistributions in binary form must reproduce the above copyright notice,
#  this list of conditions and the following disclaimer in the documentation and/or
#  other materials provided with the distribution.
#
#  Neither the name of the James R. Larus nor the names of its contributors may be
#  used to endorse or promote products derived from this software without specific
#  prior written permission.
#
#  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
#  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
#  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
#  ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
#  LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
#  CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE
#  GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
#  HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
#  LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY
#  OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
#

#-------------------------------------------------
#
# Project created by QtCreator 2010-07-11T10:46:07
#
#-------------------------------------------------

cache()

QT       += core widgets printsupport

# EDU: different executable name so this build can be installed next to the
# standard QtSpim. The name lives in edu/edu_version.h (EDU_TARGET_NAME) too;
# keep the two in sync.
TARGET = HallymMIPS
TEMPLATE = app


YACCSOURCES = ../CPU/parser.y
LEXSOURCES  = ../CPU/scanner.l

SOURCES += main.cpp\
        edu/core/edu_path_encoding.cpp\
        edu/edu_path_check.cpp\
        edu/core/edu_format.cpp\
        edu/core/edu_registers.cpp\
        edu/core/edu_decoder.cpp\
        edu/core/edu_instruction_text.cpp\
        edu/core/edu_source_text.cpp\
        edu/edu_text_model.cpp\
        edu/edu_text_view.cpp\
        edu/core/edu_symbols.cpp\
        edu/core/edu_memory_rows.cpp\
        edu/core/edu_memory_text.cpp\
        edu/edu_data_model.cpp\
        edu/edu_data_view.cpp\
        edu/edu_loader.cpp\
        edu/core/edu_mips_syntax.cpp\
        edu/core/edu_asm_errors.cpp\
        edu/core/edu_text_file.cpp\
        edu/core/edu_tutorial_layout.cpp\
        edu/edu_code_editor.cpp\
        edu/edu_editor_dock.cpp\
        edu/edu_editor_glue.cpp\
        edu/edu_register_model.cpp\
        edu/edu_register_view.cpp\
        edu/edu_inspector.cpp\
        edu/edu_tutorial.cpp\
        edu/edu_spimview_glue.cpp\
        edu/theme/edu_theme.cpp\
        edu/theme/edu_splash.cpp\
        edu/edu_about.cpp\
        spimview.cpp\
        menu.cpp\
        regwin.cpp\
        textwin.cpp\
        datawin.cpp\
        state.cpp\
        console.cpp\
        ../CPU/data.cpp\
        ../CPU/display-utils.cpp\
        ../CPU/inst.cpp\
        ../CPU/mem.cpp\
        ../CPU/run.cpp\
        ../CPU/spim-utils.cpp\
        ../CPU/string-stream.cpp\
        ../CPU/sym-tbl.cpp\
        ../CPU/syscall.cpp\
        spim_support.cpp


HEADERS  += spimview.h\
        edu/edu_version.h\
        edu/core/edu_path_encoding.h\
        edu/edu_path_check.h\
        edu/core/edu_format.h\
        edu/core/edu_registers.h\
        edu/core/edu_decoder.h\
        edu/core/edu_instruction_text.h\
        edu/core/edu_source_text.h\
        edu/edu_text_model.h\
        edu/edu_text_view.h\
        edu/core/edu_symbols.h\
        edu/core/edu_memory_rows.h\
        edu/core/edu_memory_text.h\
        edu/edu_data_model.h\
        edu/edu_data_view.h\
        edu/edu_loader.h\
        edu/core/edu_mips_syntax.h\
        edu/core/edu_asm_errors.h\
        edu/core/edu_text_file.h\
        edu/core/edu_tutorial_layout.h\
        edu/edu_code_editor.h\
        edu/edu_editor_dock.h\
        edu/edu_register_model.h\
        edu/edu_register_view.h\
        edu/edu_inspector.h\
        edu/edu_tutorial.h\
        edu/theme/tokens.h\
        edu/theme/edu_theme.h\
        edu/theme/edu_splash.h\
        edu/edu_about.h\
        regtextedit.h\
        texttextedit.h\
        datatextedit.h\
        spim_settings.h\
        settablecheckbox.h\
        console.h


FORMS    += spimview.ui\
        savelogfile.ui\
        printwindows.ui\
        runparams.ui\
        settings.ui\
        changevalue.ui \
        breakpoint.ui


INCLUDEPATH = ../CPU ../QtSpim


RESOURCES = exception.qrc edu/theme/theme.qrc  # EDU: windows_images.qrc (upstream bitmaps) replaced by the theme

# EDU: the theme resource carries the two bundled font families (15 MB);
# resources_big makes rcc emit them in a form MSVC compiles without choking.
CONFIG += resources_big

win32:RC_FILE = edu/theme/brand/HallymMIPS.rc  # EDU: was qtspim.rc
win32:LIBS += -lshell32 -ldwmapi              # EDU: AppUserModelID, title bar


# EDU: development-only build option.
#
#   qmake CONFIG+=edu_devtools ../QtSpim/QtSpim.pro
#
# adds a scripted screenshot mode (see edu/edu_devtools.h).  Release builds
# must not set it -- nothing below is compiled in without it.
#
edu_devtools {
  DEFINES += EDU_DEVTOOLS
  SOURCES += edu/edu_devtools.cpp
  HEADERS += edu/edu_devtools.h
}


QMAKE_YACC          = bison
QMAKE_YACCFLAGS     = --defines=parser_yacc.h --output=parser_yacc.cpp
QMAKE_YACCFLAGS_MANGLE = -p yy
QMAKE_YACC_HEADER   = parser_yacc.h
QMAKE_YACC_SOURCE   = parser_yacc.cpp

QMAKE_LEX           = flex
QMAKE_LEXFLAGS_MANGLE = -Pyy
QMAKE_LEXFLAGS      = -I -8 --outfile=lex.scanner.c


# Help file
#
# EDU: everything below is generated into the shadow-build directory only.
# The vanilla rule ran qcollectiongenerator with its working directory set to
# ../QtSpim/help, which made it write qtspim.qch and qtspim.qhc back into the
# source tree.  qhelpgenerator resolves <applicationIcon> and <register><file>
# relative to the .qhcp itself, so instead of moving the generator we move the
# .qhcp: a copy with an absolute icon path is written into the build tree next
# to the generated qtspim.qch, and the generator is pointed at that copy.  The
# resulting .qhc registers the documentation as plain "qtspim.qch" (no partial
# paths), so the help files stay relocatable at install time.
#
HELP_PROJ           = help/HallymMIPS.qhp
buildcompressedhelp.name    = Build compressed help
buildcompressedhelp.input   = HELP_PROJ
buildcompressedhelp.output  = help/${QMAKE_FILE_BASE}.qch
buildcompressedhelp.commands= qhelpgenerator ${QMAKE_FILE_IN} -o ${QMAKE_FILE_OUT}
buildcompressedhelp.CONFIG  = no_link recursive

# EDU: build-tree copy of the collection project.  Written at qmake time so the
# relative <applicationIcon> path of the original still resolves.  Re-running
# qmake is required after editing help/qtspim.qhcp; QMAKE_INTERNAL_INCLUDED_FILES
# makes make do that automatically.
#
HELP_COL_SRC        = $$PWD/help/HallymMIPS.qhcp
HELP_COL_GEN        = $$OUT_PWD/help/HallymMIPS.qhcp
QMAKE_INTERNAL_INCLUDED_FILES += $$HELP_COL_SRC
mkpath($$OUT_PWD/help)
HELP_COL_TEXT       = $$cat($$HELP_COL_SRC, blob)
HELP_COL_TEXT       = $$replace(HELP_COL_TEXT, "\\.\\./edu/theme/brand/", "$$PWD/edu/theme/brand/")
write_file($$HELP_COL_GEN, HELP_COL_TEXT)|error("Cannot write $$HELP_COL_GEN")

HELP_COL_PROJ       = help/HallymMIPS.qhcp
buildhelpcollection.name    = Build help collection
buildhelpcollection.input   = HELP_COL_PROJ
buildhelpcollection.output  = help/${QMAKE_FILE_BASE}.qhc
buildhelpcollection.commands= qhelpgenerator help/${QMAKE_FILE_BASE}.qhcp -o ${QMAKE_FILE_OUT}
buildhelpcollection.depends = help/HallymMIPS.qch
buildhelpcollection.CONFIG  = no_link recursive

QMAKE_EXTRA_COMPILERS       += buildcompressedhelp buildhelpcollection
POST_TARGETDEPS             += help/HallymMIPS.qch help/HallymMIPS.qhc


# Microsoft Visual C compiler flags
#
win32-msvc2008 {
  # Compile all files as C++
  #
  QMAKE_CFLAGS_DEBUG    += -TP
  QMAKE_CFLAGS_RELEASE  += -TP

  # Disable security warnings
  #
  DEFINES += _CRT_SECURE_NO_WARNINGS
}
win32-msvc2010 {
  # Compile all files as C++
  #
  QMAKE_CFLAGS_DEBUG    += -TP
  QMAKE_CFLAGS_RELEASE  += -TP

  # Disable security warnings
  #
  DEFINES += _CRT_SECURE_NO_WARNINGS
}
win32-msvc2012 {
  # Compile all files as C++
  #
  QMAKE_CFLAGS_DEBUG    += -TP
  QMAKE_CFLAGS_RELEASE  += -TP

  # Disable security warnings
  #
  DEFINES += _CRT_SECURE_NO_WARNINGS
}

# EDU: MSVC 2015 and later use the single "win32-msvc" mkspec, so none of the
# version-specific blocks above match a Qt 5.15 / MSVC 2019 build.
#
win32-msvc {
  # Disable security warnings, as the blocks above do.
  DEFINES += _CRT_SECURE_NO_WARNINGS

  # Our sources under edu/ are UTF-8 and contain Korean text in string
  # literals; without this MSVC would read them in the system code page.
  QMAKE_CXXFLAGS += /utf-8

  # winflexbison (choco install winflexbison3) installs the tools under these
  # names.  lex.prf recognises "flex" in the name and uses the -o form.
  QMAKE_YACC = win_bison
  QMAKE_LEX  = win_flex

  # Qt's MSVC mkspec adds -Zc:strictStrings to release builds, which makes
  # every "literal" passed to a char* parameter an error.  The SPIM core does
  # that throughout (error("..."), int_reg_names[], ...), and it is not ours
  # to change, so the pre-2013 behaviour is restored.
  QMAKE_CXXFLAGS_RELEASE -= -Zc:strictStrings
  QMAKE_CXXFLAGS_RELEASE_WITH_DEBUGINFO -= -Zc:strictStrings
  QMAKE_CXXFLAGS += -Zc:strictStrings-
}


# gcc flags
#
win32-g++ {
  # Compile all files as C++
  # Surpress gcc warning about deprecated conversion from string constant to char*
  #
  QMAKE_CFLAGS_DEBUG    += -Wno-write-strings
  QMAKE_CFLAGS_RELEASE  += -Wno-write-strings
  QMAKE_CXXFLAGS_DEBUG  += -Wno-write-strings
  QMAKE_CXXFLAGS_RELEASE += -Wno-write-strings

  # Surpress error when deleting non-existent file.
  #
  QMAKE_DEL_FILE = rm -f
  QMAKE_MOVE = mv
  QMAKE_COPY = cp
}

linux-g++-32 {
  # Compile all files as C++
  # Surpress gcc warning about deprecated conversion from string constant to char*
  #
  QMAKE_CFLAGS_DEBUG    += -Wno-write-strings
  QMAKE_CFLAGS_RELEASE  += -Wno-write-strings
  QMAKE_CXXFLAGS_DEBUG  += -Wno-write-strings
  QMAKE_CXXFLAGS_RELEASE += -Wno-write-strings

  # Libraries will be installed in standard location
  QMAKE_RPATHDIR = /usr/lib/qtspim/lib

  # Surpress error when deleting non-existent file.
  #
  QMAKE_DEL_FILE = rm -f
}

linux-g++ {
  QMAKE_CFLAGS_DEBUG   += -Wno-write-strings
  QMAKE_CFLAGS_RELEASE += -Wno-write-strings
  QMAKE_CXXFLAGS_DEBUG += -Wno-write-strings
  QMAKE_CXXFLAGS_RELEASE += -Wno-write-strings

  # Libraries will be installed in standard location
  QMAKE_RPATHDIR = /usr/lib/qtspim/lib

  # Surpress error when deleting non-existent file.
  #
  QMAKE_DEL_FILE = rm -f

  # This seems really stupid, but the only place that MOVE is invoked is to move parser_yacc.h on
  # to itself, which fails with gnuutils, since they raises an error if you try to mv (or cp) a
  # file onto itself. Pretty pointless, and no way to turn it off...
  QMAKE_MOVE = touch

  # Do not add -lGL, since this requires installation of OpenCL libraries,
  # which are already installed with QtCreator.
  QMAKE_LIBS_OPENGL = 
}

macx-g++ {
  # Compile all files as C++
  # Surpress gcc warning about deprecated conversion from string constant to char*
  #
  QMAKE_CFLAGS_DEBUG    += -Wno-write-strings -Wno-deprecated-register
  QMAKE_CFLAGS_RELEASE  += -Wno-write-strings -Wno-deprecated-register
  QMAKE_CXXFLAGS_DEBUG  += -Wno-write-strings -Wno-deprecated-register
  QMAKE_CXXFLAGS_RELEASE += -Wno-write-strings -Wno-deprecated-register

  # Surpress error when deleting non-existent file.
  #
  QMAKE_DEL_FILE = rm -f
  QMAKE_INFO_PLIST = macinfo.plist

  ICON = edu/theme/brand/HallymMIPS.icns  # EDU
}

macx-clang {
  # Compile all files as C++
  # Surpress gcc warning about deprecated conversion from string constant to char*
  #
  QMAKE_CFLAGS_DEBUG    += -Wno-write-strings -Wno-deprecated-register
  QMAKE_CFLAGS_RELEASE  += -Wno-write-strings -Wno-deprecated-register
  QMAKE_CXXFLAGS_DEBUG  += -Wno-write-strings -Wno-deprecated-register
  QMAKE_CXXFLAGS_RELEASE += -Wno-write-strings -Wno-deprecated-register

  # Surpress error when deleting non-existent file.
  #
  QMAKE_DEL_FILE = rm -f
  QMAKE_INFO_PLIST = macinfo.plist

  ICON = edu/theme/brand/HallymMIPS.icns  # EDU
}
