# QtSpim-Edu 1.0.0 사용 안내

QtSpim-Edu는 MIPS 시뮬레이터 **QtSpim 9.1.24의 화면만 바꾼** 교육용 확장판입니다.
시뮬레이터 본체(어셈블러와 실행기)는 원본 그대로여서, **같은 프로그램은 표준 QtSpim과 똑같이 어셈블되고 똑같은 결과를 냅니다.** 과제는 어느 쪽에서 확인해도 됩니다.

## 1. 설치

1. `QtSpimEdu-1.0.0-win64.zip`을 원하는 폴더에 풉니다. (MSI 설치 파일도 있지만 zip을 권장합니다. 관리자 권한이 필요 없고, 지울 때는 폴더만 지우면 됩니다.)
2. `QtSpimEdu.exe`를 실행합니다.
3. "Windows의 PC 보호" 창이 뜨면 **추가 정보 → 실행**을 누릅니다. 코드 서명이 없어서 나오는 경고입니다.

표준 QtSpim이 이미 설치되어 있어도 됩니다. 실행 파일 이름과 설정 저장 위치가 달라서 서로 영향을 주지 않습니다.

## 2. 기본 흐름

1. **Editor** 탭에 코드를 씁니다. (Editor > New / Open, 최근 파일은 Editor > Open Recent)
2. **Ctrl+S** — 저장과 어셈블을 한 번에 합니다. F3, 툴바의 Assemble도 같은 동작입니다.
    - 성공하면 **Text** 탭으로 넘어갑니다.
    - 에러가 있으면 Editor에 머물고, 아래 목록에 에러가 나옵니다. 항목을 누르면 그 줄로 갑니다. 파일은 저장된 상태입니다.
3. **F5** 실행, **F10** 한 명령씩 실행. 브레이크포인트는 Text 탭의 BP 칸을 누르면 됩니다.

Text·Data 탭 위에 노란 띠 "**Source changed — save (Ctrl+S) to assemble**"가 보이면, 지금 보고 있는 내용이 에디터의 코드와 다르다는 뜻입니다. Ctrl+S를 누르거나 띠를 누르면 반영됩니다. 프로그램을 다시 켰을 때도 마지막 파일이 열린 채로 이 띠가 보입니다(자동으로 어셈블하지는 않습니다).

## 3. 표준 QtSpim과 다른 점

| 화면 | QtSpim-Edu | 표준 QtSpim |
|---|---|---|
| 레지스터 (왼쪽) | 용도별 그룹(Arguments, Temporaries, Saved …), `$t0`과 번호 `R8` 함께 표시, 값은 16진수와 10진수 두 열. Int Regs / FP Regs는 **세로 탭** | 한 줄씩 나열, 위쪽 탭 |
| Inspector (왼쪽 아래) | 레지스터·명령어·메모리 워드를 고르면 hex / 부호 있는·없는 10진수 / 2진수(비트 눈금)를 보여 줌 | 없음 |
| Text | 열: BP · 주소 · 기계어 · **타입 배지(R / I / J …)** · 명령어 · 소스. 명령어를 고르면 Inspector에 **opcode, rs, rt, rd, shamt, funct, immediate 필드 분해**와 분기·점프 목적지. `li`, `la`처럼 여러 명령어로 펼쳐지는 줄은 색 띠로 묶임. 커널 코드는 접혀 있음(머리 행을 누르면 펼쳐짐) | 글자로만 표시 |
| Data | 주소 · +0 · +4 · +8 · +C · ASCII · **Labels**. `.data`의 라벨 이름, **`$sp` `$fp` `$gp`가 가리키는 칸 표시**, Words / Half words / Bytes 전환, Go to(주소·라벨·`$sp`). 스택 맨 위의 **환경변수 영역은 접혀 있음** — 사용자 이름과 폴더 경로가 들어 있어서, 스크린샷에 나오지 않게 한 것입니다 | 글자로만 표시, 환경변수가 그대로 보임 |
| Editor | 프로그램 안에서 편집, 문법 색, 에러 목록 | 없음(메모장 등으로 편집 후 Load) |
| File > Load File | 프로그램이 이미 올라와 있으면 "**Reinitialize and load / Add to current program / Cancel**"을 물음 | 묻지 않고 위에 얹음 |
| 상태바 | Bare Machine 같은 설정이 켜져 있으면 노란 표시, 오른쪽 끝에 버전 | 없음 |

## 4. 알아둘 것

- **분기 명령의 offset이 교재와 1 다릅니다.** SPIM은 기본 모드에서 지연 분기(delay slot)가 없어서 `beq`, `bne` 등의 offset을 **분기 명령 자신의 주소(PC)** 기준으로 넣습니다. 교재의 MIPS는 PC+4 기준입니다. Inspector가 목적지 계산식을 함께 보여 줍니다. 표준 QtSpim도 똑같이 인코딩합니다.
- **Load File과 Reinitialize and Load File은 다릅니다.** Load File은 지금 올라와 있는 프로그램 **위에 더합니다**. 같은 파일을 다시 올리면 `Label is defined for the second time … main` 에러가 납니다. 다시 올릴 때는 Reinitialize and Load File(또는 Ctrl+S)을 쓰세요.
- **Simulator > Settings의 Bare Machine을 켜 두면** `li`, `la`, `move` 같은 pseudo 명령이 전부 syntax error가 됩니다. 이 설정은 프로그램을 껐다 켜도 남습니다. 상태바에 노란 "Bare Machine"이 보이면 꺼 주세요.
- 폴더 이름에 한글이 있어도 한국어 Windows에서는 문제없습니다. 영문 Windows처럼 시스템 언어가 한국어가 아니면 시뮬레이터가 그 경로를 열지 못하는데, 이때는 경고를 띄우고 로드를 건너뜁니다. 파일을 영문 경로로 옮기세요.
- 소스 파일은 열었을 때의 인코딩(UTF-8 또는 CP949)과 줄바꿈(CRLF / LF) 그대로 저장됩니다.

## 5. 알려진 문제 (표준 QtSpim과 같음)

- 브레이크포인트가 걸린 줄은 **File > Save Log File로 저장한 Text 로그에서 글자가 깨져** 보입니다(`N [x0040002] …`). 화면에서는 정상입니다.
- 어셈블 에러 중 일부(범위를 벗어난 상수 등)는 아래 메시지 창에 **한 줄 뒤의 번호**로 찍힙니다. 에디터의 에러 목록과 빨간 점은 실제 줄을 가리킵니다.
- 어셈블 에러는 파일의 **첫 syntax error에서 멈춥니다.** 그 뒤의 에러는 고치고 나서야 보입니다.

문의·버그: <https://github.com/ars2323/qtspim-edu/issues>
SPIM은 James R. Larus의 저작물이며 BSD 라이선스로 배포됩니다. QtSpim-Edu는 SPIM 프로젝트와 무관한 비공식 수정판입니다.
