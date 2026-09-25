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
| Uninstall entry | HKLM, product code | HKCU, `Hallym MIPS 2.0.0` |
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

**Errors and breakpoints (C-1).** The error panel puts what to do first ("15행을 고친 뒤 다시 Ctrl+S 하면 됩니다" (fix line 15, then press Ctrl+S again), and a button that goes to that line),
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

**Error screen.** Assembly errors go in the Errors panel on the Run side (the larger side). It contains what to do ("15행을 고친 뒤 다시 Ctrl+S 하면 됩니다" (fix line 15, then press Ctrl+S again)),
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
gives the syllable and a new line — as in Notepad, and the reason `keydown` Enter arrives twice (first with
`isComposing`, then without) in every web app that has to handle Korean. The editor follows the IME: it never adds a
line of its own nor drops one, and the syllable is never split or doubled. Swallowing the Enter that Windows lets
through would make the editor the one place on a student's PC where Enter after a Korean word does not start a line.
Both orders are tested.

*The composing checks.* Ctrl+S in the editor asks the key event (`isComposing`) whether a syllable is open and, if
so, saves when it is committed; the Console's Enter ignores a key event with `isComposing`. The editor also asked
CodeMirror (`view.composing`); with both checks, removing either one changed nothing (two surviving mutants), so the
editor now takes the key event's word, Chromium's own. Three mutants remove a composing check and are caught
(`tools/mutants.ts`: Ctrl+S saves in the middle of a syllable; Ctrl+S taken as not composing; Console Enter taken in
the middle of a syllable). Enter and Tab in the editor are CodeMirror's: it runs no key binding during a composition.

*The real IME.* The Windows CI job adds Korean to the runner's input languages (`tools/windows/korean-ime.ps1`) and,
when the IME is there, types 한글 + Enter through it into the editor and the Console (`tests/e2e/ime-real.e2e.ts`,
keys through `keybd_event`, the IME switched on with `WM_INPUTLANGCHANGEREQUEST` and `IMC_SETCONVERSIONMODE`),
writing the page's key and composition events to `report/ime-real/`. It is an attempt, reported either way, not a
gate: the CDP tests are.

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

