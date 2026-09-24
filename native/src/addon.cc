// N-API front end for the SPIM core in ../../CPU (untouched).
//
// It plays the part QtSpim/spim_support.cpp plays in the Qt build: it defines
// the globals and callbacks the core expects from a front end, and it drives
// the core.  No path ever crosses into C++: assembly arrives as text and the
// core reads it through a FILE* opened on memory (see readAssemblyText).

#include <napi.h>

#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <string>
#include <vector>

// The core's headers have no include guards; each is included once, in the
// order QtSpim/edu/edu_loader.cpp uses.
#include "spim.h"
#include "string-stream.h"
#include "spim-utils.h"
#include "inst.h"
#include "reg.h"
#include "mem.h"
#include "sym-tbl.h"
#include "scanner.h"
#include "parser.h"
#include "data.h"

// ------------------------------------------------------------ front end

bool bare_machine;
bool accept_pseudo_insts;
bool delayed_branches;
bool delayed_loads;
bool quiet;
char *exception_file_name = 0;
bool mapped_io;
int spim_return_value;

port message_out;
port console_out;
port console_in;

static std::vector<std::string> errors;  // error() and run_error(), in order

static std::string formatted(const char *fmt, va_list args) {
  char buf[10000];  // QtSpim's BIG_BUF_SIZE
  vsnprintf(buf, sizeof(buf), fmt, args);
  return buf;
}

void error(char *fmt, ...) {
  va_list args;
  va_start(args, fmt);
  errors.push_back(formatted(fmt, args));
  va_end(args);
}

// QtSpim reports these and returns; so does this front end.
void run_error(char *fmt, ...) {
  va_list args;
  va_start(args, fmt);
  errors.push_back(formatted(fmt, args));
  va_end(args);
}

// The core assumes this does not return (terminal spim exits).
void fatal_error(char *fmt, ...) {
  va_list args;
  va_start(args, fmt);
  fprintf(stderr, "SPIM core fatal error: %s", formatted(fmt, args).c_str());
  va_end(args);
  abort();
}

// Console and message output are dropped: nothing in this spike reads them.
void write_output(port, char *, ...) {}
int console_input_available() { return 0; }
char get_console_char() { return 0; }
void put_console_char(char) {}
void read_input(char *str, int n) {
  if (n > 0) str[0] = '\0';
}

// ------------------------------------------------------------ loading

// read_assembly_file() in CPU/spim-utils.cpp, line for line, except that the
// FILE* is opened on TEXT instead of on a path.  NAME is only what the core
// prints in its messages; it is never opened.
static void readAssemblyText(const std::string &text, const char *name) {
  FILE *file = fmemopen((void *)text.data(), text.size(), "r");
  if (file == NULL) {
    char format[] = "Cannot open file: `%s'\n";
    error(format, name);
    return;
  }
  std::string display(name);
  initialize_scanner(file);
  initialize_parser(&display[0]);

  while (!yyparse())
    ;

  fclose(file);
  flush_local_labels(!parse_error_occurred);
  end_of_assembly_file();
}

// initialize_world(handler, false) in CPU/spim-utils.cpp, with the handler
// read from text.  The core's own function is called with no handler, which
// does everything but the load; the load and the "main" label that follow it
// there are repeated here.  Its closing initialize_scanner(stdin) is repeated
// too; its delete_all_breakpoints() is static to the core, and the handler
// load adds no breakpoints for it to delete.
static void initializeWorld(const std::string &handler) {
  initialize_world(NULL, false);

  bool old_bare = bare_machine;
  bool old_accept = accept_pseudo_insts;
  bare_machine = false;
  accept_pseudo_insts = true;
  readAssemblyText(handler, "exceptions.s");
  bare_machine = old_bare;
  accept_pseudo_insts = old_accept;

  if (!bare_machine) {
    char main_label[] = "main";
    (void)make_label_global(main_label);
    (void)record_label(main_label, 0, 0);
  }
  initialize_scanner(stdin);
}

static bool started;  // PC and stack set up for the loaded program

// ------------------------------------------------------------ bindings

// assemble(source, handlerSource) -> { ok, errors }
static Napi::Value Assemble(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsString()) {
    Napi::TypeError::New(env, "assemble(source, handlerSource)")
        .ThrowAsJavaScriptException();
    return env.Null();
  }
  std::string source = info[0].As<Napi::String>();
  std::string handler = info[1].As<Napi::String>();

  // QtSpim's defaults (QtSpim/state.cpp).
  bare_machine = false;
  accept_pseudo_insts = true;
  delayed_branches = false;
  delayed_loads = false;
  mapped_io = false;
  quiet = false;

  errors.clear();
  initializeWorld(handler);
  size_t handler_errors = errors.size();
  readAssemblyText(source, "program.s");
  started = false;

  Napi::Array list = Napi::Array::New(env, errors.size());
  for (size_t i = 0; i < errors.size(); i++) {
    list[i] = Napi::String::New(env, errors[i]);
  }
  Napi::Object result = Napi::Object::New(env);
  result["ok"] = !parse_error_occurred && handler_errors == 0;
  result["errors"] = list;
  return result;
}

static void pushSegment(Napi::Env env, Napi::Array &out, mem_addr from,
                        mem_addr to) {
  for (mem_addr addr = from; addr < to; addr += BYTES_PER_WORD) {
    instruction *inst = read_mem_inst(addr);
    if (inst == NULL) continue;
    Napi::Object entry = Napi::Object::New(env);
    entry["addr"] = Napi::Number::New(env, addr);
    entry["word"] = Napi::Number::New(env, (uint32)ENCODING(inst));
    out[out.Length()] = entry;
  }
}

// textSegment() -> [{ addr, word }], user text then kernel text, as the
// Text window lists them.
static Napi::Value TextSegment(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  Napi::Array out = Napi::Array::New(env);
  pushSegment(env, out, TEXT_BOT, text_top);
  pushSegment(env, out, K_TEXT_BOT, k_text_top);
  return out;
}

// registers() -> { pc, hi, lo, general: number[32] }
static Napi::Value Registers(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  Napi::Array general = Napi::Array::New(env, R_LENGTH);
  for (uint32_t i = 0; i < R_LENGTH; i++) {
    general[i] = Napi::Number::New(env, (uint32)R[i]);
  }
  Napi::Object result = Napi::Object::New(env);
  result["pc"] = Napi::Number::New(env, PC);
  result["hi"] = Napi::Number::New(env, (uint32)HI);
  result["lo"] = Napi::Number::New(env, (uint32)LO);
  result["general"] = general;
  return result;
}

// disassemble(word, addr) -> the core's own line for that word, without the
// trailing newline: "[0x00400000]\t0x8fa40000  lw $4, 0($29)".
static Napi::Value Disassemble(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber()) {
    Napi::TypeError::New(env, "disassemble(word, addr)")
        .ThrowAsJavaScriptException();
    return env.Null();
  }
  int32 word = (int32)info[0].As<Napi::Number>().Uint32Value();
  mem_addr addr = info[1].As<Napi::Number>().Uint32Value();

  instruction *inst = inst_decode(word);
  str_stream ss;
  ss_init(&ss);
  format_an_inst(&ss, inst, addr);
  std::string text = ss_to_string(&ss);
  free(ss.buf);
  free_inst(inst);
  if (!text.empty() && text.back() == '\n') text.pop_back();
  return Napi::String::New(env, text);
}

// step(n = 1): what QtSpim's Single Step does n times over.  The first step
// after assemble() sets PC to the start address and builds the stack.
static Napi::Value Step(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  int steps = 1;
  if (info.Length() > 0 && info[0].IsNumber()) {
    steps = info[0].As<Napi::Number>().Int32Value();
  }
  if (!started || PC == 0) {
    PC = starting_address();
    initialize_stack("program.s");
    started = true;
  }
  force_break = false;
  bool continuable;
  run_program(PC, steps, false, false, &continuable);
  return env.Undefined();
}

static Napi::Object Init(Napi::Env env, Napi::Object exports) {
  message_out.i = 1;  // as QtSpim/main.cpp; write_output tells them apart
  console_out.i = 2;
  exports["assemble"] = Napi::Function::New(env, Assemble);
  exports["textSegment"] = Napi::Function::New(env, TextSegment);
  exports["registers"] = Napi::Function::New(env, Registers);
  exports["disassemble"] = Napi::Function::New(env, Disassemble);
  exports["step"] = Napi::Function::New(env, Step);
  return exports;
}

NODE_API_MODULE(spim, Init)
