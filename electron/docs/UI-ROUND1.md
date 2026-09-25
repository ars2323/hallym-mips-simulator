# Window round 1 — differences from the mockups, character placement, measurements

This is the record of the first version that made direction 1, "stage switching", actually work. The captures taken then (four scenes × three sizes, and the mockup comparison sheet
`sheet.png`) were deleted when they were replaced by the current fixed set (`docs/screens/README.md`). They remain in `docs/screens/` at commit `070aac5`.
The terms below are the ones used at that time (the window's names were later unified in English: `docs/PORTING.md` section 16).

| Scene | What was done in the app |
|---|---|
| A Start screen | The app as it starts |
| B Code (error) | Open `lab04.s` and press Ctrl+S. `srll` on line 15 is a real error |
| C Single-stepping | Open the fixed `lab04-ok.s` (shown in the window as `lab04.s`), press Ctrl+S, then F10 16 times. PC `0x0040004c`; the register just changed is `$t6` |
| D Inspector | In the same state, click the `sra $s1, $t6, 1` (`0x00400054`) line |

## Differences from the mockups, and why

### All scenes

| Mockup | App | Why |
|---|---|---|
| Two items at the top: `?` and a gear | `?` (opens the tutorial example), New file, Open file, gear | Once past the start screen there was nowhere to reach New file and Open. The menu bar was removed |
| A [코드]/[실행] ("Code"/"Run") switch on the start screen too | Not on the start screen | There is nothing to switch to yet |
| The "방향 · 장면" ("direction · scene") label on the right of the status bar | None | It was a label to tell the mockups apart |

### A Start screen

| Mockup | App | Why |
|---|---|---|
| Four ways to start (open example, tutorial, new file, open file) + recent files | Two: **튜토리얼 보기 / 바로 시작** ("View tutorial" / "Start now"). Clicking 바로 시작 shows **새 파일 / 파일 열기** ("New file" / "Open file") | This is the requested layout. No recent files: state is not restored (lab PCs are shared by many people) |
| Tutorial "20단계, 10분쯤" ("20 steps, about 10 minutes") | Opens the tutorial example (`src/examples/tutorial.s`, a Qt edition sample) in the editor | The 20-step tutorial is not in this round's scope |

### B Code

| Mockup | App | Why |
|---|---|---|
| Wavy underline under the wrong word on the error line | The whole line is colored, with a red dot next to the line number | The core only reports the line. Picking which word would be guesswork |
| Editor line numbers | CodeMirror's line numbers + a column for the error dot | It is a real editor |
| Width left over at 1920 | Still left over | Exactly as in "What we learned" in the mockups README. A way to fill it (machine code preview) is not in this round's scope |

### C Single-stepping

| Mockup | App | Why |
|---|---|---|
| Status: "한 줄씩 실행 중 · 16단계 · PC … · 방금 바뀜" ("Single-stepping · step 16 · PC … · just changed") | "한 줄 실행했습니다 (PC …) · 16단계 · 방금 바뀜: `$t6`" ("Executed one line (PC …) · step 16 · just changed: `$t6`") | The sentence differs for each stop reason (`limit`, `breakpoint`, `input`, `stopped`) |
| Text head "사용자 명령 30개" ("30 user instructions") | "명령 30개" ("30 instructions") + "명령 보기" ("View instruction") | "명령 보기" is the place that opens the Inspector without choosing an instruction (the sign in the empty Inspector) |
| "CP0 · FP 레지스터는 기본으로 숨김" ("CP0 · FP registers hidden by default") | "CP0 레지스터는 기본으로 숨김 · 보기" ("CP0 registers hidden by default · Show") (expands) | Showing the FP registers was not built this time |
| The breakpoint column is empty | Hovering over a line shows a faint dot; clicking makes a red dot | It shows where to click |
| The small register table at 960 has no head | One set of heads (name, hex, decimal) | The two columns mean the same thing |

### D Inspector — the sheet was made lower at 1280

| | Mockup | App |
|---|---|---|
| Sheet height at 1280×800 | About 407px (60% of the area) | **311px** |
| Text lines fully visible above the sheet | 9 lines | **13 lines** (26 lines without the sheet) |

The field table was left as it is, and the space around it was reduced.

- The "소스 …" ("Source …") line was moved up into the title line (saves one line).
- Line heights of the bit strip: range 14px, bits 20px, names 15px.
- Field table rows are 20px high and the header row is 18px. Top/bottom padding is 4px/2px.
- The explanation box's outer margin is 4px/10px and its inner padding is 6px/10px.
- The margin above the handle is 5px.

The sheet height is the content height, not a ratio. So it is 311px at 1920 too (the mockup had 46%).

| Mockup | App | Why |
|---|---|---|
| Explanation: "`$t6`(= `0x80000001`)을 shamt만큼 …" ("`$t6` (= `0x80000001`) by shamt …") | "`$t6` 값(`0x80000001`)을 shamt(`1`)만큼 …" ("the `$t6` value (`0x80000001`) by shamt (`1`) …") | The Korean particle is attached after a Korean noun, not after a register name or a number. Whether the object particle is 을 or 를 depends on how `$a0` or `5` is read aloud (`src/core/explain.ts`) |
| The table's "뜻" ("Meaning") column in the UI font | mono | A meaning can contain `0x…` (an immediate) |
| The selected line just above the sheet | Same. Even a line at the end of the list comes up above the sheet | Space as tall as the sheet is left below the list |

## Where the characters are placed (only these four)

| Place | Character | When |
|---|---|---|
| Start screen | `hello` (greeting), 210px | Always |
| Empty Inspector | `sign` (signpost), 96px | When the Inspector is opened without choosing an instruction. The text is placed beside the sign, not on its board |
| Empty console | `talk` (communication), 96px | When a console with no output is expanded |
| First successful run | `congrats` (congratulations), 120px | **Once**, on the first run that ends with `exit` without errors. It disappears when closed or on the next action (F10, F5, assemble), and does not appear again for that run (session) of the app |

All are on white surfaces. None were put on teal surfaces, the toolbar, panel heads, the status bar or the error list.
The original PNGs were only scaled down by CSS height (minimum 76px).

## Measurements (`npm run measure:ui`, 1280×800, xvfb software rendering)

### Register redraw — F10 300 times

| What | Value |
|---|---|
| Script time for one update | p50 0.1–0.2 ms, p95 0.3 ms, max 0.6 ms |
| Rows whose text changed | 2 rows per step (the PC and one changed register) |
| Rows whose DOM changed (MutationObserver) | **3 rows / 39 rows** per step: the PC, the newly changed one, and the previous one whose highlight went off |
| Steps per second (key → update confirmed) | About 220–240 |
| Frames | p50 16.7 ms, max 16.8 ms, 0 frames over 33 ms, 0 long tasks (>50 ms) |

Register rows are created once and only the changed cells are updated. That only changed rows are updated was confirmed with MutationObserver.

### While running (F5, endless loop for 2 seconds)

Frames p50 16.7 ms, max 16.8 ms. Frames over 33 ms and long tasks: 0.
About 7 million instructions were executed in 2 seconds. Progress events update only the status bar.

### tt.core.s — is a virtual list needed?

Measured with 4,703 user instructions (52 kernel instructions folded) at normal CPU speed and at 4× slower via CDP.
The 4× slower case imitates a slow PC in the lab.

| | Virtual list (normal) | Virtual list (CPU ×4) | All rows in DOM (normal) | All rows in DOM (CPU ×4) |
|---|---|---|---|---|
| DOM rows / total elements | 37 / about 960 | 37 / about 960 | 4,703 / 42,861 | 4,703 / 42,861 |
| Fill (until painted) | 11–12 ms | 31–35 ms | 74–442 ms | 2.3–2.8 s |
| Scroll to the end, 240 frames | max 16.8 ms, 0 long tasks | max 16.8 ms, 0 long tasks | max 16.8 ms, 0 long tasks | **p50 33 ms, p95 67–83 ms, 117 frames over 33 ms, 232 long tasks** |
| One F10 → painted | 17 ms | 42–51 ms | 31–33 ms | 133–141 ms |

Conclusion: **it is needed.** At this machine's normal speed, scrolling holds up even with all rows in the DOM.
But filling takes hundreds of ms, and with the CPU 4× slower half of the scrolling stutters and one step takes over 0.1 seconds.
The virtual list is already in this app (`src/renderer/app/logic/virtual.ts`, 10 rows before and after the visible rows).
Appending `?text=full` keeps all rows, for comparison.
