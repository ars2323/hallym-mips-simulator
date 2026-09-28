# Screens — the fixed set

Every round, **all of them are retaken** under the same names, and a picture that did not change is not written again, so git shows only the screens that changed. "Did not change" means the same size, at most 20 pixels more than 2 levels apart and none more than 24: the renderer's anti-aliasing noise. For that the windows' clock is fixed (the Assemble panel shows the assemble's time). There are no subfolders. All of them are taken by `tools/capture-screens.ts` (none are taken by hand).
The example files and step counts are written inside the tool, so the same scenes come out from round to round.

- To retake: in `electron/`, run `xvfb-run -a -s '-screen 0 2400x1400x24' npm run screens` (Linux, xvfb software rendering)
- Default: the whole window at 1280×800. No mouse cursor, tooltips or hover (the pointer is moved outside the window and `:hover` is checked to be 0).
  Focus is also cleared before capturing.
- Size: whole window 400KB or less, crops 150KB or less. Metadata (ancillary PNG chunks) is stripped. No lossy compression. If a limit is exceeded, the tool stops.
- The start screen is the exception: the university's video is behind it, and a PNG of a video frame is 500KB or more.
  Those shots are JPEG (quality 85, 250KB or less). The video is stopped at a fixed second first, so every round takes the same picture.
- The window buttons (minimize, maximize, close) are drawn by the system, so they are not in the page capture, and their place is empty. What they look like can be seen in `windows-frame.png`.

| File | What | Capture conditions |
|---|---|---|
| `start.jpg` | Start screen: Haram (greeting) and the two paths (튜토리얼 보기 / 바로 시작, "View tutorial" / "Start now"), no toolbar; behind the card, the university's video under its blur and navy tint | 1280×800, as started, the video stopped at 3.0 s |
| `start-2.jpg` | Start screen, second step: 새 파일 / 파일 열기 ("New file" / "Open file"), "← 처음으로" ("← Back to start"); the same video frame behind | 1280×800, 바로 시작 clicked |
| `start-frame-1.jpg`, `start.jpg`, `start-frame-3.jpg` | The start screen at three moments of the video, one slow aerial pass over the city, the campus and the mountain. The card is the same picture in all three. The middle moment is `start.jpg` itself (there is no `start-frame-2.jpg`: it was the same picture) | 1280×800, the video stopped at 0.5, 3.0 and 5.5 s |
| `start-1093.jpg`, `start-2-1093.jpg` | The two steps on the lab PC | CSS 1093×582 at 1.25×, 3.0 s |
| `start-1024.jpg`, `start-2-1024.jpg` | The two steps at 1024×768 | CSS 1024×728, 3.0 s |
| `start-910.jpg`, `start-2-910.jpg` | The two steps at 1366×768 at 150% (the card loses its character only below 860 px) | CSS 910×505 at 1.5×, 3.0 s |
| `start-1920.jpg`, `start-2-1920.jpg` | The two steps on a maximised 1920 screen | 1920×1040, 3.0 s |
| `split-before.png` | Left/right split, before assembling: the right side shows the guide card (a notice: the words in the middle, the character at the far end) | 1280×800, `tests/samples/lab04-ok.s` only opened, as `lab04.s` |
| `assembled.png` | Just assembled, before the first step: the toolbar's Save & Assemble; under the Editor the Assemble panel, one line ("어셈블했습니다 · 명령 30개 · 저장됨", its time in the head); the Inspector's word in the middle of its panel; the empty Console only as tall as its one-line word, Registers taking the rest, their head without a note; the status bar: F10 Step · F5 Run, 저장됨 | 1280×800, same file, Ctrl+S |
| `split-running.png` | Left/right split, running: current line highlighted in Editor and Text, Inspector follows the PC; the yellow row named in the status bar, in its yellow ("방금 바뀜: `$t6`": at 1280 Registers have no room for the Changed tag) | 1280×800, same file, Ctrl+S then F10 16 times (PC `0x0040004c`, just changed `$t6`) |
| `inspector.png` | Inspector pinned to the selected instruction (Pinned) | From the `split-running` state, click `0x00400054` (`sra $s1, $t6, 1`) in Text |
| `dialog.png` | In-app dialog (Haram): New file from a saved file | From the `inspector` state, New file |
| `edited.png` | The code changed after assembling (a line added at the top): the Run side as it was, with the band over it ("지금 보이는 것은 마지막으로 어셈블한 코드입니다"), no line marked in the Editor, the Assemble panel's second line (코드가 바뀌었습니다 …) | 1280×800, the `split-running` run, then a comment typed on line 1 |
| `error-kept.png` | An assemble with errors that kept the machine: the error list in the Assemble panel under the Editor, "오른쪽에는 마지막으로 어셈블한 코드가 그대로 있습니다"; the Run side, registers and PC as they were, the band; the status bar's "고친 코드에 오류 1개 — Assemble 패널" | From `edited`, `srll $t7, $t6, 1` added at the end, Ctrl+S |
| `error.png` | Assembly error, the first assemble of the file: the Assemble panel under the Editor — what is wrong ("코드에 오류가 있습니다"), what to do ("아래 줄을 고친 뒤 Ctrl+S 키를 다시 누르세요."), the error with its line, the button; the line's number twice, `!` in the Editor gutter; the Run side's card (Haram) says nothing has assembled yet; the hint names `srl` for `srll` | 1280×800, open `tests/samples/lab04.s` (`srll` on line 15) and Ctrl+S |
| `error-several.png` | Several errors: "코드에 오류가 3개 있습니다", "위에서부터 하나씩 고친 뒤 …", each error with its line | 1280×800, `tests/samples/editor-errors.s`, Ctrl+S |
| `error-near-miss.png` | An error whose hint names the slip: `.global` for `.globl` | 1280×800, a file with `.global main`, Ctrl+S |
| `max-1920.png` | A maximised 1920 screen: the Editor at what 72 columns need (586 px), the width beyond it on the Run side — Text's Source column whole, the Inspector's bit grid at full size; the empty Console as tall as its word (105 px), Registers the rest of the height (847 px); the yellow `$t6` row with its Changed tag | 1920×1040 (1080 under the taskbar), same run as `split-running` |
| `errors-max.png` | The Assemble panel with its errors on a maximised 1920 screen, under the Editor; the Run side's card (nothing assembled yet) | 1920×1040, `tests/samples/lab04.s`, Ctrl+S |
| `data.png` | Data: areas (User data / Stack), zero runs, label lines, `$gp` and `$sp`, the ASCII column on (as from a 1140 px window), `Hello, MIPS!` read as one run with faint lines between the words | 1280×800, `tests/samples/data-labels.s`, Ctrl+S then F10 14 times, Data tab |
| `lab-1366x768-125.png` | Lab PC: 1366×768 at 125% scaling, maximized | CSS 1093×582 at 1.25× (`--force-device-scale-factor=1.25`), same run as `split-running` |
| `narrow.png` | Narrow window: the Editor / Run tabs in the bar, Run side; the toolbar's Assemble ("Save &" gave way), the status bar's "방금 바뀜" | 1366×768 at 150% scaling, CSS 910×505 at 1.5×, same run as `split-running` |
| `lab-columns.png` | The lab PC's Registers and Text heads, cropped: Name Hex Dec Bin / Address Encoding Format Instruction | Same screen as `lab-1366x768-125`, top 190px of the two panels (150KB or less) |
| `1024x768.png` | 1024×768 at 100% scaling: left/right split kept, Text shows Format and Source as buttons | CSS 1024×728 (taskbar), same run as `split-running` |
| `tutorial-01.png` | Tutorial step 1: the Editor lit whole, boxes on its head and the first lines, the rest dimmed, the card and Haram; the example is never saved: Assemble in the toolbar and on the Run side, "어셈블 (Ctrl+S)" in the status bar | 1280×800, 튜토리얼 보기 → step 1 |
| `tutorial-03.png` | Step 3: the Registers panel lit whole (all its groups, the context of what the card says), boxes on its head and the Temporaries band; the card off it | 1280×800, step 3 |
| `tutorial-04.png` | Step 4: the Text rows where `li $t0, 0x12345678` became the two lines `lui` + `ori` | 1280×800, step 4 via the tutorial's `go()` (up to assembling) |
| `tutorial-09.png` | Step 9: the bit grid's opcode, rs, rt, rd and the Encoding value in Text | 1280×800, step 9 (starting code and two `li` lines, `add` executed, Inspector pinned) |
| `tutorial-14.png` | Step 14, a practice step: the gutter (breakpoint column) and its line; the card is one text — what to do, and in its last sentence that the dot moves it on — with no [다음] | 1280×800, step 14 |
| `tutorial-quit-ask.png` | The quit question over the tutorial: Haram in the dialog, the card and rings under the backdrop, one Haram | 1280×800, step 14, 그만두기 |
| `tutorial-18-done.png` | Step 18's result beat: the Console's output and the status bar pointed at; the card's text is what just happened, [다음] awaited | 1280×800, step 18, then F5 |
| `tutorial-19.png` | Step 19: the Assemble panel after assembling `tutorial-error.s`, lit whole, three boxes | 1280×800, Ctrl+S at step 19 |
| `tutorial-20.png` | Step 20: the center card, Haram (congrats) | 1280×800, step 20 |
| `tutorial-09-narrow.png` | Step 9 in a narrow window (Run side) | 910×505 at 1.5× |
| `windows-frame.png` | The installed build maximized on **real Windows** (Server 2025, the Windows 11 shell) at 1920×1080: the default layout as a student sees it — the app's bar, the system's window buttons, the taskbar | CI only (`electron.yml` at the repository root; the runner's screen set to 1920×1080 by `tools/windows/screen-1920.ps1`, 1024×768 if that fails — `report/screen.txt`). With the installed build, the same run as `split-running`, then maximized; whole screen (≤ 700 KB) |
| `windows-frame-tutorial.png` | The same, with the tutorial on: the caption buttons' patch coloured with the dim (`#bdc5d4`), the buttons still there | CI only, like `windows-frame`; step 14, maximized; whole screen |

| `installer-progress.png` | The installer (2.4.0 on), its first page: the progress, in Korean ("설치하는 중"); from 2.5.0 the bar in the app's blue, not Windows' green | CI only: `tools/windows/check-installer-ui.ps1`, the installer run with its pages (not `/S`) on the runner; the window alone. Comes from the release commit's run and is committed before the tag (root `CLAUDE.md`, rule 4) |
| `installer-finish.png` | Its finish page, the second and last: "설치가 완료되었습니다", "지금 실행하기" ticked, 마침; from 2.5.0 the band on the left in the app's navy with the symbol (`packaging/installerSidebar.bmp`, `tools/installer-art.py`) | CI only, the same run. Comes from the release commit's run and is committed before the tag |
| `installer-started.jpg` | What 마침 started: the installed program's start screen, its video playing (a live frame, not stopped) | CI only, the same run, 6 s after 마침; the window alone. The CI writes a PNG; it is committed as JPEG (quality 85), like the other start screens. The runner's animation effects are turned on first (`tools/windows/animations-on.ps1`), so the video plays as on the students' PCs. Comes from the release commit's run and is committed before the tag |
| `uninstaller-finish.png` | The uninstaller's finish page (after its progress page): "제거가 끝났습니다", the same band |
| `start-clip-contact.jpg` | Every frame of the first screen's clip, numbered, on one sheet (201: one aerial pass, the last 15 the crossfade into the first): no text, logo, graphics or cut | `ffmpeg … tile` of `src/renderer/assets/hallym/start/start.webm`, 200 px a frame; made again with the clip |
| `start-clip-2.4.0-contact.jpg` | The same for 2.4.0's clip (336 frames, 0:00–0:12 of the source), kept for what it shows: "한림대학교" on the gate sculpture (57–101), building signs (102–201), graphics over the aerial shot (248–319), six cuts | The same, of the clip at `v2.4.0` | CI only, the same run: the uninstaller run with its pages, as Settings > Apps runs it. Comes from the release commit's run and is committed before the tag |

`windows-frame.png` and `windows-frame-tutorial.png` are taken as is from `report/screens/` in the CI artifact `windows-report`,
and the three `installer-*` pictures from its `report/installer/`. CI also takes
the rest on Windows with the same tool and puts them in `report/screens/` (they are not committed here).

Scenes added in a round are added to this table under names without a round marker.

The user guide's three pictures are taken by the same tool, in the same run, and written to
[`docs/usage/images/`](../../../docs/usage/images/) at the repository root: `01-start.jpg` (= `start.jpg`),
`02-tutorial-04.png` (= `tutorial-04.png`) and `03-panels.png` (the `split-running` scene with each part
outlined and named: Toolbar, Editor, Assemble, Registers, Text · Data, Inspector, Console, Status bar — the names
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

2. **The title bar's narrowest step has no room for another icon.** From 2.4.0 the right-hand
   group has five icons: Tutorial, New file, Open file, Export executable image, Settings.
   The fifth took 26 px. In the narrowest step (`tighter`, at 910 px, with a 20-column file name
   and Windows' caption buttons) the bar came out 25 px short, so before it there was 1 px to spare.
   That step's icon buttons went from 24 to 20 px with no gap between them, which leaves 9 px.
   **Does 20 px apply on Windows? Yes:** the `tighter` step is on at 910×505 (1366×768 at 150%)
   for every file name on every platform, and the +30 px that showed the shortfall stands for
   Windows' own wider caption buttons (`fit.e2e.ts`). At 1024 px and wider it never engages.
   *Why it waits:* 20 px is the least an 18-px icon takes, so a sixth icon (or a longer label)
   needs another step, for example New file and Open file in one menu, not narrower buttons.

### Skipped tests: intended

The e2e run at each width ends with some tests skipped. These skips are intended, not faults
waiting for a fix.

- **At 910×505, 97 tests, not 98.** `layout.e2e.ts` *splitter: drag to share the width, fold
  either side away and back* skips itself when the window shows Editor and Run as tabs. Below
  971 px there is no splitter to drag or fold: one side shows at a time. The tabs are what that
  width has instead, and *narrow windows show one side at a time; 1093 wide (1366 at 125%) keeps
  both* (`layout.e2e.ts`) and `fit.e2e.ts` at 910×505 test them. At the other widths the
  splitter test runs.
- **At every width, 2 skipped.** The two tests of `ime-real.e2e.ts` (*the editor: 한글 typed
  with the Windows IME, Enter, then saved*, and *the Console: 한글 typed with the Windows IME into
  syscall 8, Enter*) type through the real Microsoft Korean IME. That IME exists only on the
  Windows runner, where the Windows job installs it (`tools/windows/korean-ime.ps1`) and runs
  them against the installed app, with `SPIM_REAL_IME=1`. Elsewhere, `ime.e2e.ts` drives the
  IME's events through CDP at every width.

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
- Changing the code keeps the machine (the band, the Assemble panel under the Editor, errors that keep the machine) and the tutorial lights whole panels — 79ccb77 — 2026-09-27
- 2.4.0: the first screen over the university's video (JPEG, both steps at every width, three moments), the title bar's Export icon, the installer's and uninstaller's pages from the tag run — 8c5780d (installer pages: 65c7c58) — 2026-09-27
