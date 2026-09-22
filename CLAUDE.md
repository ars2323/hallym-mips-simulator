# Hallym MIPS Simulator — Claude Code 작업 규칙

SPIM/QtSpim **9.1.24** (SVN r764, git tag `vanilla-9.1.24`) 기반 교육용 확장판 QtSpim-Edu 1.0.1의 한림대학교용 파생판.
레이아웃·기능·시뮬레이터 코어는 QtSpim-Edu 그대로 두고 **겉모습(브랜딩·색·글꼴·아이콘·간격)만** 바꾼다 (PLAN.md "H단계").
수업에서 표준 QtSpim과 함께 쓰이므로 **시뮬레이션 결과는 원본과 완전히 같아야 하고, 바뀌는 것은 GUI뿐**이다.
최종 배포 대상은 **Windows**. 전체 계획은 `PLAN.md`, 코드 구조 조사 결과는 `docs/ARCHITECTURE.md`(1단계에서 작성), 디자인 토큰은 `docs/design/tokens.md`.

## 빌드 (Linux 개발 환경)

```bash
mkdir -p build && cd build && qmake ../QtSpim/QtSpim.pro && make -j$(nproc)
./build/HallymMIPS   # H2까지는 QtSpimEdu
```

- Ubuntu 22.04 · Qt 5.15.3 · bison 3.8.2 · flex 2.6.4 · g++ 11
- Windows 빌드: Qt 5.15.2 + MSVC 2019 (PLAN 2단계에서 CI로 구성)
- 반드시 shadow build(`build/`). 소스 디렉터리에서 qmake 실행 금지.

## 절대 규칙

1. **`CPU/` 디렉터리는 수정하지 않는다.** 시뮬레이터 코어는 원본 그대로. 수정이 불가피하다고 판단되면 작업을 멈추고 사유와 대안을 보고한다.
2. **`CPU/version.h`의 `SPIM_VERSION`은 수정하지 않는다.** 우리 버전 정보는 `QtSpim/edu/edu_version.h`에 둔다.
3. **기존 기능 회귀 금지.** 원본에 있던 메뉴·동작(레지스터/메모리 값 변경, 브레이크포인트, 표시 진법 옵션, User/Kernel 표시 토글, 인쇄, 로그 저장, 설정, 실행 인자 등)은 새 UI에서도 전부 동작해야 한다. 목록은 `docs/ARCHITECTURE.md`의 "보존 기능" 표가 기준이다.
4. **Qt 5.15 공통 API만 사용.** Qt6 전용 API, 5.15에서 deprecated된 API, POSIX/Win32 전용 API 금지. Linux(5.15.3)와 Windows(5.15.2) 양쪽에서 빌드되어야 한다.
5. **빌드가 소스 트리를 더럽히면 안 된다.** `make` 후 `git status`가 깨끗해야 한다.
6. **코어 구조를 추측하지 않는다.** 레지스터 배열, 텍스트 세그먼트, 명령어 인코딩, 심볼 테이블, 메모리 읽기 경로 등은 반드시 소스를 읽어 확인하고 `docs/ARCHITECTURE.md`에 파일:줄 근거와 함께 기록한 뒤 사용한다.
7. **숫자 표시는 한 곳에서만 만든다.** hex/dec/bin 변환, 명령어 필드 분해, 주소 계산은 `QtSpim/edu/core/`의 테스트된 함수를 통해서만 한다. 위젯 안에서 즉석 포맷팅 금지.
8. **이름.** 표시명 "Hallym MIPS Simulator", 실행 파일·설정 폴더 "HallymMIPS", 한글 "한림 MIPS 시뮬레이터"(안내문에만). 화면·메뉴·파일명·문서 어디에도 QtSpim/Spim/Edu 표기를 남기지 않는다. 예외: BSD·LGPL 조건상 About → License 탭과 동봉 LICENSE 파일의 원본 저작권 고지(James Larus, SPIM)와 Qt LGPL 고지는 그대로 둔다. 코드 식별자(`edu_*`, `EDU_*`)는 이름이 아니라 코드이므로 바꾸지 않는다.
9. **CI 자산은 변형하지 않는다.** 심볼마크·로고타입·엠블럼·시그니처(`assets/ci/`)는 축소와 여백만. 단색화·회전·비율 변경·색 변경·요소 분리 금지. 색·글꼴·간격은 `docs/design/tokens.md`의 토큰만 쓴다 — `QtSpim/edu/theme/tokens.h`와 `theme/light.qss` 밖에서 색·글꼴 리터럴 금지.
10. **문자열 리터럴은 `const char*` 또는 `QString`으로만 받는다.** MSVC의 `-Zc:strictStrings`는 코어(`CPU/`)가 `char*`에 리터럴을 넘기기 때문에 `.pro`에서 껐다. `QtSpim/edu/`의 새 코드는 그 예외에 기대지 않는다: 리터럴을 `char*`에 대입하거나 `char*` 매개변수에 넘기지 않는다.

## 검증 — 완료 선언 전 필수

1. 새로 추가·수정한 코드에서 컴파일 경고 0
2. `tests/` 단위 테스트 전부 통과
3. UI 변경이 있으면 스크린샷 하네스로 캡처하고 **이미지를 직접 Read로 열어 확인**한다. 캡처 없이 UI 작업 완료라고 말하지 않는다.
4. 회귀 스크립트 통과: `Tests/`의 원본 테스트 프로그램 실행 결과가 `vanilla-9.1.24` 빌드와 동일
5. 단계 종료 시 **사람 체크포인트**: 실제 모니터(Linux)에서 사람이 확인할 체크리스트를 제시하고 멈춘다. 사람 승인 없이 다음 단계로 넘어가지 않는다. Windows zip 확인은 단계마다 하지 않고 **7단계 완료 후(3~7단계를 한 번에)와 8단계**에서 한다 — 그 사이에는 push마다 도는 CI(Windows 빌드·단위 테스트·패키징)가 초록불이어야 한다.

offscreen 캡처는 폰트·DPI·테마가 실제와 다를 수 있다. 내용·배치 확인용이지 최종 외관 판정용이 아니다.

## 코드 배치

| 위치 | 용도 |
|---|---|
| `QtSpim/edu/core/` | 순수 로직(포맷터, 디코더). QtCore까지만 의존. 전부 단위 테스트 대상 |
| `QtSpim/edu/` | 새 GUI 코드(모델, 뷰, 인스펙터, 에디터) |
| `tests/` | Qt Test 기반 단위 테스트 (별도 `.pro`) |
| `tools/` | 스크린샷 하네스, 회귀 스크립트 |
| `docs/` | ARCHITECTURE.md 등 |

원본 `QtSpim/*.cpp` 수정은 새 코드를 연결하는 최소한으로 한정하고, 수정 지점마다 `// EDU:` 주석을 단다.

## 커밋

- 작게, 한 커밋 한 목적. 메시지 형식: `[단계번호] 요약` (예: `[3] register panel: group headers`)
- 포맷 변경과 로직 변경을 섞지 않는다. `git clang-format`으로 **새/변경 줄만** 포맷. 원본 파일 전체 재포맷 금지.
- 원본 파일의 권한 비트(100755) 변경 금지.
- 단계 완료 시 태그 `stage-N`.

## 한국어 · Windows 주의

- 학생 PC의 Windows 사용자명·경로에 한글이 들어갈 수 있다. 파일 경로가 QString에서 코어(`char*`, `fopen`)로 넘어가는 지점의 인코딩을 확인하고 한글 경로로 테스트한다.
- `.s` 파일에 한글 주석이 흔하다. 에디터는 UTF-8 기본, CP949 파일 열기 지원, 줄바꿈(CRLF/LF) 원본 유지.
- 설치 시 표준 QtSpim과 충돌하지 않아야 한다(설치 경로, 실행 파일명, MSI UpgradeCode, `.s` 확장자 연결).
