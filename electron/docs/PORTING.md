# PORTING — Decisions made while porting from the Qt edition

This document exists to prevent **"isn't this a bug?" fixes that make us diverge from the core**.
Most items below are behaviours that, at first sight, you will want to fix. Each item records what the behaviour is, why it is so,
what not to do, and which test guards it.

The principles are the same as in the Qt edition.

- **Do not modify `CPU/`** (the repository's shared root `CPU/`, the unmodified SPIM core). Bugs in the core are worked around, not fixed (`CPU/ORIGIN.md`).
- **When SPIM and the MIPS32 manual disagree, SPIM wins.** The words the student sees are the ones SPIM produced.
- **Execution results must match the Qt edition.** The 28 goldens check this every time.

---

## 1. Execution results are the same; the source display is more accurate

The presentation slides say "guarantees the same execution results as the existing simulator". That sentence is still true.
However, this is where **the first point at which this app is intentionally better than the Qt edition** appeared, so the two things are kept apart here.

| | Qt edition | This app | Same? |
|---|---|---|---|
| Instruction words (machine code) | produced by the core | produced by the same core | **Same** (all 4,758 in tt.core.s) |
| Memory, registers, execution flow | | | **Same** (the 28 Qt goldens) |
| Assembler error messages | | | **Same** |
| The **source line shown** next to each instruction | a few lines are garbled in large files | not garbled | **Different — this app is right** |

### What gets garbled

The core stores, for each instruction, the source line that produced it, and the Text window shows it as `; 183: jal main`.
In the Qt edition, loading tt.core.s shows five lines like this.

| Address | What the Qt edition shows | Actual source (this app) |
|---|---|---|
| `0x00400f18` | `; 1155:` | `; 1155: mtlo $0` |
| `0x0040206c` | `; 2372: 42: c.u` | `; 2372: bc1f l230` |
| `0x004031f8` | `; 3577: _str)` | `; 3577: li $v0 4 # syscall 4 (print_str)` |
| `0x00403b9c` | `; 4195: ble $0 $0 l1` | `; 4195: ble $0 $0 l140` |
| `0x00404970` | `; 4857: li $v0, 10 # syscal` | `; 4857: li $v0, 10 # syscall 10 (exit)` |

### Why it gets garbled — a latent bug in the core

The scanner (`CPU/scanner.l`) remembers the start of the line it is reading as `current_line = yytext`.
This pointer points **into** flex's input buffer. When the input is a `FILE*`, flex reads the file in chunks.
Each time it reads a new chunk it moves the not-yet-processed text to the front of the buffer, and then the place
`current_line` pointed to holds different bytes. That is why a line that straddles a chunk boundary is garbled.
The Qt edition passes a `FILE*` opened with `fopen()`, as the core's `read_assembly_file()` does, so this bug shows up there.

This app passes the whole file as **one buffer** (`yy_scan_bytes`, section 2 below). The buffer is never
refilled, so the pointer never goes stale.

### Measurement (can be re-run with `node tools/scanner-input-experiment.ts`)

Only the addon's input was switched to the FILE\* path (`fmemopen`), built once per flex read size.
Then, for 18 files in `tests/programs` and `tests/samples`, the source line of every instruction was compared with the one-buffer path.

| Read size of the FILE\* path | Instructions whose source line differs | Location |
|---|---|---|
| Default (16 KB requested — same as the Qt edition) | 7 (tt.core.s 5, tt.alu.bare.s 1, tt.be.s 1) | all just before a multiple of 8 KB: 0.499·1.000·2.000·2.998·3.499·3.999 × 16 KB |
| 4 KB | 17 (7 files) | all just before a multiple of 4 KB: 0.996–0.999, 1.996, … × 4 KB |
| 1 MB (the whole file at once) | **0** | — |

- The garbled positions move with the read size and disappear when everything is read at once. The cause is chunked reading.
- Requesting 16 KB but getting a boundary every 8 KB appears to be because glibc stdio hands over 8 KB
  at a time. The conclusion is the same whatever the boundary size.
- The 5 garbled tt.core.s lines under the default setting are **identical, down to the string,** to the 5 lines in the Qt golden (`text-ttcore.txt`).
  This means the Qt edition's real file input suffers the same thing.
- Files smaller than 8 KB show 0 differences under every setting.
- An A/B run done before this tool was written assembled and ran 16 files both ways. It compared words, assembler errors,
  symbol lists, and registers and runtime errors after execution; all were identical. The only thing that changes is the **source line used for display**.

### Do not

- Do not fix `CPU/scanner.l`. The workaround is done only through the input method.
- Do not go back to FILE\* input to make this app look exactly like the Qt edition.
- Do not turn the 5-line difference into an "ignore". `SOURCE_LINE_DIFFERENCES` in `tests/golden/qt.test.ts` records,
  **per address, both the Qt-side string and this app's string**. If either side changes, the test fails.
  `tests/core/source-text.test.ts` also checks that all 3,277 source lines of tt.core.s are identical to the
  actual lines of the file.

---

## 2. How source is fed to the core — `yy_scan_bytes`

**Conclusion: use flex's in-memory entry point (`yy_scan_bytes`). `fmemopen` was removed, and there is no platform branch.**

What was checked:

- `CPU/scanner.l` does not define `YY_INPUT` itself. It uses flex's default input, so it accepts a memory buffer as is.
- The state that `read_assembly_file()` holds besides `yyin` was checked.
  - The line number (`line_no`), the current line (`current_line`), the EOF flag (`eof_returned`) and so on are
    initialized by `initialize_scanner()`. So that function is called first, and only the buffer is swapped in.
  - The file name is held by `initialize_parser(name)` **only as a string for error messages**. The file is not opened.
  - There are no multiple files (`.include` etc.). The only `fopen` in the core is in `read_assembly_file()`.
- Implementation: `readAssemblyBytes()` in `native/src/addon.cc` follows `read_assembly_file()` line by line.
  Only two things differ: it uses `yy_scan_bytes()` instead of a `FILE*`, and it captures `print_symbols()`.
  The exception handler is fed in the same way. After calling `initialize_world(NULL)`, it replicates the
  handler-loading part that originally lived inside that function.
- A/B result (FILE\* version vs. this version): for 16 programs, words, errors, symbols and registers after execution are all identical.
  The only difference is 7 source lines, and the reason is section 1.
- **Verified on Windows** (`.github/workflows/windows.yml` at the time; now `electron.yml` at the repository root; windows-latest).
  - Tools: win_flex 2.6.4 and win_bison 3.7.4 from winflexbison3 (on Linux, flex 2.6.4 and bison 3.8.2).
  - Result: building with MSVC (VS 2026) gives 0 compile errors and 0 warnings. All 4,758 words of tt.core.s match the golden.
    `yy_scan_bytes` behaves the same in win_flex.
  - What got in the way along the route was gyp, not the input method (section 9).
- Note: the core's `initialize_scanner()` pushes one flex buffer on every load and never frees it
  (the Qt edition is the same). This app deletes the buffer it creates right after parsing, but leaves the ones the core pushes alone.

**Places where a Korean (Hangul) path reaches C++: 0.** Source, exception handler, argv and environment variables are all passed as bytes.
The file name is passed only as a string for messages and is never opened.

---

## 3. Goldens — compared by field, not as strings

The Qt edition's goldens (`text-*`, `data-*`, `intregs-*`) are text written by Save Log File. They were extracted from the
HTML produced upstream via `QTextEdit::toPlainText()`, so their whitespace layout (`&nbsp;` padding, the number of blank lines between sections)
follows the rules of the Qt widget. This app's panels are DOM tables and CSS, so they never produce such strings.
Reproducing the whitespace rules in TS would create **code with no counterpart in the product**.

So the goldens are parsed and **the data is compared field by field** (`tests/helpers/qt-golden.ts`, `tests/golden/qt.test.ts`).

- Text: sections (name, range); for each instruction, address, word, disassembly and source comment.
- Data: sections (name, range); for each row, kind (zero run / word row), address, length, values and characters.
  Row splitting is matched **row by row** between what `src/core/memory-rows.ts` produces and the rows of the Qt window.
- Registers: name, number, value. Names are checked against the core's `int_reg_names`.
- Messages: core messages are structured by `src/core/asm-errors.ts`, and message, line, file, quoted source and caret column are compared.

**The only thing lost by parsing back is the whitespace layout.** Every line's format is checked strictly, so a line of an
unknown shape is not skipped; it fails.

The two log goldens (`syntaxerror-log`, `syntaxerror-run-log`) are not compared verbatim either.
The initial proposal was "saving the log is a real feature, so compare it verbatim", but on inspection these two
also went through the Qt message pane (HTML), so not even the core messages are the originals.

- Qt strips the `spim: ` in front of messages.
- Tabs turn into a single space (original `)\t#` → golden `) #`).
- The rest is Qt front-end text. It contains `Memory and registers cleared`, a banner with the version (1.2.4) baked in,
  and Qt menu names (`Help > About > License`).

So only the messages the core produced are structured and compared, and the Qt-side lines are pinned exactly as a list
(`QT_PANE_LINES`: so that any change is noticed).
This app's log-saving feature will define its own format separately. The goldens it needs will then be taken fresh from this app.

### Qt front-end behaviour the comparator reproduces (unrelated to the core; this app does not imitate it)

- **Comment erasure**: when the disassembly is 57 columns or wider, the core attaches `;` without a space, and Qt's `formatInstructions()`,
  in the loop that removes spaces before `;`, writes `\0` at the `;` position and erases the whole comment.
  That is 381 lines in tt.core.s. The core's lines are intact.
- **Truncated decimal sign**: the Data window's `formatWord()` truncates to 10 characters and thereby cuts off the `-` of 10-digit negative numbers
  (`0x90000024` → `1879048156`). Short negative numbers (`-1`) are intact.
- **Breakpoint display**: the `text-breakpoint` golden contains lines that upstream cut at a fixed offset
  (`README.qt.md`). The comparator recognizes these lines separately and matches the seven remaining characters against the first seven characters of our address and word.

---

## 4. Pinning the run parameters (argv, environment variables)

**Problem.** The core's `initialize_run_stack()` copies argv and the process environment (`environ`) onto the simulated
stack. So `$sp`, `$a1`, `$a2` and the stack contents differ from machine to machine. The Qt edition puts the file path in argv[0],
so they also vary with the length of the path. For teaching this is a defect. If two students run the same code
and get different `$sp` values, they cannot compare their results.

**Decision.**

- The addon takes argv and env **only as data, with no defaults**. Only while the stack is being built does it swap `environ`
  for that array (`initializeStack()`).
- The app default is `DEFAULT_RUN_PARAMETERS = { argv: ["program.s"], env: [] }` (`native/index.ts`).
  With this value, right after loading `$sp = 0x7fffffe4` and `$a0 = 1`.
  - The file name is not put in argv[0]. `lab04.s` and `homework.s` have different lengths, so `$sp` would differ
    from student to student. We accept that the name in the title bar differs from the name on the stack.
  - Process environment variables are not included. `tests/node/run-parameters.test.ts` checks that the registers are identical
    even in a child process whose environment has been changed substantially.
- Taking argv as an argument is not a test hook. The Qt edition's Simulator > Run Parameters is an
  existing feature, and the addon argument is the proper channel for that feature. The tests merely use the same channel.
  The core re-splits the command line on spaces, so argv items containing spaces, NUL or an empty string are rejected.

**How the Qt goldens pass.** The Qt goldens were taken with no argv (argc=0) and three environment variables
(`QT_QPA_PLATFORM=offscreen`, `HOME=/nonexistent`, `XDG_CONFIG_HOME=/nonexistent/config`).
11 of the 12 data goldens also contain the stack and so depend on these values (Qt already builds the stack at load time).
These values live **only inside `tests/golden/qt.test.ts`**. They are not in the addon defaults, the app settings, or any constants file.
This is so that no path by which `HOME=/nonexistent` could leak into a release even exists.

**Two sets of goldens.**

| Set | Count | What it proves |
|---|---|---|
| Qt-environment goldens | 29 (all pass) | The core is identical to the Qt edition |
| Default goldens | 17 (6 register + 11 data including the stack) | The shipped configuration is stable |

With only the Qt-environment goldens there would be a hole: "it tests a configuration nobody uses". Running both sets closes that hole.
There is no CI right now, so `npm test` runs both. When CI is added, both go in as well.

---

## 5. Encoding — bytes to C++, detection in Node

- C++ (the addon) contains **no encoding logic.** It receives only bytes, and text returned by the core is
  assumed to be UTF-8 and turned into JS strings (N-API).
- Node (`src/node/text-file.ts`) detects and converts. The rules are the same as the Qt edition's `edu_text_file`.
  1. If there is a UTF-8 BOM, record it and strip it.
  2. If it is valid UTF-8, it is UTF-8.
  3. Otherwise, decode as CP949; if **re-encoding gives back exactly the original bytes**, it is CP949.
  4. Otherwise it is Latin-1 (every byte is preserved).
- `assemble()` returns the result as `format` (encoding, BOM, line endings). The UI will display it later.
- The core always receives **UTF-8 with LF**. So a CP949+CRLF file and a UTF-8+LF file produce the same machine.
  What is checked: words, source lines, symbols, memory (including Korean `.asciiz` strings) and registers after execution
  (`tests/node/encoding.test.ts`).
  - The Qt edition passed the file bytes through unchanged, so Korean strings in a CP949 file went into memory as CP949.
    In this app they go in as UTF-8. This is an intended difference.
  - LF normalization does not change the assembly result. The scanner ignores `\r` (`CPU/scanner.l` line 101).
- `chardet` is not used. Statistical guessing wobbles on short files of one or two lines. The rules above, on the other hand, are
  deterministic and already tested in the Qt edition (`tests/node/text-file.test.ts` carries that table over).
  The only dependency is `iconv-lite`.
- Not ported: `decodeSourceBytes()` from `edu_source_text`. The core accepts only UTF-8, so there is never a need to re-detect
  the source lines coming out of the core. `edu_path_encoding` was not ported either. Paths do not go
  to C++, so there is nothing for it to do.

---

## 6. `-iquote` and `<syscall.h>`

If `CPU/` is added with `-I`, **`CPU/syscall.h` shadows the system `<syscall.h>`.** The headers of Node (22, 24) and
Electron are C++20. There, `napi.h` → `<memory>` → libstdc++ `<atomic>` includes
`<syscall.h>`, and if it gets the shadowing header, you get an error that `SYS_futex` is missing.
The Qt edition is C++17, so this path never opened and the problem never showed.

Fix: the root `CPU/` is added only with `-iquote` (`native/binding.gyp`). That applies only to quoted includes (`"spim.h"`)
and does not affect angle-bracket includes. The core sources find the headers next to them, so they are unaffected.

**This is a Linux-only fix.** `<syscall.h>` itself is a Linux header, and the MSVC standard library does not
include it. So there is nothing to collide with on MSVC. Confirmed on the Windows build.

Correction: the first version of this document said "the msvc block needs no counterpart". That was right in the sense that `-iquote` needs no counterpart,
but in the meantime `CPU/` had been left **entirely absent** from the include path on MSVC.
This was found while reading the code before the first Windows build. The msvc block now puts `CPU/` on the normal include path
(`/I`). Two more things were fixed at the same time.
- `environ` in `addon.cc`: on MSVC it is `_environ` (the same approach as the core's `spim-utils.cpp`).
- `* -text` in `.gitattributes`: keeps a Windows checkout from changing the bytes of the goldens and the CP949 samples.

(macOS has `<syscall.h>`, but libc++ does not include it. Not tried yet.)

---

## 7. SPIM behaviour — do not fix

### Long forward branches (32 KB or more)

SPIM assembles a branch that goes forward by 0x2000 words (32 KB) or more **into a word that goes backward, without any error**,
and executes it that way too. The cause is `IDISP` in `CPU/inst.h`. It sign-extends with `SIGN_EX`
**after** shifting the offset `<< 2`, so when bit 15 is set the result is negative.

| Instructions in between | SPIM word | Intended target | Where SPIM goes |
|---|---|---|---|
| 0x1ffe | `0x10001fff` | `0x00408020` | `0x00408020` |
| 0x2000 | `0x1000e001` | `0x00408028` | **`0x003f8028`** |
| 0x3000 | `0x1000f001` | `0x0040c028` | **`0x003fc028`** |

The core is the same, so the Qt edition behaves the same. The target from the TS decoder (`src/core/decoder.ts`) matches the PC
SPIM actually executed. **Do not fix it.** In `tests/core/decoder.test.ts`,
"a forward branch past 32 KB goes where SPIM sends it" pins the three cases by word, decode and execution.

### Misnaming in the core's `inst_decode()`

The core's decoder gives some words the wrong name. The words the assembler produces are right, and so is execution.
What is wrong is only **the name when decoding a single word**.

- Ones encountered in tt.core.s: `movt`→`movf`, `movt.d`→`movf.d`, `movt.s`→`movf.s`, 2 of each (6 in total).
  Plus 3 of `trunc.w.s`→`suxc1`. The latter is because op.h gives a MIPS32 Release 2 instruction the same encoding,
  and it depends on which one qsort puts first.
- The full list is the same as the one pinned by the Qt edition's oracle test:
  `bc1fl→bc1f`, `bc1tl→bc1t`, `bc2fl/bc2t/bc2tl→bc2f`, `cop2→(invalid)`, `movt*→movf*`.
- The TS decoder emits the name the assembler produced. The comparator allows only the list above and pins the number encountered in the test.
- For the same reason, the core's `inst_decode()` prints the fields of `c.xx.fmt` and FP `movf/movt` in the wrong slots.
  The comparator (`coreOperands` in `tests/helpers/decoder-oracle.ts`) reproduces even that way of printing.

### "Read" functions with side effects

- `find_symbol_address()`, given an unknown name, **creates a new entry in the symbol table**
  (`lookup_label` in `CPU/sym-tbl.cpp`). So the addon does not call it.
  Symbols are obtained only from the `print_symbols()` output during assembly (the same approach as the Qt edition's `edu_loader`).
- `read_mem_*()` raises an exception for addresses outside the data segment and so **writes** CP0.
  The addon's `readWords`/`readBytes` check the range first and throw a `RangeError` if it is outside.

### Two names for the same word — differs by platform

`CPU/op.h` has two pairs of names with the same encoding: `trunc.w.s`/`suxc1` (`0x4600000d`) and `floor.w.s`/`prefx` (`0x4600000f`).
The latter of each pair is a MIPS32 Rev 2 instruction that SPIM does not execute. The core sorts its disassembly table with `qsort`,
and the C standard leaves the order of elements with equal keys to the library. So which name you see differs by platform.

| | `trunc.w.s` word | `floor.w.s` word |
|---|---|---|
| Linux (glibc) | shown as `suxc1` | `floor.w.s` |
| Windows (MSVC) | `trunc.w.s` | shown as `prefx` |

- Execution is unaffected. Assembled instructions are executed from the instruction structures built by the parser; this table is used only to turn words into text.
- The Qt edition's Windows build uses the same MSVC `qsort`, so it shows the same names as this app's Windows build.
- Our decoder (`src/core/decoder.ts`) uses the MIPS32 names (`trunc.w.s`, `floor.w.s`) on both platforms.
  The Inspector shows these names.
- `tests/core/decoder.test.ts` pins both, per platform. This first surfaced in Windows CI.

### Process-global state

The core is entirely process-global variables, and there is only one per process. Every run
installs `signal(SIGALRM)` and `setitimer` for the whole process. `fatal_error()` is a function that must not return (section 8).
`run_program()` is a synchronous call.
So the core lives only in its own process (`src/sim/worker.ts`) (`docs/ARCHITECTURE.md`).
The modules in `src/core/` are all pure and synchronous, with no module-level state. State and asynchrony live only at the boundary
(`native/index.ts`, `src/sim/`).

### "Read" functions with side effects (more)

- Merely trying to set a breakpoint at an address outside the text segment changes CP0. `add_breakpoint` and
  `inst_is_breakpoint` go through `read_mem_inst`/`set_mem_inst`, which, when out of range, raise an exception (IBE) and
  **write** Cause and BadVAddr (measured: Cause 0→0x18, BadVAddr 0→0x500000).
  The addon's `setBreakpoint`/`clearBreakpoint` first check whether the address is a word inside the text segment,
  and if not, do not call the core. The message is the same sentence as the core's
  (`tests/node/run-control.test.ts` checks that CP0 is unchanged).

---

## 8. Execution control — stop does not kill the process

### How stop is implemented

- The worker in the simulator process (`src/sim/worker.ts`) calls the core's `run_program()` **10,000 instructions at a time**
  (`run(10000)`, about 2.6 ms). Between slices it yields to the event loop and handles requests that arrived in the meantime.
- `stop()` only sets a stop flag. The loop ends before the next slice, and `run()` answers with `reason: 'stopped'`.
  After that the machine stays exactly where it stopped. The PC is inside the loop, registers and memory can be read, and execution can be continued.
- The core already has `force_break` (`run_spim()` checks it every instruction). But it is not used.
  While JS is calling into the core, the only ways to set that variable from elsewhere are signals or threads, and both complicate the boundary.
  Slicing execution into short pieces achieves the same effect within JS.

### Why killing the process is not the default

Stopping an infinite loop and then looking at registers and memory is the educational core of this tool.
Killing the process would throw away the whole machine. So killing is kept only as a **last resort**.
The host kills and relaunches only if execution has not ended within 2 seconds (`stopTimeoutMs`) after `stop()`.
The slices are short, so this does not normally happen. If it does, `stop()` returns `'killed'`, so
the UI can announce that the machine was lost.

### Why it stopped

`exit` (normal termination) · `error` (runtime error) · `breakpoint` · `stopped` (user) · `limit` (`step(n)` completed).
The order of decision is as follows.

- If the core says "cannot go further" (`continuable == false`), it is `exit`. If there was a `run_error` along the way, it is `error`.
  The next run after either of these starts from the beginning (same as QtSpim's Run).
- If `run_program()` reports a breakpoint, it is `breakpoint`.
- If neither, it is `limit`. `stopped` is decided by the worker between slices, not by the core.

### Breakpoints

- The core's own functions (`add_breakpoint`/`delete_breakpoint`/`list_breakpoints`) are used as is. The list, too, is read from the
  sentences the core writes (`Breakpoint at 0x…`). The addon does not keep a list of its own.
- Running right after stopping at a breakpoint starts by executing that instruction. It uses the core's `cont_bkpt`,
  the same as QtSpim's Continue.
- The core places a `break` instruction at a breakpoint. So `textSegment()` temporarily takes out the
  original instruction at that location, reads its word and line, and attaches `breakpoint: true`. This is the same approach `format_an_inst()` takes.
- Setting a breakpoint twice at the same address makes the core report an error, but the addon treats it as "already there" (true).

### Console output

- The addon only collects the bytes the program prints. At the end of every slice the worker takes them, stream-
  decodes them and sends them as `console` events. The delay is at most one slice (a few ms), so to a person it is "as it happens".
- At first, a scheme that cut the slice with `force_break` whenever output appeared was also added. It was eventually removed:
  the slices were already short enough, each output cost one IPC, and it only enlarged the addon's surface.
- Console **input** (syscall 5/8/12) does not exist yet. For now an empty line is returned. The next thing needed is a design that pauses
  the loop while waiting for input.

### `fatal_error()` — `_exit(70)` instead of `abort()`

The core assumes `fatal_error()` never returns. The first version called `abort()`. But every time the tests ran,
Ubuntu's apport left an 8 MB crash file in `/var/crash`. On Windows the error reporting (WER)
window could pop up. That must not happen just because a student used the `.err` directive.
So it writes the message to stderr and calls `_exit(70)`.

- The core's assumption ("does not return") still holds. The terminal version of spim also does `exit(-1)`.
- Only the child dies; the host lives. From exit code 70 and `SPIM core fatal error: …` on stderr, the host
  reports "시뮬레이터가 중단되었습니다" (the simulator has stopped) and launches a new process.

---

## 9. gyp's msvs generator rewrites action arguments as paths

The bison action in `native/binding.gyp` writes the prefix **joined** as `-pyy`. Splitting it into `-p`, `yy` breaks
on Windows.

gyp's msvs generator (`node-gyp/gyp/pylib/gyp/generator/msvs.py`) has a rule for action arguments:
**an argument that does not start with `/` or `-` and contains no `=` is treated as a path** and rewritten relative to the .vcxproj.
A separate `yy` became `../yy`, win_bison generated `extern YYSTYPE ../yylval;`, and
MSVC stopped at `'.'`. Linux (the make generator) does not rewrite arguments, so the problem never showed there.
flex was written joined as `-Pyy` from the start and was fine. bison was brought in line with that notation.

The msvs project was generated directly on Linux to check the remaining arguments as well.

- The switches (`-I` `-8` `-Pyy` `-pyy`) are left unchanged.
- `--defines=` `--output=` `--outfile=` contain `=`, so they are left unchanged. Their values are `$(OutDir)…`, which
  MSBuild expands to absolute paths.
- The input files (`../CPU/parser.y` etc.) are rewritten as paths, which is intended.

**Do not revert to `-p yy` on the grounds that it is the textbook form.**


---

## 10. Console input — rewind instead of waiting

In the Qt edition, when the core called `read_input()`, it opened an input dialog inside that call and **waited** (on the same thread).
Here the core runs on the worker's event loop, so waiting would freeze the worker. During that time it could accept neither `stop` nor register reads.
So there is a new stop reason, `input`, and when there is no input the syscall is **rewound**.

- When the queue is empty, `read_input()` (in the addon) writes nothing into the buffer. It only records the PC,
  `$v0` and `$f0` just before that syscall and turns on `force_break`. The syscall runs to the end having read nothing, and when the core stops
  before the next instruction, `run()` restores those three and returns `input`. Since `$v0` (read_int, read_char) and
  `$f0` (read_float/double) written by the syscall are restored, the machine is exactly as it was before executing the syscall.
  read_string's buffer (the student's memory) is not touched.
- `provideInput(text)` only appends UTF-8 bytes to the end of the queue. The next `run`/`step` executes the syscall
  again, and this time `read_input()` takes **one line** (up to `\n`, at most the buffer size) from the queue.
  Line-at-a-time is how the SPIM console behaves. If several lines are given at once, subsequent reads take them in turn.
- Assembling a new program empties the queue.

Why not another route:

| Alternative | Problem |
|---|---|
| Wait synchronously inside the worker (`Atomics.wait` etc.) | The worker freezes and cannot accept `stop` or reads. The host would have to kill it instead |
| Collect all input before running | What a program reads, and when, is only known by running it. Interactive programs (menus, repeated input) would not work |
| Modify the core's syscall code to create a "waiting" state | Violates the principle of not modifying the core. Rewinding is done entirely inside the addon (front end) |

In the window: when stopped for `input`, the console expands and the input field gets focus. Pressing Enter appends `\n` to the line,
calls `provideInput`, and continues whatever was happening before the stop (run if it was running, one line if it was one line).
The entered line stays in the console history, marked as input (bold blue text). Enter pressed while Hangul is still being composed does not send the line.

---

## 11. Window — where it differs from the Qt edition

- **All hexadecimal is in D2Coding.** Pretendard draws `0x1` as `0×1` even with `calt` turned off. Every place where a hex literal can
  appear (addresses, words, register values, values in explanatory sentences, addresses inside error messages, console output, the status bar)
  is set in mono. For sentences that come from the core (error messages), `withHex()` picks out the parts that look like hex and wraps them in mono.
  `tests/e2e/hex-mono.e2e.ts` checks this by scanning every text node of the rendered DOM.
- **Only two settings are saved: font size and Data radix.** Font and color settings were removed (there is a single theme).
  Ctrl + / Ctrl − / Ctrl 0 apply to the current run only. Advanced items are collapsed and are used for the current run only (section 12).
  The D2Coding font for Hanja is left as is.
- **Identifiers containing the digit 0 are also in D2Coding.** Pretendard's 0 is an oval with no slash or dot, so next to letters it reads as the Latin O
  (`CP0` → "CPO", `$t0`, `F10`, `lab04.s`). This is the same family as the hex rule, so the same check (`hex-mono.e2e.ts`)
  also looks at "0 inside a Latin identifier". Register names, `CP0`, shortcuts, file names and format badges were switched to mono.
- **State is not restored.** Window size, open file, recent files, breakpoints and expanded panels are not saved.
- **Ctrl+S = save + assemble.** For a new file a save dialog appears; even if it is cancelled, assembly still happens (the status bar shows "저장하지 않음" (not saved)).
  If assembly succeeds, the app moves on to the [run] phase. If it fails, an error list appears below the editor and the line is marked.
- **Ctrl+S during composition.** Chromium passes a Ctrl+S pressed during IME composition as a keydown with `isComposing`,
  and CodeMirror does not run its own keymap during composition. So Ctrl+S is received by the window's key handler,
  and if composition is in progress, saving happens after `compositionend`. A half-composed character (`끄`) is not saved (`tests/e2e/ime.e2e.ts`).
- **Clear Registers · Reinitialize → "처음으로" (back to the start).** Reassembles the same program. Breakpoints are kept.
  When the code has changed and is reassembled, breakpoints are cleared (addresses may have changed).
- **No modal when a breakpoint is hit.** It is signalled only by the status bar and the PC line.
- **Kernel code is collapsed.** At the end of Text: "커널 코드(예외 처리기) N개 명령 숨김 · 보기" (kernel code (exception handler): N instructions hidden · show). CP0 registers are also a collapsed group.
- Not done yet: the 20-step tutorial, FP register display.

---

## 12. Settings — what is saved and what is used for the current run only

Since 2.0.0 nothing is saved (section 20, "Nothing kept"); until then the font size and the Data radix were.

| What | Saved | Where |
|---|---|---|
| Font size | Current run only | The main process's memory (`settings:get` / `settings:set`) |
| Data radix (the radix the Data tab opens in) | Current run only | The same |
| Ctrl + / Ctrl − / Ctrl 0 | Current run only | Inside the window |
| Advanced: machine options, Run Parameters, exception handler | Current run only | Inside the window. Used from the next assembly (Ctrl+S, "처음으로" (back to the start)) on |
| Window size and position, panels, recent files, last opened file, breakpoints | **Not saved** | — |

Lab PCs are shared by many people. Every run starts from fixed defaults (QtSpim's defaults); no settings file is
written (`tests/e2e/settings.e2e.ts` checks it).

**Advanced items** (the Qt edition's Simulator › Settings, Run Parameters):

- **bare machine** — always off and cannot be changed. The Qt edition also hides the checkbox and turns it off (`sim_Settings` in `QtSpim/menu.cpp`, "EDU").
  Turning it on would make the textbook's `li`, `la` and `move` syntax errors. It stays in the list, but greyed out, with the reason written next to it.
- **Allow pseudo instructions, delayed branches, delayed loads, mapped I/O, quiet** — passed as the sixth argument of the addon's `assemble()`
  into the core's globals. The defaults are QtSpim's (`DEFAULT_MACHINE` in `native/index.ts`).
  When assembling with delayed branches on, the Inspector computes branch targets relative to PC+4 (`MipsDelaySlot`).
- With **mapped I/O** on, the program does not stop for `input`; it polls the receiver register. So the console input field
  is opened even while running, and the worker accepts `provideInput` even while running.
- **Run Parameters** — a single line of arguments. `argv[0]` is always `program.s` (section 4). The start-address field was not ported (`__start` is fixed).
- **Exception handler** — Default (`CPU/exceptions.s`) / "불러오지 않음" (do not load) / File. With "불러오지 않음" (do not load), the program defines `__start` itself.
  The addon **does not read** an empty handler. flex cannot scan a 0-byte buffer and
  ends the process with `fatal_error("flex scanner push-back overflow")` (confirmed by measurement). The Qt edition likewise does not read the file when the box is unchecked.

---

## 13. Packaging — one bundle, no node_modules

`tools/package.ts` creates `build/package/app/` and hands it to electron-builder.

Since 2.0.0 was published the Windows target is the NSIS installer alone, one file: the zip was taken out of the
distribution (and off the v2.0.0 release) right after, so the build at the tag `v2.0.0` still makes a zip, but the
release has none.

- The main process and the simulator process are each bundled with esbuild into a single file (`main.js`, `worker.js`).
  At that time `process.env.SPIM_BUNDLE` is defined as `"1"`. `src/main/paths.ts`, `src/sim/transport.ts` and `native/index.ts`
  look at this value and find files next to the bundle. When running from the source tree (development, tests) nothing changes.
- The addon (`spim.node`) is placed outside the asar (`app.asar.unpacked`). Native modules cannot be opened from inside an asar.
- There is no node_modules in the package. All libraries used are inside the bundle.
  electron-builder by default tries to include the repository's `dependencies`, so this is blocked with `files`.
- The addon used is the one built against the Electron headers (`npm run build:electron`).
- The same e2e tests also run against the packaged app (`SPIM_E2E_EXE`). Locally with a Linux `--dir` build, and on Windows with the installed build.

**Side by side with the Qt edition 1.x** (`tools/windows/check-side-by-side.ps1` checks this next to the actual 1.2.4 MSI):

| | Qt edition 1.2.4 | This app |
|---|---|---|
| Install | MSI, per machine (administrator), `Program Files\Hallym MIPS Simulator` | NSIS, **per user** (no administrator), `%LOCALAPPDATA%\Programs\Hallym MIPS` |
| Start menu | `Hallym MIPS Simulator` inside the folder `Hallym MIPS Simulator` | **`Hallym MIPS`** |
| Settings | registry `HKCU\Software\HallymMIPS\HallymMIPS` | folder `%APPDATA%\HallymMIPS2` |
| Uninstall entry | HKLM, product code | HKCU, `Hallym MIPS <version>` |
| Executable | `HallymMIPS.exe` | `HallymMIPS.exe` (in a different folder, so they do not collide) |
| `.s` association | none | none |

- The name is **Hallym MIPS** everywhere (window, About, taskbar, installer, Start menu, install folder, uninstall entry).
  It differs from the Qt edition's "Hallym MIPS Simulator", so the two are distinguishable in the Start menu too. The program's screens do not use "한림" (Hallym, in Korean).
  The license notices name the rights holder, in English, as Hallym University: `NOTICE` (the repository's, at its root) and
  `src/renderer/assets/hallym/README.md` (both shown as they are under Licenses in the About window).
  With a one-click installer the install folder name follows the package name, so the package name was set to `Hallym MIPS`.
- The version is `2.0.0`. A student who used 1.2.4 would read 1.0.0 as a downgrade.
- Not signed. Windows SmartScreen warns on the first launch, every time; the user guide (`docs/usage/` at the root) walks through it.

**Notices**: BSD requires the notice to accompany binary distributions too. In the install folder, `LICENSE.txt` (this project's
BSD 3-Clause license) and `NOTICE.txt` (SPIM's full BSD text, and every other component; both files are the repository root's) sit next to the executable, along with Electron's `LICENSE.electron.txt` and `LICENSES.chromium.html`.
Settings → About this program → Licenses reads the same files from `licenses/` inside the package
(`LICENSES` in `src/main/paths.ts`). The licenses of the bundled npm packages are listed from esbuild's metafile
(`tools/licenses.ts`). It is not a hand-written list, so nothing can be left out.


---

## 14. The core timer — what it is for, and the handle leak on Windows

**What it is for.** `start_CP0_timer()`/`bump_CP0_timer()` in `CPU/run.cpp` increment the CP0 `Count` register by 1 every 10 ms,
and raise hardware interrupt 7 when `Count == Compare`. **That is all.** It has nothing to do with execution limits, infinite-loop detection,
syscalls or the console (these two are the only callers of `bump_CP0_timer` in the whole core).
The course materials in these repositories (`slides/course`, the examples) never use `mfc0`/`mtc0`, `Count`/`Compare` or interrupts.
So for the course it is an **"unused feature"**. Revisit this if interrupts are ever taught.

| | Linux | Windows |
|---|---|---|
| Mechanism | `signal(SIGALRM, SIG_IGN)` + `setitimer`, expiry checked with `getitimer` on every instruction | named waitable timer `"SPIMTimer"` + APC delivered to the calling thread, `SleepEx(0, TRUE)` on every instruction |
| Simulator process | the worker's main thread calls the core, so the APC also arrives on that thread | same |

**Measured on Windows** (`tools/probe-platform.ts`, the installed build in CI, an endless loop):

| | Linux (file descriptors) | Windows (handles) |
|---|---|---|
| While running | +0 | **+1 per 10,000 instructions** (three CI runs: +364, +850, +458 per second — differences in runner speed) |
| Per F10 | +0 | **+1** |
| Execution speed | about 3.8 million instructions/s | about 3.7–8.6 million instructions/s (varies by runner; `SleepEx` does not slow it noticeably) |

Cause: every time `start_CP0_timer()` calls `run_spim()`, it calls `CreateWaitableTimer(NULL, TRUE, "SPIMTimer")` and
never closes the handle. Because the name is the same there is only one kernel object, but **the number of handles grows by one on every call.**
This app calls `run_spim()` again every 10,000 instructions so that stop is always responsive (ARCHITECTURE section 3), so this amounts to hundreds per second.
The Qt edition leaks too, since it has the same core. The Qt edition calls `run_spim()` again every 100,000 instructions (`sim_Run` in `QtSpim/menu.cpp`),
so at the same execution speed it leaks one tenth as much as this app. This app's slices are 10 times shorter, so it leaks 10 times as much.

- At 400 per second, one hour is about 1.4 million. That is far from the per-process limit (about 16 million), but the handle table keeps growing.
  The simulator process is not relaunched on every assembly, so they accumulate over a session.
- The name is **shared across the whole session**. If two instances of this app, or this app and the Qt edition, run programs at the same time, each one's
  `SetWaitableTimer` overwrites the other's settings, and one side's `Count` can stop. This is invisible unless interrupts are used.

### The fix — Windows only, at the build step (the root `CPU/` is untouched)

> **Someone who reads only `CPU/run.cpp` cannot see this intervention.** On Windows, `native/binding.gyp` compiles
> **`native/src/run-win.cpp`** instead of `CPU/run.cpp`. That file acts as a forced-include header: it includes `<Windows.h>` first,
> redefines `CreateWaitableTimer` as `spimCreateWaitableTimer`, and then `#include`s `CPU/run.cpp` **unchanged**.
> gyp cannot give `/FI` to a single file, so a wrapping file was used instead. Linux and macOS compile `CPU/run.cpp` directly.
> This is a build-level measure, like `-iquote` (section 6) and `-pyy` (section 9).

- `spimCreateWaitableTimer()` creates an **unnamed** waitable timer **once** per process and returns the same handle from then on.
  - No leak: one handle per process.
  - No sharing: since it has no name, it never grabs the same timer as another process (the Qt edition 1.x, another window of this app).
    The conflict in which one side's `Count` stopped because of the shared name disappears as well.
- Everything else is the core as is. `start_CP0_timer()` re-arms that single timer with `SetWaitableTimer()` on every `run_spim()`
  (before, too, it re-armed the one timer found by name). The completion routine (APC) arrives on the thread that calls the core, and that thread
  receives it with `SleepEx(0, TRUE)` on every instruction.
- Verification:
  - `tests/node/cp0-timer.test.ts` — whether `Count` increases while running (with sliced execution unchanged; also runs in Windows CI)
  - `tools/probe-platform.ts --expect-no-leak` — Windows CI measures whether the handle count grows during 10 seconds of running and 200 presses of F10,
    and fails if it grows
  - The removal of name sharing is verified from the code (`CreateWaitableTimerW(NULL, …, NULL)`). Running simultaneously with 1.2.4 was not tested
    (`Count` is visible only through `mfc0`, and the course does not use it).

Before and after the fix (Windows CI, installed build, endless loop):

| | Before the fix | After the fix |
|---|---|---|
| While running (10 s) | +364 to +850 per second | **+0** (296 → 296) |
| 200 × F10 | +1 per press | **+0** (296 → 296) |
| Execution speed | about 3.7–8.6 million instructions/s | about 3.7 million instructions/s (same range) |

---

## 15. Window, round 2 — after a real-use review on Windows

(The on-screen names in this section are the Korean ones of the time. Section 16 changed them to English.)

**Window frame (A-1).** Uses `titleBarStyle: 'hidden'` with `titleBarOverlay`. The window buttons (minimize, maximize, close) are drawn by the system.
So Windows 11's snap layouts (the split layouts that appear when hovering over the maximize button), double-clicking the bar to maximize, dragging to the top to maximize,
and the edges when maximized are exactly as the operating system does them. Snap layouts cannot be imitated with self-drawn buttons, which is why this route was chosen.
The app's bar is entirely a drag region (`-webkit-app-region: drag`), and everything clickable is `no-drag`. The space for the window buttons
is left empty using `env(titlebar-area-*)` (checked by e2e). The window never opens larger than the work area, and on small screens it opens maximized.

**Left/right split (A-3).** Editor | Run are always side by side. The divider can be dragged (double-click for the default) and either side can be collapsed (‹ › on the divider; a collapsed side becomes a vertical bar).
- The Run side shows its panels only when the machine holds the Editor's code. Before assembly ("아직 어셈블하지 않았습니다" (not assembled yet)),
  failed assembly ("어셈블하지 못했습니다" (could not assemble)), and code changed after assembly ("코드가 바뀌었습니다" (the code has changed)) are Haram cards with different wording.
  Haram (the `guide` pose) points at the Editor on the left from the right of the text — it does not sit between the text and what it points at.
- While running, the Editor marks the line about to execute with a blue band (a different colour and bar from the pink of error lines). PC → line uses the Text's line column
  (the core's mapping) as is, and is shown only when that line actually holds a source statement (the line numbers of the startup code belong to the exception handler).
  If the line is off screen the editor scrolls to follow, but not if the student scrolled within the last 2 seconds.
- **The narrow-window threshold is 980 CSS px.** A lab PC (1366×768 at 125%) has a maximized window of 1093px, so the split is kept.
  1366×768 at 150% (910px) and half of a 1920 screen (960px) show one side at a time via Editor / Run tabs (which appear in the bar).
  1024×768 (100%) keeps the split. Inside the Run side, below 560px of width the panels stack vertically (container query).
- The console sits below Registers, so that at the height of a lab PC (about 480px) Text and the Inspector get the full vertical space.

**Panel headers (A-4).** Only `panelHead` and `tabsHead` in `src/renderer/app/ui.ts` are used. Height, text, padding and the right-hand auxiliary slot are the same.
Tabs are used only for Text / Data, which compete for one slot. Header names are English (Editor, Registers, Text, Data, Console, Inspector);
all other wording (buttons, guidance, errors) is Korean.

**Data (B-1).** Follows the table of the Qt edition's Data panel (`QtSpim/edu/edu_data_model.cpp`): Address | +0 | +4 | +8 | +C | ASCII.
All addresses are `0x…`; user data, stack and kernel data (collapsed) are separate regions, and the stack has a different colour. A zero run reads
"`~ 0x1003ffff` 까지 모두 0 · 49,144 워드" (all 0 up to `0x1003ffff` · 49,144 words). The Qt edition's Labels column does not fit in the narrow panel, so it moved to a **thin line above**
that row (labels and `$sp`/`$fp`/`$gp`). A word and its four characters highlight together on hover.

**Registers (B-2).** A register that just changed: yellow row + bar + a "바뀜" (changed) mark, one flash when it changes, cleared at the next step.
Hex is the strongest, decimal fainter, binary the faintest (only when there is room). Groups are bands with a name and range (`$a0–$a3`).

**Inspector (B-3).** Like the Qt edition, the 32-bit cells are drawn grouped by field (the text shrinks when narrow). Every single-step shows the instruction at the PC,
and choosing one in Text pins it to that instruction (the header shows "고정: 0x…" (pinned: 0x…), "현재 명령 따라가기" (follow the current instruction), Esc). Before the first step it shows guidance.

**Slow run (B-4).** 즉시 (instant) / 1줄/1초 (1 line per second) next to Run. In slow mode the window calls the core one instruction at a time (`step(1)`) and waits 1 second in between.
- Stopping: Esc or stop cuts the wait immediately (e2e: pressed right after a step, it stops within 0.5 seconds). The core is only running one instruction,
  so even a loop that runs 300 million times has nothing to wait for.
- Switching: slow → instant cuts the wait and hands over to the core's run (`run`). Instant → slow stops the core (`stop`) and continues slowly.
- Breakpoints stop before that instruction; input waits and then continues slowly. Register highlighting, the Inspector and the Editor line follow every step.

**Errors and breakpoints (C-1).** The error panel puts what to do first (fix line 15, then press Ctrl+S again; worded differently since, section 22), and a button that goes to that line),
then the core's message and line, then help for common messages. Haram (the `curious` pose) is at the end of the panel. Gutter: a breakpoint is a red dot in the leftmost
column (click to toggle), an error is a `!` badge — different shapes. Breakpoints in the Editor are remembered by line, so they move along when the code is edited,
and on every assembly they are set on the first word of that line. Ones set in Text also show on the Editor's line. They cannot be set on a line with no instruction (a notice is shown).

**Dialogs (C-2).** Windows that ask something, such as "저장하지 않은 변경" (unsaved changes), are in-app dialogs (with Haram). A new file asks even when it is in a saved state.
The file open and save dialogs **are left as the operating system's own**: so that students handle USB drives, OneDrive, recent locations and Korean paths
as they always do, and the Qt edition does the same. Building a new file browser inside the app is beyond this round's scope.

**Start screen (C-3).** The card width and the size of the choices are fixed, and line breaks are written in explicitly. Between the two steps, only the text of the choices changes (e2e
compares positions). The window size is the same for the start screen and the main screen (the same window).

**Input (C-4).** Tab: spaces from the cursor to the next column that is a multiple of 4. With several lines selected, indent by 4; Shift+Tab outdents by 4. Enter goes to column 0.
The display width of a tab character is also 4.

---

## 16. On-screen terms — names in English, what is said to the student in Korean

**Rule.** The **names of things** on screen are English: panel and tab names, table column headers, register groups, memory regions, instruction fields, status chips,
toolbar buttons. These are the words the textbook (Patterson & Hennessy) and SPIM use, so that a student going back and forth between lecture material and the screen sees the same words.
**Sentences addressed to the student** are Korean: guidance cards, error explanations and what to do, the Inspector's commentary, dialog bodies, status-bar sentences, empty states, help.
No Korean particle is attached directly after an English name (separate it with a space as in `Data 의 값을` (the value of Data), or rephrase the sentence). The program's name is **Hallym MIPS**.

| Place | Before | After |
|---|---|---|
| Toolbar | 어셈블 / 실행 / 한 줄 / 처음부터 (assemble / run / one line / from the start) | Assemble / Run (Stop while running) / Step / Reset |
| Run speed | 즉시 / 1줄/1초 (instant / 1 line per second) | Instant / 1 line/s |
| Icon buttons | 튜토리얼 / 새 파일 / 파일 열기 / 설정 (tutorial / new file / open file / settings) | Tutorial / New file / Open file (Ctrl+O) / Settings |
| Status hint | F10 한 줄 · F5 실행 (F10 one line · F5 run) | `F10` Step · `F5` Run |
| Registers columns | 이름 / 16진 / 10진 / 2진 (name / hex / dec / bin) | Name / Hex / Dec / Bin |
| Registers groups | 특수 / 반환값 / 인자 / 임시 / 보존 / 포인터 / 예약 (special / return values / arguments / temporaries / saved / pointers / reserved) | Special / Constant / Return values / Arguments / Temporaries / Saved / Pointers / Return address / Reserved / CP0 |
| Registers mark | 바뀜 (changed) | Changed |
| Text columns | 주소 / 인코딩 / 형식 / 명령 / 줄 / 소스 (address / encoding / format / instruction / line / source) | Address / Encoding / Format / Instruction / Line / Source |
| Text header | 명령 N개 (N instructions) | N instructions |
| Text fold | 커널 명령 N개 숨김 (N kernel instructions hidden) | Kernel code(예외 처리기) 명령 N개는 숨겨 두었습니다 (Kernel code (exception handler): N instructions are hidden) · Show |
| Data regions | 사용자 데이터 / 스택 / 커널 데이터 (user data / stack / kernel data) | User data / Stack / Kernel data |
| Data zero run | … 까지 모두 0 · N 워드 (all 0 up to … · N words) | … 까지 모두 0 (all 0 up to …) · 16,384 words |
| Inspector table | 필드 / 비트 / 2진 / 값 / 뜻 (field / bits / binary / value / meaning) | Field / Bits / Binary / Value / Meaning |
| Inspector chip | PC 따라가기 / 고정: 0x… (follow PC / pinned: 0x…) | Following PC / Pinned 0x… · Follow PC |
| Console | 접기 / 펼치기 / 입력 (collapse / expand / input) | Collapse / Expand / Input · Waiting for input |
| Settings | 의사 명령, 지연 분기, … (pseudo instructions, delayed branches, …) | Pseudo instructions / Delayed branches / Delayed loads / Mapped I/O / Quiet / Bare machine, Font size, Data radix(Hex / Dec / Bin), Program arguments, Exception handler(Default / None / File…), Advanced |
| About | 정보 / 라이선스 / 닫기 (about / licenses / close) | About / Licenses / Close |
| File dialog types | MIPS 어셈블리 / 모든 파일 (MIPS assembly / all files) | MIPS assembly / All files |
| New file name | 제목 없음.s (untitled.s) | untitled.s |

**Registers groups.** Split according to the textbook's register table (the P&H green card). `$zero` is **Constant** (a constant that is always 0) and `$ra` is **Return address**
(the slot `jal` writes), each a one-row group. Previously `$zero` was mixed into special and `$ra` into pointers. Pointers are `$gp`, `$sp`, `$fp`;
reserved is `$at`, `$k0`, `$k1`; temporaries are `$t0–$t7` and `$t8–$t9`. The groups belong to the window (`WINDOW_GROUPS` in `src/renderer/app/logic/machine.ts`).
`src/core/registers.ts` is left exactly as ported from the Qt edition.

**Korean that stays.** The choices on the first screen (튜토리얼 보기 (view the tutorial) / 바로 시작 (start right away) / 새 파일 (new file) / 파일 열기 (open file) / ← 처음으로 (← back to the start)), the dialog buttons (버리고 계속 (discard and continue) /
돌아가기 (go back) / 취소 (cancel)), "15행으로 가기" (go to line 15) in the error panel, the status bar's 준비 (ready) · N단계 (step N) · 방금 바뀜 (just changed) · 고른 명령 (selected instruction), "노란 줄은 방금 바뀐 레지스터" (yellow rows are registers that just changed) in the Registers header,
and "눌러서 펼치기" (click to expand) in Data. All of these are things said to the student (what to do, what the state is now), so they belong on the Korean side.

**Screen captures.** The fixed set in `docs/screens/` is retaken every round with `tools/capture-screens.ts` (`docs/screens/README.md`).

---

## 17. Window, round 3 — what a narrow window must keep (after a screenshot review)

**Column priority.** On a lab PC (1366×768 at 125% scaling, 1093 CSS px), Registers' Hex, Dec and Bin and Text's Address, Encoding and Instruction must
all be visible. Seeing hex, decimal and binary together, and machine code, are the subject of this course. Columns are decided not by CSS container queries but by
`src/renderer/app/logic/columns.ts`, which measures the width. As space shrinks, things give way in the following order, and only as much as needed.

1. Spacing (gaps between columns, padding)
2. 1px of font size
3. Columns — Text: Source and Line (already visible in the Editor) → Format → Address → Encoding (last); Registers: Dec → Bin (last);
   Data: ASCII (the four words stay to the end)

The "Changed" mark goes before any column (the yellow row and bar say the same thing). Columns taken away by width can be turned back on with buttons in the panel header ("+ Source", "+ Bin",
"+ ASCII"). A column turned on is **added to** what the width shows and does not push out other columns. If it overflows, the table scrolls sideways, and
Text's column headers move with it. What is turned on is kept for the current run only.

**Distributing the window width.** The Run side is served first: Registers gets the width it needs for Hex, Dec and Bin (with reduced spacing), Text the width it needs for Address, Encoding,
Format and Instruction. The Editor gets at most 40% of the rest and at least 300px. At 1093px the Editor is about 320px (about 38 characters).
A width set by dragging is respected as is. Bin is grouped in fours, separated by a 3px gap instead of a space. With spaces, the eight groups would not fit next to Hex and Dec.

| Width | Registers | Text | Data |
|---|---|---|---|
| 1280×800 | Name Hex Dec Bin | Address Encoding Format Instruction | four words (ASCII via button) |
| 1093×582 (lab) | Name Hex Dec Bin | Address Encoding Format Instruction | four words (ASCII via button) |
| 1024×728 | Name Hex Dec Bin | Address Encoding Instruction (font 1px smaller) | four words, about 25px of sideways scroll |
| 910×505 (narrow window, Run tab) | Name Hex Dec Bin | all (including Line and Source) | all |

**Toolbar.** As it narrows, `app.ts fitTitlebar()` gives way one step at a time: shortcut labels → button icons → speed as a single button
("Speed: Instant") → tighter spacing → shortening the file name → and last of all the program name (the logo stays).
The file name is cut at the end of its stem and keeps its extension (`hw03_2021….s`, `logic/names.ts`; Hangul counts as two columns). The full name is in the tooltip.
The program name is dropped only when shrinking the file name to a minimum of 10 columns is still not enough, and the file name then reuses that space. The file name shows at most 32 columns even when long.
Even with `lab04_김학현_20210123.s` (20 columns, including Hangul), "Hallym MIPS" stays at 1280, 1093, 1024 and 910. This is also checked (e2e) with `--caption-extra: 30px`,
which imitates the space taken by the Windows window buttons (about 30px wider than on Linux). At 910 + Windows the file name shrinks to
`lab04_김….s`. At the minimum window (760) the name disappears. The button names (Assemble, Run, Step, Reset) stay to the end. The speed control is named "Run speed"
and placed right next to Run. The first screen, with no file, has no toolbar.

**Korean line breaking.** `word-break: keep-all` is set globally on `body`, so a line never breaks inside a Korean word (eojeol). Only code fragments longer than a line
(`.mono`) break anywhere, via `overflow-wrap: anywhere`. Chromium still breaks before the parenthesis in "값(" (value() even with keep-all, so
`codeText()` inserts a word joiner (U+2060) before a "(" that directly follows Hangul. The e2e test (`tests/e2e/fit.e2e.ts`) checks, character by character at four widths, whether any
Korean word on screen is split across two lines.

**Particles.** No Korean particle is attached after a name: this covers file, register, key and panel names, and everything inserted through a variable. "lab04.s 은" is
right or wrong depending on how the name is read aloud (the particle's form depends on the final sound). Either rephrase the sentence (putting "File: lab04.s" on a separate line of its own) or put a Korean noun in between (`$t7` 레지스터에 (in register `$t7`),
Data 탭의 (of the Data tab), F10 키를 (the F10 key, as object)). `tests/renderer/particles.test.ts` searches the window's sources and `src/core/explain.ts` for particles after interpolations, inline code and Latin words.
The exceptions are interpolations that end in a Korean noun (in explain.ts, `val()` "값(…)" (value(…)), `where` "주소(…)" (address(…)), `unit` "워드" (word)) and interpolations that pick one of
several Korean words.

**The band in the Editor.** Current-line highlighting (`highlightActiveLine`) was removed. While running, the only band in the Editor is the execution line.

**Error screen.** Assembly errors go in the Errors panel on the Run side (the larger side). It contains what to do (fix line 15, then press Ctrl+S again; worded differently since, section 22),
the "15행으로 가기" (go to line 15) button, and the error list. Haram (the `curious` pose) appears only once, at the far right of the panel. Not between the text and the Editor,
and with no arrow. The Editor keeps only the `!` in the gutter and the line colour. In a narrow window a failed assembly switches to the Run tab, and "N행으로 가기" (go to line N)
returns to the Editor tab.

**Scrolling to the changed register.** After a step, Registers scrolls only as much as needed to bring the register that just changed into view (excluding PC, with one row of margin
below the column headers). If the student scrolled the list themselves within the last 2 seconds, it is left alone. This is the same rule as the Editor's following of the execution line
(`dom.ts userScrolls`).

**When the Inspector is narrow (480px or less).** The header splits into two lines. The first line is the instruction; the next is the Source and the word and address. It wraps
instead of being cut off. The field table becomes one block per field: name, value and meaning on the upper line, Bits and Binary on the lower. It does not scroll sideways.

**What was given up.** On the Data tab at 1024×728, the four words overflow by about 25px even in the narrow style. So it scrolls sideways. This was judged better than shrinking the Editor below 300px
or taking width from Registers or Text. At this width, Text's Format and Source are turned on with the buttons.

---

## 18. The 20-step tutorial

`src/renderer/app/tutorial.ts`. It uses the example `src/examples/tutorial.s` (29 lines) and `tutorial-error.s` (6 lines, only in step 19).
Both open **read-only** (the editor's `EditorState.readOnly`; Ctrl+S only assembles, without saving). They are closed when the tutorial ends.
The example files on disk are never written under any circumstances (e2e compares hashes after finishing).

**Nothing is remembered.** Progress lives only in memory. After quitting and restarting the program it is always step 1. If the student quits within one run and
comes back, it asks "이어서 할까요?" (continue where you left off?). The start screen always puts "튜토리얼 보기" (view the tutorial) as the first choice.

**The student's file.** If there are unsaved changes, an in-app dialog asks first. During the tutorial that file (including the changes and
breakpoints) is kept in memory, and when the tutorial ends or is quit it is restored exactly. If there was no file, the app returns to the first screen.

**Two kinds of steps.** An explanation step (explain) advances with [다음] (next) or →. A practice step (practice) advances by itself 0.5 seconds after the window reports an action the student actually did
(`Signal`: assembled · stopped · slow-ended · tab · breakpoint · reset · goto). After 6 seconds a [건너뛰기] (skip) button
appears; pressing it performs that action on the student's behalf. That way the state later steps expect is reached. Each step's `prepare` sets up the state it needs
by itself (assembling, quietly skipping over the startup code, restarting if the program has finished). So the step can be entered by any route: [이전] (previous), [다음] (next) or resuming.
Keys a step does not call for (F5 in step 3, etc.) are swallowed. Esc stops the program if it is running, and otherwise asks whether to quit.

**Pointing.** The target is outlined with a blue border and everything else is covered with a light veil (`rgba(0,32,91,.26)`, a level at which text and panels are still readable).
Adjacent targets (the bit cells in step 9) get a tighter border so each cell is outlined separately and they do not merge into one box. Covered areas cannot be clicked.
The card is placed next to the target (`logic/placement.ts`: right of the first target → left → below → above, other targets, then the nearest free space).
It is 12px away from the target and does not cover the title bar. Haram stands on the card's white surface, at the end farther from the target. During the tutorial,
other Harams on screen are hidden (one per screen). Targets so large that no place is left for the card are not used: instead of a whole panel,
the panel header and the part being pointed at are the targets.

**Making sure the target is really visible.** Every frame, the target's box is clipped against its scroll containers. If it is missing or clipped, the step's `reveal`
scrolls (at most 5 times per second). On entering a step, the side of a narrow window (Editor/Run) and the tab (Text/Data) are set. Columns hidden by width are turned on and
released at the end (Registers' Dec and Bin, Text's Encoding). A collapsed Console is expanded.

| Width | What the steps adjusted (e2e log) |
|---|---|
| 1280×800 | 4 Text scroll (lui/ori rows) |
| 1093×582 | 3 Registers scroll (Temporaries band), 4 Text scroll |
| 1024×728 | 4 Text scroll |
| 910×505 | 3 and 4 scroll, 5 to the Editor side, 6 to the Run side, 13 scroll (Stack), 14 to the Editor side + scroll |

Since the round-3 changes, Bin and Encoding are visible by default at all four widths. So a column only needs turning on with large text (Ctrl+= four times, at 1024).
In that case step 9 turns on Encoding, and e2e checks this case separately. In a narrow window, targets that span both sides (step 12's Editor `sw` line and
Data word, step 18's `syscall` line and Console, step 4's Editor line 17 and two Text rows) point only at the Run-side target. The sentences change to match.
Step 14 wraps the gutter cell and its line in a single border (one action). Step 20 ends on the complete screen after returning to `tutorial.s` and assembling it
(not on top of step 19's error file).

**Tests.** `tests/e2e/tutorial.e2e.ts`: walks all 20 steps to the end with real actions at four widths, 1280, 1093, 1024 and 910. For each step it checks
that the target is on screen, that the card does not cover the target, that clicking the centre of the target reaches that target, and that there is one Haram and it is on the far side.
It also checks walking through with [건너뛰기] (skip) alone, quitting during the slow run in step 16, key filtering and read-only mode, restoring the student's file, step 1 after restarting,
and the example file hashes. `tests/node/examples.test.ts` checks that the examples have what the steps need (lui+ori, an R-type add, total changed by sw,
the output "sum = 12", a one-line error).

---

## 19. One repository for both editions

On 2026-09-25 the Electron edition's repository (`ars2323/hallym-mips-simulator-electron`) was merged into the Qt
edition's (`ars2323/hallym-mips-simulator`), which carries the release history (1.0 … 1.2.4) and the commits back to
SPIM's own (the `vanilla-9.1.24` tag). The old repository is archived, not deleted: earlier reports link to screenshots
by its commit SHAs, and it still serves them.

**Why.** The two editions share the core, the goldens, the design tokens and the course; keeping them apart meant a
copy of `CPU/` to keep identical by hand, two places to look for a release, and two sets of documents that had
started to disagree. 2.x is now the current version and 1.x the fallback; one repository says so in one README.

**How.** With the history kept: the old repository's `main` (48e645c) was added as a remote and merged with
`--allow-unrelated-histories` as a subtree (`git merge -s ours` + `git read-tree --prefix=electron/`), so every
commit of the Electron edition keeps its SHA, and `electron/` holds its whole tree. The Qt edition stays at the
root, where 1.2.4 is built from, so its build paths, CI and release process do not move.

**`CPU/`.** The Electron edition's `CPU/` was a copy of the Qt edition's (commit `c20d0c3`). Before anything was
removed, the two were compared file by file: all 28 files had the same SHA-256. The copy was dropped; `electron/`
builds from the root `CPU/` (`native/binding.gyp` as `../../CPU`, `native/src/run-win.cpp`, `native/index.ts`, and
the tests and tools that read `op.h`, `reg.h`, `exceptions.s`). `CPU/ORIGIN.md`, the one file the Electron
repository had added, moved to the root `CPU/` and now says that both editions build from it. It is the only
non-upstream file there; the Qt edition's `tools/regress.sh`, which checks that `CPU/` is byte for byte
`vanilla-9.1.24`, leaves that one file out. `CPU/` itself is still not modified.

**CI.** One workflow per edition, with path filters: `ci.yml` ("Qt edition (1.x)") does not run for changes under
`electron/` alone; `electron.yml` ("Electron edition (2.x) — Windows", the old `windows.yml`, every step in
`electron/`) runs only for `electron/`, `CPU/` and itself. A change to `CPU/` runs both. Tags: `v1.*` belong to the Qt
edition's workflow, `v2.*` to the Electron edition's. Two fixes to the Qt workflow came with it: its MSI upgrade check
now installs over the latest `v1.*` release only (a 2.x release has no MSI), and skips the upgrade when that release
has the same version as the build (every commit after 1.2.4 built 1.2.4 again and installed it over itself: a second
entry, a red run since before the merge).

**Other things the move changed.**
- `LICENSE` and `NOTICE` are the repository's, at its root, one of each for both editions; `electron/` reads them from
  there (About, packaging). `LICENSE` is this project's BSD 3-Clause license; `NOTICE` has SPIM's license and every
  third-party component, each with the edition it applies to.
- One `README.md`, at the root, in English, with the Korean user guide linked at the top; the Electron edition's
  developer notes are in `electron/docs/DEVELOPMENT.md`. All repository documents are in English; the user guide is in
  Korean and English (`docs/usage/`). The application's screens are unchanged (English names, Korean sentences).
- The version is 2.0.0.
- `electron.yml` has a job, run by hand and for `v2.*` tags, that builds the Electron repository's last commit before the
  merge (48e645c) and installs this build over it (`tools/windows/check-upgrade.ps1`): one install folder
  (`%LOCALAPPDATA%\Programs\Hallym MIPS`), one uninstall entry.
- The Node tests on Linux wait out the core's 10 ms timer tick before exiting (`tests/helpers/timer-at-exit.ts`): the
  core arms a one-shot real-time itimer and ignores SIGALRM, but a tick still pending while the process tears down
  killed it after all its tests had passed (about one run in six).
- Screenshots are in `electron/docs/screens/`; report links are `https://raw.githubusercontent.com/ars2323/hallym-mips-simulator/<SHA>/electron/docs/screens/<name>.png`.

---

## 20. 2.0.0 — nothing kept, Korean input, the review's leftovers, the comparison

**Nothing kept.** The first requirement for the lab PCs was that closing and opening the program gives the defaults
back — panel sizes, font, the file that was open — and the README of 1.x promised "a screen that starts the same for
every student on a shared machine". Until now 2.x kept two settings (font size, Data radix). Now:

- The settings live in the main process for one run (`DEFAULT_SETTINGS`); nothing reads or writes a settings file.
- Chromium still needs a profile directory while it runs (its caches, `Local State`, crash dumps). It is a folder of
  its own for each run, `<temp>/HallymMIPS/run-<pid>-<time>` (`userData`, `sessionData`, `crashDumps`), removed after
  the app has exited: on `quit` a small detached process (`ELECTRON_RUN_AS_NODE`) waits for the app's pid to be gone
  and removes the folder — removing it from inside the app failed, since Chromium writes to it after `quit`. A folder
  left by a run that did not exit normally (power cut, killed) is removed at the next start (its pid is not running).
- `%APPDATA%/HallymMIPS2`, where earlier builds kept `settings.json`, is removed at start.
- What cannot be avoided: that per-run folder while the program runs. Nothing else is written, except the `.s` files
  the student saves.
- `tests/e2e/settings.e2e.ts`: font size up (the settings and Ctrl+=), Data radix Dec, Console folded, Editor
  collapsed, window 1000×700 — then a restart: 13 px, Hex, Console open, nothing folded, 1280×800 (or maximised on
  a small screen), one run folder and no settings file, and no folder left once the app has exited.
  `tools/windows/check-side-by-side.ps1` checks on Windows that nothing of the app is in `%APPDATA%`,
  `%LOCALAPPDATA%` or `%TEMP%\HallymMIPS` after a run.

**Korean input** (`tests/e2e/ime.e2e.ts`, 12 tests). What breaks Korean input in a web editor is the order of the
composition events and the keys an IME lets through, and those are the same on every OS; they are made here with
CDP: `Input.imeSetComposition` (ㅎ → 하 → 한), `Input.insertText` (commit), and the key events an IME sends while
composing (`keyCode` 229, `isComposing`). Tested: syllables composed and committed once each; Enter, Tab and
Backspace while composing; Ctrl+S in the middle of a syllable (saves and assembles once the syllable is in); a click
on another panel while composing (the syllable is committed, once); Korean at the end of a line, then Enter; files
with Korean comments and strings (UTF-8 and CP949), assembled and run; typed, saved, opened again (UTF-8, byte for
byte); the Console's input (`syscall` 8), both kinds of Enter. Every editor test ends on the file on disk.

*Enter while composing — what is right.* The review asked for "the syllable committed, no new line; the next Enter
adds the line". That is what an IME that keeps the key for itself does (the test's second kind), and the editor does
it. Windows' Microsoft Korean IME does otherwise: it commits the syllable **and lets Enter through**, so one Enter
gives the syllable and a new line, as in Notepad. The real IME on the CI runner shows it (below): the page gets
`keydown Process 229` (composing), `compositionend 글`, then `keydown Enter 13` (not composing) — the order the
CDP tests reproduce for Windows (macOS's IME sends the first key as `Enter` with 229 instead, the test's second
kind). The editor follows the IME: it never adds a
line of its own nor drops one, and the syllable is never split or doubled. Swallowing the Enter that Windows lets
through would make the editor the one place on a student's PC where Enter after a Korean word does not start a line.
Both orders are tested.

*The composing checks.* Ctrl+S in the editor asks the key event (`isComposing`) whether a syllable is open and, if
so, saves when it is committed; the Console's Enter ignores a key event with `isComposing`. The editor also asked
CodeMirror (`view.composing`); with both checks, removing either one changed nothing (two surviving mutants), so the
editor now takes the key event's word, Chromium's own. Three mutants remove a composing check and are caught
(`tools/mutants.ts`: Ctrl+S saves in the middle of a syllable; Ctrl+S taken as not composing; Console Enter taken in
the middle of a syllable). Enter and Tab in the editor are CodeMirror's: it runs no key binding during a composition.

*The real IME.* The Windows CI job adds Korean to the runner's input languages (`tools/windows/korean-ime.ps1`;
the runner, Windows Server 2025 in English, has the Microsoft Korean IME, TIP `0412:{A028AE76-…}`) and types
`g k s r m f` + Enter through it into the installed app (`tests/e2e/ime-real.e2e.ts`: keys through `keybd_event`,
the window's input language set to 0412 with `WM_INPUTLANGCHANGEREQUEST`, Hangul mode with
`IMC_SETCONVERSIONMODE`), writing the page's key and composition events to `report/ime-real/` in the artifact
`windows-report`. Result: the editor holds `main: # 한글` and one new line, saved as such; the Console's `syscall` 8
gets `한글` once. The step does not stop the job if the runner has no Korean IME (it is set up at run time); the
CDP tests are the gate. Not covered by it: the Korean Windows user interface itself (dialog texts), which stays in
the list of things to check by hand (`docs/WINDOWS.md`).

**What the review left.** The Data tab's ASCII column is one character per monospaced cell with a faint line
between the words (was: a gap after every fourth character, `Hell o, M IPS!`), and it is on by default where the
window has room for it with the Editor at 300 px or more — from a 1140 px window, so at 1280 (the Editor gives up
about 100 px to it: 502 → 404). The Run side's least width takes the Data tab's (four words and ASCII, the tightest
margins) into account. Text's fold line (`Kernel code 명령 52개 숨김 Show`) and Registers' (`CP0 레지스터 4개 숨김 Show`)
are one line each, their text cut with an ellipsis before the button would wrap. At tutorial steps 8 and 9, which
point at a pinned row, the PC's band in Text is not drawn (one highlight). A closing parenthesis holds to the Korean
word after it (`(-8)만큼`), as the opening one already did. Deferred: the Data tab is up to 10 px too wide between
971 and 1034 px (`docs/screens/README.md`, Open issues).

**The comparison** (`tools/capture-compare.ts`, `docs/compare/` at the repository root). Standard QtSpim, built from
the tag `vanilla-9.1.24`, is driven through X (xdotool) on the same Xvfb as this app: the same file, 13 single steps,
a 1600×900 window, each program's default font size, fresh settings; six pairs, each side kept alone as well. QtSpim
brings its Console window forward when the program prints, and the Console then has the keys: the tool focuses the
main window before every F10.

**Four widths.** `SPIM_E2E_SIZE` sets the window of every test that does not size its own; `tools/e2e-widths.ts`
(`npm run e2e:widths`) runs all of them at 1280×800, 1093×582, 1024×728 and 910×505.

---

## 21. Windows in use — the window, the layout, the tutorial's beats, the dialogs, the notices, the hints

After a round of real use of the installed build on Windows.

**Maximised at start.** The window is maximised before it is shown (`win.maximize()` then `show()` on
`ready-to-show`), every start, whatever the screen: nothing is kept, so every student gets the whole screen every
time. Un-maximising gives the window's own 1280×800. The e2e harness and the capture tool un-maximise and set the
size they need, as before. On a Linux display without a window manager maximising is nothing and the window stays
1280×800 (the tests allow it).

**The default layout: the Editor's cap.** At 1920 the Editor had 755 px (40 % of the split, at most 760) for lines
of 35 characters, while Text cut its Source column short and the Inspector put 32 bits into 617 px. No share of the
window is right at every width, so the Editor's default is now *what a line of 72 columns needs and no more*:
the gutters, the line's padding, 72 × the code font's character width (6.75 px at 13 px), a scroll bar — 586 px at
the default font (`editor.widthFor(72)`, `EDITOR_COLUMNS` in app.ts; a font-size change moves it). Below that,
`inner - runLeast` and the 300 px floor work as before, so 1280, 1093, 1024 and 910 are unchanged. Every pixel past
the cap goes to the Run side, where Registers stays at its most (505 px, Name · Hex · Dec · Bin) and the rest widens
Text's Source column and the Inspector. On a maximised 1920 screen: Editor 586, Registers 509, Text and Inspector
793 (were 755 / 509 / 621); no Source cell cut short (the widest needs 176 px, the column has 271); the bit grid at
its full 15 px size with fields of 140 / 116 px; Bin's eight groups all in; a 72-column line without a scroll bar
(`tests/e2e/fit.e2e.ts`, "1920x1040").

**The caption buttons' patch.** With `titleBarOverlay` Windows draws the minimise / maximise / close buttons on a
patch the page cannot paint, so under the tutorial's dim or a dialog's backdrop it stayed a white square. The page
now asks the main process (`win:overlay`) for the colour white takes under the same layers
(`logic/overlay.ts`: navy at 26 % for the tutorial, at 35 % for a backdrop, both when both — `#bdc5d4`, `#a6b1c6`,
`#7b8baa`) and for white again after; a MutationObserver on `body`'s class and on `dialog[open]` keeps it right.
The buttons keep working throughout. `tests/e2e/window.e2e.ts` reads the colour back from the window.

**One dialog.** Every question the window asks (`panels/ask.ts`) has Haram, in the same place and size — it was
hidden during the tutorial by the one-Haram rule's CSS, which now exempts a dialog and instead hides the tutorial
card's Haram while a dialog is up. A click outside the dialog does nothing (it used to close it as cancel; in the
tutorial a student clicks about, and a question that went away on such a click was not even noticed). Esc is cancel,
the safe side; the other answer only by its button. The backdrop is navy at 35 % (was 18 %) so a dialog reads as
modal, and being in the top layer it covers the tutorial's card and rings; `showModal` keeps the keys inside.

**The tutorial's result beats.** A practice step went on the moment the student had done the thing — at step 18 the
output appeared in the Console and the card was already on to step 19's error file. A practice step whose result is
something to see now shows it on the same card and waits for [다음]: *told to, done, shown what it did, then on.*
`Step.result` (title, body, targets, view/tab) is shown when `done` fires (or after [건너뛰기]), the practice keys do
nothing until [다음], and the step count stays 20. Steps 5 (the register that changed, and the PC's line), 12
(`total` in the Data tab), 15 (stopped at the breakpoint: the status bar and the line), 16 (stopped: the status
bar), 17 (the register back to 0, the status bar) and 18 (the Console's output, the status bar) have a beat. Steps 2,
10 and 14 go straight on: what they did (the Run side lit, the Data tab, the red dot) is what the next step points
at anyway; step 19's second phase is its beat already.

**Notices.** The Console's empty word was in the middle of its panel; the Inspector's sat at the top, and the Errors
panel spread its words top-left with Haram in the far corner of a wide panel. One component now (`notice.ts`): the
words, then the character at the far end (from the Editor, which most of them are about), the two centred in the
panel both ways, no wider than 640 px (the error list 760), the character 120 px in all four — the Console, the
Inspector, the card before the first assemble, the error list. A panel too short or narrow for the character (the
Console in a small window, the Inspector at 1093) keeps the words alone (a container query).

**Words.** The Inspector's empty state said "한 줄 실행하면 여기에 풀려 나옵니다 / F10 키를 누를 때마다 다음에 실행할
명령의 비트 필드와 하는 일이 여기에 나옵니다. Text 탭에서…"; now what the panel is for and how to get something into
it: "명령 하나를 32비트로 나누어 보는 곳입니다 / F10 키로 한 줄 실행하거나 Text 탭에서 명령을 누르면 그 명령이 여기에
나옵니다." The error panel's second line said "어셈블은 여기서 멈췄습니다."; now what went wrong and where to look,
without repeating the title's what-to-do: "N행에서 어셈블러가 읽지 못한 부분이 있습니다. 아래에 무엇이 문제인지
적었습니다." The card after an edit: "지금 기계에 있는 것은 고치기 전의 코드입니다. 저장하고 다시 어셈블하면(Ctrl+S) 고친
코드로 실행합니다." (was "…바뀌기 전의 코드입니다. …새 코드로 여기가 채워집니다."). The practice line: "직접 해 보세요 —
되면 결과를 짚어 드립니다" (was "되면 저절로 넘어갑니다"), and the beat's "됐습니다 — 결과를 본 뒤 다음으로".

**The hint that names the slip** (`src/core/near-miss.ts`). `.global main` is a syntax error to the core, and the
hint said "명령 이름, 레지스터 이름(예: $t0), 쉼표를 확인해 보세요". Now, on the line the assembler quotes, the
statement's first word is compared with the directives (if it starts with a dot) or the instructions, and each
`$`-word with the register names; a bare word that is a register's name is the register without its `$`. Near means
Damerau-Levenshtein distance 1 for a word of up to five characters and 2 from six on (one slip per five letters or
so); a word of two characters or less is never guessed at. Of the names at the least distance, the one sharing the
longest prefix, then the longest suffix (`.asciz`: `.asciiz`, not `.ascii`); still tied — or nothing within
reach — no guess, and the general hint stands: a wrong guess is worse than none. A register of a known family with
a number past it (`$s10`, `$t10`, `$a4`, `$32`) is named with the family's range instead. Labels, numbers, strings
and comments are not looked at (a label is the student's own name). "`.global` 지시어는 없습니다. 혹시 `.globl`?";
"`$s10` 레지스터는 없습니다. `$s` 레지스터는 `$s0`–`$s7` 입니다."; "레지스터 이름 앞에는 `$` 기호가 있어야 합니다:
`t0` → `$t0`." (`tests/core/near-miss.test.ts`; two mutants loosen the rule and the tie).

---

## 22. How the window speaks — wording, the tutorial's cards, the error panel, the Console's height, Windows at 1920

**No "that is all it takes" ending.** The ending that tells the student "doing X is enough" is a procedure's
voice: it puts the reader in the pupil's place. The window says what to do instead ("…고친 뒤 Ctrl+S 키를 다시
누르세요"). It was in the error panel's title and in its line for several errors; the user guide had the same tone
in a few places (what the Errors panel "tells you to do", "it is safe to run"). With it went sentences that said something twice or told what the screen already
shows: the unsaved-changes question ("저장하지 않은 변경이 있습니다" then "바뀐 내용을 저장하지 않았습니다"), the
tutorial's step 4 ending on its own title, step 12 announcing the "0 → 12" its result card then shows, step 17
saying twice that the breakpoints stay, the stop message's "레지스터와 메모리를 볼 수 있습니다" (now what to do next:
"이어서 하려면 F5", as at a breakpoint).

**A tutorial card is one text.** The green line under a practice card ("직접 해 보세요 — 되면 결과를 짚어 드립니다")
and under a result ("됐습니다 — 결과를 본 뒤 다음으로") gave orders from outside the text. A card is now a title and
a body. A practice step's body says what to do, and its last sentence what happens once it is done ("점을 찍으면
다음으로 넘어갑니다", "실행하면 무엇이 바뀌었는지 짚어 드립니다"); a result's body is what just happened. That the card
has no [다음] is the other sign that it waits (`tests/e2e/tutorial.e2e.ts` checks: one paragraph on every card, no
[다음] on a practice card until its result, [다음] and no [건너뛰기] on a result). Step 16's result card went: it
only said that the slow run the student had just stopped had stopped; the steps with a result card are 5, 12, 15,
17 and 18.

**The error panel.** "15행" was said four times in a small block (the title — line 15, then Ctrl+S again —, the
line under it, the error, the button), and "아래에 무엇이 문제인지 적었습니다" pointed 20 px down. Now the title
says what is wrong — "코드에 오류가 있습니다" (several: "코드에 오류가 N개 있습니다") — the line under it what to
do — "아래 줄을 고친 뒤 Ctrl+S 키를 다시 누르세요." (several: "위에서부터 하나씩 고친 뒤 …") — and the line's number
is in the error and on the button only ("N행으로 가기").

**The Console's height.** At 1920 the empty Console took 260 px while Registers above it scrolled. The Console's
height now follows the Editor's rule turned on its side: while it is empty (no output, no input asked for) it is as
tall as its one-line note (105 px at the default font; its character is left out there, the Inspector's is on the
same screen), and Registers takes the rest; with output it has its share as before, clamp(120 px, 26vh, 260 px).
A grip between Registers and the Console drags the border (at least 72 px of Console, 120 px of Registers) and a
double click puts it back, like the splitter between the Editor and the Run side. Nothing of it is kept. Maximised
1920 (1920×1040): Registers 847 px tall, the Console 105 (were 692 and 260), 781 of the 1040 px of registers shown
(was 626); with output 692 and 260 as before. 1280×800: 607/105 (504/208); 1093×582: 389/105 (343/151); 1024×728:
535/105 (451/189); 910×505: 312/105 (286/131).

**The Editor's width on Windows.** The 72-column cap took its character width from CodeMirror
(`defaultCharacterWidth`), and on Windows that figure was 7.0 px while the code font draws 6.75 px at the Editor's
13.5 px: the Editor came out 604 px, not 586 (seen in CI; the test had been made to skip on a screen smaller than
1920×1040, which hid it). The width is now measured with the code font itself (`monoCh` at the Editor's size), and
the layout is done again when the fonts have loaded. The 1920 test runs everywhere again, the Windows CI job
included.

**The runner's screen.** The Windows job sets the screen to 1920×1080 before anything else
(`tools/windows/screen-1920.ps1`: `Set-DisplayResolution -Width 1920 -Height 1080 -Force`, then
`ChangeDisplaySettings` if the screen is still otherwise; what it tried and the adapter's modes go to
`report/screen.txt`). It works: the runner's adapter (Microsoft Hyper-V Video) offers 1920×1080, and
`Set-DisplayResolution` alone takes the screen from 1024×768 to 1920×1080. The rest of the job runs on it: the 1920
test in the e2e against the installed app (Editor 586 px = the cap, Registers 847 px tall, the Console 105 px), and
`windows-frame.png`, which is now the maximised default layout as Windows draws it at 1920×1080, caption buttons
and taskbar included. The e2e do not depend on it: a window can be 1920 px wide on a smaller screen, and the tests
size their own windows.

---

## 23. Releases — every round that changes the app ends with one

v2.0.0's installer, published with the build of `b50e37d`, stayed the one students got while four rounds of changes
went only to `main`. From now on a round that changes the app (`electron/src`, `electron/native`, `CPU/`) ends with a
release, by the rules in `CLAUDE.md` at the repository root ("Releasing the Electron edition (2.x)"): the version
decided by what a student sees (minor) or not (patch), everything green first, the version raised and the notes
written in the commit that is released, the release checked as downloaded before it counts, no old release deleted.

**A tag does the rest.** Pushing `v2.x.y` runs `electron.yml`: the Windows job (build, tests, package, side by side
with 1.2.4, e2e against the installed app, the real Korean IME, the screens); the `upgrade` job, now over the latest
published 2.x release — its installer downloaded from its release page — as well as over the pre-merge preview build,
each time then over itself; then `publish` (Ubuntu: the tag must match `electron/package.json`, the notes
`electron/docs/releases/<version>.md` must exist, the package must be one file; the release is created from that run's
installer with the notes and the installer's SHA-256 appended, not a pre-release, Latest); then `release-check`, which
calls `release-check.yml` with the tag. A failure in any of these opens an issue. `release-check.yml` checks the
release as a student gets it: Latest, the installer its only file, 1.2.4 and every 2.x release still there, the
installer downloaded from the public address with the SHA-256 of the notes, installed on a clean runner (screen
1920×1080) with every e2e test passing against it (the real IME included), and every link and picture of the published
documents opening at the tag. It runs in that order because the job that calls it needs `publish`; a release published
by hand (a re-release after a rollback) triggers it by itself (`release: published`; the one CI publishes does not,
since events made with the workflow's own token start no workflow — the call covers it).

Between releases `main` carries the released version (rule 7), so the `upgrade` job run by hand there has no newer
version to put over the latest release: it says so in a notice and does not install. (Its first run, on `3e72321`,
installed 2.0.0 over 2.0.0 and failed on "the installed program is 2.0.0 (was 2.0.0)"; everything else passed.) On a
tag the same case is an error: the tag's version must be newer than the latest release's.

Rolling back is in `docs/WINDOWS.md` ("Rolling back a release"), written for any version.


---

## 24. The yellow row names itself; Save & Assemble

**No legend in the Registers head.** "노란 줄은 방금 바뀐 레지스터" sat in the panel's head, away from what it
explained. It went; the head's place stays empty (a note-less head has no divider either, `ui.ts`). The yellow row
says what it is by itself, with its "Changed" tag, and where the panel has no room for the tag the status bar says
it: "방금 바뀜: …" in the row's own yellow and bar (`.status .changed`), naming every register the last step or run
changed — three, then "외 N개" (after a run many rows are yellow; the status bar used to name the first only).

**Where the tag fits.** It used to show only with the roomiest margins and nothing given up, which Registers get from
a 1708 px window on. Now (`logic/columns.ts` `badgeStyle`) it shows wherever it fits beside the columns the width
keeps, with the tight margins if need be — never in place of a column, never at the cost of the font's pixel, and in
the width Registers have anyway: from a 1651 px window on (tight margins up to 1703, the roomy ones from 1704), so
1680×1050 and the maximised 1920 screen have it. The badge is 56 px now (it was given 62), which leaves Text 6 px
more at the widest.

Giving Registers the tag's 62 px first when the Run side has them was tried: the tag then shows from 1524 px, 1536
(1920×1080 at 125 %) included — but the 62 px come out of Text, whose Instruction column then cuts its labels:
`jal 0x00400024 [main]`, `ori $9, $1, 20 [table]` (Text 439 px wide at 1536 and 503 at 1600, against 492 and 527
now). The status bar already says what the yellow row is at every width, so no panel gives anything for the tag.
Below 1651 there is no room for it:

| Window | Editor | Run grid (its panels want 852) | Registers' list | What says what the yellow row is |
|---|---|---|---|---|
| 1920×1040, maximised | 586 (72 columns) | 1310 | 486 | the tag and the status bar |
| 1680×1010 | 586 | 1070 | 475 | the tag (tight margins) and the status bar |
| 1536×864 | 586 | 926 | 409 | the status bar (the tag needs 462) |
| 1280×800 | 404 | 852 | 400 | the status bar |
| 1093×582 | 300 (its least) | 769 | 400 | the status bar |
| 1024×728 | 300 | 700 | 400 | the status bar |
| 910×505 (the Run tab) | — | 894 | 400 | the status bar |

At the four course widths the list is 400 px and Name, Hex, Dec and Bin with the tight margins take 399.25 of them.
The tag there would cost a column the course needs or someone's width: at 1280 the Editor's (404 → 342 px); at 1093
and 1024 the Run side is already 83 and 152 px short of what its panels want (Text gives up columns, Data scrolls
sideways at 1024); at 910 (the Run tab) 42 px are spare, and the tag needs 62. The status bar is the whole window
wide, and `tests/e2e/fit.e2e.ts` checks at each width that its "방금 바뀜: …" is whole on screen, and at 1680 and
1920 that the tag is.

**Save & Assemble.** The button saves and assembles, and its key is Ctrl+S; "Assemble" said half of it. It is now
Save & Assemble where it saves, and Assemble where it does not:

| The file | The button | Pressing it |
|---|---|---|
| on disk (opened, or saved before) | Save & Assemble | saves it in place, assembles; the status bar: "저장됨" |
| new, never saved (`untitled.s`) | Save & Assemble | asks where to save it (the system's dialog), saves, assembles; the dialog closed: assembles all the same, "저장하지 않음 (어셈블은 했습니다)" |
| a tutorial example (read-only) | Assemble | assembles; "예제라서 저장하지 않습니다"; the tooltip says so too |

The Run side's placeholder button takes the same name, and the status bar's hint before the first assemble is
"어셈블 (Ctrl+S)" for an example ("저장·어셈블 (Ctrl+S)" otherwise). What Ctrl+S did with the file is now in the
status bar after a clean assemble as well, until the first step (it was shown only beside errors).
`tests/e2e/assemble.e2e.ts` checks the three and the narrow title bar; the tutorial's step 2 card says what the button
is on the student's own files ("내 파일에서는 이 버튼이 저장도 함께 합니다(Save & Assemble 버튼)").

**A cancelled save.** A new file whose save dialog was closed was assembled, but the window then said "코드가
바뀌었습니다" and hid the machine, and F10 asked for the file's place again instead of stepping: one flag, `dirty`,
meant both "not saved" and "not what was assembled". They are two now: `dirty` (the title bar's dot, the question
before another file replaces it) and `edited` (the Run side's machine, "코드가 바뀌었습니다", F5 and F10
assembling first).

**The title bar.** "Save & " is 43 px. It gives way in the title bar's chain after the key hints and the buttons'
icons, before the speed turns into one button and the spacing tightens (`app.ts` TITLE_STEPS, named classes now:
nokeys, noicons, short, onespeed, tighter; the program's name, last, noapp); the tooltip keeps the whole name. At 910
nothing changes from 2.1.0 (the name is short there, as the rest already gave way). Room left after the chain, in px,
lab04.s / a twenty-column name with Hangul (lab04_김학현_20210123.s); "+30": the caption buttons 30 px wider, as on
Windows:

| Window | lab04.s | +30 | long name | long name, +30 |
|---|---|---|---|---|
| 1920×1040 | 768 (Save & Assemble, everything) | 738 | 664 | 634 |
| 1280×800 | 128 (Save & Assemble, everything) | 98 | 24 | 73 (no key hints) |
| 1093×582 | 20 (Save & Assemble, no key hints) | 94 (and no icons) | 20 (no key hints, icons) | 33 (Assemble; the speed switch whole) |
| 1024×728 | 55 (Save & Assemble, no hints, icons) | 25 | 88 (Assemble, one speed button) | 58 |
| 910×505 | 59 (Assemble, all steps) | 29 | 0.5 (the name cut: lab04_김학현_….s) | 3 (lab04_김….s) |

"Hallym MIPS" stays everywhere; nothing runs under the caption buttons (`fit.e2e.ts`, now with the maximised 1920
too). And a window made wider kept the title bar it had when narrow: the room kept for the caption buttons (the
padding's `env(titlebar-area-*)`) is updated only after the resize and the layout, so the title bar is fitted again
on the overlay's `geometrychange` (seen when the test for the name widened a 910 window to 1280: 392 px free, the
name still short).

---

## 25. Changing the code keeps the machine; the Assemble panel; the tutorial lights whole panels

**The Run side stays.** A single character typed after assembling used to cover the whole Run side with a card
("코드가 바뀌었습니다"): Registers, Text, Data, the Inspector and the Console went away the moment a student began to
change the code -- and a student changes code because of what those show. Now the Run side shows the last program that
assembled, from the first assemble on (before it, the card), and a band of one line over it says "지금 보이는 것은
마지막으로 어셈블한 코드입니다 (hh:mm:ss) · 고친 코드를 어셈블하려면 Ctrl+S". Run, Step and Reset go on with that
program: the core holds it, and nothing about it is thrown away (`ready()` assembles only when there is no program yet).
`machineShown()` is "a program in the machine", `current()` "and the Editor's code is that program".

**A program with errors leaves the machine as it was.** The core's assemble starts from an empty machine
(`initialize_world`), so assembling the student's code with an error in it would have taken the last good program,
and where it had run to, with it. Every assemble now goes first to a second simulator process (`src/main/main.ts`,
`sim:check`), which only says whether it assembles and what the errors are; the machine on screen is touched only when
it does. The same keeps a program that ends the core (a `.err` directive) away from the machine: the second process
ends, starts again, and its answer is the core's own words (as an answer, not an error: an error's name does not cross
into the page). Without a second process (it did not start) the window assembles as before.

**The Editor never points at a wrong line (3-1).** The line being executed is marked in the Editor only while the
Editor's code is the program's; once it has changed, the Editor marks none -- its line numbers are no longer the
program's, and matching the text of a line is not enough (the same `addi $t0, $t0, 1` one line up after a line was
added above: `tests/e2e/editing.e2e.ts`) -- and the Text panel alone shows where PC is. After the next assemble the
mark is back, on the new line numbers. Breakpoints in the Editor move with the text as before; set or cleared in
changed code, they take effect at the next assemble (the status bar says so); set in Text, they are on the program
Text shows, at once.

**Reset (3-2)** starts the program in the machine again from the beginning -- the last one that assembled, with the
options and breakpoints it was assembled with -- whatever the Editor holds; assembling is Save & Assemble's. It used to
assemble the last program again with the current settings, which made it an assemble in all but name, and it
re-mapped the breakpoints through the Editor's lines, which is wrong once they have moved. Settings changed since
(Settings > 고급) now apply at the next Ctrl+S only, as the status bar has always said ("다시 어셈블하면(Ctrl+S)
적용됩니다"); the settings test says so too. The tutorial's step 17 says what Reset is: "마지막으로 어셈블한
프로그램을 처음 상태로 되돌립니다. 코드를 고쳤더라도 다시 어셈블하지는 않습니다(어셈블은 Ctrl+S)."

**The Assemble panel** replaces the Errors panel, under the Editor instead of over the Run side: the errors belong
next to the code they are about. Its name is the button's (Save & Assemble): it says what the last assemble did, not
only when it failed --

| State | What it says |
|---|---|
| before any assemble | "Ctrl+S 키를 누르면 저장하고 어셈블합니다. 결과와 오류가 여기에 나옵니다." |
| assembled | its time in the head (hh:mm:ss), "어셈블했습니다 · 명령 N개 · 저장됨" |
| assembled, the code changed since | and "코드가 바뀌었습니다. 실행은 마지막으로 어셈블한 코드로 합니다 — 고친 코드를 어셈블하려면 Ctrl+S 키를 누르세요." |
| errors | the error list as before (what is wrong, what to do, each line with its hint, "N행으로 가기"), without the character; and, with a program in the machine, "오른쪽에는 마지막으로 어셈블한 코드가 그대로 있습니다." |

It is as tall as its words, up to 40 % of the column (at least 240 px: one error and its button), its list scrolling
past that; a grip over it (like the Console's) drags its height up to what leaves the Editor six whole lines (its head,
6 × 22 px, and room for a sideways scroll bar: 188 px at the default font), and a double click puts it back. Nothing of
it is kept. Heights, Editor / Assemble in px (whole lines of code the Editor shows):

| Window | before any assemble | assembled | code changed | one error | three errors |
|---|---|---|---|---|---|
| 1280×800 | 621 / 91 (26) | 641 / 72 (27) | 600 / 113 (25) | 492 / 220 (20) | 424 / 288 (16) |
| 1093×582 | 403 / 91 (16) | 423 / 72 (17) | 362 / 132 (14) | 274 / 220 (10) | 254 / 240 (9) |
| 1024×728 | 549 / 91 (23) | 569 / 72 (24) | 508 / 132 (21) | 420 / 220 (17) | 381 / 259 (14) |
| 910×505 (the Editor tab) | 346 / 72 (13) | 346 / 72 (13) | 324 / 93 (12) | 197 / 220 (7) | 188 / 229 (6) |
| 1920×1040 | 881 / 72 (38) | 881 / 72 (38) | 840 / 113 (36) | 732 / 220 (31) | 583 / 369 (24) |

The Editor scrolls as before: "N행으로 가기" brings the line in, and a step brings the line being executed in unless
the student is scrolling the Editor. In a narrow window the errors stay on the Editor tab (they used to switch it to
the Run tab). Before there is a program, the Run side's card says whether nothing is assembled yet, the first assemble
had errors ("아직 어셈블된 프로그램이 없습니다", pointing at the Assemble panel) or the simulator stopped. The status bar
no longer says "코드가 바뀌었습니다" (the band does); after an assemble with errors that kept the machine it says
"고친 코드에 오류 N개 — Assemble 패널".

**The tutorial lights whole panels.** It used to light the targets alone and dim everything else, which cut panels
into pieces: at step 3 the card says the 32 registers are grouped by use, while the head and the Temporaries band were
lit and the other groups dimmed -- the surroundings are what the step teaches. Now it draws two layers: the panel each
target is in is lit whole (the title bar for a toolbar button, the status bar for its words) and the rest dimmed; a box
on each target says where to look. Lit is not clickable: a clear layer with holes at the targets alone takes every
other click. The card never covers a box and keeps off the lit panels where the window has room (at 1280 and 1093
always; at 1024 and 910 it lies over one at six steps each); Haram is at the card's end away from the first target.
What each step lights (1280×800):

| Step | Lit |
|---|---|
| 1 | Editor |
| 2 | Toolbar |
| 3 | Registers |
| 4 | Editor, Text |
| 5 / its result | Toolbar, Editor / Registers, Editor |
| 6, 7 | Registers |
| 8 | Inspector |
| 9 | Inspector, Text |
| 10, 11 | Text (Data) |
| 12 / its result | Editor, Text / Text |
| 13 | Text (Data), Registers |
| 14 | Editor |
| 15 / its result | Toolbar / status bar, Editor |
| 16 | Toolbar |
| 17 / its result | Toolbar / Registers, status bar |
| 18 / its result | Editor, Console / Console, status bar |
| 19 / after Assemble | Toolbar / Assemble |
| 20 | nothing (the card in the middle) |

`tests/e2e/tutorial.e2e.ts` walks the twenty steps at the four widths and checks at each: every target's panel lit
whole (its corners and middle not dimmed), dark exactly outside the lit areas (a grid of points over the window), a box
on every target, a spot of each lit area off the targets refusing the click, the card off the boxes (and off the lit
panels from 1093 on). Step 19 points at the Assemble panel now; the steps on the Editor (1, 5, 12, 14, 18) bring their
lines into the shorter Editor as before.

## 26. The first screen's video; the executable image (.hmx); the installer's finish page

Three changes, released together in 2.4.0.

### The first screen's video

The first screen shows 12 seconds of the university's promotional video behind its card. The source is "[Official Video] 한림대학교 홍보영상｜The New Hallym 대학의 내일을 열다", from the official channel @HALLYMNEWS. It plays without sound and loops.

**The file** is `src/renderer/assets/hallym/start/start.webm`, made by `tools/start-video.ts`:
- only the video track was fetched (yt-dlp, 1080p VP9);
- it holds 0:00–0:12 at 960×540, 30 fps, VP9 in WebM (CRF 40), 1,584,476 bytes;
- there is no sound track at all (`-an`), and `tests/renderer/start-clip.test.ts` reads the WebM's track list to check this.

**The seam.** The clip's last 0.8 s show the source's last 0.8 s crossfading into its first, and the clip starts where that fade ends. So the clip is 11.2 s long, and its last frame leads into its first as any two neighbouring frames do (PSNR 23.6 dB across the seam, against 10.8 dB for a plain cut from 12 s back to 0 s). The `loop` attribute does the rest. The still `start.jpg` (114,708 bytes) is the clip's first frame.

**On screen** (`src/renderer/app/panels/backdrop.ts`):
- The still is there at once, and the clip fades in over it (0.6 s) once it plays. The window never waits for the video.
- Under `prefers-reduced-motion`, only the still is shown and the clip is not even loaded; a change of the setting takes effect at once.
- If the clip cannot play (an `error` event, or `play()` refused), both the still and the clip go, leaving the brand's navy. There is no message, and it is never white.
- Off the first screen the clip is unloaded, not only paused. It comes back with the first screen, as after a tutorial started from it.
- It is one element for both steps of the first screen, and a step changes only the card's buttons, so the video runs on from one step to the other.
- The page's CSP gained `media-src 'self'`: only the app's own file is played. Nothing is fetched while it plays.

**Readable.** The video is blurred (3 px) and slightly desaturated, under a navy tint: 78 % behind the card, 50 % at the edges. The card stays opaque white with a soft shadow. Haram stands on the card's white, never on the video (assets README, "How this program keeps them"). `tests/e2e/start.e2e.ts` checks at three moments of the video that:
- the card's pixels do not change while the ground's do;
- the ground's luminance stays under 0.4, and the card's over 0.85.

**To use another video**, such as the university's own master, run `node tools/start-video.ts <file>`. It rewrites the clip and its still. The blur and the tint are CSS, so nothing else changes (`docs/ARCHITECTURE.md`). NOTICE section 8 names the video with the marks and characters.

### The executable image (.hmx)

Hallym Circuit Studio (on Logisim 2.7.1) runs MIPS programs on CPUs the students build. Instead of an assembler of its own, it loads what Hallym MIPS assembled: an **executable image**. It is not an object file, since nothing is left to relocate or link. The format is `docs/hmx-format.md` at the repository root, the reference, version 1. It lives there and not in `electron/docs/`: it is a contract another program reads, not a detail of this edition, and `docs/` holds what is read from outside (the guides, the comparison). Circuit Studio pins its address at a tag, so the path is fixed from `v2.4.0` on. The golden files stay in `electron/tests/hmx/`, the tests that make them. The icon **Export executable image (.hmx)** is in the title bar's right-hand group; the toolbar on the left is unchanged.

Every value comes from a core. `src/sim/image.ts` reads it from the second process (the one that checks assembles, §25), right after assembling the program there. Nothing is taken from the machine on screen, which may have run, and nothing is assumed:
- `entry` is `main`'s address from the symbol table;
- `$sp` and `$gp` are the registers as assembling left them;
- `endian` is the order in which the word at `$sp` (`argc`) lies in memory;
- `.text` is the user text segment from its first to its last instruction, the start-up code included;
- the data range is what the assembler filled. The addon's `assemble` now reports it (`data: { start, end }`: `next_data_pc` before the handler and after the program; `native/src/addon.cc`).

Four decisions:

1. **The Editor changed since the last assemble: the image is of the last assembled program.** That is the program Run and Step use (§25), and `source-sha256` is its source's hash. The button stays usable, and the status bar says "마지막으로 어셈블한 코드를 실행 이미지로 저장했습니다". Refusing would send the student to assemble code that may not assemble yet. Exporting the Editor's text would give an image of a program nobody has run, whose words the Text panel does not show.
2. **Labels are the program's own**, global or local, in its text or data. Left out are:
   - the exception handler's labels (`__start`, `__eoth`, its kernel labels), found by assembling the handler alone with an empty program;
   - labels in the kernel segments.

   They are sorted by address, then name. Without the handler, a program's own `__start` is its own label, and is listed.
3. **`.data` runs from where the assembler put the first datum to where it would put the next**, so a trailing `.space` is included. It is widened to any other byte that is not zero (data put elsewhere by `.data <addr>`), and there is none when that is empty. The `$gp` area below it and the kernel's data are left out unless the program wrote there. Runs of 16 zero bytes or more are written `zero <count>`. So the file is small, and a reader can still tell how big the program's data is.
4. **The dialog** is the system's save dialog, titled "Export executable image (.hmx)", with the filter `.hmx`. It offers `<name>.hmx` in the source's folder (an unsaved program: `untitled.hmx` in the dialog's own default folder). The image is made before the dialog opens. A program that cannot give one (no `main`) gets a status-bar line instead of a dialog.

`source-sha256` is taken over the source as its file holds it: its encoding, BOM and line ends, through the same `encodeTextFile` that saves it. A file saved by the assemble (Ctrl+S) therefore has exactly this `sha256sum`.

**Tests.**
- `tests/hmx/` holds seven pairs of `.s` and `.hmx`, the golden images:
  - branches;
  - `.data` through `la`/`lw`;
  - `main` after a function;
  - pseudo-instructions;
  - no `.data`;
  - a 4096-byte `.space` gap and a trailing `.space`;
  - without the exception handler.
- `tests/sim/hmx.test.ts` makes each image again and compares it with its golden, all but the `assembled` time and the version in `produced-by`. It reads each golden back with a strict reader (`tests/helpers/hmx-read.ts`) against a fresh core, word by word and byte by byte. It also checks that the same program gives the same image, that the reader refuses a later version and a wrong count, and that the example in `docs/hmx-format.md` is the `data` case.
- `tests/e2e/export.e2e.ts` exports from the window and checks:
  - the file is the golden;
  - its words are the Text panel's, address for address;
  - after an edit it is still the assembled program, with that program's hash.
- The settings test's program without the handler exports `entry 0x00400000` (with the handler, `main` is at `0x00400024`, after the start-up code).
- Nine mutants cover the image: a wrong address, a wrong count, the byte order reversed, the Editor's text exported, the start-up code left out, the handler's labels listed, a fixed entry, a trailing `.space` dropped, and Export before an assemble.

**The title bar** carries a fifth icon. In its tightest step (§21) the icon buttons are 20 px wide with no gap, so a long file name still keeps 10 columns at 910 px beside the program's name.

### The installer: the progress, then the finish page

2.0.0–2.3.0 used electron-builder's one-click installer: a progress window that closed, and the program did not start. From 2.4.0 it is the assisted installer (`oneClick: false`), in Korean (`installerLanguages: ['ko_KR']`), and it has two pages:
1. the progress;
2. **설치가 완료되었습니다**, with **지금 실행하기** ticked and 마침 (`packaging/installer.nsh`, `customFinishPage`).

Nothing else is asked:
- the folder cannot be chosen (`allowToChangeInstallationDirectory: false`);
- the "for all users / only for me" page is answered before it shows (`customInstallMode` forces the current user), since all users would need an administrator.

It installs per user, as before, into `%LOCALAPPDATA%\Programs\Hallym MIPS`. The uninstall entry ("Hallym MIPS <version>", under HKCU, the same key) and the Start menu's "Hallym MIPS" are unchanged. `/S` still installs silently and starts nothing, so the CI's silent install, the side-by-side check with 1.2.4 and the upgrade over 2.3.0 run as they did.

`tools/windows/check-installer-ui.ps1` runs the installer on the Windows runner as a student does, with its pages. It checks that:
- there are exactly two pages;
- the finish page has its title and the ticked checkbox;
- 마침 starts the program;
- the program went where `/S` puts it.

It pictures the progress page, the finish page and the started program, then uninstalls it.

On Linux, electron-builder needs wine to make the uninstaller. To compile the installer script without it (to catch NSIS errors before CI), point `isMacOsCatalina()` at its pure-JavaScript uninstaller reader. This is a scratch-build trick, not part of `tools/package.ts`.

## 27. The first screen, measured on the screen; a clip with nothing written in it; the installer in the app's colours

**The background reaches the screen processed, on Windows too.** A picture of the installed program on Windows (`installer-started.jpg`, 2.4.0) looked sharp and untinted, so the processing was measured.

It is not `backdrop-filter`: it is `filter: blur(3px) saturate(.85)` on the `<video>` and the still themselves, and a semi-transparent navy `::after` over them. `tests/e2e/backdrop-measure.ts` takes the background's pixels from the screen: `CopyFromScreen` on Windows, which is what DWM shows; the X server's on Linux. It compares them with the clip's own frame, drawn with no filter at the same geometry:
- **tint:** how far the mean colour moved toward the navy;
- **blur:** the relative local variance (mean 3×3 variance over the region's variance, so the tint's dimming cancels out), screen over raw.

With the processing it measures about 0.6 and 0.3; without it, 0.0 and 1.0.

| Where | Tint (toward navy) | Blur (local variance / raw) |
|---|---|---|
| Linux, 1280 / 1093 / 1024 / 910 / 1920, playing | 0.614 / 0.598 / 0.611 / 0.593 / 0.625 | 0.315 / 0.311 / 0.308 / 0.202 / 0.226 |
| Windows runner, installed app, e2e, playing | 0.598 | 0.306 |
| Windows runner, the program 마침 started (`installer-started.png`) | 0.603 | 0.254 |

The Windows runner composites in software (`gpu_compositing: disabled_software`). There the screen equals the compositor's readback in every variant the probe tried (`tools/probe-platform.ts`, phase 3):
- as is, playing and paused;
- the still alone;
- a tint `div` without the filter (tint 0.600, blur 0.995: no blur);
- the filter on a wrapper;
- a canvas.

So nothing changed in how it is drawn. `start.e2e.ts` now asserts both numbers on the screen while the video plays (tint > 0.4, blur < 0.6), at every width and in the Windows job's e2e against the installed app.

Why the picture looked sharp: at 1920 the clip is enlarged 2.1× (1.4× at 1280), and the aerial frame is full of detail. At the clip's own scale the blur is no weaker there (0.266 at 1920 against 0.305 at 1280).

Also in that picture, six seconds after the program started, the clip was still on its first frame. The Windows job now records Windows' "animation effects" setting (`SPI_GETCLIENTAREAANIMATION`, which `prefers-reduced-motion` follows) and whether the start screen moves. On the runner the setting is off, and the background did not change over 2 s: a program started there shows the still, processed the same way. Playwright's launches force `no-preference`, so the e2e ran the video. Windows 10 and 11 have animation effects on by default, so a student's PC plays the video; with them off, it shows the still.

**The clip is one aerial shot, 0:00.1–0:02.6 of the source, slowed to a third.** All 336 frames of 2.4.0's clip (0:00–0:12) were looked at (`docs/screens/start-clip-2.4.0-contact.jpg`):
- "한림대학교" on the gate sculpture (frames 57–101);
- a building sign with the symbol and Korean (102–138);
- "HALLYM REC CENTER" (139–168);
- a Korean building sign (169–201);
- motion graphics over the last aerial shot (248–319);
- six hard cuts (scene score above 0.4 at 57, 102, 139, 169, 202 and 248).

The whole source (217 s, 110 cuts) has no shot longer than 5.3 s. Every long shot carries captions, signs, logos, graphics or people. The one clean shot is the opening aerial pass (0:00–0:02.7).

`tools/start-video.ts` gained `--slow`: `minterpolate` (motion-compensated) makes the frames in between. The loop's end still crossfades into its start. The clip:
- 6.7 s, 201 frames, 786,024 bytes (2.4.0's: 1,584,476);
- no cut (highest scene score 0.082, inside the crossfade);
- the seam's PSNR 30.3 dB, against 34.2 dB between neighbouring frames.

The still is its first frame. The three pictures of moments are now at 0.5, 3.0 and 5.5 s. `docs/screens/start-clip-contact.jpg` shows every frame.

**The installer in the app's colours.**
- The finish pages' band is `packaging/installerSidebar.bmp` and `uninstallerSidebar.bmp` (`tools/installer-art.py`, 164×314): the navy, the symbol unaltered on a white plate, "Hallym MIPS" in Pretendard. It replaces electron-builder's light-blue drawing.
- The progress bar is the app's blue (#0055A5) on a pale track, not Windows' green. The common control takes colours only without its visual style, so the progress page's show function takes the style off (`SetWindowTheme`) and sends `PBM_SETBARCOLOR` / `PBM_SETBKCOLOR`. The bar is then flat, as the app's own bars are.
- `check-installer-ui.ps1` samples both from the screen.

**Checkouts:** `docs/**` is `-text` at the repository root, as `electron/` is in `electron/.gitattributes`: 2.4.0's Windows checkout gave the spec CRLF, and a test broke on it.

## 28. The mutants against a baseline, a weekly full pass in CI; one tested installer per release

A round without a release (tools, workflows, documents only).

**Mutants: `node tools/mutants.ts --changed`.** It is what the 2.4.0 and 2.5.0 rounds did by hand (82 run and 87 skipped; 18 and 153), from the `file` and `tests` every mutant already has.

The baseline is `tools/mutants-baseline.json`: the commit, date and killed mutants of a full pass that killed every one. A mutant runs if:
- its `file` or one of its `tests` changed since the baseline's commit, whether committed (`git diff`) or not (`git status -z`: staged, unstaged, untracked, both sides of a rename);
- or it is not among the baseline's.

The rest are listed as skipped, with their files. Before anything runs, it checks again that none of the skipped mutants has a changed file; one that does ends the run as a failure.

It runs all of them and says why when:
- there is no baseline file;
- the baseline commit is not an ancestor of HEAD;
- git gives no change list;
- a mutant's file or test does not exist.

It never quietly runs none: a FILTER matching nothing is an error.

The list is the program's own array, not text parsed out of a file, so comments and quotes cannot confuse it.

The find check (every `find` exactly once in its `file`, text only) runs first in every mode, and a stale mutant stops everything.

`--jobs` runs several at a time: by default a third of the cores, 1 to 6. The addon-rebuilding ones run one at a time, after the rest. On Linux each worker has its own Xvfb display (`xvfb-run -n`, from :120).

`--verify-selector` checks the selector in a temporary `git worktree` of HEAD, which is removed after (never `git clean`, whose `-x` would take `slides/`):
1. The baseline commit itself picks 0.
2. A blank line added to `src/core/decoder.ts` picks exactly its 3 mutants.
3. A blank line added to `tests/e2e/fit.e2e.ts`, a test file only, picks exactly the 18 mutants on other files that it runs.

**The full pass in CI:** `.github/workflows/mutants.yml`, weekly (Monday 03:00 in Korea) and by hand, never on push or tags.
- Six shards on Linux, each two at a time. Each first runs its tests with no mutant (the control), since a test failing on the runner would make every kill meaningless. From 2.6.0 every run of `tools/mutants.ts` does, `--changed` included; `--no-control` skips it (§29).
- A merge job publishes each mutant's result, killing test and seconds as the `mutants` artifact and the run's summary. It fails unless every mutant is there once and killed, and it prints the baseline that pass makes.
- A person commits that baseline; CI does not write to the repository.

This was the one check with no public record.

**The release, checked once and published as checked.** Until 2.5.0 the Windows job ran three times on the same code for a release: the release commit's push run, the dispatch that rule 3 required for the upgrade check, and the tag's run. The tag's run built a new installer and published it. Since the installer is not byte-reproducible (29 bytes apart in 2.4.0), the published file was one no check had touched; only the post-release check did.

Now:
- `upgrade` runs in every push run of main.
- The tag's run builds nothing. Its job `tested` finds the tagged commit's own run, which must be for that SHA, with its build, tests and upgrade green and the upgrade really run. It takes that run's installer; `publish` publishes that file.
- 48e645c's installer, which never changes, is built once and kept in the Actions cache.
- The installer pictures come from the release commit's run and are committed before the tag, whose own run then checks that commit. So a tag carries its own pictures: v2.5.0's `installer-finish.png` was 2.4.0's, byte for byte, because the new ones were committed after the tag.

Per release, measured (2.5.0's runs, then this round's with the cache):

| | Before | After |
|---|---|---|
| Windows build-and-test jobs | 3 (15.9 + 16.4 + 16.8 min) | 2: the release commit's, the pictures commit's (about 15.5 min each) |
| Upgrade jobs | 2 × 5.7 min (3.8 of it rebuilding 48e645c) | 2 × 1.1 min (cache hit) |
| Tag run | build 16.8 + upgrade 5.7 + publish 0.3 + post-release check 7.2 | pick the checked installer (seconds) + publish 0.3 + post-release check 7.2 |
| Qt workflow | 9.0 min (a root document in the release commit ran it) | 0, unless a Qt input changed |
| CI minutes | 77.0 | about 41 |

**The Qt workflow** runs only when one of its inputs changes (`paths` in `ci.yml`): `QtSpim/`, `tests/`, `Tests/`, `tools/`, `Setup/`, `CPU/`, SPIM's `README`, the guides `docs/GUIDE*.md` and `docs/images/`, and `ci.yml` itself. Rule 3 asks it to be green on the last commit that changed one of them. It had been dispatched by hand on Electron-only release commits, which proved nothing about an unchanged Qt edition. `CPU/` is shared, so a change there still runs both.

**Screens:** `tools/capture-screens.ts` fixes the windows' clock (`page.clock.setFixedTime`). The Assemble panel shows the assemble's time, which made every retake differ in about 300 pixels by 100 levels and more. A capture is kept only when it differs from the file on disk:
- more than 20 pixels by more than 2 levels;
- or any pixel by more than 24.

The rest is anti-aliasing noise (one pixel by 3 levels, seen twice). A second and a third retake wrote none of the 42 pictures.

**The runner's animation effects** are turned on (`tools/windows/animations-on.ps1`, `SPI_SETCLIENTAREAANIMATION`), as on the students' PCs. With them off, `prefers-reduced-motion` held and the program the installer's 마침 started showed its still.

**What the blur measure compares with** (`tests/e2e/backdrop-measure.ts`): the frame the video has decoded at that moment (or the still, before it loads), drawn with no filter at the same geometry, taken anew at every measurement. It is not a stored value, so a new clip keeps the test meaningful.

## 29. The first screen as one picture: the photo under the whole window, a glass card (2.6.0)

**What changed, and why.** 2.5.0's first screen was rejected:
- the card floated over the background instead of sitting on it;
- a navy tint of up to .78 made the photo one blue, with every green gone;
- the white title and status bars cut the screen into three pieces;
- the card was larger than its content.

Seven designs were pictured and measured (`docs/start-variants/`). Design 5 (the photo under the whole window) and design 4 (the glass card) each solved one of the problems, so four combinations were tried next (`docs/start-variants/combined/`). The one chosen is combination B, with the secondary text darker:

- **The photo fills the window.** `.wback` is `position: fixed`, under the title bar and the status bar too.
  - On the first screen (`body.first-screen`, set in `layout()`), both bars are dark glass over it: navy at .3 with `backdrop-filter: blur(16px)`, white words and icons, no dividing lines.
  - The symbol mark keeps its own colours.
- **The photo's treatment.**
  - The filter is `blur(8px) saturate(1.25) sepia(.1) hue-rotate(-6deg)` (was `blur(3px) saturate(.85)`).
  - The veil is an even navy .4 (was .5–.78), a shade darker at the top and bottom for the bars.
  - The colour-share figures moved from +10.8 points of blue and −2.6 of green to about +6.2 and 0.
- **The card is glass and smaller.**
  - White at .82 with `backdrop-filter: blur(18px) saturate(1.2)`; buttons white at .8 (the main one at .85).
  - 722×273 (was 780×289): a 168 px character, a 28 px gap, 28/32 padding.
  - Its secondary text (`.lead`, `.action .sub`) is `--text-2-glass`, #4b5563: 7.56:1 on white, where `--text-2` (#5a6472) is 6.0:1.
- **The caption buttons' patch is transparent on the first screen**, with white symbols (`logic/overlay.ts`, `captionPatch`). The bar shows through it, and so does a dialog's backdrop over the first screen.
  - Elsewhere it is as before: white, or white under the tutorial's dim or a dialog's backdrop, with navy symbols.
  - The IPC now carries both colours (`win:overlay`, `{ color, symbolColor }`).
  - Windows takes the alpha: on the runner's screen the patch read 46,71,109 and the bar beside it 46,71,109 (run 36439439685). An opaque patch left a visible rectangle.

**Why .82 with darker text, not a thicker card.** The secondary text on the glass at .82 was 4.21:1 at its worst frame, under WCAG AA's 4.5:1. There were two ways to lift it, both measured over 13 frames at two sizes, on Linux and on the Windows runner:

| | lead text, worst (Linux / Windows) | how much of the ground the card lets through |
|---|---|---|
| .82, #5a6472 (the design as first drawn) | 4.21 / 4.17 — under 4.5 | the most |
| .86, #5a6472 | 4.59 / 4.55 — over by 0.05 | less |
| .90, #5a6472 | 5.00 / 4.95 | the least: a white card again, nearly |
| **.82, #4b5563 (chosen)** | **5.31 / 5.26** | the most, unchanged |
| .86, #4b5563 | 5.79 / 5.73 | less |

Darker text is better on both counts: more contrast than .90, and the card keeps all of its glass. A thicker card buys contrast by giving up the thing the card was changed for.

The fallback was set in advance: if the worst frame over the whole clip came under 4.8, the card would go to .86 with #4b5563. Over all 201 frames at the harness's size the worst is 5.34, so it stays at .82.

**Measured before the thresholds were placed**, with `tools/start-variants.ts app` (the app as built, nothing laid over it). The measurements are taken as the screen shows them:
- over the clip: every frame at 1280×800, 25 frames at each of the other e2e sizes;
- with the ground's treatment on and off (the off state must read as the raw frame, or the row is marked invalid);
- with the card's backdrop-filter on and off.

| e2e size | tint, on | tint, off | sharpness, on | sharpness, off | glass, on/off | worst text |
|---|---|---|---|---|---|---|
| 1280×800 (201 frames; the glass 25) | 0.428–0.431 | −0.004 | 0.105–0.172 | 1.005–1.022 | 0.364–0.416 | 5.34 |
| 1093×582 | 0.411–0.412 | −0.013 | 0.165–0.244 | 0.969–0.984 | 0.354–0.417 | 5.34 |
| 1024×728 | 0.427–0.429 | −0.003 | 0.110–0.174 | 1.007–1.015 | 0.356–0.418 | 5.34 |
| 910×505 | 0.402–0.405 | −0.017 | 0.183–0.279 | 0.981–1.007 | 0.338–0.419 (201 frames) | 5.35 |
| 1920×1040 | 0.442–0.444 | −0.002 | 0.096–0.139 | 1.000–1.015 | 0.396–0.414 | 5.31 |

The thresholds (`tests/e2e/start.e2e.ts`) and what each guards:
- **Tint > 0.2** (was 0.4). It guards the navy veil. The design reads 0.402 at its lowest and the treatment off −0.002 at its highest, so 0.2 is the middle. The old 0.4 was 0.002 from the design's own lowest value.
- **Sharpness < 0.6** (unchanged). It guards the blur: at most 0.279 with it, at least 0.969 without.
- **Every text on the card ≥ 4.5:1** against what is behind it, at seven moments of the clip. It guards readability; the threshold is WCAG's, not a calibrated one. It replaces "the card does not change while the video does, and the ground around it is dark": a glass card is meant to change with the video.
- **Glass ≤ 0.85**: the card's sharpness with its backdrop-filter over the same without it, in the same frame. It guards the glass; with no filter the ratio is 1.
- **The caption patch on Windows' screen**: equal to the bar beside it within 3 levels, and the bar dark, on the first screen; white in the Editor. A white patch on the first screen would differ by about 200.

**The glass measure was changed, not its threshold.** At first it was the strip above the heading, about 20 px high, at the pixel's own 3×3 scale. At 910×505 that read up to 0.749, 0.10 under 0.85 (0.477–0.749 over 25 frames). Two changes widened the separation:
- **The whole card, emptied** (`CARD_EMPTY`: everything on it hidden), inside its corners: many times the area, and more varied ground under it. That alone read 0.58–0.60 at every size, steady but no lower: the ground is already blurred by 8 px, so at the 3×3 scale both states sit near the noise floor.
- **4×4 block means** (`glassSharpness`), where the card's 18 px more of blur shows. It now reads 0.338–0.419 at every size, 0.43 under the threshold (at 910 over all 201 frames).

**Mutants** (`tools/mutants.ts`):
- `first screen: the card see-through` asserted an opaque card. It is rewritten, not deleted, as **`first screen: the glass card thinner than its texts' contrast allows`**: `.82` to `.72`. With the darker text, .72 reads 4.30 at every one of the 201 frames and at every size (.65 would read 3.64). The contrast test kills it at each of its seven moments.
- **`first screen: the glass card without its blur`** (new): `backdrop-filter: blur(18px) saturate(1.2)` to `none`. The glass test kills it (a ratio of about 1 against 0.85).
- `first screen: the video unblurred` follows the new filter.
- The caption patch has no mutant: the page does not draw it, and only the Windows e2e can see it.
- **The control is on by default** (`--no-control` skips it). Every run first runs the selection's tests with no mutant. It was already what made the weekly full pass trustworthy: a test failing on its own reads as a kill.

**Closed:** the first screen measured on Windows at 1920 did not agree with Linux. The window was centred at (320,116), 320 px of it off the screen. `docs/screens/README.md`, "Closed in the 2.6.0 round", has the details.

## 30. A user test: the tutorial's card next to what it is about, a step at the line to fix, the title bar at every font (2.7.0)

Five faults found by using the program, all ones a student meets.

**A. The tutorial's card did not follow what it pointed at.** It was measured first: each step's first target and the card, as rectangles, at every state of every step (each step, its result, both phases of step 19). The distance is from the card to that first target, at 1280×800. In 2.6.0 most states were at 16–24 px, and these were far off:

| step | first target | card, 2.6.0 | distance | card, 2.7.0 | distance |
|---|---|---|---|---|---|
| 2 (Assemble, title bar) | 233,5 141×28 | 485,52 | 113 | 148,50 — under it | 16 |
| 5 (Step, title bar) | 675,5 94×28 | 427,171 | 137 | 567,50 — under it | 16 |
| 7 | 481,171 68×19 | 849,252 | 307 | 360,206 | 16 |
| 12, its result | 1013,212 46×17 | 523,127 | 180 | 881,244 | 16 |
| 13 | 846,263 410×30 | 95,346 | 444 | 896,309 | 16 |
| 15, its result | 12,780 338×17 | 427,367 | 228 | 26,565 | 16 |
| 18 | 85,499 115×22 | 853,553 | 654 | 8,537 | 16 |
| 19, phase 2 (the Assemble panel) | 23,594 137×18 | 427,185 | 328 | 8,359 | 16 |
| 15, 16, 17, 19 (title bar) | Run, speed, Reset, Assemble | 485,52 all four | 18–75 | under each | 16 |

The worst over all states was 654 px in 2.6.0; in 2.7.0 it is 24 at 1280, and at most 25 at 1093, 1024, 910 and 1920.

*Cause.* The card was placed by `place([...targets, ...keepOff, ...litPanels])`, and the lit panels counted both ways: the card had to keep 12 px off them, and they were tried as things to stand beside.
- For a toolbar button the lit area is the whole title bar. Every spot beside the button broke the 12 px (the view starts right under the bar), so the next rectangle tried was the lit title bar itself, and the card stood under its middle. That was the same spot for Assemble, Step, Run, Reset and the speed: (485,52) at 1280.
- For a target inside a panel, the panel's own box pushed the card to its far side (step 18: 654 px), or out to the window's free middle (19, phase 2).

*Now* (`logic/placement.ts`): the first target is what the card is about. The card goes right below it, its middle over the target's; else right above it; else right of it, then left, level with it.
- Each slides along its row or column only as far as it must to keep off the step's other targets and what the step keeps off, and no further than 48 px from the first target.
- Failing all four, the free spot nearest the first target.
- The lit panels are no longer kept off. The only rule kept is the old one: never over a target's box. The card can now lie over the rest of a lit panel.
- Step 19's second phase kept off the whole Editor, which pushed its card across the window. It now keeps off only the line with the error.
- `tests/e2e/tutorial.e2e.ts` walks every state at 1280, 1093, 1024 and 910 and fails if the card is more than 48 px from its first target: nearly twice the worst now (25), well under what 2.6.0 did (113 and more).

**B. "4행으로 가기" at step 19 ended the tutorial.** The button moved the Editor to the line, and the tutorial went straight on to its end, which opens the first example again. The jump looked like quitting.
- A step is added between them, step 20, "여기가 고칠 줄입니다": the Editor at that line, the cursor on it, the line marked red and boxed. The card says the line is the one to fix, and that Ctrl+S assembles it again once it is.
- The end is step 21. The tutorial has twenty-one steps.
- The walk checks the cursor's line, the mark and what the step points at.

**C. A big font broke the title bar.** Two faults:
- the speed switch took its height from its words, so at 24 px it was 45 px tall in a 40 px bar and pushed the buttons up;
- the steps that make room were fitted at the start and on a resize only, not when the font changed. At 24 px in a 1280 window no step was taken, and the tools ran to x=1429.

The steps are measured (room left before the caption buttons), not set by the window's width. Every button and switch in the bar now has one height, `clamp(28px, font + 12px, 34px)`, and one middle line; the font's changes fit the bar again. Two steps come after the program's name:
- the buttons as their icons (names in the tooltips, the speed as its value, "Instant"), borders kept;
- then smaller icons.

Folding the buttons into a menu, the step after those, has not been needed.

`tests/e2e/titlebar.e2e.ts` tries every font the app offers, 10–24 px, at 1280, 1093, 1024, 910 and 1920, with a twenty-column file name and (off Windows) the caption buttons 30 px wider. At each of the 75 it checks:
- the middles within 2 px;
- every button and switch bordered all round and showing an icon or words;
- nothing past the room;
- nothing cut.

The whole run takes 14 s. At 910 px with a 24 px font, the icons alone are enough, and with every step taken 42 px are left. At the default font, the narrowest window has 296 px in steps it does not use; it had 1 (`docs/screens/README.md`, closed).

The check was tried against the fault: with the speed button's value hidden (the first way it was written), it failed at 910 px from 17 px up ("a button showing nothing").

**D.**
- **The thin-card mutant** now makes the card .65, not .72. With the darker text, .72 read 4.30 against the threshold's 4.5, 0.20 short, while the design stands 0.84 over it. At .65 the card reads 3.64, 0.86 short: the two sides are about even.
- **The mutant baseline** is the full pass on this round's commit (below).
- **The caption patch at the program's start:** CAPTION_START.

**The screens.** A retake rewrote start photos that had not changed. Measured: the glass card is drawn a pixel higher or lower from one start of the app to the next, never within one start, and never without its filter. That is open item 2 in `docs/screens/README.md`. The capture now seeks to a frame's middle, since 3.0 s is a boundary between two frames. That did not settle the photos, and neither did letting a pixel match its neighbour above or below; the latter was taken out again.
