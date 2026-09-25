# QtSpim 9.1.24 code structure survey

Results of PLAN step 1, "code survey". Every item cites `file:line` evidence.
Line numbers refer to `vanilla-9.1.24`; they may drift once the original files are modified.

Methods used for the survey:
- Reading the source directly
- Building the terminal `spim` from `CPU/` alone (§9) and checking its actual output — marked "measured" in the text

---

## 1. The big picture

```
main.cpp:43  QApplication + one SpimView(QMainWindow)
             └ centralWidget : QTextEdit          ← messages/log (not the console)
             ├ IntRegDockWidget  : regTextEdit    (QPlainTextEdit)
             ├ FPRegDockWidget   : regTextEdit
             ├ TextSegDockWidget : textTextEdit   (QTextEdit)
             ├ DataSegDockWidget : dataTextEdit   (QPlainTextEdit)
             └ Console           : separate top-level window (QPlainTextEdit, parent 0)
```
- Widget tree evidence: `QtSpim/spimview.ui:167-259`; custom widgets are declared in `<customwidgets>` in the same file.
- The console is not a child of the main window but an independent window: `QtSpim/spimview.cpp:50` `SpimConsole = new Console(0)`, `QtSpim/console.cpp:36-44`.
- In `win_Tile()` the four docks are grouped into two tabbed pairs (Int/FP, Data/Text) with `tabifyDockWidget`: `QtSpim/menu.cpp:693-711`.

### 1.1 Fact that differs from PLAN ①

PLAN R4 says "add an Editor to the central tabs (alongside the existing Text/Data tabs)", but
**Text/Data are not tabs of the central widget; they are dock widgets**, and the central widget is a single `QTextEdit` for the message log
(`QtSpim/spimview.ui:54`). What looks like tabs is the result of `tabifyDockWidget`.
→ For the editor we must choose one of: (a) a new dock widget, (b) replace the central widget with a `QTabWidget` and put the log and the editor in tabs,
(c) tabify it into the same dock group as Text/Data. Summarized in section 8.

---

## 2. Rendering path of the three panels

All three panels **build a whole HTML string on every refresh, clear the widget, and re-insert it**.
Since this is not model/view, row selection, frozen columns and per-cell highlighting are impossible. PLAN's option B premise (replace with model+view) is correct.

| Panel | Entry point | Content generation | Widget injection |
|---|---|---|---|
| Int Regs | `SpimView::DisplayIntRegisters()` `QtSpim/regwin.cpp:49` | `formatSpecialIntRegister` / `formatIntRegister` (`regwin.cpp:88`,`95`) | `te->clear(); te->appendHtml(...)` `regwin.cpp:78-79` |
| FP Regs | `DisplayFPRegisters()` `regwin.cpp:120` | `formatSFPRegisters`/`formatDFPRegisters` `regwin.cpp:141`,`185` | `clear()+appendHtml()` `regwin.cpp:131-132` |
| Text Seg | `DisplayTextSegments(bool force)` `QtSpim/textwin.cpp:47` | `formatUserTextSeg`/`formatKernelTextSeg`→`formatInstructions` `textwin.cpp:63,72,85` | `clear()+insertHtml()` `textwin.cpp:52,57` |
| Data Seg | `DisplayDataSegments(bool force)` `QtSpim/datawin.cpp:53` | `formatUserDataSeg`/`formatUserStack`/`formatKernelDataSeg`→`formatMemoryContents` `datawin.cpp:72,81,91,102` | `clear()+appendHtml()` `datawin.cpp:64-65` |

Common wrapper: `windowFormattingStart()/End()` wraps the content in `<span style='font-family:...'>`
(`QtSpim/spimview.cpp:184-192`). Fonts/colors are settings values, not a stylesheet.

The scroll position is preserved manually before and after a refresh (`regwin.cpp:55,84` and `126,134`, `datawin.cpp:59,67`).
Only the Text panel does not preserve it; instead it moves the cursor with `highlightInstruction(PC)` (`textwin.cpp:58`).

### 2.1 When refreshes happen

```
sim_SingleStep()      menu.cpp:290  → executeProgram(PC,1,...) → run_program()
                                     → highlightInstruction(PC)  menu.cpp:351
                                     → UpdateDataDisplay()       menu.cpp:295
sim_Run()             menu.cpp:265  → loop of 100,000 steps + processEvents, then UpdateDataDisplay() at the end
sim_Pause/Stop        menu.cpp:278,284 → UpdateDataDisplay()   menu.cpp:281,287
continueBreakpoint()  menu.cpp:377  → highlightInstruction + UpdateDataDisplay
sim_ReinitializeSimulator() menu.cpp:208 → DisplayTextSegments(true) + UpdateDataDisplay()
file_LoadFile()       menu.cpp:64   → DisplayTextSegments(true) + DisplayDataSegments(false)
settings/radix/display-toggle changes menu.cpp:545-672 → call each Display* directly
```

`UpdateDataDisplay()` (`QtSpim/spimview.cpp:234`):
```cpp
if (text_modified) DisplayTextSegments(true);
DisplayIntRegisters();
DisplayFPRegisters();
DisplayDataSegments(false);
```
- `text_modified` / `data_modified` are global core flags (`CPU/mem.h:45`, `CPU/mem.h:59`);
  they are set in `set_mem_*` and cleared by `Display*` (`textwin.cpp:60`, `datawin.cpp:69`).
- **In other words, the screen is not refreshed during Run; it is refreshed only once, after it finishes.** This is why the highlight does not move during execution.

### 2.2 "Changed register" highlighting

Previous values are stored in `SpimView`'s `oldR[]`, `oldPC`, `oldEPC`, … (`QtSpim/spimview.h:150-158`).
`DisplayIntRegisters()` compares while drawing, and at the end refreshes the snapshot with `CaptureIntRegisters()`
(`regwin.cpp:85`, implementation `regwin.cpp:103`).
→ **The change is "relative to the previous screen refresh", not "relative to the previous single step".** After one Run, the whole start/end difference turns red.
To implement PLAN R1's "highlight registers whose value changed in the previous step" literally, we have to redefine when the snapshot is taken (section 8).

The color is `st_changedRegisterColor` (default `"red"`); on/off is `st_colorChangedRegisters` (default true).
Both exist only in `QSettings` and **have no UI in the settings dialog** (they are only read, at `QtSpim/state.cpp:60-61`).

---

## 3. Core access paths

### 3.1 Registers

| Target | Access | Evidence |
|---|---|---|
| 32 general-purpose | `extern reg_word R[32]` | `CPU/reg.h:39-41` |
| Name table | `extern char *int_reg_names[32]` | `CPU/reg.h:66`, defined at `CPU/display-utils.cpp:44-47` |
| HI/LO | `extern reg_word HI, LO` | `CPU/reg.h:43` |
| PC | `extern mem_addr PC, nPC` | `CPU/reg.h:45` |
| CP0 | `CPR[0][n]` macros `CP0_BadVAddr/Status/Cause/EPC` | `CPU/reg.h:70,76,88,109,130` |
| FP single precision | `FPR_S(n)` = `FGR[n]` | `CPU/reg.h:157` |
| FP double precision | `FPR_D(n)` = `FPR[n/2]`, `run_error` if odd | `CPU/reg.h:159-161` |
| FP control | `FIR` = `CPR[1][0]`, `FCSR` = `CPR[1][31]` | `CPU/reg.h:183,192` |

`reg_word` is `int32` (= `int`), signed 32-bit (`CPU/reg.h:34`).

**Naming caveat**: the core table uses `r0`, `s8`. PLAN R1's group table uses `$zero`, `$fp`.
Using `int_reg_names` as is will not produce the `$zero`/`$fp` notation → keep a separate display alias table in `edu/core`.

### 3.2 Text segment and instructions

```
extern instruction **text_seg;    CPU/mem.h:43     TEXT_BOT   = 0x00400000   CPU/mem.h:47
extern mem_addr text_top;         CPU/mem.h:49
extern instruction **k_text_seg;  CPU/mem.h:89     K_TEXT_BOT = 0x80000000   CPU/mem.h:91
extern mem_addr k_text_top;       CPU/mem.h:93
instruction *read_mem_inst(mem_addr);   CPU/mem.h:140, implemented at CPU/mem.cpp:287
```
`read_mem_inst` calls `bad_text_read(addr)` if the address is out of range or not a multiple of 4 (`CPU/mem.cpp:287-294`)
→ **when our model roams freely over addresses, it must do its own bounds checking.**
If there is no instruction yet within the segment, the pointer is `NULL` and it is displayed as `<none>` (measured, §9).

The `instruction` struct (`CPU/inst.h:56-82`) and its accessor macros (`CPU/inst.h:84-139`):

| Field | Macro | Notes |
|---|---|---|
| internal opcode | `OPCODE(i)` | `Y_*_OP` token value. **Not the machine opcode** |
| rs / rt / rd / shamt | `RS RT RD SHAMT` | R format |
| imm | `IMM(i)` = `IOFFSET(i)` | `short`, signed |
| branch displacement | `IDISP(i)` = `SIGN_EX(IOFFSET<<2)` | `CPU/inst.h:116` — in bytes |
| jump target | `TARGET(i)` | 26 bits, in words |
| machine word | `ENCODING(i)` | `int32` |
| symbol reference | `EXPR(i)` → `imm_expr{offset, symbol, bits, pc_relative}` | `CPU/inst.h:37-42` |
| source line | `SOURCE(i)` | `"line number: original text"` string, **or NULL** |
| FP aliases | `FS=RD, FT=RT, FD=SHAMT` | `CPU/inst.h:96-106` |

### 3.3 Instruction encoding/decoding — the basis of the oracle

| Function | Location | Purpose |
|---|---|---|
| `instruction *inst_decode(int32)` | `CPU/inst.cpp:1166` | machine code → `instruction` |
| `int32 inst_encode(instruction*)` | `CPU/inst.cpp:1045` | `instruction` → machine code |
| `void test_assembly(instruction*)` | `CPU/inst.cpp:1336` | round-trip check (called during assembly when built with `-DTEST_ASM`) |
| `void format_an_inst(str_stream*, instruction*, mem_addr)` | `CPU/inst.cpp:571` | disassemble one line |

The instruction table is the list of `OP(name, i_opcode, type, a_opcode)` macros in `CPU/op.h`;
`inst.cpp` includes it **three times** with a different `#define OP` each time to build three tables:
- `name_tbl` (i_opcode → name, **format kind**) `CPU/inst.cpp:521-525`
- `i_opcode_tbl` (i_opcode → a_opcode) `CPU/inst.cpp:1030-1034`
- `a_opcode_tbl` (a_opcode → i_opcode) `CPU/inst.cpp:1153-1157`

The format-kind constants are in `CPU/op.h:37-67`:
`BC/B1/I1s/I1t/I2/B2/I2a` (I type) · `R1s/R1d/R2st/R2ds/R2td/R2sh/R3/R3sh` (R type) ·
`FP_I2a/FP_R2ds/FP_R2ts/FP_CMP/FP_R3/FP_R4/FP_MOVC/MOVC` · `J_TYPE_INST` · `NOARG_TYPE_INST` ·
`ASM_DIR`/`PSEUDO_OP` (not instructions, a_opcode = -1).

The a_opcode assembly rule in `inst_decode` (`CPU/inst.cpp:1167-1184`) — our decoder's format classification must follow the same rule:
```
a_opcode = val & 0xfc000000
 0x00000000 SPECIAL, 0x70000000 SPECIAL2 → |= val & 0x3f          (funct)
 0x04000000 REGIMM                       → |= val & 0x001f0000    (rt)
 0x40000000 COP0                         → |= (val&0x03e00000) | (val&0x1f)
 0x44000000 COP1                         → |= val & 0x03e00000, and then
                                            (val&0xff000000)==0x45000000 ? |= val&0x00010000 : |= val&0x3f
 0x48000000 / 0x4c000000 COPz            → |= val & 0x03e00000
if not in the table, mk_r_inst(val,0,0,0,0,0)  ← an "invalid instruction" with opcode 0
```

**PLAN R3's type badges (R/I/J/FR/FI) must not use the format kinds from `op.h` as they are.**
The `op.h` classification is about "number/arrangement of operands", not the machine-code format. For example:
- `R2sh_TYPE_INST` (`sll`) and `R3_TYPE_INST` (`add`) are both R format in machine code
- `B2_TYPE_INST` (`beq`) and `I2a_TYPE_INST` (`lw`) are both I format
- `FP_R3_TYPE_INST` (`add.s`) is COP1 = the green card's FR format; `FP_I2a_TYPE_INST` (`lwc1`) is I format (FI)

→ Build an `op.h` format kind → {R,I,J,FR,FI} mapping table in `edu/core`, and
verify with oracle tests (step 4) that the table covers all of `op.h` without gaps (a new kind causes a compile error)
and does not contradict the actual encoding bit layout.

### 3.4 Disassembly output format (measured)

The exact byte layout of one line of `format_an_inst` (`CPU/inst.cpp:571-724`) output:

```
[0x00400024]\t0x34020004  ori $2, $0, 4                   ; 40: li $v0, 4       # syscall 4
0        1         2         3         4         5
012345678901234567890123456789012345678901234567890
```
| Offset | Content |
|---|---|
| 0 | `[` |
| 1..2 | `0x` |
| 3..10 | address, 8 hex digits |
| 11 | `]` |
| 12 | **TAB** |
| 13..14 | `0x` |
| 15..22 | machine code, 8 hex digits |
| 23..24 | 2 spaces |
| 25.. | mnemonic + operands |
| | if `EXPR` has a symbol, ` [symbol...]` (`CPU/inst.cpp:704-711`) |
| | if there is a `SOURCE`, pad with spaces up to column 57 from the start of the line, then `; ` + source (`CPU/inst.cpp:713-721`) |

Measured (terminal spim, `helloworld.s`):
```
[0x00400000]	0x8fa40000  lw $4, 0($29)                   ; 183: lw $a0 0($sp)		# argc
[0x00400024]	0x3c011234  lui $1, 4660                    ; 3: li $t0, 0x12345678
[0x00400028]	0x34285678  ori $8, $1, 22136
[0x0040002c]	0x0109082a  slt $1, $8, $9                  ; 4: blt $t0, $t1, target
[0x00400030]	0x14200002  bne $1, $0, 8 [target-0x00400030]
[0x00400014]	0x0c000000  jal 0x00000000 [main]           ; 188: jal main
[0x00400038]	<none>
```
- Registers in operands appear only as **numbers** (`$4`, `$29`). The core does not provide names.
- The third argument of a branch is `IDISP` = the byte displacement (the `8` in the example above), not the raw imm (`CPU/inst.cpp:618-619` etc.; `IDISP` is defined at `CPU/inst.h:116`).
- A jump prints `TARGET<<2` as is — **a value without the upper 4 bits of the PC merged in** (`CPU/inst.cpp:694`).
  That is why an unresolved symbol shows as `jal 0x00000000 [main]`. We must compute the real destination as `(PC+4)[31:28] | (target<<2)`.
- `sll $0,$0,0` (encoding 0) is specially displayed as `nop` (`CPU/inst.cpp:646-651`).

**The source line is attached only to the first instruction of an expansion** (measured: `lui` has `; 3: li ...`, the following `ori` does not).
The cause is that `store_instruction` calls `SET_SOURCE(inst, source_line())` (`CPU/inst.cpp:174`),
and `source_line()` returns the string only once per line (`CPU/scanner.l:686-694`, the `line_returned` flag).
→ **PLAN R3's "pseudo expansion group" is implemented exactly by treating `SOURCE(inst) != NULL` as the start of a group.** No extra information needed.

The `SOURCE` string format is `"%d: %s"` = `"line number: original text"` (`CPU/scanner.l:722`).

### 3.5 How the current Text panel uses this string (to be replaced)

`SpimView::formatInstructions` (`QtSpim/textwin.cpp:85-129`) slices the output of `format_an_inst`
using **fixed-offset pointer arithmetic**:
```cpp
char* pc = ss_to_string(&ss);
char* binInst   = pc + 14;      // offset 14 from 3.4 = 'x'
char* disassembly = binInst + 11;   // = 25
pc += 3;  pc[8] = '\0';         // address
binInst += 1; binInst[8] = '\0';// machine code
comment = strstr(disassembly, ";");
```
As a result, the following three problems follow.

1. **On a line with a breakpoint, the offsets shift by 1.**
   A breakpoint is not a table entry; it **actually overwrites memory**:
   `add_breakpoint` → `set_breakpoint` → `set_mem_inst(addr, break_inst)` (`CPU/spim-utils.cpp:330-346`, `CPU/inst.cpp:871-882`).
   If `inst_is_breakpoint(addr)`, `format_an_inst` prints `*`, restores the original and calls itself recursively (`CPU/inst.cpp:575-581`).
   So the line starts with `*[0x...]` and all of the fixed offsets above are off by 1.
   *(Based on code analysis. Not reproduced visually in the GUI — to be checked in step 5.)*
2. The comment check is `strstr(disassembly, ";")` — it misbehaves if the source line contains `;`.
3. `nnbsp(25 - strlen(disassembly))` goes negative for disassembly longer than 25 characters → 0 spaces, and the alignment breaks.

→ The new Text panel **does not parse the string**; it reads fields directly from the `instruction*` returned by `read_mem_inst()`.
However, at an address with a breakpoint, `read_mem_inst()` returns the **break instruction**, so
we need a path that checks `inst_is_breakpoint(addr)` and then gets the original (the same delete→read→add approach as the core).

### 3.6 Memory

| Segment | Arrays | Lower bound | Upper bound |
|---|---|---|---|
| user data | `data_seg` / `data_seg_h` / `data_seg_b` | `DATA_BOT 0x10000000` `CPU/mem.h:67` | `data_top` `CPU/mem.h:69` |
| stack | `stack_seg` / `_h` / `_b` | `stack_bot` `CPU/mem.h:81` | `STACK_TOP 0x80000000` `CPU/mem.h:85` |
| kernel data | `k_data_seg` / `_h` / `_b` | `K_DATA_BOT 0x90000000` `CPU/mem.h:101` | `k_data_top` `CPU/mem.h:103` |
| memory-mapped IO | — | `0xffff0000` | `0xffffffff` `CPU/mem.h:108-109` |

Reading: `read_mem_word/half/byte` (`CPU/mem.cpp:318,307,296`); writing: `set_mem_word/half/byte` (`CPU/mem.cpp:363,…`).
Out of range raises an exception via `bad_mem_read` → **bounds checking before navigation is mandatory.**

**Byte order**: `data_seg_b` is a `signed char*` alias of the same buffer as `data_seg` (`CPU/mem.h:63-65`).
SPIM simulates the host's endianness as is (`CPU/spim.h:38-44`: simulating the other endianness is not possible).
So reading `read_mem_byte(a)` in ascending address order gives the **actual memory byte order**.
The existing ASCII column is built the same way (`QtSpim/datawin.cpp:164-193`) → matches PLAN R5's requirement. It can be used as is.
`read_mem_byte` returns `signed char`, so values of 0x80 and above are negative → the existing `formatChar` prints them as `.` (`datawin.cpp:223-238`).

### 3.7 Symbol table — has limitations

What `CPU/sym-tbl.h` exports:
```
mem_addr find_symbol_address(char *name);   // implemented at CPU/sym-tbl.cpp:360
label   *label_is_defined(char *name);      //         CPU/sym-tbl.cpp:122  (read-only)
label   *lookup_label(char *name);          //         CPU/sym-tbl.cpp:134  (creates it if missing! side effect)
void     print_symbols();                   //         CPU/sym-tbl.cpp:371
```
**The hash table itself is static**: `static label *label_hash_table[8191]` `CPU/sym-tbl.cpp:62,66`.
→ **There is no API for reverse lookup (address → label) or for iterating over all entries.** `find_symbol_address` uses
`lookup_label` internally, so looking up a nonexistent name **leaves an empty label in the table** (`sym-tbl.cpp:360-366`). Do not use it.

Two workarounds (neither requires modifying `CPU/`):
- **Branch/jump destination labels (R3)**: no symbol table needed at all. The instruction itself carries it —
  `EXPR(inst)->symbol->name` (`CPU/inst.h:39`; the core prints it this way too, `CPU/inst.cpp:704-711`).
- **`.data` labels (R5)**: `print_symbols()` writes `"%s%s at 0x%08x\n"` (prefixed with `g\t` or `\t`)
  to `write_output(message_out, …)`. The **implementation of `write_output` is on our side**
  (`QtSpim/spim_support.cpp:129-141`), so we can add a capture switch there, call `print_symbols()`,
  and build an address→label table. `CPU/` unchanged; subject to the `// EDU:` comment rule.

> **Limitation found in step 6 — `print_symbols()` alone is not enough.** When the core finishes reading a file,
> `flush_local_labels()` **removes that file's local (non-`.globl`) labels from the hash table**
> (`CPU/spim-utils.cpp:184`, `CPU/sym-tbl.cpp:334-355`). So `print_symbols()` after loading shows
> **only global labels** such as `main`, `__start`, `.extern` — and `.data` labels in student code, such as `msg:`, are mostly local.
> The label structs themselves are not freed (the instruction's `EXPR(inst)->symbol` keeps pointing to them — comment at `sym-tbl.cpp:351`),
> so for **labels that instructions reference**, names and addresses can be obtained by scanning the text segment. The Data panel merges the two sources (§15.2).
> Local `.data` labels that the code never references cannot be obtained without modifying `CPU/`.

The `label` struct is public (`CPU/sym-tbl.h:34-51`): `name`, `addr`, `global_flag`, `gp_flag`, `const_flag`.

### 3.8 Execution

```
bool run_program(pc, steps, display, cont_bkpt, bool *continuable)   CPU/spim-utils.h:60, implemented at CPU/spim-utils.cpp:293
  → when continuing from a breakpoint: delete→run 1 step→add
  → run_spim(pc, steps, display)                                     CPU/run.h:36
  → returns true = breakpoint reached (CP0_ExCode == ExcCode_Bp)
extern bool force_break;   // stop request. Set by sim_Pause/sim_Stop  QtSpim/menu.cpp:278,284
```
The GUI wraps this in `executeProgram()` (`QtSpim/menu.cpp:345`) and, when a breakpoint is hit,
shows `BreakpointDialog` (`menu.cpp:353-371`).

### 3.9 The core headers have no include guards

None of the 14 `CPU/*.h` files (`mem.h scanner.h inst.h reg.h op.h parser.h syscall.h
spim-syscall.h run.h data.h sym-tbl.h version.h spim-utils.h string-stream.h`)
has an `#ifndef` guard or `#pragma once`. Including one twice causes a compile error from `typedef` redefinition.

`QtSpim/spimview.h:45-52` already includes `spim.h`, `string-stream.h`, `spim-utils.h`, `inst.h`,
`reg.h`, `mem.h`, `sym-tbl.h`, `version.h`.
→ **If a new file in `edu/` includes `spimview.h`, do not include the core headers again.**
(We actually ran into this in `QtSpim/edu/edu_devtools.cpp`.)

### 3.10 Stack initialization differs between the GUI and terminal spim

Even when the same program runs on the same core, **`$sp`, `$a1` and `$a2` differ between the two front ends.**

| | Call | Location |
|---|---|---|
| terminal spim | `initialize_run_stack(argc, argv)` | `spim/spim.cpp:271` |
| QtSpim | `initialize_stack(st_recentFiles[0] + " " + st_commandLine)` | `QtSpim/menu.cpp:309-314` |

Because the argv contents differ, the length of the strings pushed onto the stack differs, and `$sp` shifts by that amount.
Measured (after running helloworld.s):

```
terminal spim : R5 (a1) = 2147479804   R6 (a2) = 2147479808   R29 (sp) = 2147479800
QtSpim-Edu    : R5 (a1) = 2147479680   R6 (a2) = 2147479684   R29 (sp) = 2147479676
```

→ In regression comparisons, **do not compare whole register dumps.** This is why `tools/regress.sh`
compares the console output (the program's own output).

**The process environment variables are also placed on the stack.** `initialize_stack()` copies envp after argv
(strings such as `PATH=...` are visible verbatim at the end of the User Stack in the Data panel), so even with the same binary,
`$sp`/`$a1`/`$a2` differ if the environment variables differ. We found this out in step 3 when the saved-log golden files
did not reproduce → `tools/capture-goldens.sh` and check 4 of `regress.sh` run with `env -i` + 3 fixed variables.
(This is also the basis for PLAN R5's decision to "collapse the argv/environment area by default": the student's user name and paths are there.)

---

## 4. Assembly error message format and output path

```
yyerror(s)   CPU/parser.y:2941  → parse_error_occurred = true; clear_labels(); yywarn(s)
yywarn(s)    CPU/parser.y:2950  → error("spim: (parser) %s on line %d of file %s\n%s",
                                        s, line_no, input_file_name, erroneous_line())
erroneous_line()  CPU/scanner.l:545  → source line + a caret pointing at where the scanner stopped
```
Measured (`Tests/tt.alu.bare.s`, tabs shown as `→`):
```
spim: (parser) immediate value (65432) out of range (-32768 .. 32767) on line 414 of file Tests/tt.alu.bare.s
→  addi $4 $0 0xff98
→                   ^
```
- Line 1: `spim: (parser) ` + message + ` on line ` + **line number** + ` of file ` + **path**
- Line 2: tab + 2 spaces + the original source line
- Line 3: tab + 2 spaces + `prefix_length` spaces + `^` (`CPU/scanner.l:588-591`)

**Caution**: this `erroneous_line()` is a **different function** from `source_line()`, which builds the comment attached to instructions
(`CPU/scanner.l:687`, format `"line number: original text"`, §3.4). The names are similar and easy to confuse.
The implementation of `error()` is on our side at `QtSpim/spim_support.cpp:60-69` →
`Window->Error(buf, /*fatal=*/0)` → `QtSpim/spimview.cpp:268`:
1. `WriteOutput(message)` — appends it as HTML to the central log `QTextEdit`
2. `QMessageBox::information(...)` — a **modal dialog**. Choosing `Abort` sets `force_break = true`

→ **"Go to error line" in step 7 (the editor) can be done by intercepting `error()` and extracting `on line (\d+) of file (.*)`.**
No `CPU/` modification needed. However, we need to decide whether to keep the current behavior of showing a modal for every error in every file (section 8).

`error()`/`run_error()`/`fatal_error()` all follow the same path. Only `fatal_error` does `SaveStateAndExit(1)`.
The buffer is a fixed 10000 bytes (`spim_support.cpp:56`, `BIG_BUF_SIZE`).

It is **one modal per error**. They appear both during assembly and during execution.
Loading `Tests/tt.alu.bare.s` gives 11 parser errors alone → 11 modals.
To run headless, something must press this dialog for us
(`dismissBlockingDialog()` in `QtSpim/edu/edu_devtools.cpp` does that).

`WriteOutput` (`QtSpim/spimview.cpp:250`) only replaces `\n`→`<br>` and space→`&nbsp;`, and passes the text
to `QTextEdit::append()` as HTML **without escaping `<`, `>`, `&`**.
If a source line contains `<`, it disappears from the log. Keep this in mind in step 7 when showing errors in the editor.

---

## 5. File path encoding (Korean paths)

Every point where a QString is passed to the core (`char*`) uses **`toLocal8Bit()`**:

| Location | Call |
|---|---|
| `QtSpim/menu.cpp:76` | `read_assembly_file(file.toLocal8Bit().data())` |
| `QtSpim/main.cpp:70` | `read_assembly_file(fileNames[i].toLocal8Bit().data())` |
| `QtSpim/spimview.cpp:214,218` | `initialize_world(... .toLocal8Bit().data(), …)` |
| `QtSpim/menu.cpp:313` | `initialize_stack((recent + " " + args).toLocal8Bit().data())` |

The core opens files with `fopen(name, "rt")` (`CPU/spim-utils.cpp:171`).

- **Linux**: if the locale is UTF-8, `toLocal8Bit()` = UTF-8, and `fopen` takes the bytes as they are → Korean paths OK.
- **Windows**: `toLocal8Bit()` converts to the **ANSI code page** (CP949 on Korean Windows), and
  MSVC's `fopen` takes ANSI paths, so **Korean paths that can be represented in CP949 work.**
  It fails if the path contains characters not in CP949 (some Hanja, emoji, characters of other languages).
- A complete fix needs `_wfopen`, which means modifying `CPU/` → **we do not do it.**
  Instead, in step 2 we added **detection and a warning**: `QtSpim/edu/core/edu_path_encoding.*` (detects loss via a codec round trip, unit-tested) and
  `QtSpim/edu/edu_path_check.*` (warning dialog). Before the three points in the table above (File > Load, command-line files, exception handler path)
  we call `edu::confirmPathLoadable()`, and if there is loss, the load is skipped.
  Since it never triggers on Linux (UTF-8), we test it by faking the encoding with `--local-codec` in the development build (`tools/check-path-warning.sh`).
- The string passed to `initialize_stack` **goes into the program as argv[0]**. For a Korean path, the MIPS side sees it
  as a CP949/UTF-8 byte sequence. This is the same behavior as the original, so we leave it alone.

Console input is truncated to 1 byte with `QChar::toLatin1()` (`QtSpim/spim_support.cpp:96`) → Korean input is not possible. Original behavior.

---

## 6. Table of features to preserve

All of the original's menus, toolbar, right-click menus and dialogs. **All of them must work** in the new UI.
Evidence: `QtSpim/spimview.ui` (action definitions and layout) and `QtSpim/spimview.cpp:85-182` (wireCommands).

### 6.1 Menu bar

| Menu | Item | Action name | Shortcut | Checkable | Slot |
|---|---|---|---|---|---|
| File | Load File | `action_File_Load` | — | | `file_LoadFile` `menu.cpp:64` |
| File | Recent Files ▸ | `menuRecent_Files` | — | | built dynamically by `rebuildRecentFilesMenu` `menu.cpp:91` |
| File | Reinitialize and Load File | `action_File_Reload` | — | | `file_ReloadFile` `menu.cpp:86` |
| File | Save Log File | `action_File_SaveLog` | — | | `file_SaveLogFile` `menu.cpp:101` |
| File | Print | `action_File_Print` | — | | `file_Print` `menu.cpp:151` |
| File | Exit | `action_File_Exit` | — | | `file_Exit` `menu.cpp:186` |
| Simulator | Clear Registers | `action_Sim_ClearRegisters` | — | | `sim_ClearRegisters` `menu.cpp:201` |
| Simulator | Reinitialize Simulator | `action_Sim_Reinitialize` | — | | `sim_ReinitializeSimulator` `menu.cpp:208` |
| Simulator | Run Parameters | `action_Sim_SetRunParameters` | — | | `sim_SetRunParameters` `menu.cpp:244` |
| Simulator | Run/Continue | `action_Sim_Run` | **F5** | | `sim_Run` `menu.cpp:265` |
| Simulator | Pause | `action_Sim_Pause` | — | | `sim_Pause` `menu.cpp:278` |
| Simulator | Stop | `action_Sim_Stop` | **Shift-F5** | | `sim_Stop` `menu.cpp:284` |
| Simulator | Single Step | `action_Sim_SingleStep` | **F10** | | `sim_SingleStep` `menu.cpp:290` |
| Simulator | Display Symbols | `action_Sim_DisplaySymbols` | — | | `sim_DisplaySymbols` `menu.cpp:397` |
| Simulator | Settings | `action_Sim_Settings` | — | | `sim_Settings` `menu.cpp:402` |
| **Registers** | **Binary** | `action_Reg_DisplayBinary` | — | ✔ | `reg_DisplayBinary` `menu.cpp:545` |
| **Registers** | **Hex** | `action_Reg_DisplayHex` | — | ✔ | `reg_DisplayHex` `menu.cpp:559` |
| **Registers** | **Decimal** | `action_Reg_DisplayDecimal` | — | ✔ | `reg_DisplayDecimal` `menu.cpp:552` |
| Text Segment | User Text | `action_Text_DisplayUserText` | — | ✔ | `text_DisplayUserText` `menu.cpp:600` |
| Text Segment | Kernel Text | `action_Text_DisplayKernelText` | — | ✔ | `text_DisplayKernelText` `menu.cpp:607` |
| Text Segment | Comments | `action_Text_DisplayComments` | — | ✔ | `text_DisplayComments` `menu.cpp:614` |
| Text Segment | Instruction Value | `action_Text_DisplayInstructionValue` | — | ✔ | `text_DisplayInstructionValue` `menu.cpp:621` |
| Data Segment | User Data | `action_Data_DisplayUserData` | — | ✔ | `data_DisplayUserData` `menu.cpp:632` |
| Data Segment | User Stack | `action_Data_DisplayUserStack` | — | ✔ | `data_DisplayUserStack` `menu.cpp:637` |
| Data Segment | Kernel Data | `action_Data_DisplayKernelData` | — | ✔ | `data_DisplayKernelData` `menu.cpp:642` |
| Data Segment | Binary / Hex / Decimal | `action_Data_Display{Binary,Hex,Decimal}` | — | ✔ | `menu.cpp:647,659,653` |
| Window | Integer Registers | `action_Win_IntRegisters` | — | ✔ | `win_IntRegisters` `menu.cpp:683` |
| Window | FP Registers | `action_Win_FPRegisters` | — | ✔ | `win_FPRegisters` `menu.cpp:685` |
| Window | Text Segment | `action_Win_TextSegment` | — | ✔ | `win_TextSegment` `menu.cpp:687` |
| Window | Data Segment | `action_Win_DataSegment` | — | ✔ | `win_DataSegment` `menu.cpp:689` |
| Window | Console | `action_Win_Console` | — | ✔ | `win_Console` `menu.cpp:691` |
| Window | Tile | `action_Win_Tile` | — | | `win_Tile` `menu.cpp:693` |
| Window | Restore to default | `action_Win_Restore` | — | | `win_Restore` `state.cpp:209` |
| Help | View Help | `action_Help_ViewHelp` | — | | `help_ViewHelp` `menu.cpp:714` |
| Help | About QtSpim | `action_Help_AboutSPIM` | — | | `help_AboutSPIM` `menu.cpp:757` |

> Answer to PLAN R2's "if the original's Registers menu has radix options": **it does.**
> Three items, Binary/Hex/Decimal, mutually exclusive checks, stored in `st_regDisplayBase` (2/10/16) and kept in the settings.
> The Data Segment menu has the same three separately (`st_dataSegmentDisplayBase`).

### 6.2 Toolbar (`toolBar` in `spimview.ui`)

Load File · Reinitialize and Load File ∣ Save Log File · Print ∣ Clear Registers · Reinitialize Simulator ∣
Run/Continue · Pause · Stop · Single Step ∣ View Help — all the same objects as the menu actions.
Icons are `:/icons/*` (`QtSpim/windows_images.qrc`).

### 6.3 Right-click (context) menus

| Widget | Items | Implementation |
|---|---|---|
| IntRegTextEdit / FPRegTextEdit | standard edit menu ∣ Binary · Decimal · Hex ∣ **Change Register Contents** | `regTextEdit::contextMenuEvent` `regwin.cpp:291` → `changeValue()` `regwin.cpp:306` |
| TextSegmentTextEdit | standard edit menu ∣ **Set Breakpoint** · **Clear Breakpoint** | `textTextEdit::contextMenuEvent` `textwin.cpp:171` → `setBreakpoint()` `textwin.cpp:181`, `clearBreakpoint()` `textwin.cpp:193` |
| DataSegmentTextEdit | standard edit menu ∣ Binary · Decimal · Hex ∣ **Change Memory Contents** | `dataTextEdit::contextMenuEvent` `datawin.cpp:255` → `changeValue()` `datawin.cpp:270` |

All three find their target via **click coordinates → text line → regular expression**
(`regwin.cpp:428` `strAtPos`, `textwin.cpp:206` `pcFromPos`, `datawin.cpp:299` `addrFromPos`).
`addrFromPos` even counts which word within the line it is from the mouse x position (`datawin.cpp:317-334`).
→ Switching to model/view makes all of this logic **simpler and index-based.** Behavior preserved, implementation discarded.

Targets recognized by the register value change (`regwin.cpp:306-398`):
`R<n>` · `FG<n>` · `FP<n>` · `PC` · `EPC` · `Cause` · `BadVAddr` · `Status` · `HI` · `LO` · `FIR` · `FCSR`.
The input radix is chosen with the dialog's hex/decimal radio buttons; the initial value is the current display radix.

### 6.4 Dialogs

| .ui | Class | Title | Shown from |
|---|---|---|---|
| `breakpoint.ui` | `BreakpointDialog` | Breakpoint | `menu.cpp:353-371` — Continue / Single Step / Abort |
| `changevalue.ui` | `ChangeValueDialog` | Change Value | `promptForNewValue` `regwin.cpp:445` — value input + hex/dec radio |
| `printwindows.ui` | `PrintWindowsDialog` | Print Windows | `file_Print` `menu.cpp:151` — Regs/Text/Data/Console checkboxes |
| `runparams.ui` | `SetRunParametersDialog` | Set Run Parameters | `sim_SetRunParameters` `menu.cpp:244` — start address, run arguments |
| `savelogfile.ui` | `SaveLogFileDialog` | Save Windows To Log File | `file_SaveLogFile` `menu.cpp:101` — Regs/Text/Data/Console checkboxes + path |
| `settings.ui` | `SettingDialog` | QtSpim Settings | `sim_Settings` `menu.cpp:402` — see below |
| — | `QMessageBox` | About QtSpim | `help_AboutSPIM` `menu.cpp:757` |
| — | `QFileDialog` | Open Assembly Code | `file_LoadFile` `menu.cpp:71`, filter `Assembly (*.a *.s *.asm);;Text files (*.txt)` |
| — | `QPrintDialog` | Print Windows | `menu.cpp:163` |
| — | `QFontDialog`/`QColorDialog` | — | inside the settings dialog |

Settings dialog contents (`QtSpim/settings.ui`, handled at `menu.cpp:402-541`):
- Tab 1 *MIPS*: Bare Machine · Accept Pseudo Instructions · Delayed Branches · Delayed Loads · Mapped IO,
  preset buttons Simple / Bare, load-exception-handler checkbox + file path + browse + restore default
- Tab 2 *QtSpim*: number of Recent files (1–20; out of range becomes 4), Quiet,
  Register window font/text color/background color, Text window font/text color/background color

**There is no Data window font setting** — the Data panel shares the Text window settings (`datawin.cpp:57-58`).

### 6.5 What printing / log saving read

Both take the content **directly from the widgets**:
- Log saving: `findChild<…>("IntRegTextEdit")->toPlainText()` etc. (`menu.cpp:124-143`)
- Printing: `findChild<…>("IntRegTextEdit")->print(&printer)` etc. (`menu.cpp:167-180`)

(Since step 3, Int Regs goes through `SpimView::intRegistersLogText()`/`printIntRegisters()` — §11.)
(Since step 6, Data goes through `SpimView::dataSegmentLogText()`/`printDataSegment()` — §15.5. The radix options and Change Memory Contents in the right-click menu are provided by `EduDataView`.)
(Since step 5, Text goes through `SpimView::textSegmentLogText()`/`printTextSegment()` — §14.4. Set/Clear Breakpoint in the right-click menu is provided by `EduTextView`.)

→ **Replacing the widgets with `QTreeView`/`QTableView` breaks these two features as they stand.**
`QTableView` has neither `toPlainText()` nor `print()`. When replacing each panel in steps 3, 5 and 6,
we must also write functions that generate text/documents from the model (section 8).

Also, the current save/print output is plain text including the on-screen `&nbsp;` alignment.
The new implementation must produce **plain text with column alignment preserved** to get results similar to the original.

### 6.6 Settings (`QSettings`, organization `LarusStone` / application `QtSpim`)

Read at `QtSpim/state.cpp:44-138`, written at `state.cpp:140-205`.

| Group | Key | Default |
|---|---|---|
| MainWin | Geometry, WindowState | — |
| RegWin | ColorChangedRegs / ChangedRegColor / RegisterDisplayBase / Font / FontColor / BackgroundColor | true / "red" / 16 / Courier 10 / black / white |
| TextWin | ShowUserTextSeg / ShowKernelTextSeg / ShowTextComments / ShowInstDisassembly / Font / FontColor / BackgroundColor | all true / Courier 10 / black / white |
| DataWin | ShowUserDataSeg / ShowUserStackSeg / ShowKernelDataSeg / DataSegmentDisplayBase | true / true / true / 16 |
| FileMenu | RecentFilesLength, RecentFile\<i\> | 4 |
| Spim | Quiet / BareMachine / AcceptPseudoInsts / DelayedBranches / DelayedLoads / MappedIO / LoadExceptionHandler / ExceptionHandlerFileName / StartingAddress / CommandLineArguments | false/false/true/false/false/false/true/`<<SPIM Exception Handler>>`/`starting_address()`/"" |

**Two bugs in the original** (we do not fix them; the settings path diverges anyway because of the branding):
- The run arguments are read as `"CommandLineArguments"` and written as `"CommandLine"` (`state.cpp:136` vs `state.cpp:200`)
  → **the Run Parameters arguments are lost on restart.**
- The recent-file key is `"RecentFile" + QString(i)` (`state.cpp:114`, `state.cpp:181,183`).
  `QString(int)` is the single character `QChar(i)`, so the keys become `RecentFile\0`, `RecentFile\1` …. It works.

`InitializeWorld()` (`spimview.cpp:194`) extracts the default exception handler from the resource `:exceptions.s`
into a `QTemporaryFile` and passes it to `initialize_world()` (`spimview.cpp:209-215`).

---

## 7. Help

- Menu → `help_ViewHelp()` `QtSpim/menu.cpp:714`.
- Launches the external process `assistant` with `-collectionFile <path>`.
- The path is **hard-coded to the install location** (`menu.cpp:718-724`):
  - Windows `%PROGRAMFILES(x86)%/QtSpim/help/qtspim.qhc` + `assistant` (PATH)
  - macOS `/Applications/QtSpim.app/Contents/Resources/doc/qtspim.qhc` + Assistant inside the app bundle
  - Linux `/usr/lib/qtspim/help/qtspim.qhc` + `/usr/lib/qtspim/bin/assistant`
- If missing, a "Cannot find QtSpim help file. Check installation." message box.
- **So in an uninstalled development build, help does not open even in the original.** See the step 0 report.
- In step 2 we added one candidate: `<executable folder>/help/qtspim.qhc`; the browser is
  `<executable folder>/assistant(.exe)` if present, otherwise `assistant` on PATH.
  At first it was placed after the original three candidates; by a step 2 checkpoint decision it was moved **to the front**:
  the distribution must be self-contained, and depending on the install folder of standard QtSpim would
  silently break when that is deleted or updated. This is the only point that differs from the original behavior (our help opens
  even on a PC where standard QtSpim is installed). Help opens when running from an unzipped archive and in the Linux development build
  (`build/help/qtspim.qhc` + `/usr/bin/assistant`).
- Why the original finds the help browser on Windows by the name `"assistant"` alone: `CreateProcess`
  searches **the folder containing the executable before PATH**. Putting `assistant.exe` in the install folder is enough
  (`bin/release-win:23-24` does that).
- The build outputs `<build>/help/qtspim.qch` and `<build>/help/qtspim.qhc` are picked up as is by the install scripts
  (`Setup/QtSpim_Win_Deployment/WiX/QtSpim.wxs:205-208`, `bin/release-debian:102-105`).

---

## 8. Things that differ from PLAN and need adjustment (summary)

| # | PLAN's assumption | Reality | Impact |
|---|---|---|---|
| ① | "add an Editor to the central tabs (alongside the existing Text/Data tabs)" | Text/Data are **dock widgets**; the central widget is a single message-log `QTextEdit` | R4 layout decision needed |
| ② | "if the Registers menu has radix options" | **It does.** Binary/Hex/Decimal, and separately in Data Segment too | Can be wired as in R2. Nothing to decide |
| ③ | How to get instruction fields from the core | They can be read directly from `instruction*`. The current GUI **slices the `format_an_inst` string by offsets** | New panel uses the struct directly. §3.5 |
| ④ | R3 "pseudo expansion group" | `SOURCE(inst) != NULL` is exactly the start of a group | No extra work. §3.4 |
| ⑤ | R3 type badges R/I/J/FR/FI | `op.h` format kinds are **operand arrangement**, not machine-code format | Mapping table + oracle needed. §3.3 |
| ⑥ | R3 jump destination | The core prints only `TARGET<<2` (no upper 4 bits) | We compute the destination. §3.4 |
| ⑦ | R5 `.data` label display | No address→label API (hash table is static) | Workaround: `write_output` capture + `print_symbols()`. §3.7 |
| ⑧ | R1 "registers changed in the previous step" | The original's baseline is the previous **screen refresh** | Snapshot timing must be redefined. §2.2 |
| ⑨ | (not in PLAN) printing and log saving | Depend on the widgets' `toPlainText()`/`print()` | Each panel replacement needs a text/document generator too. §6.5 |
| ⑩ | (not in PLAN) screen refresh during execution | Run refreshes only once, after it finishes | Original behavior. Changing it needs a separate decision |
| ⑪ | (not in PLAN) Korean paths | `toLocal8Bit()` → on Windows only works within what CP949 can represent | Limited without modifying `CPU/`. §5 |
| ⑫ | (not in PLAN) breakpoints | Not a table; they **overwrite memory** | The new Text model needs a path to get the original instruction. §3.5 |
| ⑬ | (not in PLAN) executable rename | `Setup/` and `bin/release-*` hard-code `QtSpim`/`QtSpim.exe` | Must be fixed together in steps 2 and 8. §10 |

---

## 9. Reproduction method used for the survey

We built the terminal `spim` from `CPU/` alone, outside the source tree, and checked the core's behavior directly.
The regression script (`tools/regress.sh`) uses the same method.

```bash
make -f <repo>/spim/Makefile spim \
     CPU_DIR=<repo>/CPU TEST_DIR=<repo>/Tests DOC_DIR=<repo>/Documentation \
     VPATH=<repo>/spim:<repo>/CPU
```
(`spim/Makefile` assumes an in-source build, so all directory variables must be overridden to keep the source tree clean.)

State dump:
```
$ printf 'load "helloworld.s"\nrun\nprint_all_regs\nquit\n' | ./spim -ef <repo>/CPU/exceptions.s -q
```
Viewing a single instruction: `print 0x00400024` (command list at `spim/spim.cpp:657-705`).

---

## 10. Things to watch when modifying files

### 10.1 Line endings

| Directory | Line endings |
|---|---|
| `QtSpim/*` (`.cpp .h .pro .ui .qrc .qhcp .qhp`) | **CRLF** |
| `CPU/*` (only `CPU/version.h` is CRLF, as an exception) | LF |
| `QtSpim/macinfo.plist`, `QtSpim/qtspim.rc` | LF |

If an editing tool carelessly converts the whole file to LF, changing a single line makes the entire file show up in the diff.
(We actually did this once while editing `QtSpim/QtSpim.pro`.)
When editing with Python, read and write with `open(..., newline='')`.

Check:
```bash
git diff --stat            # if you changed one line and it shows hundreds, you broke the line endings
file -b QtSpim/menu.cpp    # must include "with CRLF line terminators"
```

Our files (`QtSpim/edu/`, `tests/`) are LF and UTF-8, and contain Korean string literals.
MSVC reads UTF-8 source without a BOM in the system code page, so the `win32-msvc` block in `.pro` passes `/utf-8`.
If you create a new `.pro`, add the same flag (see `tests/edu_core/edu_core.pro`).

### 10.2 Including core headers twice

See §3.9. If you included `spimview.h`, do not include `CPU/*.h` again.

### 10.3 Consequences of renaming the executable (unresolved)

For branding, `TARGET` was changed to `QtSpimEdu` (`QtSpim/QtSpim.pro`). The deployment scripts still use the original name:

| File | Hard-coded name |
|---|---|
| `bin/release-win:23` | `$RELEASE_DIR/release/QtSpim.exe` |
| `bin/release-debian:46,63` | `$RELEASE_DIR/QtSpim` |
| `Setup/QtSpim_Win_Deployment/WiX/QtSpim.wxs:28-32` | `QtSpim.exe`, Start menu name `QtSpim` |
| `Setup/QtSpim_Win_Deployment/WiX/QtSpim.wxs:3` | `Product Name='QtSpim'`, `Manufacturer='LarusStone'` |

The zip distribution (step 2) does not use these scripts; `tools/package-windows.ps1` builds it separately.
`bin/release-win` and WiX were left for the MSI flow (step 8) and still use the original name.

---

## 11. The register panel after step 3

The Int Regs path from the original §2 changed as follows (FP Regs is unchanged from the original).

```
DisplayIntRegisters()  QtSpim/regwin.cpp
  ├ runs the original HTML builders (formatSpecialIntRegister/formatIntRegister) unchanged
  │   → eduIntRegLog (hidden QPlainTextEdit)  ← the only place Save Log File / Print read from
  │       SpimView::intRegistersLogText() / printIntRegisters()
  └ eduRefreshRegisterPanel()  QtSpim/edu/edu_spimview_glue.cpp
      → EduRegisterModel::refresh()  → EduRegisterView(QTreeView, inside IntRegDockWidget)
      → EduInspector (dock below the register dock)
```

**Layout**: Int Regs, FP Regs and Inspector are not in the original's top dock row but in the **left dock area**
(`eduTileInspector()`). Because the original already gives the two left corners to the left area with `setCorner()`
(constructor in `QtSpim/spimview.cpp`), the left dock uses the full window height next to the message log.
The reason is arithmetic: on a 1080-line screen, the height left for the top row is about 33 rows at any row height, while the list
has 47 rows (8 groups + 39 registers; the original is 41 lines of text). Row height is the font line height − 3px (delegate);
the inspector has a fixed height fitted to 6 lines of content. The saved window state was bumped to version 2 so the old layout is not restored
(`QtSpim/state.cpp`).

| File | Role |
|---|---|
| `edu/core/edu_format.*` | 32-bit value ↔ string. Widgets call only this |
| `edu/core/edu_registers.*` | register names, number notation, groups, name lookup |
| `edu/edu_register_model.*` | two-level tree model, value read/write, change snapshot |
| `edu/edu_register_view.*` | tree view, right-click menu, value change (reuses the original dialog) |
| `edu/edu_inspector.*` | inspector dock (registers only for now) |
| `edu/edu_spimview_glue.cpp` | `SpimView::edu*` members. The original files only get one-line `// EDU:` hooks |

**When the change-highlight snapshot is taken** (call sites of `eduBeginRunCommand()`, all in `QtSpim/menu.cpp`):
the first line of `sim_Run`, `sim_SingleStep`, `continueBreakpoint`, `singleStepBreakpoint`.
Reset (`eduResetRegisterChanges()`): `sim_ReinitializeSimulator`, `sim_ClearRegisters`, `file_LoadFile`.
For user edits, `EduRegisterModel::writeRegister()` puts the same value into the snapshot so it is excluded from highlighting.

**Relationship with the FP tab**: in the original, the Int/FP windows use the same class (`regTextEdit`) and the same `changeValue()`
(it reads the clicked line with a regular expression to tell `R`/`FG`/`FP`/special names apart). Even after detaching the Int window, the class
stays as is for the FP tab, and the integer-register branch simply never matches the FP window's text, so **no separation work was needed.**

**Log-save identity** is guaranteed by the structure: the new code does not "rebuild" the log text; it puts the original HTML
builder's output as is into a hidden widget and calls `toPlainText()`/`print()`. `tests/golden/` and
check 4 of `regress.sh` verify that this structure has not been broken.

---

## 12. Behavior intentionally different from the original

The principle is "change only the GUI", but the items below were **knowingly made different from the original**. They accumulate here as the steps progress.
They are the material for the step 8 student notice ("What is different from standard QtSpim"). None of them affect simulation results.

| # | What differs | Original | Reason | Step · location |
|---|---|---|---|---|
| 1 | Executable name `QtSpimEdu` | `QtSpim` | Install and run side by side with standard QtSpim on the same PC | 1 · `QtSpim/QtSpim.pro` `TARGET` |
| 2 | Settings store `QtSpim-Edu`/`QtSpimEdu` | `LarusStone`/`QtSpim` | The two programs have different dock layouts; sharing a store would restore each other's window state and break it | 1 · `edu/edu_version.h`, `main.cpp`, `spimview.cpp` |
| 3 | Modified-version marking in the window title and About | "QtSpim" | To tell which program it is. The original copyright, BSD and LGPL notices are kept as they are | 1 · `menu.cpp` `help_AboutSPIM` |
| 4 | Help is looked up **first in `help/` in the executable's folder** | Only the 3 install paths | The distribution must be self-contained. Depending on someone else's install folder silently breaks when that is deleted or updated | 2 · `menu.cpp` `help_ViewHelp` |
| 5 | Paths that cannot be represented in the local 8-bit encoding are **skipped after a warning** | `fopen` fails on a `???` path → "Cannot open file" | Better to tell the cause, and continuing fails anyway, showing the error twice. The root fix means modifying `CPU/`, so we do not do it | 2 · `edu/edu_path_check.*` |
| 6 | The encoding name in the warning window is obtained with `GetACP()` (the only Win32 call in the fork) | — | Qt calls the Windows locale codec just "System" | 2 · `edu/core/edu_path_encoding.cpp` |
| 7 | **Cancelling** Change Value **does nothing** | Cancelling still shows a "Bad … value" warning | A bug in the original | 3 · `edu/edu_register_view.cpp` |
| 8 | Change Value's **range check is platform-independent**: decimal −2147483648…4294967295, hex/bin 32 bits. Beyond that is an error | `toLong()`/`toULong()` — differ between Windows (32-bit `long`) and Linux (64-bit), and on Linux values beyond range are silently truncated | Same result for the same input | 3 · `edu/core/edu_format.cpp` `parseValue32` |
| 9 | Register **change-highlight baseline**: relative to the start of the run command (Step/Run/Continue). Reset on Reinitialize/Load/Clear; values entered by the user are not highlighted | Relative to the previous screen refresh | So that "what changed" is visible after Run | 3 · `edu/edu_register_model.*` |
| 10 | Int Regs is a group tree + columns (Name / No. / selected radix / Decimal); values are `0x` + 8 digits | One line each, `R8  [t0] = 0` | PLAN R1, R2. **Log save and print output unchanged from the original** | 3 · `edu/edu_register_view.*` |
| 11 | Register dock and inspector in the **left dock area** (full window height), vertical tabs | Top dock row; the message log spans the full window width | Needed so that 47 rows fit on a 1080-line screen without scrolling (§11) | 3 · `edu/edu_spimview_glue.cpp` |
| 12 | Inspector item in the Window menu, new Inspector dock | None | PLAN common inspector | 3 · `edu/edu_inspector.*` |
| 13 | Saved window layout version 2 (a layout saved by an earlier build is ignored once) | Version 1 | So that the layout of item 11 does not revert to an old saved state | 3 · `QtSpim/state.cpp` |
| 14 | Text panel is a table (BP / Address / Code / Type / Instruction / Source). Pseudo expansions get a background band, type badges, source lines in gray | One line each, `[00400000] 8fa40000  lw $4, 0($29) ; 183: …` | PLAN R3. **Log save and print output unchanged from the original** (§14.4) | 5 · `edu/edu_text_model.*`, `edu/edu_text_view.*` |
| 15 | Kernel Text Segment starts as a **single collapsed row**. Clicking the header row expands/collapses it; it expands automatically when PC enters the kernel | Always fully shown | So that student code is seen first | 5 · `edu_text_model.cpp` `setCurrentPc` |
| 16 | The four toggles in the Text Segment menu (User/Kernel/Comments/Instruction Value) **take effect immediately** | Changing the menu leaves the screen as is; it takes effect on the next full refresh (Load, Reinitialize, etc.) — the `changed` test is inverted (`menu.cpp` `text_Display*`) | A bug in the original | 5 · `menu.cpp` (4 `// EDU:` places) |
| 17 | Because of item 16, a **log saved right after a toggle** follows the current menu state | The old content left on screen is saved | The log is freshly built with the original HTML builder at save time | 5 · `textwin.cpp` `eduFillTextLog` |
| 18 | A line with a breakpoint is **displayed correctly on screen** (red dot + original instruction) | After a full refresh it breaks like `N [x0040002] x3402000   ori …` (the bug from §2: the core prefixes `*`, but the line is sliced at fixed offsets) | Fix the screen, but **leave the log output broken the same way as the original** (byte-identity principle, golden `text-breakpoint.txt`) | 5 · `edu_text_model.cpp` `disassemblyOf` |
| 19 | Clicking the BP column toggles a breakpoint. Right-click menu is Copy / Set Breakpoint / Clear Breakpoint (the inapplicable one is disabled) | Right-click menu only: standard text menu (Copy, Select All) + Set/Clear always enabled | PLAN step 5 | 5 · `edu_text_view.cpp` |
| 20 | During stepping the selection (cursor) does not move. The PC row only gets a cyan highlight + is scrolled into view | The text cursor also moves to the PC line | The selection is the inspector's target, so it stays where the user put it | 5 · `edu_spimview_glue.cpp` `eduHighlightInstruction` |
| 21 | Inspector height is 6–16 lines depending on content. Width is 44 characters (42 in step 3) | Fixed at 6 lines | Instruction field table + branch explanation. The table for the FI format (`bc1t`) is 44 characters wide | 5 · `edu/edu_inspector.*` |
| 22 | If a source line is not UTF-8, it is interpreted and displayed as CP949 | Interpreted only as UTF-8 (Korean CP949 comments are garbled) | Common in student files. The bytes the core holds are unchanged | 5 · `edu/core/edu_source_text.*` |
| 23 | Data panel is a table (Address / +0 / +4 / +8 / +C / ASCII / Labels). Row composition (a short first row, one row for 4 or more zero words) is the same as the original | One line each, `[10010000]    6c6c6548 …    H e l l` | PLAN R5. **Log save and print output unchanged from the original** (§15.5) | 6 · `edu/edu_data_model.*`, `edu/edu_data_view.*` |
| 24 | The Address column is the **row's base address** (a multiple of 16). If a row starts in the middle, the leading cells are empty | Uses the first word's address (`[7fffff84]`) and fills values from the left | The address must match the column headers +0/+4/+8/+C | 6 · `edu_data_model.cpp` `data()` |
| 25 | The **argv/environment area** at the top of the stack starts as a **single collapsed row** (click to expand). Segment header rows can also be collapsed; Kernel data starts collapsed | Always fully shown | So that user names and paths do not appear in student screenshots (§15.3). The log and printout show everything, as in the original | 6 · `edu_data_model.cpp` `buildRows` |
| 26 | The Data panel is redrawn even when `$sp`/`$fp`/`$gp` change **without a memory write** | Only when `data_modified` — in a step where only `$sp` changes, the User Stack start address stays at the old value | Pointer markers and the stack start must follow the registers | 6 · `datawin.cpp` `DisplayDataSegments` (`// EDU:`) |
| 27 | Change Memory Contents: **cancelling does nothing**; the range check is platform-independent (same rule as items 7 and 8). An address inside a row of consecutive zeros can also be reached with Go to and edited. It also opens on double-click | Cancelling still shows "Bad … memory value"; the `toLong()` range differs by platform; in an `[a]..[b]` row only the first address can be edited | Same reason as items 7 and 8 | 6 · `edu_data_view.cpp` `changeValue` |
| 28 | Words / Half words / Bytes in the Data Segment menu and right-click menu; a Go to input and a `$sp` button above the panel | None | PLAN R5 | 6 · `edu_data_view.cpp` |
| 29 | If `$sp` is outside the stack range (e.g. 0 right after Clear Registers), User Stack shows **the whole allocated stack** | Scans from `$sp` up to 0x80000000 as is (reads 500 million words of unmapped addresses — effectively hangs) | To avoid hanging. Log saving still uses the original builder, so in this case it takes as long as the original | 6 · `edu_data_model.cpp` `segmentBounds` |
| 30 | **File > Load File asks**: if a program is loaded, "Reinitialize and load (default) / Add to current program / Cancel". The recent-file items do the same. Reinitialize and Load File and the first load do not ask | Silently loads on top of the current program → for the same file, `Label is defined for the second time … main` (§16) | The confusion students run into most often. Choosing "Add" is the same as the original | 6 follow-up · `menu.cpp` `file_LoadFile` (`// EDU:`), `edu_spimview_glue.cpp` `eduConfirmLoadOnTop` |
| 31 | **Settings badge** on the right of the status bar: whichever of Bare Machine / Pseudo instructions off / Delayed branches / Delayed loads differs from the default | None | These settings are saved and persist after restart. With Bare Machine, pseudo instructions such as `li` become a syntax error | 6 follow-up · `edu_spimview_glue.cpp` `eduUpdateModeBadge` |
| 32 | Files are read with **its clone `eduReadAssemblyFile()`** instead of the core's `read_assembly_file()` (line-by-line mapping + capturing `print_symbols()` right before `flush_local_labels()`) | Calls the core function directly | The only way to get local labels (§3.7). **The simulator state is the same** — `tests/edu_loader` compares text, data, bounds, errors and symbol table after both loaders over all of `Tests/` | 6 follow-up · `edu/edu_loader.*`, `menu.cpp`, `main.cpp` (`// EDU:`) |
| 33 | The Data panel's Words / Half words / Bytes choice is saved in the settings (`DataWin/EduDisplayUnit`) | — | Step 6 checkpoint | 6 follow-up · `state.cpp` (2 `// EDU:` places) |
| 34 | **Editor dock** (in the same tab group as Data and Text, frontmost on the start screen). An **Editor menu** between File and Simulator: New (Ctrl+N) / Open (Ctrl+O) / Open Recent / Save and Assemble (Ctrl+S, F3) / Save As and Assemble (Ctrl+Shift+S). The same actions in the Simulator menu and toolbar (toolbar text "Assemble"), Editor in the Window menu. The original File menu is unchanged | No editor. Only three shortcuts: F5, Shift-F5, F10 | PLAN R4 | 7 · `edu/edu_editor_dock.*`, `edu/edu_code_editor.*`, `edu/edu_editor_glue.cpp` |
| 35 | **Errors during Assemble show no modal**: a list below the editor + red dots in the margin + "N errors" in the status bar. They are printed to the message log exactly as in the original. When loading through the File menu, one modal per error as in the original | One modal per error (§4) | Step 1 decision 4. One `// EDU:` place in `SpimView::Error()` | 7 · `spimview.cpp`, `edu_editor_glue.cpp` `eduCollectError` |
| 36 | The line number in the error list is **the line where the quoted source line actually is**. The message in the log keeps the number the core reported | Errors such as an out-of-range operand are reported after reading the first token of the next statement, so the number points to a later line (`Tests/tt.alu.bare.s`: message 414, actual 413) | So that students do not look at the wrong line | 7 · `edu/core/edu_asm_errors.cpp` `resolveMessageLine` |
| 37 | Files loaded via the File menu, recent files or the command line **also open in the editor** (if the editor has unsaved changes to another file, it asks first). After loading, the Text tab comes to the front | — | PLAN R4 item 6 | 7 · `eduEditorFileLoaded` in `menu.cpp` and `main.cpp` |
| 38 | On exit (closing the window, File > Exit), if the editor has unsaved changes: Save / Discard / Cancel | Exits immediately | So that work is not lost | 7 · `spimview.cpp` `closeEvent`, `menu.cpp` `file_Exit` |
| 39 | Saved window layout version 3 (a layout from an earlier build is ignored once) | — | Restoring a layout without the Editor dock hides the dock | 7 · `state.cpp` |
| 40 | **Save = assemble.** There is only Editor > Save and Assemble (Ctrl+S = F3 = toolbar Assemble); there is no save-only action. Save As also assembles after saving. It does not ask (only an unnamed new file gets Save As) | No editor | So there is no "I saved it, why didn't it change" (step 7 checkpoint) | 7 · `edu_editor_glue.cpp` `eduAssemble` |
| 41 | Even if assembly fails, **the file stays saved**, and the status bar shows "Assemble failed — N errors. Simulator was reset." | — | Assembly goes through the original's Reinitialize and Load File path, so the previous program is gone. This tells the user why | 7 · same place |
| 42 | A banner at the top of the Text and Data panels, **"Source changed — save (Ctrl+S) to assemble"**: when the editor's source differs from what the simulator last received (typed, opened another file, did Reinitialize, the last file was opened at startup). Click = save + assemble. It disappears once assembly is attempted (whether it succeeds or fails) | — | Tells the user on the spot that the Text/Data being viewed differs from the current source | 7 · `edu_editor_glue.cpp` `eduUpdateStaleBanner` |
| 43 | On startup, **the editor reopens the last file it had open** (setting `Editor/LastFile`; if the file is missing, silently an empty editor). **It does not assemble** — the simulator's start state is the same as the original (check 7 of `check-editor.sh` compares the text segment with a fresh start). On a start with no program loaded, the Editor tab is in front regardless of the saved window layout | — | Step 7 checkpoint | 7 · `edu_editor_glue.cpp` `eduSetupEditor`, `eduEditorAtStartup`; `main.cpp` (`// EDU:`) |
| 44 | The version is **our own, 1.0.0** (`EDU_VERSION`); About shows "QtSpim-Edu 1.0.0 (based on QtSpim 9.1.24)", and the far right of the status bar shows "QtSpim-Edu 1.0.0" | About shows only the SPIM version | So that the build can be identified from a student's screenshot alone. `CPU/version.h` is unchanged | 8 · `edu/edu_version.h`, `menu.cpp`, `edu_spimview_glue.cpp` |
| 45 | **The MSI is a separate product**: ProductName `QtSpim-Edu`, its own UpgradeCode, `%ProgramFiles%\QtSpim-Edu` (64-bit), Start menu only (no desktop shortcut), no `.s` association, and the installer's only registry key is `HKCU\Software\QtSpim-Edu-Installer` | `QtSpim` / `%ProgramFiles(x86)%\QtSpim.` / desktop shortcut | So that installing and removing on the same PC as standard QtSpim does not affect each other. CI's `tools/check-msi.ps1` verifies this with the MSI tables and an actual unattended install/uninstall (next to a stand-in for standard QtSpim) | 8 · `Setup/QtSpimEdu_Win_Deployment/`, `tools/package-msi.ps1` |
| 46 | **The splitter above the Inspector moves.** The inspector is locked to the content height (6–16 lines) until the user grabs the splitter, and unlocks the moment it is pressed (minimum 3 lines, no maximum). If a drag changes the height, from then on it is the user's height (saved with the window state, `MainWin/InspectorUserSized`); just pressing locks it again. Window > Tile returns it to locked | — | In 1.0.0 it was fixed to the content height and the splitter did not work (a bug). Following it with `resizeDocks()` was not used because Qt recalculates even the left column's width on a vertical request (401→492px) | 1.0.1 · `edu_inspector.cpp` `setHeightLocked`, `edu_spimview_glue.cpp` `eventFilter` |
| 47 | **Window > Message Log (Ctrl+L)**: the central message log can be turned off, and when off, Text/Data/Editor take its place. Saved and restored. When the simulator reports an error (assembly or runtime exception, `SpimView::Error()`), it turns back on by itself. The original message boxes are unchanged | Always visible | Use the screen more widely without missing messages. Ctrl+L does not collide with the original (F5, Shift-F5, F10) or the editor (Ctrl+N/O/S, Ctrl+Shift+S, F3) | 1.0.1 · `edu_editor_glue.cpp` `eduSetLogVisible`, `spimview.cpp` (`// EDU:`) |
| 48 | **Editor, Text and Data can be placed side by side**: `dockOptions` is `AllowNestedDocks | AllowTabbedDocks | GroupedDragging` instead of `ForceTabbedDocks`. A tab can be dragged out and docked to the side, top or bottom, or floated; dropping its title bar on another tab makes it a tab again. Window > Layout has 3 presets (Tabs / Editor \| Text / Editor / Text), window state version 4 | The three panels are always one tab group | To see code and results together, as in VS Code | 1.0.1 · `spimview.ui`, `edu_editor_glue.cpp` `eduArrangePanels` |
| 49 | After Assemble, the "switch" to Text does not happen if Text is already visible (side-by-side layout). The same goes for switching to Editor on errors. The Text panel's Instruction column fits its content width (max 38 characters) — so the Source column remains at half width | — | To keep the side-by-side layout meaningful | 1.0.1 · `eduAssemble`, `edu_text_view.cpp` `afterReset` |
| 50 | The Text panel's minimum size is 300×120 (the original .ui has an 800×600 minimum). 800×600 is kept as the `sizeHint`, and the first-run window size is 1300×830 | 800×600 minimum | Panels must be able to shrink to be placed side by side | 1.0.1 · `spimview.ui`, `edu_text_view.h`, `state.cpp` |
| 51 | **Name**: display name "Hallym MIPS Simulator", executable and settings store `HallymMIPS`/`HallymMIPS`, help collection `help/HallymMIPS.qhc`, MSI ProductName "Hallym MIPS Simulator", a new UpgradeCode, install folder `Program Files\Hallym MIPS Simulator`. No QtSpim/Edu marking on screen, in documents or in file names (except the About → License tab, LICENSE, and this document's references to the original) | "QtSpim", `LarusStone`/`QtSpim` | A derivative for Hallym University courses. Its settings store also differs from QtSpim-Edu 1.0.1's, so all three can be installed side by side | H2 · `edu/edu_version.h`, `QtSpim.pro`, `Setup/HallymMIPS_Win_Deployment` |
| 52 | **Theme**: all colors, fonts and spacing come from `edu/theme/tokens.h` (based on `docs/design/tokens.md`). The app stylesheet `edu/theme/light.qss` is applied with its `@name@` placeholders filled from the tokens (`edu::theme::styleSheet()`); the UI font Pretendard 13px is set with `QApplication::setFont`; the code font D2Coding 10pt is a settings default (`state.cpp`), so it can be changed in the Settings dialog. Colors that widgets draw themselves (type badges, PC row tint + 3px left bar, selected row tint + dark navy text, pseudo group band, changed value SemiBold #00736F, editor syntax / current line / margin, Data markers, error list) use the same tokens. Toolbar icons are Lucide SVGs rendered to PNG in token colors by `tools/make-theme-icons.py` (`edu::theme::toolIcon`); the original bitmaps (`windows_images.qrc`) were removed from the build | Courier 10pt, system style, original icons | tokens.md. QSS `font-family` does not apply to widgets that call `setFont()` again (tables, editor, inspector), so the code font goes through the `applyPanelFont()` path | H2 · `edu/theme/`, `edu_text_view.cpp`, `edu_register_model.cpp`, `edu_data_model.cpp`, `edu_code_editor.cpp` |
| 53 | Message log **display** font and colors: the HTML `font-family:Courier` in `WriteOutput()` → the token code font, the green of the start banner → `kTextLog`, messages from `Error()` → `kError`. The saved log (`toPlainText`) is byte-identical | Courier, green/black | tokens.md 5 | H2 · `spimview.cpp` (`// EDU:`), `menu.cpp` `SetOutputColor` |
| 54 | Code table row height **16px** (register tree, Text, Data), 4px padding under dock titles (`eduInsetDockContent`, Text/Data box padding). At 1920×1080, 41 of the 47 register rows are visible and the end of Reserved and CP0 scroll (all 47 rows with the inspector closed). Of the left column's 975px of height, 742px goes to the register table, so rows would need to be 15px to fit all 47 | 15–16px (step 3: so that 47 rows fit in 1080) | Tokens. H1 decision ④ (scrolling allowed) | H2 · `edu_register_view.cpp` `CompactRowDelegate`, `edu_text_view.cpp`, `edu_data_view.cpp` |
| 55 | The inspector's fixed-pitch check (`fixedPitchVersionOf`) is **skipped for the bundled code font** | (a check added in step 3) | fontconfig classifies D2Coding as dual spacing, so on Linux `QFontInfo::fixedPitch()` is false. The font itself declares fixed pitch (post, PANOSE) | H2 · `edu_inspector.cpp` |
| 56 | **Splash**: at startup, a signature card (Korean/English side-by-side lockup) for 1.2 seconds or until clicked. Not shown in script capture mode (`EduDevtools::wantsCaptureMode`). **About**: emblem A + logotype + name and version + License tab (original notices, Qt LGPL, OFL, ISC). The app icon is the basic symbol at 16/32/48/256 | None / `QMessageBox` | Branding | H2 · `edu/theme/edu_theme.cpp` `showSplash`, `edu/edu_about.cpp`, `edu/theme/brand/` |
| 57 | Toolbar: Assemble is a primary button with icon + text (`QToolButton#EduAssembleButton`, 2945 fill); the rest are icons only. Separators make three groups: file / run / help | 6 groups | tokens.md | H2 · `spimview.ui` toolBar, `edu_editor_glue.cpp` |
| 58 | The status bar badge, the "Source changed" banner, the version label and the error list are styled by object-name rules in the app stylesheet (`QLabel#EduModeBadge` etc.), not widget stylesheets | Widget `setStyleSheet` literals | Zero color literals | H2 · `light.qss` |
| 59 | **Start banner**: the start text in the log window is three lines: `Hallym MIPS Simulator 1.0.0` / `MIPS32 assembler and simulator · AIAC Lab, Hallym University` / `Based on SPIM 9.1.24 by James Larus (BSD). See Help > About > License.` The only change is **not calling** the core's `write_startup_message()` (`CPU/spim-utils.cpp:132`); `CPU/` is unchanged. The copyright, BSD and LGPL notices are in the About dialog's License tab and in the LICENSE file | `SPIM 9.1.24 …` 5 lines + `QtSPIM is linked to the Qt library …` | Another product's name remained in a spot seen every time the program starts. **Only the screen display** changes: Save Log File and Print use only the registers, Text, Data and console, not this window (`file_SaveLogFile`, `file_Print`). Only the two message-window goldens `syntaxerror-log.txt` and `syntaxerror-run-log.txt` were re-captured; the saved-log goldens (`*-log`) are byte-identical. Because the banner contains the version, **these two must be re-captured every time the version is bumped** (`tests/golden/README.md`) | H2 · `menu.cpp` `sim_ReinitializeSimulator` |
| 60 | **Help menu**: `User Guide` (= toolbar `?`) opens the bundled student guide (`HallymMIPS-GUIDE-ko.pdf` in the zip, `docs/GUIDE-ko.md` in the development tree), and the original SPIM documentation is kept separately as `MIPS Reference` (the tooltip and help window title state that it is the original documentation). The QtSpim GUI manual (`manual.html` and its 3 screenshots) was removed from the help collection, leaving only `HP_AppA.html` (the assembler, linker and instruction appendix). The help/assistant search path looks only at the executable's folder | A single `View Help` opened the QtSpim manual and searched as far as the standard QtSpim install folder | It was a document describing another program's screens, and we do not rely on someone else's install folder | H2 · `edu_spimview_glue.cpp` `eduSetupHelpMenu`/`eduShowUserGuide`, `menu.cpp` `help_ViewHelp`, `help/HallymMIPS.qh*` |
| 61 | The settings store's organization name is `HallymMIPS`, and **no domain string is set** (the `setOrganizationDomain` call was removed). Linux `~/.config/HallymMIPS/HallymMIPS.conf`, Windows `HKCU\Software\HallymMIPS\HallymMIPS` | `LarusStone`/`QtSpim` | The domain is used in the path only on macOS, and we do not use the university's domain as a product identifier | H2 · `edu_version.h`, `main.cpp` |
| 62 | The display value meaning the built-in exception handler is `<<Built-in Exception Handler>>` | `<<SPIM Exception Handler>>` | It is visible as is in the Settings dialog. The meaning of the value is the same (a sentinel, not a file name) | H2 · `spimview.cpp` |
| 63 | The `spim: ` prefix is stripped from assembly errors **only when drawing them in the message window** (the `(parser)` category label is kept). The string the core builds (`CPU/parser.y:2952`) and the argument received by `SpimView::Error()` are unchanged, so the editor error list's parser (`edu/core/edu_asm_errors.cpp`) keeps reading the original format. This is the only core message that gets this prefix (`run_error()` has none) | `spim: (parser) syntax error on line …` | The last remaining name of another product in a spot seen right at startup. The message window does not go into Save Log File or Print (item 59), so only the screen display changes — only the 2 message-window goldens were re-captured, and the `*-log` goldens are unchanged | H2 · `spimview.cpp` `WriteOutput` |
| 64 | Inspector: document margin 4→2px, inner frame removed (the dock draws the card border) | Qt default 4px + StyledPanel\|Sunken | 8px for the 47 rows of item 54 | H2 · `edu_inspector.cpp` |
| 65 | **Start screen**: a 480×300 white card drawing the signature, product name, version, a divider, `AIAC Lab · Hallym University` and a 2px progress bar at the bottom (indeterminate, left→right). For 1.5 seconds or until clicked. **The main window and the console appear after the splash closes** (`SpimView::eduRevealWindows()`); before that they are not visible behind it. It does not appear in the taskbar (`Qt::SplashScreen`) | None | A loading screen. Not shown in script capture mode; `--capture splash` grabs the same widget | H2 · `edu/theme/edu_splash.*`, `main.cpp` |
| 66 | **The app icon uses a different official mark per size**: the basic symbol at 16, 24 and 32px, the circular emblem A at 48, 64 and 256px. The title bar (16) and taskbar (24, 32) get the symbol; the emblem starts at 48px, where its ring of lettering is readable. The marks are not altered, only scaled and padded. The `.ico` must hold a different image per size, so `tools/make-theme-icons.py` writes it directly (Pillow's `sizes=` only resizes one image) | One kind of symbol | Below 48px the emblem's ring of lettering looks like a smudge (the threshold was raised from 16 to 48 in 1.0.1). Evidence capture: `docs/design/captures/app-icon-options.png` (comparison of 3 options at 16, 24, 32, 48, 64px) | H2 · `tools/make-theme-icons.py`, `theme/brand/HallymMIPS.ico`, `edu_theme.cpp` `apply` |
| 67 | The window title is `helloworld.s \u2014 Hallym MIPS Simulator` (when a file is open in the editor). On Windows, taskbar grouping is fixed with `SetCurrentProcessExplicitAppUserModelID` | Fixed `QtSpim` | Editor convention. Without an AppUserModelID, the taskbar groups by the icon of the program that launched it | H2 · `edu_spimview_glue.cpp` `eduUpdateWindowTitle`, `main.cpp` |
| 68 | **First-run tutorial** (a 7-step spotlight tutorial): a translucent overlay over the main window dims everything except one panel, and a card beside it explains how that panel differs from standard QtSpim. Once on first run if the `Tutorial/Shown` setting is absent, and afterwards via Help > Tutorial. Steps for panels the user has closed are dropped and the steps renumbered; a panel behind a tab is raised for that step (the layout is not changed). It starts in Korean if the system language is Korean, otherwise English, and a toggle on the card switches immediately. Ends with Esc or Skip; clicks outside are ignored | None | Students see on screen, on first run, what is different. In script mode it does not run automatically; it is shown only with `--tutorial-step N` | H2 · `edu/edu_tutorial.*`, `edu_spimview_glue.cpp` |
| 69 | Long dock tab titles are elided (`QTabBar::setElideMode(Qt::ElideRight)`). Qt creates the tab bars when docks are grouped, so this is reapplied whenever the layout changes | Cut in the middle (`:ditor: … .s`) | | H2 · `edu_spimview_glue.cpp` `eduElideDockTabs` |
| 70 | **The tutorial card is always inside the window**. The position calculation was separated from the widget into pure functions in `edu/core/edu_tutorial_layout.h`, and unit tests (`tst_tutorial_layout.cpp`) and a runtime check (`--tutorial-report`) confirm that the card for every step fits inside the window at 1366×768, 1600×900, 1920×1080 and 2000×1080. Placement order is below→above→right→left if the target is a flat strip (toolbar, column headers), otherwise right→left→below→above; if none works, the center of the window | 1.0.0: there was a clamp when the right-hand candidate was outside the window, but it took an empty rectangle grown by 2px (4×4) as the target and stuck to the top-left corner | On Windows the card was placed off-screen and [다음] (Next) could not be pressed (no way to proceed). Keyboard (Enter, Space, → next; ← previous; Esc quit) was also added as a safety net | 1.0.1 · `edu/core/edu_tutorial_layout.*`, `edu_tutorial.cpp` |
| 71 | **The tutorial overlay is not a child of the main window but a frameless top-level window** (`Qt::Tool | FramelessWindowHint | WindowStaysOnTopHint`, `WA_TranslucentBackground`, `WA_ShowWithoutActivating`) that follows the main window's position and size (watching Move, Resize, WindowStateChange, Activate). It hides when the main window is minimized or inactive and reappears when it comes back. Keys are received through a `qApp` event filter (since it does not take focus). The dim paints **only the area outside the spotlight and the card**, and the card fills its own background | 1.0.0: a child widget of the main window | On Windows, when a dock is promoted to a native window it always covers non-native siblings — the dim was not drawn at all and (in the tabbed layout) even the card was hidden. A top-level window is independent of whether the docks are native. The capture harness composites the two windows when taking shots (`grabToFile`) | 1.0.1 · `edu_tutorial.cpp` |
| 72 | **The tutorial opens a sample**: on a first run with nothing loaded, it opens `samples/tutorial.s` (bundled with the zip and MSI), runs 12 steps, and then starts. If a file is already open it is left alone; if the sample is missing, only the steps that need it are dropped | — | On an empty screen there is nothing to show change highlighting, badges, labels or the $sp marker on | 1.0.1 · `edu_spimview_glue.cpp` `eduLoadTutorialSample`, `samples/tutorial.s` |
| 73 | **The tutorial points at elements**: the spotlight takes **several** arbitrary rectangles instead of a whole widget (a group of toolbar buttons, two column headers, one badge cell, a label cell, the $sp marker cell and button). If the target is scrolled out of view it is scrolled into view first; if it is behind a tab, the tab is raised. There are 18 steps, and the card shows the area and number (`툴바 · 4 / 18` (Toolbar · 4 / 18)) | 1.0.0: 7 steps, whole panels only | Just dimming around a panel does not convey "what is different" | 1.0.1 · `edu_tutorial.cpp` |
| 74 | **Full tooltip audit**: 12 toolbar buttons (name + shortcut), 4 register columns and group headers, 6 Text columns and the type badge cell, 7 Data columns, the label cell, the marker cell and the environment-variable row, 2 status bar badges, the "Source changed" banner, the editor status line and the error list. All of them are one line of English + one line of Korean | Only some existed | The tutorial's toolbar step draws and shows the actual tooltip text | 1.0.1 · `Qt::ToolTipRole` in each model, `edu_spimview_glue.cpp` |
| 75 | **Light Windows title bar**: `DwmSetWindowAttribute` turns off the dark-mode title bar (attributes 20 and 19), and on Windows 11 22H2 or later sets the title background #FFFFFF, text #00205B and border #E1E5EA. On builds that do not support it, the call is simply rejected. Applied when the window appears and when the system theme changes | A black title bar if the system is dark | A black title on a white window stood out on its own | 1.0.1 · `edu/theme/edu_theme.cpp` `applyWindowChrome`, `QtSpim.pro` (dwmapi) |
| 76 | **App icon is a white tile + symbol**: the symbol centered at 76% of the tile width on a white rounded square that fills the canvas (18% rounding, 1px #E1E5EA border). The same composition at every size from 16 to 256px | 1.0.0: mark only (symbol at 16, emblem at 48 and above) | A flat mark on a transparent background looked small and faint on a dark taskbar. Evidence: `docs/design/captures/app-icon-taskbar.png` | 1.0.1 · `tools/make-theme-icons.py` |
| 77 | **Docks split by dragging are equalized**: when dragging and dropping a dock changes the layout (`dockLocationChanged`, `topLevelChanged`), the docks placed in one line are resized equally with `resizeDocks`. The layout restored at startup and splitters the user drags afterwards are left alone | The drop indicator appeared as a narrow strip at the edge, and one side became far too narrow | Check: `--dock-drop h|v` deliberately splits unevenly and then measures the difference after equalization (1px left/right, 1px top/bottom) | 1.0.1 · `edu_spimview_glue.cpp` `eduEqualiseDocks` |
| 78 | Gray text on white darkened to WCAG AA: `text.2` #5B6B7B → **#5A6472** (6.0), `text.muted` #8A94A0 → **#65707E** (5.0, 4.6 even on tinted rows). Splash product name is 22px Bold | Line numbers and comments at 3.1, below the threshold | tokens.md 1.4 contrast table | 1.0.1 · `tokens.h` |
| 79 | **The "Source changed" banner distinguishes the cause**: it keeps the **editor content hash + file path** from the last successful assembly and compares them with the current state to pick one of four texts — `Not assembled yet` if nothing has been assembled yet, `Simulator was reinitialized` if it was assembled and then reinitialized, `Text shows a different program` if another file was added with "Add to current program" or the path differs, and `Source changed` if the content changed. No banner is shown for an empty untitled editor. The Korean explanation is in the tooltip | Three causes but a single text, "Source changed" | Right after Reinitialize, saying "the source changed" is not true. The decision uses a hash, not the modified flag, so a file reverted externally is also judged correctly. Check: section 8 of `check-editor.sh` creates the four cases | 1.0.1 · `edu_editor_glue.cpp` `eduUpdateStaleBanner` |
| 80 | **Editor font size**: `Ctrl+=`, `Ctrl++` (zoom in), `Ctrl+-` (zoom out), `Ctrl+0` (default), `Ctrl+wheel`. 8–32pt in 1pt steps, stopping silently at the ends. Only the editor and the line-number margin change; other panels keep the configured font. The shortcuts are bound only to the editor dock with `Qt::WidgetWithChildrenShortcut` and do not react in other panels (check: `--editor-key text:ctrl+=`). The size is saved in `Editor/FontPointSize`, and changing the font in Settings makes that size the new baseline. The changed size is shown on the right of the status line for 1.5 seconds | None | Zoom In/Out/Reset Zoom are in the Editor menu to make the feature discoverable | 1.0.1 · `edu_code_editor.*`, `edu_editor_glue.cpp` |
| 81 | **When the tutorial opens the sample**: `Help > Tutorial` opens `samples/tutorial.s` **only when the editor is empty and has no name** (`EduEditorDock::isUntouched()` = no path + no modification + empty document). Otherwise it does not open the sample and proceeds with the current screen as is, skipping steps that have nothing to show and renumbering. The last sentence of step 1's body is one of two — if the sample was opened, "예제 프로그램을 열어 두었으니…" ("The sample program has been opened, so…"), otherwise "지금 열려 있는 프로그램으로 진행합니다. 예제로 보려면 편집기를 비우고 다시 실행하세요." ("Continuing with the program that is open now. To see it with the sample, empty the editor and run it again.") | If no program was loaded, it always opened the sample | Opening the tutorial while editing made `openFile()` first show "저장할까요?" ("Save?"). Not touching the student's file comes before the tutorial. Check: section 9 of `check-editor.sh` looks at `sample=`, the absence of dialogs and the step 1 text in three cases: empty editor, unsaved edits, open file **(superseded by item 83)** | 1.0.2 · `edu_spimview_glue.cpp` `eduShowTutorial`, `edu_tutorial.cpp` |
| 82 | **The [예제로 보기] (Show with sample) button in step 1**: only when the sample was not opened, the step 1 card gets a secondary button (outline only) to the left of [건너뛰기] (Skip). Pressing it goes through the save confirmation (cancelling changes nothing), reinitializes the simulator, opens the sample, and restarts the tutorial from step 1. If `samples/tutorial.s` is missing, there is neither the button nor the sentence. When the button is shown, the card is widened to fit 4 buttons + the step indicator (about 440 for Korean, 470 for English) | Students who could not open the sample saw only a 9-step tutorial | The save confirmation is not surprising because the student pressed the button. Reinitializing first is needed because otherwise `main:` is defined twice and causes a parser error. Check: tutorialE (cancel), tutorialF (proceed) and tutorialG (proceed on top of an assembled file, 0 prompts, 0 error windows) in section 9 of `check-editor.sh` **(superseded by item 83)** | 1.0.2 · `edu_tutorial.cpp` `useSample`, `edu_spimview_glue.cpp` `eduSwitchToTutorialSample` |
| 83 | **The tutorial always opens the sample**: both `Help > Tutorial` and the first run reinitialize, open `samples/tutorial.s` and go through the same 19 steps. If the editor has unsaved content before starting, `maybeSave()` asks, and **on cancel the tutorial does not start**. If the user chooses save or discard, `forgetChanges()` prevents the question from appearing twice, and then the sample is opened. The conditional loading of items 81 and 82, the [예제로 보기] button and the diverging step 1 text were all removed | 1.0.2: opened the sample only when the editor was empty, otherwise shrank to 9 steps | Students who are not on their first run seeing only half is worse. A step count that does not depend on state is also easier to explain. Check: tutorialEmpty, tutorialSaved, tutorialTyped, tutorialCancel in section 9 of `check-editor.sh` | 1.0.3 · `edu_spimview_glue.cpp` `eduShowTutorial` |
| 84 | **The sample's stop point is defined by a label**: after loading, it single-steps **until `sum_loop` is reached for the third time** (at most 800 steps; if not found, a warning and it stays at the entry point). At that point a stack frame has been created so $sp is 16 lower, two arrays have been added and 18 has been written to `total`, and $t and $s registers have changed. Single-stepping resets the change baseline every time (`sim_SingleStep`→`eduBeginRunCommand`), so only during the tutorial load the baseline is held with `EduRegisterModel::setSnapshotHeld(true)`, and everything changed by that one run stays teal | Stepping a fixed number of times (12) | If the sample is edited, the meaning of the number 12 silently changes. A label moves with it | 1.0.3 · `edu_spimview_glue.cpp` `eduRunToTutorialStop`, `edu_register_model.h` |
| 85 | **The spotlight finds the actual cells**: targets are found by label (`nums`, `total`, `prompt`), address (PC, `$sp`) and mnemonic (`jal sum_array`, `beq`, `addu`, `j`). Row numbers are not used. In Text it points at the machine-code and format cells, the PC row and `j`'s BP cell; in Data at the four array words, `total`, the ASCII cells of a string, and the $ra and $s0 saved in the frame; in the registers at the $sp and $t0 rows that actually changed. The inspector step actually selects that instruction. If a target is not found, that step is dropped and recorded with `qWarning` and in `skipped=` of `--tutorial-report` | It pointed only at column headers | Headers cannot explain what is being shown. Check: `--tutorial-report` must show `steps=19 skipped=0` | 1.0.3 · `edu_tutorial.cpp` `collectSpots` |
| 86 | **Hiding the overlay is decided at the application level**: hiding immediately on the main window's `WindowDeactivate` meant that the moment the card was clicked, the overlay became the active window and the tutorial disappeared (the bug where pressing [다음] with the mouse ended the tutorial). Now activation changes are deferred with `QTimer::singleShot(0, updateForActivation())` and decided from `QApplication::applicationState()` and whether the newly active window is ours. After `finish()`, `running_` is false so it does not come back | `WindowDeactivate` → `hide()` | Check: `--tutorial-click-through` imitates even the activation events the window manager sends, completes all 19 steps with the mouse only, and checks Back, Skip and the last step | 1.0.3 · `edu_tutorial.cpp` `updateForActivation` |
| 87 | **The sample's stack frame is 16 bytes**: the MIPS ABI requires 8-byte alignment of $sp, so a 12-byte frame breaks alignment. `addiu $sp, $sp, -16` with `sw $ra, 12($sp)` and `sw $s0, 8($sp)`; 0 and 4 are left empty as local-variable slots. The tutorial's stack step does not hard-code offsets; it highlights **four words starting at $sp** | A -12 frame, highlighting only the two words at +4 and +8 | It could be flagged against the textbook or TA standard, and hard-coded offsets would point at the wrong cells when the sample is edited. The run result is still 55, and $s0=42 is preserved after the call | 1.0.4 · `samples/tutorial.s`, `edu_tutorial.cpp` |
| 88 | **The first run and Help > Tutorial are the same function**: both entry points call `SpimView::eduShowTutorial()`. The only additions on the startup path are the `Tutorial/Shown` check and a 250ms delay. devtools `--tutorial-first-run` goes through the startup path as is (it actually waits for the timer), and `--tutorial-report` prints the loaded file, the stop point (PC, $sp), the step count, each card's rectangle, and the Korean and English titles and bodies | It had never been confirmed that they were the same | Check: section 10 of `check-editor.sh` compares the 60-line reports of both paths with `diff`. Fails if even one line differs | 1.0.4 · `edu_devtools.cpp`, `main.cpp` |
| 89 | **Nothing is left behind no matter how the tutorial ends**: all four paths — completion, Skip, Esc, closing the window — converge on `finish()`. A `closeEvent` was added so that `running_` goes down even when the window manager closes it; the application event filter and the follow timer are cleaned up together, and the main window is reactivated. The overlay does not take focus even on clicks (the `setFocus()` in `mousePressEvent` was removed) | Closing the window only hid it, and it stayed in the running state | A leftover tutorial intercepts keys and pulls the step's panel to the front every 250ms, so the window seems unresponsive until restart. Check: `--tutorial-exit <finish|skip|escape|close>` reports running, visible and whether key input arrives for each of the four paths, and then `--click-tab Data` checks tab switching with a real click | 1.1.0 · `edu_tutorial.cpp` |
| 90 | **The bottom is a Console / Messages tab panel**: the console, which was a separate window, and the message window, which was the central widget, were merged into two tabs of one dock (`edu/edu_bottom_panel.*`). The `activateWindow()` in `Console::WriteOutput` and `ReadChar` became calls to `SpimView::eduRevealConsole()`, so the Console tab comes to the front when there is output and also gets keyboard focus on an input syscall. On errors, `eduShowLog()` brings the Messages tab to the front, and if another tab was being viewed, a dot is added to the tab. Ctrl+L collapses the whole panel. Window > Console now opens the tab | The console is a separate top-level window; the message window is the central widget | When a window hides behind others, you cannot tell where the output went. The widgets that log saving and printing read are unchanged, so the goldens are byte-identical. Check: section 11 of `check-editor.sh` (input syscall, tab switch on error, Console kept after running) | 1.1.0 · `edu_bottom_panel.*`, `console.cpp`, `menu.cpp` |
| 91 | **Instruction Inspector**: the inspector becomes instruction-only and is drawn graphically. A 32-cell bit grid (a color per field, MSB/LSB labels, bit numbers above the cells), one row per field (name, bit range, binary, value, meaning), and the destination calculation for branches and jumps. When narrow, it folds into two rows, 31–16 / 15–0. It does not react to register or memory selection; the memory word's address, hex, decimal and pointing registers moved to the Data cell tooltip | A dock listing registers, instructions and memory as text | Cramming three things into one widget made none of them easy to see. Register binary is already available via Registers > Binary. Check: `--inspector-report` prints what is drawn as text | 1.1.0 · `edu_instruction_inspector.*` |
| 92 | **Three-column layout, two presets**: register tab view (Int/FP) on the left, Editor + Console/Messages in the middle, Text/Data + Inspector on the right. All docks go into one dock area and are divided with `splitDockWidget` (if the areas differ, `resizeDocks` cannot see across them). The central widget is 0×0. Ratios are applied after the window reaches its actual size (`eduApplyLayoutSizes`, registers 380px, middle and right 50:50, top and bottom 65:35). The saved window state version is 5 | Three presets (tabs / left-right / top-bottom), inspector at bottom left | With everything in one tab group, students have to move around the screen. Window > Tile returns to preset 1 | 1.1.0 · `edu_spimview_glue.cpp` `eduApplyLayout` |
| 93 | **QtSpim comparisons removed from the tutorial text**: the bodies of the 20 steps (Korean/English) were rewritten as "what this screen shows and how to use it". Card bodies do not use gray (#2B3440 Medium 14px, line spacing 1.5), title #00205B SemiBold 15px, Skip and Previous text #00205B, language toggle #0055A5 | Sentences such as "표준 QtSpim에는 없는 기능입니다" ("This feature is not in standard QtSpim"), body #1F2933 13px | The tutorial's readers are students who have never used QtSpim. The README and the guide do the comparing | 1.1.0 · `edu_tutorial.cpp` |
| 94 | **The start banner appears once per app launch**: the 3 lines that `sim_ReinitializeSimulator()` printed every time are printed only once via `eduBannerShown`. Later reinitializations leave only `Memory and registers cleared` | 3 lines on every reinitialization | Two copies piled up with each tutorial run, and Messages filled with banners. It is not a widget that log saving or printing reads, so it does not conflict with the vanilla byte-identity rule (only the 2 message-window goldens were updated) | 1.2.0 · `menu.cpp` |
| 95 | **Bare Machine is removed from the UI**: the checkbox and preset button in Settings are hidden, `bare_machine` is always false, and it is excluded from the status bar badge. The decoder's two branch conventions and the oracle tests are unchanged. The command-line `-bare` was kept — `Tests/*.bare.s` are for that mode and `regress.sh` compares against vanilla | Checkbox and badge | When it was left on, li, la and move became syntax errors and students looked for the cause in their own code | 1.2.0 · `menu.cpp`, `state.cpp`, `main.cpp` |
| 96 | **No bold in monospaced columns**: changed registers are marked only with color (#00736F) and a light tint (#E6F6F5), and bold was removed from register names, numbers and group titles and from Text's Instruction column | Changed values, names and the instruction column were SemiBold | D2Coding has no bold face, so Windows synthesizes one, and synthesized bold is wider, breaking column alignment (confirmed in Windows screenshots) | 1.2.0 · `edu_register_model.cpp`, `edu_text_model.cpp` |
| 97 | **Instruction abbreviation expansions**: `edu::mnemonicExpansion()` gives the English expansion of 113 mnemonics (`lui` → Load Upper Immediate). Instructions that are words themselves (add, and, or, nop…) get an empty string. The inspector shows it as one line under the machine-code row | None | No Korean explanation is added (it is the expansion of an English abbreviation) | 1.2.0 · `edu_decoder.cpp` |
| 98 | **Register columns: free width, frozen name columns**: widths are changed by dragging, saved with the window state, and return to the defaults only via presets and Tile. Name and No. are a second view (`frozen_`) using the same model and the same selection, overlaid on the left so they stay visible during horizontal scrolling. The minimum width is name + number | Fixed width (380px); in binary the name column scrolled away | Binary values are 39 characters, so horizontal scrolling is required, and if the names scroll away too you cannot tell which register it is. The radix indicator `[16]` was also removed from the tab title (the column header already says it) | 1.2.0 · `edu_register_view.cpp` |
| 99 | **The 2×2 boundaries move as one**: for the vertical line, the dock layout already moves both rows together; for the horizontal line, `eduSyncSplits()` pins the height of the lower panel in the following column once (`eduHoldDockSize`) to line them up. At the intersection a 12×12 `EduCrossHandle` drags both axes at once. If a panel is closed or floating, it is not a block, so nothing is synchronized | Each column's horizontal line moved independently | Check: `--drag-split vertical|horizontal|cross` covers the three cases and the case with a panel closed. The 50:50 equalization on drop rearrangement is unchanged; the result of dragging a boundary is left alone | 1.2.0 · `edu_cross_handle.*`, `eduSyncSplits` |
| 100 | **File > Load File removed**: the one that remains is `Open` (Ctrl+O), which always reinitializes and then loads. The 3-button "add to current program" dialog was removed along with it | Two items, Load File / Reinitialize and Load File, + a confirmation dialog | In single-file exercises, appending is only a source of duplicate `main` errors. Recent files, the command line, Ctrl+S and the tutorial sample all use the same path | 1.2.0 · `menu.cpp`, `spimview.ui` |
| 101 | **Start screen of the empty editor**: when there is no file, the editor area shows two buttons, [새 파일] (New file) and [파일 열기] (Open file), and one line about Ctrl+S. New file asks Save As first to get a save location and starts with that path (no untitled document is created). No recent-files list is shown | An empty editing window | Lab PCs are shared, so the previous user's paths must not remain | 1.2.0 · `edu_editor_dock.cpp` |
| 102 | **The tutorial borrows the screen and gives it back**: at the start it opens the sample read-only and sets radix (Hex), unit (word), Text display and layout (preset 1) to the defaults. When it ends (by any of the four paths) it restores the settings and closes the editor, going to the start screen | The sample stayed open and editable | The card says "Hex 열과 Decimal 열" ("the Hex column and the Decimal column"); if the screen is in binary, the explanation becomes wrong. Check: section 13 of `check-editor.sh` | 1.2.0 · `eduTutorialTakeSettings`, `eduTutorialFinished` |
| 103 | **The start screen card asks every time**: the splash has two buttons, [튜토리얼 보기] (View tutorial) and [바로 시작] (Start now), and the auto-advance and progress bar were removed. The `Tutorial/Shown` setting and the first-run check were dropped | Closed automatically after 1.5 seconds; tutorial only on first run | On lab PCs only the first user would ever see the tutorial. Default focus is on [바로 시작], and Esc does the same | 1.2.0 · `edu_splash.*`, `main.cpp` |
| 104 | **The spotlight accounts for horizontal scrolling too**: it scrolls the target cell into view in both directions, then maps it to viewport coordinates and clips anything outside the viewport. If it becomes smaller than 8×6px, it is not shown at all | Vertical only | In binary mode it highlighted empty rows or half a cell | 1.2.0 · `edu_tutorial.cpp` |
| 105 | **Panel text size**: Text, Data, Instruction Inspector and Console/Messages each have their own `EduPanelZoom`. Ctrl+= / Ctrl+- / Ctrl+0, Ctrl+wheel, the right-click menu, 8–32pt, a settings key per panel (`Text/FontPointSize` etc.). "All panels text size" in Settings sets them all at once | Only the editor was adjustable | The text inside the inspector also follows the body size (bit numbers only one step smaller) and uses the body color instead of gray | 1.2.0 · `edu_panel_zoom.*`, `edu_instruction_inspector.cpp` |
| 106 | **Flat zip**: `HallymMIPS.exe` sits directly at the root of the archive, and the wrapping folder was removed. The packaging script checks that the exe is at the root and that the top level is not just a single directory | One extra layer: a folder with the same name inside the zip | Explorer's extract creates a folder named after the zip, giving `…-win64\…-win64\HallymMIPS.exe` | 1.2.0 · `tools/package-windows.ps1` |
| 107 | **Horizontal scrolling and frozen columns in three panels**: Text, Data and Registers all show a horizontal scrollbar when content overflows. Text's Source column is not stretched but fitted to its content width (`fitSourceColumn`), so long lines flow to the right instead of being cut off. The frozen left columns are Registers' Name and No. (1.2.0), Data's Address, and Text's BP and Address. The implementation was consolidated into a single `EduFrozenColumns` — a second view over the same model and the same selection model is placed on the left, with vertical scroll, font, column widths and expansion kept in sync. Rows that draw the whole row as one line (segment headers, runs of repeated zeros) **start to the right of the strip** so the frozen strip does not cut their text, and the frozen copy does not draw that text | With no horizontal scrollbar, there was no way to see binary values or original lines with comments. Frozen columns existed only for registers | Why BP and Address in Text: BP is the cell for setting breakpoints so it must be within reach, and Address is the only column that says **which instruction** the row is. With Comments on, Source would push both off to the left. Clicks, double-clicks and right-clicks on the frozen strip are forwarded by `EduFrozenColumns` to the panel's handlers (`--click-bp` now also clicks the strip) **Alignment is guaranteed by the structure (1.2.2)**: the frozen strip does not decide row heights itself — `EduFrozenRowDelegate` (`edu_frozen_columns.cpp:31,38`) leaves painting to the delegate the panel provides and asks the panel for the height, and `sync()` pins the strip's header height to the panel header (`edu_frozen_columns.cpp:172`) and even copies the vertical scroll mode. All three panels scroll vertically per pixel as well (`edu_text_view.cpp:184`, `edu_data_view.cpp:131`, `edu_register_view.cpp:87`). Debug builds warn about misalignment every time the strip is painted | 1.2.1 · `edu/edu_frozen_columns.*`, `edu_text_view.cpp`, `edu_data_view.cpp`, `edu_register_view.cpp` |
| 108 | **The horizontal position belongs to the student**: `scrollTo()` moves both axes and `setCurrentIndex()` scrolls too, so stepping, Go to and model refreshes pushed the panel sideways and the student lost their place. All selection and refresh paths were wrapped in `EduKeepHorizontalScroll` (RAII that restores the value as is, within range). The tutorial is the exception — it has to move sideways to show the cell it points at — but it records the three panels' horizontal positions at the start and restores them at the end. Restoring does not work immediately: after closing the sample and reinitializing, the column widths are decided only at the next layout, and before that the range is 0 so the value gets clamped. So it retries up to 20 times at 10ms intervals | Nothing preserved the horizontal position | Check: `--hscroll-report` moves the three panels to the middle of their range and checks the values through stepping, selection and refresh; `--tutorial-exit` compares the values before and after the tutorial. Section 14 of `check-editor.sh` | 1.2.1 · `edu/edu_view_scroll.*`, `edu_spimview_glue.cpp` `eduTutorialPutScrollBack` |
| 109 | **Start screen buttons and consistent terminology**: the borders of the two buttons are always 2px, and focus changes **only the color** (previously focus added a border that took away that much space from the text, cutting off Korean text on both sides). The two buttons are the same size, matching the wider one (`setFixedSize`). And "투어 / tour" was unified to "튜토리얼 / Tutorial" (both meaning the guided walkthrough) across the app and the guide (including code identifiers; zero remaining) | On focus, `border: none` → `2px`; button sizes varied; the same thing was called by two names, tour and tutorial | In a Windows screenshot, the text of [바로 시작] (Start now) was cut off. With two terms, the guide and the screen read as if they referred to different things | 1.2.1 · `edu/theme/edu_splash.cpp`, all files |
| 110 | **U — Two reasons names and values were on different rows**. (a) 1.2.0: `initFrozen()` gave the frozen strip no delegate, so the panel used the height set by `CompactRowDelegate` (measured 20px) while the strip used the style default (21px, 24px with the user's font) → the gap accumulates row by row. (b) 1.2.1: the strip's geometry was built as `panel viewport height + panel header height` **without matching the strip's own header height**, so the two viewports differed by 3–8px, and in `ScrollPerItem` the offset at the end of the range is computed from the viewport height, so the Text panel went out of alignment near the bottom (measured: `vp=423` vs `420`) | Looking only at symptoms and patching separately per font, radix and reset | Reproduction: `--align-sweep`, over 48 combinations of panel × radix × text size × collapse × scroll × timing × window size, **asks both views, for every pixel row, "which row is at this spot?"**. v1.2.0: 54 register combinations FAIL; v1.2.1: 8 Text combinations FAIL; after the fix 48/48 PASS. Check: section 15 of `check-editor.sh` | 1.2.2 · `edu/edu_frozen_columns.*` |
| 111 | **V — Why a refresh pushed the panel sideways for one frame**: `scrollTo()` moves both axes (`PositionAtCenter` also centers horizontally) and `setCurrentIndex()` scrolls too. As soon as a scroll value changes, `QAbstractScrollArea` blits with `viewport()->scroll()` (`ScrollWindowEx` on Windows), so **restoring the value afterwards cannot cancel a frame that has already been drawn.** Now the three views override `scrollTo()` to call the base implementation inside `EduKeepHorizontalScroll`, and that guard turns off viewport updates (`edu_view_scroll.cpp:22,31`) — `QWidget::scroll()` returns immediately when updates are off, so there is no blit at all, and when the guard is released the whole viewport is repainted. Arrow keys are the exception (`keyNavigating_`): when the selection moves to a column on the right, it must be shown | Restoring afterwards only (1.2.1) | Reproduction: count **how many times a horizontal move happened with updates enabled** in `scrollContentsBy()` (`edu_view_scroll.cpp:64`). This is the definition of "a frame the student saw". 17 times before the fix (`TextSegView +141/−141`, `IntRegView +102/−102` …), 0 after. Check: section 14 of `check-editor.sh`, "not one frame was drawn with a panel moved sideways" | 1.2.2 · `edu/edu_view_scroll.*`, `scrollTo`/`scrollContentsBy` of the three views |
| 112 | **W — Every panel can be read to the end**: all six — Registers, Text, Data, Editor, Console, Messages — are `Qt::ScrollBarAsNeeded` both horizontally and vertically, and `--scrollbar-report` checks that the last column actually comes into view and that Shift+wheel works. We handle Shift+wheel only when the platform does not convert it to a horizontal wheel (`edu_view_scroll.cpp:35`) — cases where a horizontal delta already arrives, and Ctrl (text size), are left alone. Console and Messages wrap lines, so their horizontal range is 0, and that is correct | Shift+wheel did not work in the editor | Check: section 14 of `check-editor.sh` | 1.2.2 · `edu/edu_view_scroll.*`, `edu_code_editor.cpp` |
| 113 | **Y — Panels cannot be pulled out of the window**: `DockWidgetFloatable` was removed from all seven docks (`edu_editor_glue.cpp:193`). The float button, double-clicking the title bar and dragging out of the window all go away. Drop locations are restricted to the one area the layout uses (`edu_editor_glue.cpp:196`). All seven have an entry in the Window menu, so closing is left as is (Editor and Instruction Inspector via `toggleViewAction`). Old settings may contain floating docks, so `eduDockEverything()` docks them all again | Five docks could float | In a student screenshot, the Editor had come loose as a separate window covering Console and Text, and the student could not tell how to put it back. Check: `--dock-report`, section 16 of `check-editor.sh` (0 even after restoring a saveState that contains a floating state) | 1.2.2 · `edu/edu_editor_glue.cpp`, `edu_spimview_glue.cpp` |
| 114 | **X — Assemble is one cycle**: Ctrl+S, F3 and the toolbar Assemble perform "save → reinitialize memory and registers → assemble that file" as one action, and the reinitialization inside the cycle does not print its own line (`eduAssembleCycle` at `menu.cpp:245`). Only one line is left at the end — `p.s assembled (1 breakpoint(s) kept)`. Breakpoints are remembered **by statement, not by address**: it records the source line number that the core keeps for each instruction and the statement text after it (`sourceLineNumber`/`sourceLineStatement` in `edu/core/edu_source_text.cpp`), and after assembling re-sets it on **the nearest line with the same statement**. It follows the statement when lines are inserted above, and silently drops it if the statement is gone. The editor's cursor and scroll and the three panels' horizontal positions are also kept across the cycle | "Memory and registers cleared" piled up on every Ctrl+S, and breakpoints disappeared | **The instruction to "swallow undefined symbol" rested on a wrong premise**: that message comes from **execution**, not assembly (`CPU/run.cpp:240` — `EXPR(inst)->symbol->addr == 0`). Reproduction: `--trigger action_Sim_Reinitialize --run` runs the startup stub's `jal main` with nothing loaded, and that error and its modal appear. So there is nothing to swallow inside the cycle; instead, **only that message when there is no program** is reworded into plain language and written to the message window only (`Error()` in `spimview.cpp`, condition `!eduProgramLoaded`). The simulator's behavior is unchanged, so the goldens are not affected. Save Log File writes only Regs, Text, Data and Console (`file_SaveLogFile` in `menu.cpp`) — Messages is not included, so it is unrelated to the vanilla byte-identity rule (regress re-run passes). Check: section 17 of `check-editor.sh` | 1.2.2 · `edu/edu_editor_glue.cpp`, `menu.cpp`, `spimview.cpp`, `edu/core/edu_source_text.*` |
| 115 | **Z — A third layout: Editor, Text and Data in one place**. Splitting half of a 1920 screen (960px) into two columns leaves each code column 300px wide, and nothing is readable. Layout 2 gathers the three panels into **one tab area**, so Text gets 657px and the registers get their full 380px width (measured: layouts 0 and 1 give text 300 / registers 200). Registers stay on the left, and Console/Messages and Instruction Inspector stay at the bottom. The third item in Window > Layout, `action_Edu_LayoutTabbed` | Only two layouts | **A panel behind a tab cannot show the "Source changed" banner, so a dot (●) is added to its tab.** The dot goes into **the dock's windowTitle** — Qt rebuilds the tab text from the dock title on every re-layout, so text written directly to the tab disappears on the next pass. For the same reason the editor dock title was shortened from "Editor: filename*" to "Editor", and the file name moved to the line below the editor (it was cut off on both sides in the tab). `raise()` alone does not switch tabs: Qt only notices when the z-order actually changes, so nothing happens for a dock that is already on top — `eduBringToFront()` does lower→raise and then tells the tab bar directly. The tutorial brings the panel it points at to the front and restores the tab the student was viewing when it ends. The U and V checks pass in this layout too (a `tabbed` timing was added to the sweep, 54 combinations). Check: section 18 of `check-editor.sh` | 1.2.2 · `edu/edu_spimview_glue.cpp`, `edu_editor_glue.cpp`, `edu_editor_dock.cpp` |
| 116 | **AA — Every run starts from the same screen**: `restoreGeometry()`/`restoreState()` are not called at startup and nothing is saved on exit. The default screen is gathered in one place, `eduApplyDefaultState()` — window size (5/6 of the screen, centered, clamped to 800–1600×600–1000), layout 0, all panels open, radix 16/16, unit word, all Text and Data toggles on, all panel text sizes at default, column widths recomputed (`resetColumnWidths()`), scroll 0, the front tabs (Int Regs, Text, Editor, Console). `readSettings()` calls this function at startup, and **Window > Reset Layout** (formerly "Restore to default", which required a restart) calls the same function. Screen-state keys left by earlier versions are deleted once at startup by `eduForgetScreenSettings()` | State was saved and restored (same as the original QtSpim) | Lab PCs are used by many students in turn. A student who inherits the previous user's layout, zoom and radix thinks they did something wrong — the same reason we decided not to put recent files on the start screen. **Functional settings are kept**: exception handler path, Delayed branches/loads, Mapped IO, Quiet, Accept pseudo, start address, command-line arguments, and the font family and colors in Settings. Panel text size is **split into two values** (item 122): the **base size** chosen in Settings is kept in `Panels/TextSize`, and only the **offset** added with Ctrl+± is discarded between runs. The old `*/FontPointSize` keys are neither written nor read, and are deleted at startup. As a side effect, `eduHoldDockSize()` lets one more layout request through, and `eduApplyLayoutSizes()` retries up to 10 times until the register column gets its full width (or stops improving) — with no saved state, the first layout is the one the student sees. Check: section 19 of `check-editor.sh` | 1.2.2 · `state.cpp`, `edu/edu_spimview_glue.cpp` |
| 117 | **Known weakness — two retry loops that wait for the layout to settle**. `eduTutorialPutScrollBack()` (up to 20 times at 10ms intervals) and `eduApplyLayoutSizes()` (up to 10 times at 10ms intervals, stopping if the register column width stops improving) both rely on "the layout will settle eventually". If the limit is exceeded, **they silently remain in a wrong state** — with the former, the three panels end up to the **left** of where the student left them; with the latter, the layout freezes with **a narrow register column and wide neighboring columns**. Debug builds leave a `qWarning` for each when the limit is exhausted | — | This could break on slow lab PCs or when the layout takes longer than expected. **If the layout looks odd on Windows, look here first.** Structurally, the right approach is to receive a "layout finished" signal and apply once, but Qt's dock layout has no such signal (`resizeDocks()` is only a request, and `QEvent::LayoutRequest` arrives before the dock splitters settle). For now it is only recorded | 1.2.2 · `edu/edu_spimview_glue.cpp` |
| 118 | **Neither the last file nor recent files carry over to the next run** (an extension of AA): `Editor/LastFile` (reopen last file), `Editor/RecentFiles` (Editor > Open Recent) and `FileMenu/RecentFile*` (recent files in the File menu) are neither saved nor read, and the `Editor` and `FileMenu` groups are deleted entirely at startup. Within a session they work as before (in-memory lists `eduEditorRecentFiles`, `st_recentFiles`) | The original QtSpim remembers recent files, and we even reopened the last file | On shared lab PCs, the previous user's file paths remain on the next student's screen. Reopening the last file had one more side effect — **the start screen ([새 파일]/[파일 열기]) introduced in 1.1.0 was in practice only seen on the first run.** Now the only things left in the settings file are the fonts and colors in `[RegWin]` and `[TextWin]` and the functional settings in `[Spim]` (confirmed on an actual file). Check: section 19 of `check-editor.sh` | 1.2.2 · `state.cpp`, `edu/edu_editor_glue.cpp` |
| 119 | **BB — The Text panel's vertical jitter came from full repaints, not scrolling**. The invariant is "one action draws only one vertical position", and the instrumentation looks, per step, at **the sequence of vertical positions drawn** in `scrollContentsBy()` and **what percentage of the panel was repainted** (`--vscroll-report`). Reproduction showed **0** vertical moves per step, but Text and Registers were being repainted **100% on every step**. Three causes: (a) `eduScrollRowOnly()` turned viewport updates off and on with `EduKeepHorizontalScroll`, and `setUpdatesEnabled(true)` calls `update()` on the whole widget — a full repaint every step even when no scrolling was needed (a side effect of the V fix). Now `eduScrollVerticallyTo()` moves **only the vertical scrollbar** and does not touch the horizontal one, so the guard is not needed at all. (b) If `dataChanged` covers **more than one cell, Qt updates the whole viewport** (`dataChanged` in `qabstractitemview.cpp`: only `topLeft == bottomRight` takes the narrow path). Notifying a whole row with one signal was changed to **per-cell** notifications (`EduTextModel::markRowChanged`, `EduRegisterModel::refresh`). (c) The register panel was recomputing `setFont`, `setPalette` and `ResizeToContents` every step — the first two are now skipped when the value is the same, and the header was changed to `Interactive` so that `fitColumns()` computes widths only when the font or radix changes | All three panels were fully repainted on every step | After the fix: stepping in the middle repaints only **9%** of Text (two rows), and a step that needs scrolling draws **only one** vertical position. For the registers, the **bounding box** of the changed rows can be wide, so the percentage can come out large (with 3 scattered rows everything between them is included), but the content drawn is the same, so it is not flicker — the check applies the percentage threshold only to Text. Check: section 20 of `check-editor.sh` | 1.2.3 · `edu/edu_view_scroll.*`, `edu_text_model.cpp`, `edu_register_model.cpp`, `edu_register_view.cpp` |
| 120 | **HH — Reset reloads the program instead of discarding it**. Symptom: with nothing edited, after Reinitialize **"Simulator was reinitialized — save (Ctrl+S) to assemble this file"** appears above Text. The decision is in `eduUpdateStaleBanner()` in `edu_editor_glue.cpp` — the `eduSyncedPath.isEmpty() && eduEverAssembled` branch — because `eduForgetLoadedLabels()` clears `eduSyncedPath` on reinitialization. **The hypothesis that mtime was the cause was wrong**: the file comparison has been a content hash from the start (`eduEditorDigest()`, MD5). The fix changes the behavior, not the text — Reinitialize in the menu goes to `eduReinitialize()`, and if the editor holds a saved file it **clears and then reassembles that file** (it reuses X's cycle minus the save step: breakpoints, cursor and horizontal positions kept, one line in Messages). If the editor is empty or has unsaved edits, it only clears | Reinitialization discarded the whole program | Ctrl+S was already "reinitialize, then assemble", so having only Reinitialize discard the program was inconsistent. Check: section 21 of `check-editor.sh` — 10 Resets give 0 banners and 10 lines in Messages, F5 right after Reset gives "Hello World", breakpoints kept, and editing one character brings the banner back | 1.2.3 · `edu_editor_glue.cpp`, `spimview.cpp` |
| 121 | **The banner above Text appears only when it is true**. The condition is the first match from top to bottom (`eduUpdateStaleBanner()`): <br>① The editor is empty and has no name → **not shown** (the start screen is shown instead) <br>② The simulator does not hold this editor's program and **there are unsaved edits** → "Unsaved changes — save (Ctrl+S) to assemble this file" <br>③ The simulator does not hold this editor's program and it has been assembled before → "Simulator was reinitialized — …" (since HH, the menu Reset no longer causes this) <br>④ The simulator does not hold this editor's program and it has never been assembled → "Not assembled yet — …" <br>⑤ The simulator holds **another file's** program → "Text shows a different program — …" <br>⑥ The editor's content hash differs from what was assembled → "Source changed — …" | Without ②, ③ appeared instead | Why ② was added: when the reinitialization was the student's own action and there is unsaved text, the banner must say exactly "what to do" | 1.2.3 · `edu_editor_glue.cpp` |
| 122 | **GG — A size chosen in the dialog stays; a size increased with keys goes back**: 1.2.2 kept the font family and colors from Settings but overwrote **only the size** with the default on every run, so the value chosen in the dialog seemed to silently have no effect. Now the size is two values — the **base** (`st_panelPointSize`, `Panels/TextSize` in the settings file, set by "All panels text size" in Settings) and the **offset** (`EduPanelZoom::offset_`, Ctrl+±, Ctrl+wheel, not saved). Displayed size = base + offset, and Ctrl+0 resets the offset to 0. Changing the base keeps any zoom in progress. Two more things were fixed along the way: `eduRefreshTextPanel()` was re-applying the Settings font **including its size** to the panel on every refresh, undoing the zoom, and the editor was following the Text panel's zoom and fighting its own Ctrl+± — now the editor takes only the font family from Settings and uses its own base and offset for the size | The size was a single value and went back to the default on every run | The rule students should understand: **what you choose in the dialog stays; what you enlarge with keys goes back the next time you start.** Check: section 22 of `check-editor.sh`, `--panel-size` | 1.2.3 · `edu/edu_panel_zoom.*`, `edu_spimview_glue.cpp`, `state.cpp` |
| 123 | **FF — Only two layouts**: ① Editor \| (Text/Data tabs) — the startup layout, ② Editor, Text and Data **in one tab view**. Mirrored, which swapped left and right, was **deleted** — it taught nothing and only added one more thing to explain. The action names were also tidied up to `action_Edu_LayoutSplit` / `action_Edu_LayoutTabbed` (formerly `LayoutPrimary`/`LayoutMirrored`), and the preset numbers are 0 (split) and 1 (tabbed). Sizes are changed only by dragging — there is no menu to restore the ratios (Window > Reset Layout, which restores the whole screen, is item AA and stays as is) | Three (Primary/Mirrored/tabbed) | Check: section 18 of `check-editor.sh` measures the widths of both layouts at 960×1080, and sections 15, 20 and 24 run in both layouts | 1.2.3 · `edu_spimview_glue.cpp`, `edu_editor_glue.cpp` |
| 124 | **DD — One shape for panel headers**: up to 1.2.2, three kinds were mixed on one screen — ⓐ tabs only (registers, Text/Data), ⓑ title bar only (Editor, Instruction Inspector), ⓒ tabs **on top of** a title bar (the two tabs inside the "Console / Messages" dock). After Y removed floating, ⓑ's title bar held only a name and ✕. Now **every panel uses a single tab strip**: a dock that Qt has grouped with other panels as tabs uses Qt's tab bar, and a dock on its own uses `EduPanelStrip` (a `QTabBar` with one tab) as its title bar widget. Both are `QTabBar`, so the font, height and padding come from one place in the QSS (`QTabBar::tab`). The bottom panel's own two tabs are its strip, so its dock title was removed. ✕ has **one spot at the right end of the strip** — in our strip it is the last widget in the layout, in the bottom panel it is the `QTabWidget`'s corner widget, and since Qt's tab bar has no corner, it is made a child of the tab bar and `eduPlaceTabClose()` puts it at the right end (it is hidden on a leftover bar with no tabs) | Three shapes | **Why this approach**: putting the docks wholesale into our own `QTabWidget` would break the Window menu, the tutorial, and the `tabifyDockWidget`-based layouts (FF). Leaving Qt's tab bar as is and filling only the gaps with the same shape does not conflict with FF. Bonus: the tab text weight was fixed regardless of selection — `QTabBar` computes tab width with the normal font, so a tab that turned bold when selected overflowed its width and had its first and last letters cut off. For long names ("Instruction Inspector"), `StripTabBar::tabSizeHint()` guarantees the text width + padding. Check: section 23 of `check-editor.sh` | 1.2.3 · `edu/edu_panel_strip.*`, `edu_spimview_glue.cpp`, `theme/light.qss` |
| 125 | **EE — Panels cannot be squeezed until they disappear**: every dock gets a minimum size (`kPanelMinWidth` 200 × `kPanelMinHeight` 104 — the tab strip plus about three lines), and `eduSetSplitSizes()`, used by the cross handle, also bounds the splits with those values (previously 120×80). The minimum size of the window itself is 820×560 — any smaller and the six panels cannot keep their minimums | The minimum was 0, so dragging a boundary all the way made the two lower panels disappear | Reproduction: `--squeeze-report` drags the intersection to the four corners and measures the six panels. With the minimums off, 1280×720 gives `intregs 187x584 TOO SMALL`; with them on, both window sizes pass. Check: section 24 of `check-editor.sh` | 1.2.3 · `theme/tokens.h`, `edu_editor_glue.cpp`, `edu_spimview_glue.cpp`, `spimview.cpp` |
| 126 | **CC — The tutorial's last card describes the actual behavior**: "예제는 열어 둘 테니" ("I'll leave the sample open, so…") became untrue in 1.2.0 when the sample started being closed. Now it says, in effect, "when you finish, the sample is closed and you return to the start screen — it has not disappeared; it is your turn". The mentions of left-right swapping (deleted in FF) and Window > Tile were also corrected to the two layouts and Reset Layout | It described the old behavior | The point is that students should not read the sample disappearing as an error. The card still fits inside the window at 1366×768 and 1920×1080 (`--tutorial-report`) | 1.2.3 · `edu_tutorial.cpp` |

**What is not different** (confirmed items only): the whole simulator core (`CPU/` byte-identical, `tools/regress.sh` checks 1, 2, 3),
the Int Regs, Text and Data output of Save Log File (check 4 — byte-identical with the goldens, including the cases of items 17 and 18), the breakpoint dialog (Continue / Single Step / Abort),
the FP Regs tab, menus, shortcuts and the settings dialog.

---

## 13. Instruction decoder (step 4)

`QtSpim/edu/core/edu_decoder.*` — looks only at a 32-bit word (+ optionally the PC) and produces the format, fields, name, and branch/jump destination.
It does not link the core. Comparison against the core is done by `tests/edu_oracle/` (the only binary that links the core).

### 13.1 Format classification (from the word alone)

| opcode | Format |
|---|---|
| 0x00 SPECIAL, **0x1c SPECIAL2** | R |
| 0x02, 0x03 | J |
| 0x10 COP0 | CP0 |
| 0x11 COP1 | FI if the fmt field is 8 (bc1f/bc1t…), otherwise FR |
| everything else | I |

0x1c (`mul`, `clz`, `madd`…) is not in the decision text ("opcode 0→R … everything else→I") but was put in R: its field layout is
rs/rt/rd/shamt/funct, and if it were shown as I, `mul`'s rd and funct would be mashed into an immediate. COP2 (0x12) and COP1X (0x13) are
literally I (an area SPIM does not execute).

### 13.2 Branch destination — in its default mode SPIM differs from the textbook formula

| Delayed Branches setting | Offset the assembler emits | Destination |
|---|---|---|
| off (**QtSpim default**) | (label − PC) / 4 | **PC + (offset << 2)** |
| on (Bare Machine) | (label − PC) / 4 − 1 | PC + 4 + (offset << 2) ← MIPS standard |

Evidence: `CPU/sym-tbl.cpp:258-266` (`if (delayed_branches) val -= 1`), `CPU/run.cpp:104-118` (`BRANCH_INST`: `+4` only for delayed branches).
In other words, **the same source line becomes different machine code depending on the mode.** In the default mode, a branch from `bne` to the instruction two after it
is encoded with offset 2 (it would be 1 on real MIPS). Measured: `[0x00400030] 0x14200002 bne $1, $0, 8 [target-0x00400030]`, target = 0x00400038.
PLAN R3's "destination = PC+4+(imm<<2)" is correct only in Bare Machine mode. The decoder takes a `BranchConvention`
(`SpimNoDelaySlot` / `MipsDelaySlot`) as an argument, and the step 5 UI must pass the one matching the current setting (`delayed_branches`).

Jumps are computed like the core, as `(PC & 0xf0000000) | (target << 2)` (`CPU/run.cpp:442,450`). This differs from the standard `(PC+4)[31:28]`
only when PC is right before a 256MB boundary. When jumping to a label in a different 256MB region, the core only warns and encodes with the upper 4 bits truncated,
and execution also goes to that truncated address (`j l17a` in `tt.core.s`: 0x80000258 → 0x00000258).

### 13.3 Names: only what SPIM can assemble and execute

Of the 291 entries in `op.h` that have an encoding, **the 91 marked MIPS32 Release 2 are all rejected by the SPIM parser**
("not implemented. Instruction ignored"): these tokens appear in `CPU/parser.y` only in 14 `*_REV2` rules,
and those rules all call `mips32_r2_inst()` (`sub.ps` has no rule at all, so it is a syntax error). The decoder also treats them as unknown instructions (`known == false`).
All names of the remaining 200 match.

Where SPIM's encoding differs from the MIPS32 manual, we followed SPIM (since the word the student sees is the one SPIM produced):

| Instruction | SPIM | MIPS32 manual |
|---|---|---|
| `cvt.d.w` | 0x46200021 (fmt = 17, D) | 0x46800021 (fmt = 20, W — the source format is fmt) |
| `rfe` | 0x42000010 | MIPS I only, not in MIPS32 |
| `cop2` | 0x4a000000 + 25-bit argument (treated as J-type) | COP2 general operation |

`0x00000040` is both `ssnop` and `sll $0,$0,1`. The word alone cannot tell them apart, so like the core's decoder we answer `sll`.
`0x00000000` is `nop`, as the core prints it.

### 13.4 Bugs in the core's own decoder (`inst_decode`) — 10 places that differ from ours

`inst_decode()` is used only when `.word` is placed in the text segment (assembled instructions use the struct the parser built as is,
and `run.cpp` executes by internal opcode, so **there is no effect on program execution**). It drops bits when building the lookup key and so misnames the following:

| Actual instruction in the word | `inst_decode()`'s answer | Cause (`CPU/inst.cpp:1167-1184`) |
|---|---|---|
| `bc1fl`, `bc1tl` | `bc1f`, `bc1t` | The COP1 branch key includes only bit 16 (tf) and omits bit 17 (nd, likely) |
| `bc2t`, `bc2fl`, `bc2tl` | `bc2f` | For COP2 only rs goes into the key |
| `cop2` | invalid instruction | Same as above: the rs position is part of the `cop2` argument |
| `movt` | `movf` | The SPECIAL key is funct only; the tf bit in rt is omitted |
| `movt.s`, `movt.d` | `movf.s`, `movf.d` | The COP1 key is fmt+funct only |
| `trunc.w.s` | `suxc1` | `op.h` gave the Release 2 instruction `suxc1` the same encoding (0x4600000d) |

The last row is one of 6 **duplicate encoding** pairs in `op.h`: `floor.w.s`/`prefx`, `trunc.w.s`/`suxc1`, `round.l.s`/`swxc1`,
`trunc.l.s`/`sdxc1`, `lwxc1`/`madd.s`, `ldxc1`/`madd.d`. Which one comes out depends on how `qsort` orders equal keys, so
it can differ between C libraries. The oracle test only reports these cases and does not pin them.

In step 5, the Text panel's instruction names must be taken **from the struct (the one the parser built)**, not obtained by feeding the word to `inst_decode()`.

### 13.5 What the oracle test checks (`tests/edu_oracle/tst_decoder_oracle.cpp`)

1. **All of `op.h`**: for each of the 200 implemented instructions, build a core `instruction` and encode it with `inst_encode()` (30 operand combinations, 5,971 words in total) →
   name, core struct slots (rs/rt/rd/shamt/imm/target/cc) vs. our fields, reassembling the fields = the original word, fields cover the 32 bits without gaps, format rules.
2. **Programs**: assemble `exceptions.s`, `helloworld.s`, `Tests/tt.{core,le,dir,io,bare,alu.bare,fpu.bare}.s` with the core and
   apply the same checks to every instruction in the text segment (8,964) + compare branch/jump destinations with **label addresses from the symbol table** (1,484). Both branch conventions included.
3. **Things it must not know**: unused opcodes, the 91 Release 2 entries.
4. **Differences from `inst_decode()`**: pins the table in 13.4 above. Fails if a new difference appears.

Hand-computed edge values (maximum/minimum imm, negative branches, unresolved `jal 0x00000000`, nop, unknown opcodes, modulo 2^32) are in
`tests/edu_core/tst_decoder.cpp`.

---

## 14. The Text panel after step 5

### 14.1 Structure

```
TextSegDockWidget
└─ EduTextView : QTableView      (in place of textTextEdit in spimview.ui)   edu/edu_text_view.*
     └─ EduTextModel             flat table. 2 header rows + instruction rows          edu/edu_text_model.*
SpimView::eduTextLog : QTextEdit (hidden)  filled only for log saving and printing             textwin.cpp eduFillTextLog
```

The original `textTextEdit` class remains in `textwin.cpp` but is no longer used (to minimize changes to original files).

| Column | Source |
|---|---|
| BP | `inst_is_breakpoint(addr)` — asked on every paint (no cache) |
| Address | the row's address, `edu::hex32Digits` |
| Code | `ENCODING(inst)`, `edu::hex32Digits` |
| Type | `edu::formatOf(word)` — from the word alone (§13.1) |
| Instruction | **the core's `format_an_inst()` string** minus the address, word and comment. `inst_decode()` is not used (§13.4) |
| Source | `SOURCE(inst)` ("line number: original text"), `edu::decodeSourceBytes` |

How the disassembly part is cut out of the `format_an_inst()` output (`disassemblyOf`): the comment is always `"; " + SOURCE(inst)` at the end of the line
(`CPU/inst.cpp:713`), so it is cut off **by length** — unlike the original, it does not search for the first `;`. At the front, everything up to the tab is the address, and the next 12 characters are the word.

At an address with a breakpoint, memory holds a `break` (§2). The model reads the original instruction the same way as the core's `format_an_inst()`
(`CPU/inst.cpp:575-581`): `delete_breakpoint` → `read_mem_inst` → `add_breakpoint`.
This process sets `text_modified`, but at the end of `DisplayTextSegments()` it is reset to `false` exactly as in the original.

### 14.2 Refresh — same points as the original, lower cost

| Trigger | Original | Now |
|---|---|---|
| `DisplayTextSegments(force)` / `text_modified` (Load, Reinitialize, `UpdateDataDisplay` after setting or passing a breakpoint) | Regenerate the whole HTML + `insertHtml` | `EduTextModel::rebuild()` — the same loop (`read_mem_inst` + `format_an_inst`), no HTML parsing. The selected row and scroll position are restored by address |
| `highlightInstruction(PC)` (every step; for Run, every 100,000 instructions) | Regex search over the whole document + ExtraSelection | `setCurrentPc()`: finds the row via a hash and emits `dataChanged` for **only two rows** |
| Setting/clearing a breakpoint | Insert/delete an HTML fragment on that line | `dataChanged` for only that row's BP cell |

Measurements (offscreen, 3 runs, ms — `--time`; includes refreshing the register and Data panels on every step):

| Scenario | Original rendering (f26128f) | Step 5 |
|---|---|---|
| `tt.core.s` 500 single steps | 1213 · 1221 · 1219 | 562 · 570 · 565 |
| `tt.core.s` 1 breakpoint + 60 steps | 173 · 173 · 171 | 121 · 122 · 122 |
| Run of a 6-million-instruction loop | 1551 · 1550 · 1547 | 1545 · 1541 · 1544 |
| `tt.fpu.bare.s` Run | 11 · 10 · 11 | 8 · 9 · 8 |
| `tt.core.s` start + load + exit (wall clock) | 377 · 375 · 379 | 129 · 128 · 130 |

### 14.3 Pseudo expansion groups

A row with `SOURCE(inst) != NULL` is the start of one source line, and the following `SOURCE == NULL` rows are its expansion (§3.4).
Only lines that expand to two or more instructions get a background band (alternating yellow/blue — so that adjacent groups are distinguishable); single-instruction lines are left as they are.
The band color is made by blending into the Text window background color from the settings (the configured font and colors apply as is).

### 14.4 Log saving and printing

`SpimView::textSegmentLogText()` / `printTextSegment()` is the only exit. The HTML built by the original HTML builders
(`formatUserTextSeg` · `formatKernelTextSeg` · `formatInstructions` — unmodified) is inserted into a hidden `QTextEdit`
with `insertHtml`, followed by `toPlainText()` / `print()`. This is what the screen widget used to do, so the output is byte-for-byte the same.
Even if the kernel segment is collapsed on screen, the log contains all of it, as in the original.
Check 4 of `tools/regress.sh` compares against 8 `tests/golden/text-*.txt` files (4 kinds of toggles, breakpoint, after stepping, `tt.core.s`).

### 14.5 Instruction details in the inspector

`edu::instructionDetailLines()` (`edu/core/edu_instruction_text.*`, unit test `tst_instruction_text.cpp`) builds the lines,
and the inspector only displays them. One column per field: bit range / binary / field name / value / meaning (register `$name`, instruction name for opcode and funct,
`x4=` for branch offsets). Writing the value and the meaning on one line as in PLAN's example would make the FR format 51 characters wide, so **it was split into two lines**.

- The branch rule is chosen from `delayed_branches` at run time (§13.2).
- The destination label is `EXPR(inst)->symbol->name`. A branch's `EXPR(inst)->offset` is an internal value, `-pc`
  (`CPU/sym-tbl.cpp:251`), so it is not displayed. If the symbol is not defined (`SYMBOL_IS_DEFINED` is false): `[main: undefined]`.
- Observation: parsing of `Tests/tt.alu.bare.s` ends at the syntax error in `ctc3 $2 $3` on line 1601, so everything after it (including `fail:` on line 1805)
  is not assembled. So `fail` is undefined, and the offset of every `bne … fail` is 0. This is core behavior, so the original is the same
  (console output matches vanilla — `tools/regress.sh` check 3).

---

## 15. The Data panel after step 6

### 15.1 Structure

```
DataSegDockWidget
└─ EduDataPanel : QWidget        (in place of dataTextEdit in spimview.ui)      edu/edu_data_view.*
     ├─ Go to [input] [Go] [$sp]  result display
     └─ EduDataView : QTableView
          └─ EduDataModel        flat table. header rows + word rows + zero-run rows + collapsed rows   edu/edu_data_model.*
SpimView::eduDataLog : QPlainTextEdit (hidden)  filled only for log saving and printing          datawin.cpp eduFillDataLog
```

The original `dataTextEdit` class remains in `datawin.cpp` but is no longer used.

**Row composition is the same as the original** — `edu::layoutMemoryRows()` (`edu/core/edu_memory_rows.*`, unit test `tst_memory_rows.cpp`)
is a direct port of the rules in `SpimView::formatMemoryContents()` (`QtSpim/datawin.cpp`): up to 4 words per 16-byte-aligned row,
a short first row if the range starts in the middle of a row, a single row regardless of length when 4 or more zero words run consecutively from the start of a row
(`[10000000]..[1000ffff]  00000000`), and if a run ends in the middle of a row, the rest of that row is again a short row.
One thing was added: **pinned rows** are shown as word rows even when inside a zero run — so that Go to and value changes can reach addresses inside it.

Segment ranges are also as in the original: User data `DATA_BOT..data_top`, User Stack `ROUND_DOWN($sp,4)..STACK_TOP`,
Kernel data `K_DATA_BOT..k_data_top` (`CPU/mem.h:67-105`).

Values are read with core functions in `refresh()` and stored in the rows: words with `read_mem_word`, halves with `read_mem_half`, bytes with
`read_mem_byte` (`CPU/mem.h:141-143`). **Byte order is not computed** — the core's memory arrays are in host endianness as is
(`CPU/spim.h:38-45`: an endianness different from the host cannot be simulated), and the three functions read aliases of the same array
(`data_seg` / `data_seg_h` / `data_seg_b`). The ASCII column and the Bytes unit are `read_mem_byte` read in ascending address order, so
they are the actual memory order (on a little-endian host the bytes of the word `6c6c6548` are `48 65 6c 6c` = "Hell").

### 15.2 Labels

Three sources are merged (`SpimView::eduCollectLabels()` — when the text segment is redrawn, i.e. after Load and Reinitialize):

1. **`print_symbols()` at the time the file is read** — `eduReadAssemblyFile()` (`QtSpim/edu/edu_loader.cpp`) makes **the same calls, line for line,** as the core's `read_assembly_file()`
   (`CPU/spim-utils.cpp:170-188`), and captures once right before `flush_local_labels()`. All local labels come in here
   (`msg`, and even unreferenced `bytes` and `half`). Both load points, the File menu and the command line, use this function. It is cleared on Reinitialize (`InitializeWorld`).
2. **The current `print_symbols()`** — global labels. The exception handler is read by the core directly (`initialize_world()`), so it is not in source 1, and its global labels come in here.
3. **Labels referenced by instructions** (`EXPR(inst)->symbol`) — the exception handler's local labels (`__m1_` etc.) come in this way.

Capturing is done with the `eduOutputCapture` switch in `write_output()` (`QtSpim/spim_support.cpp`, `// EDU:`), and `edu::parseSymbolListing()` parses the result.

**Evidence that the clone does not diverge from the core** (`tests/edu_loader/tst_loader.cpp`, a test that links the core):
all of `Tests/*.s` + the samples are read, with both the Makefile's flags and the GUI's default mode, by the core loader and by the cloned loader, and then
the instructions (the core's `format_an_inst` lines), non-zero data words, segment bounds, the list of error messages and the post-load symbol table are compared.
The same test also checks that **the number of labels defined in the source = the number of labels captured** (for files where parsing stopped at a syntax error, only up to that line is counted — a label on the error line has already been registered).
At the GUI level, the existing 26 goldens (including right after loading) and 5 new `syntaxerror-*` goldens (a syntax error in the middle of a file: text, data, message log, registers after Run, log — captured with the `stage-6` build, i.e. the core loader)
and `tools/check-menu-load.sh --compare-vanilla` are identical.

### 15.3 Collapsing argv/environment variables — the basis for the boundary

The order in `initialize_run_stack()` (`CPU/spim-utils.cpp:237-270`): from the top of the stack, the environment variable strings, the argv strings → alignment →
`0`, the `envp[]` pointers (**the last one written is `envp[0]`, and its address is `$a2`** — line 261) → `0`, the `argv[]` pointers (`$a1`, line 265) → `argc` (`$sp`).
The GUI's `SpimView::initStack()` reads `$a2` **right after** calling `initialize_stack()` (`eduNoteStackInitialized()`, a one-line `// EDU:` in `menu.cpp`).
The collapsed range is **`[$a2, STACK_TOP)`** = the `envp[]` pointers + all strings. `argc`, the `argv[]` pointers and the `0` at their end stay visible
(the part read by the startup code's `lw $a0 0($sp)` / `addiu $a1 $sp 4`). The argv **strings** (the loaded file path = user name) are on the collapsed side.
The "N bytes" of the collapsed row is `STACK_TOP - $a2`.

### 15.4 Refresh

To the same points as the original — `DisplayDataSegments(force)`, `data_modified` — **the case where `$sp`/`$fp`/`$gp` changed** was added (§12 item 26).
`refresh()` builds a new row list and, if its **shape (kinds, addresses, lengths) is the same** as before, sends **only `dataChanged`** (the usual case during stepping:
selection and scroll kept, only visible cells repainted). If the shape changed (the stack grew, a zero run was broken, collapsing), the model is reset and the selection restored by address.
Collapsed segments (by default: Kernel data) are not scanned. Unlike the table, the inspector's "Pointers" are computed from the **current registers** (since the inspector is refreshed on every run command).

Measurements (offscreen, 3 runs, ms — step 5 build = original Data window):

| Scenario | Original Data window | Step 6 |
|---|---|---|
| `tt.core.s` 500 single steps | 565 · 571 · 580 | 492 · 502 · 501 |
| `data-stack.s` 60 steps (store, push) | 40 · 40 · 41 | 36 · 37 · 36 |
| store loop, 400 steps | 417 · 415 · 411 | 339 · 339 · 338 |
| store loop Run (2.4 million instructions, 600,000 stores) | 631 · 629 · 625 | 626 · 629 · 628 |
| Run of a 6-million-instruction loop | 1544 · 1549 · 1553 | 1552 · 1548 · 1549 |

### 15.5 Log saving and printing

`SpimView::dataSegmentLogText()` / `printDataSegment()` is the only exit. The HTML from the original builders (`formatUserDataSeg` · `formatUserStack` ·
`formatKernelDataSeg` · `formatMemoryContents` — unmodified) is put into a hidden `QPlainTextEdit` with the same calls as the original
(`clear()` + `appendHtml()`). Collapsing, units and pinned rows have no effect on the log (the environment-variable area also appears in full, as in the original).
Check 4 of `tools/regress.sh` compares against 11 `tests/golden/data-*.txt` files (load, Run, binary and decimal, 3 kinds of segment toggles, sample program step/Run, `tt.core.s` 300 steps).

### 15.6 Go to and the inspector

`edu::resolveGoTo()` (unit test `tst_memory_text.cpp`): `$name`/`$number` is a register → a known label → `0x…` or up to 8 hex digits is an address
→ a register name without `$`. (`a0` is the address 0xa0 — the register is `$a0`.) If the target is in a collapsed area it is expanded; if it is inside a zero run, that row is pinned.
An address outside the visible segments (a text label, etc.) gives "No data at …".
Inspector (`edu::memoryDetailLines()`): address | label | segment, Hex / Signed / Unsigned, bit ruler + binary, Bytes (memory order + characters),
Pointers (every general register that points inside that word, in the form `$t0+1`).

---

## 16. The two paths for loading a file, and their checks

| Path | Code | What it does |
|---|---|---|
| Command line (`QtSpimEdu prog.s`) | `QtSpim/main.cpp` — calls `read_assembly_file()` directly after `sim_ReinitializeSimulator()` | Assembles only. Does not touch the recent-files list |
| File > Load File | `SpimView::file_LoadFile()` (`QtSpim/menu.cpp`) | File dialog → path check → `read_assembly_file()` → update recent files → redraw Text/Data/registers. **No Reinitialize** |
| File > Reinitialize and Load File | `SpimView::file_ReloadFile()` | `file_LoadFile()` after `sim_ReinitializeSimulator()` |

`initStack()` uses `st_recentFiles[0]` as argv[0] (`menu.cpp`), so running after loading via the menu **puts the file's absolute path on the simulated stack** —
the command-line path does not. This is why the log goldens (`tests/golden/`) are captured and compared through the command-line path (`--load-cmdline`): with the menu path, the goldens would be tied to the checkout location.

**Up to step 6, all automated checks went only through the command-line path** (`--load` passed the file as a positional argument). `file_LoadFile()`/`file_ReloadFile()` were verified only by the manual checklist.
What changed in the step 6 follow-up:

- The harness's `--load` / `--reload` **trigger the actual QAction** and type the path into the file dialog that the slot opens. Screenshots, speed measurements and check 3 of `regress.sh` go through this path.
- `tools/check-menu-load.sh`: 1 Load, 1 and 2 Reloads, no errors on Load→Reload + the text segment is the same as with a command-line load. Runs in CI.
- `--compare-vanilla` of the same script: `tools/menu-probe.py` builds the same probe (it takes a click sequence from an environment variable, triggers the QActions and prints the message boxes) into **scratch worktrees of vanilla-9.1.24 and HEAD**,
  and compares the message boxes of six click sequences, character for character, in the default settings and in the Bare Machine setting. Runs in CI.

**Pinned as core behavior** (vanilla is the same): loading the same file twice with Load File without Reinitialize gives
`Label is defined for the second time … main:` — because the global labels remain in the symbol table (local labels are removed at the end of the file and do not trigger this, §3.7).
With Bare Machine on, pseudo instructions (`li` etc.) become a `syntax error`, and the label on that line (`main:`) has already been registered, so **a following Load File gives the same "second time" error**.
Bare Machine is saved in the settings file and persists after restart (original behavior).

---

## 17. The editor after step 7

### 17.1 Structure

```
EduEditorDock : QDockWidget  ("EditorDockWidget", Top/Bottom, tabified with Data and Text)      edu/edu_editor_dock.*
├─ EduCodeEditor : QPlainTextEdit   line-number margin, current line, error-line markers, tab = 8 columns (characters unchanged)   edu/edu_code_editor.*
│    └─ EduMipsHighlighter           only colors the tokens from edu::tokenizeMipsLine()
├─ QListWidget "EditorErrorList"     visible only when there are errors. Click = go to that line
└─ QLabel                            "UTF-8   CRLF   Ln 40, Col 1"
SpimView-side wiring: edu/edu_editor_glue.cpp (menu and toolbar items, Assemble, error collection, opening loaded files)
```

`edu/core` (QtCore only, unit-tested):
- `edu_mips_syntax` — one line into tokens. **The list of instructions and directives is `CPU/op.h` itself**: it includes that file with `#define OP(NAME, OPCODE, TYPE, R) {NAME, TYPE},`
  and keeps only the names and kinds (381 entries, including pseudo instructions). So the words the editor colors as instructions = the words the assembler accepts as instructions.
  The identifier rule is `[a-zA-Z_.][a-zA-Z0-9_.]*` from `CPU/scanner.l`, and only `name:` at the start of a line is a label definition.
- `edu_text_file` — bytes ↔ text. Remembers a UTF-8 BOM; UTF-8 if it is valid UTF-8, otherwise CP949, and failing that Latin-1 (every byte round-trips unchanged).
  **Qt's CP949 codec does not count invalid input and `canEncode()` is always true**, so both "is it CP949" and "can this character be written in CP949" are decided by **whether the round trip gives the same result**.
  Saving keeps the encoding, BOM and line endings the file was opened with (new files: UTF-8, no BOM, LF). A file with mixed CRLF and LF is unified to whichever is more common, and the info line says so.
  If you enter characters that cannot be written in the file's encoding and save, it tells you which line and asks whether to save as UTF-8.
- `edu_asm_errors` — parses `spim: (parser) <msg> on line <N> of file <path>` (§4); if the format differs, the original text as is. `resolveMessageLine()` is §12 item 36.

The editor's text is obtained from `QTextDocument::toRawText()` — `toPlainText()` turns non-breaking spaces (U+00A0) into ordinary spaces.

### 17.2 Assemble

`SpimView::eduAssemble()` — Ctrl+S, F3, the toolbar, clicking the banner and Save As all come here (save = assemble, §12 item 40): **save without asking** (only an unnamed new file gets Save As) → put the path in `eduAssembleFile` and
**call the original `file_ReloadFile()` as is**. In one `// EDU:` place, `file_LoadFile()` uses that path instead of the file dialog.
Meanwhile `SpimView::Error()` writes the message to the log (same as the original) and then passes it to `eduCollectError()` instead of showing a modal.
If there are no errors, "Saved and assembled" is shown briefly in the status bar and the Text tab comes forward; if there are, it stays in the Editor with the list, margin markers and a status bar badge ("Assemble failed — N errors. Simulator was reset.").
Either way, `eduSyncedPath` (the file the simulator last received) is updated, which lowers the "Source changed" banner. The banner is also lowered when a file loaded through the File menu is opened in the editor, and it is raised by typing, opening another file, or Reinitialize (`InitializeWorld`).
`tools/check-editor.sh` checks that the text and data segment logs after Assemble are byte-identical to those after Reinitialize and Load File, and that the message log for a file with errors is byte-identical to the File menu path.

Recent files are **two lists**. The original File > Recent Files contains only files loaded by Assemble and File > Load File (original behavior unchanged).
Files the editor opened or saved are kept separately in **Editor > Open Recent** (setting `Editor/RecentFiles`, 8 entries) —
because the original uses `st_recentFiles[0]` as argv[0] of the next run (§16), so if merely opening a file changed the front of that list, the stack contents of the loaded program would change.

### 17.3 When another program changes the file

`QFileSystemWatcher` → after 150ms the file is re-read, and the user is asked **only if it differs from the bytes last read or written** (editors that save by renaming break the watched path, so the watch is re-added every time; our own saves detach the watch briefly).
If "No" is chosen, it does not ask again for that version and leaves the document in the modified state.

---

## 18. 1.0.1 — Screen layout

### 18.1 Inspector height

`EduInspector::setHeightLocked()`: when locked, `body_` gets `setFixedHeight` at the content height; when unlocked, minimum 3 lines and no maximum.
`SpimView::eventFilter` (installed on the main window itself) watches for the moment the splitter is grabbed — QMainWindow receives the mouse events of the splitter (a gap, not a child widget) directly, so
on `MouseButtonPress`, if `childAt(pos) == 0` it is the splitter. Pressing unlocks; on release, if the height changed it is confirmed as the user's size (`eduInspectorSizing(true)`), otherwise it is locked again.
The user-size flag is saved as `MainWin/InspectorUserSized` and applied in `readSettings()` **before `restoreState()`** (if restored while locked, the content height wins).
`--drag-inspector <dy>` in `tools` tests the same path (press/move/release on the main window).

Tried and abandoned: following content changes with `resizeDocks(Vertical)` each time. Qt 5.15's `QDockAreaLayout::resizeDocks` resets the column's width to its sizeHint even for a vertical request,
so the left column widened 401→492px, and when the request came in the middle of the text widget's layout, it was swallowed by the relayout that followed.

### 18.2 Message log

Hiding `ui->centralWidget` (QTextEdit) makes QMainWindow give that space to the dock area (confirmed: Text height 623→950 at 1920×1080).
`eduShowLog()` is called from `SpimView::Error()` — both `error()` and `run_error()` come through there, so both assembly errors and runtime exceptions bring the log back.
The log's minimum height is 120px (without it, the log was squeezed to 71px in the Editor / Text preset).

### 18.3 Side-by-side layout

- `dockOptions`: `AllowNestedDocks | AllowTabbedDocks | AnimatedDocks | GroupedDragging | VerticalTabs` (the original is `ForceTabbedDocks`).
- Dragging out a single tab is done by Qt 5.15's `QMainWindowTabBar` (the symbol exists in `libQt5Widgets.so.5.15`): dragging the tab itself, rather than the tab widget, detaches only that dock.
  A drag without a window manager cannot be reproduced with the offscreen harness, so this is an item to check on a real monitor.
- Presets (`eduArrangePanels`): the three docks are re-added with `addDockWidget(Top)` to take them out of the group; then Tabs does two tabifies, and the others do `splitDockWidget(editor, text, o)` + tabify Data onto Text,
  with `resizeDocks({editor, text}, {1000, 1000}, o)` for half and half (given equal values, Qt matches them as a ratio).
- Window state version 4: a state saved with `ForceTabbedDocks` is discarded once.
- Check: `--layout-report` prints each panel's position and size, whether it is visible on screen (`visibleRegion()`), and the widths of Text's Instruction and Source columns.
  In a 1920×1080 left-right split: Text width 753px, Instruction 191px, Source 319px.

For what can and cannot be done with Qt, see section 6 of `docs/GUIDE-ko.md` and the table in this report.

---

## 19. Step H — Hallym MIPS Simulator (a derivative that changes only the appearance)

`docs/design/tokens.md` is the basis for the design, and items 51–58 of §12 above list where the code changed. Only the structure is described here.

```
QtSpim/edu/theme/
  tokens.h        color (QRgb), font and spacing constants + name table for QSS (kNamedColors)  ← the only source of values
  light.qss       app stylesheet. styleSheet() fills placeholders such as @navy@
  edu_theme.*     apply(): font registration, app font, stylesheet, window icon / codeFont() / toolIcon() / brandPixmap() / showSplash()
  theme.qrc       fonts (4 Pretendard, 2 D2Coding, OFL), icon PNGs (15 kinds × 3 states × 1x/2x), brand PNGs, light.qss — CONFIG += resources_big
  fonts/ icons/lucide/(SVG originals + ISC) icons/png/ brand/(SVG originals, PNG, .ico, .icns, .rc)
tools/make-theme-icons.py   SVG → PNG (colors and sizes are read from tokens.h). The resulting PNGs are committed
tools/capture-theme.sh      mockup captures (H1). devtools --qss --font-dir --ui-font --icon-dir
```

- Application order: in `main.cpp`, `edu::theme::apply(&a)` → splash → create `SpimView`. The settings font default (`state.cpp`) is `codeFont()`, so the first run uses D2Coding, and if the user changes it in Settings, that font.
- Color literal check: in `grep -rn "QColor(\|QFont(\|setStyleSheet(" QtSpim/*.cpp QtSpim/edu`, only token references (`QColor(edu::theme::k…)`, `QColor(k…)`) and conversions of settings values (`QColor(st_…)`) may remain — confirmed 0 hits when H2 was completed.
- Names: `EDU_APP_NAME`/`EDU_TARGET_NAME`/`EDU_SETTINGS_*` in `edu_version.h`. The code identifiers `edu_*`/`EDU_*` are code, not names, so they stay as they are.
- Help collection: `help/HallymMIPS.qhcp`/`.qhp` (namespace `kr.ac.hallym.mips.1.0`); the body `help/manual.html` is the original QtSpim manual as is (§7).
- Comparison images (`docs/images/compare/`): the left half, standard QtSpim, reuses the captures from 1.0.0 as is, and only the right half is re-shot — `tools/make-compare-images.py`.
