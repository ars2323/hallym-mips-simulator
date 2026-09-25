# Windows checklist — 1.2.0

The automated checks that run on Linux (unit tests, regression, editor checks, offscreen captures)
cannot verify **things that depend on the window manager and the display scaling**. Below is the list
a person has to go through once on Windows. Items marked with a star (★) are ones that **in principle**
cannot be checked on Linux and are verified for the first time in this release.

Use the zip and MSI assets of release v1.2.0.

## 1. Installation and launch

- [ ] Unpack `HallymMIPS-1.2.0-win64.zip` and run `HallymMIPS.exe`. It starts without administrator rights.
- [ ] Install `HallymMIPS-1.2.0-win64.msi` → "Hallym MIPS Simulator" appears in the Start menu.
- [ ] On a PC with 1.1.0 installed, the 1.2.0 MSI **installs over it (upgrade)**. Two entries do not remain.
- [ ] Uninstalling from the Control Panel leaves no installation folder behind.
- [ ] On a PC with standard QtSpim installed, both run normally and the `.s` file association is not switched between them.
- [ ] On an account with a Korean user name (`C:\Users\김학현\…`), opening, saving and assembling files work.
- [ ] Opening a CP949 `.s` file containing Korean comments shows the characters ungarbled, and after saving, the line endings are still CRLF.

## 2. Window appearance

- [ ] ★ The title bar is **light**. Even when Windows is switched to the dark theme, the window keeps a white title bar with navy text.
- [ ] ★ The taskbar icon appears as **the symbol on a white tile**. Its shape does not smear on either a dark or a light taskbar.
- [ ] ★ Start menu and desktop shortcuts (48px and up) show the emblem; the taskbar and the top-left corner of the window (32px and below) show the symbol.
- [ ] ★ At display scaling of 125% and 150%, text is not cut off and panel borders are not blurry.
- [ ] On a 1366×768 laptop, the 8 register groups fit **on one screen without scrolling** (with the inspector open).

## 3. First-run tutorial — three layouts ★

The tutorial is reopened with **Help > Tutorial**. The tutorial always opens the example (`samples/tutorial.s`). At every step, check three things:
**(a)** the screen is dimmed and only the place being pointed at is bright, **(b)** the card is fully inside the window and
its buttons can be pressed, **(c)** the card text is not blurry.

- [ ] Go through all 18 steps to the end in the **default layout**.
- [ ] Reopen the tutorial in the **tabbed layout** (after dragging Text and Data onto one spot to make them tabs). This is the layout in which the card disappeared in 1.0.0.
- [ ] Reopen the tutorial in the **side-by-side layout** (Editor and Text left and right).
- [ ] Reopen the tutorial in the **detached layout** (one panel pulled out of the window as a separate window). The tutorial overlay is only over the main window and does not cover the detached window.
- [ ] When the window is maximized/restored or resized, the dimmed area and the card follow the window.
- [ ] Minimizing the window makes the overlay disappear with it, and restoring it returns to the same step.
- [ ] Bringing another program to the front does not leave the overlay on top of it.
- [ ] With two monitors, moving the window to the other monitor (better if its scaling differs) keeps the dimmed area exactly over the window.
- [ ] The tutorial can be followed to the end and exited using only Enter, →, ← and Esc.
- [ ] Pressing "English" on the card to switch to English changes only the sentences, on the same step.
- [ ] Opening **Help > Tutorial** while there are unsaved edits asks whether to save. With **Cancel**, the tutorial does not start and the text being edited stays as it is.
- [ ] Choosing **Don't save** (Discard) opens the example and starts the 19-step tutorial.
- [ ] Clicking the card's [다음] (Next) · [이전] (Back) · [건너뛰기] (Skip) **with the mouse** does not end the tutorial; it proceeds normally (the same behavior as the keyboard).

## 3-2. New window layout and bottom panel (1.1.0)

- [ ] The window has three columns: registers on the left (Int/FP tabs), editor + Console/Messages in the middle, Text/Data + Instruction Inspector on the right.
- [ ] Running a program that uses `read_int` **brings the Console tab to the front by itself**, and a value typed right away goes into the program.
- [ ] Causing an assembly error brings the Messages tab to the front, and if the Console tab was being viewed, a dot appears on the Messages tab.
- [ ] **Ctrl+L** collapses and expands the bottom panel.
- [ ] Both layouts in Window > Layout apply, and Window > Tile returns to the first layout.
- [ ] Selecting an instruction in the Text panel shows a bit grid in the Instruction Inspector. When the panel is narrowed, it wraps onto two lines, 31–16 / 15–0.
- [ ] Hovering the mouse over a word cell in the Data panel shows the address and the value (hexadecimal and decimal).
- [ ] On the first launch on a PC that used an earlier version, the saved layout is discarded once and the window opens in the new layout.

## 3-3. Fixed in 1.2.0 (check on Windows)

- [ ] **Unpacking**: unpacking the zip in Explorer creates **only one level** of folder, with `HallymMIPS.exe` directly inside it.
- [ ] **Start card**: every launch asks [튜토리얼 보기] (View tutorial) / [바로 시작] (Start right away). Tab and the left/right arrows move between them, Enter chooses, and the default focus is on [바로 시작].
- [ ] **Start screen**: choosing [바로 시작] shows [새 파일] (New file) · [파일 열기] (Open file) in the editor area. [새 파일] asks for the save location first.
- [ ] **Binary registers**: in Registers > Binary, Name, No. and the group names stay visible and only the values scroll horizontally. The value of a changed register **starts and ends at the same x-coordinate as the other rows** (it is not pushed by the difference in weight).
- [ ] **Register column widths**: the borders can be dragged wider and narrower, and the widths are kept after a restart. Window > Tile returns them to the default widths.
- [ ] **Korean text**: the Korean text on the tutorial card and the start screen is not blurry (heavier than in 1.1.0).
- [ ] **Instruction Inspector**: the bit numbers and the field lines read at about the same size as the Console. One line of English explanation appears below the instruction name.
- [ ] **Panel text size**: with focus in Text, Data, Inspector or Console, Ctrl+=/Ctrl+-/Ctrl+0 and Ctrl+wheel work. The right-click menu also has Zoom items. "All panels text size" in Simulator > Settings changes all four panels at once.
- [ ] **2×2 borders**: dragging the middle vertical line moves both the top and bottom rows together; dragging the horizontal line moves both columns together. Dragging the small handle at the intersection moves both.
- [ ] **File menu**: there is no Load File, only **Open (Ctrl+O)**. Opening the same file twice does not produce a duplicate `main` error.
- [ ] **Ending the tutorial**: however the tutorial is ended, the example is closed, the app returns to the start screen, and settings that were changed (such as the radix) are restored.
- [ ] **Messages**: the 3-line banner is printed only once per run (on reinitializing, only "Memory and registers cleared").

## 3-4. Fixed in 1.2.1 (check on Windows)

- [ ] **Horizontal scroll bars**: with Registers > Binary, Data > Binary (or Bytes) and Text > Comments turned on, all three panels show a horizontal scroll bar at the bottom, and scrolling all the way shows the values and comments that were cut off, to the end.
- [ ] **Frozen columns**: even when scrolled all the way, Name and No. in Registers, Address in Data, and BP and Address in Text stay on the left. The text of the segment headers ("User data segment …") is not cut off by the frozen strip and starts to the right of the strip.
- [ ] **Actions on the frozen strip**: scrolled all the way right, clicking a BP cell in Text sets a breakpoint and clicking again removes it. Right-clicking in the frozen columns shows that panel's menu (Change Memory Contents for Data, Change Register Contents for Registers).
- [ ] **Staying in place**: scrolled horizontally, stepping a few times with F10, finding an address with Data's Go to and reassembling with Ctrl+S **keep the horizontal position**.
- [ ] **After the tutorial**: scrolled horizontally, opening and ending Help > Tutorial returns to the scrolled position.
- [ ] **Start card buttons**: moving between the two buttons with Tab does not cut off their text. The two buttons are the same size.
- [ ] **Terminology**: "투어" (tour) does not appear anywhere on screen. The start card, the card text and the Help menu all say "튜토리얼 / Tutorial".

## 3-5. Fixed in 1.2.2 (check on Windows)

- [ ] **Name and value on the same row**: in Registers > Binary, the name/number and the value are on the same row. They do not get out of line when the text size is made larger or smaller with Ctrl+wheel, when the radix is changed, or when scrolled all the way down. The same goes for the frozen columns in Data and Text.
- [ ] **No left-right jumping**: scrolled horizontally, hammering F10 does not move the panel left or right **even for a moment** (in 1.2.0 it jumped for one frame on every refresh).
- [ ] **Ctrl+S ten times**: saving the same file ten times in a row does not pile up "Memory and registers cleared" in Messages; only one line with the file name is added each time. No duplicate label or undefined symbol errors either.
- [ ] **Breakpoints kept**: set two BPs, insert a line above them and press Ctrl+S; the BPs are still on **the same statements**.
- [ ] **Running with nothing loaded**: after Simulator > Reinitialize, pressing F5 shows a single line "No program is loaded…" in Messages instead of an error window with an address.
- [ ] **Panels cannot be detached**: dragging a title bar out of the window does not make it a separate window. The title bar has no float button, and double-clicking does not float it.
- [ ] **Half-screen window (960×1080)**: put the window on the left or right half of the screen and look at each of the three layouts. In the third layout (**Editor / Text / Data in one place**), each of the three panels is readable.
- [ ] **Tab dots**: in the new layout, editing the source while behind the Text tab puts a dot (●) on the Text and Data tabs, and the dot disappears when that tab is opened.
- [ ] **One round of the tutorial in the new layout**: the panel the card points to comes to the front, and at the end the tab that was being viewed comes back.
- [ ] **The same screen every time**: after changing the layout, column widths, text size and radix, closing and restarting the program brings back **all the defaults**. While running, **Window > Reset Layout** does the same.
- [ ] **Start screen**: with a file open, quitting and restarting **does not reopen** that file; the [새 파일]/[파일 열기] screen appears. Editor > Open Recent is empty too.
- [ ] **Installation**: running the 1.2.2 MSI on a PC with 1.2.1 installed **installs over it (upgrade)**, and only 1.2.2 remains in the Control Panel.

## 3-6. Fixed in 1.2.3 (check on Windows)

- [ ] **No vertical flicker**: when hammering F10, the Text panel does not flicker up and down. When the current row leaves the screen, it follows **only once**.
- [ ] **Reset ten times**: after assembling a file, pressing Simulator > Reinitialize ten times never shows a banner above Text, and F5 runs right away each time. The breakpoints remain too. The "Unsaved changes" banner appears only when there are unsaved edits.
- [ ] **Panel shape**: the heads of all five areas (Int Regs, Editor, Text, Console, Inspector) **have the same shape** — one or more tabs and an ✕ at the right end. No panel has only a title line.
- [ ] **Borders to the limit**: dragging the right-hand middle intersection as far as it goes in every direction does **not make** the two lower panels (Console, Inspector) **disappear**. The same holds when the window is shrunk to its minimum size.
- [ ] **Two layouts**: Window > Layout has only two items (no left-right flip). Look at both layouts in a 960×1080 half-screen window.
- [ ] **Text size**: change "All panels text size" in Simulator > Settings to 14pt, quit and restart, and it is **still 14pt**. Press Ctrl+= a few times, quit and restart, and it returns to 14pt. Ctrl+0 also returns to 14pt.
- [ ] **Last tutorial card**: it says that finishing returns to the start screen, and that is what actually happens.

## 4. Editor

- [ ] Ctrl+`=`/Ctrl+`-` change the text size by 1pt and stop silently at 8pt and 32pt. Ctrl+wheel does the same.
- [ ] Ctrl+`0` restores the original size. The last size is kept after quitting and restarting the program.
- [ ] After clicking the register panel, pressing Ctrl+`0` does not change the editor's text size.
- [ ] Changing the editor font in Settings resets the size relative to that font.
- [ ] Each of the three banner messages appears correctly: after editing, after Simulator > Reinitialize, and after File > Load of another file.
- [ ] An empty editor has no banner.

## 5. Panels

- [ ] Dragging a panel next to another panel makes the two share the space **half and half** (both horizontally and vertically).
- [ ] The layouts in Window > Layout presets apply as they are.
- [ ] Hovering the mouse over the column headers of Registers, Text and Data shows descriptions in Korean and English.

## 6. Are the results the same as standard QtSpim?

- [ ] Running one assignment program up to the same step in both programs gives the same register values and console output.
- [ ] A file saved with File > Save Log File has the same format as standard QtSpim's.
