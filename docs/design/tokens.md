# Hallym MIPS Simulator — design tokens (draft, H1)

> **Hallym University UI usage rules** (https://www.hallym.ac.kr/hallym/965/subview.do, 966, checked 2026-09-22 — copy in `assets/ci/manual/README.md`; translated from the Korean original)
>
> These UI rules are the integrated design guideline for all visual communication media of Hallym University. Using them in any arbitrarily altered form outside the rules damages their original image and causes confusion of identity, so they must be used exactly according to the rules.
>
> The UI was created to promote Hallym University and may not be used for commercial purposes.
>
> Enquiries: Communication Team (Tel 033-248-1333 / de1330@hallym.ac.kr)

This program is for Hallym University classes (non-commercial). The symbol mark (심볼마크), logotype (로고타입), emblem (엠블럼) and signature (시그니처) are used from the original AI data in `assets/ci/` with only scaling and margin adjustments; they are not made monochrome, rotated, changed in proportion, changed in color or separated into elements. A symbol + logotype combination follows the arrangement and margins of the signature (A4) (A = the symbol's width; horizontal combination (좌우조합): the gap between symbol and logotype, etc., `assets/ci/A4/A-4-1.jpg`).

Status: **settled (2026-09-22, mockup A "Campus" + B's table header)**. This document is the sole basis for `QtSpim/edu/theme/tokens.h` and `theme/light.qss`. The decisions of §7 are in the Stage H decision table in PLAN.md.

## 1. Colors

### 1.1 CI colors — rationale

| Token | Pantone | Spot color definition in `.ai` (CMYK) | Source file | Adopted HEX | Reference values |
|---|---|---|---|---|---|
| `color.blue` | PANTONE 2945 CVC | 100 / 60 / 0 / 0 | `A1/a-1-1.ai` line 22 `%%+ 1 0.6 0 0 (PANTONE 2945 CVC)` | **#0055A5** | Pantone 2945 C official sRGB #004C97 · gs render #1B62B7 · manual page JPG #0065B3 · zip JPG #225AA5 |
| `color.teal` | PANTONE 326 CVC | 80 / 0 / 40 / 0 | `A1/a-1-1.ai` line 21 `%%CMYKCustomColor: 0.8 0 0.4 0 (PANTONE 326 CVC)` | **#00A9A5** | 326 C official #00B2A9 · gs #33BAAB · page JPG #01B6AD |
| `color.navy` | PANTONE 281 C ("Dark Blue / P 281 C") | 100 / 80 / 0 / 40 | `A2/a-2-1.ai` line 22 `%%CMYKCustomColor: 1 0.8 0 0.4 (Dark Blue / P 281 C)` | **#00205B** | 281 C official #00205B · gs #162D66 · page JPG #052E70 |
| `color.gray` | Cool Gray 4 | (specified value) | — | **#BCBEC0** | Cool Gray 4 C official #BBBCBC |
| (reference) | PANTONE Cool Gray 7 CVC | — | `A3/a-3-1.ai` palette (the gray ring of emblem C) | — | gs #A7A6A6. Used only inside emblem C; not used as a UI token |

The adopted HEX values are approximations of the specified Pantone colors. The manual pages give no HEX values. Values taken from imported images are only reference values that have been through JPEG and color conversion, not a basis.

### 1.2 Derived colors (for the UI)

The three CI colors alone cannot cover tables, badges and status indicators, so below are tints of the CI colors (mixed with white) and neutral grays. The values are shared by both mockups.

| Token | HEX | How it is made | Use |
|---|---|---|---|
| `color.blue.tint` | #E8F0F9 | 2945 · 10 % on white | PC row background, badge R background, menu bar and tool button hover |
| `color.blue.tint2` | #D3E2F3 | 2945 · 18 % | Selected row background (text is `navy`), tool button pressed |
| `color.teal.tint` | #E6F6F5 | 326 · 12 % | Badge I background, $sp/$fp/$gp marker background |
| `color.teal.text` | #00736F | 326 darkened until it reaches AA | Changed value text (SemiBold, no background), marker text, register syntax highlighting |
| `color.amber.tint` | #FDF3E1 | | Badge J background, background of the "Source changed" banner and the Bare Machine badge |
| `color.amber.text` | #8A5A00 | | Badge J text, banner and badge text, string syntax highlighting |
| `color.purple.text` | #6B4C9A | | Number syntax highlighting |
| `color.text.log` | #2B3440 | | Message log body text |
| `color.text.muted` | #8A94A0 | | Line numbers, comment syntax highlighting |
| `color.text` | #1F2933 | Neutral | Body text |
| `color.text.2` | #5B6B7B | Neutral | Secondary text (comment column, version display, inactive tabs) |
| `color.error` | #C0392B | Specified value | Error text, error line marker |
| `color.error.tint` | #FBEAE8 | | Error badge, error line background (text is #8E2A1F) |
| `color.warning` | #B7791F | Specified value | Warning icon and marker (as text its contrast is 3.6 → only bold at 15px or larger) |
| `color.warning.text` | #7A4E0C | warning darkened until it reaches AA | Text of the Bare Machine badge and the "Source changed" banner |
| `color.warning.tint` | #FCF3E3 | | Background of the two above |
| `color.hover` | #F3F6F9 | | Table row hover |
| `color.border` | A: #E1E5EA · B: #EDF0F3 | | Borders (per mockup) |
| `color.window` | A: #F5F7FA · B: #FFFFFF | | Window background (per mockup) |
| `color.header` | A: #F5F7FA · B: #FFFFFF | | Table header background (per mockup) |
| `color.scroll` | A: #C9D0D8 / hover #AEB7C2 · B: #D5DBE1 / #B8C1CB | | Scroll handle |

### 1.3 Color placement (shared by both mockups)

| Where | Token |
|---|---|
| Selected row | `blue.tint2` background + `navy` text (**a dark blue fill with white text is not used**) |
| Active tab | `blue` text + 2px `blue` line (A: on top, white card / B: top line only) |
| Primary button (default, toolbar Assemble) | `blue` background + white text, 6px rounding, 28px high |
| PC row | `blue.tint` background + 3px `blue` bar on the left. Both PC and selected = bar + `blue.tint2` |
| Changed value | `teal.text` SemiBold, no background |
| $sp/$fp/$gp markers | `teal.text` |
| Success (assembled state) | `teal.text` on `teal.tint` |
| Window title, group headers, inspector title, dock titles | `navy` 600 |
| Icons | default `navy`, hover `blue`, disabled `gray` |
| Errors | `error` / `error.tint`, text #8E2A1F |
| Warning badge and banner | `warning.text` on `warning.tint` |
| White text on teal | **Forbidden** — teal is used only as a `teal.tint` background with `navy`/`teal.text` text |

### 1.4 Contrast (WCAG; body text AA = 4.5, large text and UI elements = 3.0)

| Foreground | Background | Contrast | Verdict | Use |
|---|---|---|---|---|
| #1F2933 | #FFFFFF | 14.76 | AAA | Body text |
| #00205B | #FFFFFF | 15.47 | AAA | Titles, headers |
| #00205B | #F5F7FA | 14.41 | AAA | Titles on A's window background |
| #0055A5 | #FFFFFF | 7.39 | AAA | Active tab text, links |
| #FFFFFF | #0055A5 | 7.39 | AAA | Selected row, primary button, menu selection |
| #0055A5 | #E5EEF8 | 6.30 | AA | Badge I text |
| #00205B | #E5EEF8 | 13.20 | AAA | Badge R text, text on hover |
| #00205B or #0055A5 | #D6E6F7 | 12.17 / 5.81 | AAA / AA | PC row |
| #00736F | #FFFFFF | 5.70 | AA | Changed value |
| #00736F | #E6F6F5 | 5.12 | AA | Changed value (with a background), badges J and FI |
| #00205B | #E6F6F5 | 13.90 | AAA | Badge FR |
| #4A5560 | #EEF0F2 | 6.66 | AA | Badge CP0 |
| #5A6472 | #FFFFFF | 6.00 | AA | Secondary text |
| #5A6472 | #F5F7FA | 5.59 | AA | Secondary text (on the window background) |
| #65707E | #FFFFFF | 5.03 | AA | Line numbers, comments |
| #65707E | #F5F7FA | 4.69 | AA | Line numbers, comments (on the current line) |
| #65707E | #F3F6F9 | 4.64 | AA | Line numbers, comments (on a hovered row) |
| #2B3440 | #FFFFFF | 12.59 | AAA | Message log body text |
| #4A5560 | #EEF0F2 | 6.66 | AA | Badge CP0 |
| #6B4C9A | #FFFFFF | 6.72 | AAA | Numbers (syntax highlighting) |
| #8A5A00 | #FFFFFF | 5.93 | AA | Strings (syntax highlighting), badge J |
| #C0392B | #FFFFFF | 5.44 | AA | Error text |
| #8E2A1F | #FBEAE8 | 7.21 | AAA | Error badge |
| #7A4E0C | #FCF3E3 | 6.52 | AA | Warning badge and banner |
| #B7791F | #FFFFFF | 3.64 | Large text only | Warning icon |
| #00A9A5 | #FFFFFF | **2.91** | Fail | → not used as text |
| #FFFFFF | #00A9A5 | **2.91** | Fail | → forbidden |
| #BCBEC0 | #FFFFFF | 1.86 | (disabled) | Disabled icons and text. Disabled elements are exempt from AA |

## 2. Fonts

| Role | First choice (bundled, OFL) | Fallback |
|---|---|---|
| UI (menus, dock titles, buttons, status bar, dialogs, inspector notices) | **Pretendard** Regular/Medium/SemiBold/Bold (OTF, `QtSpim/edu/theme/fonts/`) | Windows: Malgun Gothic → Segoe UI · Linux: Noto Sans CJK KR → sans-serif |
| Code (register, Text and Data tables, editor, inspector field table, log, console) | **D2Coding** Regular/Bold (TTF, a Korean character is as wide as 2 Latin characters) | Consolas → monospace (JetBrains Mono removed by §7 ③) |

License files: `fonts/OFL-Pretendard.txt`, `OFL-D2Coding.txt`. Bundled size: Pretendard, 4 files, 6.3 MB; D2Coding, 2 files, 8.5 MB.

Caution (found in H1): fontconfig classifies D2Coding as `spacing=90` (dual, Korean characters take two cells), so `QFontInfo::fixedPitch()` in Qt (Linux) returns false. The font itself declares a fixed pitch (`post.isFixedPitch=1`, PANOSE proportion 9 — Windows GDI reads these values). The inspector's check "if it is not fixed-pitch, fall back to the system fixed-pitch font" rejects D2Coding on Linux, so in H2 the bundled code font is used directly, without the check (the check is kept only for a font the user picks in the settings dialog). The mockup captures were taken with D2Coding declared as mono through the fonts.conf that `tools/capture-theme.sh` generates.

Qt behavior found in H1: QSS `font-family` does not take effect on widgets whose code calls `setFont()` again (tables, editor, inspector) (it is merged only once, at polish time). So in H2 the code font is set not through QSS but with the value from `tokens.h`, through the existing `applyPanelFont()` path. The UI font is set with `QApplication::setFont()`.

### Type scale

| Token | px | Use |
|---|---|---|
| `font.xs` | 11 | Type badges, status bar badges |
| `font.s` | 12 | Status bar, tooltips, table headers (code font), the tutorial's progress indicator, the lab line on the splash |
| `font.m` | 13 | UI default, menus, dock titles (600), code table body (D2Coding 10pt ≈ 13.3px) |
| `font.l` | 15 | Dialog titles, the name in About |
| `font.xl` | 20 | About "Hallym MIPS Simulator" |

## 3. Spacing and sizes (in 4px units)

| Token | Value |
|---|---|
| `space.1/2/3/4/6` | 4 / 8 / 12 / 16 / 24 px |
| Code table row height | **16 px** (the natural line height of D2Coding 10pt). At 1920×1080 all 47 register rows are visible with the inspector open — ARCHITECTURE §12 items 54 and 64. A row never gets smaller than the glyph height, so descenders are not cut off |
| Dock title height | 32 px (13px 600 + 8px above and below), 4 px between the title and the table header |
| Table header | White background, no column separators, a 1px `border` line underneath (taken from B) |
| Toolbar | Icons 20 px, button padding 3 px, spacing 4 px, toolbar left and right padding 8 px |
| Table cell padding | 6 px left and right |
| Rounding | A: docks and tabs 6 px, badges and buttons 4 px · B: docks 0, badges and buttons 4 px |
| Gap between docks | A: 8 px (the window background shows through) · B: 6 px (white) |
| Borders | 1 px |

## 4. Type badges (R / I / J / CP0 / FR / FI)

Light background + dark text, 4 px rounding, text 11 px 600, minimum width 24 px, height 16 px.

| Badge | Background | Text | Contrast |
|---|---|---|---|
| R | #E8F0F9 | #0055A5 | 6.0 |
| I | #E6F6F5 | #00736F | 5.1 |
| J | #FDF3E1 | #8A5A00 | 6.1 |
| FR | #E8F0F9 | #00205B | 12.8 |
| FI | #E6F6F5 | #00205B | 13.9 |
| CP0 | #EEF0F2 | #4A5560 | 6.7 |

R/I/J are told apart by their background; FR/FI use the same backgrounds with navy text, so that "floating point = navy" reads first; CP0 is gray. (H2 instruction: the R/I/J values as given; FR/FI/CP0 in the gray/navy family.)

## 5. Other elements

| Element | Token |
|---|---|
| "Source changed" banner | `warning.tint` background, `warning.text` 600 text, a 1px #F1DDB4 line underneath |
| Error list | Row hover `hover`, selection `blue`; line marker `error`; editor error line background `error.tint` |
| Bare Machine badge | `warning.tint` / `warning.text`, 11px 600, rounding 4 |
| Assemble-failed badge | `error.tint` / #8E2A1F |
| Current line (editor) | #F5F7FA (yellow dropped) |
| Line number margin | Background `window`, numbers `text.muted` #8A94A0, current line number `navy`, error line marker an `error` dot |
| Syntax highlighting | Directives `blue` · instructions `navy` Medium · registers `teal.text` · label definitions `navy` SemiBold · comments `text.muted` italic · strings `amber.text` · numbers `purple.text` · identifiers `text` |
| Pseudo group band | #F5F7FA background + 2px `gray` on the left |
| Data markers | $sp/$fp/$gp cells `teal.tint` background + `teal.text` text; Labels column `blue` |
| Message log | Body `text.log` #2B3440, errors `error`, white background, D2Coding 10pt |
| Vertical tabs (Int/FP Regs) | Kept; `text.2` → selected `blue` 600, 2px `blue` on the left |
| Splash | A 480×300 card on a white background (1px `border`, 8px rounding): the Korean–English (국영문) horizontal signature (A4 A-5-1) · product name **22px Bold** `navy` · version 13px `text.2` · separator · `AIAC Lab · Hallym University` 12px `text.2` · a 2px progress bar at the bottom (`blue`, indeterminate). Closes after 1.5 seconds or on a click, and the main window appears at that point |
| About | Emblem A (navy) + Korean–English logotype + "Hallym MIPS Simulator 1.0.0" + License tab (original notices unchanged) |
| App icon | The basic form (기본형) of the symbol, centered at 76% of the tile width on a white rounded-square tile (18% rounding, 1px `border`). The same from 16 to 256px — `docs/design/captures/app-icon-taskbar.png` (taskbar comparison), `app-icon-options.png` (size-by-size comparison when only the mark is used) |
| Windows title bar | Background `white`, text `navy`, border `border` (`DwmSetWindowAttribute`) |
| Tutorial | Overlay black 45% (except the card and the spotlight), spotlight 2px `blue` with 6px rounding (1px for secondary targets), card with a white background, 1px `border`, 8px rounding, 360px wide, title 15px Bold `navy`, body 13px `text`, progress and language 12px `text.2`, Next button filled `blue`, drawn tooltips in white text on a `navy` background |

## 6. Implementation (H2)

`QtSpim/edu/theme/tokens.h` holds the values of this document, and `theme/light.qss` is applied with its `@name@` placeholders filled in with those values. Everything that still had old colors in the H1 mockup captures (type badges, PC row, pseudo groups, editor palette, Data markers, status bar badges and banner, log font, row height, name) was changed to tokens in H2 — `docs/ARCHITECTURE.md` §12 items 51–58, captures in `docs/design/captures/`. Color and font literals left in the code: 0 (`grep -rn "QColor(\|QFont(\|setStyleSheet(" QtSpim/*.cpp QtSpim/edu` finds only references to tokens and settings values).

## 7. Decisions (2026-09-22, moved to the Stage H decision table in PLAN.md)

1. PC row: the instruction was "2945 = selected row and PC row", but if both are dark blue they cannot be told apart. Proposal: PC row = `blue.tint2` background + a 3px `blue` bar on the left, selected row = dark `blue`. (When the selected row is the PC row: dark blue + bar)
2. Changed values: text color only (`teal.text` 600) vs text + cell background (`teal.tint`). After a Run in which 10 of the 39 register rows change, adding the background as well is noisy. Proposal: text only.
3. Code font: D2Coding (Korean monospace, 8.5 MB of the 15 MB) vs JetBrains Mono (0.55 MB, Korean from a fallback font). Korean comments are common, so the proposal is to keep D2Coding. Whether to stop bundling JetBrains Mono.
4. 1366×768: 47 register rows × 16px = 752px, so no layout fits all groups on one screen (about 500px available). **Decision: scrolling allowed, no automatic collapsing of groups or the inspector.** At 1920×1080 all 47 rows are visible even with the inspector open.
