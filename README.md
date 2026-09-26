# Hallym MIPS Simulator

> **사용법 (한국어): [docs/usage/usage.ko.md](docs/usage/usage.ko.md)** — 내려받기, 설치,
> Windows 경고 창 넘기기, 첫 실행과 튜토리얼, 화면 설명, 자주 막히는 곳.
>
> User guide (English): [docs/usage/usage.en.md](docs/usage/usage.en.md)

A MIPS simulator for the computer architecture courses of Hallym University,
built on [SPIM](https://spimsimulator.sourceforge.net/) by James R. Larus.
Students write MIPS assembly, assemble it, and run it one line at a time,
watching registers, memory and each instruction's 32 bits change.

**Version 2.x — the Electron edition, in [`electron/`](electron/) — is the
current version.** Version 1.x — the Qt edition, a modified QtSpim, at the
root of this repository — is the previous one. It is still maintained as a
fallback and can still be downloaded:
[release 1.2.4](https://github.com/ars2323/hallym-mips-simulator/releases/tag/v1.2.4).

Both editions run the same, unmodified SPIM core ([`CPU/`](CPU/)): a program
assembles and runs exactly as it does in standard SPIM.

![The Electron edition running a program: Editor, Registers, Text, Inspector](electron/docs/screens/split-running.png)

## What's different

Six pairs, standard QtSpim 9.1.24 on the left and Hallym MIPS 2.x on the
right, taken by one tool under the same conditions: the same file
([`data-labels.s`](electron/tests/samples/data-labels.s)), the same 13 single
steps, the same 1600×900 window, each program's default font size (13 px),
no saved settings, Linux. **The simulation is identical; only what you see
differs.** The core is SPIM's own, byte for byte; the one run parameter set on
purpose is the stack every program starts with (`argv[0]` = `program.s`, no
environment variables), the same for every student — which is why `$sp`,
`$a1` and `$a2` differ from QtSpim's below. The conditions, the originals and
how to make them again: [`docs/compare/`](docs/compare/README.md).

**Registers** — grouped by use (Temporaries, Saved, Pointers …); hex, decimal
and binary in one row; the register the last step changed marked and scrolled
into view. QtSpim lists them flat, in one base at a time.

![Registers: standard QtSpim and Hallym MIPS side by side](docs/compare/01-registers.png)

**Text** — columns: address, the 32-bit encoding, a format badge (R / I / J),
the instruction, the source line and its number; the line of PC marked; the
exception handler's instructions folded into one line. QtSpim shows the
segment as text, the kernel's code after the program's.

![Text: standard QtSpim and Hallym MIPS side by side](docs/compare/02-text.png)

**Inspector** — the instruction at PC (or one clicked in Text) as its 32 bits
in fields, each with its colour, name, bit range, binary, value and meaning,
and a sentence on what it does with the registers' current values. QtSpim
shows the word as eight hex digits in the Text panel.

![Inspector: the lw at PC in standard QtSpim's Text panel and in Hallym MIPS's Inspector](docs/compare/03-inspector.png)

**Data** — a table: an address and four words a row, the `.data` labels over
the words they name, `$gp` and `$sp` marked, a run of zero words folded into
one line, and an ASCII column that reads `Hello, MIPS!` as a word. QtSpim
shows each segment as a text dump.

![Data: standard QtSpim and Hallym MIPS side by side](docs/compare/04-data.png)

**Editor and errors** — an editor in the window: Ctrl+S saves and assembles;
an error is listed on the Run side with what to fix and a button to its line,
which is marked in the editor. QtSpim has no editor: a file is written
elsewhere and loaded, and an error is a dialog box and a line of messages.

![The same file with one mistake: standard QtSpim's error dialog and Hallym MIPS's editor and Errors panel](docs/compare/05-editor-errors.png)

**First start** — a start screen and a twenty-step tutorial over the real
window. QtSpim opens its main window, and its Console as a second window.

![The first start: standard QtSpim's two windows and Hallym MIPS's start screen](docs/compare/06-first-start.png)

Also: opening a file (Ctrl+O) always starts from a clean simulator; Ctrl+S
saves and assembles as one action and keeps the breakpoints; the panels
cannot be dragged out of the window; a window half a screen wide shows the
Editor and the Run side as two tabs; every start is the same screen, since
nothing is kept between runs, for machines that students share; and it
installs beside the 1.x edition without touching it (checked on Windows in
CI), writing nowhere QtSpim does — its own folder and uninstall entry, no file
associations.

<details><summary>The whole window</summary>

![Hallym MIPS 2.x, the whole window at 1600×900 after the same 13 steps, on the Data tab](docs/compare/window.png)

</details>

## Download

**[Latest release](https://github.com/ars2323/hallym-mips-simulator/releases/latest)**
(Windows 64-bit): one file, `HallymMIPS-<version>-win-x64-setup.exe`. It
installs for the current user only (no administrator rights) and adds a Start
menu entry.

The program is not code-signed, so Windows SmartScreen warns the first time it
runs. Choose **More info → Run anyway**; the user guide
([한국어](docs/usage/usage.ko.md#windows-경고-창-넘기기) ·
[English](docs/usage/usage.en.md#getting-past-the-windows-warning)) shows the
steps. Version 2.x installs beside 1.x without touching it.

## Repository layout

```text
CPU/            the SPIM core (SPIM/QtSpim 9.1.24), unmodified, shared by both editions (CPU/ORIGIN.md)
electron/       the Electron edition (2.x): electron/docs/DEVELOPMENT.md
QtSpim/         the Qt edition (1.x): QtSpim's interface, modified
tests/ tools/   the Qt edition's tests and tools
Tests/ ...      SPIM's own files, as upstream has them (README, ChangeLog, Documentation/, spim/, xspim/, PCSpim/)
docs/           the user guide (docs/usage/) and the Qt edition's documents
LICENSE NOTICE  this project's license; third-party components and the university's marks
```

The Qt edition stays at the root, where 1.2.4 was built from, so that its
build paths do not move: if 2.x has to be pulled back from the labs, 1.x can be
rebuilt and released exactly as before.

## Building

### Electron edition (2.x)

Node 22.18 or later, a C++ compiler, make, python3, bison and flex (on
Windows: MSVC and winflexbison). From `electron/`:

```sh
cd electron
npm install --ignore-scripts
npm run build            # the SPIM addon (native/build/Release/spim.node)
npm test                 # unit and golden tests
npm run build:electron   # the addon against Electron's headers
npm run electron         # start the app
npm run e2e              # the real app, through Playwright (needs a display; xvfb-run on Linux)
npm run package          # the installer in electron/dist/ (on Windows)
```

More in [`electron/docs/DEVELOPMENT.md`](electron/docs/DEVELOPMENT.md);
how it differs from the Qt edition, and why, in
[`electron/docs/PORTING.md`](electron/docs/PORTING.md).

### Qt edition (1.x)

Qt 5.15, bison and flex (Linux: g++; Windows: MSVC 2019 with winflexbison).
Always build out of the source tree:

```sh
mkdir -p build && cd build && qmake ../QtSpim/QtSpim.pro && make -j"$(nproc)"
```

Tests: `tests/tests.pro` (unit tests, including an oracle that checks the
instruction decoder and the file loader against the real SPIM core),
`tools/regress.sh` (output against vanilla 9.1.24, saved logs byte for byte),
`tools/check-menu-load.sh --compare-vanilla`, `tools/check-editor.sh`.
`docs/ARCHITECTURE.md` describes the code; `docs/GUIDE.md` and
`docs/GUIDE-ko.md` are the 1.x user guide.

### Continuous integration

Two workflows, one per edition: **Qt edition (1.x)** (`ci.yml`, Linux and
Windows) and **Electron edition (2.x) — Windows** (`electron.yml`). A change
under `electron/` runs only the second, a change elsewhere only the first, and
a change to `CPU/` runs both.

## License

This project is under the BSD 3-Clause License ([`LICENSE`](LICENSE)).
It is built on SPIM, Copyright (c) 1990-2023 James R. Larus, also under a BSD
license; SPIM's own README is kept at the root as [`README`](README).
[`NOTICE`](NOTICE) lists every third-party component and which edition it
applies to: SPIM and QtSpim (both), Qt under the LGPL v3 (the Qt edition only),
Electron, Chromium and Node.js (the Electron edition only), the fonts
Pretendard and D2Coding (SIL OFL 1.1) and the Lucide icons (ISC).

The Hallym University marks and the characters Haram and Hari belong to
Hallym University. They are not covered by this project's license and may not
be taken from here and used elsewhere (see [`NOTICE`](NOTICE)).

Developed by Hakhyeon Kim, AIAC Lab, Hallym University, as a personal
project. This is not an official product of Hallym University, and it is not
endorsed by the original author of SPIM.
