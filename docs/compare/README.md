# Standard QtSpim and Hallym MIPS 2.x, side by side

One set of six pairs, used by the [README](../../README.md#whats-different)
and by [`../edutech/`](../edutech/README.md). Every picture here is made by
[`electron/tools/capture-compare.ts`](../../electron/tools/capture-compare.ts);
none is edited by hand. To make them again (Linux, with xdotool and
ImageMagick), from `electron/`:

```sh
xvfb-run -a -s '-screen 0 2400x1400x24' node tools/capture-compare.ts
```

## Conditions

Both programs under the same conditions:

| | Standard QtSpim 9.1.24 | Hallym MIPS 2.x |
|---|---|---|
| Build | from the tag `vanilla-9.1.24` of this repository, unmodified | this repository |
| File | [`electron/tests/samples/data-labels.s`](../../electron/tests/samples/data-labels.s) | the same |
| Steps | 13 × Single Step (F10): PC at `lw $t2, 4($t1)` (line 14, `0x00400040`) | the same |
| Window | 1600 × 900 | 1600 × 900 |
| Font size | its default: Courier 10 pt (13 px at 96 dpi) | its default: 13 px |
| Layout | its default: docked panels, the Console a window of its own | its default |
| Settings | none saved (a fresh settings directory) | none (it keeps none) |
| System | Linux, Xvfb, no window manager, `USER=student` | the same |

Pair 5 uses the same file with one mistake on line 14 (`4(t1)` for `4($t1)`);
pair 6 opens no file. Each picture carries its own conditions under it.

In pair 6, QtSpim's Console window is outlined: with no window manager it
opens at (0, 0) behind the main window, and the tool moves it to (780, 270)
so that it can be seen.

## The pairs

| | Pair | QtSpim alone | Hallym MIPS alone |
|---|---|---|---|
| 1 | [01-registers.png](01-registers.png) | [originals/01-registers-qtspim.png](originals/01-registers-qtspim.png) | [originals/01-registers-2x.png](originals/01-registers-2x.png) |
| 2 | [02-text.png](02-text.png) | [originals/02-text-qtspim.png](originals/02-text-qtspim.png) | [originals/02-text-2x.png](originals/02-text-2x.png) |
| 3 | [03-inspector.png](03-inspector.png) | [originals/03-inspector-qtspim.png](originals/03-inspector-qtspim.png) | [originals/03-inspector-2x.png](originals/03-inspector-2x.png) |
| 4 | [04-data.png](04-data.png) | [originals/04-data-qtspim.png](originals/04-data-qtspim.png) | [originals/04-data-2x.png](originals/04-data-2x.png) |
| 5 | [05-editor-errors.png](05-editor-errors.png) | [originals/05-editor-errors-qtspim.png](originals/05-editor-errors-qtspim.png) | [originals/05-editor-errors-2x.png](originals/05-editor-errors-2x.png) |
| 6 | [06-first-start.png](06-first-start.png) | [originals/06-first-start-qtspim.png](originals/06-first-start-qtspim.png) | [originals/06-first-start-2x.png](originals/06-first-start-2x.png) |

[window.png](window.png): Hallym MIPS's whole window after the same 13 steps,
on the Data tab.

The originals are each side alone at full size, for use elsewhere; the pairs
show pairs 5 and 6 at half size.

## What differs in the machine

The simulation is the same. Hallym MIPS is built on SPIM's core,
[`CPU/`](../../CPU/), which is byte for byte the core of the tag
`vanilla-9.1.24` (`tools/regress.sh` checks it); and given the same run
parameters it ends in the states — registers, memory, messages — that the
goldens of [`electron/tests/golden/`](../../electron/tests/golden/README.md)
record, in all 29 cases, on every test run.

One run parameter is set on purpose in Hallym MIPS: every program starts with
the same stack, `argv[0]` = `program.s` and no environment variables, so that
every student sees the same memory. QtSpim puts the user's environment on the
stack. That is why `$sp`, `$a1`, `$a2` and the top of the stack differ between
the two sides of these pictures.
