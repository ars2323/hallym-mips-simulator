# Candidate first screens: the combinations

The second round narrows the choice. Design 5 (the photo under the whole window) and design 4 (the glass card) each solve a different problem, so these candidates combine them, with design 2's colour correction added. As in the first round (`../README.md`), each design is CSS laid over the app at run time and the app does not change.

```
xvfb-run -a -s '-screen 0 2400x1400x24' node tools/start-variants.ts combined
```

## First: the caption buttons on Windows

Design 5 depends on something the page cannot draw: the caption buttons (minimise, maximise, close). Windows draws them in a patch at the right end of the title bar, in the colour given by `setTitleBarOverlay`. If that patch were a light rectangle on the dark glass bar, design 5 would not work as drawn.

Run [36439439685](https://github.com/ars2323/hallym-mips-simulator/actions/runs/36439439685) captured the whole screen on the Windows runner, maximised, with design 5 and each patch colour. `windows-frames.json` holds the numbers: a 6×6 sample in the patch's left edge, next to one in the bar just before it.

| patch colour | patch, top | bar beside it, top | patch, middle | bar beside it, middle |
|---|---|---|---|---|
| `#00000000` (transparent), white symbols | 46,71,109 | 46,71,109 | 44,71,111 | 44,71,110 |
| `#1f4472` (opaque navy, the bar's mean over the clip), white symbols | 31,68,114 | 46,71,109 | 31,68,114 | 44,71,110 |

**Windows honours the alpha.** The transparent patch shows the bar through it, identical to within one level. The navy row proves the sample really is inside the patch: it reads exactly the colour that was set. If the alpha were ignored, the transparent patch would be black. The other designs with bars (A–D) measure the same way.

The opaque navy is the fallback, and it is not needed. As the pictures show, it leaves a slightly bluer rectangle: low contrast, but visible.

- [windows-caption-crop.jpg](windows-caption-crop.jpg): the caption area at 2×, transparent above and navy below
- [windows-caption-5-transparent.jpg](windows-caption-5-transparent.jpg) and [windows-caption-5-navy.jpg](windows-caption-5-navy.jpg): the whole screen

Not covered: the buttons' hover highlight, which Windows also draws itself, was not captured.

## The designs

| | Design |
|---|---|
| A | **5 + 4.** The photo under the whole window with dark glass bars (navy .3, backdrop blur 16 px, white text and icons). Glass card: white .82, backdrop blur 18 px, saturate 1.2. Ground: tint navy .4, blur 8 px, saturate 1.15. |
| B | **A + 2's colour correction.** The photo gets saturate 1.25, sepia .1, hue −6°, blur 8 px. Card at .82. |
| C | **B with the card opaque white.** One window; the only glass is in the two bars. |
| D | **B with the card at .90.** The contrast fix by opacity. |

All four use the smaller card (722×273) and the transparent caption patch. Pictures: [sheet.jpg](sheet.jpg) side by side, and each design at both sizes:

| | 1920×1040 | 910×505 (150%) |
|---|---|---|
| A | [1920](A-window-glass-1920.jpg) | [910](A-window-glass-910.jpg) |
| B | [1920](B-window-glass-colour-1920.jpg) | [910](B-window-glass-colour-910.jpg) |
| C | [1920](C-window-opaque-colour-1920.jpg) | [910](C-window-opaque-colour-910.jpg) |
| D | [1920](D-window-glass-colour-90-1920.jpg) | [910](D-window-glass-colour-90-910.jpg) |

## How it is measured

Everything is measured as the screen shows it, over 13 moments of the clip (0.25 s to 6.25 s of its 6.7 s, every half second). Each number is reported as a range across those frames; the worst end is what a check has to hold. The frames are taken in passes, and each pass keeps one style for all 13 frames:

1. the design;
2. the card's backdrop-filter removed;
3. the ground's treatment removed (no filter, no veil).

The style changes only between passes, followed by a 1 s settle. (Switching it per frame let a capture come before the compositor had drawn the switch.)

- **Contrast** is measured for each card text against what is behind it. The text is hidden, the darkest 1% of the pixels under its box is taken, and the WCAG ratio is computed against the text's own colour. A result under 1.5:1 stops the run, because it means the text was still on the screen.
- **Tint and sharpness** are measured on the ground strip above the card against the raw frame, as in the first round. `rawPixels` now uses the video's own computed scale; it had assumed 1.03, which designs 3 and 5 of the first round did not use.
- **Glass** is the card's top strip compared with the raw frame, with the backdrop-filter and without it in the same frame. The ratio of the two is the reliable number: across frames the two ranges overlap at 910.

## Contrast: the worst frame

WCAG AA is 4.5:1 for this text size. Rows under it are out.

| design | lead text | sub, main button | sub, other button | heading | result |
|---|---|---|---|---|---|
| A (glass .82) | **4.21** | 5.08 | 5.59 | 10.86 | out |
| B (glass .82) | **4.21** | 5.08 | 5.59 | 10.86 | out |
| C (opaque) | 6.00 | 5.23 | 6.00 | 15.47 | in |
| D (glass .90) | 5.00 | 5.19 | 5.79 | 12.89 | in |
| B, card .86 | 4.59 | 5.17 | 5.69 | 11.85 | in, by 0.09 |
| B, secondary text #4b5563 | 5.31 | 6.40 | 7.05 | 10.86 | in |
| B, card .86 and #4b5563 | 5.79 | 6.51 | 7.17 | 11.85 | in |
| B, card .72 (a mutant's state) | 3.42 | 4.98 | 5.40 | 8.81 | out |

These are the Linux figures; both sizes give the same worst values within 0.04. On Windows (run 36439439685) the lead text is within 0.05 of these and every text within 0.11. The lead text reads 4.17 for A and B, 4.95 for D, 4.55 for B at .86, and 5.26 for B with the darker text.

Both directions work:

- **Raise the opacity.** .86 passes by only 0.05 on Windows, too thin a margin for a screen that moves. .90 passes by 0.45.
- **Darken the secondary text.** #4b5563 is 7.56:1 on white (up from 6.0:1), so it also helps the opaque card and every other place the colour is used. On glass .82 it gives 5.26 at worst.
- **Both together** (.86 and #4b5563) give the most room: 5.73 at worst.

## Tint and sharpness, with the treatment on and off

These are the numbers to place the on-screen check's thresholds between, once a design is chosen. Linux figures:

| design | size | tint, on | tint, off | sharpness, on | sharpness, off | blue | green |
|---|---|---|---|---|---|---|---|
| A | 1920 | 0.440–0.444 | −0.005–0.003 | 0.096–0.138 | 0.970–1.003 | +7.9–8.1 | −1.0 |
| A | 910 | 0.405–0.406 | −0.011 | 0.170–0.272 | 0.988–0.995 | +6.2–6.3 | −0.8 |
| B, C, D | 1920 | 0.440–0.446 | −0.005–0.003 | 0.096–0.137 | 0.970–1.003 | +6.6–6.7 | 0.0 |
| B, C, D | 910 | 0.406–0.409 | −0.011 | 0.171–0.274 | 0.986–0.995 | +5.0 | +0.2–0.3 |

B, C and D share one ground, so their numbers match. The colour correction takes 1.3 points of blue off A's and brings green from −1.0 to 0. The navy veil (.4) is still what makes the ground blue: the current design adds +10.8 points, these add about +6.6.

The glass on/off ratio, same frame (lower means the glass blurs more):

| design | 1920 | 910 |
|---|---|---|
| A, B (.82) | 0.30–0.41 | 0.48–0.72 |
| D (.90) | 0.23–0.43 | 0.57–0.69 |
| with the filter removed | 1 (by construction) | 1 |

## For the implementation

These are the thresholds to use for whichever of C or D (or B with the darker text) is chosen. They are placed with margin between measured values; none is moved until a test turns green.

- **Tint** (`start.e2e.ts`, "tinted toward the navy and blurred").
  - The design reads 0.405 at its lowest (910); with the treatment off, 0.003 at its highest.
  - Today's `> 0.4` is 0.005 from the design's own value and would fail intermittently.
  - Place it at **0.2**. It guards the veil: without it, the ground is the raw photo.
- **Sharpness** (same test).
  - The design reads up to 0.274; off, down to 0.970.
  - **0.6** still sits between them with about 0.33 on each side, so it stays. What it guards is the blur.
- **Contrast** (new, replacing "the card does not change while the video does" for a glass card, which is expected to change).
  - Every card text is at least **4.5:1** at 0.5, 3.0 and 5.5 s, measured as above.
  - The threshold is WCAG's, not a calibrated one. D reads 4.95 at worst; the thin-card state reads 3.38.
  - For C (opaque) the existing test can stay as it is, with the contrast check added.
- **Glass** (new, glass designs only).
  - The card's top strip over the raw frame, with the backdrop-filter against without it in the same frame, must be at most **0.85**.
  - The design reads 0.72 at worst (910); with the filter missing it is about 1.

The mutant `first screen: the card see-through` asserts an opaque card. Under a glass design it is rewritten, not deleted, as what the new design must keep:

- **`first screen: the glass card thinner than its texts' contrast allows`.** In the chosen card's `background: rgba(255,255,255,.90)`, replace .90 with .72. The contrast test kills it: 3.38–3.42 against 4.5.
- **`first screen: the glass card without its blur`** (new). Replace `backdrop-filter: blur(18px) saturate(1.2)` with `backdrop-filter: none`. The glass test kills it: about 1 against 0.85.

Under C the existing mutant stays as it is, and the contrast test kills it too (4.21 against 4.5).

The caption patch (`titleBarOverlay` colour `#00000000`) can only be seen on Windows. A check there compares the patch with the bar beside it: equal within 3 levels, as measured above. The mutant runs are on Linux, so no mutant covers it; the Windows e2e run does.

## Windows at 1920: the ground strip is not measurable yet

On Windows, at 1920×1040, the ground strip with the treatment off reads tint 0.22 and sharpness 0.57–0.64. With nothing applied it should match the raw frame, as it does at 910 and on Linux. So the strip holds something that is not the video, and neither the on nor the off figure there is a measurement.

Each row now carries its own control (`ground.valid`: off must read tint under 0.1 and sharpness over 0.8) and the window's and screen's geometry. On Windows the tool also saves a picture of the whole screen for the first design, so the next run shows what is in the strip. No check runs at that size on Windows: the Windows e2e use the default window size.
