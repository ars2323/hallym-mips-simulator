/* See core_frontend_stubs.h.  Counterpart of QtSpim/spim_support.cpp. */

#include "core_frontend_stubs.h"

#include <QString>
#include <cstdarg>
#include <cstdio>
#include <cstdlib>

#include "spim.h"

bool bare_machine;
bool accept_pseudo_insts;
bool delayed_branches;
bool delayed_loads;
bool quiet;
char* exception_file_name = 0;
bool mapped_io;
int spim_return_value;

port message_out;
port console_out;
port console_in;

static QStringList collectedErrors;

QStringList takeCoreErrors() {
  const QStringList errors = collectedErrors;
  collectedErrors.clear();
  return errors;
}

static QString formatted(const char* fmt, va_list args) {
  char buffer[10000];
  qvsnprintf(buffer, sizeof(buffer), fmt, args);
  return QString::fromLocal8Bit(buffer);
}

void error(char* fmt, ...) {
  va_list args;
  va_start(args, fmt);
  collectedErrors << formatted(fmt, args);
  va_end(args);
}

void run_error(char* fmt, ...) {
  va_list args;
  va_start(args, fmt);
  collectedErrors << formatted(fmt, args);
  va_end(args);
}

void fatal_error(char* fmt, ...) {
  va_list args;
  va_start(args, fmt);
  std::fprintf(stderr, "SPIM core fatal error: %s\n",
               qPrintable(formatted(fmt, args)));
  va_end(args);
  std::abort();
}

void write_output(port, char*, ...) {}
void read_input(char* str, int n) {
  if (n > 0) {
    str[0] = '\0';
  }
}
int console_input_available() { return 0; }
char get_console_char() { return 0; }
void put_console_char(char) {}
