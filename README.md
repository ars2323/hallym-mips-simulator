# QtSpim-Edu

An educational GUI extension of [SPIM / QtSpim](https://spimsimulator.sourceforge.net/) 9.1.24,
the MIPS32 simulator by James R. Larus. The simulator core (`CPU/`) is
**unmodified** — programs assemble and run exactly as they do in standard
QtSpim, and the test suite checks that on every push. Only the interface is
new: registers grouped by their role, an instruction panel that shows the type
and the machine-code fields of every instruction, a data/stack viewer with
labels and pointer markers, a bit-level inspector, and a built-in editor with
an error list. **Work in progress**; there is no release yet.

## License

SPIM is Copyright (c) 1990-2023 James R. Larus and is distributed under a BSD
license; the full text is in [`README`](README), which is upstream's file and
is kept as it is. The changes in this repository are offered under the same
terms. The program links to the Qt library, which is distributed under the GNU
Lesser General Public License version 3 and version 2.1.

This is a modified version and is not endorsed by the original author.

## Building

Qt 5.15, bison and flex are needed (Linux: g++; Windows: MSVC 2019 with
winflexbison). Always build out of the source tree:

```sh
mkdir -p build && cd build && qmake ../QtSpim/QtSpim.pro && make -j"$(nproc)"
```

`docs/ARCHITECTURE.md` (in Korean) describes the code, how the new panels stay
faithful to the core, and everything that intentionally differs from upstream.

## For students

A guide to what differs from standard QtSpim, and installers, will come with
the first release (stage 8 of `PLAN.md`). Until then this repository is for
development.
