# PORTING — Qt판에서 옮기며 정한 것들

이 문서는 **"이거 버그 아닌가" 하고 고쳤다가 코어와 갈라지는 일**을 막으려고 둔다.
아래 항목 대부분은 겉보기에 고치고 싶어지는 동작이다. 각 항목에 무엇이 어떤지, 왜 그런지,
무엇을 하지 말아야 하는지, 어느 테스트가 지키는지를 적었다.

원칙은 Qt판과 같다.

- **`CPU/` 는 수정하지 않는다.** 코어의 버그는 우회하지 고치지 않는다(`CPU/ORIGIN.md`).
- **SPIM 과 MIPS32 매뉴얼이 다르면 SPIM 이 이긴다.** 학생이 보는 워드는 SPIM 이 만든 것이다.
- **실행 결과는 Qt판과 같아야 한다.** 이것은 골든 28개가 매번 확인한다.

---

## 1. 실행 결과는 같고, 소스 표시는 더 정확하다

발표자료에는 "기존 시뮬레이터와 동일한 실행 결과 보장"이라고 적혀 있다. 이 문장은 지금도 맞다.
다만 **이 앱이 Qt판보다 의도적으로 나은 첫 지점**이 여기서 생겼으니, 두 가지를 구분해 둔다.

| | Qt판 | 이 앱 | 같은가 |
|---|---|---|---|
| 명령어 워드(기계어) | 코어가 만든 것 | 같은 코어가 만든 것 | **같다** (tt.core.s 4,758개 전부) |
| 메모리·레지스터·실행 흐름 | | | **같다** (Qt 골든 28개) |
| 어셈블러 오류 메시지 | | | **같다** |
| 명령어 옆에 붙는 **소스 줄 표시** | 큰 파일에서 몇 줄이 깨진다 | 깨지지 않는다 | **다르다 — 이 앱이 맞다** |

### 무엇이 깨지는가

코어는 명령어마다 그것을 만든 소스 줄을 함께 보관하고, Text 창은 그것을 `; 183: jal main` 처럼
보여 준다. Qt판에서는 tt.core.s 를 불러오면 다섯 줄이 이렇게 나온다.

| 주소 | Qt판이 보여 주는 것 | 실제 소스(이 앱) |
|---|---|---|
| `0x00400f18` | `; 1155:` | `; 1155: mtlo $0` |
| `0x0040206c` | `; 2372: 42: c.u` | `; 2372: bc1f l230` |
| `0x004031f8` | `; 3577: _str)` | `; 3577: li $v0 4 # syscall 4 (print_str)` |
| `0x00403b9c` | `; 4195: ble $0 $0 l1` | `; 4195: ble $0 $0 l140` |
| `0x00404970` | `; 4857: li $v0, 10 # syscal` | `; 4857: li $v0, 10 # syscall 10 (exit)` |

### 왜 깨지는가 — 코어의 잠복 버그

스캐너(`CPU/scanner.l`)는 지금 읽는 줄의 시작을 `current_line = yytext` 로 기억한다.
이 포인터는 flex 의 입력 버퍼 **안**을 가리킨다. 입력이 `FILE*` 이면 flex 는 파일을 조각으로 읽는다.
조각을 새로 읽을 때마다 아직 처리하지 않은 텍스트를 버퍼 앞쪽으로 옮기는데, 그러면 `current_line` 이
가리키던 자리에는 다른 바이트가 들어 있게 된다. 조각 경계에 걸친 줄이 깨지는 이유다.
Qt판은 코어의 `read_assembly_file()` 대로 `fopen()` 한 `FILE*` 을 넘기므로 이 버그가 드러난다.

이 앱은 파일 전체를 **한 버퍼**로 넘긴다(`yy_scan_bytes`, 아래 2절). 버퍼를 다시 채우는 일이
없으니 포인터가 어긋나지 않는다.

### 측정 (`node tools/scanner-input-experiment.ts` 로 다시 돌릴 수 있다)

애드온의 입력만 FILE\* 방식(`fmemopen`)으로 바꿔 flex 의 읽기 크기별로 빌드했다.
그다음 `tests/programs`·`tests/samples` 의 18개 파일에서 명령어마다 소스 줄을 한 버퍼 방식과 비교했다.

| FILE\* 방식의 읽기 크기 | 소스 줄이 다른 명령 | 위치 |
|---|---|---|
| 기본(16 KB 요청 — Qt판과 같음) | 7 (tt.core.s 5, tt.alu.bare.s 1, tt.be.s 1) | 전부 8 KB 배수 바로 앞: 0.499·1.000·2.000·2.998·3.499·3.999 × 16 KB |
| 4 KB | 17 (7개 파일) | 전부 4 KB 배수 바로 앞: 0.996–0.999, 1.996, … × 4 KB |
| 1 MB (파일 전체를 한 번에) | **0** | — |

- 깨지는 위치가 읽기 크기를 따라 움직이고, 한 번에 다 읽으면 사라진다. 원인은 조각 읽기다.
- 16 KB 를 요청했는데 경계가 8 KB 마다 생기는 것은 glibc stdio 가 한 번에 8 KB 씩 넘겨주기
  때문으로 보인다. 경계 크기가 달라도 결론은 같다.
- 기본 설정에서 깨진 tt.core.s 5줄은 Qt판 골든(`text-ttcore.txt`)의 5줄과 **문자열까지 같다.**
  Qt판의 실제 파일 입력도 같은 일을 겪는다는 뜻이다.
- 8 KB 보다 작은 파일은 어느 설정에서도 차이가 0건이다.
- 이 도구를 만들기 전에 한 A/B 는 16개 파일을 두 방식으로 어셈블하고 실행했다. 워드·어셈블러 오류·
  심볼 목록·실행 후 레지스터와 런타임 오류까지 비교했는데 전부 같았다. 달라지는 것은 **표시용 소스 줄**뿐이다.

### 하지 말 것

- `CPU/scanner.l` 을 고치지 않는다. 우회는 입력 방식으로만 한다.
- 이 앱이 Qt판과 똑같이 보이게 하려고 FILE\* 입력으로 되돌리지 않는다.
- 5줄 차이를 "무시"로 바꾸지 않는다. `tests/golden/qt.test.ts` 의 `SOURCE_LINE_DIFFERENCES` 에
  **주소별로 Qt 쪽 문자열과 이 앱 쪽 문자열이 둘 다** 적혀 있다. 어느 한쪽이 바뀌어도 테스트가 실패한다.
  `tests/core/source-text.test.ts` 는 tt.core.s 의 소스 줄 3,277개가 전부 파일의 실제 줄과
  같다는 것도 확인한다.

---

## 2. 코어에 소스를 넣는 법 — `yy_scan_bytes`

**결론: flex 의 메모리 입구(`yy_scan_bytes`)를 쓴다. `fmemopen` 은 뺐고, 플랫폼 분기는 없다.**

확인한 것:

- `CPU/scanner.l` 은 `YY_INPUT` 을 직접 정의하지 않는다. flex 기본 입력을 쓰므로 메모리 버퍼를 그대로 받는다.
- `read_assembly_file()` 이 `yyin` 말고 들고 있는 상태를 확인했다.
  - 줄 번호(`line_no`), 현재 줄(`current_line`), EOF 표시(`eof_returned`) 등은
    `initialize_scanner()` 가 초기화한다. 그래서 이 함수를 먼저 부르고 버퍼만 갈아 끼운다.
  - 파일명은 `initialize_parser(name)` 가 **오류 메시지용 문자열로만** 들고 있다. 열지 않는다.
  - 다중 파일(`.include` 등)은 없다. 코어에서 `fopen` 은 `read_assembly_file()` 한 곳뿐이다.
- 구현: `native/src/addon.cc` 의 `readAssemblyBytes()` 는 `read_assembly_file()` 을 한 줄씩 따라 쓴 것이다.
  바뀐 것은 `FILE*` 대신 `yy_scan_bytes()` 를 쓰는 것과 `print_symbols()` 캡처 두 가지뿐이다.
  예외 핸들러도 같은 길로 넣는다. `initialize_world(NULL)` 을 부른 뒤, 원래 그 함수 안에 있던
  핸들러 적재 부분을 따라 쓴다.
- A/B 결과(FILE\* 판 대 이 판): 16개 프로그램에서 워드·오류·심볼·실행 후 레지스터가 전부 같다.
  다른 것은 소스 줄 7개뿐이고, 그 이유가 1절이다.
- **Windows 에서 확인했다**(`.github/workflows/windows.yml`, windows-latest).
  - 도구: winflexbison3 의 win_flex 2.6.4, win_bison 3.7.4 (리눅스는 flex 2.6.4, bison 3.8.2).
  - 결과: MSVC(VS 2026)로 빌드하면 컴파일 오류·경고가 0이다. tt.core.s 4,758개 워드가 골든과 전부 같다.
    `yy_scan_bytes` 는 win_flex 에서도 같게 동작한다.
  - 가는 길에 막힌 것은 입력 방식이 아니라 gyp 였다(9절).
- 참고: 코어의 `initialize_scanner()` 는 로드할 때마다 flex 버퍼를 하나 쌓고 풀지 않는다
  (Qt판도 같다). 이 앱은 자기가 만든 버퍼는 파싱 뒤 바로 지우지만, 코어가 쌓는 쪽은 건드리지 않는다.

**한글 경로가 C++ 에 닿는 곳: 0.** 소스·예외 핸들러·argv·환경변수가 모두 바이트로 넘어간다.
파일명은 메시지용 문자열로만 넘어가고 열리지 않는다.

---

## 3. 골든 — 문자열이 아니라 필드로 비교한다

Qt판 골든(`text-*`·`data-*`·`intregs-*`)은 Save Log File 이 쓴 텍스트다. 업스트림이 만든 HTML 을
`QTextEdit::toPlainText()` 로 뽑은 것이라 공백 배치(`&nbsp;` 패딩, 섹션 사이 빈 줄 수)가
Qt 위젯의 규칙을 따른다. 이 앱의 패널은 DOM 테이블과 CSS 라서 그런 문자열을 만들 일이 없다.
공백 규칙을 TS 로 재현하면 **제품에 대응물이 없는 코드**가 생긴다.

그래서 골든을 파싱해 **데이터를 필드로 비교한다**(`tests/helpers/qt-golden.ts`, `tests/golden/qt.test.ts`).

- Text: 섹션(이름·범위), 명령마다 주소·워드·역어셈블·소스 주석.
- Data: 섹션(이름·범위), 행마다 종류(0 구간 / 워드 행)·주소·길이·값·문자.
  행 나누기는 `src/core/memory-rows.ts` 가 만든 것과 Qt 창의 행을 **행 단위로** 맞춘다.
- 레지스터: 이름·번호·값. 이름은 코어의 `int_reg_names` 와 대조한다.
- 메시지: 코어 메시지를 `src/core/asm-errors.ts` 로 구조화해 메시지·줄·파일·인용 소스·캐럿 열을 비교한다.

**되돌려 파싱해서 잃는 것은 공백 배치뿐이다.** 줄마다 형식을 엄격하게 검사하므로, 모르는 모양의
줄이 나오면 건너뛰지 않고 실패한다.

로그 골든 2개(`syntaxerror-log`·`syntaxerror-run-log`)도 문자열 그대로 비교하지 않는다.
처음에는 "로그 저장은 실제 기능이니 문자열 그대로" 가 제안이었지만, 확인해 보니 이 둘도
Qt 메시지 창(HTML)을 거친 결과라 코어 메시지조차 원문이 아니다.

- Qt 는 메시지 앞의 `spim: ` 을 뗀다.
- 탭은 공백 하나로 바뀐다(원문 `)\t#` → 골든 `) #`).
- 나머지는 Qt 프런트엔드 텍스트다. `Memory and registers cleared`, 버전(1.2.4)이 박힌 배너,
  Qt 메뉴 이름(`Help > About > License`)이 들어 있다.

그래서 코어가 낸 메시지만 구조화해 비교하고, Qt 쪽 줄들은 목록으로 정확히 고정한다
(`QT_PANE_LINES`: 바뀌면 알 수 있게).
이 앱의 로그 저장 기능은 자기 형식을 따로 정하게 된다. 그때 필요한 골든은 이 앱에서 새로 뜬다.

### 비교기가 재현하는 Qt 프런트엔드 동작 (코어와 무관, 이 앱은 따라 하지 않는다)

- **주석 지우기**: 역어셈블이 57칸 이상이면 코어는 `;` 를 공백 없이 붙이는데, Qt `formatInstructions()`
  가 `;` 앞 공백을 지우는 루프에서 `;` 자리에 `\0` 을 써서 주석을 통째로 지운다.
  tt.core.s 에서 381줄이다. 코어 줄은 멀쩡하다.
- **10진 부호 잘림**: Data 창 `formatWord()` 가 10자리로 자르면서 10자리 음수의 `-` 를 잘라낸다
  (`0x90000024` → `1879048156`). 짧은 음수(`-1`)는 멀쩡하다.
- **브레이크포인트 표시**: `text-breakpoint` 골든에는 업스트림이 고정 오프셋으로 자른 줄이 들어 있다
  (`README.qt.md`). 비교기는 이 줄을 따로 알아보고, 남은 일곱 자리를 우리 주소·워드의 앞 일곱 자리와 맞춘다.

---

## 4. 실행 매개변수(argv·환경변수) 고정

**문제.** 코어의 `initialize_run_stack()` 은 argv 와 프로세스 환경변수(`environ`)를 시뮬레이션
스택에 복사한다. 그래서 `$sp`·`$a1`·`$a2` 와 스택 내용이 기계마다 다르다. Qt판은 argv[0] 에
파일 경로를 넣으므로 경로 길이에 따라서도 달라진다. 교육용으로는 결함이다. 학생 둘이 같은 코드를
돌렸는데 `$sp` 가 다르면 서로 맞춰볼 수가 없다.

**결정.**

- 애드온은 argv·env 를 **기본값 없이 데이터로만** 받는다. 스택을 만드는 동안만 `environ` 을
  그 배열로 바꿔 끼운다(`initializeStack()`).
- 앱 기본값은 `DEFAULT_RUN_PARAMETERS = { argv: ["program.s"], env: [] }` (`native/index.ts`).
  이 값이면 로드 직후 `$sp = 0x7fffffe4`, `$a0 = 1` 이다.
  - 파일명을 argv[0] 에 넣지 않는다. `lab04.s` 와 `homework.s` 는 길이가 달라서 학생마다
    `$sp` 가 달라진다. 제목 표시줄의 이름과 스택의 이름이 다른 것은 감수한다.
  - 프로세스 환경변수는 들어가지 않는다. 환경변수를 크게 바꾼 자식 프로세스에서도 레지스터가
    같다는 것을 `tests/node/run-parameters.test.ts` 가 확인한다.
- argv 를 인자로 받는 것은 테스트용 갈고리가 아니다. Qt판의 Simulator > Run Parameters 가
  이미 있는 기능이고, 애드온 인자는 그 기능의 정식 통로다. 테스트도 같은 통로를 쓸 뿐이다.
  코어가 명령줄을 공백으로 다시 쪼개므로 공백·NUL·빈 문자열이 든 argv 항목은 거부한다.

**Qt 골든은 어떻게 통과하나.** Qt 골든은 argv 없이(argc=0), 환경변수 3개
(`QT_QPA_PLATFORM=offscreen`, `HOME=/nonexistent`, `XDG_CONFIG_HOME=/nonexistent/config`)로 떴다.
data 골든 12개 중 11개도 스택을 담고 있어서 이 값에 의존한다(Qt는 로드할 때 이미 스택을 만든다).
이 값은 **`tests/golden/qt.test.ts` 안에만** 둔다. 애드온 기본값, 앱 설정, 상수 파일 어디에도 두지 않는다.
배포본에 `HOME=/nonexistent` 가 새어들 경로를 아예 만들지 않기 위해서다.

**골든 두 벌.**

| 벌 | 개수 | 증명하는 것 |
|---|---|---|
| Qt 환경 골든 | 29 (전부 통과) | 코어가 Qt판과 동일하다 |
| 기본값 골든 | 17 (레지스터 6 + 스택 포함 data 11) | 배포되는 설정이 안정적이다 |

Qt 환경 골든만 두면 "아무도 쓰지 않는 설정을 검사한다"는 구멍이 생긴다. 두 벌을 다 돌려서 그 구멍을 막는다.
지금은 CI 가 없으므로 `npm test` 가 둘 다 돈다. CI 를 붙일 때도 둘 다 넣는다.

---

## 5. 인코딩 — 바이트는 C++ 로, 판별은 Node 에서

- C++(애드온)에는 **인코딩 로직이 없다.** 받는 것은 바이트뿐이고, 코어가 돌려주는 텍스트는
  UTF-8 로 간주해 JS 문자열로 만든다(N-API).
- Node(`src/node/text-file.ts`)가 판별하고 변환한다. 규칙은 Qt판 `edu_text_file` 과 같다.
  1. UTF-8 BOM 이 있으면 기록하고 뗀다.
  2. 올바른 UTF-8 이면 UTF-8 이다.
  3. 아니면 CP949 로 읽은 뒤 **다시 인코드해서 원래 바이트와 똑같으면** CP949 다.
  4. 그것도 아니면 Latin-1 이다(모든 바이트가 보존된다).
- 결과는 `assemble()` 이 `format`(인코딩·BOM·줄바꿈)으로 돌려준다. 나중에 UI 가 표시한다.
- 코어에는 항상 **UTF-8·LF** 로 넘긴다. 그래서 CP949+CRLF 파일과 UTF-8+LF 파일이 같은 머신을 만든다.
  확인 범위는 워드·소스 줄·심볼·메모리(한글 `.asciiz` 포함)·실행 후 레지스터다
  (`tests/node/encoding.test.ts`).
  - Qt판은 파일 바이트를 그대로 넘겼으므로 CP949 파일의 한글 문자열이 메모리에 CP949 로 들어갔다.
    이 앱에서는 UTF-8 로 들어간다. 의도한 차이다.
  - LF 정규화는 어셈블 결과를 바꾸지 않는다. 스캐너가 `\r` 을 무시한다(`CPU/scanner.l` 101행).
- `chardet` 은 쓰지 않았다. 통계적 추정은 한두 줄짜리 짧은 파일에서 흔들린다. 반면 위 규칙은
  결정적이고, Qt판에서 이미 테스트된 것이다(`tests/node/text-file.test.ts` 가 그 표를 옮겼다).
  의존성은 `iconv-lite` 하나다.
- 옮기지 않은 것: `edu_source_text` 의 `decodeSourceBytes()`. 코어가 UTF-8 만 받으므로 코어에서
  나오는 소스 줄을 다시 판별할 일이 없다. `edu_path_encoding` 도 옮기지 않았다. 경로가 C++ 로
  가지 않으므로 할 일이 없다.

---

## 6. `-iquote` 와 `<syscall.h>`

`CPU/` 를 `-I` 로 넣으면 **`CPU/syscall.h` 가 시스템 `<syscall.h>` 를 가린다.** Node(22·24)와
Electron 의 헤더는 C++20 이다. 여기서 `napi.h` → `<memory>` → libstdc++ `<atomic>` 이
`<syscall.h>` 를 include 하는데, 가려진 헤더를 받으면 `SYS_futex` 가 없다는 오류가 난다.
Qt판은 C++17 이라 이 경로가 열리지 않아서 드러나지 않았다.

조치: `CPU/` 를 `-iquote` 로만 넣는다(`native/binding.gyp`). 따옴표 include(`"spim.h"`)에만
적용되고 꺾쇠 include 에는 걸리지 않는다. 코어 소스는 자기 옆의 헤더를 찾으므로 영향이 없다.

**리눅스 전용 조치다.** `<syscall.h>` 자체가 리눅스 헤더라 MSVC 표준 라이브러리는 이것을
include 하지 않는다. 그러니 MSVC 에서는 충돌할 것이 없다. Windows 빌드에서 확인했다.

정정: 이 문서의 첫 판에는 "msvc 블록에 짝이 필요 없다"고 적었다. `-iquote` 의 짝이 필요 없다는 뜻으로는
맞았지만, 그러면서 MSVC 에서는 CPU/ 가 include 경로에 **아예 없는** 상태로 남아 있었다.
Windows 에 처음 올리기 전에 코드를 읽다가 찾았다. 지금은 msvc 블록이 CPU/ 를 일반 include 경로
(`/I`)에 넣는다. 같은 때에 두 가지를 더 맞췄다.
- `addon.cc` 의 `environ`: MSVC 에서는 `_environ` 이다(코어의 `spim-utils.cpp` 와 같은 방식).
- `.gitattributes` 의 `* -text`: Windows 체크아웃이 골든과 CP949 샘플의 바이트를 바꾸지 않게 한다.

(macOS 에는 `<syscall.h>` 가 있지만 libc++ 가 include 하지 않는다. 아직 시도하지 않았다.)

---

## 7. SPIM 의 동작 — 고치지 말 것

### 긴 앞쪽 분기 (32 KB 이상)

SPIM 은 0x2000워드(32 KB) 이상 앞으로 가는 분기를 **오류 없이 뒤로 가는 워드로** 어셈블하고,
실행도 그렇게 한다. 원인은 `CPU/inst.h` 의 `IDISP` 다. 오프셋을 `<< 2` 한 **뒤에**
`SIGN_EX` 로 부호 확장하므로 bit 15 가 서면 음수가 된다.

| 사이 명령 수 | SPIM 워드 | 의도한 목적지 | SPIM 이 가는 곳 |
|---|---|---|---|
| 0x1ffe | `0x10001fff` | `0x00408020` | `0x00408020` |
| 0x2000 | `0x1000e001` | `0x00408028` | **`0x003f8028`** |
| 0x3000 | `0x1000f001` | `0x0040c028` | **`0x003fc028`** |

코어가 같으니 Qt판도 같다. TS 디코더(`src/core/decoder.ts`)의 목적지는 SPIM 이 실제로 실행한 PC 와
일치한다. **고치지 마라.** `tests/core/decoder.test.ts` 의
"a forward branch past 32 KB goes where SPIM sends it" 가 세 경우를 워드·디코드·실행으로 고정한다.

### 코어 `inst_decode()` 의 오명명

코어의 디코더는 몇몇 워드에 이름을 잘못 붙인다. 어셈블러가 만든 워드도, 실행도 맞다.
잘못되는 것은 **단어 하나를 디코드할 때의 이름**뿐이다.

- tt.core.s 에서 만나는 것: `movt`→`movf`, `movt.d`→`movf.d`, `movt.s`→`movf.s` 각 2개(모두 6개).
  그리고 `trunc.w.s`→`suxc1` 3개. 뒤의 것은 op.h 가 MIPS32 Release 2 명령에 같은 인코딩을 준 탓이고,
  qsort 가 어느 쪽을 먼저 두느냐에 따라 달라진다.
- 전체 목록은 Qt판 오라클 테스트가 고정해 둔 것과 같다.
  `bc1fl→bc1f`, `bc1tl→bc1t`, `bc2fl/bc2t/bc2tl→bc2f`, `cop2→(invalid)`, `movt*→movf*`.
- TS 디코더는 어셈블러가 만든 이름을 낸다. 비교기는 위 목록만 허용하고, 만난 개수를 테스트에 고정한다.
- 같은 이유로, 코어 `inst_decode()` 는 `c.xx.fmt` 와 FP `movf/movt` 의 필드를 엉뚱한 칸에 넣어 찍는다.
  비교기(`tests/helpers/decoder-oracle.ts` 의 `coreOperands`)가 그 찍는 방식까지 재현한다.

### 부작용이 있는 "읽기" 함수

- `find_symbol_address()` 는 모르는 이름이면 **심볼 테이블에 새 항목을 만든다**
  (`CPU/sym-tbl.cpp` `lookup_label`). 그러니 애드온에서 부르지 않는다.
  심볼은 어셈블 도중 `print_symbols()` 출력으로만 받는다(Qt판 `edu_loader` 와 같은 방식).
- `read_mem_*()` 는 데이터 세그먼트 밖 주소에서 예외를 일으켜 CP0 를 **쓴다.**
  애드온의 `readWords`/`readBytes` 는 범위를 먼저 검사하고 밖이면 `RangeError` 를 던진다.

### 같은 워드의 두 이름 — 플랫폼마다 다르다

`CPU/op.h` 에는 인코딩이 같은 이름 짝이 둘 있다: `trunc.w.s`/`suxc1`(`0x4600000d`), `floor.w.s`/`prefx`(`0x4600000f`).
뒤의 둘은 MIPS32 Rev 2 명령으로, SPIM 이 실행하지 않는다. 코어는 역어셈블할 표를 `qsort` 로 정렬하는데,
C 표준은 키가 같은 원소의 순서를 라이브러리에 맡긴다. 그래서 어느 이름이 보이는지가 플랫폼마다 다르다.

| | `trunc.w.s` 워드 | `floor.w.s` 워드 |
|---|---|---|
| 리눅스(glibc) | `suxc1` 로 보인다 | `floor.w.s` |
| Windows(MSVC) | `trunc.w.s` | `prefx` 로 보인다 |

- 실행에는 영향이 없다. 어셈블한 명령은 파서가 만든 명령 구조체로 실행되고, 이 표는 워드를 글자로 바꿀 때만 쓴다.
- Qt판 Windows 빌드도 같은 MSVC `qsort` 라 이 앱의 Windows 판과 같은 이름을 보인다.
- 우리 디코더(`src/core/decoder.ts`)는 두 플랫폼 모두 MIPS32 이름(`trunc.w.s`, `floor.w.s`)을 쓴다.
  Inspector 는 이 이름이다.
- `tests/core/decoder.test.ts` 가 플랫폼별로 둘 다 고정한다. Windows CI 에서 처음 드러났다.

### 프로세스 전역 상태

코어는 전부 프로세스 전역 변수이고 한 프로세스에 한 대뿐이다. 실행할 때마다
`signal(SIGALRM)`·`setitimer` 를 프로세스 전체에 건다. `fatal_error()` 는 반환하면 안 되는 함수다(8절).
`run_program()` 은 동기 호출이다.
그래서 코어는 자기 프로세스(`src/sim/worker.ts`)에서만 산다(`docs/ARCHITECTURE.md`).
`src/core/` 의 모듈은 전부 순수·동기이며 모듈 수준 상태가 없다. 상태와 비동기는 경계
(`native/index.ts`, `src/sim/`)에만 있다.

### 부작용이 있는 "읽기" 함수 (더)

- 텍스트 세그먼트 밖 주소에 브레이크포인트를 걸려고만 해도 CP0 가 바뀐다. `add_breakpoint` 와
  `inst_is_breakpoint` 가 `read_mem_inst`/`set_mem_inst` 를 거치는데, 범위 밖이면 예외(IBE)를 일으켜
  Cause 와 BadVAddr 를 **쓰기** 때문이다(측정: Cause 0→0x18, BadVAddr 0→0x500000).
  애드온의 `setBreakpoint`/`clearBreakpoint` 는 주소가 텍스트 세그먼트 안의 워드인지 먼저 보고,
  아니면 코어를 부르지 않는다. 메시지는 코어의 것과 같은 문장이다
  (`tests/node/run-control.test.ts` 가 CP0 가 그대로인지 확인한다).

---

## 8. 실행 제어 — stop 은 프로세스를 죽이지 않는다

### stop 의 구현

- 시뮬레이터 프로세스의 워커(`src/sim/worker.ts`)가 코어의 `run_program()` 을 **1만 명령씩**
  부른다(`run(10000)`, 약 2.6ms). 구간마다 이벤트 루프에 양보하고, 그 틈에 들어온 요청을 처리한다.
- `stop()` 은 정지 표시만 한다. 루프는 다음 구간 앞에서 끝나고 `run()` 이 `reason: 'stopped'` 로 답한다.
  그 뒤 머신은 멈춘 그대로다. PC 는 루프 안에 있고, 레지스터와 메모리를 읽을 수 있고, 이어서 실행할 수도 있다.
- 코어에는 이미 `force_break` 가 있다(`run_spim()` 이 명령마다 본다). 하지만 쓰지 않았다.
  JS 가 코어를 부르는 동안 다른 곳에서 그 변수를 세울 방법이 시그널이나 스레드뿐인데, 둘 다 경계를 복잡하게 만든다.
  구간을 짧게 나누면 같은 효과를 JS 안에서 얻는다.

### 왜 프로세스 종료가 기본이 아닌가

무한 루프를 세운 다음 레지스터와 메모리를 들여다보는 것이 이 도구의 교육적 핵심이다.
프로세스를 죽이면 머신이 통째로 사라진다. 그래서 종료는 **최후 수단**으로만 남겼다.
`stop()` 뒤 2초(`stopTimeoutMs`) 안에 실행이 끝나지 않을 때만 호스트가 죽이고, 새로 띄운다.
구간이 짧아서 정상적으로는 일어나지 않는다. 일어나면 `stop()` 이 `'killed'` 를 돌려주므로
UI 가 "머신을 잃었다"고 알릴 수 있다.

### 멈춘 이유

`exit`(정상 종료) · `error`(실행 오류) · `breakpoint` · `stopped`(사용자) · `limit`(`step(n)` 완료).
판정 순서는 이렇다.

- 코어가 "더 못 간다"(`continuable == false`)고 하면 `exit` 다. 그동안 `run_error` 가 있었으면 `error` 다.
  이 둘 뒤의 다음 실행은 처음부터 시작한다(QtSpim 의 Run 과 같다).
- `run_program()` 이 브레이크포인트를 보고하면 `breakpoint` 다.
- 둘 다 아니면 `limit` 이다. `stopped` 는 코어가 아니라 워커가 구간 사이에서 정한다.

### 브레이크포인트

- 코어의 것(`add_breakpoint`/`delete_breakpoint`/`list_breakpoints`)을 그대로 쓴다. 목록도 코어가
  쓰는 문장(`Breakpoint at 0x…`)을 받아 읽는다. 애드온이 따로 목록을 들고 있지 않는다.
- 브레이크포인트에서 멈춘 직후의 실행은 그 명령부터 실행한다. 코어의 `cont_bkpt` 를 쓰고,
  QtSpim 의 Continue 와 같다.
- 코어는 브레이크포인트 자리에 `break` 명령을 넣는다. 그래서 `textSegment()` 는 그 자리에서 잠시
  원래 명령을 꺼내 워드·줄을 읽고 `breakpoint: true` 를 붙인다. `format_an_inst()` 가 하는 방식과 같다.
- 같은 주소에 두 번 걸면 코어는 오류를 내지만, 애드온은 "이미 있음"(true)으로 받는다.

### 콘솔 출력

- 애드온은 프로그램이 찍은 바이트를 모아 두기만 한다. 워커가 구간이 끝날 때마다 가져가 스트리밍
  디코딩해서 `console` 이벤트로 보낸다. 늦어야 한 구간(수 ms)이니 사람에게는 "나오는 대로"다.
- 처음에는 출력이 생길 때마다 `force_break` 로 구간을 끊는 방식도 넣었다. 결국 뺐다.
  구간이 이미 충분히 짧고, 출력마다 IPC 가 한 번씩 들며, 애드온 표면만 늘었기 때문이다.
- 콘솔 **입력**(syscall 5/8/12)은 아직 없다. 지금은 빈 줄을 돌려준다. 입력을 기다리는 동안 루프를
  멈추는 설계가 다음에 필요하다.

### `fatal_error()` — `abort()` 대신 `_exit(70)`

코어는 `fatal_error()` 가 돌아오지 않는다고 가정한다. 첫 판은 `abort()` 했다. 그런데 테스트가 돌 때마다
Ubuntu 의 apport 가 `/var/crash` 에 8MB 짜리 크래시 파일을 남겼다. Windows 에서는 오류 보고(WER)
창이 뜰 수 있다. 학생이 `.err` 지시어를 쓰는 것만으로 그렇게 되면 안 된다.
그래서 메시지를 stderr 에 쓰고 `_exit(70)` 한다.

- 코어의 가정("돌아오지 않는다")은 그대로 지켜진다. 터미널판 spim 도 `exit(-1)` 이다.
- 자식만 죽고 호스트는 산다. 호스트는 종료 코드 70 과 stderr 의 `SPIM core fatal error: …` 로
  "시뮬레이터가 중단되었습니다"를 보고하고 새 프로세스를 띄운다.

---

## 9. gyp 의 msvs 생성기는 액션 인자를 경로로 고쳐 쓴다

`native/binding.gyp` 의 bison 액션은 접두어를 `-pyy` 로 **붙여** 쓴다. `-p`, `yy` 로 나누면
Windows 에서 깨진다.

gyp 의 msvs 생성기(`node-gyp/gyp/pylib/gyp/generator/msvs.py`)에는 액션 인자 규칙이 있다.
**`/`·`-` 로 시작하지 않고 `=` 도 없는 인자는 경로로 보고** .vcxproj 기준 상대경로로 고쳐 쓴다.
따로 떨어진 `yy` 는 `../yy` 가 됐고, win_bison 은 `extern YYSTYPE ../yylval;` 을 생성해
MSVC 가 `'.'` 에서 멈췄다. 리눅스(make 생성기)는 인자를 고치지 않아서 드러나지 않았다.
flex 는 처음부터 `-Pyy` 로 붙여 써서 괜찮았다. bison 도 그 표기에 맞췄다.

msvs 프로젝트를 리눅스에서 직접 생성해 나머지 인자도 확인했다.

- 스위치(`-I` `-8` `-Pyy` `-pyy`)는 그대로 남는다.
- `--defines=` `--output=` `--outfile=` 은 `=` 가 있어 그대로 남는다. 값은 `$(OutDir)…` 라서
  MSBuild 가 절대경로로 펼친다.
- 입력 파일(`../CPU/parser.y` 등)은 경로로 고쳐지는데, 이것은 의도한 대로다.

**`-p yy` 가 정석이라며 되돌리지 마라.**


---

## 10. 콘솔 입력 — 기다리지 않고 되감는다

Qt판은 코어가 `read_input()` 을 부르면 그 안에서 입력 대화를 띄우고 **기다렸다**(같은 스레드).
여기서는 코어가 워커의 이벤트 루프 위에서 도므로, 기다리면 워커가 멈춘다. 그동안 `stop` 도 레지스터 읽기도
받을 수 없다. 그래서 새 멈춤 이유 `input` 을 두고, 입력이 없으면 syscall 을 **되감는다**.

- 대기열이 비어 있을 때 `read_input()`(애드온)은 버퍼에 아무것도 쓰지 않는다. 그 syscall 직전의 PC,
  `$v0`, `$f0` 를 적어 두고 `force_break` 를 켤 뿐이다. syscall 은 읽은 것 없이 끝까지 가고, 코어가 다음
  명령 앞에서 멈추면 `run()` 이 셋을 되돌리고 `input` 을 돌려준다. syscall 이 쓴 `$v0`(read_int, read_char)와
  `$f0`(read_float/double)가 되돌려지므로 머신은 syscall 을 실행하기 전과 똑같다.
  read_string 의 버퍼(학생의 메모리)는 건드리지 않는다.
- `provideInput(text)` 는 UTF-8 바이트를 대기열 끝에 붙이기만 한다. 다음 `run`/`step` 이 syscall 을
  다시 실행하고, 그때 `read_input()` 이 대기열에서 **한 줄**(`\n` 까지, 최대 버퍼 크기)을 가져간다.
  줄 단위는 SPIM 콘솔의 동작이다. 여러 줄을 한 번에 주면 다음 읽기들이 차례로 가져간다.
- 새 프로그램을 어셈블하면 대기열을 비운다.

왜 다른 길이 아닌가:

| 대안 | 문제 |
|---|---|
| 워커 안에서 동기로 기다린다(`Atomics.wait` 등) | 워커가 멈춰 `stop`·읽기를 못 받는다. 호스트가 대신 죽여야 한다 |
| 실행 전에 입력을 전부 받아 둔다 | 프로그램이 무엇을 언제 읽는지는 실행해 봐야 안다. 대화형 프로그램(메뉴, 반복 입력)을 못 쓴다 |
| 코어의 syscall 코드를 고쳐 "대기" 상태를 만든다 | 코어를 고치지 않는다는 원칙에 어긋난다. 되감기는 애드온(프런트엔드) 안에서 끝난다 |

창에서는: `input` 으로 멈추면 콘솔이 펼쳐지고 입력 칸에 초점이 간다. Enter 를 누르면 그 줄에 `\n` 을 붙여
`provideInput` 하고, 멈추기 전의 동작(실행이었으면 실행, 한 줄이었으면 한 줄)을 이어 간다.
입력한 줄은 콘솔 기록에 입력으로 표시해 남긴다(파란 굵은 글씨). 조합 중인 한글의 Enter 는 줄을 보내지 않는다.

---

## 11. 창 — Qt판과 다르게 한 것

- **16진수는 모두 D2Coding.** Pretendard 는 `calt` 를 꺼도 `0x1` 을 `0×1` 로 그린다. 16진수 리터럴이 나올 수
  있는 모든 자리(주소, 워드, 레지스터 값, 설명 문장의 값, 오류 메시지 안의 주소, 콘솔 출력, 상태 표시줄)를
  mono 로 쓴다. 코어에서 온 문장(오류 메시지)은 `withHex()` 가 16진수처럼 보이는 부분을 떼어 mono 로 감싼다.
  `tests/e2e/hex-mono.e2e.ts` 가 그려진 DOM 의 텍스트 노드 전부를 훑어 확인한다.
- **저장하는 설정은 글자 크기와 Data 진법 둘뿐이다.** 글꼴·색 설정은 없앴다(테마는 한 벌).
  Ctrl + / Ctrl − / Ctrl 0 은 이번 실행에만 적용된다. 고급 항목은 접혀 있고 이번 실행에만 쓴다(12절).
  D2Coding 한자 글꼴은 그대로 둔다.
- **숫자 0 이 든 식별자도 D2Coding.** Pretendard 의 0 은 빗금·점 없는 타원이라, 글자 옆에서는 영문 O 로 읽힌다
  (`CP0` → "CPO", `$t0`, `F10`, `lab04.s`). 16진수 규칙과 같은 갈래라 같은 검사(`hex-mono.e2e.ts`)가
  "라틴 식별자 안의 0" 도 본다. 레지스터 이름, `CP0`, 단축키, 파일 이름, 형식 배지를 mono 로 바꿨다.
- **상태를 되살리지 않는다.** 창 크기·열린 파일·최근 파일·브레이크포인트·펼친 패널은 저장하지 않는다.
- **Ctrl+S = 저장 + 어셈블.** 새 파일이면 저장 대화상자가 뜨고, 취소해도 어셈블은 한다(상태 표시줄에 "저장하지 않음").
  어셈블이 성공하면 [실행] 국면으로 넘어간다. 실패하면 편집기 아래에 오류 목록이 나오고 그 줄이 표시된다.
- **조합 중 Ctrl+S.** Chromium 은 조합 중에 누른 Ctrl+S 를 `isComposing` 인 keydown 으로 넘기고,
  CodeMirror 는 조합 중에는 자기 keymap 을 돌리지 않는다. 그래서 Ctrl+S 는 창의 키 처리기가 받고,
  조합 중이면 `compositionend` 뒤에 저장한다. 반쯤 조합된 글자(`끄`)가 저장되지 않는다(`tests/e2e/ime.e2e.ts`).
- **Clear Registers · Reinitialize → "처음으로".** 같은 프로그램을 다시 어셈블한다. 브레이크포인트는 유지한다.
  코드가 바뀌어 다시 어셈블하면 브레이크포인트는 지운다(주소가 달라질 수 있다).
- **브레이크포인트 도달 모달 없음.** 상태 표시줄과 PC 줄로만 알린다.
- **커널 코드는 접혀 있다.** Text 끝의 "커널 코드(예외 처리기) N개 명령 숨김 · 보기". CP0 레지스터도 접힌 묶음이다.
- 아직 하지 않은 것: 튜토리얼 20단계, FP 레지스터 표시.

---

## 12. 설정 — 저장하는 것과 이번 실행에만 쓰는 것

| 무엇 | 저장 | 어디 |
|---|---|---|
| 글자 크기 | **저장** | `userData/settings.json` 의 `fontSize` |
| Data 진법(Data 탭이 여는 진법) | **저장** | `dataBase` |
| Ctrl + / Ctrl − / Ctrl 0 | 이번 실행만 | 창 안 |
| 고급: 머신 옵션, Run Parameters, 예외 처리기 | 이번 실행만 | 창 안. 다음 어셈블(Ctrl+S, 처음으로)부터 쓰인다 |
| 창 크기·위치, 패널, 최근 파일, 마지막 연 파일, 브레이크포인트 | **저장하지 않음** | — |

실습실 PC 는 여럿이 쓴다. 매 실행이 고정 기본값(QtSpim 의 기본값)에서 시작한다.
`settings.json` 에는 `fontSize` 와 `dataBase` 두 키만 들어간다(`tests/e2e/settings.e2e.ts` 가 파일을 읽어 확인한다).

**고급 항목** (Qt판 Simulator › Settings, Run Parameters):

- **bare machine** — 늘 꺼져 있고 바꿀 수 없다. Qt판도 체크 상자를 숨기고 끈다(`QtSpim/menu.cpp` `sim_Settings`, "EDU").
  켜면 교재의 `li`·`la`·`move` 가 문법 오류가 된다. 목록에는 두되 회색으로, 이유를 적어 둔다.
- **의사 명령 허용, delayed branches, delayed loads, mapped I/O, quiet** — 애드온 `assemble()` 의 여섯째 인자로
  코어 전역에 들어간다. 기본값은 QtSpim 의 것이다(`native/index.ts` `DEFAULT_MACHINE`).
  delayed branches 를 켜고 어셈블하면 Inspector 가 분기 목적지를 PC+4 기준으로 계산한다(`MipsDelaySlot`).
- **mapped I/O** 를 켜면 프로그램은 `input` 으로 멈추지 않고 수신 레지스터를 폴링한다. 그래서 실행 중에도
  콘솔 입력 칸을 열고, 워커는 실행 중에도 `provideInput` 을 받는다.
- **Run Parameters** — 인자 한 줄. `argv[0]` 은 늘 `program.s` 다(4절). 시작 주소 칸은 옮기지 않았다(`__start` 고정).
- **예외 처리기** — 기본(`CPU/exceptions.s`) / 불러오지 않음 / 파일. "불러오지 않음"은 프로그램이 `__start` 를 직접 둔다.
  애드온은 빈 처리기를 **읽지 않는다**. flex 는 0 바이트 버퍼를 스캔하지 못하고
  `fatal_error("flex scanner push-back overflow")` 로 프로세스를 끝낸다(측정으로 확인). Qt판도 상자를 끄면 파일을 읽지 않는다.

---

## 13. 패키징 — 번들 하나, node_modules 없음

`tools/package.ts` 가 `build/package/app/` 을 만들고 electron-builder 에 넘긴다.

- 메인 프로세스와 시뮬레이터 프로세스를 esbuild 로 각각 한 파일(`main.js`, `worker.js`)로 묶는다.
  이때 `process.env.SPIM_BUNDLE` 을 `"1"` 로 정의한다. `src/main/paths.ts`, `src/sim/transport.ts`, `native/index.ts` 는
  이 값을 보고 파일을 번들 옆에서 찾는다. 소스 트리에서 돌릴 때(개발, 테스트)는 지금까지와 같다.
- 애드온(`spim.node`)은 asar 밖(`app.asar.unpacked`)에 둔다. 네이티브 모듈은 asar 안에서 열 수 없다.
- 패키지 안에 node_modules 는 없다. 쓰는 라이브러리는 모두 번들에 들어 있다.
  electron-builder 는 기본으로 저장소의 `dependencies` 를 넣으려 해서 `files` 로 막았다.
- 애드온은 Electron 헤더로 빌드한 것을 쓴다(`npm run build:electron`).
- 같은 e2e 테스트가 패키지된 앱에서도 돈다(`SPIM_E2E_EXE`). 리눅스 `--dir` 빌드로 로컬에서, Windows 에서는 설치본으로 돌린다.

**Qt판 1.x 와 나란히** (`tools/windows/check-side-by-side.ps1` 이 실제 1.2.4 MSI 옆에서 확인한다):

| | Qt판 1.2.4 | 이 앱 |
|---|---|---|
| 설치 | MSI, 기기 단위(관리자), `Program Files\Hallym MIPS Simulator` | NSIS, **사용자 단위**(관리자 없이), `%LOCALAPPDATA%\Programs\Hallym MIPS` |
| 시작 메뉴 | 폴더 `Hallym MIPS Simulator` 안의 `Hallym MIPS Simulator` | **`Hallym MIPS`** |
| 설정 | 레지스트리 `HKCU\Software\HallymMIPS\HallymMIPS` | 폴더 `%APPDATA%\HallymMIPS2` |
| 제거 항목 | HKLM, 제품 코드 | HKCU, `Hallym MIPS 2.0.0-alpha.1` |
| 실행 파일 | `HallymMIPS.exe` | `HallymMIPS.exe` (폴더가 달라 겹치지 않는다) |
| `.s` 연결 | 없음 | 없음 |

- 이름은 어디서나 **Hallym MIPS** 다(창, 정보, 작업 표시줄, 설치 프로그램, 시작 메뉴, 설치 폴더, 제거 항목).
  Qt판의 "Hallym MIPS Simulator" 와 다르므로 시작 메뉴에서도 둘이 구별된다. 프로그램의 화면에는 "한림" 을 쓰지 않는다.
  예외는 라이선스 고지다: `NOTICE` 와 `src/renderer/assets/hallym/README.md` 는 권리자를 **한림대학교** 로 적는다
  (정보 창의 Licenses 에 그대로 보인다).
  설치 폴더 이름은 원클릭 설치 관리자에서는 패키지 이름을 따르므로, 패키지 이름을 `Hallym MIPS` 로 했다.
- 버전은 `2.0.0-alpha.1`. 1.2.4 를 쓰던 학생이 1.0.0 을 보면 내려간 것으로 읽는다.
- 서명하지 않았다. Windows SmartScreen 이 처음 실행 때 경고할 수 있다.

**고지**: BSD 는 바이너리 배포에도 고지가 따라가야 한다. 설치 폴더에 `LICENSE.txt`(SPIM BSD 전문)와
`NOTICE.txt` 가 실행 파일 옆에 있고, Electron 의 `LICENSE.electron.txt`·`LICENSES.chromium.html` 도 있다.
설정 → 이 프로그램에 대하여 → 라이선스는 패키지 안 `licenses/` 의 같은 파일을 읽는다
(`src/main/paths.ts` `LICENSES`). 번들된 npm 패키지의 라이선스는 esbuild 의 metafile 로 목록을 만든다
(`tools/licenses.ts`). 손으로 적은 목록이 아니라서 빠질 수 없다.


---

## 14. 코어 타이머 — 쓰임새, 그리고 Windows 의 핸들 누수

**무엇에 쓰이나.** `CPU/run.cpp` 의 `start_CP0_timer()`/`bump_CP0_timer()` 는 CP0 `Count` 레지스터를 10 ms 마다
1 올리고, `Count == Compare` 가 되면 하드웨어 인터럽트 7 을 올린다. **그것뿐이다.** 실행 제한, 무한 루프 감지,
syscall, 콘솔과는 관계없다(코어 전체에서 `bump_CP0_timer` 를 부르는 곳은 이 둘뿐).
이 저장소들의 교과 자료(`slides/course`, 예제)에는 `mfc0`/`mtc0`, `Count`/`Compare`, 인터럽트가 나오지 않는다.
그러니 교과목에는 **"안 쓰는 기능"** 이다. 인터럽트를 가르치게 되면 다시 볼 것.

| | 리눅스 | Windows |
|---|---|---|
| 방식 | `signal(SIGALRM, SIG_IGN)` + `setitimer`, 명령마다 `getitimer` 로 만료를 확인 | 이름 붙은 대기 타이머 `"SPIMTimer"` + 호출 스레드에 오는 APC, 명령마다 `SleepEx(0, TRUE)` |
| 시뮬레이터 프로세스 | 워커의 주 스레드가 코어를 부르므로 APC 도 그 스레드로 온다 | 같음 |

**Windows 에서 잰 것** (`tools/probe-platform.ts`, CI 의 설치본, 끝없는 루프):

| | 리눅스 (파일 디스크립터) | Windows (핸들) |
|---|---|---|
| 실행 중 | +0 | **1만 명령마다 +1** (CI 세 번: 초당 +364, +850, +458 — 러너 속도 차) |
| F10 한 번에 | +0 | **+1** |
| 실행 속도 | 약 380만 명령/초 | 약 370만~860만 명령/초 (러너마다 다름. `SleepEx` 로 눈에 띄게 느려지지 않음) |

원인: `start_CP0_timer()` 가 `run_spim()` 을 부를 때마다 `CreateWaitableTimer(NULL, TRUE, "SPIMTimer")` 를 부르고
핸들을 닫지 않는다. 이름이 같으므로 커널 객체는 하나지만 **핸들은 부를 때마다 하나씩 는다.**
이 앱은 정지가 늘 듣도록 1만 명령마다 `run_spim()` 을 다시 부르므로(ARCHITECTURE 3절) 초당 수백 개가 된다.
Qt판도 같은 코어라 샌다. Qt판은 10만 명령마다 `run_spim()` 을 다시 부르므로(`QtSpim/menu.cpp` `sim_Run`)
실행 속도가 같다면 이 앱의 10분의 1이다. 이 앱은 구간이 10배 짧아 10배 샌다.

- 초당 400개로 1시간이면 약 140만 개. 프로세스 한도(약 1600만)에는 멀지만 핸들 표가 계속 커진다.
  시뮬레이터 프로세스는 어셈블할 때마다 새로 뜨지 않으므로 한 세션 동안 쌓인다.
- 이름이 **세션 전체에서 공유**된다. 이 앱 둘, 또는 이 앱과 Qt판이 동시에 프로그램을 실행하면 서로의
  `SetWaitableTimer` 가 상대의 설정을 덮어, 한쪽의 `Count` 가 멈출 수 있다. 인터럽트를 쓰지 않으면 보이지 않는다.

### 고친 것 — Windows 에서만, 빌드 단계에서 (`CPU/` 는 그대로)

> **`CPU/run.cpp` 만 읽는 사람은 이 개입을 볼 수 없다.** Windows 에서 `native/binding.gyp` 는 `CPU/run.cpp` 대신
> **`native/src/run-win.cpp`** 를 컴파일한다. 이 파일이 강제 포함 헤더 노릇을 한다: `<Windows.h>` 를 먼저 넣고
> `CreateWaitableTimer` 를 `spimCreateWaitableTimer` 로 바꾼 뒤, `CPU/run.cpp` 를 **그대로** `#include` 한다.
> gyp 는 파일 하나에만 `/FI` 를 줄 수 없어서 감싸는 파일로 했다. 리눅스·macOS 는 `CPU/run.cpp` 를 직접 컴파일한다.
> `-iquote`(6절), `-pyy`(9절)와 같은 빌드 수준의 조치다.

- `spimCreateWaitableTimer()` 는 **이름 없는** 대기 타이머를 프로세스당 **한 번** 만들고, 그 뒤로는 같은 핸들을 돌려준다.
  - 새지 않는다: 핸들은 프로세스에 하나.
  - 공유하지 않는다: 이름이 없으니 다른 프로세스(Qt판 1.x, 이 앱의 다른 창)와 같은 타이머를 잡지 않는다.
    이름 공유 때문에 한쪽의 `Count` 가 멈추던 충돌도 함께 없어진다.
- 나머지는 코어 그대로다. `start_CP0_timer()` 는 `run_spim()` 마다 `SetWaitableTimer()` 로 그 하나를 다시 건다
  (전에도 이름으로 찾은 하나를 다시 걸었다). 완료 루틴(APC)은 코어를 부르는 스레드로 오고, 그 스레드가
  명령마다 `SleepEx(0, TRUE)` 로 받는다.
- 확인:
  - `tests/node/cp0-timer.test.ts` — 실행 중 `Count` 가 오르는지(구간 실행 그대로, Windows CI 에서도 돈다)
  - `tools/probe-platform.ts --expect-no-leak` — Windows CI 가 실행 10초·F10 200번 동안 핸들이 늘지 않는지 재고,
    늘면 실패한다
  - 이름 공유가 없어진 것은 코드로 확인한다(`CreateWaitableTimerW(NULL, …, NULL)`). 1.2.4 와의 동시 실행 시험은 하지 않았다
    (`Count` 는 `mfc0` 로만 보이고 교과목에서 쓰지 않는다).

고치기 전과 뒤(Windows CI, 설치본, 끝없는 루프):

| | 고치기 전 | 고친 뒤 |
|---|---|---|
| 실행 중 (10초) | 초당 +364 ~ +850 | **+0** (296 → 296) |
| F10 200번 | 한 번에 +1 | **+0** (296 → 296) |
| 실행 속도 | 약 370만~860만 명령/초 | 약 370만 명령/초 (같은 범위) |

---

## 15. 창 2차 — Windows 실사용 점검 뒤

(이 절의 화면 이름은 그때의 한국어다. 16절에서 영어로 바꿨다.)

**창 틀(A-1).** `titleBarStyle: 'hidden'` 에 `titleBarOverlay` 를 쓴다. 창 버튼(최소화·최대화·닫기)은 시스템이 그린다.
그래서 Windows 11 의 스냅 레이아웃(최대화 버튼에 올리면 나오는 분할 배치), 막대 두 번 눌러 최대화, 위로 끌어 최대화,
최대화했을 때의 가장자리가 운영체제 그대로다. 직접 그린 버튼으로는 스냅 레이아웃을 흉내 낼 수 없어서 이 길을 골랐다.
앱의 막대는 전체가 끌기 영역(`-webkit-app-region: drag`)이고 누르는 것은 모두 `no-drag` 다. 창 버튼 자리는
`env(titlebar-area-*)` 로 비워 둔다(e2e 가 확인). 창은 작업 영역보다 크게 뜨지 않고, 작은 화면에서는 최대화로 뜬다.

**좌우 분할(A-3).** Editor | Run 을 늘 나란히 둔다. 분할선은 끌기(두 번 눌러 기본), 양쪽 접기(분할선의 ‹ ›, 접힌 쪽은 세로 막대).
- Run 쪽은 기계가 Editor 의 코드를 담고 있을 때만 패널을 보인다. 어셈블 전("아직 어셈블하지 않았습니다"),
  어셈블 실패("어셈블하지 못했습니다"), 어셈블 뒤 코드가 바뀜("코드가 바뀌었습니다")은 문구가 다른 하람 카드다.
  하람(guide)은 글 오른쪽에서 왼쪽의 Editor 를 가리킨다 — 글과 가리키는 대상 사이에 끼지 않는다.
- 실행 중에는 Editor 가 실행할 줄을 파란 띠(오류 줄의 분홍과 다른 색·막대)로 표시한다. PC → 줄은 Text 의 줄 열
  (코어의 매핑)을 그대로 쓰고, 그 줄에 소스 문장이 실제로 있을 때만 표시한다(시작 코드의 줄 번호는 예외 처리기의 것이다).
  줄이 화면 밖이면 따라 스크롤하되, 학생이 2초 안에 스크롤했으면 뺏지 않는다.
- **좁은 창 기준은 CSS 980px.** 실습실 PC(1366×768, 125%)의 최대화 창은 1093px 이라 분할을 유지한다.
  1366×768 150%(910px), 1920 화면의 반쪽(960px)은 Editor / Run 탭(막대에 나타남)으로 한쪽씩 본다.
  1024×768(100%)은 분할이 유지된다. Run 쪽 안에서는 폭이 560px 아래면 위아래로 쌓는다(container query).
- 콘솔은 Registers 아래에 둔다. 실습실 PC 의 높이(약 480px)에서 Text 와 Inspector 가 세로를 다 쓰게 하려고.

**패널 머리(A-4).** `src/renderer/app/ui.ts` 의 `panelHead`·`tabsHead` 둘만 쓴다. 높이·글자·여백·오른쪽 보조 자리가 같다.
탭은 한 자리를 두고 겨루는 Text / Data 에만 쓴다. 머리의 이름은 영어(Editor, Registers, Text, Data, Console, Inspector),
나머지 말(버튼, 안내, 오류)은 한국어다.

**Data(B-1).** Qt판 Data 패널(`QtSpim/edu/edu_data_model.cpp`)의 표를 따랐다: Address | +0 | +4 | +8 | +C | ASCII.
주소는 모두 `0x…`, 사용자 데이터·스택·커널 데이터(접힘)를 구역으로 나누고 스택은 색을 달리했다. 0 구간은
"`~ 0x1003ffff` 까지 모두 0 · 49,144 워드". Qt판의 Labels 열은 좁은 패널에 들어가지 않아 그 줄 **위의 얇은 줄**로
옮겼다(라벨과 `$sp`/`$fp`/`$gp`). 워드와 그 네 글자는 가리키면 함께 밝아진다.

**Registers(B-2).** 방금 바뀐 레지스터: 노란 줄 + 막대 + "바뀜" 표, 바뀔 때 한 번 번쩍임, 다음 단계에서 걷힘.
16진이 가장 진하고 10진은 흐리게, 2진은 가장 흐리게(폭이 될 때만). 그룹은 이름과 범위(`$a0–$a3`)가 있는 띠.

**Inspector(B-3).** Qt판처럼 32비트 칸을 필드별로 묶어 그린다(좁으면 글자를 줄인다). 한 줄 실행할 때마다 PC 의 명령을
보이고, Text 에서 고르면 그 명령에 고정한다(머리에 "고정: 0x…", "현재 명령 따라가기", Esc). 첫 단계 전에는 안내.

**천천히 실행(B-4).** 실행 옆의 즉시 / 1줄/1초. 천천히는 창이 코어를 한 명령씩 부르고(`step(1)`) 사이에 1초 기다린다.
- 정지: Esc·멈춤은 기다림을 곧바로 끊는다(e2e: 한 단계 직후에 눌러도 0.5초 안에 멈춤). 코어는 한 명령만 돌고 있으므로
  3억 번 도는 루프라도 기다릴 것이 없다.
- 전환: 천천히 → 즉시는 기다림을 끊고 코어의 실행(`run`)으로 넘긴다. 즉시 → 천천히는 코어를 멈추고(`stop`) 천천히 잇는다.
- 브레이크포인트는 그 명령 앞에서, 입력은 기다렸다가 천천히 잇는다. 레지스터 강조·Inspector·Editor 줄이 한 단계마다 따라간다.

**오류·중단점(C-1).** 오류 패널은 무엇을 하면 되는지("15행을 고친 뒤 다시 Ctrl+S 하면 됩니다", 그 줄로 가는 버튼)를 먼저,
코어의 메시지와 줄, 흔한 메시지에 대한 도움말을 그다음에 둔다. 하람(curious)은 패널 끝. 거터: 중단점은 맨 왼쪽 칸의
빨간 점(누르면 켜고 끔), 오류는 `!` 배지 — 모양이 다르다. Editor 의 중단점은 줄로 기억되어 고쳐 쓰면 따라 움직이고,
어셈블할 때마다 그 줄의 첫 워드에 걸린다. Text 에서 건 것은 Editor 의 줄에도 보인다. 명령이 없는 줄에는 걸리지 않는다(알림).

**대화상자(C-2).** "저장하지 않은 변경" 등 묻는 창은 앱 안의 대화상자(하람)다. 새 파일은 저장된 상태에서도 묻는다.
파일 열기·저장 대화상자는 **운영체제의 것을 그대로 둔다**: USB·OneDrive·최근 위치·한글 경로를 학생이 늘 쓰던 대로
다루게 하려는 것이고, Qt판도 같다. 앱 안에 파일 탐색기를 새로 만드는 것은 이번 범위를 넘는다.

**시작 화면(C-3).** 카드 폭과 선택지 크기를 고정하고 줄바꿈을 적어 넣었다. 두 단계에서 바뀌는 것은 선택지의 글뿐이다(e2e 가
위치를 비교). 창 크기는 시작 화면과 본 화면이 같다(같은 창).

**입력(C-4).** Tab: 커서에서 다음 4의 배수 열까지 공백. 여러 줄을 고르면 4칸 들여쓰기, Shift+Tab 4칸 내어쓰기. Enter 는 0열.
탭 문자의 표시 폭도 4.

---

## 16. 화면 용어 — 이름은 영어, 학생에게 하는 말은 한국어

**규칙.** 화면에 있는 **것의 이름**은 영어다: 패널·탭 이름, 표의 열 머리, 레지스터 그룹, 메모리 구역, 명령 필드, 상태 칩,
툴바 버튼. 교재(Patterson & Hennessy)와 SPIM 이 쓰는 말이고, 학생이 강의 자료와 화면을 오갈 때 같은 낱말을 보게 하려는 것이다.
**학생에게 하는 문장**은 한국어다: 안내 카드, 오류 설명과 할 일, Inspector 의 해설, 대화상자 본문, 상태 표시줄의 문장, 빈 상태, 도움말.
영어 이름 뒤에 조사를 붙이지 않는다(`Data 의 값을`처럼 띄우거나 문장을 바꾼다). 프로그램 이름은 **Hallym MIPS** 다.

| 자리 | 전 | 후 |
|---|---|---|
| 툴바 | 어셈블 / 실행 / 한 줄 / 처음부터 | Assemble / Run(실행 중에는 Stop) / Step / Reset |
| 실행 속도 | 즉시 / 1줄/1초 | Instant / 1 line/s |
| 아이콘 버튼 | 튜토리얼 / 새 파일 / 파일 열기 / 설정 | Tutorial / New file / Open file (Ctrl+O) / Settings |
| 상태 힌트 | F10 한 줄 · F5 실행 | `F10` Step · `F5` Run |
| Registers 열 | 이름 / 16진 / 10진 / 2진 | Name / Hex / Dec / Bin |
| Registers 그룹 | 특수 / 반환값 / 인자 / 임시 / 보존 / 포인터 / 예약 | Special / Constant / Return values / Arguments / Temporaries / Saved / Pointers / Return address / Reserved / CP0 |
| Registers 표 | 바뀜 | Changed |
| Text 열 | 주소 / 인코딩 / 형식 / 명령 / 줄 / 소스 | Address / Encoding / Format / Instruction / Line / Source |
| Text 머리 | 명령 N개 | N instructions |
| Text 접힘 | 커널 명령 N개 숨김 | Kernel code(예외 처리기) 명령 N개는 숨겨 두었습니다 · Show |
| Data 구역 | 사용자 데이터 / 스택 / 커널 데이터 | User data / Stack / Kernel data |
| Data 0 구간 | … 까지 모두 0 · N 워드 | … 까지 모두 0 · 16,384 words |
| Inspector 표 | 필드 / 비트 / 2진 / 값 / 뜻 | Field / Bits / Binary / Value / Meaning |
| Inspector 칩 | PC 따라가기 / 고정: 0x… | Following PC / Pinned 0x… · Follow PC |
| Console | 접기 / 펼치기 / 입력 | Collapse / Expand / Input · Waiting for input |
| 설정 | 의사 명령, 지연 분기, … | Pseudo instructions / Delayed branches / Delayed loads / Mapped I/O / Quiet / Bare machine, Font size, Data radix(Hex / Dec / Bin), Program arguments, Exception handler(Default / None / File…), Advanced |
| 정보 | 정보 / 라이선스 / 닫기 | About / Licenses / Close |
| 파일 대화상자 형식 | MIPS 어셈블리 / 모든 파일 | MIPS assembly / All files |
| 새 파일 이름 | 제목 없음.s | untitled.s |

**Registers 그룹.** 교재의 레지스터 표(P&H 초록 카드)대로 나눴다. `$zero` 는 **Constant**(늘 0 인 상수), `$ra` 는 **Return address**
(`jal` 이 쓰는 자리) 로 각각 한 줄짜리 그룹이다. 전에는 `$zero` 가 특수, `$ra` 가 포인터에 섞여 있었다. 포인터는 `$gp`·`$sp`·`$fp`,
예약은 `$at`·`$k0`·`$k1`, 임시는 `$t0–$t7`·`$t8–$t9` 다. 그룹은 창의 것이다(`src/renderer/app/logic/machine.ts` 의 `WINDOW_GROUPS`).
`src/core/registers.ts` 는 Qt판을 옮긴 그대로 둔다.

**그대로 둔 한국어.** 첫 화면의 선택지(튜토리얼 보기 / 바로 시작 / 새 파일 / 파일 열기 / ← 처음으로), 대화상자의 버튼(버리고 계속 /
돌아가기 / 취소), 오류 패널의 "15행으로 가기", 상태 표시줄의 준비·N단계·방금 바뀜·고른 명령, Registers 머리의 "노란 줄은 방금 바뀐 레지스터",
Data 의 "눌러서 펼치기". 모두 학생에게 하는 말(무엇을 할지, 지금 어떤지)이라 한국어 쪽이다.

**화면 캡처.** `docs/screens/` 의 고정 세트를 라운드마다 `tools/capture-screens.ts` 로 다시 찍는다(`docs/screens/README.md`).

---

## 17. 창 3차 — 좁은 창이 지키는 것 (스크린샷 검토 뒤)

**열의 우선순위.** 실습실 PC(1366×768 배율 125%, CSS 1093px)에서 Registers 의 Hex·Dec·Bin, Text 의 Address·Encoding·Instruction 이
모두 보여야 한다. 16진·10진·2진을 함께 보는 것과 기계어가 이 과목의 주제다. 열은 CSS 컨테이너 쿼리가 아니라
`src/renderer/app/logic/columns.ts` 가 폭을 재서 정한다. 좁아지면 다음 순서로 양보하고, 필요한 만큼만 양보한다.

1. 여백(열 사이 간격, 안쪽 여백)
2. 글자 1px
3. 열 — Text 는 Source·Line(Editor 에 이미 보임) → Format → Address → Encoding(마지막), Registers 는 Dec → Bin(마지막),
   Data 는 ASCII(네 워드는 끝까지 둔다)

"Changed" 표는 열보다 먼저 빠진다(노란 줄과 막대가 같은 말을 한다). 폭이 가져간 열은 패널 머리의 버튼("+ Source", "+ Bin",
"+ ASCII")으로 다시 켠다. 켠 열은 폭이 보여 주는 것에 **더해지고** 다른 열을 밀어내지 않는다. 넘치면 표가 옆으로 스크롤하고,
Text 의 열 머리가 같이 움직인다. 켠 것은 이번 실행에만 둔다.

**창의 폭 배분.** Run 쪽이 먼저 받는다: Registers 가 Hex·Dec·Bin 에 필요한 폭(여백을 줄였을 때), Text 가 Address·Encoding·
Format·Instruction 에 필요한 폭. Editor 는 나머지의 40% 이하, 300px 이상이다. 1093px 에서 Editor 는 약 320px(38자쯤)이다.
끌어서 정한 폭은 그대로 따른다. Bin 은 네 자리씩 띄워 쓰되 공백 대신 3px 간격이다. 공백이면 여덟 묶음이 Hex·Dec 옆에 들어가지 않는다.

| 폭 | Registers | Text | Data |
|---|---|---|---|
| 1280×800 | Name Hex Dec Bin | Address Encoding Format Instruction | 네 워드 (ASCII 는 버튼) |
| 1093×582 (실습실) | Name Hex Dec Bin | Address Encoding Format Instruction | 네 워드 (ASCII 는 버튼) |
| 1024×728 | Name Hex Dec Bin | Address Encoding Instruction (글자 1px 작게) | 네 워드, 옆으로 약 25px 스크롤 |
| 910×505 (좁은 창, Run 탭) | Name Hex Dec Bin | 전부 (Line·Source 까지) | 전부 |

**툴바.** 좁아지면 `app.ts fitTitlebar()` 가 한 단계씩 양보한다: 단축키 표시 → 프로그램 이름(로고는 남음) → 버튼의 아이콘 →
속도를 버튼 하나로("Speed: Instant"). 버튼의 이름(Assemble·Run·Step·Reset)은 끝까지 남는다. 속도에는 "Run speed" 라는 이름을
붙여 Run 바로 옆에 둔다. 파일이 없는 첫 화면에는 툴바가 없다.

**한국어 줄바꿈.** `body` 에 `word-break: keep-all` 을 전역으로 건다. 어절 안에서 줄이 바뀌지 않는다. 한 줄보다 긴 코드 조각
(`.mono`)만 `overflow-wrap: anywhere` 로 아무 데서나 끊는다. Chromium 은 keep-all 에서도 "값(" 의 괄호 앞에서 끊으므로,
`codeText()` 가 한글 바로 뒤의 "(" 앞에 단어 결합자(U+2060)를 넣는다. e2e(`tests/e2e/fit.e2e.ts`)가 네 폭에서 화면의
한국어 낱말이 두 줄에 걸치는지 글자마다 확인한다.

**조사.** 이름 뒤에는 조사를 붙이지 않는다. 파일·레지스터·키·패널 이름, 변수로 들어가는 모든 것이 해당한다. "lab04.s 은" 은
이름을 어떻게 읽느냐에 따라 틀린다. 문장을 바꾸거나("File: lab04.s" 를 한 줄로 따로), 한국어 명사를 사이에 둔다(`$t7` 레지스터에,
Data 탭의, F10 키를). `tests/renderer/particles.test.ts` 가 창의 소스와 `src/core/explain.ts` 에서 보간·인라인 코드·라틴 낱말 뒤의
조사를 찾는다. 예외는 한국어 명사로 끝나는 보간(explain.ts 의 `val()` "값(…)", `where` "주소(…)", `unit` "워드")과 한국어 낱말 중
하나를 고르는 보간이다.

**Editor 의 띠.** 커서 줄 강조(`highlightActiveLine`)를 뺐다. 실행 중에 Editor 의 띠는 실행 줄 하나뿐이다.

**오류 화면.** 어셈블 오류는 Run 쪽(큰 쪽)의 Errors 패널에 둔다. 할 일("15행을 고친 뒤 다시 Ctrl+S 하면 됩니다")과
"15행으로 가기" 버튼, 오류 목록이 들어간다. 하람(curious)은 한 번만, 패널 오른쪽 끝에 둔다. 글과 Editor 사이가 아니고
화살표도 없다. Editor 에는 거터의 `!` 와 줄 색만 남는다. 좁은 창에서는 어셈블에 실패하면 Run 탭으로 가고, "N행으로 가기" 가
Editor 탭으로 돌아온다.

**바뀐 레지스터로 스크롤.** 한 단계 뒤 Registers 는 방금 바뀐 레지스터가 보이도록 필요한 만큼만 스크롤한다(PC 제외, 열 머리
아래에서 한 줄 여유). 학생이 2초 안에 목록을 직접 스크롤했으면 건드리지 않는다. Editor 의 실행 줄 따라가기와 같은 규칙이다
(`dom.ts userScrolls`).

**Inspector 가 좁을 때(480px 이하).** 머리를 두 줄로 나눈다. 첫 줄은 명령, 다음 줄은 Source 와 워드·주소다. 잘리지 않고
줄이 바뀐다. 필드 표는 필드마다 한 덩어리가 된다. 윗줄에 이름·값·뜻, 아랫줄에 Bits·Binary 를 둔다. 옆으로 스크롤하지 않는다.

**포기한 것.** 1024×728 의 Data 탭은 네 워드가 좁은 스타일에서도 약 25px 넘친다. 그래서 옆으로 스크롤한다. Editor 를 300px
밑으로 줄이거나 Registers·Text 에서 가져오는 것보다 낫다고 봤다. 이 폭에서 Text 의 Format 과 Source 는 버튼으로 켠다.

---

## 18. 튜토리얼 20단계

`src/renderer/app/tutorial.ts`. 예제 `src/examples/tutorial.s`(29줄)와 `tutorial-error.s`(6줄, 19단계에만)를 쓴다.
둘 다 **읽기 전용**으로 열린다(편집기 `EditorState.readOnly`, Ctrl+S 는 저장 없이 어셈블만 한다). 튜토리얼이 끝나면 내려간다.
디스크의 예제 파일은 어떤 경우에도 쓰지 않는다(e2e 가 끝난 뒤 해시를 비교한다).

**기억하지 않는다.** 진행 상태는 메모리에만 있다. 프로그램을 껐다 켜면 언제나 1단계다. 한 번의 실행 안에서 그만두었다가
다시 들어가면 "이어서 할까요?" 를 묻는다. 시작 화면은 매번 "튜토리얼 보기" 를 첫 선택지로 둔다.

**학생 파일.** 저장하지 않은 변경이 있으면 앱 안의 대화상자로 먼저 묻는다. 튜토리얼 동안 그 파일(바뀐 내용과
브레이크포인트까지)은 메모리에 두었다가, 끝나거나 그만두면 그대로 되돌린다. 파일이 없었으면 첫 화면으로 돌아간다.

**두 종류의 단계.** 설명(explain)은 [다음] 또는 → 로 넘어간다. 실습(practice)은 학생이 실제로 한 동작을 창이 알려 줄 때
(`Signal`: assembled · stopped · slow-ended · tab · breakpoint · reset · goto) 0.5초 뒤 저절로 넘어간다. 6초 뒤에 [건너뛰기] 가
나타나고, 누르면 그 동작을 대신 한다. 그래야 뒤 단계가 기대하는 상태가 된다. 각 단계의 `prepare` 는 필요한 상태를
스스로 맞춘다(어셈블, 시작 코드를 조용히 넘기기, 끝났으면 다시 시작). 그래서 [이전]·[다음]·이어서 어느 길로 들어와도 된다.
단계가 요구하지 않는 키(3단계의 F5 등)는 먹힌다. Esc 는 프로그램이 실행 중이면 실행을 멈추고, 아니면 그만두기를 묻는다.

**가리키기.** 대상은 파란 테두리로 두르고 나머지는 옅게(`rgba(0,32,91,.14)`) 덮는다. 덮인 곳은 눌리지 않는다.
카드는 대상 옆에 둔다(`logic/placement.ts`: 첫 대상의 오른쪽 → 왼쪽 → 아래 → 위, 다른 대상, 그다음 빈 곳 중 가장 가까운 곳).
대상과 12px 떨어지고, 제목 막대는 가리지 않는다. 하람은 카드의 흰 면 위, 대상에서 먼 쪽 끝에 선다. 튜토리얼 동안
화면의 다른 하람은 숨긴다(한 화면에 하나). 카드가 들어갈 자리가 없을 만큼 큰 대상은 두지 않는다: 패널 전체 대신
패널 머리와 가리킬 부분을 대상으로 삼는다.

**대상이 실제로 보이게.** 매 프레임 대상의 상자를 스크롤 상자로 잘라 본다. 없거나 잘렸으면 그 단계의 `reveal` 이
스크롤한다(초당 최대 5번). 단계로 들어갈 때 좁은 창의 쪽(Editor/Run)과 탭(Text/Data)을 맞춘다. 폭이 숨긴 열은 켰다가
끝나면 놓는다(Registers 의 Dec·Bin, Text 의 Encoding). 접힌 Console 은 편다.

| 폭 | 단계에서 튼 것 (e2e 로그) |
|---|---|
| 1280×800 | 4 Text 스크롤(lui·ori 줄) |
| 1093×582 | 3 Registers 스크롤(Temporaries 띠), 4 Text 스크롤 |
| 1024×728 | 4 Text 스크롤 |
| 910×505 | 3·4 스크롤, 5 Editor 쪽으로, 6 Run 쪽으로, 13 스크롤(Stack), 14 Editor 쪽으로 + 스크롤 |

3차 수정 뒤로는 네 폭 모두 Bin 과 Encoding 이 기본으로 보인다. 그래서 열을 켤 일은 큰 글자(Ctrl+= 네 번, 1024)에서만
생긴다. 이때 9단계가 Encoding 을 켜고, e2e 가 이 경우를 따로 확인한다. 좁은 창에서 두 쪽에 걸친 대상(12단계의 Editor `sw` 줄과
Data 워드, 18단계의 `syscall` 줄과 Console)은 Run 쪽 대상만 가리킨다. 문장도 그에 맞춰 바뀐다.

**검사.** `tests/e2e/tutorial.e2e.ts`: 1280·1093·1024·910 네 폭에서 20단계를 실제 동작으로 끝까지 걷는다. 단계마다
대상이 화면 안에 있는지, 카드가 대상을 덮지 않는지, 대상 가운데를 누르면 그 대상에 닿는지, 하람이 하나이고 먼 쪽에 있는지 본다.
[건너뛰기] 만으로 걷기, 16단계 천천히 실행 중 그만두기, 키 거르기와 읽기 전용, 학생 파일 되돌리기, 껐다 켜면 1단계,
예제 파일 해시도 확인한다. `tests/node/examples.test.ts` 는 예제가 단계에 필요한 것을 갖췄는지 본다(lui+ori, R형 add, sw 로 바뀌는
total, 출력 "sum = 12", 오류 한 줄).

