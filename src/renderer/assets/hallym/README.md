# Hallym University 자산

Hallym University 의 자산. 이 저장소의 BSD 라이선스 대상이 아닙니다.

## 사용 규정 (디자인 가이드라인)

- 색·선·비율·요소를 바꾸지 않는다
- 최소 사용 크기 20mm (약 76px)
- 최소 공간 — 캐릭터 높이의 약 13%를 사방 여백으로
- 캐릭터와 유사한 색상 또는 복잡한 배경 위에 두지 않는다
- 저해상도·열화된 원고를 쓰지 않는다

문의: Hallym University 대외협력팀 de1330@hallym.ac.kr

## 이 저장소에서 지키는 것

- 파일은 받은 그대로다. 캐릭터 PNG 는 **원본 바이트 그대로**이고 파일 이름만 ASCII 로 바꿨다
  (패키징·URL 에서 한글 파일명을 피하려고). 다시 압축하거나 크기를 바꾸거나 색을 맞추지 않는다.
  화면에서 줄여 보일 때도 CSS 로만 줄인다.
- 앱의 청록(teal, Qt판 토큰 `#00A9A5`)은 하리의 색(`#00ADA9`)과 거의 같다.
  그래서 **teal 면 위에 캐릭터를 두지 않는다.** 캐릭터는 흰 면이나 옅은 회색 면 위에만 둔다.
- 캐릭터는 아무것도 없는 자리(빈 패널, 첫 화면, 튜토리얼 안내, 첫 성공 축하)에만 둔다.
  툴바·패널 머리·상태 표시줄·메뉴, 오류 옆, 색이 데이터를 뜻하는 자리에는 두지 않는다.
- `sign.png`(팻말)의 판에는 글자를 써 넣지 않는다. 안내 문구는 캐릭터 옆에 둔다.

## 파일

### characters/ — 1417×1417(기본형은 1417×1418) PNG, 투명 배경

| 파일 | 원본 이름 |
|---|---|
| pair.png | 캐릭터 기본형(조합).png |
| haram.png | 캐릭터-기본형(하람).png |
| hari.png | 캐릭터 기본형(하리).png |
| ok.png | 응용동작_OK.png |
| go.png | 응용동작_go.png |
| moved.png | 응용동작_감동.png |
| thanks.png | 응용동작_감사.png |
| announce.png | 응용동작_공지.png |
| teach.png | 응용동작_교육.png |
| curious.png | 응용동작_궁금해.png |
| forbidden.png | 응용동작_금지.png |
| holiday.png | 응용동작_명절.png |
| love.png | 응용동작_사랑해.png |
| selfie.png | 응용동작_셀카.png |
| talk.png | 응용동작_소통.png |
| meal.png | 응용동작_식사(먹방).png |
| guide.png | 응용동작_안내.png |
| sport.png | 응용동작_운동.png |
| hello.png | 응용동작_인사.png |
| graduation.png | 응용동작_입학(졸업).png |
| best.png | 응용동작_최고.png |
| congrats.png | 응용동작_축하.png |
| sign.png | 응용동작_팻말.png |

### marks/ — SVG

| 파일 | 무엇 |
|---|---|
| emblem-a-navy.svg | 엠블럼 A (남색) |
| logotype-ko-en.svg | 국영문 로고타입 |
| signature-h-ko-en.svg | 국영문 좌우조합 시그니처 |
| symbol-basic.svg | 심벌(기본형). 창 위쪽 막대의 로고. Qt판 `QtSpim/edu/theme/brand/symbol-basic.svg` 를 바이트 그대로 |

## 출처

- `character.zip` (sha256 `13b1e7dd…a304ba3a`)에서 풀었다. 안에는 기본형·응용동작 zip 이 하나씩 있고,
  Hallym University 의 캐릭터 관리·활용 매뉴얼(외부 공유용) PDF 도 함께 있다. 위 규정은 그 매뉴얼에서 가져왔다.
  PDF 는 앱 자산이 아니라서 저장소에 넣지 않았다.
- `logo.zip` (sha256 `67e499e5…67985f07`)에는 원본 `.ai` 10개(A1~A4)와 미리보기 `.jpg` 가 있다.
  이 `.ai` 는 Qt판 저장소 `assets/ci/A1`~`A4` 의 것과 **바이트 단위로 같다.** `marks/` 의 SVG 는 Qt판이
  같은 원본에서 만든 것을 그대로 가져왔다(Qt판 커밋 `0d7eb5c`: .ai → PDF(Ghostscript, `-dEPSCrop`)
  → SVG(pdftocairo). 마크마다 색이 있는 픽셀로 잘라내고 치수 안내선만 걷어냈다. 색·비율·요소는 그대로다).
- 받은 날: 2026-09-24. zip 은 풀고 지웠다.

## 앱 아이콘 — `packaging/icons/`

설치본의 실행 파일·바로가기·창 아이콘. Hallym University 심벌로 만든 것으로, 위와 같은 고지가 적용된다.
Qt판 `QtSpim/edu/theme/brand/` 의 `app-16.png` ~ `app-256.png`, `HallymMIPS.ico` 를 바이트 그대로 복사했다.
다시 만들거나 크기·색을 바꾸지 않는다.
