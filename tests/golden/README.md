# 골든 파일

두 벌이 있다. 둘 다 `npm test` 가 매번 비교한다.

| 벌 | 위치 | 출처 | 비교하는 테스트 | 증명하는 것 |
|---|---|---|---|---|
| Qt 환경 골든 | `tests/golden/*.txt` (29개) + `cases.txt` | **Qt판에서 복사** | `tests/golden/qt.test.ts` | 이 앱의 코어가 Qt판 코어와 같다 |
| 기본값 골든 | `tests/golden/default/*.json` (17개) | **이 저장소에서 새로 뜸** | `tests/golden/default.test.ts` | 배포되는 기본 설정이 매번 같은 상태를 만든다 |

## Qt 환경 골든 — Qt판에서 온 것

- 원본: `hallym-mips-simulator` 커밋 `c20d0c3` 의 `tests/golden/` 를 바이트 그대로 복사했다
  (2026-09-24). `cases.txt` 도 같다. Qt판의 원래 README 는 `README.qt.md` 에 그대로 있다.
  어떤 빌드에서, 어떤 환경으로 떴는지는 그 문서에 적혀 있다.
- 프로그램 입력: 케이스가 가리키는 프로그램은 Qt판에서 함께 복사했다.
  `helloworld.s` → `tests/programs/`, `Tests/*.s` → `tests/programs/`, `tests/samples/*.s` → `tests/samples/`.
- 비교 방법: 문자열이 아니라 **필드로** 비교한다. 골든을 파싱해 주소·워드·역어셈블·소스 주석,
  메모리 행과 값·문자, 레지스터 값, 어셈블러 메시지를 꺼내 애드온의 상태와 대조한다.
  공백 배치는 Qt `QTextEdit` 의 것이라 비교하지 않는다. 근거는 `docs/PORTING.md` 의 "골든" 절.
- 실행 매개변수: 캡처 당시 환경(argv 없음, 환경변수 3개)을 `qt.test.ts` 안에서만 넣는다.
  이 값은 애드온·앱·상수 파일 어디에도 두지 않는다.
- 결과: 29개 중 28개 통과, 1개 건너뜀.
  - `text-breakpoint` — 건너뜀. 브레이크포인트를 거는 것은 쓰기 기능인데 애드온에 아직 없다.
- 비교기에 고정된 차이(양쪽 문자열을 모두 적어 둠. 한쪽이라도 바뀌면 실패):
  - `text-ttcore`: tt.core.s 소스 주석 5줄. Qt 쪽이 코어의 버퍼 포인터 버그로 깨져 있다
    (`docs/PORTING.md` "소스 줄 표시").
- 비교기가 재현하는 Qt 프런트엔드 동작(코어와 무관):
  - Text 창은 역어셈블이 57칸 이상이라 `;` 앞에 공백이 없으면 주석을 지운다(tt.core.s 에서 381줄).
  - Data 창의 10진 표시는 10자리 음수의 부호를 잘라낸다(`-1879048156` → `1879048156`).
  - 메시지 창은 `spim: ` 을 떼고, 탭을 공백 하나로 바꾸고, 배너와 `Memory and registers cleared` 를 붙인다.

## 기본값 골든 — 여기서 새로 뜬 것

- 이 앱의 기본 실행 매개변수(`argv=["program.s"]`, 환경변수 없음)로 뜬 17개.
  실행 매개변수에 따라 결과가 달라지는 케이스만 뽑았다.
  레지스터 로그 6개(`intregs-*` 5개 + `syntaxerror-run-intregs`)와,
  스택이 보이는 데이터 로그 11개(`data-*` 중 `data-nostack` 을 뺀 10개 + `syntaxerror-data`)다.
- 형식: Electron 패널이 보여 줄 값 그대로의 JSON. 값은 `src/core/format.ts`·`memory-text.ts` 로,
  행은 `memory-rows.ts` 로 만든다.
- 뜬 곳: 이 저장소, `tools/capture-default-goldens.ts` (`npm run goldens:default`).
  첫 버전은 2026-09-24 에 떴다. 다시 뜨는 것은 기본값이나 표시를 **의도적으로** 바꿀 때뿐이고,
  그때는 커밋 메시지에 그렇다고 적는다.
