# Hallym University assets

These files belong to Hallym University. They are not covered by this
project's license (LICENSE) or by any license in NOTICE, and they may not be
taken from here and used elsewhere; anyone who forks or redistributes this
project must remove them unless Hallym University has given its own
permission. They appear in this software only to identify it as a teaching
tool for Hallym University's courses. This software is not an official
product of Hallym University.

Questions: Hallym University Communications Team, de1330@hallym.ac.kr.

## Rules of use (the university's design guidelines)

- Do not change colours, lines, proportions or elements.
- Minimum size 20 mm (about 76 px).
- Clear space: about 13% of the character's height on every side.
- Do not place a character on a colour close to its own or on a busy background.
- Do not use low-resolution or degraded artwork.

## How this program keeps them

- The files are as received. The character PNGs are **the original bytes**;
  only their file names were changed to ASCII (to keep Korean file names out
  of packaging and URLs). They are not recompressed, resized or recoloured.
  Where the screen shows them smaller, only CSS scales them.
- The app's teal (the Qt edition's token `#00A9A5`) is almost Hari's colour
  (`#00ADA9`), so **no character is placed on a teal surface**; characters
  stand only on white or light grey.
- Characters appear only where there is nothing else (an empty panel, the
  first screen, the tutorial's card, the first successful run). Not on the
  toolbar, panel heads, status bar or menus, not next to errors, not where
  colour carries meaning.
- Nothing is written on the board held in `sign.png`; the message goes beside
  the character.

## Files

### characters/ — 1417×1417 PNG (1417×1418 for the basic poses), transparent background

| File | Original name |
|---|---|
| pair.png | 캐릭터 기본형(조합).png (basic pose, both) |
| haram.png | 캐릭터-기본형(하람).png (basic pose, Haram) |
| hari.png | 캐릭터 기본형(하리).png (basic pose, Hari) |
| ok.png | 응용동작_OK.png (pose: OK) |
| go.png | 응용동작_go.png (pose: go) |
| moved.png | 응용동작_감동.png (pose: moved) |
| thanks.png | 응용동작_감사.png (pose: thanks) |
| announce.png | 응용동작_공지.png (pose: announcement) |
| teach.png | 응용동작_교육.png (pose: teaching) |
| curious.png | 응용동작_궁금해.png (pose: curious) |
| forbidden.png | 응용동작_금지.png (pose: forbidden) |
| holiday.png | 응용동작_명절.png (pose: holiday) |
| love.png | 응용동작_사랑해.png (pose: love) |
| selfie.png | 응용동작_셀카.png (pose: selfie) |
| talk.png | 응용동작_소통.png (pose: talking) |
| meal.png | 응용동작_식사(먹방).png (pose: meal) |
| guide.png | 응용동작_안내.png (pose: guiding) |
| sport.png | 응용동작_운동.png (pose: sport) |
| hello.png | 응용동작_인사.png (pose: greeting) |
| graduation.png | 응용동작_입학(졸업).png (pose: admission / graduation) |
| best.png | 응용동작_최고.png (pose: the best) |
| congrats.png | 응용동작_축하.png (pose: congratulations) |
| sign.png | 응용동작_팻말.png (pose: holding a sign) |

### marks/ — SVG

| File | What |
|---|---|
| emblem-a-navy.svg | Emblem A (navy) |
| logotype-ko-en.svg | Korean-English logotype |
| signature-h-ko-en.svg | Korean-English horizontal signature |
| symbol-basic.svg | The symbol (basic form): the logo on the window's top bar. Byte for byte the Qt edition's `QtSpim/edu/theme/brand/symbol-basic.svg` |

## Where they come from

- Unpacked from `character.zip` (sha256 `13b1e7dd…a304ba3a`), which held one
  zip of basic poses and one of posed variants, together with the
  university's character manual (한림대학교 캐릭터 관리 및 활용 메뉴얼,
  "Hallym University character management and use manual", for external
  sharing). The rules above come from that manual. The PDF is not an asset
  of the app and is not in the repository.
- `logo.zip` (sha256 `67e499e5…67985f07`) holds ten original `.ai` files
  (A1–A4) and `.jpg` previews. These `.ai` files are **byte for byte the
  same** as the Qt edition's `assets/ci/A1`–`A4` (at the repository root).
  The SVGs in `marks/` are the ones the Qt edition made from the same
  originals (Qt edition commit `0d7eb5c`: .ai → PDF (Ghostscript,
  `-dEPSCrop`) → SVG (pdftocairo); each mark cropped to its coloured pixels
  and only the dimension guides removed; colours, proportions and elements
  unchanged).
- Received 2026-09-24. The zips were unpacked and deleted.

## The application icon — `packaging/icons/`

The installed program's executable, shortcut and window icon. It is made from
the Hallym University symbol, and everything above applies to it. It is a byte
for byte copy of the Qt edition's `QtSpim/edu/theme/brand/` `app-16.png` …
`app-256.png` and `HallymMIPS.ico`. It is not redrawn, resized or recoloured.
