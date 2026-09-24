# Windows — 확인한 것과 손으로 확인할 것

Windows 에서 돌려 본 것은 GitHub Actions 의 `windows-latest`(Windows Server 2025, 영문, 관리자 계정, 화면 1024×768)다.
워크플로: `.github/workflows/windows.yml`. 매 푸시마다 설치본과 zip 을 **아티팩트**로 올린다(태그·릴리스 없음).

| 파일 | 크기 |
|---|---|
| `HallymMIPS-2.0.0-alpha.1-win-x64-setup.exe` (NSIS, 사용자 단위) | 102.9 MB (107,914,059 바이트) |
| `HallymMIPS-2.0.0-alpha.1-win-x64.zip` (압축본) | 139.9 MB (146,689,276 바이트) |
| 설치된 크기 | 327 MB (Chromium 로캘은 한국어·영어만. 모두 두면 374 MB) |

### 설치된 327 MB 의 내용

| 크기 | 파일 | 무엇 |
|---|---|---|
| 234.6 MB | `HallymMIPS.exe` | Electron(Chromium + Node) 실행 파일 자체 |
| 24.6 MB + 1.4 MB | `dxcompiler.dll`, `dxil.dll` | Chromium 의 WebGPU(D3D12) 셰이더 컴파일러 |
| 19.5 MB | `LICENSES.chromium.html` | Chromium·Node 고지 — 배포에 필요 |
| 11.9 MB | `resources.pak` | Chromium 리소스 |
| 10.4 MB | `icudtl.dat` | 유니코드·한글 처리(ICU) |
| **6.6 MB** | `resources\app.asar` | **이 앱의 전부**: 글꼴 2.5 MB, 캐릭터 2.2 MB, 번들 JS 1.8 MB |
| 5.3 + 4.5 + 0.9 MB | `vk_swiftshader.dll`, `d3dcompiler_47.dll`, `vulkan-1.dll` | GPU 가 없을 때의 소프트웨어 렌더링, D3D |
| 3.0 MB | `ffmpeg.dll` | 미디어(Electron 이 시작할 때 연다) |

- asar 를 쓴다. 소스맵은 넣지 않는다. `node_modules` 는 없다(모두 번들). 이 셋은 이미 되어 있다.
- 이 앱의 몫은 2% 다. 나머지는 Electron 런타임이라 Qt판(100 MB 안팎)만큼 줄일 수는 없다.
- 쉽게 줄일 수 있는 것은 로캘뿐이었고 줄였다(−47 MB). 번들 압축(minify)은 1 MB 남짓이라 하지 않았다.
- 더 줄이려면 `dxcompiler.dll`·`dxil.dll`(26 MB, WebGPU 전용, 이 앱은 쓰지 않음)을 빼는 방법이 있다. Electron 배포본에서
  파일을 지우는 것은 지원되지 않는 방식이라, 여러 GPU 에서 확인하기 전에는 하지 않았다.

## 아홉 항목

| # | 항목 | 어떻게 | 결과 |
|---|---|---|---|
| 1 | utilityProcess — 띄우기, `.err` 로 죽이기, 다시 띄우기 | **자동**: 설치본으로 e2e `flows.e2e.ts` "the simulator process dies" | 통과 |
| 2 | 무한 루프 정지 → 레지스터 읽기 → 이어서 실행 | **자동**: 설치본 e2e "an endless loop", Node `process.test.ts` 1 | 통과 |
| 3 | 브레이크포인트 → 멈춤 → 이어서 | **자동**: 설치본 e2e "breakpoint", Node `run-control.test.ts` | 통과 |
| 4 | 콘솔 입력 되감기 (PC·`$v0`·`$f0`) | **자동**: Node `console-input.test.ts`(6개, `$f0` 포함), 설치본 e2e "console input" | 통과 |
| 5 | 코어 타이머 | **자동**(측정·실패 조건): `tools/probe-platform.ts --expect-no-leak`, `cp0-timer.test.ts` | 인터럽트 전용 — 교과목에는 안 쓰는 기능. 새던 핸들은 고쳤다(아래): 이제 +0 |
| 6 | 진짜 한글 IME | **수동** | CI 는 영문 Windows, IME 없음. CDP 흉내(`ime.e2e.ts`)는 Windows 설치본에서도 통과 |
| 7 | 파일 대화상자 | **자동 캡처** + 수동 확인 | 네이티브 Windows 11 대화상자. 아래 그림 |
| 8 | 폰트 | **자동**: `hex-mono.e2e.ts` 둘(글꼴이 실제로 `loaded`, 16진수·0 이 든 식별자는 D2Coding) + 네 장면 캡처 | 통과 |
| 9 | 1.2.4 와 나란히 | **자동**: `tools/windows/check-side-by-side.ps1` (실제 1.2.4 MSI) | 통과. 둘이 동시에 실행됨, 설정·시작 메뉴·폴더 안 겹침 |

그 밖에 CI 가 매번 확인하는 것:

- Node 테스트 전부(170개) — 프로세스 분리(fork), 정지, 브레이크포인트, 콘솔 입력, 모듈, Qt 골든
- e2e 15개 전부를 **설치된** `HallymMIPS.exe` 로 (asar, asar 밖의 애드온, 번들된 워커, 라이선스 파일)
- zip 을 풀어 `HallymMIPS.exe` 가 10초 넘게 살아 있는지, `LICENSE.txt`·`NOTICE.txt` 가 옆에 있는지
- 설치본 매니페스트가 `asInvoker`(관리자 권한 요청 없음)

### Windows 에서만 드러난 것

- **코어의 이름 표가 플랫폼마다 다르다.** `floor.w.s` 워드가 Windows 에서는 `prefx` 로, 리눅스에서는 `trunc.w.s` 가
  `suxc1` 로 보인다. `qsort` 의 동률 순서 차이(C 라이브러리마다 다름). 실행에는 영향 없음. `docs/PORTING.md` 7절.
- **코어 타이머의 핸들 누수 — 고쳤다.** `run_spim()` 마다 이름 붙은 타이머 핸들이 1개씩 샜다(실행 중 초당 364~850,
  F10 한 번에 1). 이름(`"SPIMTimer"`)은 세션 전체가 공유해 Qt판과 동시에 돌리면 한쪽 `Count` 가 멈출 수 있었다.
  Windows 에서만 `CPU/run.cpp` 를 `native/src/run-win.cpp` 로 감싸 컴파일해 **이름 없는 타이머 하나**를 재사용한다.
  고친 뒤: 실행 10초·F10 200번 동안 핸들 +0. CI 가 늘면 실패한다. `docs/PORTING.md` 14절.
- **설치 관리자가 자기 사본(111 MB)을 `%LOCALAPPDATA%\hallym-mips-simulator-updater` 에 남겼다**
  (electron-builder 가 자동 업데이트용으로). 업데이트 기능이 없으므로 설치 끝에 지운다(`packaging/installer.nsh`).
  CI 가 폴더가 없는지 확인한다.
- 테스트 둘이 Windows 경로에서 깨졌다(ESM `import` 에 드라이브 경로, 위 이름 표). 앱이 아니라 테스트의 문제였다.

### 1.2.4 와 나란히 — 확인한 것 (`check-side-by-side.ps1`)

| | Qt판 1.2.4 | 이 앱 | 결과 |
|---|---|---|---|
| 설치 폴더 | `C:\Program Files\Hallym MIPS Simulator` | `%LOCALAPPDATA%\Programs\hallym-mips-simulator` | 안 겹침 |
| 시작 메뉴 | `(모든 사용자) Hallym MIPS Simulator\Hallym MIPS Simulator` | `(이 사용자) Hallym MIPS Simulator 2` | 안 겹침 |
| 설정 | 레지스트리 `HKCU\Software\HallymMIPS` | `%APPDATA%\HallymMIPS2` | 이 앱의 설치·실행·e2e·제거 뒤 Qt 설정 그대로 |
| 제거 항목 | HKLM | HKCU `Hallym MIPS Simulator 2.0.0-alpha.1` | 제거 뒤 Qt 판은 그대로 설치돼 있음 |
| `.s` 연결 | 없음 | 없음 | `assoc .s` 그대로 |
| 동시 실행 | | | 둘 다 10초 동안 살아 있음 |

제거하면 설정 폴더(`%APPDATA%\HallymMIPS2`, 글자 크기와 진법 두 값)는 남는다. electron-builder 의 기본값이다.

### 파일 대화상자 (CI 화면 캡처, 영문 Windows)

- 저장: `Save As` — 파일 이름 `제목 없음`, 형식 `MIPS 어셈블리`. Qt판처럼 네이티브 대화상자다.
- 열기: `Open` — 형식 `MIPS 어셈블리`(`.s`, `.asm`) / `모든 파일`.
- "저장하지 않은 변경이 있습니다. 버리고 계속할까요?" 는 네이티브 메시지 상자다(제목 "Hallym MIPS Simulator").
  버튼 글자는 OS 언어를 따른다(영문 Windows 에서 OK/Cancel).

캡처: CI 아티팩트 `windows-report` 의 `report/probe/dialog-save.png`, `dialog-open.png`,
네 장면 × 세 크기는 `report/screens/`.

## 손으로 확인할 것

아티팩트 `HallymMIPS-windows` 의 설치본으로. 학생 PC 와 같은 **한국어 Windows**, 가능하면 **관리자가 아닌 계정**에서.

1. **설치(관리자 아님)** — 설치본을 더블클릭. UAC 창이 뜨지 않고 설치돼야 한다. SmartScreen 경고
   ("Windows의 PC 보호")가 뜰 수 있다(서명 없음): "추가 정보 → 실행".
2. **시작 메뉴** — "Hallym MIPS Simulator 2" 하나가 보이고, 1.2.4 가 깔려 있으면 "Hallym MIPS Simulator" 와 구별되는지.
3. **한글 IME (Microsoft 한국어 입력기)**
   - 편집기에 `# 한글 주석입니다` 를 친다. 글자가 두 번 들어가거나 빠지지 않는지.
   - 한 글자를 **조합하는 도중에** Ctrl+S. 조합 중이던 글자까지 온전히 저장되는지(다시 열어 확인).
   - 조합 중 Enter, 조합 중 방향키, 한/영 전환이 편집기에서 자연스러운지.
   - 콘솔 입력: `li $v0, 8` 류(문자열 읽기) 프로그램을 실행하고 입력 칸에 한글을 친다. **조합 중 Enter 는
     줄을 보내지 않고**, 확정 뒤 Enter 가 보내는지. 출력에 한글이 깨지지 않는지.
4. **파일 대화상자** — Ctrl+S(새 파일), Ctrl+O. 한국어 Windows 에서 버튼·형식 이름이 어떻게 보이는지.
   한글 폴더·파일 이름(`바탕 화면\과제\1주차.s`)으로 저장하고 다시 열기. CP949 로 된 옛 `.s` 파일 열기.
5. **폰트** — 레지스터 `$t0`, `CP0`, 주소 `0x00400000` 이 D2Coding(0 에 점)인지, `0×` 로 보이는 곳이 없는지.
   Windows 의 배율 125%·150% 에서 흐리거나 잘리는 곳이 없는지.
6. **1.2.4 와 나란히** — 둘 다 띄워 각각 프로그램을 실행. 한쪽을 닫아도 다른 쪽 설정(창 위치, 최근 파일)이 그대로인지.
7. **zip** — 압축을 풀어 `HallymMIPS.exe` 실행. USB·네트워크 드라이브처럼 경로에 한글·공백이 있는 곳에서도.
8. **제거** — 설정 → 앱 → "Hallym MIPS Simulator 2.0.0-alpha.1" 제거. 시작 메뉴·설치 폴더가 사라지고 1.2.4 는 남는지.
