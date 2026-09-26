# The Electron edition — layout, building, testing

The Electron edition (2.x) of the Hallym MIPS Simulator lives in `electron/`
of this repository; the Qt edition (1.x) is at the repository root, and the
two share the root `CPU/` (the SPIM core, unmodified; `CPU/ORIGIN.md`).
This page is for working on the Electron edition. For using it, see the
user guide (`docs/usage/usage.en.md`, `docs/usage/usage.ko.md` at the root).

What it is made of:

- a Node addon wrapping the SPIM core;
- run control that keeps the core in its own process (run, stop, breakpoints,
  console input and output);
- pure TypeScript modules ported from the Qt edition's `QtSpim/edu/core`;
- the window: Editor | Run side by side — the first screen, writing code,
  running one line at a time, the Inspector, Data (screens: `docs/screens/`);
- the twenty-step tutorial over two read-only examples
  (`src/examples/tutorial.s`, `tutorial-error.s`), keeping no state
  (`docs/PORTING.md`, section 18).

That it gives the same results as the Qt edition is checked by the goldens and
by tests against the core. `docs/ARCHITECTURE.md` describes the structure;
`docs/PORTING.md` records what differs from the Qt edition and why.

## Layout

Paths below are relative to `electron/`.

```text
../CPU/             the SPIM core, shared with the Qt edition, unmodified (../CPU/ORIGIN.md)
native/
  binding.gyp       the core's nine sources + the bison/flex actions + the addon
  src/addon.cc      N-API front end: the globals and callbacks the core needs, and the bindings
  index.ts          the Node boundary; paths, encodings and run parameters are handled here only
src/core/           pure, synchronous TS modules (ported from the Qt edition's QtSpim/edu/core)
  decoder  registers  format  instruction-text  source-text  symbols
  memory-rows  memory-text  mips-syntax (+ op-table, generated from ../CPU/op.h)  asm-errors  explain (the Inspector's sentence)
src/node/
  text-file.ts      source file bytes <-> text (UTF-8 / CP949 / Latin-1)
src/sim/            the simulator process and its boundary (docs/ARCHITECTURE.md)
  host.ts           host side: requests and replies, events, crash detection and restart
  worker.ts         the simulator process: running a stretch, stopping, the console
  transport.ts      starting the process and talking to it (fork in the Node tests, utilityProcess in the app)
  protocol.ts       the types of the messages that cross the boundary
tests/
  core/  node/      tests per module (node:test)
  renderer/         the window's pure logic (visible rows, changed registers, stop -> state, columns, placement)
  e2e/              the real app through Playwright _electron.launch(): flows, Korean input, hex fonts, fit, tutorial
  sim/              simulator process tests (stop, breakpoints, crash recovery, console)
  golden/           the Qt edition's goldens + this app's default goldens (tests/golden/README.md)
  helpers/          golden parser, case replayer, tools to compare with the core, the Node tests' preload
  programs/ samples/  input programs (copied from the Qt edition + Korean-encoding samples)
  spike/            the first spike's checks
tools/
  mutants.ts        mutation checks: does each test catch what it is for
  package.ts        electron-builder packaging (docs/PORTING.md, section 13)
  licenses.ts       the licenses of the bundled npm packages
  probe-platform.ts simulator handles, native file dialogs (platform checks)
  windows/check-side-by-side.ps1  installing next to the Qt edition 1.2.4
  windows/check-upgrade.ps1       installing over the build before the merge
  scanner-input-experiment.ts   measuring a difference in source-line display (docs/PORTING.md, section 1)
  gen-op-table.ts   ../CPU/op.h -> src/core/op-table.ts
  capture-default-goldens.ts    takes the default goldens
  build-ui.ts       bundles the window's script (esbuild) -> build/renderer/app.js
  capture-screens.ts   the fixed set of screens of the real app -> docs/screens/
  measure-ui.ts     register updates, frames while running, the Text panel on tt.core.s
src/main/            the Electron main process (host: simulator, files, settings) and preload
src/renderer/app/    the window (docs/ARCHITECTURE.md, section 6)
src/renderer/assets/ Hallym University assets, fonts, icons (see ../NOTICE)
src/examples/        the tutorial's examples
packaging/icons/     the application icon (a Hallym University asset, as in the Qt edition)
design/mockups/      the layout mockups' sources (docs/mockups/README.md)
docs/                ARCHITECTURE, PORTING, WINDOWS, UI-ROUND1, screens/, mockups/, this page
```

CI: `../.github/workflows/electron.yml` (Windows), which runs for changes
under `electron/` or `CPU/`.

## The simulator (`src/sim/host.ts`)

```ts
const sim = await Simulator.start();
await sim.assemble(bytesOrText, { run?, fileName? });   // { ok, errors, symbols, format }
sim.on('console', (text) => ...);                        // as it is printed
const r = await sim.run();       // { reason: exit | error | breakpoint | input | stopped | limit, pc, errors }
await sim.call('provideInput', '42\n');  // after reason 'input': the next run/step starts from that syscall
await sim.stop();                // 'stopped' — the machine stays as it is, to be inspected
await sim.call('setBreakpoint', addr);  sim.call('registers');  sim.call('readWords', addr, n) ...
sim.on('crashed', ({ message }) => ...); // '시뮬레이터가 중단되었습니다' (the simulator stopped) — a new process is already up
```

The core is not in this process but in the simulator process. Only **bytes**
go into C++ through the addon there (`native/index.ts`): neither paths nor
encoding logic are in C++. Sources are read through a flex memory buffer
(`yy_scan_bytes`).

## Building and testing (Linux)

Needed: Node >= 22.18 (it runs TypeScript directly, stripping the types),
g++, make, python3, bison, flex. node-gyp is a devDependency of the project.
From `electron/`:

```sh
npm install --ignore-scripts
npm run build          # native/build/Release/spim.node
npm run typecheck      # tsc --noEmit
npm test               # all tests (the Qt goldens and the default goldens too)
npm run test:mutants   # each mutant makes its tests fail
npm run spike          # the first spike's checks 1 and 2
npm run build:electron # the addon against Electron's headers (N-API: the Node build opens in Electron too)
npm run build:ui       # bundles the window's script (electron, e2e and screens call it first)
npm run electron       # starts the app
npm run e2e            # e2e tests of the real app (Playwright)
npm run screens        # the fixed set of screens -> docs/screens/ (docs/screens/README.md)
npm run measure:ui     # measurements of the window -> build/measure-ui.json
npm run mockups        # the layout mockups -> docs/mockups/
npm run package        # the installer (NSIS, per user), one file -> dist/ (on Windows; build:electron first)
npm run package:dir    # only this platform's unpacked package -> dist/*-unpacked (for checking)
```

Whatever opens the window (electron, e2e, screens, measure:ui, the window
mutants) needs a display. On Linux without one, run it under xvfb:
`xvfb-run -a -s '-screen 0 2400x1400x24' npm run e2e`.

Windows is done by GitHub Actions (`electron.yml`): build, the Node tests,
the package, the installer put next to the Qt edition 1.2.4 to see that they
do not collide, e2e against the installed app, handles, file dialogs and
screen captures; run by hand or for a `v2.*` tag it also installs over the
build before the merge. The installer is uploaded as an artifact; a release
is made from it by hand. Results, and what to check by hand, are
in `docs/WINDOWS.md`. macOS has not been tried.
