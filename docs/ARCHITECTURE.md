# ARCHITECTURE — 무엇이 어느 프로세스에 있고 왜인가

아직 Electron 은 없다. 지금의 "호스트"는 Node 프로세스이고, 시뮬레이터 프로세스는
`child_process.fork()` 로 띄운다. 모양은 Electron 앱의 것과 같게 잡았다.
나중에 메인 프로세스가 호스트가 되고, 전송 수단만 `utilityProcess` 로 바뀐다(4절).

```text
┌─ 호스트 프로세스 (나중에: Electron main) ──────────────────────────┐
│  src/sim/host.ts        Simulator: 요청·응답 짝 맞춤, 이벤트,        │
│                         사망 감지·재기동, stop 의 최후 수단(kill)    │
│  src/sim/transport.ts   Transport — 프로세스를 띄우고 말을 거는 곳  │
│  src/core/*             (UI 가 쓸 순수 모듈 — 어느 프로세스든 가능)   │
└───────────────▲──────────────────────────────┬────────────────────┘
                │ 응답·이벤트                   │ 요청 {id, method, args}
                │ (structured clone)            ▼
┌─ 시뮬레이터 프로세스 (나중에: utilityProcess) ─────────────────────┐
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
| `setBreakpoint` · `clearBreakpoint` · `breakpoints` | 즉시 |
| `registers` · `readWords` · `readBytes` · `textSegment` · `segments` · `registerNames` · `disassemble` | 즉시. 실행 중이면 구간과 구간 사이에 |

- 실행 중에는 읽기와 `stop` 만 받는다. 머신을 바꾸는 요청(`assemble`, 브레이크포인트 설정, 두 번째 `run`)은
  `busy` 로 거절한다. 구간 사이에 읽으므로 레지스터와 메모리는 늘 한 시점의 것이다.
- 멈춘 이유(`reason`)는 다섯 가지다. UI 는 각각 다르게 반응한다.

| reason | 뜻 |
|---|---|
| `exit` | 프로그램이 끝났다(syscall exit). 다음 `run` 은 처음부터 다시 시작한다(QtSpim 과 같음) |
| `error` | 코어가 실행 오류를 냈고 더 갈 수 없다. `errors` 에 코어의 문장이 있다 |
| `breakpoint` | PC 가 브레이크포인트에 있다. 그 명령은 아직 실행되지 않았다. 다음 `run`/`step` 이 그 명령부터 실행한다 |
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

## 4. utilityProcess 로 바뀔 때

바뀌는 곳은 `src/sim/transport.ts` 하나다. 호스트와 워커는 그 안의 `Transport`(호스트 쪽)와
`WorkerPort`(워커 쪽) 인터페이스만 본다. 예상되는 차이:

| | 지금(`child_process.fork`) | Electron(`utilityProcess.fork`) |
|---|---|---|
| 띄우기 | `fork(worker.ts, { serialization: 'advanced', stdio })` | `utilityProcess.fork(worker.js, [], { stdio: 'pipe', serviceName })`. 모듈 경로는 패키징 뒤 `app.asar` 밖이어야 할 수 있다(네이티브 애드온) |
| 호스트 → 워커 | `child.send(m)` | `child.postMessage(m)` |
| 워커 → 호스트 | `process.send(m)` / `process.on('message')` | `process.parentPort.postMessage(m)` / `parentPort.on('message', e => e.data)`. `WorkerPort` 구현 하나만 추가 |
| 준비 | 워커가 `ready` 를 보낸다 | 같다. `spawn` 이벤트도 있지만 `ready` 로 충분 |
| 죽음 | `close` 이벤트 `(code, signal)` 뒤 stderr 까지 다 읽힘 | `exit` 이벤트 `(code)` 뿐이다. signal 은 없다. stderr 는 `child.stderr` 스트림에서 읽는다. 둘의 순서는 확인이 필요하다 |
| 강제 종료 | `child.kill('SIGKILL')` | `child.kill()` |
| TS 실행 | Node 가 타입을 지우고 바로 실행 | 빌드된 JS 가 필요하다(Electron 의 Node 가 `.ts` 를 받는지 확인 필요) |
| 애드온 ABI | Node 22 | Electron 의 Node ABI 로 다시 빌드한다(`electron-rebuild`/`@electron/rebuild`). N-API 라 대개는 그대로 로드되지만 확인한다 |

- 한 머신 = 한 프로세스라는 구조는 그대로다. 창을 여러 개 띄우면 프로세스도 여러 개가 된다.
- `SIGALRM` 은 utilityProcess 안에서만 걸린다. main 과 렌더러는 영향이 없다.
- Windows 에서는 코어의 타이머가 이름 있는 대기 타이머(`"SPIMTimer"`)와 APC 를 쓴다(`run.cpp`).
  호출한 스레드에 붙으므로, 워커가 코어를 늘 같은 스레드(메인 스레드)에서 부르는 지금 구조를 유지한다.

## 5. 테스트가 지키는 것

| 무엇 | 어디 |
|---|---|
| 무한 루프를 멈추고 레지스터·메모리·PC 를 본다, 호스트는 그동안 응답한다 | `tests/sim/process.test.ts` 1 |
| 브레이크포인트에서 멈추고 이어서 끝까지 간다 | 같은 파일 2, `tests/node/run-control.test.ts` |
| `fatal_error` 로 자식이 죽어도 호스트가 알아차리고 새로 띄운다 | 같은 파일 3a, 3b(최후 수단 kill) |
| 콘솔 출력이 실행 중에 나뉘어 도착한다(한글 바이트 포함) | 같은 파일 4 |
| 다섯 가지 멈춤 이유가 구분된다, 실행 중 쓰기는 거절된다 | 같은 파일 |
| 위 테스트가 틀린 구현을 실제로 잡는다 | `tools/mutants.ts` (경계·실행 제어 돌연변이 14개 포함, 그중 4개는 애드온을 다시 빌드한다) |
