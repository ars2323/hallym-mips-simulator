// N-API front end for the SPIM core in ../../CPU (untouched).
//
// It plays the part QtSpim/spim_support.cpp plays in the Qt build: it defines
// the globals and callbacks the core expects from a front end, and it drives
// the core.  Only bytes cross into C++: source text, the exception handler,
// argv and the environment all arrive as bytes from Node, which is where
// paths are opened and encodings decided (docs/PORTING.md).  No path and no
// encoding logic lives here.
//
// assemble(), run() and the breakpoint setters change the machine; the rest
// only read it.

#include <napi.h>

#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#ifndef _MSC_VER
#include <unistd.h>  // _exit
#endif

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

// The scanner's in-memory input (flex, generated with -Pyy).  scanner.h does
// not declare these; the signatures are flex 2.6's.
struct yy_buffer_state;
typedef struct yy_buffer_state *YY_BUFFER_STATE;
YY_BUFFER_STATE yy_scan_bytes(const char *bytes, int len);
void yy_delete_buffer(YY_BUFFER_STATE buffer);

// The process environment, which initialize_run_stack() copies onto the
// simulated stack.  MSVC spells it _environ, as CPU/spim-utils.cpp knows.
#ifdef _MSC_VER
#define environ _environ
#else
extern char **environ;
#endif

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

// While set, message_out is collected here (print_symbols() and
// list_breakpoints() write nowhere else).
static std::string *messageCapture = NULL;

// What the program printed and nobody has taken yet (consoleOutput()), as
// bytes.  The worker takes it after every slice of a run.
static std::string consoleBytes;

static void consoleWrite(const std::string &bytes) { consoleBytes += bytes; }

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

// The core assumes this does not return (terminal spim exits).  It ends
// the simulator process, which is its own (src/sim/worker.ts): the host sees
// the exit code and reads the message from stderr.  _exit, not abort():
// abort() leaves a core dump (apport on Ubuntu, Windows Error Reporting)
// every time a student's program reaches, say, an .err directive.
const int FATAL_EXIT_CODE = 70;  // EX_SOFTWARE; src/sim/host.ts knows it
void fatal_error(char *fmt, ...) {
  va_list args;
  va_start(args, fmt);
  fprintf(stderr, "SPIM core fatal error: %s", formatted(fmt, args).c_str());
  va_end(args);
  fflush(stderr);
  _exit(FATAL_EXIT_CODE);
}

void write_output(port fp, char *fmt, ...) {
  va_list args;
  va_start(args, fmt);
  if (fp.i == console_out.i) {
    consoleWrite(formatted(fmt, args));
  } else if (messageCapture != NULL && fp.i == message_out.i) {
    messageCapture->append(formatted(fmt, args));
  }
  va_end(args);
}
// Console input.  The read syscalls (5, 6, 7, 8, 12) call read_input() in
// the middle of executing the syscall instruction, from inside run(): there
// is no waiting there.  With input queued (provideInput()), read_input()
// takes one line of it, as QtSpim's does.  With none, it writes nothing,
// notes where the syscall was and what it is about to overwrite ($v0, $f0),
// and asks the core to stop after this instruction; run() then puts those
// back and answers "input" -- the machine as it was just before the
// syscall, which runs again once input has been provided.
// (docs/PORTING.md 10, "콘솔 입력".)
static std::string inputBytes;
static bool inputWanted = false;
static mem_addr inputPC;
static reg_word inputV0;
static double inputF0;

int console_input_available() { return inputBytes.empty() ? 0 : 1; }
char get_console_char() {
  if (inputBytes.empty()) return 0;
  char c = inputBytes[0];
  inputBytes.erase(0, 1);
  return c;
}
void put_console_char(char c) { consoleWrite(std::string(1, c)); }
void read_input(char *str, int n) {
  if (inputBytes.empty()) {
    if (!inputWanted) {
      inputWanted = true;
      inputPC = PC;
      inputV0 = R[REG_V0];
      inputF0 = FPR[0];
    }
    force_break = true;  // run_spim() stops before the next instruction
    return;
  }
  int i = 0;
  while (i < n - 1 && !inputBytes.empty()) {
    char c = get_console_char();
    str[i++] = c;
    if (c == '\n') break;
  }
  if (n > 0) str[i] = '\0';
}

// ------------------------------------------------------------ loading

// read_assembly_file() in CPU/spim-utils.cpp, line for line, except that the
// scanner reads BYTES from a flex memory buffer instead of a FILE* on a path.
// initialize_scanner() still runs first, for the state it resets (line
// number, current line, EOF marker); the buffer then replaces the one it set
// up.  NAME is only what the core prints in its messages.
//
// The whole file sits in one buffer, so flex never refills it.  With a
// FILE* it does, every 16 KB, and moves the pending text to the buffer's
// start; the scanner's current_line pointer (CPU/scanner.l) then shows
// other bytes, and the source comment of an instruction near that point
// comes out garbled.  QtSpim shows five such lines for tt.core.s; this
// front end shows the right ones.  docs/PORTING.md, "Source line display".
//
// The one addition, as in QtSpim/edu/edu_loader.cpp: print_symbols() before
// flush_local_labels(), while the file's local labels are still in the
// table.  It writes the listing to *SYMBOLS and changes nothing.
static void readAssemblyBytes(const std::string &bytes, const std::string &name,
                              std::string *symbols) {
  initialize_scanner(stdin);
  YY_BUFFER_STATE buffer = yy_scan_bytes(bytes.data(), (int)bytes.size());
  std::string display(name);
  initialize_parser(&display[0]);

  while (!yyparse())
    ;

  yy_delete_buffer(buffer);
  if (symbols != NULL) {
    messageCapture = symbols;
    print_symbols();
    messageCapture = NULL;
  }
  flush_local_labels(!parse_error_occurred);
  end_of_assembly_file();
}

// initialize_world(handler, false) in CPU/spim-utils.cpp, with the handler
// read from bytes.  The core's own function is called with no handler, which
// does everything but the load; the load and the "main" label that follow it
// there are repeated here.  Its closing initialize_scanner(stdin) is repeated
// too; its delete_all_breakpoints() is static to the core, and the handler
// load adds no breakpoints for it to delete.
static void initializeWorld(const std::string &handler) {
  initialize_world(NULL, false);

  // No handler: nothing to read (flex cannot scan an empty buffer, and
  // QtSpim with "Load exception handler" unticked reads no file either).
  if (!handler.empty()) {
    bool old_bare = bare_machine;
    bool old_accept = accept_pseudo_insts;
    bare_machine = false;
    accept_pseudo_insts = true;
    readAssemblyBytes(handler, "exceptions.s", NULL);
    bare_machine = old_bare;
    accept_pseudo_insts = old_accept;
  }

  if (!bare_machine) {
    char main_label[] = "main";
    (void)make_label_global(main_label);
    (void)record_label(main_label, 0, 0);
  }
  initialize_scanner(stdin);
}

// Run parameters: argv (argv[0] included) and the environment the program
// sees.  Node always supplies them; nothing here has a default.
static std::string commandLine;
static std::vector<std::string> environment;

// initialize_stack(command line) with ENVIRONMENT in place of the process's
// own: initialize_run_stack() copies `environ` onto the simulated stack.
static void initializeStack() {
  std::vector<char *> envp;
  for (size_t i = 0; i < environment.size(); i++) {
    envp.push_back(&environment[i][0]);
  }
  envp.push_back(NULL);
  char **saved = environ;
  environ = envp.data();
  initialize_stack(commandLine.c_str());
  environ = saved;
}

// Where the run stands: finished (ended or failed; the next run starts
// over, as QtSpim's does) and the breakpoint it last stopped at, which the
// next run steps over first (QtSpim's Continue).
static bool finished = false;
static mem_addr stoppedAt = 0;

// ------------------------------------------------------------ helpers

static std::string bytesOf(const Napi::Value &value) {
  Napi::Uint8Array array = value.As<Napi::Uint8Array>();
  return std::string((const char *)array.Data(), array.ByteLength());
}

static bool isBytes(const Napi::Value &value) {
  return value.IsTypedArray() &&
         value.As<Napi::TypedArray>().TypedArrayType() == napi_uint8_array;
}

static Napi::String stringOf(Napi::Env env, const std::string &bytes) {
  return Napi::String::New(env, bytes);  // the core's text is UTF-8 by now
}

static bool flagOf(Napi::Value options, const char *name, bool otherwise) {
  if (!options.IsObject()) return otherwise;
  Napi::Value v = options.As<Napi::Object>().Get(name);
  return v.IsBoolean() ? v.As<Napi::Boolean>().Value() : otherwise;
}

static Napi::Value throwType(Napi::Env env, const char *usage) {
  Napi::TypeError::New(env, usage).ThrowAsJavaScriptException();
  return env.Null();
}

// ------------------------------------------------------------ bindings

// assemble(source, handler, argv, env, fileName[, options])
//   source, handler  Uint8Array (bytes; UTF-8 by Node's doing); an empty
//                    handler loads none, as QtSpim with the box unticked
//   argv, env        Uint8Array[] (each one string's bytes)
//   fileName         Uint8Array, for the core's messages only
//   options          { acceptPseudo, delayedBranches, delayedLoads, mappedIo,
//                    quiet }: QtSpim's Settings, each defaulting to QtSpim's
//                    default.  The bare machine is never on (QtSpim/menu.cpp
//                    sim_Settings, "EDU": this course does not use it).
// -> { ok, errors: string[], symbols: string }
//
// What QtSpim's load does: reinitialize (world + handler), build the stack,
// read the file.
static Napi::Value Assemble(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  const char *usage = "assemble(source, handler, argv[], env[], fileName)";
  if (info.Length() < 5 || !isBytes(info[0]) || !isBytes(info[1]) ||
      !info[2].IsArray() || !info[3].IsArray() || !isBytes(info[4])) {
    return throwType(env, usage);
  }
  Napi::Array argv = info[2].As<Napi::Array>();
  Napi::Array envv = info[3].As<Napi::Array>();
  commandLine.clear();
  for (uint32_t i = 0; i < argv.Length(); i++) {
    if (!isBytes(argv.Get(i))) return throwType(env, usage);
    if (i > 0) commandLine += ' ';
    commandLine += bytesOf(argv.Get(i));
  }
  environment.clear();
  for (uint32_t i = 0; i < envv.Length(); i++) {
    if (!isBytes(envv.Get(i))) return throwType(env, usage);
    environment.push_back(bytesOf(envv.Get(i)));
  }

  // QtSpim's defaults (QtSpim/state.cpp), or what the options say.
  Napi::Value options = info.Length() > 5 ? info[5] : env.Undefined();
  bare_machine = false;
  accept_pseudo_insts = flagOf(options, "acceptPseudo", true);
  delayed_branches = flagOf(options, "delayedBranches", false);
  delayed_loads = flagOf(options, "delayedLoads", false);
  mapped_io = flagOf(options, "mappedIo", false);
  quiet = flagOf(options, "quiet", false);

  errors.clear();
  consoleBytes.clear();
  inputBytes.clear();
  inputWanted = false;
  finished = false;
  stoppedAt = 0;
  initializeWorld(bytesOf(info[1]));  // also deletes every breakpoint
  size_t handler_errors = errors.size();
  initializeStack();
  std::string symbols;
  readAssemblyBytes(bytesOf(info[0]), bytesOf(info[4]), &symbols);

  Napi::Array list = Napi::Array::New(env, errors.size());
  for (size_t i = 0; i < errors.size(); i++) list[i] = stringOf(env, errors[i]);
  Napi::Object result = Napi::Object::New(env);
  result["ok"] = !parse_error_occurred && handler_errors == 0;
  result["errors"] = list;
  result["symbols"] = stringOf(env, symbols);
  return result;
}

// run(steps) -> why it stopped:
//   "exit"        the program ended (syscall exit)
//   "error"       the core reported a run-time error and cannot go on
//   "breakpoint"  PC is at a breakpoint, not yet executed
//   "input"       PC is at a read syscall that found no input; provideInput()
//                 and run again
//   "limit"       `steps` instructions ran; more to run
// A user's stop is not here: it happens between runs (src/sim/worker.ts).
//
// The first run after a load, or after the program ended, sets PC to the
// start address and rebuilds the stack (SpimView::initializePCAndStack()).
static Napi::Value Run(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsNumber()) return throwType(env, "run(steps)");
  int steps = info[0].As<Napi::Number>().Int32Value();
  if (PC == 0 || finished) {
    PC = starting_address();
    initializeStack();
    finished = false;
  }
  bool stepOver = stoppedAt != 0 && stoppedAt == PC && inst_is_breakpoint(PC);
  stoppedAt = 0;
  errors.clear();
  force_break = false;
  bool continuable = false;
  bool atBreakpoint = run_program(PC, steps, false, stepOver, &continuable);

  const char *reason;
  if (inputWanted) {
    // Undo the syscall that found no input: it runs again later.
    PC = inputPC;
    R[REG_V0] = inputV0;
    FPR[0] = inputF0;
    inputWanted = false;
    force_break = false;
    reason = "input";
  } else if (!continuable) {
    reason = errors.empty() ? "exit" : "error";
    finished = true;
  } else if (atBreakpoint) {
    reason = "breakpoint";
    stoppedAt = PC;
  } else {
    reason = "limit";
  }
  return Napi::String::New(env, reason);
}

// provideInput(bytes): queue console input (a line typed ends with '\n').
static Napi::Value ProvideInput(const Napi::CallbackInfo &info) {
  if (info.Length() < 1 || !isBytes(info[0])) return throwType(info.Env(), "provideInput(bytes)");
  inputBytes += bytesOf(info[0]);
  return info.Env().Undefined();
}

// consoleOutput() -> Uint8Array: what the program printed since the last
// call.  Bytes: Node decodes them, across calls.
static Napi::Value ConsoleOutput(const Napi::CallbackInfo &info) {
  Napi::Uint8Array out = Napi::Uint8Array::New(info.Env(), consoleBytes.size());
  memcpy(out.Data(), consoleBytes.data(), consoleBytes.size());
  consoleBytes.clear();
  return out;
}

// Whether ADDR is a word in a text segment.  Outside them the core's
// instruction reads and writes raise an exception, which writes CP0 (Cause,
// BadVAddr): a breakpoint that could not be set must not change what the
// student sees, so such addresses never reach the core.
static bool inText(mem_addr addr) {
  return (addr & 3) == 0 && ((addr >= TEXT_BOT && addr < text_top) ||
                             (addr >= K_TEXT_BOT && addr < k_text_top));
}

// setBreakpoint(addr) / clearBreakpoint(addr) -> whether there is one there
// now / whether one was removed.  The core's add_breakpoint() puts a break
// instruction in the instruction's place and keeps the instruction; asked
// twice it would complain, so a second set is simply true.
static Napi::Value SetBreakpoint(const Napi::CallbackInfo &info) {
  mem_addr addr = info[0].As<Napi::Number>().Uint32Value();
  errors.clear();
  if (!inText(addr)) {
    char format[] = "No instruction to breakpoint at address 0x%08x\n";
    error(format, addr);  // the core's words for an empty text word
    return Napi::Boolean::New(info.Env(), false);
  }
  if (!inst_is_breakpoint(addr)) add_breakpoint(addr);
  return Napi::Boolean::New(info.Env(), inst_is_breakpoint(addr));
}

static Napi::Value ClearBreakpoint(const Napi::CallbackInfo &info) {
  mem_addr addr = info[0].As<Napi::Number>().Uint32Value();
  bool there = inText(addr) && inst_is_breakpoint(addr);
  if (there) delete_breakpoint(addr);
  if (stoppedAt == addr) stoppedAt = 0;
  return Napi::Boolean::New(info.Env(), there);
}

// breakpoints() -> the core's list_breakpoints() text, as it writes it.
static Napi::Value Breakpoints(const Napi::CallbackInfo &info) {
  std::string listing;
  messageCapture = &listing;
  list_breakpoints();
  messageCapture = NULL;
  return stringOf(info.Env(), listing);
}

// errors() -> what the core reported during the last assemble(), run() or
// setBreakpoint().
static Napi::Value Errors(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  Napi::Array list = Napi::Array::New(env, errors.size());
  for (size_t i = 0; i < errors.size(); i++) list[i] = stringOf(env, errors[i]);
  return list;
}

static void pushSegment(Napi::Env env, Napi::Array &out, mem_addr from,
                        mem_addr to) {
  str_stream ss;
  ss_init(&ss);
  for (mem_addr addr = from; addr < to; addr += BYTES_PER_WORD) {
    // Under a breakpoint the stored instruction is the core's break; the
    // student's instruction is lifted out for the look, as format_an_inst()
    // itself does.
    bool breakpoint = inst_is_breakpoint(addr);
    if (breakpoint) delete_breakpoint(addr);
    instruction *inst = read_mem_inst(addr);
    if (inst != NULL) {
      ss_clear(&ss);
      format_an_inst(&ss, inst, addr);
    }
    if (breakpoint) add_breakpoint(addr);
    if (inst == NULL) continue;
    std::string line = ss_to_string(&ss);
    if (!line.empty() && line.back() == '\n') line.pop_back();
    Napi::Object entry = Napi::Object::New(env);
    entry["addr"] = Napi::Number::New(env, addr);
    entry["word"] = Napi::Number::New(env, (uint32)ENCODING(inst));
    entry["line"] = stringOf(env, line);
    entry["breakpoint"] = Napi::Boolean::New(env, breakpoint);
    out[out.Length()] = entry;
  }
  free(ss.buf);
}

// textSegment() -> [{ addr, word, line, breakpoint }], user text then kernel
// text.
// `line` is the core's format_an_inst() for the stored instruction:
// "[0x00400014]\t0x0c100009  jal 0x00400024 [main]   ; 188: jal main".
static Napi::Value TextSegment(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  Napi::Array out = Napi::Array::New(env);
  pushSegment(env, out, TEXT_BOT, text_top);
  pushSegment(env, out, K_TEXT_BOT, k_text_top);
  return out;
}

// registers() -> { pc, hi, lo, epc, cause, badVAddr, status, general[32],
//                  fp[32] }  -- fp: the FP registers' raw 32-bit words ($f0..)
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
  result["epc"] = Napi::Number::New(env, (uint32)CP0_EPC);
  result["cause"] = Napi::Number::New(env, (uint32)CP0_Cause);
  result["badVAddr"] = Napi::Number::New(env, (uint32)CP0_BadVAddr);
  result["status"] = Napi::Number::New(env, (uint32)CP0_Status);
  result["general"] = general;
  Napi::Array fp = Napi::Array::New(env, 32);
  for (uint32_t i = 0; i < 32; i++) fp[i] = Napi::Number::New(env, (uint32)FWR[i]);
  result["fp"] = fp;
  return result;
}

// registerNames() -> the core's int_reg_names ("r0", "at", ... "s8", "ra").
static Napi::Value RegisterNames(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  Napi::Array names = Napi::Array::New(env, 32);
  for (uint32_t i = 0; i < 32; i++) names[i] = stringOf(env, int_reg_names[i]);
  return names;
}

// segments() -> the bounds of the five segments, [bot, top) each.
static Napi::Value Segments(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  Napi::Object s = Napi::Object::New(env);
  s["textBot"] = Napi::Number::New(env, TEXT_BOT);
  s["textTop"] = Napi::Number::New(env, text_top);
  s["dataBot"] = Napi::Number::New(env, DATA_BOT);
  s["dataTop"] = Napi::Number::New(env, data_top);
  s["stackBot"] = Napi::Number::New(env, stack_bot);
  s["stackTop"] = Napi::Number::New(env, STACK_TOP);
  s["kTextBot"] = Napi::Number::New(env, K_TEXT_BOT);
  s["kTextTop"] = Napi::Number::New(env, k_text_top);
  s["kDataBot"] = Napi::Number::New(env, K_DATA_BOT);
  s["kDataTop"] = Napi::Number::New(env, k_data_top);
  return s;
}

// True when [addr, addr + bytes) lies inside one data segment.  Outside
// them read_mem_*() raises a bad-address exception, which writes CP0.
static bool readable(mem_addr addr, uint32_t bytes) {
  uint64_t end = (uint64_t)addr + bytes;
  return (addr >= DATA_BOT && end <= data_top) ||
         (addr >= stack_bot && end <= STACK_TOP) ||
         (addr >= K_DATA_BOT && end <= k_data_top);
}

static bool addressAndCount(const Napi::CallbackInfo &info, uint32_t unit,
                            mem_addr *addr, uint32_t *count) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber()) {
    throwType(env, "(addr, count)");
    return false;
  }
  *addr = info[0].As<Napi::Number>().Uint32Value();
  *count = info[1].As<Napi::Number>().Uint32Value();
  if ((*addr % unit) != 0 || !readable(*addr, *count * unit)) {
    Napi::RangeError::New(env, "not inside a data, stack or kernel data segment")
        .ThrowAsJavaScriptException();
    return false;
  }
  return true;
}

// readWords(addr, count) -> number[] (read_mem_word, unsigned)
static Napi::Value ReadWords(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  mem_addr addr;
  uint32_t count;
  if (!addressAndCount(info, BYTES_PER_WORD, &addr, &count)) return env.Null();
  Napi::Array out = Napi::Array::New(env, count);
  for (uint32_t i = 0; i < count; i++) {
    out[i] = Napi::Number::New(env, (uint32)read_mem_word(addr + 4 * i));
  }
  return out;
}

// readBytes(addr, count) -> Uint8Array (read_mem_byte), in memory order
static Napi::Value ReadBytes(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  mem_addr addr;
  uint32_t count;
  if (!addressAndCount(info, 1, &addr, &count)) return env.Null();
  Napi::Uint8Array out = Napi::Uint8Array::New(env, count);
  for (uint32_t i = 0; i < count; i++) out[i] = (uint8_t)read_mem_byte(addr + i);
  return out;
}

// disassemble(word, addr) -> the core's inst_decode() + format_an_inst() of
// a bare word: "[0x00400000]\t0x8fa40000  lw $4, 0($29)".
static Napi::Value Disassemble(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber()) {
    return throwType(env, "disassemble(word, addr)");
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
  return stringOf(env, text);
}

static Napi::Object Init(Napi::Env env, Napi::Object exports) {
  message_out.i = 1;  // as QtSpim/main.cpp; write_output tells them apart
  console_out.i = 2;
  exports["assemble"] = Napi::Function::New(env, Assemble);
  exports["run"] = Napi::Function::New(env, Run);
  exports["consoleOutput"] = Napi::Function::New(env, ConsoleOutput);
  exports["provideInput"] = Napi::Function::New(env, ProvideInput);
  exports["setBreakpoint"] = Napi::Function::New(env, SetBreakpoint);
  exports["clearBreakpoint"] = Napi::Function::New(env, ClearBreakpoint);
  exports["breakpoints"] = Napi::Function::New(env, Breakpoints);
  exports["errors"] = Napi::Function::New(env, Errors);
  exports["textSegment"] = Napi::Function::New(env, TextSegment);
  exports["registers"] = Napi::Function::New(env, Registers);
  exports["registerNames"] = Napi::Function::New(env, RegisterNames);
  exports["segments"] = Napi::Function::New(env, Segments);
  exports["readWords"] = Napi::Function::New(env, ReadWords);
  exports["readBytes"] = Napi::Function::New(env, ReadBytes);
  exports["disassemble"] = Napi::Function::New(env, Disassemble);
  return exports;
}

NODE_API_MODULE(spim, Init)
