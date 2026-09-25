# ARCHITECTURE — what lives in which process, and why

The host is Electron's main process (`src/main/main.ts`), which starts the simulator process as a `utilityProcess`.
In Node tests the same host starts it with `child_process.fork()`. The only difference between the two is inside `transport.ts` (section 4).

```text
┌─ Host process (Electron main / Node tests) ────────────────────────────────┐
│  src/sim/host.ts        Simulator: request/response pairing, events,       │
│                         death detection and restart, last resort for stop  │
│                         (kill)                                             │
│  src/sim/transport.ts   Transport: starts the process and talks to it      │
│  src/core/*             (pure modules the UI uses; usable in any process)  │
└───────────────▲──────────────────────────────┬─────────────────────────────┘
                │ responses, events            │ request {id, method, args}
                │ (structured clone)           ▼
┌─ Simulator process (utilityProcess / fork) ────────────────────────────────┐
│  src/sim/worker.ts      slice run loop, request handling, console decoding │
│  native/index.ts        Node boundary: encoding, run parameters, byte      │
│                         conversion                                         │
│  native/src/addon.cc    N-API: the core's globals and callbacks, bindings  │
│  CPU/ (repo root)       SPIM core (unmodified, shared by both editions)    │
└────────────────────────────────────────────────────────────────────────────┘
```

`CPU/` is the repository's shared root `CPU/` directory (one copy of the SPIM core for both the Qt and the Electron editions), not a directory under `electron/`.

## 1. Why the core lives on its own

Four properties of the core point to the same conclusion.

| Property of the core | If it were in the same process as the host |
|---|---|
| All of its state is process-global (one machine per process) | The only way to create a new machine is to start a new process |
| Every run sets `signal(SIGALRM)` and `setitimer` on the **whole process** | It would touch the host's (Electron main's) signal and timer state |
| `fatal_error()` must not return (section 3 below) | One student program (the `.err` directive) would end the whole app |
| `run_program()` is a synchronous call | An endless loop would stop the host's event loop (the window freezes) |

So the core and the code that touches it directly (`native/`, `src/sim/worker.ts`) exist only in the simulator process.
The host does not `import` the core.

The modules in `src/core/` (decoder, formatter, row splitting …) are **pure and synchronous** and have no module-level state.
So they can be used in any process. The UI uses them in the renderer to build what it displays.
Everything asynchronous and stateful lives only at the boundary (`native/index.ts`, `src/sim/`).

## 2. What crosses the boundary

The transport is structured clone (`fork(…, { serialization: 'advanced' })`, later utilityProcess's
`postMessage`). Only plain objects, strings, numbers and `Uint8Array` cross. Functions and classes do not.
The types are in one place, `src/sim/protocol.ts`.

**Request → response** (`{type:'request', id, method, args}` → `{type:'response', id, ok, value|error}`)

| Call | When it answers |
|---|---|
| `assemble(source, options)` | Immediately. `source` is the file's bytes (`Uint8Array`) or a string |
| `run()` | When the program stops: `{reason, pc, errors}` |
| `step(n)` | After executing n instructions (or when it stops before that) |
| `stop()` | Immediately (`{wasRunning}`). The result of actually stopping arrives as the response to the `run()` that was in progress |
| `provideInput(text)` | Immediately. One or more lines of console input (converted to UTF-8 and put in the core's input queue). See "Console input" below |
| `setBreakpoint` · `clearBreakpoint` · `breakpoints` | Immediately |
| `registers` · `readWords` · `readBytes` · `textSegment` · `segments` · `registerNames` · `disassemble` | Immediately. While running, between one slice and the next |

- While running, only reads and `stop` are accepted. Requests that change the machine (`assemble`, setting breakpoints, a second `run`)
  are refused with `busy`. Because reads happen between slices, registers and memory are always from a single point in time.
- There are six reasons for stopping (`reason`). The UI reacts differently to each.

| reason | Meaning |
|---|---|
| `exit` | The program has ended (syscall exit). The next `run` starts again from the beginning (same as QtSpim) |
| `error` | The core raised a run-time error and cannot continue. `errors` holds the core's message |
| `breakpoint` | The PC is at a breakpoint. That instruction has not been executed yet. The next `run`/`step` executes starting with that instruction |
| `input` | The PC is at a read syscall (5, 6, 7, 8, 12) and there is no input to read. The syscall has not been executed yet. After `provideInput`, the next `run`/`step` executes starting with that syscall |
| `stopped` | The user called `stop()`. The machine is left exactly as it stopped |
| `limit` | `step(n)` has executed all n instructions |

**Events** (simulator → host)

| Event | Content |
|---|---|
| `ready` | The process is ready to accept requests |
| `console` | Text the program printed. At the end of every slice, in the order it was printed |
| `progress` | The PC and approximate instruction count while running. A few times per second |

**Console bytes → text**: the core prints bytes. The addon passes the bytes through unchanged, and the worker
decodes them with a streaming `TextDecoder`. Even when a Hangul character is printed one byte at a time with `print_char`, in different
slices, the character does not break (`tests/sim/process.test.ts` 4).

**Console input**: the core calls `read_input()` **synchronously**, in the middle of a read syscall. Waiting there would
stop the worker, and then it could accept neither `stop` nor reads. So instead of waiting, it **rewinds**.
If the queue is empty, the addon records the PC, `$v0` and `$f0` from just before that syscall and turns on `force_break`.
When the core stops, `run` restores those three and returns `input`. The machine is exactly as it was before the syscall was executed.
`provideInput` only puts bytes in the queue. The next `run`/`step` executes the syscall from the start,
and then `read_input()` takes one line from the queue (line by line, like the SPIM console).
The host never blocks, and while waiting for input the machine is the same as a stopped one, so anything can be read.
Assembling a new program discards any remaining input. (`docs/PORTING.md` section 10)

**Death**: when the process ends (section 3 below), the host finishes every pending request with `SimulatorCrashed`.
It then emits a `crashed` event (`message: '시뮬레이터가 중단되었습니다'` ("The simulator has stopped")) and starts a new process.
The new process's machine is empty. Assembling the program again is the host's (the UI's) job.

## 3. Running, stopping, failures

- **Running**: the worker repeats `run(10000)`. 10,000 instructions take about 2.6 ms (the core runs about 3.8 million instructions per second).
  At the end of every slice it sends the console output and yields once to the event loop with `setImmediate`.
  Requests that arrived in that gap are handled.
- **Stopping (`stop`)**: the worker is marked as stopping, and the loop ends before the next slice. At the latest, one slice later.
  Because the process is not killed, after stopping an endless loop the registers, memory and PC can be seen exactly as they are.
  This is the educational core of this tool.
- **Last resort**: only if the run has not ended within `stopTimeoutMs` (default 2 seconds) after `stop` does the host
  kill the process and start a new one (`stop()` returns `'killed'`). The machine is lost.
  Because slices are short, this does not happen normally. It happens only when the worker is truly unresponsive
  (the tests imitate this with `testHang`, which is accepted only when `SPIM_TEST_HOOKS=1`).
- **`fatal_error()`**: the core assumes this function does not return. The addon writes the message to stderr and
  calls `_exit(70)`. The host learns the reason from exit code 70 and `SPIM core fatal error: …` on stderr, and reports it.
  Why it is not `abort()` is in `docs/PORTING.md` section 8. An example a student program can reach is
  the `.err` directive (`parser.y`).

## 4. utilityProcess — expected and actual

As expected, the only place that changed is `src/sim/transport.ts`. `utilityTransport()` was added, and the worker side
uses `process.parentPort` if it exists. The host (`host.ts`) and worker (`worker.ts`) were not modified.
Below are the expectations written in the first version and what was actually measured with Electron 44.4.5 (Node 24.21.0) on Linux.

| | Expected (first version) | Actual |
|---|---|---|
| Starting | `utilityProcess.fork(worker.js, …)`. Built JS would be needed | With `utilityProcess.fork(worker.ts, [], { stdio: 'pipe', serviceName, env })` **the `.ts` runs as is.** Electron's Node 24 strips the types. The main process also starts as is with `electron src/main/main.ts`. The path after packaging (asar) is not known yet |
| Host → worker | `child.postMessage(m)` | Correct. Because it is structured clone, `Uint8Array` crosses as is |
| Worker → host | `process.parentPort` | Correct. `parentPort.on('message', e => e.data)` |
| Ready | The worker's `ready` is enough | Correct |
| Death — exit code | Only `exit(code)`, no signal | Correct that there is no signal. But the code differs case by case. JS `process.exit(n)` gives **n**, the addon's C `_exit(n)` (the core's `fatal_error`) gives **the raw wait status value `n << 8`** (70 → 17920), and one killed with `kill()` gives **0**. So the transport unpacks it with `>> 8` when it is `>255` and the low byte is 0, and the host separately remembers the fact that it killed the process |
| Death — stderr | Order needs checking | stderr's `end` **never arrives** (absent within 2 seconds in all four cases). What was written before death has already arrived at `exit`, so the host waits 100 ms after `exit` and then reports |
| Forced termination | `child.kill()` | Correct (reported code is 0) |
| Addon ABI | Would need to be rebuilt for the Electron ABI | **It loads without rebuilding.** Because the addon uses only N-API, a `.node` built for Node 22 (ABI 127) loads as is in Electron's (ABI 149) main and utility process. For distribution it is built with the Electron headers (`npm run build:electron`, node-gyp `--target --dist-url`). That single result runs both the 145 Node tests and Electron. `@electron/rebuild` is a tool that rebuilds modules inside `node_modules`, so it did not fit `native/` inside the repository |

What was not expected:

- **`ELECTRON_RUN_AS_NODE`**: tools that are themselves Electron, like VS Code, export this environment variable.
  Running `electron` inside them runs Node, not the app ("bad option"). So `tools/electron.ts`
  clears this value before starting it.
- **Sandbox**: on this machine (Ubuntu 22.04, unprivileged user namespaces allowed) it starts without `--no-sandbox`.
  `chrome-sandbox` does not need setuid. Other distributions may differ.
- **Pretendard's `calt`**: it turns an `x` between digits into `×` (`0x00400020` → `0×00400020`).
  UI strings that contain hexadecimal use `font-feature-settings: 'calt' 0` or are set in D2Coding.

What does not change: one machine = one process. `SIGALRM` is set only inside the utility process.
The core's timer on Windows (a named waitable timer + APC) is attached to the calling thread, so the current structure, in which the worker always
calls the core from the main thread, is kept. (Running under Electron on Windows has not been checked yet.)

This check is now done by the window's e2e test: kill the utility process with `.err`, and check that the window reports it and then
carries on assembling and running with a new process (`tests/e2e/flows.e2e.ts`, last test).

## 5. What the tests guard

| What | Where |
|---|---|
| Stop an endless loop and look at the registers, memory and PC; the host responds meanwhile | `tests/sim/process.test.ts` 1 |
| Stop at a breakpoint and then continue to the end | same file 2, `tests/node/run-control.test.ts` |
| Even if the child dies from `fatal_error`, the host notices and starts a new one | same file 3a, 3b (last-resort kill) |
| Console output arrives in pieces while running (including Hangul bytes) | same file 4 |
| The five stop reasons are told apart; writes while running are refused | same file |
| Without input it stops before the syscall (PC, `$v0`, `$f0` unchanged), and given input it continues reading | `tests/node/console-input.test.ts`, last group of `tests/sim/process.test.ts` |
| Window: start screen → new file → paste → Ctrl+S → error → fix → Text, F10, Inspector, breakpoint, stopping an endless loop, console input, process death | `tests/e2e/flows.e2e.ts` (Playwright `_electron.launch()`, the real app) |
| Window: Hangul composition does not break, and Ctrl+S during composition saves after the composition ends | `tests/e2e/ime.e2e.ts` (CDP `Input.imeSetComposition`) |
| Window: every place hexadecimal can appear is in D2Coding | `tests/e2e/hex-mono.e2e.ts` (every text node of the rendered DOM) |
| The machine options in settings (pseudo-instructions, delayed branches and loads, mapped I/O, quiet) and the exception handler (default, none, file) reach the core | `tests/node/machine-options.test.ts`, `tests/sim/process.test.ts` (mapped I/O input) |
| Window: only font size and number base are saved, Ctrl +/− and advanced settings last only for this run, the notices in About | `tests/e2e/settings.e2e.ts` |
| The same e2e against the packaged app (Linux `--dir`, Windows installed build) | `SPIM_E2E_EXE`, `.github/workflows/electron.yml` (repository root) |
| The tests above actually catch wrong implementations | `tools/mutants.ts` (77. Of these, 9 rebuild the addon and 12 open the window) |

## 6. The window

```text
src/main/main.ts        Host. Simulator, opening and saving files (encoding detection and conversion), examples, settings file
src/main/preload.cjs    The window's only way out: window.app (call, stop, files, settings, events)
src/renderer/app/
  app.ts                Window: bar (logo, file, tools), Editor | Run split, state (running, speed, pinned, breakpoints), keys
  ui.ts                 One panel head (panelHead) and one tab head (tabsHead): every head comes from here
  editor.ts             CodeMirror 6: colors, error line and `!`, breakpoint gutter, running line, Tab = 4 spaces, Ctrl+S during composition
  panels/               registers · text (virtual list) · data (Data table) · inspector · console · welcome ·
                        ask (in-app dialog) · settings · about
  logic/                Pure: register rows and what changed, Text rows, stop → state, visible row range, columns by width (columns.ts)
  perf.ts               Records panel update costs (window.__perf, read by tools/measure-ui.ts)
```

- The window knows neither the core nor Node. It bundles and uses the pure modules of `src/core/` (`tools/build-ui.ts`, esbuild),
  and talks to the simulator only through `window.app.call(method, …args)`. The main process passes that on to `Simulator` as is
  (except `run`, which goes through `sim.run()`, so that `stop()` knows about the run in progress).
- **State is not restored.** Window size, panels, recent files, open files and breakpoints all start from fixed defaults
  every time (lab PCs are shared by many people). The settings file (`userData/settings.json`) holds only the font size and the Data number base.
  Ctrl + / Ctrl − apply only to the current run.
- The register panel creates one DOM row per register once, and on every stop updates only the cells whose text changed and the rows whose highlight changed.
  Text keeps only the visible rows plus 10 rows before and after in the DOM. Measurements for both are in `docs/UI-ROUND1.md`.

## 7. The packaged app

```text
HallymMIPS.exe  LICENSE.txt  NOTICE.txt  LICENSE.electron.txt  LICENSES.chromium.html
resources/app.asar
  main.js         src/main/main.ts and what it imports (iconv-lite, src/node, src/sim/host·transport)
  worker.js       src/sim/worker.ts + native/index.ts  -- started by utilityProcess
  preload.cjs  exceptions.s  examples/  licenses/
  renderer/app/{index.html, app.css, app.js}  renderer/assets/
resources/app.asar.unpacked/spim.node   (the native module is outside the asar)
```

- The only difference between the source tree and the package is "where the files are". esbuild replaces `process.env.SPIM_BUNDLE` with `"1"`,
  and `src/main/paths.ts`, `src/sim/transport.ts` and `native/index.ts` choose paths by that value. The rest of the code is the same.
- So the e2e tests run against the package unchanged: with `SPIM_E2E_EXE=<HallymMIPS.exe>` the harness starts that executable.
- User data is in `%APPDATA%\HallymMIPS2` (Windows) — it does not overlap with the Qt edition's (registry `HKCU\Software\HallymMIPS`).
- The detailed decisions and the checks next to Qt edition 1.2.4 are in `docs/PORTING.md` section 13; what was confirmed on Windows is in `docs/WINDOWS.md`.

