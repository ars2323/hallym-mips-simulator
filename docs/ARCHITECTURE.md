# QtSpim 9.1.24 코드 구조 조사

PLAN 1단계 "코드 조사" 결과. 모든 항목은 `파일:줄` 근거를 단다.
줄 번호는 `vanilla-9.1.24` 기준이며, 이후 원본 파일을 수정하면 어긋날 수 있다.

조사에 쓴 방법:
- 소스 직접 읽기
- `CPU/`만으로 터미널 `spim`을 빌드해(§9) 실제 출력을 확인 — 본문에서 "실측"으로 표시

---

## 1. 큰 그림

```
main.cpp:43  QApplication + SpimView(QMainWindow) 한 개
             └ centralWidget : QTextEdit          ← 메시지/로그 (콘솔 아님)
             ├ IntRegDockWidget  : regTextEdit    (QPlainTextEdit)
             ├ FPRegDockWidget   : regTextEdit
             ├ TextSegDockWidget : textTextEdit   (QTextEdit)
             ├ DataSegDockWidget : dataTextEdit   (QPlainTextEdit)
             └ Console           : 별도 최상위 창 (QPlainTextEdit, 부모 0)
```
- 위젯 트리 근거: `QtSpim/spimview.ui:167-259`, 커스텀 위젯 선언은 같은 파일의 `<customwidgets>`.
- 콘솔은 메인 윈도우의 자식이 아니라 독립 창이다: `QtSpim/spimview.cpp:50` `SpimConsole = new Console(0)`, `QtSpim/console.cpp:36-44`.
- 네 개의 도크는 `win_Tile()`에서 `tabifyDockWidget`으로 두 쌍(Int/FP, Data/Text)이 탭으로 묶인다: `QtSpim/menu.cpp:693-711`.

### 1.1 PLAN과 다른 사실 ①

PLAN R4는 "중앙 탭에 Editor 추가 (기존 Text/Data 탭과 나란히)"라고 적었지만,
**Text/Data는 중앙 위젯의 탭이 아니라 도크 위젯**이고 중앙 위젯은 메시지 로그용 `QTextEdit` 하나다
(`QtSpim/spimview.ui:54`). 탭처럼 보이는 것은 `tabifyDockWidget`의 결과다.
→ 에디터는 (a) 새 도크 위젯, (b) 중앙 위젯을 `QTabWidget`으로 바꾸고 로그와 에디터를 탭으로,
(c) Text/Data와 같은 도크 그룹에 tabify 중 하나를 골라야 한다. 8절에 정리.

---

## 2. 세 패널의 렌더링 경로

세 패널 모두 **매 갱신마다 HTML 문자열을 통째로 만들어 위젯을 clear 후 재삽입**한다.
모델/뷰가 아니므로 행 선택·열 고정·셀 단위 하이라이트가 불가능하다. PLAN의 B안(모델+뷰 교체) 전제는 맞다.

| 패널 | 진입점 | 내용 생성 | 위젯 주입 |
|---|---|---|---|
| Int Regs | `SpimView::DisplayIntRegisters()` `QtSpim/regwin.cpp:49` | `formatSpecialIntRegister` / `formatIntRegister` (`regwin.cpp:88`,`95`) | `te->clear(); te->appendHtml(...)` `regwin.cpp:78-79` |
| FP Regs | `DisplayFPRegisters()` `regwin.cpp:120` | `formatSFPRegisters`/`formatDFPRegisters` `regwin.cpp:141`,`185` | `clear()+appendHtml()` `regwin.cpp:131-132` |
| Text Seg | `DisplayTextSegments(bool force)` `QtSpim/textwin.cpp:47` | `formatUserTextSeg`/`formatKernelTextSeg`→`formatInstructions` `textwin.cpp:63,72,85` | `clear()+insertHtml()` `textwin.cpp:52,57` |
| Data Seg | `DisplayDataSegments(bool force)` `QtSpim/datawin.cpp:53` | `formatUserDataSeg`/`formatUserStack`/`formatKernelDataSeg`→`formatMemoryContents` `datawin.cpp:72,81,91,102` | `clear()+appendHtml()` `datawin.cpp:64-65` |

공통 래퍼: `windowFormattingStart()/End()`가 `<span style='font-family:...'>`를 앞뒤로 붙인다
(`QtSpim/spimview.cpp:184-192`). 폰트/색은 설정값이지 스타일시트가 아니다.

스크롤 위치는 갱신 전후로 수동 보존한다(`regwin.cpp:55,84` 및 `126,134`, `datawin.cpp:59,67`).
Text 패널만 보존하지 않고 대신 `highlightInstruction(PC)`로 커서를 옮긴다(`textwin.cpp:58`).

### 2.1 갱신 시점

```
sim_SingleStep()      menu.cpp:290  → executeProgram(PC,1,...) → run_program()
                                     → highlightInstruction(PC)  menu.cpp:351
                                     → UpdateDataDisplay()       menu.cpp:295
sim_Run()             menu.cpp:265  → 10만 스텝 루프 + processEvents, 끝난 뒤 UpdateDataDisplay()
sim_Pause/Stop        menu.cpp:278,284 → UpdateDataDisplay()   menu.cpp:281,287
continueBreakpoint()  menu.cpp:377  → highlightInstruction + UpdateDataDisplay
sim_ReinitializeSimulator() menu.cpp:208 → DisplayTextSegments(true) + UpdateDataDisplay()
file_LoadFile()       menu.cpp:64   → DisplayTextSegments(true) + DisplayDataSegments(false)
설정/진법/표시토글 변경 menu.cpp:545-672 → 각 Display* 직접 호출
```

`UpdateDataDisplay()` (`QtSpim/spimview.cpp:234`):
```cpp
if (text_modified) DisplayTextSegments(true);
DisplayIntRegisters();
DisplayFPRegisters();
DisplayDataSegments(false);
```
- `text_modified` / `data_modified`는 코어 전역 플래그(`CPU/mem.h:45`, `CPU/mem.h:59`)로,
  `set_mem_*`에서 세워지고 `Display*`가 내려놓는다(`textwin.cpp:60`, `datawin.cpp:69`).
- **즉, Run 중에는 화면을 갱신하지 않고 끝난 뒤 한 번만 갱신한다.** 실행 중 하이라이트가 안 움직이는 이유.

### 2.2 "변경된 레지스터" 강조

이전 값은 `SpimView`의 `oldR[]`, `oldPC`, `oldEPC`, … 에 저장한다(`QtSpim/spimview.h:150-158`).
`DisplayIntRegisters()`가 그리면서 비교하고, 마지막에 `CaptureIntRegisters()`로 스냅샷을 갱신한다
(`regwin.cpp:85`, 구현 `regwin.cpp:103`).
→ **"직전 화면 갱신 대비" 변경이지 "직전 1스텝 대비"가 아니다.** Run 한 번이면 시작/끝 차이가 통째로 빨개진다.
PLAN R1의 "직전 스텝에서 값이 바뀐 레지스터 강조"를 그대로 구현하려면 스냅샷 시점을 우리가 다시 정의해야 한다(8절).

색은 `st_changedRegisterColor`(기본 `"red"`), 켜고 끄기는 `st_colorChangedRegisters`(기본 true).
둘 다 `QSettings`에만 있고 **설정 다이얼로그에 UI가 없다**(`QtSpim/state.cpp:60-61`에서 읽기만 함).

---

## 3. 코어 접근 경로

### 3.1 레지스터

| 대상 | 접근 | 근거 |
|---|---|---|
| 범용 32개 | `extern reg_word R[32]` | `CPU/reg.h:39-41` |
| 이름표 | `extern char *int_reg_names[32]` | `CPU/reg.h:66`, 실체 `CPU/display-utils.cpp:44-47` |
| HI/LO | `extern reg_word HI, LO` | `CPU/reg.h:43` |
| PC | `extern mem_addr PC, nPC` | `CPU/reg.h:45` |
| CP0 | `CPR[0][n]` 매크로 `CP0_BadVAddr/Status/Cause/EPC` | `CPU/reg.h:70,76,88,109,130` |
| FP 단정도 | `FPR_S(n)` = `FGR[n]` | `CPU/reg.h:157` |
| FP 배정도 | `FPR_D(n)` = `FPR[n/2]`, 홀수면 `run_error` | `CPU/reg.h:159-161` |
| FP 제어 | `FIR` = `CPR[1][0]`, `FCSR` = `CPR[1][31]` | `CPU/reg.h:183,192` |

`reg_word`는 `int32`(= `int`), 부호 있는 32비트(`CPU/reg.h:34`).

**이름 주의**: 코어 표는 `r0`, `s8`을 쓴다. PLAN R1의 그룹 표는 `$zero`, `$fp`를 쓴다.
`int_reg_names`를 그대로 쓰면 `$zero`/`$fp` 표기가 안 나온다 → `edu/core`에 표시용 별칭 표를 따로 둔다.

### 3.2 텍스트 세그먼트와 명령어

```
extern instruction **text_seg;    CPU/mem.h:43     TEXT_BOT   = 0x00400000   CPU/mem.h:47
extern mem_addr text_top;         CPU/mem.h:49
extern instruction **k_text_seg;  CPU/mem.h:89     K_TEXT_BOT = 0x80000000   CPU/mem.h:91
extern mem_addr k_text_top;       CPU/mem.h:93
instruction *read_mem_inst(mem_addr);   CPU/mem.h:140, 구현 CPU/mem.cpp:287
```
`read_mem_inst`는 범위 밖이거나 4의 배수가 아니면 `bad_text_read(addr)`를 호출한다(`CPU/mem.cpp:287-294`)
→ **우리 모델이 주소를 자유롭게 돌아다닐 때는 직접 경계 검사를 해야 한다.**
세그먼트 안에 아직 명령이 없으면 포인터가 `NULL`이고, 표시는 `<none>`이다(실측 §9).

`instruction` 구조체(`CPU/inst.h:56-82`)와 접근 매크로(`CPU/inst.h:84-139`):

| 필드 | 매크로 | 비고 |
|---|---|---|
| 내부 opcode | `OPCODE(i)` | `Y_*_OP` 토큰값. **기계어 opcode가 아니다** |
| rs / rt / rd / shamt | `RS RT RD SHAMT` | R형식 |
| imm | `IMM(i)` = `IOFFSET(i)` | `short`, 부호 있음 |
| 분기 변위 | `IDISP(i)` = `SIGN_EX(IOFFSET<<2)` | `CPU/inst.h:116` — 바이트 단위 |
| 점프 타깃 | `TARGET(i)` | 워드 단위 26비트 |
| 기계어 워드 | `ENCODING(i)` | `int32` |
| 심볼 참조 | `EXPR(i)` → `imm_expr{offset, symbol, bits, pc_relative}` | `CPU/inst.h:37-42` |
| 소스 줄 | `SOURCE(i)` | `"줄번호: 원문"` 문자열, **또는 NULL** |
| FP 별칭 | `FS=RD, FT=RT, FD=SHAMT` | `CPU/inst.h:96-106` |

### 3.3 명령어 인코딩/디코딩 — 오라클의 근거

| 함수 | 위치 | 용도 |
|---|---|---|
| `instruction *inst_decode(int32)` | `CPU/inst.cpp:1166` | 기계어 → `instruction` |
| `int32 inst_encode(instruction*)` | `CPU/inst.cpp:1045` | `instruction` → 기계어 |
| `void test_assembly(instruction*)` | `CPU/inst.cpp:1336` | 왕복 검사(`-DTEST_ASM`일 때 어셈블 중 호출) |
| `void format_an_inst(str_stream*, instruction*, mem_addr)` | `CPU/inst.cpp:571` | 디스어셈블 한 줄 |

명령어 표는 `CPU/op.h`의 `OP(name, i_opcode, type, a_opcode)` 매크로 목록이고,
`inst.cpp`에서 **세 번** 다른 `#define OP`로 include 해 세 테이블을 만든다:
- `name_tbl` (i_opcode → name, **형식 종류**) `CPU/inst.cpp:521-525`
- `i_opcode_tbl` (i_opcode → a_opcode) `CPU/inst.cpp:1030-1034`
- `a_opcode_tbl` (a_opcode → i_opcode) `CPU/inst.cpp:1153-1157`

형식 종류 상수는 `CPU/op.h:37-67`:
`BC/B1/I1s/I1t/I2/B2/I2a`(I형) · `R1s/R1d/R2st/R2ds/R2td/R2sh/R3/R3sh`(R형) ·
`FP_I2a/FP_R2ds/FP_R2ts/FP_CMP/FP_R3/FP_R4/FP_MOVC/MOVC` · `J_TYPE_INST` · `NOARG_TYPE_INST` ·
`ASM_DIR`/`PSEUDO_OP`(명령 아님, a_opcode = -1).

`inst_decode`의 a_opcode 조립 규칙(`CPU/inst.cpp:1167-1184`) — 우리 디코더의 형식 판정도 이 규칙을 따라야 한다:
```
a_opcode = val & 0xfc000000
 0x00000000 SPECIAL, 0x70000000 SPECIAL2 → |= val & 0x3f          (funct)
 0x04000000 REGIMM                       → |= val & 0x001f0000    (rt)
 0x40000000 COP0                         → |= (val&0x03e00000) | (val&0x1f)
 0x44000000 COP1                         → |= val & 0x03e00000, 그리고
                                            (val&0xff000000)==0x45000000 ? |= val&0x00010000 : |= val&0x3f
 0x48000000 / 0x4c000000 COPz            → |= val & 0x03e00000
표에 없으면 mk_r_inst(val,0,0,0,0,0)  ← opcode 0인 "무효 명령"
```

**PLAN R3의 타입 배지(R/I/J/FR/FI)는 `op.h`의 형식 종류를 그대로 쓰면 안 된다.**
`op.h`의 분류는 "피연산자 개수/배치"이지 기계어 형식이 아니다. 예:
- `R2sh_TYPE_INST`(`sll`)와 `R3_TYPE_INST`(`add`)는 둘 다 기계어로는 R형식
- `B2_TYPE_INST`(`beq`), `I2a_TYPE_INST`(`lw`)는 둘 다 I형식
- `FP_R3_TYPE_INST`(`add.s`)는 COP1 = green card의 FR형식, `FP_I2a_TYPE_INST`(`lwc1`)는 I형식(FI)

→ `op.h` 형식 종류 → {R,I,J,FR,FI} 매핑 표를 `edu/core`에 만들고,
그 표가 `op.h` 전체를 빠짐없이 덮는지(새 종류가 생기면 컴파일 에러)와
실제 인코딩 비트 배치와 모순되지 않는지를 오라클 테스트로 검증한다(4단계).

### 3.4 디스어셈블 출력 형식 (실측)

`format_an_inst`(`CPU/inst.cpp:571-724`) 출력 한 줄의 정확한 바이트 배치:

```
[0x00400024]\t0x34020004  ori $2, $0, 4                   ; 40: li $v0, 4       # syscall 4
0        1         2         3         4         5
012345678901234567890123456789012345678901234567890
```
| 오프셋 | 내용 |
|---|---|
| 0 | `[` |
| 1..2 | `0x` |
| 3..10 | 주소 8자리 hex |
| 11 | `]` |
| 12 | **TAB** |
| 13..14 | `0x` |
| 15..22 | 기계어 8자리 hex |
| 23..24 | 공백 2개 |
| 25.. | 니모닉 + 피연산자 |
| | `EXPR`에 심볼이 있으면 ` [심볼...]` (`CPU/inst.cpp:704-711`) |
| | `SOURCE`가 있으면 줄 시작에서 57칸째까지 공백 채우고 `; ` + 소스 (`CPU/inst.cpp:713-721`) |

실측(터미널 spim, `helloworld.s`):
```
[0x00400000]	0x8fa40000  lw $4, 0($29)                   ; 183: lw $a0 0($sp)		# argc
[0x00400024]	0x3c011234  lui $1, 4660                    ; 3: li $t0, 0x12345678
[0x00400028]	0x34285678  ori $8, $1, 22136
[0x0040002c]	0x0109082a  slt $1, $8, $9                  ; 4: blt $t0, $t1, target
[0x00400030]	0x14200002  bne $1, $0, 8 [target-0x00400030]
[0x00400014]	0x0c000000  jal 0x00000000 [main]           ; 188: jal main
[0x00400038]	<none>
```
- 피연산자의 레지스터는 **번호**로만 나온다(`$4`, `$29`). 이름은 코어가 안 준다.
- 분기의 셋째 인자는 `IDISP` = 바이트 변위(위 예의 `8`), raw imm이 아니다(`CPU/inst.cpp:618-619` 등, `IDISP` 정의는 `CPU/inst.h:116`).
- 점프는 `TARGET<<2`를 그대로 찍는다 — **PC 상위 4비트를 안 합친 값**이다(`CPU/inst.cpp:694`).
  그래서 미해결 심볼이 `jal 0x00000000 [main]`으로 보인다. 실제 목적지는 우리가 `(PC+4)[31:28] | (target<<2)`로 계산해야 한다.
- `sll $0,$0,0`(인코딩 0)은 `nop`으로 특수 표시된다(`CPU/inst.cpp:646-651`).

**소스 줄은 확장된 첫 명령에만 붙는다** (실측: `lui`에는 `; 3: li ...`, 이어지는 `ori`에는 없음).
원인은 `store_instruction`이 `SET_SOURCE(inst, source_line())`를 호출하는데(`CPU/inst.cpp:174`)
`source_line()`이 한 줄당 한 번만 문자열을 돌려주기 때문(`CPU/scanner.l:686-694`, `line_returned` 플래그).
→ **PLAN R3의 "pseudo 확장 묶음"은 `SOURCE(inst) != NULL`을 그룹 시작으로 보면 정확히 구현된다.** 추가 정보 불필요.

`SOURCE` 문자열 형식은 `"%d: %s"` = `"줄번호: 원문"` (`CPU/scanner.l:722`).

### 3.5 현재 Text 패널이 이 문자열을 쓰는 방식 (교체 대상)

`SpimView::formatInstructions` (`QtSpim/textwin.cpp:85-129`)는 `format_an_inst`의 출력을
**고정 오프셋 포인터 산술**로 잘라 쓴다:
```cpp
char* pc = ss_to_string(&ss);
char* binInst   = pc + 14;      // 3.4의 오프셋 14 = 'x'
char* disassembly = binInst + 11;   // = 25
pc += 3;  pc[8] = '\0';         // 주소
binInst += 1; binInst[8] = '\0';// 기계어
comment = strstr(disassembly, ";");
```
그래서 다음 세 가지가 파생 문제로 따라온다.

1. **브레이크포인트가 걸린 줄은 오프셋이 1 밀린다.**
   브레이크포인트는 테이블이 아니라 **메모리를 실제로 덮어쓴다**:
   `add_breakpoint` → `set_breakpoint` → `set_mem_inst(addr, break_inst)` (`CPU/spim-utils.cpp:330-346`, `CPU/inst.cpp:871-882`).
   `format_an_inst`는 `inst_is_breakpoint(addr)`이면 `*`를 찍고 원본을 복원해 재귀 호출한다(`CPU/inst.cpp:575-581`).
   따라서 줄이 `*[0x...]`로 시작해 위의 고정 오프셋이 전부 1씩 어긋난다.
   *(코드 분석 근거. GUI에서 눈으로 재현하지는 않았다 — 5단계에서 확인할 것.)*
2. 주석 판정이 `strstr(disassembly, ";")` — 소스 줄 안에 `;`가 있으면 오작동한다.
3. `nnbsp(25 - strlen(disassembly))`는 25자를 넘는 디스어셈블에서 음수 → 공백 0개, 정렬이 깨진다.

→ 새 Text 패널은 **문자열을 파싱하지 않고** `read_mem_inst()`가 준 `instruction*`에서 직접 필드를 읽는다.
단, 브레이크포인트가 걸린 주소에서는 `read_mem_inst()`가 **break 명령**을 돌려주므로
`inst_is_breakpoint(addr)` 확인 후 원본을 얻는 경로가 필요하다(코어와 같은 delete→read→add 방식).

### 3.6 메모리

| 세그먼트 | 배열 | 하한 | 상한 |
|---|---|---|---|
| user data | `data_seg` / `data_seg_h` / `data_seg_b` | `DATA_BOT 0x10000000` `CPU/mem.h:67` | `data_top` `CPU/mem.h:69` |
| stack | `stack_seg` / `_h` / `_b` | `stack_bot` `CPU/mem.h:81` | `STACK_TOP 0x80000000` `CPU/mem.h:85` |
| kernel data | `k_data_seg` / `_h` / `_b` | `K_DATA_BOT 0x90000000` `CPU/mem.h:101` | `k_data_top` `CPU/mem.h:103` |
| memory-mapped IO | — | `0xffff0000` | `0xffffffff` `CPU/mem.h:108-109` |

읽기: `read_mem_word/half/byte` (`CPU/mem.cpp:318,307,296`), 쓰기: `set_mem_word/half/byte` (`CPU/mem.cpp:363,…`).
범위를 벗어나면 `bad_mem_read`로 예외를 올린다 → **네비게이션 전에 경계 검사 필수.**

**바이트 순서**: `data_seg_b`는 `data_seg`와 같은 버퍼의 `signed char*` 별칭이다(`CPU/mem.h:63-65`).
SPIM은 호스트의 엔디안을 그대로 시뮬레이션한다(`CPU/spim.h:38-44`: 다른 엔디안 시뮬레이션 불가).
따라서 `read_mem_byte(a)`를 주소 오름차순으로 읽으면 **실제 메모리 바이트 순서**가 나온다.
기존 ASCII 열도 그렇게 만든다(`QtSpim/datawin.cpp:164-193`) → PLAN R5의 요구와 일치. 그대로 쓰면 된다.
`read_mem_byte`는 `signed char`를 반환하므로 0x80 이상은 음수 → 기존 `formatChar`는 `.`로 찍는다(`datawin.cpp:223-238`).

### 3.7 심볼 테이블 — 제약 있음

`CPU/sym-tbl.h`가 내보내는 것:
```
mem_addr find_symbol_address(char *name);   // 구현 CPU/sym-tbl.cpp:360
label   *label_is_defined(char *name);      //         CPU/sym-tbl.cpp:122  (읽기 전용)
label   *lookup_label(char *name);          //         CPU/sym-tbl.cpp:134  (없으면 만든다! 부작용)
void     print_symbols();                   //         CPU/sym-tbl.cpp:371
```
**해시 테이블 자체는 static이다**: `static label *label_hash_table[8191]` `CPU/sym-tbl.cpp:62,66`.
→ **주소 → 라벨 역방향 조회나 전체 순회 API가 없다.** `find_symbol_address`는 내부적으로
`lookup_label`을 쓰므로 없는 이름을 조회하면 **빈 라벨을 테이블에 남긴다**(`sym-tbl.cpp:360-366`). 쓰지 말 것.

우회 방법 두 가지 (둘 다 `CPU/` 수정 불필요):
- **분기/점프 목적지 라벨 (R3)**: 심볼 테이블이 아예 필요 없다. 명령어 자신이 들고 있다 —
  `EXPR(inst)->symbol->name` (`CPU/inst.h:39`, 코어도 이렇게 찍는다 `CPU/inst.cpp:704-711`).
- **`.data` 라벨 (R5)**: `print_symbols()`가 `"%s%s at 0x%08x\n"`(`g\t` 또는 `\t` 접두)로
  `write_output(message_out, …)`에 쓴다. `write_output`의 **구현은 우리 쪽**
  (`QtSpim/spim_support.cpp:129-141`)이므로, 거기에 캡처 스위치를 달고 `print_symbols()`를 호출해
  주소→라벨 표를 만들면 된다. `CPU/` 불변, `// EDU:` 주석 대상.

> **6단계에서 확인한 제약 — `print_symbols()`만으로는 부족하다.** 코어는 파일 하나를 다 읽으면
> `flush_local_labels()`로 그 파일의 **로컬(비-`.globl`) 라벨을 해시 테이블에서 뺀다**
> (`CPU/spim-utils.cpp:184`, `CPU/sym-tbl.cpp:334-355`). 그래서 로드가 끝난 뒤의 `print_symbols()`에는
> `main`, `__start`, `.extern` 같은 **전역 라벨만** 나온다 — 학생 코드의 `msg:` 같은 `.data` 라벨은 대부분 로컬이다.
> 라벨 구조체 자체는 해제되지 않고(명령어의 `EXPR(inst)->symbol`이 계속 가리킨다 — `sym-tbl.cpp:350` 주석),
> 그래서 **명령어가 참조하는 라벨**은 텍스트 세그먼트를 훑어 이름·주소를 얻을 수 있다. Data 패널은 두 출처를 합친다(§15.2).
> 코드가 한 번도 참조하지 않는 로컬 `.data` 라벨은 `CPU/` 수정 없이는 얻을 방법이 없다.

`label` 구조체는 공개되어 있다(`CPU/sym-tbl.h:34-51`): `name`, `addr`, `global_flag`, `gp_flag`, `const_flag`.

### 3.8 실행

```
bool run_program(pc, steps, display, cont_bkpt, bool *continuable)   CPU/spim-utils.h:60, 구현 CPU/spim-utils.cpp:293
  → 브레이크포인트에서 이어가기면 delete→run 1스텝→add
  → run_spim(pc, steps, display)                                     CPU/run.h:36
  → 반환 true = 브레이크포인트 도달 (CP0_ExCode == ExcCode_Bp)
extern bool force_break;   // 중단 요청. sim_Pause/sim_Stop이 세운다  QtSpim/menu.cpp:278,284
```
GUI는 `executeProgram()`(`QtSpim/menu.cpp:345`)에서 감싸고, 브레이크포인트에 걸리면
`BreakpointDialog`를 띄운다(`menu.cpp:353-371`).

### 3.9 코어 헤더에는 include guard가 없다

`CPU/*.h` 14개 전부(`mem.h scanner.h inst.h reg.h op.h parser.h syscall.h
spim-syscall.h run.h data.h sym-tbl.h version.h spim-utils.h string-stream.h`)에
`#ifndef` 가드도 `#pragma once`도 없다. 중복 include하면 `typedef` 재정의로 컴파일 에러가 난다.

`QtSpim/spimview.h:45-52`가 `spim.h`, `string-stream.h`, `spim-utils.h`, `inst.h`,
`reg.h`, `mem.h`, `sym-tbl.h`, `version.h`를 이미 include한다.
→ **`edu/`의 새 파일에서 `spimview.h`를 include했다면 코어 헤더를 또 include하지 말 것.**
(`QtSpim/edu/edu_devtools.cpp`에서 실제로 부딪혔다.)

### 3.10 GUI와 터미널 spim의 스택 초기화가 다르다

같은 프로그램을 같은 코어로 돌려도 **`$sp`, `$a1`, `$a2`는 두 프런트엔드에서 다르다.**

| | 호출 | 위치 |
|---|---|---|
| 터미널 spim | `initialize_run_stack(argc, argv)` | `spim/spim.cpp:271` |
| QtSpim | `initialize_stack(st_recentFiles[0] + " " + st_commandLine)` | `QtSpim/menu.cpp:309-314` |

argv 내용이 다르므로 스택 위에 쌓이는 문자열 길이가 달라지고, 그만큼 `$sp`가 밀린다.
실측(helloworld.s 실행 후):

```
터미널 spim : R5 (a1) = 2147479804   R6 (a2) = 2147479808   R29 (sp) = 2147479800
QtSpim-Edu  : R5 (a1) = 2147479680   R6 (a2) = 2147479684   R29 (sp) = 2147479676
```

→ 회귀 비교에서 **레지스터 덤프를 통째로 비교하면 안 된다.** `tools/regress.sh`가
콘솔 출력(프로그램 자신의 출력)을 비교하는 이유.

**프로세스 환경변수도 스택에 올라간다.** `initialize_stack()`이 argv 뒤에 envp를 복사하므로
(Data 패널의 User Stack 끝에서 `PATH=...` 같은 문자열이 그대로 보인다), 같은 바이너리라도
환경변수가 다르면 `$sp`/`$a1`/`$a2`가 달라진다. 3단계에서 로그 저장 골든 파일이 재현되지 않아
알게 됐다 → `tools/capture-goldens.sh`와 `regress.sh` 4번 검사는 `env -i` + 고정 변수 3개로 돌린다.
(PLAN R5의 "argv/환경변수 영역 기본 접힘" 결정의 근거이기도 하다: 학생의 사용자명·경로가 거기 있다.)

---

## 4. 어셈블 에러 메시지 형식과 출력 경로

```
yyerror(s)   CPU/parser.y:2941  → parse_error_occurred = true; clear_labels(); yywarn(s)
yywarn(s)    CPU/parser.y:2950  → error("spim: (parser) %s on line %d of file %s\n%s",
                                        s, line_no, input_file_name, erroneous_line())
erroneous_line()  CPU/scanner.l:545  → 소스 줄 + 스캐너가 멈춘 위치를 가리키는 캐럿
```
실측(`Tests/tt.alu.bare.s`, 탭은 `→`로 표시):
```
spim: (parser) immediate value (65432) out of range (-32768 .. 32767) on line 414 of file Tests/tt.alu.bare.s
→  addi $4 $0 0xff98
→                   ^
```
- 1행: `spim: (parser) ` + 메시지 + ` on line ` + **줄 번호** + ` of file ` + **경로**
- 2행: 탭 + 공백 2개 + 소스 줄 원문
- 3행: 탭 + 공백 2개 + `prefix_length`개의 공백 + `^` (`CPU/scanner.l:588-591`)

**주의**: 이 `erroneous_line()`은 명령어에 붙는 주석을 만드는 `source_line()`
(`CPU/scanner.l:687`, 형식 `"줄번호: 원문"`, §3.4)과 **다른 함수다.** 이름이 비슷해 헷갈리기 쉽다.
`error()`의 구현은 우리 쪽 `QtSpim/spim_support.cpp:60-69` →
`Window->Error(buf, /*fatal=*/0)` → `QtSpim/spimview.cpp:268`:
1. `WriteOutput(message)` — 중앙 로그 `QTextEdit`에 HTML로 추가
2. `QMessageBox::information(...)` — **모달 대화상자**. `Abort`를 고르면 `force_break = true`

→ **7단계(에디터)의 "에러 줄로 이동"은 `error()`를 가로채 `on line (\d+) of file (.*)` 를 뽑으면 된다.**
`CPU/` 수정 불필요. 다만 파일마다 에러가 날 때마다 모달이 뜨는 현재 동작은 그대로 둘지 결정 필요(8절).

`error()`/`run_error()`/`fatal_error()` 셋 다 같은 경로. `fatal_error`만 `SaveStateAndExit(1)`.
버퍼는 고정 10000바이트(`spim_support.cpp:56`, `BIG_BUF_SIZE`).

**에러 하나당 모달 하나**다. 어셈블 중에도, 실행 중에도 뜬다.
`Tests/tt.alu.bare.s`를 로드하면 파서 에러만 11개 → 모달 11번.
헤드리스로 돌리려면 이 대화상자를 대신 눌러 줘야 한다
(`QtSpim/edu/edu_devtools.cpp`의 `dismissBlockingDialog()`가 그 일을 한다).

`WriteOutput`(`QtSpim/spimview.cpp:250`)은 `\n`→`<br>`, 공백→`&nbsp;`만 치환하고
**`<`, `>`, `&`는 이스케이프하지 않은 채** `QTextEdit::append()`에 HTML로 넘긴다.
소스 줄에 `<`가 있으면 로그에서 사라진다. 7단계에서 에러를 에디터에 표시할 때 주의.

---

## 5. 파일 경로 인코딩 (한글 경로)

QString → 코어(`char*`)로 넘어가는 지점은 **전부 `toLocal8Bit()`** 이다:

| 위치 | 호출 |
|---|---|
| `QtSpim/menu.cpp:76` | `read_assembly_file(file.toLocal8Bit().data())` |
| `QtSpim/main.cpp:70` | `read_assembly_file(fileNames[i].toLocal8Bit().data())` |
| `QtSpim/spimview.cpp:214,218` | `initialize_world(... .toLocal8Bit().data(), …)` |
| `QtSpim/menu.cpp:313` | `initialize_stack((recent + " " + args).toLocal8Bit().data())` |

코어는 `fopen(name, "rt")`로 연다(`CPU/spim-utils.cpp:171`).

- **Linux**: 로케일이 UTF-8이면 `toLocal8Bit()` = UTF-8, `fopen`도 바이트 그대로 → 한글 경로 OK.
- **Windows**: `toLocal8Bit()`은 **ANSI 코드페이지**(한국어 Windows는 CP949)로 변환하고,
  MSVC의 `fopen`은 ANSI 경로를 받으므로 **CP949로 표현 가능한 한글 경로는 동작한다.**
  CP949에 없는 문자(일부 한자·이모지·다른 언어 문자)가 경로에 있으면 실패한다.
- 완전한 해결은 `_wfopen`이 필요하고 그건 `CPU/` 수정이다 → **하지 않는다.**
  대신 2단계에서 **감지·경고**를 넣었다: `QtSpim/edu/core/edu_path_encoding.*`(코덱 왕복으로 손실 판정, 단위 테스트)와
  `QtSpim/edu/edu_path_check.*`(경고 대화상자). 위 표의 세 지점(File > Load, 명령줄 파일, 예외 핸들러 경로) 앞에서
  `edu::confirmPathLoadable()`을 부르고, 손실이 있으면 로드를 건너뛴다.
  Linux(UTF-8)에서는 절대 안 뜨므로 개발 빌드의 `--local-codec`으로 인코딩을 가장해 검사한다(`tools/check-path-warning.sh`).
- `initialize_stack`에 넘기는 문자열은 **argv[0]로 프로그램에 들어간다**. 한글 경로면 MIPS 쪽에서
  CP949/UTF-8 바이트열로 보인다. 원본과 같은 동작이므로 건드리지 않는다.

콘솔 입력은 `QChar::toLatin1()`로 1바이트로 깎는다(`QtSpim/spim_support.cpp:96`) → 한글 입력 불가. 원본 동작.

---

## 6. 보존 기능 표

원본의 메뉴·툴바·우클릭·다이얼로그 전체. 새 UI에서 **전부 동작해야 한다.**
근거는 `QtSpim/spimview.ui`(액션 정의·배치)와 `QtSpim/spimview.cpp:85-182`(wireCommands).

### 6.1 메뉴 바

| 메뉴 | 항목 | 액션 이름 | 단축키 | 체크 | 슬롯 |
|---|---|---|---|---|---|
| File | Load File | `action_File_Load` | — | | `file_LoadFile` `menu.cpp:64` |
| File | Recent Files ▸ | `menuRecent_Files` | — | | 동적 생성 `rebuildRecentFilesMenu` `menu.cpp:91` |
| File | Reinitialize and Load File | `action_File_Reload` | — | | `file_ReloadFile` `menu.cpp:86` |
| File | Save Log File | `action_File_SaveLog` | — | | `file_SaveLogFile` `menu.cpp:101` |
| File | Print | `action_File_Print` | — | | `file_Print` `menu.cpp:151` |
| File | Exit | `action_File_Exit` | — | | `file_Exit` `menu.cpp:186` |
| Simulator | Clear Registers | `action_Sim_ClearRegisters` | — | | `sim_ClearRegisters` `menu.cpp:201` |
| Simulator | Reinitialize Simulator | `action_Sim_Reinitialize` | — | | `sim_ReinitializeSimulator` `menu.cpp:208` |
| Simulator | Run Parameters | `action_Sim_SetRunParameters` | — | | `sim_SetRunParameters` `menu.cpp:244` |
| Simulator | Run/Continue | `action_Sim_Run` | **F5** | | `sim_Run` `menu.cpp:265` |
| Simulator | Pause | `action_Sim_Pause` | — | | `sim_Pause` `menu.cpp:278` |
| Simulator | Stop | `action_Sim_Stop` | **Shift-F5** | | `sim_Stop` `menu.cpp:284` |
| Simulator | Single Step | `action_Sim_SingleStep` | **F10** | | `sim_SingleStep` `menu.cpp:290` |
| Simulator | Display Symbols | `action_Sim_DisplaySymbols` | — | | `sim_DisplaySymbols` `menu.cpp:397` |
| Simulator | Settings | `action_Sim_Settings` | — | | `sim_Settings` `menu.cpp:402` |
| **Registers** | **Binary** | `action_Reg_DisplayBinary` | — | ✔ | `reg_DisplayBinary` `menu.cpp:545` |
| **Registers** | **Hex** | `action_Reg_DisplayHex` | — | ✔ | `reg_DisplayHex` `menu.cpp:559` |
| **Registers** | **Decimal** | `action_Reg_DisplayDecimal` | — | ✔ | `reg_DisplayDecimal` `menu.cpp:552` |
| Text Segment | User Text | `action_Text_DisplayUserText` | — | ✔ | `text_DisplayUserText` `menu.cpp:600` |
| Text Segment | Kernel Text | `action_Text_DisplayKernelText` | — | ✔ | `text_DisplayKernelText` `menu.cpp:607` |
| Text Segment | Comments | `action_Text_DisplayComments` | — | ✔ | `text_DisplayComments` `menu.cpp:614` |
| Text Segment | Instruction Value | `action_Text_DisplayInstructionValue` | — | ✔ | `text_DisplayInstructionValue` `menu.cpp:621` |
| Data Segment | User Data | `action_Data_DisplayUserData` | — | ✔ | `data_DisplayUserData` `menu.cpp:632` |
| Data Segment | User Stack | `action_Data_DisplayUserStack` | — | ✔ | `data_DisplayUserStack` `menu.cpp:637` |
| Data Segment | Kernel Data | `action_Data_DisplayKernelData` | — | ✔ | `data_DisplayKernelData` `menu.cpp:642` |
| Data Segment | Binary / Hex / Decimal | `action_Data_Display{Binary,Hex,Decimal}` | — | ✔ | `menu.cpp:647,659,653` |
| Window | Integer Registers | `action_Win_IntRegisters` | — | ✔ | `win_IntRegisters` `menu.cpp:683` |
| Window | FP Registers | `action_Win_FPRegisters` | — | ✔ | `win_FPRegisters` `menu.cpp:685` |
| Window | Text Segment | `action_Win_TextSegment` | — | ✔ | `win_TextSegment` `menu.cpp:687` |
| Window | Data Segment | `action_Win_DataSegment` | — | ✔ | `win_DataSegment` `menu.cpp:689` |
| Window | Console | `action_Win_Console` | — | ✔ | `win_Console` `menu.cpp:691` |
| Window | Tile | `action_Win_Tile` | — | | `win_Tile` `menu.cpp:693` |
| Window | Restore to default | `action_Win_Restore` | — | | `win_Restore` `state.cpp:209` |
| Help | View Help | `action_Help_ViewHelp` | — | | `help_ViewHelp` `menu.cpp:714` |
| Help | About QtSpim | `action_Help_AboutSPIM` | — | | `help_AboutSPIM` `menu.cpp:757` |

> PLAN R2의 "원본의 Registers 메뉴 진법 옵션이 있다면"에 대한 답: **있다.**
> Binary/Hex/Decimal 3개, 배타적 체크, `st_regDisplayBase`(2/10/16)에 저장되고 설정에 남는다.
> Data Segment 메뉴에도 같은 3개가 따로 있다(`st_dataSegmentDisplayBase`).

### 6.2 툴바 (`spimview.ui`의 `toolBar`)

Load File · Reinitialize and Load File ∣ Save Log File · Print ∣ Clear Registers · Reinitialize Simulator ∣
Run/Continue · Pause · Stop · Single Step ∣ View Help — 전부 메뉴 액션과 동일 객체.
아이콘은 `:/icons/*` (`QtSpim/windows_images.qrc`).

### 6.3 우클릭(컨텍스트) 메뉴

| 위젯 | 항목 | 구현 |
|---|---|---|
| IntRegTextEdit / FPRegTextEdit | 표준 편집 메뉴 ∣ Binary · Decimal · Hex ∣ **Change Register Contents** | `regTextEdit::contextMenuEvent` `regwin.cpp:291` → `changeValue()` `regwin.cpp:306` |
| TextSegmentTextEdit | 표준 편집 메뉴 ∣ **Set Breakpoint** · **Clear Breakpoint** | `textTextEdit::contextMenuEvent` `textwin.cpp:171` → `setBreakpoint()` `textwin.cpp:181`, `clearBreakpoint()` `textwin.cpp:193` |
| DataSegmentTextEdit | 표준 편집 메뉴 ∣ Binary · Decimal · Hex ∣ **Change Memory Contents** | `dataTextEdit::contextMenuEvent` `datawin.cpp:255` → `changeValue()` `datawin.cpp:270` |

세 곳 모두 **클릭 좌표 → 텍스트 줄 → 정규식**으로 대상을 알아낸다
(`regwin.cpp:428` `strAtPos`, `textwin.cpp:206` `pcFromPos`, `datawin.cpp:299` `addrFromPos`).
`addrFromPos`는 줄 안에서 마우스 x위치로 몇 번째 워드인지까지 센다(`datawin.cpp:317-334`).
→ 모델/뷰로 바꾸면 이 로직은 전부 **인덱스 기반으로 단순해진다.** 동작은 보존, 구현은 폐기.

레지스터 값 변경이 인식하는 대상(`regwin.cpp:306-398`):
`R<n>` · `FG<n>` · `FP<n>` · `PC` · `EPC` · `Cause` · `BadVAddr` · `Status` · `HI` · `LO` · `FIR` · `FCSR`.
입력 진법은 대화상자의 hex/decimal 라디오로 고르고, 초기값은 현재 표시 진법.

### 6.4 다이얼로그

| .ui | 클래스 | 제목 | 띄우는 곳 |
|---|---|---|---|
| `breakpoint.ui` | `BreakpointDialog` | Breakpoint | `menu.cpp:353-371` — Continue / Single Step / Abort |
| `changevalue.ui` | `ChangeValueDialog` | Change Value | `promptForNewValue` `regwin.cpp:445` — 값 입력 + hex/dec 라디오 |
| `printwindows.ui` | `PrintWindowsDialog` | Print Windows | `file_Print` `menu.cpp:151` — Regs/Text/Data/Console 체크 |
| `runparams.ui` | `SetRunParametersDialog` | Set Run Parameters | `sim_SetRunParameters` `menu.cpp:244` — 시작 주소, 실행 인자 |
| `savelogfile.ui` | `SaveLogFileDialog` | Save Windows To Log File | `file_SaveLogFile` `menu.cpp:101` — Regs/Text/Data/Console 체크 + 경로 |
| `settings.ui` | `SettingDialog` | QtSpim Settings | `sim_Settings` `menu.cpp:402` — 아래 참조 |
| — | `QMessageBox` | About QtSpim | `help_AboutSPIM` `menu.cpp:757` |
| — | `QFileDialog` | Open Assembly Code | `file_LoadFile` `menu.cpp:71`, 필터 `Assembly (*.a *.s *.asm);;Text files (*.txt)` |
| — | `QPrintDialog` | Print Windows | `menu.cpp:163` |
| — | `QFontDialog`/`QColorDialog` | — | 설정 다이얼로그 안 |

Settings 다이얼로그 내용(`QtSpim/settings.ui`, 처리 `menu.cpp:402-541`):
- 탭 1 *MIPS*: Bare Machine · Accept Pseudo Instructions · Delayed Branches · Delayed Loads · Mapped IO,
  프리셋 버튼 Simple / Bare, 예외 핸들러 로드 체크 + 파일 경로 + 찾아보기 + 기본값 복원
- 탭 2 *QtSpim*: Recent files 개수(1~20, 벗어나면 4로), Quiet,
  Register window 폰트/글자색/배경색, Text window 폰트/글자색/배경색

**Data window 폰트 설정은 없다** — Data 패널은 Text window 설정을 함께 쓴다(`datawin.cpp:57-58`).

### 6.5 인쇄 / 로그 저장이 읽는 것

둘 다 **위젯에서 직접** 가져간다:
- 로그 저장: `findChild<…>("IntRegTextEdit")->toPlainText()` 등 (`menu.cpp:124-143`)
- 인쇄: `findChild<…>("IntRegTextEdit")->print(&printer)` 등 (`menu.cpp:167-180`)

(3단계 이후 Int Regs는 `SpimView::intRegistersLogText()`/`printIntRegisters()`를 거친다 — §11.)
(6단계 이후 Data는 `SpimView::dataSegmentLogText()`/`printDataSegment()`를 거친다 — §15.5. 우클릭 메뉴의 진법·Change Memory Contents는 `EduDataView`가 제공한다.)
(5단계 이후 Text는 `SpimView::textSegmentLogText()`/`printTextSegment()`를 거친다 — §14.4. 우클릭 메뉴의 Set/Clear Breakpoint는 `EduTextView`가 제공한다.)

→ **위젯을 `QTreeView`/`QTableView`로 바꾸면 이 두 기능이 그대로는 깨진다.**
`QTableView`에는 `toPlainText()`도 `print()`도 없다. 3·5·6단계에서 각 패널을 바꿀 때
모델에서 텍스트/문서를 생성하는 함수를 같이 만들어야 한다(8절).

또한 현재 저장/인쇄 결과는 화면의 `&nbsp;` 정렬을 포함한 평문이다.
새 구현에서 **열 정렬이 유지되는 평문**을 만들어야 원본과 비슷한 결과가 나온다.

### 6.6 설정 (`QSettings`, 조직 `LarusStone` / 앱 `QtSpim`)

읽기 `QtSpim/state.cpp:44-138`, 쓰기 `state.cpp:140-205`.

| 그룹 | 키 | 기본값 |
|---|---|---|
| MainWin | Geometry, WindowState | — |
| RegWin | ColorChangedRegs / ChangedRegColor / RegisterDisplayBase / Font / FontColor / BackgroundColor | true / "red" / 16 / Courier 10 / black / white |
| TextWin | ShowUserTextSeg / ShowKernelTextSeg / ShowTextComments / ShowInstDisassembly / Font / FontColor / BackgroundColor | 전부 true / Courier 10 / black / white |
| DataWin | ShowUserDataSeg / ShowUserStackSeg / ShowKernelDataSeg / DataSegmentDisplayBase | true / true / true / 16 |
| FileMenu | RecentFilesLength, RecentFile\<i\> | 4 |
| Spim | Quiet / BareMachine / AcceptPseudoInsts / DelayedBranches / DelayedLoads / MappedIO / LoadExceptionHandler / ExceptionHandlerFileName / StartingAddress / CommandLineArguments | false/false/true/false/false/false/true/`<<SPIM Exception Handler>>`/`starting_address()`/"" |

**원본 버그 둘** (고치지 않는다. 브랜딩으로 설정 경로가 어차피 갈라진다):
- 실행 인자는 `"CommandLineArguments"`로 읽고 `"CommandLine"`으로 쓴다(`state.cpp:136` vs `state.cpp:200`)
  → **Run Parameters의 인자가 재시작하면 사라진다.**
- 최근 파일 키가 `"RecentFile" + QString(i)`(`state.cpp:114`, `state.cpp:181,183`).
  `QString(int)`은 `QChar(i)` 한 글자라서 키가 `RecentFile\0`, `RecentFile\1` …이 된다. 동작은 한다.

`InitializeWorld()`(`spimview.cpp:194`)는 기본 예외 핸들러를 리소스 `:exceptions.s`에서
`QTemporaryFile`로 풀어서 `initialize_world()`에 넘긴다(`spimview.cpp:209-215`).

---

## 7. 헬프

- 메뉴 → `help_ViewHelp()` `QtSpim/menu.cpp:714`.
- 외부 프로세스 `assistant`를 `-collectionFile <경로>`로 띄운다.
- 경로는 **설치 위치 하드코딩**(`menu.cpp:718-724`):
  - Windows `%PROGRAMFILES(x86)%/QtSpim/help/qtspim.qhc` + `assistant`(PATH)
  - macOS `/Applications/QtSpim.app/Contents/Resources/doc/qtspim.qhc` + 앱 번들 안 Assistant
  - Linux `/usr/lib/qtspim/help/qtspim.qhc` + `/usr/lib/qtspim/bin/assistant`
- 없으면 "Cannot find QtSpim help file. Check installation." 메시지박스.
- **따라서 설치하지 않은 개발 빌드에서는 원본도 헬프가 안 열린다.** 0단계 보고 참조.
- 2단계에서 후보를 하나 추가했다: `<실행 파일 폴더>/help/qtspim.qhc`, 브라우저는
  `<실행 파일 폴더>/assistant(.exe)`가 있으면 그것, 없으면 PATH의 `assistant`.
  처음엔 원본 세 후보 뒤에 두었다가 2단계 체크포인트 결정으로 **맨 앞**으로 옮겼다:
  배포물은 자기 안에서 완결돼야 하고, 표준 QtSpim의 설치 폴더에 의존하면 그쪽이 삭제·갱신될 때
  조용히 깨지기 때문이다. 이것이 원본 동작과 다른 유일한 지점이다(표준 QtSpim이 설치된 PC에서도
  우리 헬프가 열린다). zip을 풀어 실행한 경우와 Linux 개발 빌드
  (`build/help/qtspim.qhc` + `/usr/bin/assistant`)에서 헬프가 열린다.
- Windows에서 원본이 `"assistant"`라는 이름만으로 헬프 브라우저를 찾는 이유: `CreateProcess`는
  **실행 파일이 있는 폴더를 PATH보다 먼저** 뒤진다. 설치 폴더에 `assistant.exe`를 같이 넣는 것으로 충분하다
  (`bin/release-win:23-24`가 그렇게 한다).
- 빌드 산출물 `<build>/help/qtspim.qch`, `<build>/help/qtspim.qhc`는 설치 스크립트가 그대로 가져간다
  (`Setup/QtSpim_Win_Deployment/WiX/QtSpim.wxs:205-208`, `bin/release-debian:102-105`).

---

## 8. PLAN과 달라 조정이 필요한 것 (요약)

| # | PLAN의 가정 | 실제 | 영향 |
|---|---|---|---|
| ① | "중앙 탭에 Editor 추가 (기존 Text/Data 탭과 나란히)" | Text/Data는 **도크 위젯**, 중앙 위젯은 메시지 로그 `QTextEdit` 하나 | R4 배치 결정 필요 |
| ② | "Registers 메뉴 진법 옵션이 있다면" | **있다.** Binary/Hex/Decimal, Data Segment에도 별도로 있음 | R2대로 연결 가능. 결정 사항 없음 |
| ③ | 코어에서 명령어 필드를 얻는 방법 | `instruction*`에서 직접 얻을 수 있다. 현재 GUI는 `format_an_inst` **문자열을 오프셋으로 자른다** | 새 패널은 구조체 직접 사용. §3.5 |
| ④ | R3 "pseudo 확장 묶음" | `SOURCE(inst) != NULL`이 곧 그룹 시작 | 추가 작업 없음. §3.4 |
| ⑤ | R3 타입 배지 R/I/J/FR/FI | `op.h`의 형식 종류는 **피연산자 배치**이지 기계어 형식이 아니다 | 매핑 표 + 오라클 필요. §3.3 |
| ⑥ | R3 점프 목적지 | 코어는 `TARGET<<2`만 찍는다(상위 4비트 없음) | 목적지는 우리가 계산. §3.4 |
| ⑦ | R5 `.data` 라벨 표시 | 주소→라벨 API가 없다(해시 테이블 static) | `write_output` 캡처 + `print_symbols()` 우회. §3.7 |
| ⑧ | R1 "직전 스텝에서 바뀐 레지스터" | 원본은 "직전 **화면 갱신**" 기준 | 스냅샷 시점을 새로 정의해야 함. §2.2 |
| ⑨ | (PLAN에 없음) 인쇄·로그 저장 | 위젯의 `toPlainText()`/`print()`에 의존 | 패널 교체마다 텍스트/문서 생성기를 같이 만들어야 한다. §6.5 |
| ⑩ | (PLAN에 없음) 실행 중 화면 갱신 | Run은 끝난 뒤 한 번만 갱신 | 원본 동작. 바꾸려면 별도 결정 |
| ⑪ | (PLAN에 없음) 한글 경로 | `toLocal8Bit()` → Windows에서 CP949 표현 가능 범위만 동작 | `CPU/` 수정 없이는 한계. §5 |
| ⑫ | (PLAN에 없음) 브레이크포인트 | 테이블이 아니라 **메모리를 덮어쓴다** | 새 Text 모델이 원본 명령을 얻는 경로 필요. §3.5 |
| ⑬ | (PLAN에 없음) 실행 파일명 변경 | `Setup/`·`bin/release-*`가 `QtSpim`/`QtSpim.exe`를 하드코딩 | 2·8단계에서 함께 고쳐야 한다. §10 |

---

## 9. 조사에 쓴 재현 방법

`CPU/`만으로 터미널 `spim`을 소스 트리 밖에 빌드해서 코어 동작을 직접 확인했다.
같은 방법을 회귀 스크립트(`tools/regress.sh`)가 쓴다.

```bash
make -f <repo>/spim/Makefile spim \
     CPU_DIR=<repo>/CPU TEST_DIR=<repo>/Tests DOC_DIR=<repo>/Documentation \
     VPATH=<repo>/spim:<repo>/CPU
```
(`spim/Makefile`은 in-source 빌드를 전제하므로 디렉터리 변수를 전부 덮어써야 소스 트리가 더러워지지 않는다.)

상태 덤프:
```
$ printf 'load "helloworld.s"\nrun\nprint_all_regs\nquit\n' | ./spim -ef <repo>/CPU/exceptions.s -q
```
명령어 한 줄 보기: `print 0x00400024` (`spim/spim.cpp:657-705`에 명령 목록).

---

## 10. 파일을 고칠 때 주의할 것

### 10.1 줄바꿈

| 디렉터리 | 줄바꿈 |
|---|---|
| `QtSpim/*` (`.cpp .h .pro .ui .qrc .qhcp .qhp`) | **CRLF** |
| `CPU/*` (`CPU/version.h`만 예외로 CRLF) | LF |
| `QtSpim/macinfo.plist`, `QtSpim/qtspim.rc` | LF |

편집 도구가 무심코 전체를 LF로 바꾸면 한 줄만 고쳐도 파일 전체가 diff에 잡힌다.
(`QtSpim/QtSpim.pro`를 고치면서 실제로 한 번 저질렀다.)
Python으로 고칠 때는 `open(..., newline='')`로 읽고 쓴다.

확인:
```bash
git diff --stat            # 한 줄 고쳤는데 수백 줄이면 줄바꿈을 망친 것
file -b QtSpim/menu.cpp    # "with CRLF line terminators"가 있어야 한다
```

우리 파일(`QtSpim/edu/`, `tests/`)은 LF·UTF-8이고 한글 문자열 리터럴이 있다.
MSVC는 BOM 없는 UTF-8 소스를 시스템 코드페이지로 읽으므로 `.pro`의 `win32-msvc` 블록이 `/utf-8`을 준다.
새 `.pro`를 만들면 같은 플래그를 넣을 것(`tests/edu_core/edu_core.pro` 참조).

### 10.2 코어 헤더 중복 include

§3.9 참조. `spimview.h`를 include했으면 `CPU/*.h`를 다시 include하지 말 것.

### 10.3 실행 파일명을 바꾼 여파 (미해결)

브랜딩에서 `TARGET`을 `QtSpimEdu`로 바꿨다(`QtSpim/QtSpim.pro`). 배포 스크립트는 아직 원본 이름을 쓴다:

| 파일 | 하드코딩된 이름 |
|---|---|
| `bin/release-win:23` | `$RELEASE_DIR/release/QtSpim.exe` |
| `bin/release-debian:46,63` | `$RELEASE_DIR/QtSpim` |
| `Setup/QtSpim_Win_Deployment/WiX/QtSpim.wxs:28-32` | `QtSpim.exe`, 시작 메뉴 이름 `QtSpim` |
| `Setup/QtSpim_Win_Deployment/WiX/QtSpim.wxs:3` | `Product Name='QtSpim'`, `Manufacturer='LarusStone'` |

zip 배포(2단계)는 이 스크립트들을 쓰지 않고 `tools/package-windows.ps1`이 따로 만든다.
`bin/release-win`과 WiX는 MSI 흐름(8단계) 몫으로 남겨 두었고 아직 원본 이름 그대로다.

---

## 11. 3단계 이후의 레지스터 패널

원본 §2의 Int Regs 경로는 이렇게 바뀌었다 (FP Regs는 원본 그대로).

```
DisplayIntRegisters()  QtSpim/regwin.cpp
  ├ 원본 HTML 빌더(formatSpecialIntRegister/formatIntRegister) 그대로 실행
  │   → eduIntRegLog (숨은 QPlainTextEdit)  ← Save Log File / Print가 읽는 유일한 곳
  │       SpimView::intRegistersLogText() / printIntRegisters()
  └ eduRefreshRegisterPanel()  QtSpim/edu/edu_spimview_glue.cpp
      → EduRegisterModel::refresh()  → EduRegisterView(QTreeView, IntRegDockWidget 안)
      → EduInspector (레지스터 도크 아래 도크)
```

**배치**: Int Regs·FP Regs·Inspector는 원본의 위쪽 도크 줄이 아니라 **왼쪽 도크 영역**에 있다
(`eduTileInspector()`). 원본이 이미 `setCorner()`로 왼쪽 두 모서리를 왼쪽 영역에 주기 때문에
(`QtSpim/spimview.cpp`의 생성자), 왼쪽 도크는 메시지 로그 옆으로 창 전체 높이를 쓴다.
이유는 산수다: 1080줄 화면에서 위쪽 줄에 남는 높이는 어떤 행 높이로도 33행 정도인데 목록은
47행(그룹 8 + 레지스터 39, 원본은 텍스트 41줄)이다. 행 높이는 폰트 줄 높이 − 3px(델리게이트),
인스펙터는 내용 6줄에 맞춘 고정 높이다. 저장된 창 상태는 버전 2로 올려 예전 배치가 복원되지 않게 했다
(`QtSpim/state.cpp`).

| 파일 | 역할 |
|---|---|
| `edu/core/edu_format.*` | 32비트 값 ↔ 문자열. 위젯은 여기만 부른다 |
| `edu/core/edu_registers.*` | 레지스터 이름·번호 표기·그룹·이름 조회 |
| `edu/edu_register_model.*` | 2단계 트리 모델, 값 읽기/쓰기, 변경 스냅샷 |
| `edu/edu_register_view.*` | 트리 뷰, 우클릭 메뉴, 값 변경(원본 다이얼로그 재사용) |
| `edu/edu_inspector.*` | 인스펙터 도크 (지금은 레지스터만) |
| `edu/edu_spimview_glue.cpp` | `SpimView::edu*` 멤버. 원본 파일에는 `// EDU:` 한 줄 훅만 |

**변경 강조 스냅샷 시점** (`eduBeginRunCommand()` 호출 지점, 전부 `QtSpim/menu.cpp`):
`sim_Run`, `sim_SingleStep`, `continueBreakpoint`, `singleStepBreakpoint`의 첫 줄.
초기화(`eduResetRegisterChanges()`): `sim_ReinitializeSimulator`, `sim_ClearRegisters`, `file_LoadFile`.
사용자 편집은 `EduRegisterModel::writeRegister()`가 스냅샷에 같은 값을 넣어 강조에서 뺀다.

**FP 탭과의 관계**: 원본은 Int/FP 창이 같은 클래스(`regTextEdit`)와 같은 `changeValue()`를 쓴다
(클릭한 줄을 정규식으로 읽어 `R`/`FG`/`FP`/특수 이름을 구분). Int 창을 떼어 내도 클래스는 FP 탭용으로
그대로 남고, 정수 레지스터 분기는 FP 창의 텍스트에 걸리지 않을 뿐이라 **분리 작업이 필요 없었다.**

**로그 저장 동일성**은 구조로 보장한다: 새 코드가 로그 텍스트를 "다시 만드는" 것이 아니라 원본 HTML
빌더의 출력을 그대로 숨은 위젯에 넣어 `toPlainText()`/`print()`를 부른다. `tests/golden/`과
`regress.sh` 4번 검사는 그 구조가 깨지지 않았는지를 확인한다.

---

## 12. 원본과 의도적으로 다른 동작

"GUI만 바꾼다"가 원칙이지만, 아래는 **알고서 원본과 다르게 한 것**이다. 단계가 진행되면 여기에 누적한다.
8단계 학생용 안내문("무엇이 표준 QtSpim과 다른가")의 재료다. 시뮬레이션 결과에 영향을 주는 항목은 없다.

| # | 무엇이 다른가 | 원본 | 이유 | 단계 · 위치 |
|---|---|---|---|---|
| 1 | 실행 파일 이름 `QtSpimEdu` | `QtSpim` | 표준 QtSpim과 같은 PC에 나란히 설치·실행 | 1 · `QtSpim/QtSpim.pro` `TARGET` |
| 2 | 설정 저장소 `QtSpim-Edu`/`QtSpimEdu` | `LarusStone`/`QtSpim` | 두 프로그램의 도크 배치가 달라, 저장소를 공유하면 서로의 창 상태를 복원해 망가뜨린다 | 1 · `edu/edu_version.h`, `main.cpp`, `spimview.cpp` |
| 3 | 창 제목·About에 수정본 표기 | "QtSpim" | 어느 프로그램인지 구분. 원 저작권·BSD·LGPL 고지는 그대로 | 1 · `menu.cpp` `help_AboutSPIM` |
| 4 | 헬프를 **실행 파일 폴더의 `help/`에서 먼저** 찾는다 | 설치 경로 3곳만 | 배포물은 자기 안에서 완결돼야 한다. 남의 설치 폴더에 의존하면 그쪽이 삭제·갱신될 때 조용히 깨진다 | 2 · `menu.cpp` `help_ViewHelp` |
| 5 | 로컬 8비트 인코딩으로 표현 못 하는 경로는 **경고 후 로드를 건너뛴다** | `fopen`이 `???` 경로로 실패 → "Cannot open file" | 원인을 알려 주는 편이 낫고, 진행해도 어차피 실패해 에러가 두 번 뜬다. 근본 해결은 `CPU/` 수정이라 하지 않는다 | 2 · `edu/edu_path_check.*` |
| 6 | 경고 창의 인코딩 이름을 `GetACP()`로 얻는다 (포크 내 유일한 Win32 호출) | — | Qt는 Windows 로캘 코덱을 "System"이라고만 한다 | 2 · `edu/core/edu_path_encoding.cpp` |
| 7 | Change Value를 **취소하면 아무 일도 없다** | 취소해도 "Bad … value" 경고 | 원본의 버그 | 3 · `edu/edu_register_view.cpp` |
| 8 | Change Value의 **값 범위 검사가 플랫폼과 무관**: 10진 −2147483648…4294967295, hex/bin 32비트. 넘으면 에러 | `toLong()`/`toULong()` — Windows(32비트 `long`)와 Linux(64비트)가 다르고, Linux에서는 넘는 값을 말없이 자른다 | 같은 입력에 같은 결과 | 3 · `edu/core/edu_format.cpp` `parseValue32` |
| 9 | 레지스터 **변경 강조 기준**: 실행 명령(Step/Run/Continue) 시작 시점 대비. Reinitialize/Load/Clear에서 초기화, 사용자가 넣은 값은 강조 안 함 | 직전 화면 갱신 대비 | Run 뒤에 "무엇이 바뀌었나"가 보이게 | 3 · `edu/edu_register_model.*` |
| 10 | Int Regs가 그룹 트리 + 열(Name / No. / 선택 진법 / Decimal), 값은 `0x` + 8자리 | 한 줄씩 `R8  [t0] = 0` | PLAN R1·R2. **로그 저장·인쇄 출력은 원본 그대로** | 3 · `edu/edu_register_view.*` |
| 11 | 레지스터 도크와 인스펙터가 **왼쪽 도크 영역**(창 전체 높이), 세로 탭 | 위쪽 도크 줄, 메시지 로그가 창 전체 폭 | 47행이 1080줄 화면에 스크롤 없이 들어가려면 필요(§11) | 3 · `edu/edu_spimview_glue.cpp` |
| 12 | Window 메뉴에 Inspector 항목, 새 Inspector 도크 | 없음 | PLAN 공통 인스펙터 | 3 · `edu/edu_inspector.*` |
| 13 | 저장된 창 배치 버전 2 (이전 빌드가 저장한 배치는 한 번 무시) | 버전 1 | 11번 배치가 예전 저장 상태로 되돌아가지 않게 | 3 · `QtSpim/state.cpp` |
| 14 | Text 패널이 표(BP / Address / Code / Type / Instruction / Source). pseudo 확장은 배경 띠, 타입 배지, 소스 줄은 회색 | 한 줄씩 `[00400000] 8fa40000  lw $4, 0($29) ; 183: …` | PLAN R3. **로그 저장·인쇄 출력은 원본 그대로**(§14.4) | 5 · `edu/edu_text_model.*`, `edu/edu_text_view.*` |
| 15 | Kernel Text Segment는 **접힌 한 줄**로 시작. 머리 행 클릭으로 펼침/접음, PC가 커널에 들어가면 자동으로 펼침 | 항상 전부 표시 | 학생 코드가 먼저 보이게 | 5 · `edu_text_model.cpp` `setCurrentPc` |
| 16 | Text Segment 메뉴의 네 토글(User/Kernel/Comments/Instruction Value)이 **즉시 반영** | 메뉴를 바꿔도 화면은 그대로, 다음 전체 갱신(Load·Reinitialize 등) 때 반영 — `changed` 판정이 뒤집혀 있다(`menu.cpp` `text_Display*`) | 원본의 버그 | 5 · `menu.cpp` (`// EDU:` 4곳) |
| 17 | 위 16번 때문에 **토글 직후 저장한 로그**는 현재 메뉴 상태를 따른다 | 화면에 남아 있던 옛 내용이 저장됨 | 로그는 저장 시점에 원본 HTML 빌더로 새로 만든다 | 5 · `textwin.cpp` `eduFillTextLog` |
| 18 | 브레이크포인트가 걸린 줄이 **화면에서는 정상 표시**(빨간 점 + 원래 명령어) | 전체 갱신 후에는 `N [x0040002] x3402000   ori …`처럼 깨진다(§2의 버그: 코어가 앞에 `*`를 붙이는데 고정 오프셋으로 자름) | 화면은 고치고, **로그 출력은 원본과 같게 깨진 채로** 둔다(바이트 동일 원칙, 골든 `text-breakpoint.txt`) | 5 · `edu_text_model.cpp` `disassemblyOf` |
| 19 | BP 열 클릭으로 브레이크포인트 토글. 우클릭 메뉴는 Copy / Set Breakpoint / Clear Breakpoint (해당 없는 쪽은 비활성) | 우클릭 메뉴만, 표준 텍스트 메뉴(Copy, Select All) + Set/Clear 항상 활성 | PLAN 5단계 | 5 · `edu_text_view.cpp` |
| 20 | 단계 실행 시 선택(커서)은 움직이지 않는다. PC 줄은 cyan 강조 + 보이도록 스크롤만 | PC 줄로 텍스트 커서도 이동 | 선택은 인스펙터의 대상이라 사용자가 고른 채로 둔다 | 5 · `edu_spimview_glue.cpp` `eduHighlightInstruction` |
| 21 | 인스펙터 높이가 내용에 따라 6~16줄. 폭은 44자(3단계 42자) | 6줄 고정 | 명령어 필드 표 + 분기 안내문. FI 형식(`bc1t`)의 표가 44자 | 5 · `edu/edu_inspector.*` |
| 22 | 소스 줄이 UTF-8이 아니면 CP949로 해석해 표시 | UTF-8로만 해석(한글 CP949 주석이 깨짐) | 학생 파일에 흔하다. 코어가 가진 바이트는 그대로 | 5 · `edu/core/edu_source_text.*` |
| 23 | Data 패널이 표(Address / +0 / +4 / +8 / +C / ASCII / Labels). 줄 구성(짧은 첫 줄, 0이 4워드 이상이면 한 줄)은 원본과 같다 | 한 줄씩 `[10010000]    6c6c6548 …    H e l l` | PLAN R5. **로그 저장·인쇄 출력은 원본 그대로**(§15.5) | 6 · `edu/edu_data_model.*`, `edu/edu_data_view.*` |
| 24 | Address 열은 **줄의 기준 주소**(16의 배수). 줄이 중간에서 시작하면 앞 칸이 빈다 | 첫 워드의 주소(`[7fffff84]`)를 쓰고 값을 왼쪽부터 채움 | 열 제목 +0/+4/+8/+C와 주소가 맞아야 한다 | 6 · `edu_data_model.cpp` `data()` |
| 25 | 스택 맨 위의 **argv/환경변수 영역은 접힌 한 줄**로 시작(클릭으로 펼침). 세그먼트 머리 행도 접기 가능, Kernel data는 접힌 채 시작 | 항상 전부 표시 | 학생 스크린샷에 사용자명·경로가 나오지 않게(§15.3). 로그·인쇄는 원본대로 전부 | 6 · `edu_data_model.cpp` `buildRows` |
| 26 | Data 패널은 `$sp`/`$fp`/`$gp`가 **메모리 쓰기 없이 바뀌어도** 다시 그린다 | `data_modified`일 때만 — `$sp`만 바뀐 스텝에서는 User Stack의 시작 주소가 옛 값으로 남는다 | 포인터 마커와 스택 시작이 레지스터를 따라가야 한다 | 6 · `datawin.cpp` `DisplayDataSegments` (`// EDU:`) |
| 27 | Change Memory Contents: **취소하면 아무 일도 없다**, 값 범위 검사는 플랫폼 무관(7·8번과 같은 규칙). 0이 이어진 줄 안의 주소도 Go to로 찾아가 고칠 수 있다. 더블클릭으로도 열린다 | 취소해도 "Bad … memory value", `toLong()` 범위는 플랫폼마다 다름, `[a]..[b]` 줄에서는 첫 주소만 고칠 수 있음 | 7·8번과 같은 이유 | 6 · `edu_data_view.cpp` `changeValue` |
| 28 | Data Segment 메뉴·우클릭 메뉴에 Words / Half words / Bytes, 패널 위에 Go to 입력과 `$sp` 버튼 | 없음 | PLAN R5 | 6 · `edu_data_view.cpp` |
| 29 | `$sp`가 스택 범위 밖(Clear Registers 직후의 0 등)이면 User Stack을 **할당된 스택 전체**로 보여 준다 | `$sp`부터 0x80000000까지를 그대로 훑는다(매핑 안 된 주소를 5억 워드 읽음 — 사실상 멈춤) | 멈추지 않게. 로그 저장은 원본 빌더 그대로라 이 경우 원본처럼 오래 걸린다 | 6 · `edu_data_model.cpp` `segmentBounds` |

**다르지 않은 것** (확인된 것만): 시뮬레이터 코어 전체(`CPU/` 바이트 동일, `tools/regress.sh` 1·2·3번),
Save Log File의 Int Regs·Text·Data 출력(4번 — 17·18번의 경우 포함해 골든과 바이트 동일), 브레이크포인트 다이얼로그(Continue / Single Step / Abort),
FP Regs 탭, 메뉴·단축키·설정 다이얼로그.

---

## 13. 명령어 디코더 (4단계)

`QtSpim/edu/core/edu_decoder.*` — 32비트 워드(+선택적으로 PC)만 보고 형식·필드·이름·분기/점프 목적지를 낸다.
코어는 링크하지 않는다. 코어와의 대조는 `tests/edu_oracle/`(코어를 링크하는 유일한 바이너리)이 한다.

### 13.1 형식 판정 (워드만으로)

| opcode | 형식 |
|---|---|
| 0x00 SPECIAL, **0x1c SPECIAL2** | R |
| 0x02, 0x03 | J |
| 0x10 COP0 | CP0 |
| 0x11 COP1 | fmt 필드가 8(bc1f/bc1t…)이면 FI, 아니면 FR |
| 나머지 | I |

0x1c(`mul`, `clz`, `madd`…)는 결정문("opcode 0→R … 나머지→I")에 없지만 R로 넣었다: 필드 배치가
rs/rt/rd/shamt/funct이고, I로 보이면 `mul`의 rd·funct가 immediate로 뭉개진다. COP2(0x12)와 COP1X(0x13)는
문자 그대로 I다(SPIM이 실행하지 않는 영역).

### 13.2 분기 목적지 — SPIM은 기본 모드에서 교과서 공식과 다르다

| Delayed Branches 설정 | 어셈블러가 넣는 offset | 목적지 |
|---|---|---|
| 꺼짐 (**QtSpim 기본값**) | (라벨 − PC) / 4 | **PC + (offset << 2)** |
| 켜짐 (Bare Machine) | (라벨 − PC) / 4 − 1 | PC + 4 + (offset << 2) ← MIPS 표준 |

근거: `CPU/sym-tbl.cpp:258-266`(`if (delayed_branches) val -= 1`), `CPU/run.cpp:104-118`(`BRANCH_INST`: 지연 분기일 때만 `+4`).
즉 **같은 소스 줄이 모드에 따라 다른 기계어가 된다.** 기본 모드에서 `bne` 바로 뒤뒤 명령으로 가는 분기는
offset 2로 인코딩된다(실제 MIPS라면 1). 실측: `[0x00400030] 0x14200002 bne $1, $0, 8 [target-0x00400030]`, target = 0x00400038.
PLAN R3의 "목적지 = PC+4+(imm<<2)"는 Bare Machine 모드에서만 맞는다. 디코더는 `BranchConvention`
(`SpimNoDelaySlot` / `MipsDelaySlot`)을 인자로 받고, 5단계 UI는 현재 설정(`delayed_branches`)에 맞는 쪽을 넘겨야 한다.

점프는 코어와 같이 `(PC & 0xf0000000) | (target << 2)`로 계산한다(`CPU/run.cpp:442,450`). 표준의 `(PC+4)[31:28]`과는
PC가 256MB 경계 직전일 때만 다르다. 다른 256MB 영역의 라벨로 점프하면 코어는 경고만 하고 상위 4비트를 잘라 인코딩하며,
실행도 그 잘린 주소로 간다(`tt.core.s`의 `j l17a`: 0x80000258 → 0x00000258).

### 13.3 이름: SPIM이 어셈블·실행할 수 있는 것만

`op.h`의 인코딩 있는 항목 291개 중 **MIPS32 Release 2 표시가 붙은 91개는 SPIM 파서가 전부 거부한다**
("not implemented. Instruction ignored"): 이 토큰들은 `CPU/parser.y`에서 `*_REV2` 규칙 14개에만 나오고
그 규칙은 전부 `mips32_r2_inst()`를 부른다(`sub.ps`는 규칙이 아예 없어 문법 오류). 디코더도 이들을 모르는 명령(`known == false`)으로
둔다. 나머지 200개는 전부 이름이 일치한다.

SPIM의 인코딩이 MIPS32 매뉴얼과 다른 곳은 SPIM을 따랐다(학생이 보는 워드는 SPIM이 만든 것이므로):

| 명령 | SPIM | MIPS32 매뉴얼 |
|---|---|---|
| `cvt.d.w` | 0x46200021 (fmt = 17, D) | 0x46800021 (fmt = 20, W — 원본 형식이 fmt) |
| `rfe` | 0x42000010 | MIPS I 전용, MIPS32에는 없음 |
| `cop2` | 0x4a000000 + 25비트 인자 (J-type 취급) | COP2 일반 연산 |

`0x00000040`은 `ssnop`이면서 `sll $0,$0,1`이다. 워드만으로는 구분할 수 없어 코어의 디코더처럼 `sll`로 답한다.
`0x00000000`은 코어가 출력하는 대로 `nop`.

### 13.4 코어 자체 디코더(`inst_decode`)의 버그 — 우리 것과 다른 10곳

`inst_decode()`는 `.word`를 텍스트 세그먼트에 넣었을 때만 쓰인다(어셈블된 명령은 파서가 만든 구조체를 그대로 쓰고,
`run.cpp`도 내부 opcode로 실행하므로 **프로그램 실행에는 영향이 없다**). 조회 키를 만들 때 비트를 빠뜨려 다음을 잘못 부른다:

| 워드의 실제 명령 | `inst_decode()`의 답 | 원인 (`CPU/inst.cpp:1167-1184`) |
|---|---|---|
| `bc1fl`, `bc1tl` | `bc1f`, `bc1t` | COP1 분기 키에 bit 16(tf)만 넣고 bit 17(nd, likely)을 뺀다 |
| `bc2t`, `bc2fl`, `bc2tl` | `bc2f` | COP2는 rs만 키에 넣는다 |
| `cop2` | 무효 명령 | 위와 같음: rs 자리가 `cop2` 인자의 일부 |
| `movt` | `movf` | SPECIAL 키는 funct뿐, rt의 tf 비트가 빠진다 |
| `movt.s`, `movt.d` | `movf.s`, `movf.d` | COP1 키는 fmt+funct뿐 |
| `trunc.w.s` | `suxc1` | `op.h`가 Release 2 명령 `suxc1`에 같은 인코딩(0x4600000d)을 줬다 |

마지막 줄은 `op.h`의 **중복 인코딩** 6쌍 중 하나다: `floor.w.s`/`prefx`, `trunc.w.s`/`suxc1`, `round.l.s`/`swxc1`,
`trunc.l.s`/`sdxc1`, `lwxc1`/`madd.s`, `ldxc1`/`madd.d`. 어느 쪽이 나오는지는 `qsort`가 같은 키를 어떻게 놓느냐에 달려 있어
C 라이브러리마다 다를 수 있다. 오라클 테스트는 이 경우를 보고만 하고 고정하지 않는다.

5단계에서 Text 패널의 명령어 이름은 **구조체(파서가 만든 것)에서** 가져와야 하고, 워드를 `inst_decode()`에 넣어 얻으면 안 된다.

### 13.5 오라클 테스트가 확인하는 것 (`tests/edu_oracle/tst_decoder_oracle.cpp`)

1. **`op.h` 전체**: 구현된 200개 명령마다 코어 `instruction`을 만들어 `inst_encode()`로 인코딩(피연산자 30가지 조합, 총 5,971워드) →
   이름, 코어 구조체 슬롯(rs/rt/rd/shamt/imm/target/cc)과 우리 필드, 필드 재조립 = 원래 워드, 필드가 32비트를 빈틈없이 덮는지, 형식 규칙.
2. **프로그램**: `exceptions.s`, `helloworld.s`, `Tests/tt.{core,le,dir,io,bare,alu.bare,fpu.bare}.s`를 코어로 어셈블해
   텍스트 세그먼트의 모든 명령(8,964개)에 같은 검사 + 분기·점프 목적지를 **심볼 테이블의 라벨 주소**와 대조(1,484개). 두 분기 규약 모두 포함.
3. **몰라야 하는 것**: 안 쓰는 opcode, Release 2 항목 91개.
4. **`inst_decode()`와의 차이**: 위 13.4의 표를 고정. 새 차이가 생기면 실패.

손으로 계산한 경계값(최대/최소 imm, 음수 분기, 미해결 `jal 0x00000000`, nop, 모르는 opcode, 모듈로 2^32)은
`tests/edu_core/tst_decoder.cpp`.

---

## 14. 5단계 이후의 Text 패널

### 14.1 구조

```
TextSegDockWidget
└─ EduTextView : QTableView      (spimview.ui에서 textTextEdit 자리에)   edu/edu_text_view.*
     └─ EduTextModel             평평한 표. 머리 행 2개 + 명령어 행          edu/edu_text_model.*
SpimView::eduTextLog : QTextEdit (숨김)  로그 저장·인쇄 때만 채움             textwin.cpp eduFillTextLog
```

원본 `textTextEdit` 클래스는 `textwin.cpp`에 그대로 남아 있지만 더는 쓰이지 않는다(원본 파일 수정 최소화).

| 열 | 출처 |
|---|---|
| BP | `inst_is_breakpoint(addr)` — 칠할 때마다 묻는다(캐시 없음) |
| Address | 행의 주소, `edu::hex32Digits` |
| Code | `ENCODING(inst)`, `edu::hex32Digits` |
| Type | `edu::formatOf(word)` — 워드만으로(§13.1) |
| Instruction | **코어의 `format_an_inst()` 문자열**에서 주소·워드·주석을 뺀 부분. `inst_decode()`는 쓰지 않는다(§13.4) |
| Source | `SOURCE(inst)` ("줄번호: 원문"), `edu::decodeSourceBytes` |

`format_an_inst()` 출력에서 디스어셈블 부분을 떼는 방법(`disassemblyOf`): 주석은 항상 줄 끝의 `"; " + SOURCE(inst)`
(`CPU/inst.cpp:713`)이므로 **길이로** 잘라낸다 — 원본처럼 첫 `;`를 찾지 않는다. 앞쪽은 탭까지가 주소, 그 뒤 12자가 워드.

브레이크포인트가 걸린 주소는 메모리에 `break`가 들어 있다(§2). 모델은 코어의 `format_an_inst()`와 같은 방법으로
(`CPU/inst.cpp:575-581`) `delete_breakpoint` → `read_mem_inst` → `add_breakpoint`로 원래 명령어를 읽는다.
이 과정이 `text_modified`를 세우지만 `DisplayTextSegments()` 끝에서 원본과 똑같이 `false`로 되돌린다.

### 14.2 갱신 — 원본과 같은 지점, 더 싼 비용

| 계기 | 원본 | 지금 |
|---|---|---|
| `DisplayTextSegments(force)` / `text_modified` (Load, Reinitialize, 브레이크포인트 설정·통과 뒤의 `UpdateDataDisplay`) | HTML 전체 재생성 + `insertHtml` | `EduTextModel::rebuild()` — 같은 루프(`read_mem_inst` + `format_an_inst`), HTML 파싱 없음. 선택 행과 스크롤 위치는 주소로 복원 |
| `highlightInstruction(PC)` (매 스텝, Run은 10만 명령마다) | 문서 전체를 정규식으로 검색 + ExtraSelection | `setCurrentPc()`: 해시로 행을 찾아 **두 행만** `dataChanged` |
| 브레이크포인트 설정/해제 | 그 줄에 HTML 조각 삽입/삭제 | 그 행의 BP 칸만 `dataChanged` |

측정(offscreen, 3회, ms — `--time`; 스텝마다 레지스터·Data 패널 갱신 포함):

| 시나리오 | 원본 렌더링(af7c4ae) | 5단계 |
|---|---|---|
| `tt.core.s` 단일 스텝 500회 | 1213 · 1221 · 1219 | 562 · 570 · 565 |
| `tt.core.s` 브레이크포인트 1개 + 스텝 60회 | 173 · 173 · 171 | 121 · 122 · 122 |
| 600만 명령 루프 Run | 1551 · 1550 · 1547 | 1545 · 1541 · 1544 |
| `tt.fpu.bare.s` Run | 11 · 10 · 11 | 8 · 9 · 8 |
| `tt.core.s` 시작+로드+종료(벽시계) | 377 · 375 · 379 | 129 · 128 · 130 |

### 14.3 pseudo 확장 묶음

`SOURCE(inst) != NULL`인 행이 소스 한 줄의 시작이고, 뒤따르는 `SOURCE == NULL` 행들이 그 확장이다(§3.4).
두 개 이상으로 확장된 줄에만 배경 띠를 주고(노랑/파랑 교대 — 이웃한 묶음이 구분되게), 한 명령어짜리 줄은 그대로 둔다.
띠 색은 설정의 Text 창 배경색에 섞어서 만든다(설정의 글꼴·색이 그대로 적용된다).

### 14.4 로그 저장·인쇄

`SpimView::textSegmentLogText()` / `printTextSegment()`가 유일한 출구다. 원본의 HTML 빌더
(`formatUserTextSeg` · `formatKernelTextSeg` · `formatInstructions` — 수정 없음)로 만든 HTML을 숨은 `QTextEdit`에
`insertHtml`하고 `toPlainText()` / `print()` 한다. 화면 위젯이 하던 일과 같아서 출력이 바이트 단위로 같다.
커널 세그먼트가 화면에서 접혀 있어도 로그에는 원본처럼 전부 들어간다.
`tools/regress.sh` 4번이 `tests/golden/text-*.txt` 8개(토글 4종, 브레이크포인트, 스텝 후, `tt.core.s`)와 비교한다.

### 14.5 인스펙터의 명령어 상세

`edu::instructionDetailLines()`(`edu/core/edu_instruction_text.*`, 단위 테스트 `tst_instruction_text.cpp`)가 줄을 만들고
인스펙터는 보여 주기만 한다. 필드마다 한 열: 비트 범위 / 2진수 / 필드 이름 / 값 / 의미(레지스터 `$이름`, opcode·funct의 명령 이름,
분기 offset의 `x4=`). 값과 의미를 PLAN의 예시처럼 한 줄에 같이 쓰면 FR 형식이 51자가 되어 **두 줄로 나눴다**.

- 분기 규칙은 실행 시점의 `delayed_branches`로 고른다(§13.2).
- 목적지 라벨은 `EXPR(inst)->symbol->name`. 분기의 `EXPR(inst)->offset`은 `-pc`라는 내부 값이라
  (`CPU/sym-tbl.cpp:251`) 표시하지 않는다. 심볼이 정의되지 않았으면(`SYMBOL_IS_DEFINED`가 거짓) `[main: undefined]`.
- 관찰: `Tests/tt.alu.bare.s`는 1601행 `ctc3 $2 $3`의 syntax error에서 파싱이 끝나, 그 뒤(1805행 `fail:` 포함)가
  어셈블되지 않는다. 그래서 `fail`은 미정의, 모든 `bne … fail`의 offset은 0이다. 코어 동작이라 원본도 같다
  (콘솔 출력은 vanilla와 일치 — `tools/regress.sh` 3번).

---

## 15. 6단계 이후의 Data 패널

### 15.1 구조

```
DataSegDockWidget
└─ EduDataPanel : QWidget        (spimview.ui에서 dataTextEdit 자리에)      edu/edu_data_view.*
     ├─ Go to [입력] [Go] [$sp]  결과 표시
     └─ EduDataView : QTableView
          └─ EduDataModel        평평한 표. 머리 행 + 워드 행 + 0-구간 행 + 접힘 행   edu/edu_data_model.*
SpimView::eduDataLog : QPlainTextEdit (숨김)  로그 저장·인쇄 때만 채움          datawin.cpp eduFillDataLog
```

원본 `dataTextEdit` 클래스는 `datawin.cpp`에 그대로 남아 있지만 더는 쓰이지 않는다.

**줄 구성은 원본과 같다** — `edu::layoutMemoryRows()`(`edu/core/edu_memory_rows.*`, 단위 테스트 `tst_memory_rows.cpp`)가
`SpimView::formatMemoryContents()`(`QtSpim/datawin.cpp`)의 규칙을 그대로 옮긴 것: 16바이트 정렬 줄에 최대 4워드,
범위가 줄 중간에서 시작하면 짧은 첫 줄, 줄 시작에서 0인 워드가 4개 이상 이어지면 길이와 무관하게 한 행
(`[10000000]..[1000ffff]  00000000`), 구간이 줄 중간에서 끝나면 그 줄의 나머지는 다시 짧은 줄.
추가한 것은 하나: **고정(pin)된 줄**은 0-구간 안에 있어도 워드 행으로 보여 준다 — Go to나 값 변경이 그 안의 주소에 닿게 하려는 것.

세그먼트 범위도 원본대로: User data `DATA_BOT..data_top`, User Stack `ROUND_DOWN($sp,4)..STACK_TOP`,
Kernel data `K_DATA_BOT..k_data_top` (`CPU/mem.h:67-105`).

값은 `refresh()`에서 코어 함수로 읽어 행에 담아 둔다: 워드는 `read_mem_word`, half는 `read_mem_half`, 바이트는
`read_mem_byte`(`CPU/mem.h:141-143`). **바이트 순서를 계산하지 않는다** — 코어의 메모리 배열은 호스트 엔디언 그대로이고
(`CPU/spim.h:38-45`: 호스트와 다른 엔디언은 시뮬레이션할 수 없다), 세 함수는 같은 배열의 별칭
(`data_seg` / `data_seg_h` / `data_seg_b`)을 읽는다. ASCII 열과 Bytes 단위는 `read_mem_byte`를 주소 오름차순으로 읽은 것이라
실제 메모리 순서다(리틀 엔디언 호스트에서 워드 `6c6c6548`의 바이트는 `48 65 6c 6c` = "Hell").

### 15.2 라벨

`SpimView::eduCollectLabels()` — 텍스트 세그먼트가 다시 그려질 때(로드, Reinitialize) 한 번:

1. `print_symbols()` 출력을 캡처(`write_output()`에 `eduOutputCapture` 스위치 — `QtSpim/spim_support.cpp`, `// EDU:`)해서
   `edu::parseSymbolListing()`으로 파싱. **전역 라벨만 나온다**(§3.7의 6단계 메모).
2. 두 텍스트 세그먼트의 명령어를 훑어 `EXPR(inst)->symbol`이 정의된 것의 이름·주소를 더한다 — `la $a0, msg`의 `msg` 같은 **로컬 라벨**이 이렇게 들어온다.

한계: 코드가 참조하지 않는 로컬 `.data` 라벨은 얻지 못한다(`tests/samples/data-stack.s`의 `msg`, `bytes`, `half`가 그 예).
브레이크포인트가 걸린 주소의 명령어는 `break`로 바뀌어 있어 그 명령어의 라벨도 빠진다(다른 명령어가 같은 라벨을 참조하면 무관).

### 15.3 argv/환경변수 접기 — 경계의 근거

`initialize_run_stack()`(`CPU/spim-utils.cpp:237-270`)의 순서: 스택 꼭대기에서부터 환경변수 문자열, argv 문자열 → 정렬 →
`0`, `envp[]` 포인터들(**마지막으로 쓴 것이 `envp[0]`, 그 주소가 `$a2`** — 261행) → `0`, `argv[]` 포인터들(`$a1`, 265행) → `argc`(`$sp`).
GUI의 `SpimView::initStack()`이 `initialize_stack()`을 부른 **직후** `$a2`를 읽어 둔다(`eduNoteStackInitialized()`, `menu.cpp`의 `// EDU:` 한 줄).
접는 범위는 **`[$a2, STACK_TOP)`** = `envp[]` 포인터 + 모든 문자열. `argc`와 `argv[]` 포인터, 그 끝의 `0`은 보이는 채로 둔다
(시작 코드의 `lw $a0 0($sp)` / `addiu $a1 $sp 4`가 읽는 부분). argv **문자열**(로드한 파일 경로 = 사용자명)은 접힌 쪽에 있다.
접힘 행의 "N bytes"는 `STACK_TOP - $a2`.

### 15.4 갱신

원본과 같은 지점 — `DisplayDataSegments(force)`, `data_modified` — 에 **`$sp`/`$fp`/`$gp`가 바뀐 경우**를 더했다(§12 26번).
`refresh()`는 행 목록을 새로 만들어 이전과 **모양(종류·주소·길이)이 같으면 `dataChanged`만** 보낸다(스텝 중의 보통 경우:
선택·스크롤 유지, 보이는 칸만 다시 그림). 모양이 바뀌면(스택이 자람, 0-구간이 깨짐, 접기) 모델 리셋 후 선택을 주소로 복원.
접힌 세그먼트(기본: Kernel data)는 훑지 않는다. 인스펙터의 "Pointers"는 표와 달리 **현재 레지스터**로 계산한다(실행 명령마다 인스펙터가 갱신되므로).

측정(offscreen, 3회, ms — 5단계 빌드 = 원본 Data 창):

| 시나리오 | 원본 Data 창 | 6단계 |
|---|---|---|
| `tt.core.s` 단일 스텝 500회 | 565 · 571 · 580 | 492 · 502 · 501 |
| `data-stack.s` 스텝 60회(store, push) | 40 · 40 · 41 | 36 · 37 · 36 |
| store 루프 스텝 400회 | 417 · 415 · 411 | 339 · 339 · 338 |
| store 루프 Run (240만 명령, store 60만) | 631 · 629 · 625 | 626 · 629 · 628 |
| 600만 명령 루프 Run | 1544 · 1549 · 1553 | 1552 · 1548 · 1549 |

### 15.5 로그 저장·인쇄

`SpimView::dataSegmentLogText()` / `printDataSegment()`가 유일한 출구. 원본 빌더(`formatUserDataSeg` · `formatUserStack` ·
`formatKernelDataSeg` · `formatMemoryContents` — 수정 없음)의 HTML을 숨은 `QPlainTextEdit`에 원본과 같은 호출
(`clear()` + `appendHtml()`)로 넣는다. 접힘·단위·고정 줄은 로그에 영향이 없다(환경변수 영역도 원본처럼 전부 나온다).
`tools/regress.sh` 4번이 `tests/golden/data-*.txt` 11개(로드, Run, 2·10진, 세그먼트 토글 3종, 샘플 프로그램 스텝/Run, `tt.core.s` 300스텝)와 비교한다.

### 15.6 Go to와 인스펙터

`edu::resolveGoTo()`(단위 테스트 `tst_memory_text.cpp`): `$이름`/`$번호`는 레지스터 → 알려진 라벨 → `0x…` 또는 16진수 8자리 이하는 주소
→ `$` 없는 레지스터 이름. (`a0`은 주소 0xa0이다 — 레지스터는 `$a0`.) 대상이 접힌 곳이면 펼치고, 0-구간 안이면 그 줄을 고정한다.
보이는 세그먼트 밖의 주소(텍스트 라벨 등)는 "No data at …".
인스펙터(`edu::memoryDetailLines()`): 주소 | 라벨 | 세그먼트, Hex / Signed / Unsigned, 비트 눈금 + 2진수, Bytes(메모리 순서 + 문자),
Pointers(그 워드 안을 가리키는 모든 일반 레지스터, `$t0+1` 식).

