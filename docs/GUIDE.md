# Hallym MIPS Simulator 1.0.0 — User Guide

Hallym MIPS Simulator is the Hallym University build of the MIPS simulator **QtSpim 9.1.24 with a
new interface only**. The simulator itself (assembler and execution) is the
unmodified original, so **the same program assembles the same way and produces
the same results as in standard QtSpim.** You can check your work in either.

## 1. Installing

1. Unzip `HallymMIPS-1.0.0-win64.zip` anywhere. (There is an MSI installer too,
   but the zip is recommended: no administrator rights, and removing it is
   deleting the folder.)
2. Run `HallymMIPS.exe`.
3. If "Windows protected your PC" appears, click **More info → Run anyway**. The
   program is not code-signed.

Standard QtSpim may be installed on the same PC. The executable name and the
settings location differ, so neither affects the other.

## 2. The basic loop

1. Write code in the **Editor** tab. (Editor > New / Open; recent files under
   Editor > Open Recent.)
2. **Ctrl+S** saves *and* assembles. F3 and the Assemble tool-bar button do the
   same.
    - On success you are taken to the **Text** tab.
    - On errors you stay in the Editor and the errors are listed below it; click
      one to go to its line. The file has been saved.
3. **F5** runs, **F10** single-steps. Click the BP cell of a Text row to set a
   breakpoint.

An amber strip **"Source changed — save (Ctrl+S) to assemble"** above the Text
and Data tabs means that what you are looking at is not the code in the editor.
Press Ctrl+S or click the strip. You also see it right after starting the
program: the last file is reopened, but nothing is assembled for you.

## 3. What differs from standard QtSpim

In the pictures both programs were given **the same file (helloworld.s), the
same steps and the same window size**: standard QtSpim 9.1.24 on the left,
Hallym MIPS Simulator on the right. The values are the same; only the presentation
differs.

**Registers** — after Run. Grouped by role (Arguments, Temporaries, Saved …),
`$name` and number `R8` together, hex and decimal side by side, what the run
changed in red. Int Regs / FP Regs are **vertical tabs** on the left.

![Registers compared](images/compare/en/01-registers.png)

**Text** — columns: BP (click to set a breakpoint) · address · machine code ·
**type badge (R / I / J …)** · instruction · source. Lines that expand to
several instructions (`li`, `la`) are banded; kernel code is one folded row
(click its header).

![Text compared](images/compare/en/02-text.png)

**Instruction fields** — select an instruction and the Inspector (bottom left)
splits the word into **opcode, rs, rt, immediate (or rd, shamt, funct)**, names
the registers and shows where a branch or jump goes. For a register or a memory
word it shows hex, decimal and binary. Standard QtSpim has nothing like it.

![Inspector compared](images/compare/en/03-inspector.png)

**Data and stack** — address · +0 · +4 · +8 · +C · ASCII · Labels. `.data`
label names, **markers where `$sp` `$fp` `$gp` point**, Words / Half words /
Bytes, Go to (address, label, `$sp`). The **environment area at the top of the
stack is folded**: as the left picture shows, it holds your user name and
folder paths, and this keeps them out of screenshots (click to unfold).

![Data compared](images/compare/en/04-data.png)

**Editor** — edit inside the program, Ctrl+S saves and assembles. Errors come
as a list, with a red marker on each line, instead of one dialog each.

![Editor compared](images/compare/en/05-editor.png)

Also: with a program already loaded, **File > Load File** asks
"**Reinitialize and load / Add to current program / Cancel**" (standard QtSpim
loads on top without asking). An amber status-bar badge shows while a setting
such as Bare Machine is on, and the version is at the right end of the status
bar.

## 4. Good to know

- **Branch offsets differ from the textbook by one.** In its default mode SPIM
  has no delay slots and encodes the offset of `beq`, `bne`, … from the
  **branch's own address (PC)**; textbook MIPS counts from PC+4. The Inspector
  shows the formula it used. Standard QtSpim encodes exactly the same way.
- **Load File is not Reinitialize and Load File.** Load File *adds* to the
  program that is loaded; loading the same file again gives `Label is defined
  for the second time … main`. To reload, use Reinitialize and Load File (or
  Ctrl+S).
- **With Simulator > Settings > Bare Machine on,** pseudo instructions such as
  `li`, `la` and `move` are all syntax errors. The setting survives a restart.
  If the status bar shows an amber "Bare Machine", turn it off.
- Non-ASCII folder names are fine when the Windows system language covers them
  (Korean names on a Korean Windows). Otherwise the simulator cannot open the
  path; the program says so and skips the load. Move the file to an ASCII path.
- A source file is saved in the encoding (UTF-8 or CP949) and with the line
  ends (CRLF / LF) it was opened with.

## 5. Known issues (the same in standard QtSpim)

- A line with a breakpoint looks garbled in the Text log written by **File >
  Save Log File** (`N [x0040002] …`). On screen it is fine.
- Some assembler errors (a constant out of range, for one) are printed in the
  message pane with the number of the **following** line. The editor's error
  list and red markers point at the real line.
- Assembling **stops at the first syntax error** in a file; later errors show up
  once it is fixed.

## 6. Window layout

- **Editor and Text side by side**: Window > Layout.
  - **Tabs** — Editor, Text and Data in one tab group (the initial state).
  - **Editor | Text** — Editor on the left, Text on the right (Data behind
    Text). After Ctrl+S the editor stays where it is; only Text is redrawn.
  - **Editor / Text** — Editor above, Text below.
  - You can also drag a tab and drop it beside, above or below another panel,
    and drop a title bar onto a tab to make it a tab again. The arrangement
    is kept for the next start; Window > Tile restores the initial one.
- **Hiding the message log**: Window > Message Log (**Ctrl+L**). The message
  pane at the bottom goes away and the panels take its room. It comes back by
  itself on an assembler error or a run-time exception.
- **Inspector height**: drag the edge above the Inspector. Until you do, it
  grows and shrinks with what is selected; once dragged, the height is kept
  (Window > Tile gives it back).

Questions and bugs: <https://github.com/ars2323/hallym-mips-simulator/issues>
Developed by Hakhyeon Kim, AIAC Lab, Hallym University. The Hallym University
UI is used under the university's UI guidelines (non-commercial).

SPIM is the work of James R. Larus, distributed under a BSD license. Hallym MIPS
Simulator is a modified version of QtSpim (through QtSpim-Edu) and is not
affiliated with the SPIM project. The bundled fonts Pretendard and D2Coding are
under the SIL Open Font License 1.1 and the Lucide icons under the ISC license
(Help > About > License).
