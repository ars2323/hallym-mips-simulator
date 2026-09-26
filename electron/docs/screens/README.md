# Screens — the fixed set

Every round, **all of them are retaken and overwritten** under the same names. There are no subfolders. All of them are taken by `tools/capture-screens.ts` (none are taken by hand).
The example files and step counts are written inside the tool, so the same scenes come out from round to round.

- To retake: in `electron/`, run `xvfb-run -a -s '-screen 0 2400x1400x24' npm run screens` (Linux, xvfb software rendering)
- Default: the whole window at 1280×800. No mouse cursor, tooltips or hover (the pointer is moved outside the window and `:hover` is checked to be 0).
  Focus is also cleared before capturing.
- Size: whole window 400KB or less, crops 150KB or less. Metadata (ancillary PNG chunks) is stripped. No lossy compression. If a limit is exceeded, the tool stops.
- The window buttons (minimize, maximize, close) are drawn by the system, so they are not in the page capture, and their place is empty. What they look like can be seen in `windows-frame.png`.

| File | What | Capture conditions |
|---|---|---|
| `start.png` | Start screen: Haram (greeting) and the two paths (튜토리얼 보기 / 바로 시작, "View tutorial" / "Start now"), no toolbar | 1280×800, as started |
| `start-2.png` | Start screen, second step: 새 파일 / 파일 열기 ("New file" / "Open file"), "← 처음으로" ("← Back to start") | 1280×800, 바로 시작 clicked |
| `split-before.png` | Left/right split, before assembling: the right side shows the guide card (a notice: the words in the middle, the character at the far end) | 1280×800, `tests/samples/lab04-ok.s` only opened, as `lab04.s` |
| `assembled.png` | Just assembled, before the first step: the toolbar's Save & Assemble; the Inspector's word in the middle of its panel; the empty Console only as tall as its one-line word, Registers taking the rest, their head without a note; the status bar: F10 Step · F5 Run, 저장됨 | 1280×800, same file, Ctrl+S |
| `split-running.png` | Left/right split, running: current line highlighted in Editor and Text, Inspector follows the PC; the yellow row named in the status bar, in its yellow ("방금 바뀜: `$t6`": at 1280 Registers have no room for the Changed tag) | 1280×800, same file, Ctrl+S then F10 16 times (PC `0x0040004c`, just changed `$t6`) |
| `inspector.png` | Inspector pinned to the selected instruction (Pinned) | From the `split-running` state, click `0x00400054` (`sra $s1, $t6, 1`) in Text |
| `dialog.png` | In-app dialog (Haram): New file from a saved file | From the `inspector` state, New file |
| `error.png` | Assembly error: the Errors panel on the Run side — what is wrong ("코드에 오류가 있습니다"), what to do ("아래 줄을 고친 뒤 Ctrl+S 키를 다시 누르세요."), the error with its line, the button; the line's number twice, one Haram (curious), `!` in the Editor gutter; the hint names `srl` for `srll` | 1280×800, open `tests/samples/lab04.s` (`srll` on line 15) and Ctrl+S |
| `error-several.png` | Several errors: "코드에 오류가 3개 있습니다", "위에서부터 하나씩 고친 뒤 …", each error with its line | 1280×800, `tests/samples/editor-errors.s`, Ctrl+S |
| `error-near-miss.png` | An error whose hint names the slip: `.global` for `.globl` | 1280×800, a file with `.global main`, Ctrl+S |
| `max-1920.png` | A maximised 1920 screen: the Editor at what 72 columns need (586 px), the width beyond it on the Run side — Text's Source column whole, the Inspector's bit grid at full size; the empty Console as tall as its word (105 px), Registers the rest of the height (847 px); the yellow `$t6` row with its Changed tag | 1920×1040 (1080 under the taskbar), same run as `split-running` |
| `errors-max.png` | The Errors panel on a maximised 1920 screen: title, what went wrong, the errors, the button and Haram as one block in the middle | 1920×1040, `tests/samples/lab04.s`, Ctrl+S |
| `data.png` | Data: areas (User data / Stack), zero runs, label lines, `$gp` and `$sp`, the ASCII column on (as from a 1140 px window), `Hello, MIPS!` read as one run with faint lines between the words | 1280×800, `tests/samples/data-labels.s`, Ctrl+S then F10 14 times, Data tab |
| `lab-1366x768-125.png` | Lab PC: 1366×768 at 125% scaling, maximized | CSS 1093×582 at 1.25× (`--force-device-scale-factor=1.25`), same run as `split-running` |
| `narrow.png` | Narrow window: the Editor / Run tabs in the bar, Run side; the toolbar's Assemble ("Save &" gave way), the status bar's "방금 바뀜" | 1366×768 at 150% scaling, CSS 910×505 at 1.5×, same run as `split-running` |
| `lab-columns.png` | The lab PC's Registers and Text heads, cropped: Name Hex Dec Bin / Address Encoding Format Instruction | Same screen as `lab-1366x768-125`, top 190px of the two panels (150KB or less) |
| `1024x768.png` | 1024×768 at 100% scaling: left/right split kept, Text shows Format and Source as buttons | CSS 1024×728 (taskbar), same run as `split-running` |
| `tutorial-01.png` | Tutorial step 1: the Editor head and the first lines, the card and Haram; the example is never saved: Assemble in the toolbar and on the Run side, "어셈블 (Ctrl+S)" in the status bar | 1280×800, 튜토리얼 보기 → step 1 |
| `tutorial-04.png` | Step 4: the Text rows where `li $t0, 0x12345678` became the two lines `lui` + `ori` | 1280×800, step 4 via the tutorial's `go()` (up to assembling) |
| `tutorial-09.png` | Step 9: the bit grid's opcode, rs, rt, rd and the Encoding value in Text | 1280×800, step 9 (starting code and two `li` lines, `add` executed, Inspector pinned) |
| `tutorial-14.png` | Step 14, a practice step: the gutter (breakpoint column) and its line; the card is one text — what to do, and in its last sentence that the dot moves it on — with no [다음] | 1280×800, step 14 |
| `tutorial-quit-ask.png` | The quit question over the tutorial: Haram in the dialog, the card and rings under the backdrop, one Haram | 1280×800, step 14, 그만두기 |
| `tutorial-18-done.png` | Step 18's result beat: the Console's output and the status bar pointed at; the card's text is what just happened, [다음] awaited | 1280×800, step 18, then F5 |
| `tutorial-19.png` | Step 19: the Errors panel after assembling `tutorial-error.s` | 1280×800, Ctrl+S at step 19 |
| `tutorial-20.png` | Step 20: the center card, Haram (congrats) | 1280×800, step 20 |
| `tutorial-09-narrow.png` | Step 9 in a narrow window (Run side) | 910×505 at 1.5× |
| `windows-frame.png` | The installed build maximized on **real Windows** (Server 2025, the Windows 11 shell) at 1920×1080: the default layout as a student sees it — the app's bar, the system's window buttons, the taskbar | CI only (`electron.yml` at the repository root; the runner's screen set to 1920×1080 by `tools/windows/screen-1920.ps1`, 1024×768 if that fails — `report/screen.txt`). With the installed build, the same run as `split-running`, then maximized; whole screen (≤ 700 KB) |
| `windows-frame-tutorial.png` | The same, with the tutorial on: the caption buttons' patch coloured with the dim (`#bdc5d4`), the buttons still there | CI only, like `windows-frame`; step 14, maximized; whole screen |

`windows-frame.png` and `windows-frame-tutorial.png` are taken as is from `report/screens/` in the CI artifact `windows-report`. CI also takes
the rest on Windows with the same tool and puts them in `report/screens/` (they are not committed here).

Scenes added in a round are added to this table under names without a round marker.

The user guide's three pictures are taken by the same tool, in the same run, and written to
[`docs/usage/images/`](../../../docs/usage/images/) at the repository root: `01-start.png` (= `start.png`),
`02-tutorial-04.png` (= `tutorial-04.png`) and `03-panels.png` (the `split-running` scene with each part
outlined and named: Toolbar, Editor, Registers, Text · Data, Inspector, Console, Status bar — the names
are drawn over the page for that picture only).

Links to these screenshots (for example in a round report) have the form
`https://raw.githubusercontent.com/ars2323/hallym-mips-simulator/<commit SHA>/electron/docs/screens/<name>.png`,
pinned to a commit SHA, never to a branch.

## Open issues

Everything a review raises goes through this list, whether it is fixed or put off: what it is,
and what was done or why it waits. Open items stay until they are fixed.

### Open

1. **Data overflows sideways by up to 10 px in a window 971–1034 px wide** (1024×768: 10 px;
   measured with `tests/samples/data-labels.s`, the ASCII column off). A scroll bar appears under
   the Data tab, the last characters of the `+C` word are cut, and an area's heading
   (`User data 0x10000000 — 0x1003ffff 256 KB`) takes two lines.
   *Why it waits:* in that band the three columns' least widths add up to more than the window —
   the Editor keeps 300 px (a student's line fits; below that it scrolls), Registers keeps its four
   columns Name · Hex · Dec · Bin (the course's columns, round 3), and Data needs its address and
   four words. Making room means giving up one of those earlier decisions, or a two-words-a-row
   Data layout for one band of widths; both are larger than this round. Below 971 px the window
   shows Editor and Run as tabs and Data fits; from 1035 px it fits.

### Closed in the 2.0.0 round

- **Data ASCII read as `Hell o, M IPS!`** — the gaps are gone: one character per monospaced cell,
  aligned with the four word columns, a faint line between the words. On by default from a
  1140 px window (the Editor then still has 300 px); below, a `+ ASCII` button.
- **Text's "Show" alone on a third line at 1024** — the fold line is one line, like Registers'
  `CP0 … Show`: the text is cut with an ellipsis before the button wraps.
- **Two highlights in Text at tutorial step 9** — while steps 8 and 9 point at a pinned row, the
  PC's band in Text is not drawn; one highlight (tests/e2e/tutorial.e2e.ts checks both steps).
- **Data 25 px too wide at 1024** — measured again after the ASCII change: 10 px, and only between
  971 and 1034 px (open item 1).
- **A stale path in `data-labels.s`** — `docs/screens/data.png` is now
  `electron/docs/screens/data.png`; the repository was swept for paths that no longer resolve
  (none left in files students or readers see).

## Round log

Entries before the merge refer to commits of the archived repository ars2323/hallym-mips-simulator-electron, which still serves them.

- UI round 2 fixes — 070aac5 — 2026-09-25 (old convention: `docs/screens/ui2/`)
- Screen terms unified in English · screenshot convention — 49be50e — 2026-09-25
- Round 3 fixes (what the narrow window keeps) — 72a90cb — 2026-09-25
- 20-step tutorial — 755517c — 2026-09-25
- Tutorial polish — a46f0ac — 2026-09-25
- Title bar: shorten the file name first — bcfbfd1 — 2026-09-25
- 2.0.0 finish (nothing kept, Data ASCII on, one-line folds, the guide's pictures) — ec3b877 — 2026-09-26
- Windows in use (maximised start, the Editor's 72-column cap, result beats, one dialog, notices, hints) — b790d6d — 2026-09-26
- How the window speaks (wording, one-text tutorial cards, the error panel, the Console's height, Windows at 1920×1080) — 51bb424 — 2026-09-26
- The yellow row names itself, Save & Assemble (no legend in the Registers head, the Changed tag and the status bar's "방금 바뀜", the button's name by the file's state, the title bar's new step) — 9e7bf12 — 2026-09-27
