# Hallym MIPS Simulator — 디자인 토큰 (초안, H1)

> **한림대학교 UI 사용 규정** (https://www.hallym.ac.kr/hallym/965/subview.do, 966, 2026-09-22 확인 — 사본 `assets/ci/manual/README.md`)
>
> 본 UI 규정은 한림대학교의 모든 시각전달매체에 대한 디자인 통합 지침으로서 규정외의 임의의 변형된 형태로 사용하는 것은 본연의 이미지를 손상시키고 아이덴티티의 혼란을 초래하므로 규정에 따라 정확하게 사용해야 한다.
>
> UI는 한림대학교 홍보용으로 제작되어 상업용 목적으로 사용 할 수 없다.
>
> 관련문의 : 커뮤니케이션팀(Tel 033-248-1333 / de1330@hallym.ac.kr)

이 프로그램은 한림대학교 수업용(비상업)이다. 심볼마크·로고타입·엠블럼·시그니처는 `assets/ci/`의 원본 AI 데이터를 축소·여백 조정만 해서 쓰고, 단색화·회전·비율 변경·색 변경·요소 분리를 하지 않는다. 심볼+로고타입 조합은 시그니처(A4)의 배치·여백(A=심볼 폭, 좌우조합: 심볼–로고타입 간격 등 `assets/ci/A4/A-4-1.jpg`)을 따른다.

상태: **초안**. 시안 A/B 중 하나가 선택되면 이 문서가 `QtSpim/edu/theme/tokens.h`와 `theme/light.qss`의 유일한 근거가 된다.

## 1. 색

### 1.1 CI 색 — 근거

| 토큰 | Pantone | `.ai` 별색 정의 (CMYK) | 근거 파일 | 채택 HEX | 참고 값 |
|---|---|---|---|---|---|
| `color.blue` | PANTONE 2945 CVC | 100 / 60 / 0 / 0 | `A1/a-1-1.ai` 22행 `%%+ 1 0.6 0 0 (PANTONE 2945 CVC)` | **#0055A5** | Pantone 2945 C 공식 sRGB #004C97 · gs 렌더 #1B62B7 · 매뉴얼 페이지 JPG #0065B3 · zip JPG #225AA5 |
| `color.teal` | PANTONE 326 CVC | 80 / 0 / 40 / 0 | `A1/a-1-1.ai` 21행 `%%CMYKCustomColor: 0.8 0 0.4 0 (PANTONE 326 CVC)` | **#00A9A5** | 326 C 공식 #00B2A9 · gs #33BAAB · 페이지 JPG #01B6AD |
| `color.navy` | PANTONE 281 C ("Dark Blue / P 281 C") | 100 / 80 / 0 / 40 | `A2/a-2-1.ai` 22행 `%%CMYKCustomColor: 1 0.8 0 0.4 (Dark Blue / P 281 C)` | **#00205B** | 281 C 공식 #00205B · gs #162D66 · 페이지 JPG #052E70 |
| `color.gray` | Cool Gray 4 | (지시값) | — | **#BCBEC0** | Cool Gray 4 C 공식 #BBBCBC |
| (참고) | PANTONE Cool Gray 7 CVC | — | `A3/a-3-1.ai` 팔레트 (엠블럼 C의 회색 링) | — | gs #A7A6A6. 엠블럼 C 안에서만 쓰이고 UI 토큰으로는 쓰지 않는다 |

채택 HEX는 지시된 Pantone 근사값이다. 매뉴얼 페이지에 HEX 지정은 없다. 가져온 이미지의 값은 JPEG·색 변환을 거친 참고값일 뿐 근거가 아니다.

### 1.2 파생 색 (UI용)

CI 세 색만으로는 표·배지·상태 표시가 안 되므로, 아래는 CI 색의 틴트(흰색 혼합)와 중립 회색이다. 값은 두 시안에 공통.

| 토큰 | HEX | 만든 법 | 쓰임 |
|---|---|---|---|
| `color.blue.tint` | #E5EEF8 | 2945 · 12 % on white | 선택 틴트(메뉴바 hover, 툴버튼 hover), 배지 R/I 배경 |
| `color.blue.tint2` | #D6E6F7 | 2945 · 20 % | PC 행 배경(후보), 툴버튼 pressed |
| `color.teal.tint` | #E6F6F5 | 326 · 12 % | 변경된 값 배경, 배지 J/FI 배경, 성공 배경 |
| `color.teal.text` | #00736F | 326을 AA까지 어둡게 | 변경된 값 글자, $sp 마커, 성공 글자 (326 원색 글자는 대비 2.9로 불가) |
| `color.text` | #1F2933 | 중립 | 본문 글자 |
| `color.text.2` | #5B6B7B | 중립 | 보조 글자(주석 열, 버전 표시, 비활성 탭) |
| `color.error` | #C0392B | 지시값 | 에러 글자·에러 줄 마커 |
| `color.error.tint` | #FBEAE8 | | 에러 배지·에러 줄 배경 (글자는 #8E2A1F) |
| `color.warning` | #B7791F | 지시값 | 경고 아이콘·마커 (글자로는 대비 3.6 → 굵은 15px 이상에서만) |
| `color.warning.text` | #7A4E0C | warning을 AA까지 어둡게 | Bare Machine 배지·"Source changed" 띠의 글자 |
| `color.warning.tint` | #FCF3E3 | | 위 둘의 배경 |
| `color.hover` | #F3F6F9 | | 표 행 hover |
| `color.border` | A: #E1E5EA · B: #EDF0F3 | | 경계선 (시안별) |
| `color.window` | A: #F5F7FA · B: #FFFFFF | | 창 배경 (시안별) |
| `color.header` | A: #F5F7FA · B: #FFFFFF | | 표 헤더 배경 (시안별) |
| `color.scroll` | A: #C9D0D8 / hover #AEB7C2 · B: #D5DBE1 / #B8C1CB | | 스크롤 핸들 |

### 1.3 색 배치 (두 시안 공통)

| 어디 | 토큰 |
|---|---|
| 선택 행 | `blue` 배경 + 흰 글자 |
| 활성 탭 | `blue` 글자 + 2px `blue` 선 (A: 위, 흰 카드 / B: 위 선만) |
| 주요 버튼(default) | `blue` 배경 + 흰 글자 |
| PC 행 | **결정 필요** (§7 ①): `blue.tint2` 배경 + `navy` 글자 + 왼쪽 3px `blue` 막대 (선택 행과 구분) |
| 변경된 값 | `teal.text` 굵게 (+ 배경 `teal.tint`, 결정 필요 §7 ②) |
| $sp/$fp/$gp 마커 | `teal.text` |
| 성공(어셈블 완료 상태) | `teal.text` on `teal.tint` |
| 창 제목·그룹 헤더·인스펙터 제목·도크 제목 | `navy` 600 |
| 아이콘 | 기본 `navy`, hover `blue`, disabled `gray` |
| 에러 | `error` / `error.tint`, 글자 #8E2A1F |
| 경고 배지·띠 | `warning.text` on `warning.tint` |
| 청록 위 흰 글자 | **금지** — 청록은 `teal.tint` 배경 + `navy`/`teal.text` 글자만 |

### 1.4 대비 (WCAG, 본문 AA = 4.5, 큰 글자·UI 요소 = 3.0)

| 전경 | 배경 | 대비 | 판정 | 쓰임 |
|---|---|---|---|---|
| #1F2933 | #FFFFFF | 14.76 | AAA | 본문 |
| #00205B | #FFFFFF | 15.47 | AAA | 제목·헤더 |
| #00205B | #F5F7FA | 14.41 | AAA | A 창 배경 위 제목 |
| #0055A5 | #FFFFFF | 7.39 | AAA | 활성 탭 글자, 링크 |
| #FFFFFF | #0055A5 | 7.39 | AAA | 선택 행·주요 버튼·메뉴 선택 |
| #0055A5 | #E5EEF8 | 6.30 | AA | 배지 I 글자 |
| #00205B | #E5EEF8 | 13.20 | AAA | 배지 R 글자, hover 위 글자 |
| #00205B 또는 #0055A5 | #D6E6F7 | 12.17 / 5.81 | AAA / AA | PC 행 |
| #00736F | #FFFFFF | 5.70 | AA | 변경된 값 |
| #00736F | #E6F6F5 | 5.12 | AA | 변경된 값(배경 있을 때), 배지 J·FI |
| #00205B | #E6F6F5 | 13.90 | AAA | 배지 FR |
| #4A5560 | #EEF0F2 | 6.66 | AA | 배지 CP0 |
| #5B6B7B | #FFFFFF | 5.48 | AA | 보조 글자 |
| #5B6B7B | #F5F7FA | 5.10 | AA | 보조 글자(A) |
| #C0392B | #FFFFFF | 5.44 | AA | 에러 글자 |
| #8E2A1F | #FBEAE8 | 7.21 | AAA | 에러 배지 |
| #7A4E0C | #FCF3E3 | 6.52 | AA | 경고 배지·띠 |
| #B7791F | #FFFFFF | 3.64 | 큰 글자만 | 경고 아이콘 |
| #00A9A5 | #FFFFFF | **2.91** | 불가 | → 글자로 쓰지 않는다 |
| #FFFFFF | #00A9A5 | **2.91** | 불가 | → 금지 |
| #BCBEC0 | #FFFFFF | 1.86 | (비활성) | disabled 아이콘·글자. 비활성 요소는 AA 예외 |

## 2. 글꼴

| 역할 | 1순위 (동봉, OFL) | 폴백 |
|---|---|---|
| UI (메뉴·도크 제목·버튼·상태바·다이얼로그·인스펙터 안내문) | **Pretendard** Regular/Medium/SemiBold/Bold (OTF, `QtSpim/edu/theme/fonts/`) | Windows: Malgun Gothic → Segoe UI · Linux: Noto Sans CJK KR → sans-serif |
| 코드 (레지스터·Text·Data 표, 에디터, 인스펙터 필드 표, 로그, 콘솔) | **D2Coding** Regular/Bold (TTF, 한글 등폭 = 라틴 2칸) | JetBrains Mono Regular/Bold (동봉) → Consolas → monospace |

라이선스 파일: `fonts/OFL-Pretendard.txt`, `OFL-D2Coding.txt`, `OFL-JetBrainsMono.txt`. 동봉 크기: Pretendard 4종 6.3 MB, D2Coding 2종 8.5 MB, JetBrains Mono 2종 0.55 MB.

주의 (H1에서 확인): fontconfig는 D2Coding을 `spacing=90`(dual, 한글이 두 칸)로 분류해 Qt(Linux)의 `QFontInfo::fixedPitch()`가 false다. 글꼴 자체는 고정폭을 선언한다(`post.isFixedPitch=1`, PANOSE proportion 9 — Windows GDI는 이 값을 읽는다). 인스펙터의 "고정폭이 아니면 시스템 고정폭으로" 검사가 Linux에서 D2Coding을 거부하므로 H2에서는 동봉 코드 글꼴을 검사 없이 직접 쓴다(설정 대화상자에서 사용자가 고른 글꼴에만 검사 유지). 시안 캡처는 `tools/capture-theme.sh`가 만드는 fonts.conf로 D2Coding을 mono로 선언해 찍었다. JetBrains Mono는 `spacing=100`(mono).

H1에서 확인한 Qt 동작: 코드가 `setFont()`를 다시 부르는 위젯(표·에디터·인스펙터)에는 QSS의 `font-family`가 먹지 않는다(폴리시 때 한 번만 합쳐진다). 그래서 H2에서 코드 글꼴은 QSS가 아니라 `tokens.h`의 값을 지금의 `applyPanelFont()` 경로로 넣는다. UI 글꼴은 `QApplication::setFont()`.

### 타이포 스케일

| 토큰 | px | 쓰임 |
|---|---|---|
| `font.xs` | 11 | 타입 배지, 상태바 배지 |
| `font.s` | 12 | 상태바, 툴팁, 표 헤더(코드 글꼴) |
| `font.m` | 13 | UI 기본, 메뉴, 도크 제목(600), 코드 표 본문(D2Coding 10pt ≈ 13.3px) |
| `font.l` | 15 | 다이얼로그 제목, About 이름 |
| `font.xl` | 20 | About "Hallym MIPS Simulator" |

## 3. 간격·크기 (4px 단위)

| 토큰 | 값 |
|---|---|
| `space.1/2/3/4/6` | 4 / 8 / 12 / 16 / 24 px |
| 코드 표 행 높이 | **20 px** (현재 26 px — H2에서 모델 sizeHint 변경) |
| 도크 제목 높이 | 32 px (13px 600 + 위아래 8px) |
| 툴바 | 아이콘 20 px, 버튼 패딩 3 px, 간격 4 px, 툴바 좌우 패딩 8 px |
| 표 셀 패딩 | 좌우 6 px |
| 라운드 | A: 도크·탭 6 px, 배지·버튼 4 px · B: 도크 0, 배지·버튼 4 px |
| 도크 사이 간격 | A: 8 px (창 배경이 보임) · B: 6 px (흰색) |
| 경계선 | 1 px |

## 4. 타입 배지 (R / I / J / CP0 / FR / FI)

옅은 배경 + 진한 글자, 라운드 4 px, 글자 11 px 600, 폭 최소 24 px, 높이 16 px.

| 배지 | 배경 | 글자 | 대비 |
|---|---|---|---|
| R | #E5EEF8 | #00205B | 13.2 |
| I | #E5EEF8 | #0055A5 | 6.3 |
| J | #E6F6F5 | #00736F | 5.1 |
| FR | #E6F6F5 | #00205B | 13.9 |
| FI | #D6E6F7 | #00736F | 4.6 |
| CP0 | #EEF0F2 | #4A5560 | 6.7 |

R/I는 배경이 같고 글자색이 다르다; J/FR도 마찬가지. 여섯이 두 배경 계열(파랑·청록) + 회색으로 나뉘어 "정수/부동소수점/시스템"이 먼저 읽히고 글자로 세부가 구분된다. **시안 캡처에는 아직 반영되지 않았다**(위젯 코드 — §6).

## 5. 그 밖의 요소

| 요소 | 토큰 |
|---|---|
| "Source changed" 띠 | `warning.tint` 배경, `warning.text` 600 글자, 아래 1px #F1DDB4 |
| 에러 목록 | 행 hover `hover`, 선택 `blue`; 줄 마커 `error`; 에디터 에러 줄 배경 `error.tint` |
| Bare Machine 배지 | `warning.tint` / `warning.text`, 11px 600, 라운드 4 |
| 어셈블 실패 배지 | `error.tint` / #8E2A1F |
| 현재 줄(에디터) | #F3F6F9 (hover와 같은 톤; 노랑 폐지) |
| 줄 번호 여백 | 배경 `window`(A) / #FAFBFC(B), 번호 `text.2`, 현재 줄 번호 `navy` |
| 문법 강조 | 주석 `text.2` 이탤릭 · 지시어 `navy` 600 · 명령어 `blue` 600 · 레지스터 `teal.text` · 라벨 정의 `text` 600 · 문자열 #8E2A1F · 숫자 #7A4E0C · 식별자 `text` |
| 세로 탭(Int/FP Regs) | 유지, `text.2` → 선택 `blue` 600, 왼쪽 2px `blue` |
| 스플래시 | 흰 바탕, 시그니처 국영문 좌우조합(A4 A-5-1), 1.2초, 클릭 시 닫힘 |
| About | 엠블럼 A(진남) + 로고타입 국영문 + "Hallym MIPS Simulator 1.0.0" + License 탭(원본 고지 그대로) |
| 앱 아이콘 | 심볼 기본형만 (16/32에서 엠블럼·시그니처는 뭉개짐 — `docs/design/mockups/icon-sizes.png`) |

## 6. 시안 캡처에 아직 안 들어간 것 (위젯 코드 → H2)

시안은 QSS·글꼴·아이콘·설정값만 바꿔 찍었다. 다음은 코드에 색이 박혀 있어 캡처에서는 옛 모습 그대로다.

- 타입 배지 색(초록·주황·보라 등), PC 행 시안(cyan), pseudo 묶음 배경(호박색), 브레이크포인트 점(빨강)
- 에디터: 현재 줄 노랑, 줄 번호 여백 회색, 문법 강조 팔레트, 에러 줄 분홍
- Data 패널 $sp/$fp/$gp 마커 색, 라벨 보라
- 상태바 배지·"Source changed" 띠·버전 라벨 (위젯 자체 스타일시트가 앱 스타일시트보다 우선)
- 메시지 로그 글꼴 (원본이 HTML에 `font-family:Courier`를 박음 — `spimview.cpp:270`, GUI만이라 H2에서 `// EDU:`로 교체)
- 코드 표 행 높이 26 → 20 px
- 창 제목·상태바의 "QtSpim-Edu 1.0.1" (브랜딩은 H2)

## 7. 결정 필요

1. PC 행: 지시는 "2945 = 선택 행·PC 행"인데 둘 다 진한 파랑이면 구분이 안 된다. 제안: PC 행 = `blue.tint2` 배경 + 왼쪽 3px `blue` 막대, 선택 행 = 진한 `blue`. (선택 행이 PC 행일 때는 진한 파랑 + 막대)
2. 변경된 값: 글자색만(`teal.text` 600) vs 글자 + 셀 배경(`teal.tint`). 레지스터 39행 중 10행이 바뀌는 Run 뒤에는 배경까지 있으면 시끄럽다. 제안: 글자만.
3. 코드 글꼴: D2Coding(한글 등폭, 15 MB 중 8.5 MB) vs JetBrains Mono(0.55 MB, 한글은 폴백). 한글 주석이 흔하므로 D2Coding 유지 제안. JetBrains Mono 동봉을 뺄지.
4. 1366×768: 레지스터 47행 × 20px = 940px라 어떤 배치로도 전 그룹이 한 화면에 안 들어간다(가용 약 500px). 제안: 인스펙터를 접으면 26행, 기본은 스크롤. 또는 세로 768 이하에서 Reserved/CP0 그룹을 접은 채 시작.
