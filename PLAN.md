# Hallym MIPS Simulator development plan

(Stages 0–8 are the record up to QtSpim-Edu 1.0.1. This repository is a derivative of it, and new work is **Stage H** at the bottom.)

## Goal

Extend QtSpim 9.1.24, which is used in the lab sessions, **leaving the core as it is and changing only the GUI**. Distribute it to students for Windows.

## Settled decisions

| Item | Decision | Rationale |
|---|---|---|
| Base | SPIM SVN r764 = 9.1.24 (tag `vanilla-9.1.24`) | No source changes since the r760 version bump. Identical to the distributed binary |
| Simulator core | Modifying `CPU/` is forbidden | Guarantees execution results identical to standard QtSpim |
| Rendering | **Option B**: replace the three panels' `*TextEdit` (HTML strings) → `QTreeView/QTableView` + models | Needed for row selection, frozen columns, highlighting and linking to the detail panel |
| Qt version | Qt 5.15 (Linux 5.15.3 / Windows 5.15.2) | The original is based on Qt5. A Qt6 port is unrelated to the goal |
| Development environment | Develop on Linux (Ubuntu 22.04); Windows through CI builds + human checks | Build iteration speed |
| Register radix display | The list shows hex + signed dec; binary only for the selected register, in the inspector | See R2 below |
| Editor | A complete built-in editor (including opening/saving/creating new .s files) | User's decision |
| Repository · CI | Private GitHub repository + GitHub Actions (Claude Code creates the repository, pushes and sets up CI with `gh`) | Automating the Windows build |
| Verification approach | Accuracy first: oracle tests + self-checked screenshots + a human check at each stage | See "Verification strategy" below |
| Settings store | Separate the `QSettings` organization/application names as `QtSpim-Edu`/`QtSpimEdu` (original: `LarusStone`/`QtSpim`) | So that the two do not overwrite each other's window layout when used side by side with standard QtSpim. Applied in stage 1 |
| Editor placement | Tabified in the same dock group as Text·Data | In the original, Text/Data are dock widgets, not central tabs (ARCHITECTURE §1.1) |
| Inspector placement | A separate dock below the register dock on the left | So that the R1–R3 details are seen next to the registers |
| Register column placement | Int/FP Regs and the inspector in the **left dock area** (the full window height), the message log below Text/Data | The only layout that shows 47 rows (8 groups + 39 registers) without scrolling on a 1080-line screen (ARCHITECTURE §11) |
| Inspector height and width | Fitted to the content, **minimum 6 lines (register) to maximum 16 lines**, scrolls beyond that. Width is 44 monospace characters | The register list shrinks by as many lines as the inspector uses. 44 characters is the width of the field table for the FI format (`bc1t`) |
| Int/FP vertical tabs | Keep. Add one line about them to the stage 8 student guide | Tabs in the left dock area are vertical (`QMainWindow::VerticalTabs`) |
| Instruction inspector notation | Split the field **value line and meaning line** (`35` / `lw`); the destination is `Dest = …`; jumps get two lines, formula and result. Only the two lines of the branch notice use a proportional font + word wrapping; the field table is monospace | Writing value and meaning on one line makes the FR format 51 characters wide. Stage 5 checkpoint |
| Kernel Text auto-expand | Keep: starts collapsed, expands automatically when the PC enters the kernel | When an exception occurs, the student must see the PC in the handler |
| Text menu toggles | Take effect immediately (in the original, because of an inverted check, they do not take effect until the next full refresh). It is also approved that a log saved right after a toggle differs from the original | ARCHITECTURE §12 items 16 and 17 |
| Clicking the BP cell | Toggling the breakpoint also selects that row (left as it is) | Stage 5 checkpoint |
| Garbled log on breakpoint lines | Left as in the original (`N [x0040002] x3402000 …`). Only the screen is fixed. Listed under "known problems shared with the original" in the stage 8 guide | The principle is that the log is byte-identical to vanilla |
| Save = assemble | **Ctrl+S, F3 and the toolbar Assemble all mean "save, then assemble"**. The menu item is named "Save and Assemble". There is no separate save-only action (Save As also saves, then assembles). An unnamed new file goes through Save As, then is assembled. No confirmation is asked | So students never wonder "I saved it, why didn't anything change?". F3 does not clash with the original shortcuts (F5·Shift-F5·F10) and is the same key as in MARS |
| When assembling fails | The file is left **saved** (the work is preserved). The error list is shown, and because the simulator is reset along the original Reinitialize path, the status bar says "Assemble failed — N errors. Simulator was reset." | So the user can tell why the previously successful program disappeared |
| Out-of-date indicator | If the editor contents have changed since the last assemble, a banner "Source changed — save (Ctrl+S) to assemble" appears at the top of the Text·Data panels. Click = save + assemble. It disappears after assembling | Tells the user, right where they are looking, that the Text/Data being viewed differ from the current source |
| Last file on startup | The editor automatically opens the file it last had open (if the file exists). **It does not assemble automatically** | The simulator state at startup must be the same as in the original. It takes effect when the student presses Ctrl+S |
| Editor recent files | An **editor-only list** under the Editor menu. The original File > Recent Files list is left untouched | The original uses `st_recentFiles[0]` as argv[0] of the next run — if merely opening a file in the editor changed it, the loaded program's stack would differ (ARCHITECTURE §17.2) |
| Line numbers of assembly errors | The error list and line markers are corrected to **the line where the quoted source line actually is**; the message log keeps the number the core reported | The core reports errors such as an out-of-range operand with the line number of the next statement (ARCHITECTURE §12 item 36) |
| Repository visibility | Make the GitHub repository public (Actions are free). An English README at the root (introduction, license, one-line build, "student guide after the release") | The Actions limits for private repositories |
| Version | **1.0.0**. "QtSpim-Edu 1.0.0" in About, the status bar and the zip/MSI names; keep "based on QtSpim 9.1.24" in About. Change only `edu_version.h`; leave `SPIM_VERSION` as it is | Stage 8 |
| Distribution form | **zip (portable) is the default**, MSI is an extra. The guide recommends the zip first | Student PCs may not have administrator rights |
| Code signing | Not done. The guide explains how to get past the SmartScreen warning | Stage 8 |
| Distribution channel | GitHub Releases `v1.0.0` — zip + MSI + guide (PDF·MD) | The repository is public, so a single link is enough for distribution |
| Windows check (stages 3–7) | Done: launching, help, screens, the editor and saving in a folder with a Korean name all work. The Notepad ANSI/BOM round trip is covered instead by the CI unit tests and the `check-editor.sh` results | Checkpoint before entering stage 8 |
| Type badge decision | Decided **from the machine word alone**, not from the `op.h` classification | The format kinds in `op.h` describe operand layout, not the machine-code format (ARCHITECTURE §3.3). `op.h` is used only as an oracle for field values |
| `.data` labels | **Loader mirror**: the GUI reads the file with a procedure that corresponds line for line to `read_assembly_file()`, and **just before** `flush_local_labels()` collects the `print_symbols()` output by capturing `write_output`. Marked explicitly with `// EDU: mirrors read_assembly_file()` | The core removes local labels from the table at the end of the file — after loading, only global labels remain in `print_symbols()` (ARCHITECTURE §3.7, confirmed in stage 6). Verification: goldens byte-identical right after loading; on a syntax error in the middle of a file, the same message and state as vanilla; the number of labels defined in `Tests/*.s` = the number captured; `check-menu-load.sh --compare-vanilla` identical |
| Data panel columns | 7 columns: Address · +0 · +4 · +8 · +C · ASCII · **Labels**. Address is **the row's base address** (a multiple of 16) | A place to write labels and pointers outside the value cells. The column titles +0/+4/+8/+C must match the address (stage 6 checkpoint) |
| Environment fold range | `[$a2, STACK_TOP)`. `argc` and the `argv[]` pointers stay visible | The part the startup code reads must be visible. If the boundary is not a multiple of 16, one row is shown half in each of the two areas; this is left as it is |
| Data panel refresh | At the original's times (`data_modified`) + when `$sp`/`$fp`/`$gp` change | The markers and the start of the stack must follow the registers (ARCHITECTURE §12 item 26) |
| Saving the display unit | The Words / Half words / Bytes choice is saved in the settings | Stage 6 checkpoint |
| Bare Machine indicator in the status bar | A badge in the status bar when a setting that changes how assembling works is on. Reflected immediately when Settings change | Settings persist across restarts. When it is on, pseudo-instructions such as `li` become syntax errors and students suspect their own code |
| Load File confirmation | Pressing Load File while a program is already loaded asks "Reinitialize and load / Add to current program / Cancel". A change to the original behavior | Loading the same file again without Reinitialize gives `Label is defined for the second time … main` (core behavior, identical in vanilla) |
| Assembly error display | Editor path: instead of modal dialogs, an error list (click to go to the line) + line markers in the editor + a count in the status bar. Log window messages as in the original | The original shows one modal per error (ARCHITECTURE §4) |
| Korean paths | **Detect and warn only**, without modifying `CPU/`: for a path that cannot be represented losslessly in the local 8-bit encoding, warn clearly before loading and **skip the load** | The core uses `fopen(char*)`, so the real fix would be modifying `CPU/` (ARCHITECTURE §5). If loading went ahead, `fopen` would fail on a `???` path and a secondary error would appear |
| Help search order | `<executable folder>/help` **first**, then the original three candidates (Program Files / Mac bundle / `/usr/lib/qtspim`) | The distribution must be self-contained. Depending on someone else's installation folder breaks silently when that folder is deleted or updated |
| Windows zip contents | Keep `opengl32sw.dll` (about 20 MB). Code signing in stage 8 | For PCs without a GPU driver |
| Register group titles | Stay in English (Special / Return values / Arguments / Temporaries / Saved / Pointers / Reserved / CP0) | All menus and dialogs are in English |
| CP0 number notation | `$12` format in the No. column. Blank for PC/HI/LO | Matches the `mfc0 $t0, $12` notation |
| Left dock width | Unchanged (a width that fits 4 columns + the 39-character binary in the inspector) | Stage 3 checkpoint |
| Registers > Binary | Keep the original-style behavior where the list's value column widens to 39 characters (32 bits in groups of 4) | The screen and the saved log output must use the same radix |
| Change Value behavior | No "Bad … value" warning on cancel; the value range check is platform-independent (decimal -2147483648 to 4294967295, hex/bin 32 bits) | The original shows the warning even on cancel, and its range depends on the platform's size of `long` |
| Verification procedure | The human check at each stage is done on **Linux**. Windows is checked **once for stages 3–7 together after stage 7 is complete**, and again in **stage 8** | CI runs the Windows build, the unit tests and the zip packaging on every push, so compile problems keep being caught |
| String literals | `-Zc:strictStrings` is turned off because of the core, but new code in `QtSpim/edu/` always takes literals as `const char*`/`QString` | Also recorded in CLAUDE.md |

## Requirements specification

### Common: inspector panel

**A separate dock below the register dock on the left**. Its content changes depending on what is selected.
- Register selected → value details (R2)
- Instruction selected → field breakdown (R3)
- Memory word selected → value details + address + symbol

### R1. Register groups by purpose

`QTreeView`; the groups are top-level items (expanded by default, collapsible).

| Group | Registers |
|---|---|
| Special | PC, HI, LO |
| Return values | $v0–$v1 |
| Arguments | $a0–$a3 |
| Temporaries | $t0–$t9 |
| Saved | $s0–$s7 |
| Pointers | $gp, $sp, $fp(=$s8), $ra |
| Reserved | $zero, $at, $k0, $k1 |
| CP0 | Status, Cause, EPC, BadVAddr |

- Columns: `name ($t0)` · `number (R8)` · `Hex` · `Dec`
- **Highlight registers whose value changed**. Basis: the difference between a snapshot taken **when an execution command (Step/Run/Continue etc.) starts and the point where execution stops**.
  The snapshot is reset on Reinitialize/Load. Values the user changed directly are not highlighted.
  (The original compares against "the previous screen refresh", so after a single Run the whole difference between start and end is highlighted — ARCHITECTURE §2.2)
- Keep the original's register value editing (double-click/right-click → enter a value)
- FP register tab: kept as in the original within this scope (items to consider later are in `docs/FUTURE.md`)

### R2. Multiple radix display

Showing 32 binary digits on 32 rows at once is more than the panel width can take, and what is actually needed is the one "register being looked at right now", so the display is split as follows.

- **List**: `0x` + 8 hex digits (zero-padded) · signed decimal
- **Inspector** (selected register):
  - hex, signed dec, unsigned dec
  - 32-bit binary, a space every 4 bits, a bit-number scale (31 … 0)
  - The original's radix options in the Registers menu (Binary/Hex/Decimal, **they exist** — ARCHITECTURE §6.1): wired so that they act as a column in the selected radix in place of the list's Hex column. The Data Segment menu has the same options separately

### R3. Instruction type + machine-code field breakdown

Text panel columns: `BP` · `address` · `machine code (hex)` · `type` · `actual instruction` · `source (line number: original text)`

- Type badge: **R / I / J**; coprocessor instructions are shown as **FR / FI** (following the P&H green card), CP0 instructions as **CP0**
  - **Decided from the machine word alone**: opcode 0 **and 0x1c (SPECIAL2: `mul`, `clz`, `madd`…)** → R, 2·3 → J, 0x10 → CP0, 0x11 → FI if the fmt field is 8, otherwise FR, everything else → I
  - The format kinds in `op.h` (`R3_TYPE_INST` etc.) classify operand layout, so they are not used to decide the badge. `op.h` is used only as a **field-value oracle**
- Instructions that come from the same source line (pseudo expansion) are shown as a group with a background (`SOURCE(inst) != NULL` starts a group — ARCHITECTURE §3.4)
- The Kernel Text Segment is shown by default as a single collapsed group row and can be expanded. The original's display toggle menu is kept
- Inspector (selected instruction):
  ```
  lw $4, 0($29)                         I-type
  0x8fa40000  at 0x00400000
  31  26 25-21 20-16 15             0
  100011 11101 00100 0000000000000000
  opcode rs    rt    immediate
  35     29    4     0
  lw     $sp   $a0   0x0000
  ```
  - The branch destination **formula depends on SPIM's mode** (ARCHITECTURE §13.2):
    - Default mode (Delayed Branches off): `Dest = PC + (offset×4) = <address> [<label>]` + one line of notice
      "SPIM 기본 모드는 지연 분기가 없어 PC 기준으로 인코딩합니다. 교재의 MIPS(PC+4 기준)와 offset 값이 1 다릅니다." ("SPIM's default mode has no delayed branches, so it encodes relative to PC. The offset value differs by 1 from the textbook's MIPS (relative to PC+4).") (shown together with the English).
      This notice is the only exception where Korean appears in the UI (to explain things to students)
    - Bare Machine (Delayed Branches on): `Dest = PC + 4 + (offset×4)`, no notice
  - Jumps: destination = `(PC & 0xf0000000) | (target<<2)` (the core's method), plus the corresponding label. Unresolved symbols (e.g. `jal 0x00000000 [main]` when no file has been loaded) are also shown exactly
  - `0x00000040` is shown as `sll` (same as the core; it cannot be told apart from `ssnop`)
  - **Instruction names and disassembly strings come from the core's structures (the disassembly path)**. The word is not reinterpreted with `inst_decode()` (that function gives the wrong name for 9 instructions — ARCHITECTURE §13.4). Type and fields come from `edu_decoder`
  - R-type: funct name, shamt

### R4. Built-in editor

- `Editor` is **tabified in the same dock group as Text·Data** (in the original, Text/Data are dock widgets, not central tabs — ARCHITECTURE §1.1)
  - In the startup state, before a file is loaded, the Editor tab is active
  - A Window menu item to reopen the Editor
- New / Open / Save / Save As (`.s`, `.asm`), **editor-only** recent files — all in the Editor menu
- Line numbers, MIPS syntax highlighting (directives, instructions, registers, labels, comments, strings, numbers)
- A modified indicator; confirmation on New/Open/Close with unsaved changes (assembling saves without asking)
- **Save and Assemble (Ctrl+S = F3 = toolbar)**: save without confirmation (Save As only for a new file with no path) → call the original "Reinitialize and Load File" path unchanged → **on success, switch to the Text tab; on failure, stay in the Editor and mark the error lines**
  - The core reads files, so the editor always saves the file before loading it (no core change needed)
- Assembly errors → **instead of modals**, an error list (click to go to the line) + line markers in the editor + a count in the status bar. Log window messages stay as in the original.
  The error message format is `spim: (parser) <msg> on line <N> of file <path>` + the source line + a caret (ARCHITECTURE §4)
- Detect when an external program changes the file and ask whether to reload it
- Encoding: saves as UTF-8 by default, supports opening CP949 files, preserves the line-ending style
- Korean paths: warn clearly, before loading, about a path that cannot be represented losslessly in the local 8-bit encoding (no `CPU/` change; implemented in stage 2)
- Out of scope: linking several files into one program, showing the currently executing line in the editor → `docs/FUTURE.md`

### R5. Data / stack viewer

`QTableView`

- Columns: `address` (the row's base address) · `+0` · `+4` · `+8` · `+C` · `ASCII` · `Labels`, frozen header
- The exact address of each cell can be checked in a tooltip/the inspector
- Show `.data` labels on the row of their address — with the loader-mirror approach (decision table, "`.data` labels"), collect the labels, local ones included, **at the time the file is read** and build an address→label table. The rules for parsing the `print_symbols()` output are pinned down by unit tests (ARCHITECTURE §3.7)
- Markers on the rows that `$sp`, `$fp` and `$gp` point to
- **The argv/environment-variable area at the top of the stack is collapsed by default** — shown as a single line "Environment variables: N bytes (expand)", which can be expanded. This keeps user names and paths from being exposed when students submit screenshots. Printing and saved log output stay as in the original (not collapsed)
- Display unit: word / halfword / byte (saved in the settings)
- Navigation: jump by entering an address, label or register name; a "Go to $sp" button
- Segment selection: User data / Stack / Kernel data
- The ASCII column is shown in actual memory byte order, after checking the core's byte order (endianness)
- Keep the original's memory value editing

## Verification strategy (accuracy first)

1. **Oracle tests — decoder**: we do not make the correct answers ourselves; we take them from the core.
   - Walk the whole instruction table in `CPU/op.h` and check that each instruction's encoding format matches our type classification
   - Break the words the core encoded into fields with our decoder → check that they match the fields of the core's instruction structure (opcode, rs, rt, rd, shamt, imm, target)
   - Reassemble the fields our decoder produced → check that they match the original word bit for bit
   - Input: all of `Tests/tt.*.s` + boundary values (maximum/minimum immediate, negative branch offsets, unresolved jumps)
2. **Unit tests — formatter**: hex/dec (signed and unsigned)/bin display of boundary values such as 0, 1, -1, INT32_MIN, INT32_MAX, 0x80000000, 0xFFFFFFFF
3. **Regression**: compare the output of running the `Tests/` programs on the original build and on our build (confirms the core is unmodified) — `tools/regress.sh`
4. **Printing and saving the log**: the original uses the widgets' `toPlainText()`/`print()` directly (ARCHITECTURE §6.5). Each stage that replaces a panel also builds a text generator, and **the saved log output must be byte-for-byte identical to the original**. A comparison against vanilla is added to the regression script (completion condition for stages 3, 5 and 6)
5. **Self-checked screenshots**: offscreen capture with the harness in `tools/` (load file → N steps → capture panel); Claude Code checks the images itself — `tools/capture-panels.sh`
6. **Human checkpoints**: at each stage, a check on a real monitor (Linux). The Windows zip check is done in one batch after stage 7 is complete (all screens of stages 3–7 + saving/opening with Korean paths, CRLF, CP949 files) and in stage 8 (decision table, "Verification procedure")

## Stages

At the end of each stage, a human check (Linux), then a `stage-N` tag. Windows is checked after stage 7 is complete and in stage 8.

### 0. Reproducing the original ✅
- [x] r764 export, `vanilla-9.1.24` tag
- [x] Linux build; confirmed About shows 9.1.24 and helloworld.s runs
- [x] Changed the `.pro` so that the help collection generation rule does not write into the source tree (`QtSpim/help/`). Completion condition: `git status` clean after `make`, the help window works

### 1. Groundwork ✅ (`stage-1`)
- [x] **Code survey → `docs/ARCHITECTURE.md`** (with file:line evidence)
  - Rendering paths and refresh times of the three panels (call flow on step/run/reset)
  - Core access paths: register array, text segment and instruction structure, instruction encoding function, disassembly function, memory reads, symbol table
  - Assembly error message format and output path
  - Encoding when a QString file path is passed to the core
  - **Preserved features table**: complete list of the original's menus, right-click actions and dialogs
- [x] **Branding**: `edu_version.h` (`9.1.24-edu.N`), window title, a modified-version notice in About (original copyright notice and LGPL text kept), executable name `QtSpimEdu`, separate settings store
- [x] **Test infrastructure**: `tests/` Qt Test project, confirmed working with one first test
- [x] **Screenshot harness**: a command-line mode enabled only by a development build option (`CONFIG+=edu_devtools`) — `--load <file.s> --steps N --capture <panel> --out <png>` (+ `--run`, `--dump console|log|regs`)
- [x] **Regression script**: compares the run output of the vanilla build and the current build — `tools/regress.sh`

### 2. Windows pipeline ✅ (`stage-2`)
- Create a **private** GitHub repository (`gh repo create --private`), push the `main` branch and the tags. `gh` and `git` are already authenticated on the development PC
- CI (GitHub Actions `windows-2022`): Qt 5.15.2 msvc2019_64 (aqtinstall) + winflexbison → qmake → build → `windeployqt` → zip artifact
- Check and fix the bison/flex invocation paths for Windows in the `.pro`
- Put a Linux build + `make check` + `tools/regress.sh` in the same workflow, run on every push
- Help must open when running from the unpacked zip (help files and assistant bundled)
- Korean path warning (decision table, "Korean paths")
- Of the `QtSpim.exe` hard-coding in `bin/release-*` and WiX, fix only what the zip distribution needs; the rest in stage 8
- Human check: unpack the zip and run it; About, helloworld, loading a .s file from a Korean path

### 3. Register panel (R1, R2) ✅ (`stage-3`)
- `edu/core` formatter + tests
- Replace with a register model/`QTreeView`, groups, change highlighting
- Introduce the inspector dock (register details)
- Preserved features: value editing, radix options, register output in printing/the log — the saved log is byte-identical to the original (added to the regression script)

### 4. Instruction decoder (no UI) ✅ (`stage-4`)
- `edu/core/decoder`: 32-bit word → format, fields, name, branch/jump destination
- Completion condition: all oracle tests pass

### 5. Text panel (R3) ✅ (`stage-5`)
- Replace with a model/`QTableView`, type badges, pseudo groups, Kernel folding
- Add the instruction field breakdown to the inspector. Change the inspector height to "fitted to the content depending on what is selected, at most N lines"
- Preserved features: setting/clearing breakpoints, current PC highlight, User/Kernel toggle, printing and saving the log (byte-identical, added to the regression script)

### 6. Data/stack panel (R5) ✅ (`stage-6`)
- Model/`QTableView`, label and pointer markers, unit switching, navigation
- Preserved features: memory value editing, segment display options, printing and saving the log (byte-identical, added to the regression script)

### 7. Editor (R4) ✅ (`stage-7`)
- Editor dock (tabified with Text·Data), file I/O, syntax highlighting, Assemble wiring, error list + go to line + count in the status bar, detection of external changes
- Round-trip tests of files with Korean comments (UTF-8/CP949, CRLF)

### 8. Release ✅ (`v1.0.0`)
- WiX MSI: new ProductName, **new UpgradeCode**, separate installation path, `.s` association off by default — coexists with standard QtSpim
- A student guide (one page on what differs from the original) — material from ARCHITECTURE §12. Includes one line saying that Int/FP Regs are vertical tabs.
  "Known problems shared with the original" item: a line with a breakpoint looks garbled in the saved log (same as in the original)
- `1.0.0` release: zip (default) + MSI + guides (`docs/GUIDE-ko.md`, `docs/GUIDE.md`, PDF) on GitHub Releases
- What was left out of scope is in `docs/FUTURE.md`

## Stage H — Hallym MIPS Simulator (derivative for Hallym University)

The repository `ars2323/hallym-mips-simulator`, split off from QtSpim-Edu 1.0.1 (`v1.0.1`). Layout, features and core stay the same; **only the appearance** changes. The rules of stages 0–8 (CPU/ unmodified, the preserved features table, the verification procedure, the saved log byte-identical) still apply.

### Settled decisions

| Item | Decision | Rationale |
|---|---|---|
| Name | Display name "Hallym MIPS Simulator", executable and settings folder `HallymMIPS`, Korean name "한림 MIPS 시뮬레이터" (Hallym MIPS Simulator; in the guides only). QtSpim/Spim/Edu names remain only in the original notices in the About → License tab and the LICENSE file | User's instruction |
| CI assets | `assets/ci/A1~A4` (the original zips are kept in `~/workspace/hallym-ci/`); the manual's images and rules are in `assets/ci/manual/`. No alteration, only scaling and margins. The app icon uses only the basic form of the symbol | At 16 and 32 px the emblem and the signature lose their shape (`docs/design/mockups/icon-sizes.png`) |
| Colors | 2945 → #0055A5, 326 → #00A9A5, 281 → #00205B, Cool Gray 4 → #BCBEC0. The CMYK spot color definitions in the `.ai` files are recorded in `docs/design/tokens.md` §1.1 | The pages give no HEX values |
| Fonts | UI Pretendard, code D2Coding (first choice) / JetBrains Mono (alternative), all bundled as resources under the OFL | Identical rendering on Windows/Linux |
| Icons | Lucide (ISC) SVG 20px, default 281 / hover 2945 / disabled Cool Gray 4 | Replace all bitmaps |
| Mockup procedure | **Widget code is changed only after the user has seen the H1 mockups (QSS, fonts and icons only) and chosen A or B** | User's instruction |
| Repository | Public, history and tags kept. The original qtspim-edu is only read | |
| Mockup | **A "Campus"** + B's table header (no column separators, only a 1px line underneath) | User's choice, 2026-09-22 |
| PC row / selected row | PC row = 2945 tint #E8F0F9 + a 3px 2945 bar on the left. Selected row = darker tint #D3E2F3 + navy text. **A dark blue fill with white text is not used.** Both PC and selected = bar + darker tint | tokens.md §7 ① |
| Changed values | Text color #00736F + SemiBold, no background | §7 ② |
| Code font | Only D2Coding is bundled. JetBrains Mono removed | §7 ③ |
| 1366×768 | Scrolling allowed. No automatic collapsing of groups or the inspector | §7 ④ |
| Gray | The UI uses Cool Gray 4 #BCBEC0; the inside of emblem C (Cool Gray 7) stays as in the original | §7 ⑤ |
| Type badges | Light background + dark text, 4px rounding, 11px SemiBold. R #E8F0F9/#0055A5, I #E6F6F5/#00736F, J #FDF3E1/#8A5A00, CP0/FR/FI in the gray/navy family | H2 instruction |
| Pseudo group band | #F5F7FA background + a 2px #BCBEC0 line on the left | |
| Editor | Current line #F5F7FA, line numbers #8A94A0, error marker in the margin as a #C0392B dot. Syntax: directives 2945, instructions 281 Medium, registers #00736F, labels 281 SemiBold, comments #8A94A0 italic, strings #8A5A00, numbers #6B4C9A | |
| Data | $sp/$fp/$gp markers #E6F6F5 background + #00736F text, label column 2945 | |
| Log window | Body text #2B3440, errors #C0392B, white background, D2Coding 10pt. The original HTML's Courier and color tags are replaced with tokens — on screen only; the saved file stays byte-identical | |
| Status bar badges, banner, error list | The widgets' own style sheets are rewritten with tokens. Banner: #FDF3E1 background + #8A5A00 text | |
| Rows and titles | Code table rows 20px, dock titles 32px + 4px between the title and the header | |
| Toolbar | Assemble = icon + text primary button (2945 fill, white text, 6px rounding, 28px high). The rest are icon only. Separators split it into three groups: file / run / help | |
| About | Emblem A + logotype + version + License tab (original notices, Qt LGPL, font and icon licenses). "Hallym MIPS Simulator 1.0.0" on the right of the status bar | |

### H0. Repository ✅
- [x] clone (history kept) → `gh repo create ars2323/hallym-mips-simulator --public`, push main + tags, first CI run green
- [x] Updated CLAUDE.md and PLAN.md
- [x] `.ai` → PDF/SVG/PNG (Ghostscript + pdftocairo): `assets/ci/converted/` (whole pages), `assets/ci/marks/` (symbol basic form and applied form; logotypes in Korean / Korean–English / vertical / English one-line and two-line / Hanja; emblem A (2 variants), B and C; signatures: 4 horizontal, 8 stacked (A/B), 2 vertical)
- [x] Recorded the color rationale, bundled the fonts and icons (`QtSpim/edu/theme/fonts`, `theme/icons/lucide`)

### H1. Design system — awaiting mockup approval
- [x] Draft of `docs/design/tokens.md` (quotations of the rules, color rationale, contrast table, typography, spacing, badges, syntax highlighting)
- [x] devtools `--qss --font-dir --ui-font --icon-dir`, `tools/capture-theme.sh`, `tools/make-theme-icons.py`
- [x] Mockups A "Campus" / B "Studio", 3 captures each + 1366×768 → `docs/design/mockups/`
- [x] Human checkpoint: A chosen + §7 decisions (2026-09-22)

### H2. Implementing mockup A ✅ (`v1.0.0`)
- [x] Replace the colors in the code across the board (everything listed in tokens.md §6) — decision table above. Widgets that QSS does not reach go through the `applyPanelFont()`/`setPalette` path
- One QSS file (`QtSpim/edu/theme/light.qss`) + a token header (`theme/tokens.h`). All hard-coded color and font literals become tokens; grep finds 0 remaining `QColor(`/`QFont(`/`setStyleSheet(` literals
- Branding: app icon (16·32·48·256 .ico/.png/.icns), window title, taskbar, splash (signature, 1.2 seconds, closes on click), About (emblem A + logotype + "Hallym MIPS Simulator 1.0.0" + License tab), settings store `HallymMIPS/HallymMIPS`, executable `HallymMIPS`, new MSI ProductName/UpgradeCode, installation path `Program Files\Hallym MIPS Simulator`
- Printing and saving the log stay byte-identical to the original (`regress.sh`)
- Captures: the same state as the mockups at 1920×1080 + 1366×768, plus one each of the change highlighting after Run, the error list, the Data markers, the splash and About. Open and check them directly; report where original colors remain
- Remove the QtSpim/Spim/Edu names from the screens, documents and file names (except the original references in the License tab, LICENSE and ARCHITECTURE); grep leaves 0. 0 hard-coded color/font literals
- `regress.sh`, `check-menu-load.sh`, `check-editor.sh` and the unit tests pass. Saved log and printing byte-identical
- Documents: remove the QtSpim/Edu names from GUIDE-ko/GUIDE and the README (except the license section). The five comparison images get the label "Hallym MIPS Simulator" on the right and keep "표준 QtSpim" (standard QtSpim) on the left
- `docs/ARCHITECTURE.md` §12 gets this derivative's differences (name, settings store, theme)
- [x] Startup screen (splash), app icons per size (16 symbol / 24+ emblem), window title, AppUserModelID
- [x] First-run tutorial in 7 steps (Korean/English, rerun from Help > Tutorial), elided dock tab titles
- Human checkpoint (Linux·Windows) → tag `v1.0.0`, release

## Undecided

(None — H1 §7 is reflected in the decision table above. Remaining ideas are in `docs/FUTURE.md`)
