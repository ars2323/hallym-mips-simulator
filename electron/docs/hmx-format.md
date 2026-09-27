# The executable image format (.hmx), version 1

This document is the reference for `.hmx` files. Hallym MIPS (2.4.0 and later) writes them; Hallym Circuit Studio reads them. Where the program and this document disagree, this document is right and the program is wrong.

## What it is, and why

An `.hmx` file is a MIPS program **after assembly**, written out as memory. It holds the instruction words of the text segment, the bytes of the data segment, the address to start at, the stack and global pointers, and the program's labels. A program that runs MIPS code, such as a CPU built in Circuit Studio, can load it and start at once, without an assembler of its own. It then runs exactly the words Hallym MIPS assembled, including every pseudo-instruction expansion.

It is an **executable image**, not an object file. Every address is final: there is nothing to relocate and nothing to link. That is also why it is not called `.o`.

The format is plain text, one item per line, so a student can read it next to the Text panel and a reader takes a few dozen lines of code.

In Hallym MIPS: assemble (Ctrl+S), then click **Export executable image (.hmx)** (the icon in the title bar's right-hand group). The file is saved where you choose; the dialog offers `<name>.hmx` next to the source.

## An example

The program ([`data.s`](../tests/hmx/data.s)):

```asm
# .data used through la and lw: sums an array of words and prints a string.
        .data
msg:    .asciiz "sum = "
        .align 2
nums:   .word 3, 5, 7, -1
count:  .word 4
        .text
        .globl main
main:   la    $s0, nums
        lw    $s1, count
        li    $t0, 0
next:   lw    $t1, 0($s0)
        add   $t0, $t0, $t1
        addi  $s0, $s0, 4
        addi  $s1, $s1, -1
        bnez  $s1, next
        la    $a0, msg
        li    $v0, 4
        syscall
        move  $a0, $t0
        li    $v0, 1
        syscall
        li    $v0, 10
        syscall
```

Its image, as Hallym MIPS writes it with its default settings ([`data.hmx`](../tests/hmx/data.hmx)):

```text
HALLYM-EXEC 1
source        data.s
source-sha256 36d94771763ea32a07eff0bee79c21ee26903dfb5ff624fee96dd34585392a83
produced-by   Hallym MIPS 2.3.0
assembled     2026-09-27T19:05+09:00
endian        little

entry         0x00400024
reg $sp       0x7fffffe4
reg $gp       0x10008000

symbol main   0x00400024
symbol next   0x00400038
symbol msg    0x10010000
symbol nums   0x10010008
symbol count  0x10010018

.text 0x00400000 words 27
8fa40000
27a50004
24a60004
00041080
00c23021
0c100009
00000000
3402000a
0000000c
3c011001
34300008
3c011001
8c310018
34080000
8e090000
01094020
22100004
2231ffff
1620fffc
3c041001
34020004
0000000c
00082021
34020001
0000000c
3402000a
0000000c

.data 0x10010000 bytes 28
73 75 6d 20 3d 20 00 00 03 00 00 00 05 00 00 00
07 00 00 00 ff ff ff ff 04 00 00 00
```

Here:
- The first nine words (`0x00400000`–`0x00400020`) are the **start-up code**. It comes from the exception handler's file, whose label `__start` is where SPIM itself begins: it passes `argc`, `argv` and `envp` to `main`, calls it, and exits.
- `entry` is `main`, right after those nine words.
- `la $s0, nums` became `lui` + `ori` (`3c011001 34300008`), and `lw $s1, count` became `lui` + `lw` (`3c011001 8c310018`).
- In `.data`, `msg` takes 7 bytes and one byte of padding follows (`.align 2`). The words are then in memory order: little-endian, so `3` is `03 00 00 00` and `-1` is `ff ff ff ff`.

## Lines

The file is UTF-8 text. Lines end in LF; a reader also accepts CRLF. On every line, leading and trailing blanks are ignored; items on a line are separated by one or more spaces or tabs.

- A line that is empty, or whose first non-blank character is `#`, is ignored anywhere in the file. There are no comments at the end of a line.
- The **first** line that is not ignored is the header: `HALLYM-EXEC <version>`, where `<version>` is a decimal integer. This document describes version `1`.
- After the header come **fields**, one per line, in any order.
- Then come the **sections**. Each starts with a section line and runs until the next section line or the end of the file. No field follows the first section.

Numbers:
- `<addr>` is `0x` followed by exactly 8 hexadecimal digits: a 32-bit address or value.
- `<count>` is a decimal integer.
- A word in `.text` is exactly 8 hexadecimal digits, without `0x`.
- A byte in `.data` is exactly 2 hexadecimal digits.
- The writer uses lower case; a reader accepts either case.

### Fields

| Line | Required | Meaning |
|---|---|---|
| `source <name>` | no | The source file's name, without its folder (`untitled.s` if it was never saved). The name is the rest of the line and may contain spaces. |
| `source-sha256 <64 hex digits>` | no | SHA-256 of the assembled source, as its file holds it: its encoding, BOM and line ends. For a file saved when it was assembled (Ctrl+S does both), this is the file's own `sha256sum`, so a reader can tell whether an `.s` next to it is the program in the image. |
| `produced-by <text>` | no | The program that wrote the file, e.g. `Hallym MIPS 2.4.0`. |
| `assembled <time>` | no | When the program was assembled: local time to the minute, with its UTC offset (`2026-09-27T13:15+09:00`). |
| `endian little` or `endian big` | **yes** | The byte order of the machine that assembled the program. It is the order of the bytes in `.data`, and the order in which the words of `.text` are to be stored. |
| `entry <addr>` | **yes** | Where the student's program begins: the address of the label `main`. A program assembled without the exception handler (Settings → 고급 → Exception handler: None) brings its own `__start` and may have no `main`; then it is `__start`. |
| `reg <name> <addr>` | no | A register's value as assembly left it. Hallym MIPS writes `$sp` (the stack pointer, below `argc`, `argv` and `envp` on the stack) and `$gp` (the global pointer). |
| `symbol <name> <addr>` | no | A label of the program, and its address. |

A reader ignores a field whose first word it does not know, so later writers may add information to version 1 without breaking it.

### Sections

| Section line | Required | Content lines |
|---|---|---|
| `.text <addr> words <count>` | **yes** | Words: `<count>` instruction words from `<addr>` on, 4 bytes apart. `<addr>` is a multiple of 4. |
| `.data <addr> bytes <count>` | no | Bytes: `<count>` bytes from `<addr>` on. |

- A content line holds one or more words (in `.text`) or bytes (in `.data`), or it is `zero <count>`: that many zero words (in `.text`) or zero bytes (in `.data`).
- Hallym MIPS writes one word per line and up to 16 bytes per line.
- It writes a run of 16 bytes or more of zeros (4 words in `.text`) as a `zero` line.
- There is at most one section of each kind. `.data` is left out when the program has no data.

### What a reader must do

1. **Refuse a version above the one it knows.** A version-1 reader that finds `HALLYM-EXEC 2` stops and says so. It does not guess.
2. **Check every count.** The words (or bytes) a section's lines give, `zero` runs included, must be exactly the section line's `<count>`. Anything else is an error, never a truncation or zero fill.
3. Refuse a file without `endian`, `entry` or `.text`, a section whose name it does not know, a second section of the same kind, and a malformed number.
4. Ignore blank lines, `#` lines and fields it does not know.
5. Take memory that no section gives as zero.
6. Refuse an `endian` its machine does not have, unless it converts. The file does not mark which bytes of `.data` belong to words, so there is nothing to convert by.

## What is in the image, and what is not

- **`.text`** is the user text segment, from its first instruction to its last. With the exception handler (the default), it starts with the handler file's start-up code (`__start`, at `0x00400000`). A word the program left empty, such as a gap after `.text <addr>`, is `0`. The kernel's text (the exception handler at `0x80000180`) is not included. The words are the ones in the Text panel's Encoding column.
- **`.data`** is the user data segment. It runs from where the assembler put the first datum (`0x10010000`, unless the program chose otherwise) to where it would have put the next. A `.space` at the end is therefore included, as zeros. Kernel data is not included.
- **Labels** are the program's own labels, global or not, in its text or data. The exception handler's labels (`__start`, `__eoth` and its kernel labels) are not included, and neither are labels in the kernel segments. They are listed by address, then by name.
- **Every value is measured**, none assumed: each comes from the simulator right after it assembled the program. This covers the addresses, `entry`, `$sp`, `$gp`, `endian`, the data range and the labels. Changing the exception handler or the run arguments (Settings) changes them.
- **The image is the last program assembled**, the one Run and Step use. If the Editor has changed since, the image and its `source-sha256` are still those of the assembled program, and the status bar says so.

## Test files

These pairs are checked on every test run. The image must equal the committed `.hmx` line for line, except the `assembled` time and the version in `produced-by`. Each `.hmx` is also read back and compared with the simulator, word by word and byte by byte. A reader should load each `.hmx` and check what it reads against the notes below. Running the `.s` in Hallym MIPS gives the registers to expect at the end.

| Case | Source | Image | What it shows |
|---|---|---|---|
| branches | [branches.s](https://raw.githubusercontent.com/ars2323/hallym-mips-simulator/main/electron/tests/hmx/branches.s) | [branches.hmx](https://raw.githubusercontent.com/ars2323/hallym-mips-simulator/main/electron/tests/hmx/branches.hmx) | `beq`, `j`, `jal`, `jr`: a loop and a call |
| data | [data.s](https://raw.githubusercontent.com/ars2323/hallym-mips-simulator/main/electron/tests/hmx/data.s) | [data.hmx](https://raw.githubusercontent.com/ars2323/hallym-mips-simulator/main/electron/tests/hmx/data.hmx) | `.data` read with `la` and `lw`: the example above |
| main-later | [main-later.s](https://raw.githubusercontent.com/ars2323/hallym-mips-simulator/main/electron/tests/hmx/main-later.s) | [main-later.hmx](https://raw.githubusercontent.com/ars2323/hallym-mips-simulator/main/electron/tests/hmx/main-later.hmx) | `main` after a function: `entry` is not the first word after the start-up code |
| pseudo | [pseudo.s](https://raw.githubusercontent.com/ars2323/hallym-mips-simulator/main/electron/tests/hmx/pseudo.s) | [pseudo.hmx](https://raw.githubusercontent.com/ars2323/hallym-mips-simulator/main/electron/tests/hmx/pseudo.hmx) | pseudo-instructions (`li` large, `la`, `move`, `blt`, `bgt`, `mul`, `neg`, `not`, `abs`, `rem`) as the words they become |
| no-data | [no-data.s](https://raw.githubusercontent.com/ars2323/hallym-mips-simulator/main/electron/tests/hmx/no-data.s) | [no-data.hmx](https://raw.githubusercontent.com/ars2323/hallym-mips-simulator/main/electron/tests/hmx/no-data.hmx) | no `.data` section |
| space-gap | [space-gap.s](https://raw.githubusercontent.com/ars2323/hallym-mips-simulator/main/electron/tests/hmx/space-gap.s) | [space-gap.hmx](https://raw.githubusercontent.com/ars2323/hallym-mips-simulator/main/electron/tests/hmx/space-gap.hmx) | `.space 4096` between two words and `.space 64` at the end: `zero` lines, and the data up to the end of the last `.space` |
| no-handler | [no-handler.s](https://raw.githubusercontent.com/ars2323/hallym-mips-simulator/main/electron/tests/hmx/no-handler.s) | [no-handler.hmx](https://raw.githubusercontent.com/ars2323/hallym-mips-simulator/main/electron/tests/hmx/no-handler.hmx) | assembled **without the exception handler** (its first line says so): no start-up code, the program's own `__start` is the entry |

`raw.githubusercontent.com` serves them as plain text from `main`. To pin a version, replace `main` in the address with a release tag such as `v2.4.0`.

## Versions

- **1**: this document (Hallym MIPS 2.4.0).

A change that a version-1 reader could misread (a new section, a new meaning for a line) raises the version. Adding a field does not.
