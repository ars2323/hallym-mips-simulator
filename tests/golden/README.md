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
byte-for-byte match: the log must not change when the panel does.  They were
captured with an empty settings store and no run parameters, which is what
the script reproduces; `$sp` and friends depend on the argument string.
