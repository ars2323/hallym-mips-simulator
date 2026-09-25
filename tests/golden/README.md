# Golden files

The cases (name, program, arguments, stream) are listed in `cases.txt`, which
both `tools/capture-goldens.sh` and `tools/regress.sh` read.

`intregs-*.txt` are what **File > Save Log File** writes for the integer
registers, captured from the *upstream* register rendering (commit before the
register panel was replaced in stage 3) with helloworld.s:

| file | state |
|---|---|
| `intregs-load.txt` | loaded, nothing run |
| `intregs-step1.txt` | one single step |
| `intregs-run.txt` | run to completion (hex, the default) |
| `intregs-run-base2.txt`, `intregs-run-base10.txt` | same, Registers > Binary / Decimal |

`tools/regress.sh` regenerates them from the current build and requires a
byte-for-byte match: the log must not change when the panel does.

They were captured by `tools/capture-goldens.sh` from a build of commit
2626cc0 -- the last one whose register window is upstream's -- under a pinned
environment (`env -i`, three fixed variables).  The environment matters: SPIM
copies the process environment onto the simulated stack, so `$sp`, `$a1` and
`$a2` move with it.  The regression check replays the same environment.

`text-*.txt` are the same for the Text window, captured from the last commit
whose text window is upstream's (the "[5] log text seam for the Text window"
commit).  Two upstream bugs are preserved in them on purpose, because they are
what upstream writes to a log:

- `text-breakpoint.txt`: the line with a breakpoint reads
  `N [x0040002] x3402000   ori ...` -- upstream slices the core's line at fixed
  offsets, and the core prefixes `*` to a line with a breakpoint
  (docs/ARCHITECTURE.md §3.5).
- the `text-no*` cases pass `--redisplay`: upstream's Text Segment toggles do
  not redraw the window themselves (their "changed" test is inverted), so
  without a forced redraw the toggled state would not be in the log.

`data-*.txt` are the same for the Data window, captured from the last commit
whose data window is upstream's (the "[6] log text seam for the Data window"
commit).  They include the whole stack, environment strings and all (the
pinned three variables): the Data panel folds that area on screen, but a saved
log has always contained it and still does.  `data-sample-*` use
`tests/samples/data-stack.s`, which writes to `.data` and keeps a stack frame.

`syntaxerror-*.txt` hold the state after a file that stops assembling at a
syntax error half way (`tests/samples/syntax-error-midfile.s`): text, data,
the message log, and registers/log after Run.  They were captured from the
`stage-6` build, the last one that loads files with the core's own
`read_assembly_file()`; since then the GUI uses its line-for-line mirror
(`QtSpim/edu/edu_loader.cpp`), which has to reproduce them byte for byte.
All cases are run from the repository root with a relative program path, so
that the path inside an assembler message does not depend on the checkout.

## Goldens that must be recaptured when the version is bumped

`syntaxerror-log.txt` and `syntaxerror-run-log.txt` are the **message window**
(`--dump log`), so they contain the startup banner, and the banner prints
`EDU_VERSION`. When the version in `edu/edu_version.h` is bumped, recapture only
these two with `tools/capture-goldens.sh`. The `*-log` goldens that Save Log File
writes contain no version.
