# 화면 — 고정 세트

라운드마다 같은 이름으로 **모두 다시 찍어 덮어쓴다**. 하위 폴더는 없다. 전부 `tools/capture-screens.ts` 가 찍는다(손으로 찍지 않는다).
예제 파일과 단계 수는 도구 안에 적혀 있어서, 라운드끼리 같은 장면이 된다.

- 다시 찍기: `xvfb-run -a -s '-screen 0 2400x1400x24' npm run screens` (리눅스, xvfb 소프트웨어 렌더링)
- 기본: 창 전체 1280×800. 마우스 커서·툴팁·hover 는 없다(포인터를 창 밖으로 옮기고 `:hover` 가 0 인지 확인한다).
  포커스도 풀고 찍는다.
- 크기: 창 전체 400KB 이하, 잘라 낸 것 150KB 이하. 메타데이터(PNG 부가 청크)를 지운다. 손실 압축은 하지 않는다. 넘으면 도구가 멈춘다.
- 창 버튼(최소화·최대화·닫기)은 시스템이 그리는 것이라 페이지 캡처에는 없고, 그 자리가 비어 있다. 그 모습은 `windows-frame.png` 에서 본다.

| 파일 | 무엇 | 찍는 조건 |
|---|---|---|
| `start.png` | 첫 화면: 하람(인사)과 두 갈래(튜토리얼 보기 / 바로 시작), 툴바 없음 | 1280×800, 띄운 그대로 |
| `start-2.png` | 첫 화면 둘째 단계: 새 파일 / 파일 열기, "← 처음으로" | 1280×800, 바로 시작을 누름 |
| `split-before.png` | 좌우 분할, 어셈블 전: 오른쪽은 안내 카드 | 1280×800, `tests/samples/lab04-ok.s` 를 `lab04.s` 로 열기만 함 |
| `split-running.png` | 좌우 분할, 실행 중: Editor·Text 의 현재 줄 강조, Inspector 가 PC 를 따라감 | 1280×800, 같은 파일 Ctrl+S 뒤 F10 16번(PC `0x0040004c`, 방금 바뀜 `$t6`) |
| `inspector.png` | Inspector 가 고른 명령에 고정(Pinned) | `split-running` 상태에서 Text 의 `0x00400054`(`sra $s1, $t6, 1`)를 누름 |
| `dialog.png` | 앱 안의 대화상자(하람): 저장된 파일에서 새 파일 | `inspector` 상태에서 New file |
| `error.png` | 어셈블 오류: Run 쪽 Errors 패널에 할 일 먼저, 하람(curious) 하나, Editor 거터의 `!` | 1280×800, `tests/samples/lab04.s`(15행 `srll`) 열고 Ctrl+S |
| `data.png` | Data: 구역(User data / Stack), 0 구간, 라벨 줄, `$gp`·`$sp`, 좁아서 숨긴 ASCII 의 "+ ASCII" | 1280×800, `tests/samples/data-labels.s` Ctrl+S 뒤 F10 14번, Data 탭 |
| `lab-1366x768-125.png` | 실습실 PC: 1366×768 배율 125% 최대화 | CSS 1093×582 를 1.25배로(`--force-device-scale-factor=1.25`), `split-running` 과 같은 실행 |
| `narrow.png` | 좁은 창: 막대의 Editor / Run 탭, Run 쪽 | 1366×768 배율 150%, CSS 910×505 를 1.5배로, `split-running` 과 같은 실행 |
| `lab-columns.png` | 실습실 PC 의 Registers·Text 머리를 잘라 냄: Name Hex Dec Bin / Address Encoding Format Instruction | `lab-1366x768-125` 와 같은 화면, 두 패널의 위쪽 190px(150KB 이하) |
| `1024x768.png` | 1024×768 배율 100%: 좌우 분할 그대로, Text 는 Format·Source 를 버튼으로 | CSS 1024×728(작업 표시줄), `split-running` 과 같은 실행 |
| `tutorial-01.png` | 튜토리얼 1단계: Editor 머리와 첫 줄들, 카드와 하람 | 1280×800, 튜토리얼 보기 → 1단계 |
| `tutorial-04.png` | 4단계: `li $t0, 0x12345678` 이 `lui` + `ori` 두 줄이 된 Text 행 | 1280×800, 튜토리얼의 `go()` 로 4단계(어셈블까지) |
| `tutorial-09.png` | 9단계: 비트 그리드 opcode·rs·rt·rd 와 Text 의 Encoding 값 | 1280×800, 9단계(시작 코드와 `li` 두 줄, `add` 실행, Inspector 고정) |
| `tutorial-14.png` | 14단계: 거터(브레이크포인트 칸)와 그 줄 | 1280×800, 14단계 |
| `tutorial-19.png` | 19단계: `tutorial-error.s` 를 어셈블한 뒤의 Errors 패널 | 1280×800, 19단계에서 Ctrl+S |
| `tutorial-20.png` | 20단계: 가운데 카드, 하람(congrats) | 1280×800, 20단계 |
| `tutorial-09-narrow.png` | 9단계를 좁은 창(Run 쪽)에서 | 910×505 를 1.5배로 |
| `windows-frame.png` | **실제 Windows 11** 에서 최대화한 설치본: 앱의 막대 + 시스템의 창 버튼 | CI(`windows.yml`, 러너 화면 1024×768)만. 설치본으로 `split-running` 과 같은 실행 뒤 최대화, 화면 전체 |

`windows-frame.png` 은 CI 아티팩트 `windows-report` 의 `report/screens/windows-frame.png` 를 그대로 가져온다. CI 는 같은 도구로
나머지도 Windows 에서 찍어 `report/screens/` 에 둔다(여기에는 올리지 않는다).

라운드마다 추가하는 장면은 라운드 표시 없는 이름으로 이 표에 더한다.

## 라운드 기록

- 2차 UI 수정 — 070aac5 — 2026-09-25 (옛 규약: `docs/screens/ui2/`)
- 화면 용어 영문 통일 · 스크린샷 규약 — 49be50e — 2026-09-25
- 3차 수정 (좁은 창이 지키는 것) — 72a90cb — 2026-09-25
- 튜토리얼 20단계 — 755517c — 2026-09-25
- 튜토리얼 다듬기 — a46f0ac — 2026-09-25
