# Windows — what was confirmed and what to check by hand

What has been run on Windows is GitHub Actions' `windows-latest` (Windows Server 2025, English, administrator account, screen 1024×768).
Workflow: `.github/workflows/electron.yml` at the repository root (it runs for changes under `electron/` or `CPU/`). Every run uploads the installer and the zip as **artifacts**; a release is made from them by hand.

| File | Size |
|---|---|
| `HallymMIPS-2.0.0-win-x64-setup.exe` (NSIS, per-user) | 102.9 MB (107,914,059 bytes) |
| `HallymMIPS-2.0.0-win-x64.zip` (archive) | 139.9 MB (146,689,276 bytes) |
| Installed size | 327 MB (Chromium locales Korean and English only; with all of them, 374 MB) |

### What the installed 327 MB contains

| Size | File | What |
|---|---|---|
| 234.6 MB | `HallymMIPS.exe` | The Electron (Chromium + Node) executable itself |
| 24.6 MB + 1.4 MB | `dxcompiler.dll`, `dxil.dll` | Chromium's WebGPU (D3D12) shader compiler |
| 19.5 MB | `LICENSES.chromium.html` | Chromium and Node notices — required for distribution |
| 11.9 MB | `resources.pak` | Chromium resources |
| 10.4 MB | `icudtl.dat` | Unicode and Hangul handling (ICU) |
| **6.6 MB** | `resources\app.asar` | **All of this app**: fonts 2.5 MB, characters 2.2 MB, bundled JS 1.8 MB |
| 5.3 + 4.5 + 0.9 MB | `vk_swiftshader.dll`, `d3dcompiler_47.dll`, `vulkan-1.dll` | Software rendering when there is no GPU, D3D |
| 3.0 MB | `ffmpeg.dll` | Media (Electron opens it at startup) |

- asar is used. Source maps are not included. There is no `node_modules` (everything is bundled). These three are already done.
- This app's share is 2%. The rest is the Electron runtime, so it cannot be made as small as the Qt edition (around 100 MB).
- The only easy reduction was the locales, and that was done (−47 MB). Minifying the bundle would save only a little over 1 MB, so it was not done.
- To reduce it further, `dxcompiler.dll` and `dxil.dll` (26 MB, WebGPU only, not used by this app) could be left out. Deleting files
  from an Electron distribution is not a supported practice, so it was not done before checking on a range of GPUs.

## The nine items

| # | Item | How | Result |
|---|---|---|---|
| 1 | utilityProcess — start, kill with `.err`, restart | **Automatic**: e2e `flows.e2e.ts` "the simulator process dies" against the installed build | Pass |
| 2 | Stop an endless loop → read registers → continue running | **Automatic**: installed-build e2e "an endless loop", Node `process.test.ts` 1 | Pass |
| 3 | Breakpoint → stop → continue | **Automatic**: installed-build e2e "breakpoint", Node `run-control.test.ts` | Pass |
| 4 | Console input rewind (PC, `$v0`, `$f0`) | **Automatic**: Node `console-input.test.ts` (6 tests, including `$f0`), installed-build e2e "console input" | Pass |
| 5 | Core timer | **Automatic** (measurement and failure condition): `tools/probe-platform.ts --expect-no-leak`, `cp0-timer.test.ts` | Interrupts only — a feature the course does not use. The leaking handle was fixed (below): now +0 |
| 6 | Real Korean IME | **Manual** | CI is English Windows, no IME. The CDP imitation (`ime.e2e.ts`) also passes on the Windows installed build |
| 7 | File dialogs | **Automatic capture** + manual check | Native Windows 11 dialogs. See below |
| 8 | Fonts | **Automatic**: two in `hex-mono.e2e.ts` (the fonts are actually `loaded`; identifiers containing hexadecimal or 0 are in D2Coding) + captures of four scenes | Pass |
| 9 | Side by side with 1.2.4 | **Automatic**: `tools/windows/check-side-by-side.ps1` (the real 1.2.4 MSI) | Pass. Both run at the same time; settings, Start menu and folders do not overlap |

Other things CI checks every time:

- All Node tests (170) — process separation (fork), stopping, breakpoints, console input, modules, Qt goldens
- All 15 e2e tests against the **installed** `HallymMIPS.exe` (asar, the addon outside the asar, the bundled worker, license files)
- That after unpacking the zip, `HallymMIPS.exe` stays alive for more than 10 seconds and `LICENSE.txt` and `NOTICE.txt` are next to it
- That the installer manifest is `asInvoker` (does not request administrator rights)

### What showed up only on Windows

- **The core's name table differs by platform.** The `floor.w.s` word shows as `prefx` on Windows, and on Linux `trunc.w.s`
  shows as `suxc1`. This is a difference in `qsort`'s ordering of ties (it differs between C libraries). No effect on running. `docs/PORTING.md` section 7.
- **The core timer's handle leak — fixed.** Every `run_spim()` leaked one named timer handle (364–850 per second while running,
  1 per F10). The name (`"SPIMTimer"`) is shared by the whole session, so running alongside the Qt edition could make one side's `Count` stop.
  On Windows only, `CPU/run.cpp` (the shared core in the repository's root `CPU/`) is compiled wrapped in `native/src/run-win.cpp`, which reuses **one unnamed timer**.
  After the fix: handles +0 over 10 seconds of running and 200 F10 presses. CI fails if the count grows. `docs/PORTING.md` section 14.
- **The installer left a copy of itself (111 MB) in `%LOCALAPPDATA%\hallym-mips-simulator-updater`**
  (electron-builder does this for auto-update). There is no update feature, so it is deleted at the end of installation (`packaging/installer.nsh`).
  CI checks that the folder does not exist.
- Two tests broke on Windows paths (a drive path in an ESM `import`, and the name table above). It was a problem with the tests, not the app.

### Side by side with 1.2.4 — what was confirmed (`check-side-by-side.ps1`)

| | Qt edition 1.2.4 | This app | Result |
|---|---|---|---|
| Install folder | `C:\Program Files\Hallym MIPS Simulator` | `%LOCALAPPDATA%\Programs\Hallym MIPS` | No overlap |
| Start menu | `(all users) Hallym MIPS Simulator\Hallym MIPS Simulator` | `(this user) Hallym MIPS` | No overlap |
| Settings | Registry `HKCU\Software\HallymMIPS` | None kept: a folder for one run, `%TEMP%\HallymMIPS\run-<pid>-<time>`, removed when it closes | Qt settings unchanged after this app's install, run, e2e and uninstall; after the run nothing of this app in `%APPDATA%`, `%LOCALAPPDATA%` or `%TEMP%\HallymMIPS` |
| Uninstall entry | HKLM | HKCU `Hallym MIPS 2.0.0` | The Qt edition is still installed after the uninstall |
| `.s` association | None | None | `assoc .s` unchanged |
| Running at the same time | | | Both stay alive for 10 seconds |

Nothing is kept between runs (docs/PORTING.md, "Nothing kept"). Builds before 2.0.0 kept the font size and the Data base
in `%APPDATA%\HallymMIPS2`; 2.0.0 removes that folder when it starts, so an upgrade leaves nothing behind either.

### File dialogs (CI screen captures, English Windows)

- Save: `Save As` — file name `제목 없음` ("Untitled"), type `MIPS 어셈블리` ("MIPS assembly"). A native dialog, as in the Qt edition.
- Open: `Open` — types `MIPS 어셈블리` (`.s`, `.asm`) / `모든 파일` ("All files").
- "저장하지 않은 변경이 있습니다. 버리고 계속할까요?" ("There are unsaved changes. Discard them and continue?") is a native message box (title "Hallym MIPS Simulator").
  The button text follows the OS language (OK/Cancel on English Windows).

Captures: `report/probe/dialog-save.png` and `dialog-open.png` in the CI artifact `windows-report`;
the fixed set (`docs/screens/README.md`) is in `report/screens/`, and of those, `windows-frame.png` is brought into `docs/screens/`.

## What to check by hand

With the installer from the artifact `HallymMIPS-windows`. On **Korean Windows**, like the students' PCs, and if possible on a **non-administrator account**.

1. **Install (not administrator)** — double-click the installer. It must install without a UAC prompt appearing. A SmartScreen warning
   ("Windows의 PC 보호", "Windows protected your PC") may appear (not signed): "추가 정보 → 실행" ("More info → Run anyway").
2. **Start menu** — one "Hallym MIPS" entry is visible, and if 1.2.4 is installed, it can be told apart from "Hallym MIPS Simulator".
3. **Korean IME (Microsoft Korean IME)** — the IME's events are tested on every run (`tests/e2e/ime.e2e.ts`, 12 tests,
   CI included), and CI types 한글 + Enter through the real IME on the runner into the installed app
   (`tests/e2e/ime-real.e2e.ts`, passing); by hand, on Korean Windows:
   - Type `# 한글 주석입니다` ("# This is a Hangul comment") in the editor. Check that no character is entered twice or dropped.
   - Press Ctrl+S **in the middle of composing** a character. Check that the character being composed is saved intact too (reopen to check).
   - Check that Enter during composition, arrow keys during composition and the Han/Eng toggle behave naturally in the editor.
   - Console input: run a program of the `li $v0, 8` kind (read string) and type Hangul in the input box. Check that **Enter during composition
     does not send the line**, and that Enter after the character is committed does. Check that Hangul in the output is not garbled.
4. **File dialogs** — Ctrl+S (new file), Ctrl+O. How the buttons and type names look on Korean Windows.
   Save to and reopen from a Hangul folder and file name (`바탕 화면\과제\1주차.s`, i.e. "Desktop\Assignment\Week1.s"). Open an old `.s` file in CP949.
5. **Fonts** — check that register `$t0`, `CP0` and address `0x00400000` are in D2Coding (dotted 0) and that nothing shows as `0×`.
   Check that nothing is blurry or clipped at Windows scaling of 125% and 150%.
6. **Side by side with 1.2.4** — start both and run a program in each. Check that closing one leaves the other's settings (window position, recent files) unchanged.
7. **zip** — unpack it and run `HallymMIPS.exe`. Also in places whose path contains Hangul or spaces, like USB or network drives.
8. **Uninstall** — Settings → Apps → uninstall "Hallym MIPS 2.0.0". Check that the Start menu entry and install folder disappear and 1.2.4 remains.
9. **Window frame** — check that hovering over the maximize button shows snap layouts, double-clicking the bar maximizes and restores, dragging the bar moves the window,
   dragging it to the top of the screen maximizes it, and the edges are not clipped when maximized. At scaling of 125% and 150%, check the size of the window buttons, and that the app bar's buttons and file name
   do not slide under the window buttons.
10. **Left/right split** — check that at 1366×768, 125%, maximized, Editor and Run are shown side by side; dragging and collapsing the divider; and that when the window is snapped to half the screen
   it switches to Editor / Run tabs.

## After publishing

The workflow **Release check (2.x, as downloaded)** (`.github/workflows/release-check.yml`, run by hand with the
tag) downloads both files from the public release address, compares their SHA-256 with the release notes, installs
the setup on a clean runner, runs every e2e test against the installed app (the real Microsoft Korean IME included),
starts the unzipped program, and uninstalls.

## Rolling back 2.0.0

If 2.0.0 causes trouble in the labs, the release is taken back and 1.2.4 is the latest release again.
Everything links to `releases/latest` (the README, the user guide), so the links then give 1.2.4.

1. Turn the release back into a draft (its files stay, visible only to the maintainers):

   ```sh
   gh release edit v2.0.0 --repo ars2323/hallym-mips-simulator --draft
   ```

2. Delete the tag, on GitHub and locally:

   ```sh
   git push origin --delete v2.0.0
   git tag -d v2.0.0
   ```

3. Make sure 1.2.4 is the latest release, and check:

   ```sh
   gh release edit v1.2.4 --repo ars2323/hallym-mips-simulator --latest
   gh release list --repo ars2323/hallym-mips-simulator   # v1.2.4 marked Latest, no v2.0.0
   ```

   and open <https://github.com/ars2323/hallym-mips-simulator/releases/latest>: it must show 1.2.4.

4. Tell the students (in Korean; a notice for the course page):

   > Hallym MIPS 2.0.0 에 문제가 있어 잠시 이전 판 1.2.4("Hallym MIPS Simulator")로 돌아갑니다.
   > - 릴리스 페이지(<https://github.com/ars2323/hallym-mips-simulator/releases/latest>)에서 1.2.4 를 받아 설치하세요.
   >   사용법은 [1.x 사용법](https://github.com/ars2323/hallym-mips-simulator/blob/main/docs/GUIDE-ko.md)에 있습니다.
   > - 2.0.0 을 이미 설치했다면 그대로 두어도 되고, 지우려면 설정 → 앱 → 설치된 앱 → "Hallym MIPS 2.0.0" → 제거.
   >   둘은 따로 설치되며 서로 건드리지 않습니다.
   > - 저장한 `.s` 파일은 그대로 1.2.4 에서 열 수 있습니다. 두 판은 같은 시뮬레이터 코어를 쓰므로 같은 프로그램은
   >   같은 결과를 냅니다.

5. The fix goes out as a new version (2.0.1), not under the tag `v2.0.0` again: a student who downloaded 2.0.0 must
   be able to tell the two apart.

