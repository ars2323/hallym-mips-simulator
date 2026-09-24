# UI 2차 — 캡처

Windows 설치본 실사용 점검(2.0.0-alpha.1)에서 나온 항목을 고친 뒤의 화면이다. 다시 찍기:
`xvfb-run -a -s '-screen 0 2400x1400x24' npm run screens:ui2` (`tools/capture-ui2.ts`).
위쪽 폴더(`docs/screens/*.png`)는 1차(시안 대조) 때의 기록이라 그대로 둔다.

| 파일 | 무엇 |
|---|---|
| `split-before.png` | 좌우 분할, 어셈블 전: 오른쪽은 하람 안내 카드 |
| `split-running.png` | 좌우 분할, 실행 중(`lab04-ok.s` 16단계): Editor 14행 표시, Inspector 가 PC 를 따라감 |
| `error.png` | 어셈블 오류: 무엇을 하면 되는지 먼저, 하람(curious), 거터의 `!` |
| `data.png` | Data: 한 가지 주소 표기, 구역, 0 구간, 라벨 줄, `$gp`/`$sp` |
| `inspector.png` | Inspector: Text 에서 고른 명령에 고정 |
| `dialog.png` | 앱 안의 대화상자(저장된 파일에서 새 파일) |
| `lab-1366x768-125.png` | 실습실 PC: 1366×768 배율 125% 최대화(CSS 1093×582, 1.25배로 그림) |
| `1366x768-150.png` | 1366×768 배율 150%(CSS 910×505): 좁은 창 — Editor / Run 탭 |
| `1024x768.png` | 1024×768 배율 100% |
| `windows-frame-maximised.png` | **실제 Windows 11**(CI 러너, 1024×768)에서 최대화한 설치본: 앱의 막대 + 시스템의 창 버튼 |

`windows-frame-maximised.png` 말고는 xvfb(리눅스)에서 찍었다. 창 버튼(최소화·최대화·닫기)은 시스템이 그리는 것이라
페이지 캡처에는 없고 그 자리가 비어 있다. Windows 의 그림은 CI 가 화면 전체를 찍은 것이다(`tools/probe-platform.ts`). Windows 에서의 모습은 CI 아티팩트 `windows-report/report/screens/` 와 손 확인 목록(`docs/WINDOWS.md`)으로 본다.
