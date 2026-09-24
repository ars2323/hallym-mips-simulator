# hallym-mips-simulator-electron

Electron판 한림 MIPS 시뮬레이터를 위한 저장소. **지금은 Electron 이 없다.**
이번 단계가 답하는 질문은 하나다:

> SPIM 코어를 Node 애드온으로 감싸서 Qt판(`hallym-mips-simulator`)과 똑같은 결과를 낼 수 있는가.

## 구조

```
CPU/              SPIM 코어. Qt판에서 복사, 무수정 (CPU/ORIGIN.md)
native/
  binding.gyp     코어 9개 소스 + bison/flex 액션 + 애드온 (Qt판 tests/spim_core.pri 를 따름)
  src/addon.cc    N-API 프런트엔드: 코어가 요구하는 전역·콜백과 5개 함수
  index.js        JS 쪽. 경로를 다루는 일은 전부 여기서 (C++ 은 텍스트만 받는다)
  index.d.ts      애드온 타입
src/core/
  decoder.ts      Qt판 QtSpim/edu/core/edu_decoder 의 TS 이식
tests/
  golden/         Qt판 tests/golden/ 복사 (참조용)
  programs/       Qt판 Tests/*.s 복사
  spike/          이번 검사 스크립트
```

## 애드온 표면

```ts
assemble(source: string)      -> { ok: boolean, errors: string[] }
textSegment()                 -> [{ addr: number, word: number }]   // 사용자 text, 커널 text 순
registers()                   -> { pc, hi, lo, general: number[32] }
disassemble(word, addr)       -> string                              // 코어의 inst_decode + format_an_inst
step(n?: number)              -> void                                // QtSpim 의 Single Step n번
```

`assemble` 은 매번 기계를 초기화하고 기본 예외 핸들러(`CPU/exceptions.s`)를 올린 뒤
소스를 어셈블한다. 설정은 QtSpim 기본값(bare 아님, pseudo 허용, delayed branch/load 끔,
mapped I/O 끔)이다.

**경로는 C++ 로 넘어가지 않는다.** 소스도 예외 핸들러도 텍스트로 넘어가고, 애드온이
`fmemopen()` 으로 메모리 위에 연 `FILE*` 을 코어의 스캐너에 준다
(`readAssemblyText` — `read_assembly_file()` 를 한 줄씩 따라 쓴 것). 코어 안에서 파일을
여는 곳은 `read_assembly_file()` 의 `fopen` 한 곳뿐이고(`.include` 같은 것은 없다),
애드온은 그 함수를 부르지 않는다. 그래서 Qt판의 `edu_path_encoding`·`edu_path_check` 류가
막던 한글 경로 문제는 이 경로에서 생기지 않는다.

## 빌드와 검사 (Linux)

필요한 것: Node ≥ 22.18 (TypeScript 를 타입만 지우고 바로 실행), g++, make, python3,
bison, flex. node-gyp 는 devDependency 로 프로젝트 안에 있다.

```sh
npm install --ignore-scripts
npm run build        # native/build/Release/spim.node
npm run typecheck    # tsc --noEmit
npm run spike        # 검사 1 + 검사 2 (tt.core.s)
```

- **검사 1** `tests/spike/check-text.js [PROGRAM GOLDEN]` — 애드온으로 어셈블한 모든
  명령어의 주소·32비트 워드를 Qt판 골든(`tests/golden/text-ttcore.txt`)과 대조한다.
  하나라도 다르면 처음 갈린 주소, 두 워드, 골든 줄, 원본 소스 줄을 찍고 실패한다.
- **검사 2** `tests/spike/check-decoder.ts [PROGRAM...]` — TS 디코더의 이름·포맷·필드를
  애드온 `disassemble()` 의 출력(코어 자신의 디코더)과 대조한다.

Windows·macOS 빌드는 아직 시도하지 않았다.
