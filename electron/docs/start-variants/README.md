> **History.** These are the candidate designs of 2.6.0, when the first screen was a photograph
> of the campus under a glass card. The first screen is a drawn circuit board from 2.8.0
> (`electron/src/renderer/startfield/`), and the tools that made these pictures
> (`tools/start-variants.ts`, `tools/start-variants-list.ts`) were removed with it. The pictures
> are kept as the record of that choice; nothing here can be run again.

# Candidate first screens

Designs for the first screen, for choosing one. They are not the app's screens (those are in `../screens/`), and the app does not change until one is chosen. Each design is CSS laid over the app as it is, at run time: `tools/start-variants-list.ts` holds the designs and `tools/start-variants.ts` takes the pictures.

```
xvfb-run -a -s '-screen 0 2400x1400x24' node tools/start-variants.ts first
```

This page is the first round: seven designs, pictured and measured with the tool as of commit 3dab049, at one frame (3.0 s). The second round combines 5 and 4, measures across the clip's frames, and covers the caption buttons on Windows: [combined/README.md](combined/README.md).

Each design is pictured at two sizes: 1920×1040 (a maximised 1920×1080 screen) and 910×505 (1366×768 at 150%, the lab's narrow case). The video is stopped at 3.0 s and the clock is fixed at 10:00. `sheet.jpg` puts all of them side by side, and `metrics.json` holds the numbers below. The Windows run (`electron.yml`, the step "Candidate first screens") takes the same pictures on the real screen, into the report artifact's `start-variants/`.

| | Design |
|---|---|
| 1 | **Current** (2.5.0). Tint: navy .78 behind the card, .5 at the edges. Blur 3 px, saturate .85. Opaque white card, 780 px. White title and status bars. |
| 2 | **Light tint.** Tint: navy .22, .3 at the edges. Blur 3 px. The clip is warmed and its greens come back: saturate 1.25, sepia .1, hue −6°. Card unchanged. |
| 3 | **Smeared.** Blur 28 px, scaled 1.15 to hide the blurred edge, so the photo reads as moving colour rather than a place. Even navy tint .35, saturate 1.3, sepia .08. Smaller card, softer shadow. |
| 4 | **Glass card.** Card white at .82 with backdrop-filter blur 18 px and saturate 1.2; buttons at .8. Ground: navy tint .35, blur 6 px. Smaller card. |
| 5 | **Photo under the whole window.** The photo continues under the title and status bars. Both bars are dark glass (navy .3, backdrop blur 16 px) with white text and icons and no border lines. On Windows the caption buttons' patch is transparent with white symbols. Tint navy .4, blur 8 px. Smaller card. |
| 6 | **Neutral dark.** No hue is pushed; the photo is only darkened and desaturated: brightness .62, saturate .7, sepia .06, blur 6 px, black veil .18. Smaller card. |
| 7 | **No video.** A gradient of the app's own colours: navy to blue, teal low right, a light glow behind the card. Smaller card. |

"Smaller card" means a 168 px character column, a 28 px gap and 28/32 padding. That makes the card 722×273 instead of 780×289.

## Pictures

All of them side by side: [sheet.jpg](sheet.jpg).

| | 1920×1040 | 910×505 (150%) |
|---|---|---|
| 1 | [1920×1040](1-current-1920.jpg) | [910×505](1-current-910.jpg) |
| 2 | [1920×1040](2-light-tint-1920.jpg) | [910×505](2-light-tint-910.jpg) |
| 3 | [1920×1040](3-smeared-1920.jpg) | [910×505](3-smeared-910.jpg) |
| 4 | [1920×1040](4-glass-1920.jpg) | [910×505](4-glass-910.jpg) |
| 5 | [1920×1040](5-whole-window-1920.jpg) | [910×505](5-whole-window-910.jpg) |
| 6 | [1920×1040](6-neutral-1920.jpg) | [910×505](6-neutral-910.jpg) |
| 7 | [1920×1040](7-no-video-1920.jpg) | [910×505](7-no-video-910.jpg) |

## Numbers (Linux, Xvfb)

All measurements are taken on the ground strip above the card: the screen is compared with the raw video frame at the same place (`tests/e2e/backdrop-measure.ts`).

- **tint** is how far the ground's mean colour has moved toward navy (0,32,91). Darkening counts too, because navy is dark.
- **sharpness** is the local variance relative to the raw frame. 1 means untouched; lower means more blurred.
- **blue** and **green** are the change in each channel's share of the total, in percentage points. They are independent of brightness.
- **light** is the screen's brightness divided by the frame's.

Design 7 shows no video, so its numbers compare against a frame that is not on screen and mean nothing.

| design | size | tint | sharpness | blue | green | light | card |
|---|---|---|---|---|---|---|---|
| 1-current | 1920 | 0.624 | 0.253 | +10.8 | −2.6 | 0.57 | 780×289 |
| 1-current | 910 | 0.593 | 0.222 | +7.7 | −2.0 | 0.54 | 780×289 |
| 2-light-tint | 1920 | 0.279 | 0.304 | +3.7 | +0.6 | 0.80 | 780×289 |
| 2-light-tint | 910 | 0.281 | 0.431 | +2.5 | +0.4 | 0.78 | 780×289 |
| 3-smeared | 1920 | 0.432 | 0.030 | +6.9 | −0.6 | 0.70 | 722×273 |
| 3-smeared | 910 | 0.485 | 0.053 | +7.4 | −0.6 | 0.62 | 721×273 |
| 4-glass | 1920 | 0.348 | 0.128 | +5.9 | −1.0 | 0.76 | 722×273 |
| 4-glass | 910 | 0.351 | 0.219 | +4.7 | −0.7 | 0.73 | 721×273 |
| 5-whole-window | 1920 | 0.458 | 0.112 | +8.0 | −1.0 | 0.69 | 722×273 |
| 5-whole-window | 910 | 0.436 | 0.132 | +6.7 | −0.8 | 0.67 | 721×273 |
| 6-neutral | 1920 | 0.609 | 0.137 | −3.0 | −0.1 | 0.49 | 722×273 |
| 6-neutral | 910 | 0.603 | 0.241 | −2.9 | −0.1 | 0.50 | 721×273 |
| 7-no-video | 1920 | — | — | — | — | — | 722×273 |
| 7-no-video | 910 | — | — | — | — | — | 721×273 |

The glass (design 4) is measured on the card's top strip, above its heading, with the backdrop-filter on and then removed as a control. The filter only does something if the first sharpness is well under the second.

| size | computed | sharpness with the filter | sharpness without it |
|---|---|---|---|
| 1920 | `blur(18px) saturate(1.2)` | 0.025 | 0.080 |
| 910 | `blur(18px) saturate(1.2)` | 0.126 | 0.224 |

The first-screen e2e test (`tests/e2e/start.e2e.ts`) requires tint > 0.4 and sharpness < 0.6. Those thresholds were calibrated on design 1. Designs 2 and 4 fail its tint check even though they are doing what they were designed to do. Design 6 passes it, but only because darkening counts as navy, so the check would no longer guard what it names. Whichever design is chosen, the test is recalibrated: measure with the treatment on and off, then place the threshold between the two with a margin.

## Numbers on Windows

These come from run [36431343709](https://github.com/ars2323/hallym-mips-simulator/actions/runs/36431343709): the installed app on the runner's real 1920×1080 screen, captured with `CopyFromScreen`, animations on.

| design | 910 tint | 910 sharpness | 910 blue | 1920 tint | 1920 sharpness |
|---|---|---|---|---|---|
| 1-current | 0.587 | 0.218 | +7.0 | 0.726 | 0.304 |
| 2-light-tint | 0.286 | 0.436 | +2.4 | 0.453 | 0.307 |
| 3-smeared | 0.487 | 0.051 | +6.9 | 0.576 | 0.189 |
| 4-glass | 0.355 | 0.208 | +4.5 | 0.519 | 0.235 |
| 5-whole-window | 0.439 | 0.127 | +6.2 | 0.600 | 0.213 |
| 6-neutral | 0.597 | 0.225 | −3.2 | 0.643 | 0.231 |

At 910 the Windows numbers match Linux to within about 0.01. At 1920 they do not: every design reads darker (light 0.42–0.68 against 0.49–0.80 on Linux) and sharper. The smeared design, for example, measures 0.189 where Linux measures 0.030.

The glass strip in the middle of the card does match at 1920 (below). The ground strip is the one that spans almost the whole screen width. A cause that fits is a window placed partly off the screen, putting black pixels into the capture. The second round confirmed it: the window was centred at (320,116), with its right 320 px off the screen. The tool now puts it at (0,0), and the Windows 1920 ground numbers above are not measurements. See [combined/README.md](combined/README.md), "On Windows".

The glass card on Windows:

| size | computed | sharpness with the filter | sharpness without it | strip mean, with / without |
|---|---|---|---|---|
| 1920 | `blur(18px) saturate(1.2)` | 0.025 | 0.082 | 213,219,223 / 214,219,221 |
| 910 | `blur(18px) saturate(1.2)` | 0.128 | 0.228 | 213,222,232 / 214,222,230 |

The backdrop-filter works on the real Windows screen. It lowers what the card shows of the ground to about a third of its sharpness at 1920, and to a little over half at 910. The Linux figures are the same.

Two things these pictures do not show:

- **Design 5's caption buttons.** They are drawn by Windows, not the page, so screenshots of the page leave them out. The design sets their patch to transparent (`#00000000`) with white symbols. Whether Windows honours the transparency has not been seen.
- **The glass card's text contrast.** The secondary text (#5a6472) on the glass strip's mean measures 4.3–4.4:1 over the sky (213,219,223 and 213,222,232). That is under AA's 4.5:1; the same text on the opaque card is 6.0:1. Over darker ground it would be lower still.
