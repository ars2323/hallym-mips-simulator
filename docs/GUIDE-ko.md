# 한림 MIPS 시뮬레이터 1.0.1 사용 안내

한림 MIPS 시뮬레이터(Hallym MIPS Simulator)는 MIPS 시뮬레이터 **QtSpim 9.1.24의 화면만 바꾼** 한림대학교 수업용 프로그램입니다.
시뮬레이터 본체(어셈블러와 실행기)는 원본 그대로여서, **같은 프로그램은 표준 QtSpim과 똑같이 어셈블되고 똑같은 결과를 냅니다.** 과제는 어느 쪽에서 확인해도 됩니다.

## 1. 설치

1. `HallymMIPS-1.0.1-win64.zip`을 원하는 폴더에 풉니다. (MSI 설치 파일도 있지만 zip을 권장합니다. 관리자 권한이 필요 없고, 지울 때는 폴더만 지우면 됩니다.)
2. `HallymMIPS.exe`를 실행합니다.
3. "Windows의 PC 보호" 창이 뜨면 **추가 정보 → 실행**을 누릅니다. 코드 서명이 없어서 나오는 경고입니다.

표준 QtSpim이 이미 설치되어 있어도 됩니다. 실행 파일 이름과 설정 저장 위치가 달라서 서로 영향을 주지 않습니다.

## 2. 처음 실행 — 화면 안내 투어

처음 실행하면 **안내 투어**가 뜹니다. 예제 프로그램(`samples/tutorial.s`)을 열고 몇 명령 실행한 상태에서 시작해, 화면을 어둡게 하고 툴바 버튼·열 제목·배지·셀 같은 **실제 요소를 하나씩** 밝혀 가며 표준 QtSpim과 무엇이 다른지 짚어 줍니다. 툴바 → 레지스터 → 인스펙터 → Text → Data → 에디터 순서로 18단계입니다.

- **다음 / 이전**으로 이동하고, **건너뛰기**나 **Esc**로 언제든 끝냅니다.
- 카드 오른쪽 위의 **EN / 한국어**로 언어를 바꿀 수 있습니다.
- 다시 보려면 **Help > Tutorial**을 누릅니다. 이미 파일을 열어 둔 상태에서 실행하면 그 파일 위에서 진행합니다.
- 키보드로도 됩니다: Enter·Space·→ 다음, ← 이전, Esc 종료.

닫아 둔 패널의 단계는 건너뛰고 번호를 다시 매깁니다. 투어가 화면 배치를 바꾸지는 않습니다. 투어가 연 예제는 그대로 남으니, **Simulator > Reinitialize**로 비우고 시작하면 됩니다.

## 3. 기본 흐름

1. **Editor** 탭에 코드를 씁니다. (Editor > New / Open, 최근 파일은 Editor > Open Recent)
2. **Ctrl+S** — 저장과 어셈블을 한 번에 합니다. F3, 툴바의 Assemble도 같은 동작입니다.
    - 성공하면 **Text** 탭으로 넘어갑니다.
    - 에러가 있으면 Editor에 머물고, 아래 목록에 에러가 나옵니다. 항목을 누르면 그 줄로 갑니다. 파일은 저장된 상태입니다.
3. **F5** 실행, **F10** 한 명령씩 실행. 브레이크포인트는 Text 탭의 BP 칸을 누르면 됩니다.

Text·Data 탭 위에 띠가 보이면, 지금 보고 있는 것이 에디터의 파일과 다르다는 뜻입니다. 띠가 이유를 말해 줍니다 — 코드를 고쳤거나(**Source changed**), Reinitialize로 시뮬레이터가 비워졌거나(**Simulator was reinitialized**), Text에 다른 프로그램이 올라가 있거나(**Text shows a different program**). 어느 경우든 Ctrl+S를 누르거나 띠를 누르면 이 파일이 어셈블됩니다. 프로그램을 다시 켰을 때도 마지막 파일이 열린 채로 이 띠가 보입니다(자동으로 어셈블하지는 않습니다).

### 글자 크기

에디터의 글자 크기는 **Ctrl +** 와 **Ctrl -** 로 바꾸고 **Ctrl 0** 으로 되돌립니다(Ctrl+휠도 됩니다). 8~32pt이고, 바꾼 크기는 다음에 켤 때도 유지됩니다. Editor 메뉴의 Zoom In / Zoom Out / Reset Zoom과 같은 기능입니다. 에디터만 커지고 Text·Data·인스펙터는 그대로입니다.

## 4. 표준 QtSpim과 다른 점

아래 그림은 두 프로그램에 **같은 파일(helloworld.s), 같은 실행 단계, 같은 창 크기**를 준 것입니다. 왼쪽이 표준 QtSpim 9.1.24, 오른쪽이 Hallym MIPS Simulator입니다. 값은 같고, 보여 주는 방식만 다릅니다.

**레지스터** — Run이 끝난 뒤. 용도별 그룹(Arguments, Temporaries, Saved …), `$이름`과 번호 `R8`, 16진수와 10진수 두 열, 이번 실행으로 바뀐 값은 청록색 굵은 글씨. Int Regs / FP Regs는 왼쪽의 **세로 탭**입니다.

![레지스터 비교](images/compare/01-registers.png)

**Text** — 열로 나뉩니다: BP(누르면 브레이크포인트) · 주소 · 기계어 · **타입 배지(R / I / J …)** · 명령어 · 소스. `li`, `la`처럼 여러 명령어로 펼쳐지는 줄은 색 띠로 묶이고, 커널 코드는 접힌 한 줄입니다(머리 행을 누르면 펼쳐짐).

![Text 비교](images/compare/02-text.png)

**명령어 필드 분해** — 명령어를 고르면 왼쪽 아래 Inspector가 기계어를 **opcode, rs, rt, immediate**(또는 **rd, shamt, funct**)로 나누고, 레지스터 이름과 분기·점프 목적지를 보여 줍니다. 레지스터나 메모리 워드를 고르면 hex / 10진수 / 2진수를 보여 줍니다. 표준 QtSpim에는 없는 기능입니다.

![Inspector 비교](images/compare/03-inspector.png)

**Data와 스택** — 주소 · +0 · +4 · +8 · +C · ASCII · Labels. `.data`의 라벨 이름, **`$sp` `$fp` `$gp`가 가리키는 칸 표시**, Words / Half words / Bytes 전환, Go to(주소·라벨·`$sp`). 스택 맨 위의 **환경변수 영역은 접혀 있습니다** — 왼쪽 그림처럼 사용자 이름과 폴더 경로가 들어 있어서, 스크린샷에 나오지 않게 한 것입니다(누르면 펼쳐짐).

![Data 비교](images/compare/04-data.png)

**Editor** — 프로그램 안에서 편집하고 Ctrl+S로 저장+어셈블. 에러는 창이 하나씩 뜨는 대신 목록으로 나오고, 해당 줄에 빨간 점이 찍힙니다.

![Editor 비교](images/compare/05-editor.png)

그 밖에: 프로그램이 이미 올라와 있을 때 **File > Load File**을 누르면 "**Reinitialize and load / Add to current program / Cancel**"을 묻습니다(표준 QtSpim은 묻지 않고 위에 얹습니다). Bare Machine 같은 설정이 켜져 있으면 상태바에 표시가 뜨고, 상태바 오른쪽 끝에 버전이 나옵니다.

## 5. 알아둘 것

- **분기 명령의 offset이 교재와 1 다릅니다.** SPIM은 기본 모드에서 지연 분기(delay slot)가 없어서 `beq`, `bne` 등의 offset을 **분기 명령 자신의 주소(PC)** 기준으로 넣습니다. 교재의 MIPS는 PC+4 기준입니다. Inspector가 목적지 계산식을 함께 보여 줍니다. 표준 QtSpim도 똑같이 인코딩합니다.
- **Load File과 Reinitialize and Load File은 다릅니다.** Load File은 지금 올라와 있는 프로그램 **위에 더합니다**. 같은 파일을 다시 올리면 `Label is defined for the second time … main` 에러가 납니다. 다시 올릴 때는 Reinitialize and Load File(또는 Ctrl+S)을 쓰세요.
- **Simulator > Settings의 Bare Machine을 켜 두면** `li`, `la`, `move` 같은 pseudo 명령이 전부 syntax error가 됩니다. 이 설정은 프로그램을 껐다 켜도 남습니다. 상태바에 "Bare Machine" 표시가 보이면 꺼 주세요.
- 폴더 이름에 한글이 있어도 한국어 Windows에서는 문제없습니다. 영문 Windows처럼 시스템 언어가 한국어가 아니면 시뮬레이터가 그 경로를 열지 못하는데, 이때는 경고를 띄우고 로드를 건너뜁니다. 파일을 영문 경로로 옮기세요.
- 소스 파일은 열었을 때의 인코딩(UTF-8 또는 CP949)과 줄바꿈(CRLF / LF) 그대로 저장됩니다.

## 6. 알려진 문제 (표준 QtSpim과 같음)

- 브레이크포인트가 걸린 줄은 **File > Save Log File로 저장한 Text 로그에서 글자가 깨져** 보입니다(`N [x0040002] …`). 화면에서는 정상입니다.
- 어셈블 에러 중 일부(범위를 벗어난 상수 등)는 아래 메시지 창에 **한 줄 뒤의 번호**로 찍힙니다. 에디터의 에러 목록과 빨간 점은 실제 줄을 가리킵니다.
- 어셈블 에러는 파일의 **첫 syntax error에서 멈춥니다.** 그 뒤의 에러는 고치고 나서야 보입니다.

## 7. 화면 배치

- **Editor와 Text를 나란히 보기**: Window > Layout에서 고릅니다.
  - **Tabs** — Editor, Text, Data가 한 탭 묶음(처음 상태).
  - **Editor | Text** — 왼쪽 Editor, 오른쪽 Text(Data는 Text 뒤 탭). Ctrl+S 뒤에도 Editor가 그대로 보이고 Text만 새로 그려집니다.
  - **Editor / Text** — 위 Editor, 아래 Text.
  - 탭을 직접 끌어서 다른 패널의 옆이나 위·아래에 놓아도 되고, 제목줄을 끌어 다른 탭 위에 놓으면 다시 탭으로 합쳐집니다. 배치는 다음 실행에도 유지되고, Window > Tile이 처음 상태로 되돌립니다.
- **메시지 로그 끄기**: Window > Message Log(**Ctrl+L**). 끄면 아래 메시지 창이 사라지고 패널이 그 자리를 씁니다. 어셈블 에러나 실행 중 예외가 나면 저절로 다시 켜집니다.
- **Inspector 높이**: Inspector 위의 경계를 끌어 높이를 바꿀 수 있습니다. 손대기 전에는 선택한 내용에 맞춰 저절로 커지고 작아지며, 한 번 끌면 그 높이가 유지됩니다(Window > Tile로 원래대로).

문의·버그: <https://github.com/ars2323/hallym-mips-simulator/issues>
만든 사람: 김학현, AIAC Lab, 한림대학교. 한림대학교 UI는 학교의 UI 사용 규정(비상업)에 따라 사용했습니다.

SPIM은 James R. Larus의 저작물이며 BSD 라이선스로 배포됩니다. Hallym MIPS Simulator는 QtSpim-Edu를 거친 QtSpim의 수정판으로, SPIM 프로젝트와 무관합니다. 동봉 글꼴 Pretendard·D2Coding은 SIL Open Font License 1.1, 아이콘 Lucide는 ISC 라이선스입니다(Help > About > License).
