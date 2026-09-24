# hallym-mips-simulator-electron

Electron판 한림 MIPS 시뮬레이터를 위한 저장소. **아직 UI 는 없다.** 지금 있는 것은 셋이다.

- SPIM 코어를 감싼 Node 애드온
- 코어를 자기 프로세스에서 돌리는 실행 제어(실행·정지·브레이크포인트·콘솔 출력)
- Qt판(`hallym-mips-simulator`)의 `QtSpim/edu/core` 를 옮긴 순수 TS 모듈

Qt판과 같은 결과를 내는지는 골든과 코어 대조 테스트가 확인한다. 구조는 `docs/ARCHITECTURE.md`,
Qt판과 다르게 한 것은 `docs/PORTING.md` 에 있다.

## 구조

```text
CPU/                SPIM 코어. Qt판에서 복사, 무수정 (CPU/ORIGIN.md)
native/
  binding.gyp       코어 9개 소스 + bison/flex 액션 + 애드온
  src/addon.cc      N-API 프런트엔드: 코어가 요구하는 전역·콜백, 그리고 바인딩
  index.ts          Node 경계. 경로·인코딩·실행 매개변수는 여기서만 다룬다
src/core/           순수·동기 TS 모듈 (Qt판 QtSpim/edu/core 의 이식)
  decoder  registers  format  instruction-text  source-text  symbols
  memory-rows  memory-text  mips-syntax (+ op-table, CPU/op.h 에서 생성)  asm-errors
src/node/
  text-file.ts      소스 파일 바이트 <-> 텍스트 (UTF-8 / CP949 / Latin-1)
src/sim/            시뮬레이터 프로세스와 그 경계 (docs/ARCHITECTURE.md)
  host.ts           호스트 쪽: 요청·응답, 이벤트, 사망 감지·재기동
  worker.ts         시뮬레이터 프로세스: 구간 실행, 정지, 콘솔
  transport.ts      프로세스를 띄우고 말을 거는 곳 (지금 fork, 나중에 utilityProcess)
  protocol.ts       경계를 넘는 메시지의 타입
tests/
  core/  node/      모듈별 테스트 (node:test)
  sim/              시뮬레이터 프로세스 테스트 (정지, 브레이크포인트, 사망 복구, 콘솔)
  golden/           Qt판 골든 + 이 앱의 기본값 골든 (tests/golden/README.md)
  helpers/          골든 파서, 케이스 재생기, 코어 대조 도구
  programs/ samples/  입력 프로그램 (Qt판에서 복사 + 한글 인코딩 샘플)
  spike/            첫 스파이크의 검사 스크립트
tools/
  mutants.ts        테스트가 틀린 것을 잡는지 보이는 돌연변이 검사
  scanner-input-experiment.ts   소스 줄 표시 차이의 측정 (docs/PORTING.md 1절)
  gen-op-table.ts   CPU/op.h -> src/core/op-table.ts
  capture-default-goldens.ts    기본값 골든을 뜬다
src/main/            Electron 메인 프로세스(호스트)와 preload
src/renderer/        창 쪽. assets/(한림대 자산·폰트·아이콘, NOTICE 참고), wiring/(배선 확인)
design/mockups/      레이아웃 시안 원본 (docs/mockups/README.md)
docs/ARCHITECTURE.md  무엇이 어느 프로세스에 있고 왜인가
docs/PORTING.md       Qt판과 다르게 한 것, 고치면 안 되는 것
.github/workflows/windows.yml   Windows 빌드 + tt.core.s 워드 검사 (이것 하나)
```

## 시뮬레이터 (`src/sim/host.ts`)

```ts
const sim = await Simulator.start();
await sim.assemble(bytesOrText, { run?, fileName? });   // { ok, errors, symbols, format }
sim.on('console', (text) => ...);                        // 찍히는 대로
const r = await sim.run();       // { reason: exit | error | breakpoint | stopped | limit, pc, errors }
await sim.stop();                // 'stopped' — 머신은 그대로, 들여다볼 수 있다
await sim.call('setBreakpoint', addr);  sim.call('registers');  sim.call('readWords', addr, n) ...
sim.on('crashed', ({ message }) => ...); // '시뮬레이터가 중단되었습니다' — 새 프로세스가 이미 떠 있다
```

코어는 이 프로세스가 아니라 시뮬레이터 프로세스 안에 있다. 그 안의 애드온(`native/index.ts`)에는
C++ 로 **바이트만** 들어간다. 경로도 인코딩 로직도 C++ 에 없다.
소스는 flex 메모리 버퍼(`yy_scan_bytes`)로 읽힌다.

## 빌드와 검사 (Linux)

필요한 것: Node ≥ 22.18(TS 를 타입만 지우고 바로 실행), g++, make, python3, bison, flex.
node-gyp 는 devDependency 로 프로젝트 안에 있다.

```sh
npm install --ignore-scripts
npm run build          # native/build/Release/spim.node
npm run typecheck      # tsc --noEmit
npm test               # 모든 테스트 (Qt 골든·기본값 골든 포함)
npm run test:mutants   # 돌연변이마다 해당 테스트가 실패하는지
npm run spike          # 첫 스파이크의 검사 1·2
npm run build:electron # 애드온을 Electron 헤더로 (N-API 라 Node 빌드도 Electron 에서 열린다)
npm run electron       # Electron 창 — 지금은 배선 확인 페이지 (UI 아님)
npm run smoke:electron # 배선 확인을 자동으로: 어셈블·실행·레지스터·사망 복구, 캡처 후 0/1
npm run mockups        # 레이아웃 시안 → docs/mockups/ (화면이 없으면 xvfb-run -a 로)
```

Windows 는 GitHub Actions(`windows.yml`)가 빌드하고 tt.core.s 워드를 골든과 대조한다. macOS 는 아직 시도하지 않았다.
