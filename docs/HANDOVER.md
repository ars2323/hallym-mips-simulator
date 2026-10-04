# Handover to `assembly-studio`

This repository stops here. Development moves to `assembly-studio`, which takes code from this one.
This page is written for whoever does that taking: it is a statement of what is true in this tree as
of the freeze, not a summary of what was intended. Where something is unverified it says so.

Written at the freeze of the 2.8.2 round (2026-10-04). **2.8.2 was not released.** The last release
is **2.8.1**, and no version number was raised in this round.

## (a) The commit and branch to take from

| | |
|---|---|
| **Released baseline** | `f54b5775258d52d1be6a95bd5d4718b080a9551c` — `main`, tag `v2.8.1`, 2026-10-03 |
| **This round's work** | `5cf9352044b32ec685a963fdd73a007cd1536a1e` — branch `freeze/2.8.2-wip`, one commit on top of `f54b577` |

Take **`v2.8.1` (`f54b577`)** as the base. It is a released, fully checked commit: the Electron
workflow is green on it, the Qt workflow is green on the last commit that changed one of its inputs
(`7e5f11d`), and its installer was published and downloaded back and checked.

**`freeze/2.8.2-wip` is not fully checked** (see (e)). Take it as two separable patches, not as a
unit:

- the start-screen fix — ready, verified, take it;
- Ctrl + / — works, but one of its checks does not prove what it claims. Read (d) before taking it.

`main` was left exactly at `v2.8.1`. Nothing of this round is on `main`.

## (b) What went into `main` after v2.8.1

**Nothing.** `git log v2.8.1..main` is empty. `main` and the tag `v2.8.1` are the same commit.

Everything below is on `freeze/2.8.2-wip` only:

| Change | Files | State |
|---|---|---|
| Start screen misaligned after leaving the tutorial — fixed | `electron/src/renderer/app/app.ts` | **Verified** (see (c)) |
| An e2e check for it | `electron/tests/e2e/start.e2e.ts` | **Verified** — failed before the fix, passes after, its mutant dies |
| Ctrl + / comment toggle — the arithmetic | `electron/src/renderer/app/logic/comment.ts` (new) | **Verified** — 8 unit tests, 7 mutants, all die |
| Ctrl + / — the editor command and the key bindings | `electron/src/renderer/app/editor.ts` | **Partly verified** — the toggle itself is verified by e2e; the read-only guard is **unverified** (see (d)) |
| Its unit tests | `electron/tests/renderer/comment.test.ts` (new) | **Verified** |
| Its e2e tests | `electron/tests/e2e/editor.e2e.ts` | **Partly verified** — the toggle test is sound; the read-only test is marked KNOWN WEAK in the file |
| 9 new mutants | `electron/tools/mutants.ts` | **Partly verified** — 8 of 9 die, 1 survives (see (d)) |
| Ctrl + / in the usage guides | `docs/usage/usage.ko.md`, `docs/usage/usage.en.md` | **Verified** — one table row each, doc links 0 broken / 0 orphans |
| One line of porting note | `electron/docs/PORTING.md` | **Verified** — text only |

Not done, and deliberately not done: no version bump, no release notes for 2.8.2 (a draft was written
and then deleted), no tag, no release, no screenshot re-capture (the start screen as it opens did not
change, so the existing stills are still right).

## (c) The start screen misaligned after leaving the tutorial

**Found, fixed, checked, and the check was seen to fail first.**

**The symptom.** App → **튜토리얼 보기** → finish it or quit it → back to the first screen. A dark band
the full width of the card sat directly above the card, with no traces of the board in it. Only after
returning, never at the first start. At 2560×1392 maximised: card at x 1050–1509, y 474–933
(459×459); band at x 1050–1509, y ≈228–473 (459×245); mean brightness 30.0 in the band against
55.5 / 54.6 on the board to its left and right, and 50.2 / 52.2 below the card, so not a shadow and
not a haze.

**The cause.** `layout()` in `electron/src/renderer/app/app.ts` called `firstScreen.show(!open)`
**before** `split.hidden = !open`. Showing the first screen is what measures the card, so the board
can leave a hole for it and put its pins on its edge. With the Editor side (`split`) still laid out,
the card stands somewhere else, and the board cut its hole there. At the first start the Editor side
had never been shown, so the order had never mattered — which is why it only ever appeared on the
way back.

Candidate (가) in the brief ("the card rect passed to the board on rebuild is not refreshed on
return") was the right one. (나) tutorial elements left behind and (다) a halo box measured instead of
the border box were both wrong.

**It was proved, not guessed.** The check was written first and seen to fail:

```
first launch     card y=200,  board keeps y=200   ok
after tutorial   card y=200,  board keeps y=92    fails
```

Then a probe measured the card deliberately with `split.hidden = false`: **y = 94** — the same place
the board had stored (92). That is what identified the ordering, before any code was changed.

**The fix.** One reorder in `layout()`, with the reason written next to it:

```ts
stageWelcome.hidden = open;
document.body.classList.toggle('first-screen', !open);
split.hidden = !open;
/* After the two stages have been shown and hidden, never before: showing
   the first screen measures the card to put the board's pins on it, and
   with the Editor side still laid out the card stands somewhere else. ... */
firstScreen.show(!open);
```

**The check.** In `electron/tests/e2e/start.e2e.ts`, inside
`'back from the tutorial: the board is up again, and running once'`: it reads the rect the board is
holding (`window.__startfield.geometry().card`) and compares it with the DOM card's bounding box,
within 1 px on x, y, width and height. Before the fix it failed with
`the board keeps 416x416 at 432,92 for a card of 416x416 at 432,200`.

**Its mutant.** `tools/mutants.ts`, `'the first screen shown before the Editor side is hidden (the
card measured where it is not)'` — puts `firstScreen.show(!open)` back in front of
`split.hidden = !open`. **Killed, in 89.6 s.**

**Maximised: yes, with a caveat.** Verified at 1280×800, 1920×1080, 1920×540, 1024×768, at the
reporter's exact 2560×1392, and maximised — for **both** exit paths (going through the tutorial to
the end, and quitting it half way). Six cases, every offset dx/dy/dw/dh = 0. At 2560×1392 the card
measured 1050,474 460×460, matching the reported numbers, and the board's hole is that rect exactly.

The caveat: the Linux e2e display (`xvfb`) has no window manager, so `maximize()` there is a no-op —
"maximised" was approximated by opening the window at the screen's full size. A true maximised window
is only exercised by the **Windows CI** e2e, which runs against the installed app and opens maximised.
**That run was never made for this change** (the round was frozen before pushing), so maximised on
real Windows is **unverified**. The check itself is window-size independent and runs in that job
automatically once it is pushed.

## (d) Ctrl + / comment toggle

**It works.** Ctrl + / (and Cmd + / on a Mac — both `Mod-/` and `Ctrl-/` are bound) toggles `#` on the
cursor's line, or on every line a selection touches.

**Where it is.**

| | |
|---|---|
| `electron/src/renderer/app/logic/comment.ts` | new, pure: `MARK`, `isCommented`, `isBlank`, `plan`, `take`. No editor in it |
| `electron/src/renderer/app/editor.ts` | `toggleComment(view)` (~line 173) and two keymap entries, `Mod-/` and `Ctrl-/`, ahead of `defaultKeymap` |

The split is deliberate: the arithmetic is unit-testable with no window, and the editor side is thin
enough to read in one screen. The whole toggle is **one** `view.dispatch`, which is what makes it one
undo step and what maps the selection through the change so it still points at the same lines.

**The behaviour, as implemented.** Comment if any non-blank target line is uncommented, otherwise
uncomment. The mark goes at the **shallowest** indent across the target lines, not each line's own, so
the marks line up:

```
main:                      main:
    li $t0, 5                #   li $t0, 5
                      ->
        add $t1, $t0, $t0    #       add $t1, $t0, $t0
  sw $t1, x                  # sw $t1, x
```

Inserts `"# "`; removing takes `"# "` when the mark put the space there, else just `"#"`. Blank lines
inside a selection are never marked and count for nothing — neither for the direction nor for the
column.

**The checks.**

| Check | Where | State |
|---|---|---|
| One line on, then off | `tests/e2e/editor.e2e.ts` | pass |
| Part-commented block → all commented | `comment.test.ts` + e2e | pass |
| All commented → all uncommented | `comment.test.ts` + e2e | pass |
| The mark in one column, the shallowest | `comment.test.ts` + e2e | pass |
| A blank line left alone, and ignored for the column | `comment.test.ts` + e2e | pass |
| Nothing but blank lines → nothing done | `comment.test.ts` | pass |
| `take` removes the space only when the mark put it there; a mark after code is not a comment | `comment.test.ts` | pass |
| One Ctrl + Z restores the whole block | e2e | pass |
| The selection still points at the same lines after a toggle | e2e (a second press takes all the marks off again) | pass |
| **A read-only document is not written to, and no dialog is raised** | e2e | **passes, but proves nothing — see below** |

Unit 245 / 245 pass; `tsc --noEmit` clean. Of the 112 mutants `--changed` selected, **111 die, 1
survives.**

**The read-only guard is UNVERIFIED. This is the one thing to fix first.**

`editor.ts` has `if (state.readOnly) return true;` as its first line, and it is the right code — but
nothing in the suite holds it there. Delete the line and the e2e test still passes. The mutant
`'Ctrl+/ writing to a read-only document (the tutorial's example)'` in `tools/mutants.ts`
**survives**, and it is left in the file deliberately so the gap cannot be lost.

What the document does and does not say, measured:

- With the guard deleted and the bundle rebuilt, the tutorial's example is **still** not written to,
  and no dialog appears. So *as shipped the read-only file is safe* — the fixed condition of the
  project holds in practice.
- Instrumenting `toggleComment` showed it is **never entered** while the tutorial is open.
- A listener on `window` in the **capture** phase sees the keydown already `defaultPrevented: true`,
  with `target: cm-content`, and it never reaches `.cm-content` or the window's bubble phase at all.
- So the key is stopped before CodeMirror's keymap, and the guard never runs. **What stops it is not
  identified.** Ruled out by reading and grepping: there is no capture-phase keydown listener in the
  renderer (the only `window` keydown listener is `app.ts:1387`, bubble, which runs *after*
  CodeMirror); no main-process interception (`Menu.setApplicationMenu(null)`, no
  `before-input-event`, no `globalShortcut`); nothing in `@codemirror/view` that registers on
  `window`. Note that `tutorial.ts handleKey` ends with
  `if (e.ctrlKey || e.metaKey) return take();` — it swallows every Ctrl combination while the
  tutorial is open — but it is reached from the window **bubble** listener, which is too late to
  explain `defaultPrevented` at capture. It was not ruled out as a second cause.
- Note also: `EditorState.readOnly` in CodeMirror 6 is **advisory**. `view.dispatch` does not refuse
  changes; the facet only sets `aria-readonly`. So the guard in `toggleComment` really is the only
  thing standing between this command and a read-only document. It must be checked.

**What to do in `assembly-studio`:** check the guard on a read-only document that is **not** behind
the tutorial — either a plain file put into the read-only compartment through the UI, or
`toggleComment` against a headless `EditorView` built with `EditorState.readOnly.of(true)` (which
makes it a unit check, no window needed). Either gives a check the mutant can kill. The e2e test
carries a `KNOWN WEAK` comment pointing here.

## (e) Known broken

**`main` is green.** It sits at `v2.8.1` / `f54b577`:

| Workflow | Commit | Result |
|---|---|---|
| Electron edition (2.x) — Windows | `f54b577` (`main`) | success |
| Electron edition (2.x) — Windows | `f54b577` (tag `v2.8.1`) | success |
| Qt edition (`ci.yml`) | `7e5f11d`, the last commit touching its inputs | success |

**`freeze/2.8.2-wip` has no CI result at all** — it was pushed at the freeze and nothing was waited
for. What is known about it locally:

| | |
|---|---|
| `tsc --noEmit` | clean |
| Unit tests | 245 / 245 pass |
| e2e, whole suite | **not re-run after the last edit to `tests/e2e/editor.e2e.ts`.** It was 116 pass / 2 skipped / 0 fail earlier in the round; after the rewrite only the three affected tests were run, and they pass |
| Four widths, and the whole suite at 1920×1040 | **not run** for this branch |
| Mutants `--changed` | 111 of 112 die; the survivor is in (d) |
| Full mutant pass | not run this round; the baseline is `tools/mutants-baseline.json` |
| Windows CI e2e against the installed app | **not run** |
| Install over 1.2.4, and over the latest 2.x | **not run** |
| Doc links | 0 broken, 0 orphans |

So: nothing is known to be red, and a good deal is simply unknown. Treat the branch as unverified
except where (b) says otherwise.

## (f) What `assembly-studio` should NOT take

**Code and docs that still assume a photographed background or the campus video.** From 2.8.0 the
first screen is drawn by the program; there is no video, no still and nothing of the campus in the
installer. What is left over:

| What | Why not |
|---|---|
| `electron/docs/start-variants/` (~20 JPGs, 3.4 MB, two READMEs) | The design study for the *photographed* start screen — five candidate treatments of a photo under the card, then four combinations of them. Decided in 2.6.0, and the thing it was deciding about no longer exists. Its README still tells you to run `node tools/start-variants.ts combined`, **and that tool was deleted**. History only; do not carry it |
| The comment at `electron/src/renderer/app/logic/overlay.ts:33` | "On the first screen the title bar is dark glass **over the photo**" and a pointer to `docs/start-variants/combined/README.md`. The code (`FIRST_SCREEN_PATCH`, transparent patch + white symbols) is still correct and still wanted — it is the *reason given* that is out of date. Rewrite the comment when you port it; do not port the pointer |
| `electron/src/renderer/assets/hallym/README.md`, lines ~34–35 | Still says, in the present tense, "The first screen's **video** runs behind the card, blurred and under navy; the character stands on the card's opaque white, never on the video." Line ~79 of the same file then says the video was dropped in 2.8.0. The first passage is simply wrong now |
| The video and the stills themselves | Already gone — `assets/hallym/start/` was deleted in the 2.8.0 round, together with the `start-*.jpg` goldens that depended on it. There is nothing to take and nothing to look for |

**Tools that no longer have a job.** Everything under `electron/tools/` is still referenced from
somewhere, so none of it is an orphan by the link checker — but these three are referenced only from
`docs/DEVELOPMENT.md` / `docs/PORTING.md` as "how this was once measured", not from any script,
workflow or test:

| Tool | Only referenced by | Note |
|---|---|---|
| `tools/start-film.ts` | `docs/DEVELOPMENT.md` | Films the first screen. It does still work (it was run in the 2.8.0 round and produced video). Take it only if `assembly-studio` wants release footage |
| `tools/scanner-input-experiment.ts` | `docs/DEVELOPMENT.md`, `docs/PORTING.md` | A one-off experiment about console input. Its conclusion is in PORTING; the script is spent |
| `tools/capture-compare.ts` | `docs/PORTING.md` | Compares two capture runs. Useful only alongside the capture harness |

Already deleted in 2.8.0 and **not to be looked for**: `tools/start-variants.ts`,
`tools/start-variants-list.ts`, `tests/e2e/backdrop-measure.ts`, and the phase of
`tools/probe-platform.ts` that measured the photographed background through the compositor.

**Dead checks.** None known. The `start-*.jpg` goldens that were re-written on every re-shoot went
with `assets/hallym/start/` in 2.8.0; that long-standing annoyance is closed, and no check was left
pointing at them (doc links: 0 orphans).

**Names.** Two rules that are not optional and must carry over if the UI does: the simulator core in
`CPU/` is not modified (it is shared with the Qt edition at the repository root, and
`CPU/ORIGIN.md` is the only file there that is not upstream's), and **the Korean word 한림 never
appears in the UI** — only in the guides.

## (g) Deferred — the 2.8.3 list, never started

These were put off deliberately during the 2.8.2 round and none of them was touched.

**1. The card's ink is not vertically centred.** The symbol, title and buttons sit off centre in the
card. **Carry this rule over with the item, or the fix will be wrong:** measure the centring from the
**fixed elements only — the symbol, the title and the buttons — and do not re-measure on a step
change.** Implemented without that rule, the buttons **jump 15 px at step 2 of the tutorial**,
because the tutorial changes what is in the card and a re-measure then re-centres against different
content. This was also the reason the item was kept out of the 2.8.2 round: it is the same card code
the start-screen fix in (c) touches, and mixing the two would have muddied the diagnosis.

**2. `set -o pipefail` in the scripts.** Not set anywhere. It has already cost something real: in an
earlier round a pipeline `gh release delete ... | tail -1 && echo "deleted"` hid a failed
`--cleanup-tag` and printed a false success. Set it, then re-read every pipeline whose exit status is
being relied on.

**3. The document pictures to WebP.** The guides and `electron/docs/screens/` are JPG and PNG.

**4. The minimise/restore double-paint check.** When the window is minimised and restored, the
board's loop can end up running twice. The check must look for a **double paint**, not for a frame
count: **under `xvfb` the two cases are not distinguishable by frame count.** Any check written
against frame counts will pass on a broken build.

## (h) The startfield and the card's lights: where they are, and whether to copy them

**`electron/src/renderer/startfield/` — copy the folder whole, all five files, and nothing else.**

| File | What |
|---|---|
| `generate.ts` | Pure: lays out the board |
| `render.ts` | `drawBoard`, `drawPulse` |
| `index.ts` | The two canvases, the clock, `onFrame`, teardown |
| `glints.css` | |
| `css.d.ts` | |

It **imports nothing outside itself**, and `electron/tests/renderer/startfield.test.ts` holds it to
that — so the copy is clean by construction. Copy that test too.

The call site is `electron/src/renderer/app/panels/welcome.ts`:

```ts
const start = startfield({ seed: SEED });     // SEED is in panels/spark.ts
container.append(start.root, card);           // the card carries data-startfield-chip
start.show(true);
start.onFrame((t) => { /* whatever the card's own lights are */ });
```

Only three things are meant to change there: `SEED` (`panels/spark.ts`) for a different board under
the same rules; `WORDMARK` (`panels/welcome.ts`) for the product's name; and the symbol — the
`asset('hallym/marks/symbol-basic.svg')` in the card and the same call in `app.ts` for the top bar.
`chipLabel` is no longer a parameter: the `MIPS32` die marking came off the card in 2.8.0, so the
board needs nothing from the app but a seed.

**Do not change the startfield's parameters while porting.** Brightness and speed were tuned against
measurements in the 2.8.0 round (they had been 8–12× too dark, and the whole board settled in 0.65 s
with no stagger by distance); the two-canvas split is what let it keep running after settling.

**The card's own lights are the app's, not the board's.** `electron/src/renderer/app/panels/spark.ts`
(pure) plus `.wtitle::after` and `.action::after` in `electron/src/renderer/app/app.css` — a
`background-clip: text` sweep on the title and a `conic-gradient` masked to the button borders, both
driven every frame from `start.onFrame()` through the CSS variables `--sp-amp` and `--sp-at`. A new
edition can take them or leave them; they need only `onFrame`. One constraint to keep: **no infinite
CSS animation anywhere** — a looping CSS animation cannot be photographed by the capture harness
(it freezes them), which is why the lights are driven from the board's clock instead.
