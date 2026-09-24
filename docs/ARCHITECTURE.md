# ARCHITECTURE — 무엇이 어느 프로세스에 있고 왜인가

호스트는 Electron 의 메인 프로세스(`src/main/main.ts`)이고, 시뮬레이터 프로세스는 `utilityProcess` 로 띄운다.
Node 테스트에서는 같은 호스트가 `child_process.fork()` 로 띄운다. 둘의 차이는 `transport.ts` 안에만 있다(4절).

```text
┌─ 호스트 프로세스 (Electron main / Node 테스트) ─────────────────────┐
│  src/sim/host.ts        Simulator: 요청·응답 짝 맞춤, 이벤트,        │
│                         사망 감지·재기동, stop 의 최후 수단(kill)    │
│  src/sim/transport.ts   Transport — 프로세스를 띄우고 말을 거는 곳  │
│  src/core/*             (UI 가 쓸 순수 모듈 — 어느 프로세스든 가능)   │
└───────────────▲──────────────────────────────┬────────────────────┘
                │ 응답·이벤트                   │ 요청 {id, method, args}
                │ (structured clone)            ▼
┌─ 시뮬레이터 프로세스 (utilityProcess / fork) ──────────────────────┐
│  src/sim/worker.ts      구간 실행 루프, 요청 처리, 콘솔 디코딩       │
│  native/index.ts        Node 경계: 인코딩·실행 매개변수·바이트 변환  │
│  native/src/addon.cc    N-API: 코어의 전역·콜백, 바인딩              │
│  CPU/                   SPIM 코어 (무수정)                           │
└────────────────────────────────────────────────────────────────────┘
```

## 1. 왜 코어가 따로 사는가

코어의 성질 네 가지가 같은 결론을 가리킨다.

| 코어의 성질 | 호스트와 같은 프로세스에 두면 |
|---|---|
| 상태가 전부 프로세스 전역이다(한 프로세스에 머신 하나) | 머신을 새로 만들 방법이 프로세스를 새로 띄우는 것뿐이다 |
| 실행할 때마다 `signal(SIGALRM)`·`setitimer` 를 **프로세스 전체**에 건다 | 호스트(Electron main)의 시그널·타이머 상태를 건드린다 |
| `fatal_error()` 는 반환하면 안 된다(아래 3절) | 학생 프로그램 하나(`.err` 지시어)에 앱이 통째로 끝난다 |
| `run_program()` 은 동기 호출이다 | 무한 루프에 호스트의 이벤트 루프가 멈춘다(창이 얼어붙는다) |

그래서 코어와 코어를 직접 만지는 코드(`native/`, `src/sim/worker.ts`)는 시뮬레이터 프로세스에만 있다.
호스트는 코어를 `import` 하지 않는다.

`src/core/` 의 모듈(디코더, 포맷터, 행 나누기 …)은 **순수하고 동기적**이며 모듈 수준 상태가 없다.
그래서 어느 프로세스에서든 쓸 수 있다. UI 는 렌더러에서 이것들로 표시를 만든다.
비동기와 상태는 전부 경계(`native/index.ts`, `src/sim/`)에만 있다.

## 2. 경계를 넘는 것

전송은 structured clone 이다(`fork(…, { serialization: 'advanced' })`, 나중에는 utilityProcess 의
`postMessage`). 넘는 것은 평범한 객체·문자열·숫자·`Uint8Array` 뿐이다. 함수나 클래스는 넘지 않는다.
타입은 `src/sim/protocol.ts` 한 곳에 있다.

**요청 → 응답** (`{type:'request', id, method, args}` → `{type:'response', id, ok, value|error}`)

| 호출 | 답하는 때 |
|---|---|
| `assemble(source, options)` | 즉시. `source` 는 파일 바이트(`Uint8Array`) 또는 문자열 |
| `run()` | 프로그램이 멈출 때: `{reason, pc, errors}` |
| `step(n)` | n 개를 실행한 뒤(또는 그 전에 멈추면 그때) |
| `stop()` | 즉시(`{wasRunning}`). 실제로 멈춘 결과는 진행 중이던 `run()` 의 응답으로 온다 |
| `provideInput(text)` | 즉시. 콘솔 입력 한 줄 이상(UTF-8 로 바꿔 코어의 입력 대기열에 넣는다). 아래 "콘솔 입력" |
| `setBreakpoint` · `clearBreakpoint` · `breakpoints` | 즉시 |
| `registers` · `readWords` · `readBytes` · `textSegment` · `segments` · `registerNames` · `disassemble` | 즉시. 실행 중이면 구간과 구간 사이에 |

- 실행 중에는 읽기와 `stop` 만 받는다. 머신을 바꾸는 요청(`assemble`, 브레이크포인트 설정, 두 번째 `run`)은
  `busy` 로 거절한다. 구간 사이에 읽으므로 레지스터와 메모리는 늘 한 시점의 것이다.
- 멈춘 이유(`reason`)는 여섯 가지다. UI 는 각각 다르게 반응한다.

| reason | 뜻 |
|---|---|
| `exit` | 프로그램이 끝났다(syscall exit). 다음 `run` 은 처음부터 다시 시작한다(QtSpim 과 같음) |
| `error` | 코어가 실행 오류를 냈고 더 갈 수 없다. `errors` 에 코어의 문장이 있다 |
| `breakpoint` | PC 가 브레이크포인트에 있다. 그 명령은 아직 실행되지 않았다. 다음 `run`/`step` 이 그 명령부터 실행한다 |
| `input` | PC 가 읽기 syscall(5·6·7·8·12)에 있고 읽을 입력이 없다. syscall 은 아직 실행되지 않았다. `provideInput` 뒤 다음 `run`/`step` 이 그 syscall 부터 실행한다 |
| `stopped` | 사용자가 `stop()` 했다. 머신은 멈춘 그대로다 |
| `limit` | `step(n)` 이 n 개를 다 실행했다 |

**이벤트** (시뮬레이터 → 호스트)

| 이벤트 | 내용 |
|---|---|
| `ready` | 프로세스가 요청을 받을 준비가 됐다 |
| `console` | 프로그램이 찍은 텍스트. 구간이 끝날 때마다, 찍힌 순서대로 |
| `progress` | 실행 중 PC 와 대략의 명령 수. 초당 몇 번 |

**콘솔 바이트 → 텍스트**: 코어는 바이트를 찍는다. 애드온은 바이트를 그대로 넘기고, 워커가
스트리밍 `TextDecoder` 로 디코딩한다. 한글 한 글자가 `print_char` 로 한 바이트씩, 서로 다른 구간에서
찍혀도 글자가 깨지지 않는다(`tests/sim/process.test.ts` 4).

**콘솔 입력**: 코어는 읽기 syscall 한가운데서 `read_input()` 을 **동기로** 부른다. 거기서 기다리면
워커가 멈추고, 그러면 `stop` 도 읽기도 받을 수 없다. 그래서 기다리지 않고 **되감는다**.
대기열이 비어 있으면 애드온이 그 syscall 직전의 PC·`$v0`·`$f0` 를 적어 두고 `force_break` 를 켠다.
코어가 멈추면 `run` 이 셋을 되돌리고 `input` 을 돌려준다. 머신은 syscall 을 실행하기 전과 똑같다.
`provideInput` 은 바이트를 대기열에 넣기만 한다. 다음 `run`/`step` 이 syscall 을 처음부터 실행하고,
그때 `read_input()` 이 대기열에서 한 줄을 가져간다(SPIM 콘솔과 같은 줄 단위).
호스트는 막히지 않고, 입력을 기다리는 동안 머신은 멈춰 있는 것과 같아 무엇이든 읽을 수 있다.
새 프로그램을 어셈블하면 남은 입력은 버린다. (`docs/PORTING.md` 10절)

**죽음**: 프로세스가 끝나면(아래 3절) 호스트는 기다리던 모든 요청을 `SimulatorCrashed` 로 끝낸다.
그리고 `crashed` 이벤트(`message: '시뮬레이터가 중단되었습니다'`)를 내고 새 프로세스를 띄운다.
새 프로세스의 머신은 비어 있다. 프로그램을 다시 어셈블하는 것은 호스트(UI)의 몫이다.

## 3. 실행·정지·사고

- **실행**: 워커는 `run(10000)` 을 반복한다. 1만 명령은 약 2.6ms 다(코어가 초당 약 380만 명령).
  구간이 끝날 때마다 콘솔 출력을 보내고, `setImmediate` 로 이벤트 루프에 한 번 양보한다.
  그 틈에 들어온 요청이 처리된다.
- **정지(`stop`)**: 워커에 정지 표시를 하고, 다음 구간 앞에서 루프를 끝낸다. 늦어도 한 구간 뒤다.
  프로세스를 죽이지 않으므로 무한 루프를 세운 뒤 레지스터·메모리·PC 를 그대로 볼 수 있다.
  이것이 이 도구의 교육적 핵심이다.
- **최후 수단**: 호스트는 `stop` 뒤 `stopTimeoutMs`(기본 2초) 안에 실행이 끝나지 않으면
  그때만 프로세스를 죽이고 새로 띄운다(`stop()` 이 `'killed'` 를 돌려준다). 머신은 사라진다.
  구간이 짧아 정상적으로는 일어나지 않는다. 일어나는 경우는 워커가 정말 응답하지 않을 때뿐이다
  (테스트는 `SPIM_TEST_HOOKS=1` 일 때만 받는 `testHang` 으로 흉내 낸다).
- **`fatal_error()`**: 코어는 이 함수가 돌아오지 않는다고 가정한다. 애드온은 메시지를 stderr 에 쓰고
  `_exit(70)` 한다. 호스트는 종료 코드 70 과 stderr 의 `SPIM core fatal error: …` 로 이유를 알고 보고한다.
  `abort()` 가 아닌 이유는 `docs/PORTING.md` 8절에 있다. 학생 프로그램이 닿을 수 있는 예는
  `.err` 지시어다(`parser.y`).

## 4. utilityProcess — 예상과 실제

바뀐 곳은 예상대로 `src/sim/transport.ts` 하나다. `utilityTransport()` 를 더했고, 워커 쪽은
`process.parentPort` 가 있으면 그쪽을 쓴다. 호스트(`host.ts`)와 워커(`worker.ts`)는 고치지 않았다.
아래는 첫 판에 적은 예상과 Electron 44.4.5(Node 24.21.0) 리눅스에서 잰 실제다.

| | 예상(첫 판) | 실제 |
|---|---|---|
| 띄우기 | `utilityProcess.fork(worker.js, …)`. 빌드된 JS 가 필요할 것 | `utilityProcess.fork(worker.ts, [], { stdio: 'pipe', serviceName, env })` 로 **`.ts` 가 그대로 돈다.** Electron 의 Node 24 가 타입을 지운다. 메인 프로세스도 `electron src/main/main.ts` 로 그대로 뜬다. 패키징 뒤(asar) 경로는 아직 모른다 |
| 호스트 → 워커 | `child.postMessage(m)` | 맞다. structured clone 이라 `Uint8Array` 가 그대로 넘어간다 |
| 워커 → 호스트 | `process.parentPort` | 맞다. `parentPort.on('message', e => e.data)` |
| 준비 | 워커의 `ready` 로 충분 | 맞다 |
| 죽음 — 종료 코드 | `exit(code)` 만 있고 signal 은 없음 | signal 이 없는 것은 맞다. 그런데 코드가 경우마다 다르다. JS `process.exit(n)` 은 **n**, 애드온의 C `_exit(n)`(코어의 `fatal_error`)은 **원시 wait 상태값 `n << 8`**(70 → 17920), `kill()` 로 죽인 것은 **0** 이다. 그래서 transport 가 `>255` 이고 하위 바이트가 0 이면 `>> 8` 로 풀고, "죽였다"는 사실은 호스트가 따로 기억한다 |
| 죽음 — stderr | 순서 확인 필요 | stderr 의 `end` 는 **오지 않는다**(네 경우 모두 2초 안에 없음). 죽기 전에 쓴 내용은 `exit` 때 이미 와 있으므로, `exit` 뒤 100ms 를 기다렸다가 보고한다 |
| 강제 종료 | `child.kill()` | 맞다(보고 코드는 0) |
| 애드온 ABI | Electron ABI 로 다시 빌드해야 할 것 | **다시 빌드하지 않아도 열린다.** 애드온이 N-API 만 쓰므로 Node 22(ABI 127)로 빌드한 `.node` 가 Electron(ABI 149)의 메인과 utility process 에서 그대로 로드된다. 배포용으로는 Electron 헤더로 빌드한다(`npm run build:electron`, node-gyp `--target --dist-url`). 그 결과 하나로 Node 테스트 145개와 Electron 이 둘 다 돈다. `@electron/rebuild` 는 `node_modules` 안의 모듈을 다시 빌드하는 도구라, 저장소 안의 `native/` 에는 맞지 않았다 |

예상하지 못한 것:

- **`ELECTRON_RUN_AS_NODE`**: VS Code 처럼 그 자체가 Electron 인 도구는 이 환경변수를 내보낸다.
  그 안에서 `electron` 을 실행하면 앱이 아니라 Node 로 돈다("bad option"). 그래서 `tools/electron.ts` 가
  이 값을 지우고 띄운다.
- **샌드박스**: 이 기계(Ubuntu 22.04, 비특권 user namespace 허용)에서는 `--no-sandbox` 없이 뜬다.
  `chrome-sandbox` 에 setuid 가 없어도 된다. 다른 배포판에서는 다를 수 있다.
- **Pretendard 의 `calt`**: 숫자 사이의 `x` 를 `×` 로 바꾼다(`0x00400020` → `0×00400020`).
  16진수가 들어가는 UI 문자열에서는 `font-feature-settings: 'calt' 0` 을 쓰거나 D2Coding 으로 쓴다.

바뀌지 않는 것: 한 머신 = 한 프로세스다. `SIGALRM` 은 utility process 안에서만 걸린다.
Windows 의 코어 타이머(이름 있는 대기 타이머 + APC)는 호출한 스레드에 붙으므로, 워커가 코어를 늘
메인 스레드에서 부르는 지금 구조를 유지한다. (Windows 에서 Electron 으로 도는 것은 아직 확인하지 않았다.)

이 확인은 이제 창의 e2e 테스트가 한다: `.err` 로 utility process 를 죽이고, 창이 그 사실을 알린 뒤
새 프로세스로 어셈블·실행을 이어 가는지(`tests/e2e/flows.e2e.ts` 마지막 테스트).

## 5. 테스트가 지키는 것

| 무엇 | 어디 |
|---|---|
| 무한 루프를 멈추고 레지스터·메모리·PC 를 본다, 호스트는 그동안 응답한다 | `tests/sim/process.test.ts` 1 |
| 브레이크포인트에서 멈추고 이어서 끝까지 간다 | 같은 파일 2, `tests/node/run-control.test.ts` |
| `fatal_error` 로 자식이 죽어도 호스트가 알아차리고 새로 띄운다 | 같은 파일 3a, 3b(최후 수단 kill) |
| 콘솔 출력이 실행 중에 나뉘어 도착한다(한글 바이트 포함) | 같은 파일 4 |
| 다섯 가지 멈춤 이유가 구분된다, 실행 중 쓰기는 거절된다 | 같은 파일 |
| 입력이 없으면 syscall 앞에서 멈추고(PC·`$v0`·`$f0` 그대로), 입력을 주면 이어서 읽는다 | `tests/node/console-input.test.ts`, `tests/sim/process.test.ts` 마지막 묶음 |
| 창: 첫 화면 → 새 파일 → 붙여넣기 → Ctrl+S → 오류 → 고치기 → Text, F10, Inspector, 브레이크포인트, 무한 루프 정지, 콘솔 입력, 프로세스 사망 | `tests/e2e/flows.e2e.ts` (Playwright `_electron.launch()`, 실제 앱) |
| 창: 한글 조합이 깨지지 않고, 조합 중 Ctrl+S 는 조합이 끝난 뒤 저장한다 | `tests/e2e/ime.e2e.ts` (CDP `Input.imeSetComposition`) |
| 창: 16진수가 나올 수 있는 모든 자리가 D2Coding 이다 | `tests/e2e/hex-mono.e2e.ts` (그려진 DOM 의 텍스트 노드 전부) |
| 설정의 머신 옵션(의사 명령, delayed branches·loads, mapped I/O, quiet)과 예외 처리기(기본·없음·파일)가 코어에 닿는다 | `tests/node/machine-options.test.ts`, `tests/sim/process.test.ts`(mapped I/O 입력) |
| 창: 글자 크기·진법만 저장, Ctrl +/− 와 고급은 이번 실행만, About 의 고지 | `tests/e2e/settings.e2e.ts` |
| 같은 e2e 를 패키지된 앱으로 (리눅스 `--dir`, Windows 설치본) | `SPIM_E2E_EXE`, `.github/workflows/windows.yml` |
| 위 테스트가 틀린 구현을 실제로 잡는다 | `tools/mutants.ts` (77개. 그중 9개는 애드온을 다시 빌드하고 12개는 창을 띄운다) |

## 6. 창

```text
src/main/main.ts        호스트. 시뮬레이터, 파일 열기·저장(인코딩 판별·변환), 예제, 설정 파일
src/main/preload.cjs    창이 밖으로 나가는 유일한 길: window.app (call, stop, 파일, 설정, 이벤트)
src/renderer/app/
  app.ts                장면 A·B·C·D 와 상태(국면, 실행 상태, 선택, 브레이크포인트), 키
  editor.ts             CodeMirror 6 + src/core/mips-syntax.ts 색, 오류 줄, 조합 중 Ctrl+S
  panels/               registers · text(가상 목록 + Data) · inspector · console · welcome
  logic/                순수: 레지스터 행·바뀐 것, Text 행, 멈춤 → 상태, 보이는 행 범위
  perf.ts               패널 갱신 비용 기록(window.__perf, tools/measure-ui.ts 가 읽는다)
```

- 창은 코어도 Node 도 모른다. `src/core/` 의 순수 모듈을 번들해 쓰고(`tools/build-ui.ts`, esbuild),
  시뮬레이터에는 `window.app.call(method, …args)` 로만 말을 건다. 메인은 그것을 `Simulator` 에 그대로 넘긴다
  (`run` 만은 `sim.run()` 으로, `stop()` 이 진행 중인 실행을 알도록).
- **상태를 되살리지 않는다.** 창 크기, 패널, 최근 파일, 열린 파일, 브레이크포인트 모두 매번 고정 기본값에서
  시작한다(실습실 PC 는 여럿이 쓴다). 설정 파일(`userData/settings.json`)에는 글자 크기와 Data 진법만 있다.
  Ctrl + / Ctrl − 는 이번 실행에만 적용된다.
- 레지스터 패널은 레지스터마다 DOM 행을 한 번 만들고, 멈출 때마다 글자가 바뀐 칸과 강조가 바뀐 행만 고친다.
  Text 는 보이는 행과 앞뒤 10행만 DOM 에 둔다. 둘 다 잰 값은 `docs/screens/README.md` 에 있다.

## 7. 패키지된 앱

```text
HallymMIPS.exe  LICENSE.txt  NOTICE.txt  LICENSE.electron.txt  LICENSES.chromium.html
resources/app.asar
  main.js         src/main/main.ts 와 그것이 가져오는 것(iconv-lite, src/node, src/sim/host·transport)
  worker.js       src/sim/worker.ts + native/index.ts  -- utilityProcess 가 띄운다
  preload.cjs  exceptions.s  examples/  licenses/
  renderer/app/{index.html, app.css, app.js}  renderer/assets/
resources/app.asar.unpacked/spim.node   (네이티브 모듈은 asar 밖)
```

- 소스 트리와 패키지의 차이는 "파일이 어디 있나" 하나다. esbuild 가 `process.env.SPIM_BUNDLE` 을 `"1"` 로 바꿔 넣고,
  `src/main/paths.ts`·`src/sim/transport.ts`·`native/index.ts` 가 그 값으로 경로를 고른다. 나머지 코드는 같다.
- 그래서 e2e 테스트를 그대로 패키지에 돌린다: `SPIM_E2E_EXE=<HallymMIPS.exe>` 면 하네스가 그 실행 파일을 띄운다.
- 사용자 데이터는 `%APPDATA%\HallymMIPS2`(Windows) — Qt판(레지스트리 `HKCU\Software\HallymMIPS`)과 겹치지 않는다.
- 자세한 결정과 Qt판 1.2.4 옆에서의 검사는 `docs/PORTING.md` 13절, Windows 에서 확인한 것은 `docs/WINDOWS.md`.

