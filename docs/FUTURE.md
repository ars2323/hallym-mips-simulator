# Not done · to consider later

Things left outside the scope of 1.0.0. In no particular order.

## Screen

- **FP register tab**: as in the original. Single/double precision interpretation and a bit breakdown (sign, exponent, mantissa), with the same tree + inspector as Int Regs.
- **Showing the executing line in the editor**: make the PC row in Text and the source line in the editor (the line number from `SOURCE(inst)`) follow each other.
- **Editor**: find/replace, undo menu items, indentation help, a dark theme. Clearing the recent files list.
- **Data panel**: highlighting words whose value changed (as for registers), grouped views by string/array, expanding zero runs directly.
- **Console**: as in the original. An indicator that it is waiting for input.
- Display language: menus and dialogs are all in English. A Korean translation (.ts). Only the first-run tutorial exists in both Korean and English.
- **Tutorial**: at present it ends after pointing out 7 panels. Hands-on steps such as "try pressing Ctrl+S", saving progress, short help for individual features (breakpoints, Go to, layout presets).
- **App icon**: 48px and larger is the round emblem, smaller sizes are the symbol (1.0.1). If mixing the two marks looks awkward, one option is to use the symbol everywhere (`docs/design/captures/app-icon-options.png`).

## Assembler · program structure

- **Several files as one program**: at present this is possible only through Load File's "Add to current program", and the editor handles only one file.
- **Seeing the errors after the first syntax error all at once**: the core's parser stops there. Hard to do without modifying `CPU/`.
- **Local labels of the exception handler** that the code does not reference: the core reads the handler itself, so the loader mirror does not reach it (ARCHITECTURE §15.2).

## Distribution

- **Code signing**: not done. A SmartScreen warning appears.
- **Automatic updates**: none. A new version is downloaded from the releases page and copied over the old one.
- macOS / Linux packages: Linux is source build only; macOS has never been checked.
- The original WiX sources for MinGW (`Setup/QtSpim_Win_Deployment`) were left untouched.

## Problems in the original, left unfixed

See `docs/ARCHITECTURE.md` §12 and section 5 of `docs/GUIDE-ko.md`: the garbled log on breakpoint lines, the error line number that is one line late (in the log), the `Shift-F5` shortcut label, and paths outside the system locale cannot be opened (the core's `fopen(char*)`).
