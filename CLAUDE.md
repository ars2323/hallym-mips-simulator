# Hallym MIPS Simulator — working rules for Claude Code

A Hallym University derivative of QtSpim-Edu 1.0.1, the educational extension based on SPIM/QtSpim **9.1.24** (SVN r764, git tag `vanilla-9.1.24`).
The layout, features and simulator core stay exactly as in QtSpim-Edu; **only the appearance (branding, colors, fonts, icons, spacing)** changes (PLAN.md, "Stage H").
It is used in class alongside standard QtSpim, so **the simulation results must be completely identical to the original, and only the GUI changes**.
This repository also holds the Electron edition (2.x, the current version) in `electron/`, which shares `CPU/`; its rules and history are in `electron/docs/PORTING.md`. The rules below are for the Qt edition (1.x) at the root, except the last section, **"Releasing the Electron edition (2.x)"**, which applies to every round that changes the Electron app.
The final distribution target is **Windows**. The overall plan is in `PLAN.md`, the results of the code structure survey are in `docs/ARCHITECTURE.md` (written in stage 1), and the design tokens are in `docs/design/tokens.md`.

## Build (Linux development environment)

```bash
mkdir -p build && cd build && qmake ../QtSpim/QtSpim.pro && make -j$(nproc)
./build/HallymMIPS
```

- Ubuntu 22.04 · Qt 5.15.3 · bison 3.8.2 · flex 2.6.4 · g++ 11
- Windows build: Qt 5.15.2 + MSVC 2019 (set up as CI in PLAN stage 2)
- Always use a shadow build (`build/`). Never run qmake in the source directory.

## Absolute rules

1. **Do not modify the `CPU/` directory.** The simulator core stays as in the original. (`CPU/ORIGIN.md` is the one file there that is not upstream's: a note of where the core comes from and that both editions build from it; `tools/regress.sh` leaves it out.) If you judge a modification to be unavoidable, stop the work and report the reason and the alternatives.
2. **Do not modify `SPIM_VERSION` in `CPU/version.h`.** Our version information lives in `QtSpim/edu/edu_version.h`.
3. **No regressions in existing features.** Every menu and behavior of the original (changing register/memory values, breakpoints, display radix options, the User/Kernel display toggle, printing, saving the log, settings, run arguments, etc.) must all work in the new UI as well. The reference list is the "preserved features" table in `docs/ARCHITECTURE.md`.
4. **Use only the Qt 5.15 common API.** Qt6-only APIs, APIs deprecated in 5.15, and POSIX-only/Win32-only APIs are forbidden. It must build on both Linux (5.15.3) and Windows (5.15.2).
5. **The build must not dirty the source tree.** `git status` must be clean after `make`.
6. **Do not guess the core's structure.** The register array, text segment, instruction encoding, symbol table, memory read paths, etc. must be confirmed by reading the source and recorded in `docs/ARCHITECTURE.md` with file:line evidence before they are used.
7. **Numeric display is produced in one place only.** hex/dec/bin conversion, instruction field breakdown and address calculation are done only through the tested functions in `QtSpim/edu/core/`. No ad-hoc formatting inside widgets.
8. **Names.** Display name "Hallym MIPS Simulator", executable and settings folder "HallymMIPS", Korean name "한림 MIPS 시뮬레이터" (Hallym MIPS Simulator; in the guides only). No QtSpim/Spim/Edu name may remain anywhere on screen, in menus, in file names or in documents. Exception: because of the BSD and LGPL terms, the original copyright notice (James Larus, SPIM) and the Qt LGPL notice in the About → License tab and in the bundled LICENSE file stay as they are. Code identifiers (`edu_*`, `EDU_*`) are code, not names, so they are not changed.
9. **Do not alter the CI assets.** The symbol mark, logotype, emblem and signature (`assets/ci/`) may only be scaled and given margins. Making them monochrome, rotating them, changing their proportions, changing their colors or separating their elements is forbidden. Use only the tokens in `docs/design/tokens.md` for colors, fonts and spacing — no color or font literals outside `QtSpim/edu/theme/tokens.h` and `theme/light.qss`.
10. **Take string literals only as `const char*` or `QString`.** MSVC's `-Zc:strictStrings` is turned off in the `.pro` because the core (`CPU/`) passes literals to `char*`. New code in `QtSpim/edu/` does not rely on that exception: never assign a literal to a `char*` or pass one to a `char*` parameter.

## Verification — required before declaring anything done

1. Zero compiler warnings in newly added or modified code
2. All unit tests in `tests/` pass
3. If the UI changed, capture it with the screenshot harness and **open the images yourself with Read to check them**. Never say UI work is done without a capture.
4. The regression script passes: the results of running the original test programs in `Tests/` are identical to the `vanilla-9.1.24` build
5. At the end of a stage, a **human checkpoint**: present a checklist for a person to verify on a real monitor (Linux) and stop. Do not move on to the next stage without human approval. The Windows zip check is not done at every stage but **after stage 7 is complete (stages 3–7 at once) and in stage 8** — in between, the CI that runs on every push (Windows build, unit tests, packaging) must be green.

Offscreen captures may differ from the real thing in fonts, DPI and theme. They are for checking content and layout, not for judging the final appearance.

## Code layout

| Location | Purpose |
|---|---|
| `QtSpim/edu/core/` | Pure logic (formatters, decoder). Depends on QtCore at most. All of it is covered by unit tests |
| `QtSpim/edu/` | New GUI code (models, views, inspector, editor) |
| `tests/` | Qt Test–based unit tests (separate `.pro`) |
| `tools/` | Screenshot harness, regression scripts |
| `docs/` | ARCHITECTURE.md, etc. |

Changes to the original `QtSpim/*.cpp` are limited to the minimum needed to hook up the new code, and every change point gets an `// EDU:` comment.

## Commits

- Small, one purpose per commit. Message format: `[stage number] summary` (e.g. `[3] register panel: group headers`)
- Do not mix formatting changes with logic changes. Format **only new/changed lines** with `git clang-format`. Reformatting whole original files is forbidden.
- Changing the permission bits (100755) of original files is forbidden.
- When a stage is complete, tag it `stage-N`.

## Korean and Windows caveats

- Windows user names and paths on students' PCs may contain Korean. Check the encoding at the point where a file path passes from a QString to the core (`char*`, `fopen`), and test with Korean paths.
- Korean comments are common in `.s` files. The editor defaults to UTF-8, supports opening CP949 files, and keeps the original line endings (CRLF/LF).
- Installation must not conflict with standard QtSpim (installation path, executable name, MSI UpgradeCode, `.s` file association).

## Releasing the Electron edition (2.x)

A change that has not reached the students has not been made. These rules hold for every round; they are not asked
for again each time.

1. **A round that changes the app ends with a release.** The app is `electron/src`, `electron/native` and `CPU/`.
   A round that changes only documents, tests or CI does not release: its report says "배포 없음" (no release) and why.
2. **The version is decided here, not asked for.** A change a student can see → minor (2.2.0); fixes only → patch
   (2.1.1). The report gives the reason.
3. **Release only when everything is green.** If one check is red, do not release: report it. The checks, reported
   as a table:
   - both workflows green on the commit to be released (the Qt build and the Electron build);
   - the unit tests (`cd electron && npm test`);
   - every e2e test at the four widths (`npm run e2e:widths`: 1280, 1093, 1024, 910), the 1920 test among them;
   - Korean input: the CDP tests (in the e2e) and the real Microsoft Korean IME (Windows CI);
   - settings reset to their defaults at every start (in the e2e);
   - every mutant killed (`node tools/mutants.ts`);
   - the Windows CI job's e2e against the installed app, the 1920 test included;
   - installing over 1.2.4 (side by side: Windows CI, every run) and over the latest published 2.x release (the
     workflow's `upgrade` job: run it by hand on the commit to be released, before tagging; on a commit that still
     carries the released version it has nothing to upgrade from and says so instead);
   - document links: 0 broken, 0 orphans (`node tools/check-doc-links.ts`);
   - greps: no old version given as the current one, no `[스크린샷 자리]`, no "하면 됩니다"-type ending (1.x documents
     excepted);
   - `slides/` unchanged (file count and combined hash).
4. **How to release.** The version bump (`electron/package.json`, `electron/package-lock.json`) and the release
   notes, `electron/docs/releases/<version>.md`, go in the commit that is released (rule 7). The notes are in
   English, for students: the Korean user guide's link first; what they will see that is different; that the
   program is unsigned and how to get past the Windows warning (link); links back to the previous 2.x release and
   to 1.2.4; no video links. Push that commit, wait for both workflows and run the checks above, then push the tag
   `v<version>`. The tag's workflow (`electron.yml`) builds and tests again, installs over the previous release,
   publishes (not a pre-release; Latest; the installer's SHA-256 added to the notes by CI) and then runs the
   post-release check (`release-check.yml`). A failure anywhere opens an issue.
5. **It is released only when the post-release check has passed:** the installer downloaded from the public release
   address, its SHA-256 the one in the notes, installed on a clean runner, every e2e test run against it, every link
   and picture of the published documents opening, the release Latest, the earlier releases still there. Check its
   result and report it with the release's address and the hash.
6. **Never delete an old release.** 1.2.4 is the Qt edition's last; the earlier 2.x releases are where to go back.
   The notes link back to them; rolling back is in `electron/docs/WINDOWS.md`, "Rolling back a release".
7. **The version is raised only in the commit that is released,** never in the middle of a round.

