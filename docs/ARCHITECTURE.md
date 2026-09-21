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

---

## 4. 어셈블 에러 메시지 형식과 출력 경로

```
yyerror(s)   CPU/parser.y:2941  → parse_error_occurred = true; clear_labels(); yywarn(s)
yywarn(s)    CPU/parser.y:2950  → error("spim: (parser) %s on line %d of file %s\n%s",
                                        s, line_no, input_file_name, erroneous_line())
erroneous_line()  CPU/scanner.l:~700  → "줄번호: 소스원문"
```
최종 문자열 예:
```
spim: (parser) Syntax error on line 12 of file /path/to/a.s
12:        addi $t0 $t1
```
`error()`의 구현은 우리 쪽 `QtSpim/spim_support.cpp:60-69` →
`Window->Error(buf, /*fatal=*/0)` → `QtSpim/spimview.cpp:268`:
1. `WriteOutput(message)` — 중앙 로그 `QTextEdit`에 HTML로 추가
2. `QMessageBox::information(...)` — **모달 대화상자**. `Abort`를 고르면 `force_break = true`

→ **7단계(에디터)의 "에러 줄로 이동"은 `error()`를 가로채 `on line (\d+) of file (.*)` 를 뽑으면 된다.**
`CPU/` 수정 불필요. 다만 파일마다 에러가 날 때마다 모달이 뜨는 현재 동작은 그대로 둘지 결정 필요(8절).

`error()`/`run_error()`/`fatal_error()` 셋 다 같은 경로. `fatal_error`만 `SaveStateAndExit(1)`.
버퍼는 고정 10000바이트(`spim_support.cpp:56`, `BIG_BUF_SIZE`).

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
  대신 2단계 Windows 확인 항목에 "한글 사용자명 경로에서 .s 로드"를 넣는다(이미 PLAN에 있음).
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
