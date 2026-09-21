# QtSpim-Edu unit tests.
#
# Build out of tree, like the application:
#
#   mkdir -p build-tests && cd build-tests
#   qmake ../tests/tests.pro && make -j$(nproc) && make check
#
# Every test target lives in its own subdirectory so that "make check" runs
# them all and reports per-target results.

TEMPLATE = subdirs

SUBDIRS = edu_core
