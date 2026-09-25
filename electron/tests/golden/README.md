# Golden files

There are two sets. `npm test` compares both every time.

| Set | Location | Source | Comparing test | What it proves |
|---|---|---|---|---|
| Qt environment goldens | `tests/golden/*.txt` (29) + `cases.txt` | **Copied from the Qt edition** | `tests/golden/qt.test.ts` | This app's core is the same as the Qt edition's core |
| Default goldens | `tests/golden/default/*.json` (17) | **Newly captured in this repository** | `tests/golden/default.test.ts` | The default settings that ship produce the same state every time |

## Qt environment goldens — what came from the Qt edition

- Origin: `tests/golden/` at commit `c20d0c3` of `hallym-mips-simulator` was copied byte for byte
  (2026-09-24). `cases.txt` is the same too. The Qt edition's original README is kept unchanged in `README.qt.md`.
  That document records from which build and in what environment they were captured.
- Program inputs: the programs the cases point to were copied from the Qt edition along with them.
  `helloworld.s` → `tests/programs/`, `Tests/*.s` → `tests/programs/`, `tests/samples/*.s` → `tests/samples/`.
- Comparison method: compared **by field**, not as strings. The goldens are parsed to extract addresses, words, disassembly, source comments,
  memory rows with values and characters, register values and assembler messages, which are checked against the addon's state.
  Whitespace layout is Qt `QTextEdit`'s, so it is not compared. The rationale is in the "Goldens" section of `docs/PORTING.md` (section 3).
- Run parameters: the environment at capture time (no argv, 3 environment variables) is set only inside `qt.test.ts`.
  These values are kept nowhere in the addon, the app or a constants file.
- Result: all 29 pass.
  - `text-breakpoint`: the same breakpoint is set with the addon's `setBreakpoint`. Because the Qt window shows the address and word of that line
    cut off by one digit (`README.qt.md`), the remaining seven digits are compared.
- Differences pinned in the comparator (both strings are written down; if either one changes, it fails):
  - `text-ttcore`: 5 source-comment lines of tt.core.s. The Qt side is garbled by a buffer pointer bug in the core
    (`docs/PORTING.md` section 1, on source line display).
- Qt front-end behavior that the comparator reproduces (unrelated to the core):
  - Because the disassembly is 57 columns or wider, the Text window drops the comment when there is no space before `;` (381 lines in tt.core.s).
  - The Data window's decimal display cuts off the sign of 10-digit negative numbers (`-1879048156` → `1879048156`).
  - The message window strips `spim: `, turns tabs into a single space, and adds the banner and `Memory and registers cleared`.

## Default goldens — captured anew here

- 17 captured with this app's default run parameters (`argv=["program.s"]`, no environment variables).
  Only the cases whose results depend on the run parameters were picked:
  6 register logs (5 `intregs-*` + `syntaxerror-run-intregs`) and
  11 data logs where the stack is visible (the 10 `data-*` except `data-nostack`, + `syntaxerror-data`).
- Format: JSON holding exactly the values the Electron panels would show. Values are made with `src/core/format.ts` and `memory-text.ts`,
  rows with `memory-rows.ts`.
- Where captured: this repository, `tools/capture-default-goldens.ts` (`npm run goldens:default`).
  The first version was captured on 2026-09-24. They are captured again only when the defaults or the display are changed **on purpose**,
  and then the commit message says so.
