# CPU/ — origin

**This directory is not modified.**

The SPIM simulator core (James R. Larus, BSD license), from SPIM/QtSpim
9.1.24 (SVN r764; tag `vanilla-9.1.24` in this repository).  Both
applications build from this one copy:

- the Qt edition (1.x, `QtSpim/`), through `QtSpim/QtSpim.pro`;
- the Electron edition (2.x, `electron/`), through `electron/native/binding.gyp`
  (as `../../CPU`) and the tools and tests that read `CPU/op.h`,
  `CPU/reg.h` and `CPU/exceptions.s`.

Both follow the same rule: the core is left alone, and everything either
edition needs is done outside it.  Where the Electron edition has to change
how the core behaves, it wraps the core's functions in
`electron/native/src/addon.cc`, or compiles a file through a wrapper
(`electron/native/src/run-win.cpp`, Windows only), and `CPU/` stays byte for
byte as it is.

Until 2026-09-25 the Electron edition lived in its own repository
(`ars2323/hallym-mips-simulator-electron`, now archived) with a copy of this
directory taken from commit `c20d0c3`.  When the two repositories were
merged, all 28 files of the two copies had the same SHA-256; the copy was
dropped and this file, the only one the Electron repository had added, moved
here.  It is the only file in `CPU/` that is not upstream's.

To check that `CPU/` is still upstream's:

```sh
git diff --stat vanilla-9.1.24 -- CPU ':!CPU/ORIGIN.md'
```

No output: unchanged.
