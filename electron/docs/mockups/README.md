# Layout mockups

Static mockups made to decide on a direction before building the real UI. They do nothing.
**All of their content is real simulator output.** No value was written by hand (`design/mockups/data.ts`).

| Scene | Data |
|---|---|
| A Start screen | Recent file names (files that are in the repository) |
| B Writing code | The result of assembling `lab04.s` (week 4 lab, Qt edition `slides/course/src`). `srll` on line 15 is a real error |
| C Single-stepping | The fixed `lab04-ok.s` after 16 steps. PC `0x0040004c` (`sll`); the register just changed is `$t6 = 0x80000001` |
| D Inspector open | In the same state, `sra $s1, $t6, 1` (`0x00400054`) is selected. The field table is the output of `src/core/instruction-text.ts` |

To regenerate: `npm run mockups` (on Linux without a display, `xvfb-run -a -s '-screen 0 3400x1800x24' npm run mockups`).
The sources are in `design/mockups/` (HTML/CSS/JS), rendered with Electron (the same engine as the app).

## File names

`<scene>-<direction>-<width>x<height>.png`. Example: `D-2-1280x800.png` is scene D, direction 2, 1280×800.
The comparison sheet is a single image, `sheet.png`.

There are three widths.

- 1920×1080: maximized
- 1280×800: laptop
- 960×1080: the left or right half of a 1920 screen

The files, all of them ([`sheet.png`](sheet.png) puts them side by side):

| Scene | Direction | 1920×1080 | 1280×800 | 960×1080 |
|---|---|---|---|---|
| A | 1 | [A-1-1920x1080.png](A-1-1920x1080.png) | [A-1-1280x800.png](A-1-1280x800.png) | [A-1-960x1080.png](A-1-960x1080.png) |
| A | 2 | [A-2-1920x1080.png](A-2-1920x1080.png) | [A-2-1280x800.png](A-2-1280x800.png) | [A-2-960x1080.png](A-2-960x1080.png) |
| B | 1 | [B-1-1920x1080.png](B-1-1920x1080.png) | [B-1-1280x800.png](B-1-1280x800.png) | [B-1-960x1080.png](B-1-960x1080.png) |
| B | 2 | [B-2-1920x1080.png](B-2-1920x1080.png) | [B-2-1280x800.png](B-2-1280x800.png) | [B-2-960x1080.png](B-2-960x1080.png) |
| C | 1 | [C-1-1920x1080.png](C-1-1920x1080.png) | [C-1-1280x800.png](C-1-1280x800.png) | [C-1-960x1080.png](C-1-960x1080.png) |
| C | 2 | [C-2-1920x1080.png](C-2-1920x1080.png) | [C-2-1280x800.png](C-2-1280x800.png) | [C-2-960x1080.png](C-2-960x1080.png) |
| D | 1 | [D-1-1920x1080.png](D-1-1920x1080.png) | [D-1-1280x800.png](D-1-1280x800.png) | [D-1-960x1080.png](D-1-960x1080.png) |
| D | 2 | [D-2-1920x1080.png](D-2-1920x1080.png) | [D-2-1280x800.png](D-2-1280x800.png) | [D-2-960x1080.png](D-2-960x1080.png) |

## Two directions — the same principle, different choices where interpretations diverge

Principle: **a panel takes up space only when it has content.**

- The Inspector does not exist before an instruction is selected.
- Data shares tabs with Text.
- The console is one line when there is no output.
- The registers widen when running.

| Where interpretations diverge | Direction 1 — stage switching | Direction 2 — flow |
|---|---|---|
| How to change phase | A **[코드]/[실행]** ("Code"/"Run") switch at the top. The whole screen changes with each phase | No switch. Running folds the editor into a **rail (48px)** on the left and unfolds the registers |
| Registers | **Fixed on the left** while running (530–540px, hex, decimal, binary) | **On the right**. Folded into a 44px strip while writing code, unfolded when running |
| Inspector | **A sheet that slides up from the bottom.** The list scrolls so that the selected line is visible above the sheet | **A panel that opens at the side.** At 1280 the registers fold into a strip, and only the register just changed (`$t6`) stays in the strip |
| 960px | Fewer columns: Text **on top**, registers **below** (two columns, hex and decimal; binary only in the "방금 바뀜" ("just changed") box) | Folded into tabs: a **bottom tab bar** (code, machine code, registers, console). A "just changed" chip above the machine code tab. The Inspector is an 88% overlay from the right |
| Start screen | A centered card: greeting character + four ways to start + recent files | A hint inside the empty editor: the guide character points to the start button with an arrow |

### What we learned from the mockups

- **Direction 1's code phase (B) leaves width unused at 1920.** Only the editor uses the full width. It could be filled by, for example,
  putting a "machine code preview" beside it only after a successful assembly.
- **Direction 1's sheet cuts Text down to 9 lines at 1280×800.** The selected line is visible, but it is narrow for seeing the flow before and after.
  On the other hand, it does not cover the registers.
- **Direction 2's side panel folds the registers into a strip at 1280.** While looking at the bits you cannot see all the registers;
  only the one that changed stays in the strip. On the other hand, Text uses the full height.
- **At 960 the two differ greatly.** Direction 1 shows Text and the registers at the same time (the two things needed for single-stepping).
  Direction 2 shows one at a time and makes up for it with the chip.
- To show the register binary column on one line as well, the column needs about 530px (D2Coding 13px, 32 bits with a space every 4 bits).
  Narrower than that, it is better to show binary "only for what changed".
- **Pretendard turns `0x1` into `0×1`** (even with `calt` off). Hexadecimal is set in D2Coding, not the UI
  font. The whole mockup does this.

## Where the characters are used

They are placed only where there is nothing else. Only on white surfaces, never on teal surfaces. The original PNGs were only scaled down with CSS,
at heights of 130–210px (at least 76px).

| Place | Character | Mockup |
|---|---|---|
| Start screen (direction 1) | `hello` (greeting) | A-1 |
| Empty editor (direction 2) | `guide` (guide). Placed to the right of the button so that its arrow points to the start button | A-2 |

Places left without one: the toolbar, panel heads, the status bar, the error list (B), the changed-register highlight and the bit fields (C, D; places where the color itself is the information).

Places outside the four scenes, so not rendered:

- Calling up the Inspector without selecting an instruction shows `sign` (signpost) and "Text 에서 명령어를 고르세요" ("Select an instruction in Text").
  The text is placed beside the sign, not on its board.
- Expanding an empty console shows `talk` (communication).
- The 20-step tutorial uses `guide`, `teach`, `curious` and `best`.
- `congrats` appears once on the first successful run, and does not appear again once closed.

## What to hide by default (not removed; shown when needed)

| From QtSpim | How | Rationale |
|---|---|---|
| Print | Into the "더 보기" ("More") menu | Assignments are handed in as files. There is no scene where printing the screen is used |
| Several layout presets | Removed → automatic by phase | The cause was that "panels always demand space". Presets only let people choose the symptom |
| Kernel text/data display toggles (menu) | One line at the end of the list: "커널 코드 52개 숨김 · 보기" ("52 kernel instructions hidden · Show") | The exception handler is not student code. It is expanded in place instead of through an on/off menu |
| bare machine · delayed branches · delayed loads · mapped I/O · allow pseudo-instructions · quiet | "고급 설정" ("Advanced settings") dialog | Labs use only the defaults. bare is already blocked in the Qt edition. Turning on delayed branches changes the branch explanation (PC+4) |
| Run Parameters dialog | Inside "고급 설정" | With the default `argv=["program.s"]` everyone sees the same stack (docs/PORTING.md section 4). The only reason to change it is an assignment that uses argv |
| Choosing an exception handler file | Inside "고급 설정" | No course uses anything but the default handler |
| FP registers | Hidden by default. They appear on their own if the program has FP instructions (FR/FI format) | During integer labs they only take up space |
| CP0 registers | A folded group. Expanded when an exception occurs | Looked at only when learning about exceptions |
| Text column toggles (value, comment) | Removed. When narrow, columns fold on their own, starting with the machine code column | It is a problem of insufficient width, so the width decides |
| Data/register number base menus | A small switch in the panel head | Buried three menu levels deep, so nobody finds them |
| Clear Registers · Reinitialize | Merged into one, "처음으로" ("Back to start"). Assembling always starts afresh | Students do not need to know the difference between the two |
| Display Symbols | Removed → labels are visible directly in Text/Data | There is no scene where a list in a separate window is looked at |
| Breakpoint-reached modal | Announced only by the status bar and the PC line | A modal covers the registers |
| Font and color settings dialog | Removed → only Ctrl+/− zoom | There is one theme. Being able to change the size is enough |
| Save Log File | Into the "더 보기" menu | TAs use it occasionally. It is not a button students look at every time |
