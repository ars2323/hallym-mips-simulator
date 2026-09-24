# hallym-mips-simulator-electron

Electron판 한림 MIPS 시뮬레이터를 위한 저장소. **아직 UI 는 없다.** 지금 있는 것은 SPIM 코어를
감싼 Node 애드온과, Qt판(`hallym-mips-simulator`)의 `QtSpim/edu/core` 를 옮긴 순수 TS 모듈이다.
Qt판과 같은 결과를 내는지는 골든과 코어 대조 테스트가 확인한다.

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
tests/
  core/  node/      모듈별 테스트 (node:test)
  golden/           Qt판 골든 + 이 앱의 기본값 골든 (tests/golden/README.md)
  helpers/          골든 파서, 케이스 재생기, 코어 대조 도구
  programs/ samples/  입력 프로그램 (Qt판에서 복사 + 한글 인코딩 샘플)
  spike/            첫 스파이크의 검사 스크립트
tools/
  mutants.ts        테스트가 틀린 것을 잡는지 보이는 돌연변이 검사
  scanner-input-experiment.ts   소스 줄 표시 차이의 측정 (docs/PORTING.md 1절)
  gen-op-table.ts   CPU/op.h -> src/core/op-table.ts
  capture-default-goldens.ts    기본값 골든을 뜬다
docs/PORTING.md     Qt판과 다르게 한 것, 고치면 안 되는 것
```

## 애드온 (`native/index.ts`)

```ts
assemble(source: Uint8Array | string, { run?, fileName? })
                        -> { ok, errors, symbols, format }   // format: 판별한 인코딩·BOM·줄바꿈
step(n?)                -> boolean                           // 계속할 수 있는가
errors()  textSegment()  registers()  registerNames()  segments()
readWords(addr, n)  readBytes(addr, n)  disassemble(word, addr)
DEFAULT_RUN_PARAMETERS  = { argv: ["program.s"], env: [] }
```

- C++ 에는 **바이트만** 들어간다. 경로도 인코딩 로직도 C++ 에 없다.
  소스는 flex 메모리 버퍼(`yy_scan_bytes`)로 읽힌다.
- `assemble`·`step` 말고는 모두 읽기 전용이다.

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
```

Windows·macOS 빌드는 아직 시도하지 않았다.
