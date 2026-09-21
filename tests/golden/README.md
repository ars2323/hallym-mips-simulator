# Golden files

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
a38ebaa -- the last one whose register window is upstream's -- under a pinned
environment (`env -i`, three fixed variables).  The environment matters: SPIM
copies the process environment onto the simulated stack, so `$sp`, `$a1` and
`$a2` move with it.  The regression check replays the same environment.
