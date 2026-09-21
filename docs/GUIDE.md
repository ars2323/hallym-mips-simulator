# QtSpim-Edu 1.0.0 — User Guide

QtSpim-Edu is an educational build of the MIPS simulator **QtSpim 9.1.24 with a
new interface only**. The simulator itself (assembler and execution) is the
unmodified original, so **the same program assembles the same way and produces
the same results as in standard QtSpim.** You can check your work in either.

## 1. Installing

1. Unzip `QtSpimEdu-1.0.0-win64.zip` anywhere. (There is an MSI installer too,
   but the zip is recommended: no administrator rights, and removing it is
   deleting the folder.)
2. Run `QtSpimEdu.exe`.
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

A yellow strip **"Source changed — save (Ctrl+S) to assemble"** above the Text
and Data tabs means that what you are looking at is not the code in the editor.
Press Ctrl+S or click the strip. You also see it right after starting the
program: the last file is reopened, but nothing is assembled for you.

## 3. What differs from standard QtSpim

| Where | QtSpim-Edu | Standard QtSpim |
|---|---|---|
| Registers (left) | Grouped by role (Arguments, Temporaries, Saved …), name `$t0` and number `R8` together, hex and decimal side by side. Int Regs / FP Regs are **vertical tabs** | One flat list, tabs on top |
| Inspector (bottom left) | Select a register, an instruction or a memory word: hex, signed and unsigned decimal, binary with a bit ruler | — |
| Text | Columns: BP · address · machine code · **type badge (R / I / J …)** · instruction · source. Selecting an instruction shows its **opcode, rs, rt, rd, shamt, funct, immediate fields** and the branch / jump destination. Lines that expand to several instructions (`li`, `la`) are banded. Kernel code is folded (click its header row) | Plain text |
| Data | Address · +0 · +4 · +8 · +C · ASCII · **Labels**. `.data` label names, **markers where `$sp` `$fp` `$gp` point**, Words / Half words / Bytes, Go to (address, label, `$sp`). The **environment area at the top of the stack is folded**: it holds your user name and folder paths, and this keeps them out of screenshots | Plain text, environment visible |
| Editor | Edit inside the program, syntax colours, error list | — (edit elsewhere, then Load) |
| File > Load File | With a program already loaded it asks **"Reinitialize and load / Add to current program / Cancel"** | Loads on top without asking |
| Status bar | A yellow badge while a setting such as Bare Machine is on; the version at the right | — |

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
  If the status bar shows a yellow "Bare Machine", turn it off.
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

Questions and bugs: <https://github.com/ars2323/qtspim-edu/issues>
SPIM is the work of James R. Larus, distributed under a BSD license. QtSpim-Edu
is an unofficial modification and is not affiliated with the SPIM project.
