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
> 라벨 구조체 자체는 해제되지 않고(명령어의 `EXPR(inst)->symbol`이 계속 가리킨다 — `sym-tbl.cpp:351` 주석),
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
| 30 | **File > Load File이 묻는다**: 프로그램이 로드된 상태면 "Reinitialize and load(기본) / Add to current program / Cancel". 최근 파일 항목도 같다. Reinitialize and Load File과 첫 로드에서는 묻지 않는다 | 말없이 현재 프로그램 위에 얹는다 → 같은 파일이면 `Label is defined for the second time … main`(§16) | 학생이 가장 자주 만나는 혼란. "Add"를 고르면 원본과 같다 | 6 후속 · `menu.cpp` `file_LoadFile`(`// EDU:`), `edu_spimview_glue.cpp` `eduConfirmLoadOnTop` |
| 31 | 상태바 오른쪽에 **설정 배지**: Bare Machine / Pseudo instructions off / Delayed branches / Delayed loads 중 기본값과 다른 것 | 없음 | 이 설정들은 저장되어 재시작 후에도 남는다. Bare Machine이면 `li` 같은 pseudo 명령이 syntax error가 된다 | 6 후속 · `edu_spimview_glue.cpp` `eduUpdateModeBadge` |
| 32 | 파일을 코어의 `read_assembly_file()` 대신 **그 복제본 `eduReadAssemblyFile()`**로 읽는다(줄 단위 대응 + `flush_local_labels()` 직전의 `print_symbols()` 캡처) | 코어 함수 직접 호출 | 로컬 라벨을 얻는 유일한 방법(§3.7). **시뮬레이터 상태는 같다** — `tests/edu_loader`가 `Tests/` 전체에서 두 로더 뒤의 텍스트·데이터·경계·에러·심볼 테이블을 비교한다 | 6 후속 · `edu/edu_loader.*`, `menu.cpp`·`main.cpp`(`// EDU:`) |
| 33 | Data 패널의 Words / Half words / Bytes 선택을 설정에 저장(`DataWin/EduDisplayUnit`) | — | 6단계 체크포인트 | 6 후속 · `state.cpp`(`// EDU:` 2곳) |
| 34 | **Editor 도크**(Data·Text와 같은 탭 묶음, 시작 화면에서 맨 앞). File과 Simulator 사이에 **Editor 메뉴**: New(Ctrl+N) / Open(Ctrl+O) / Open Recent / Save and Assemble(Ctrl+S, F3) / Save As and Assemble(Ctrl+Shift+S). Simulator 메뉴·툴바에도 같은 액션(툴바 글자는 "Assemble"), Window 메뉴에 Editor. 원본 File 메뉴는 그대로 | 편집기 없음. 단축키는 F5·Shift-F5·F10 셋뿐 | PLAN R4 | 7 · `edu/edu_editor_dock.*`, `edu/edu_code_editor.*`, `edu/edu_editor_glue.cpp` |
| 35 | **Assemble 중의 에러는 모달 없이** 에디터 아래 목록 + 여백의 빨간 점 + 상태바 "N errors". 메시지 로그에는 원본과 똑같이 찍힌다. File 메뉴로 올릴 때는 원본대로 에러마다 모달 | 에러 하나당 모달 하나(§4) | 1단계 결정 4. `SpimView::Error()`의 `// EDU:` 한 곳 | 7 · `spimview.cpp`, `edu_editor_glue.cpp` `eduCollectError` |
| 36 | 에러 목록의 줄 번호는 **인용된 소스 줄이 실제로 있는 줄**. 로그의 메시지는 코어가 말한 번호 그대로 | 범위 밖 operand 같은 에러는 다음 문장의 첫 토큰을 읽은 뒤에 보고되어 번호가 뒤 줄을 가리킨다(`Tests/tt.alu.bare.s`: 메시지 414, 실제 413) | 학생이 엉뚱한 줄을 보지 않게 | 7 · `edu/core/edu_asm_errors.cpp` `resolveMessageLine` |
| 37 | File 메뉴·최근 파일·명령행으로 올린 파일은 **에디터에도 열린다**(에디터에 다른 파일의 저장 안 한 변경이 있으면 먼저 묻는다). 로드가 끝나면 Text 탭이 앞으로 온다 | — | PLAN R4 6번 | 7 · `menu.cpp`·`main.cpp`의 `eduEditorFileLoaded` |
| 38 | 종료(창 닫기, File > Exit) 때 에디터에 저장 안 한 변경이 있으면 Save / Discard / Cancel | 바로 종료 | 작업을 잃지 않게 | 7 · `spimview.cpp` `closeEvent`, `menu.cpp` `file_Exit` |
| 39 | 저장된 창 배치 버전 3 (이전 빌드의 배치는 한 번 무시) | — | Editor 도크가 없는 배치를 복원하면 도크가 숨는다 | 7 · `state.cpp` |
| 40 | **저장 = 어셈블.** Editor > Save and Assemble(Ctrl+S = F3 = 툴바 Assemble) 하나뿐이고 저장만 하는 동작은 없다. Save As도 저장 후 어셈블. 묻지 않는다(이름 없는 새 파일만 Save As) | 편집기 없음 | "저장했는데 왜 안 바뀌지"가 없게 (7단계 체크포인트) | 7 · `edu_editor_glue.cpp` `eduAssemble` |
| 41 | 어셈블이 실패해도 **파일은 저장된 채로** 두고, 상태바에 "Assemble failed — N errors. Simulator was reset." | — | 어셈블은 원본의 Reinitialize and Load File 경로라 이전 프로그램이 사라진다. 그 이유를 알린다 | 7 · 같은 곳 |
| 42 | Text·Data 패널 맨 위의 띠 **"Source changed — save (Ctrl+S) to assemble"**: 에디터의 소스가 시뮬레이터가 마지막으로 받은 것과 다를 때(입력함, 다른 파일을 엶, Reinitialize 함, 시작 시 마지막 파일이 열림). 클릭 = 저장+어셈블. 어셈블을 시도하면(성공·실패 모두) 사라진다 | — | 보고 있는 Text/Data가 지금 소스와 다르다는 것을 그 자리에서 알린다 | 7 · `edu_editor_glue.cpp` `eduUpdateStaleBanner` |
| 43 | 시작할 때 **에디터가 마지막으로 열었던 파일을 다시 연다**(설정 `Editor/LastFile`, 파일이 없으면 조용히 빈 에디터). **어셈블하지 않는다** — 시뮬레이터의 시작 상태는 원본과 같다(`check-editor.sh` 7번이 텍스트 세그먼트를 새 시작과 비교). 프로그램이 로드되지 않은 시작에서는 저장된 창 배치와 무관하게 Editor 탭이 앞 | — | 7단계 체크포인트 | 7 · `edu_editor_glue.cpp` `eduSetupEditor`, `eduEditorAtStartup`; `main.cpp`(`// EDU:`) |
| 44 | 버전이 **우리 것 1.0.0**(`EDU_VERSION`)이고 About에 "QtSpim-Edu 1.0.0 (based on QtSpim 9.1.24)", 상태바 오른쪽 끝에 "QtSpim-Edu 1.0.0" | About에 SPIM 버전만 | 학생의 스크린샷만 보고도 어느 빌드인지 알 수 있게. `CPU/version.h`는 그대로 | 8 · `edu/edu_version.h`, `menu.cpp`, `edu_spimview_glue.cpp` |
| 45 | **MSI가 별개 제품**: ProductName `QtSpim-Edu`, 고유 UpgradeCode, `%ProgramFiles%\QtSpim-Edu`(64비트), 시작 메뉴만(바탕 화면 바로 가기 없음), `.s` 연결 없음, 설치 프로그램의 레지스트리는 `HKCU\Software\QtSpim-Edu-Installer`뿐 | `QtSpim` / `%ProgramFiles(x86)%\QtSpim.` / 바탕 화면 바로 가기 | 표준 QtSpim과 같은 PC에 설치·제거해도 서로 건드리지 않게. CI의 `tools/check-msi.ps1`이 MSI 테이블과 실제 무인 설치·제거(표준 QtSpim 대역 옆에서)로 확인한다 | 8 · `Setup/QtSpimEdu_Win_Deployment/`, `tools/package-msi.ps1` |
| 46 | **Inspector 위의 분할 바가 움직인다.** 인스펙터는 사용자가 분할 바를 잡기 전까지 내용 높이(6~16줄)에 잠겨 있고, 누르는 순간 풀린다(최소 3줄, 최대 없음). 드래그로 높이가 바뀌면 그때부터 사용자 높이(창 상태와 함께 저장, `MainWin/InspectorUserSized`), 누르기만 하면 다시 잠긴다. Window > Tile이 잠금으로 되돌린다 | — | 1.0.0에서는 내용 높이에 고정되어 분할 바가 먹지 않았다(버그). `resizeDocks()`로 따라가게 하는 방식은 Qt가 세로 요청에 왼쪽 열 폭까지 다시 계산해(401→492px) 버려서 쓰지 않았다 | 1.0.1 · `edu_inspector.cpp` `setHeightLocked`, `edu_spimview_glue.cpp` `eventFilter` |
| 47 | **Window > Message Log (Ctrl+L)**: 가운데 메시지 로그를 끌 수 있고, 끄면 Text/Data/Editor가 그 자리를 차지한다. 저장·복원. 시뮬레이터가 에러를 보고하면(어셈블·실행 예외, `SpimView::Error()`) 저절로 다시 켜진다. 원본 메시지 상자는 그대로 | 항상 보임 | 화면을 넓게 쓰되 메시지를 놓치지 않게. Ctrl+L은 원본(F5·Shift-F5·F10)·에디터(Ctrl+N/O/S, Ctrl+Shift+S, F3)와 겹치지 않는다 | 1.0.1 · `edu_editor_glue.cpp` `eduSetLogVisible`, `spimview.cpp`(`// EDU:`) |
| 48 | **Editor·Text·Data를 나란히 놓을 수 있다**: `dockOptions`가 `ForceTabbedDocks` 대신 `AllowNestedDocks | AllowTabbedDocks | GroupedDragging`. 탭 하나를 끌어내어 옆·위·아래에 붙이거나 띄우고, 제목줄을 다른 탭 위에 놓으면 다시 탭이 된다. Window > Layout에 프리셋 3개(Tabs / Editor \| Text / Editor / Text), 창 상태 버전 4 | 세 패널이 항상 한 탭 묶음 | VS Code처럼 코드와 결과를 같이 보게 | 1.0.1 · `spimview.ui`, `edu_editor_glue.cpp` `eduArrangePanels` |
| 49 | Assemble 뒤 Text로 "전환"은 Text가 이미 보이면(나란히 배치) 하지 않는다. 에러 때 Editor로 전환도 같다. Text 패널의 Instruction 열은 내용 폭에 맞춘다(최대 38자) — 반쪽 폭에서 Source 열이 남게 | — | 나란히 배치의 의미를 지키려고 | 1.0.1 · `eduAssemble`, `edu_text_view.cpp` `afterReset` |
| 50 | Text 패널의 최소 크기가 300×120(원본 .ui는 800×600 최소). 800×600은 `sizeHint`로 남기고, 첫 실행 창 크기는 1300×830 | 800×600 최소 | 나란히 놓으려면 패널이 작아질 수 있어야 한다 | 1.0.1 · `spimview.ui`, `edu_text_view.h`, `state.cpp` |
| 51 | **이름**: 표시명 "Hallym MIPS Simulator", 실행 파일·설정 저장소 `HallymMIPS`/`HallymMIPS`, 헬프 컬렉션 `help/HallymMIPS.qhc`, MSI ProductName "Hallym MIPS Simulator"·새 UpgradeCode·설치 폴더 `Program Files\Hallym MIPS Simulator`. 화면·문서·파일명에 QtSpim/Edu 표기 없음(About → License 탭, LICENSE, 이 문서의 원본 참조 제외) | "QtSpim", `LarusStone`/`QtSpim` | 한림대학교 수업용 파생판. QtSpim-Edu 1.0.1의 설정 저장소와도 다르므로 셋을 나란히 설치할 수 있다 | H2 · `edu/edu_version.h`, `QtSpim.pro`, `Setup/HallymMIPS_Win_Deployment` |
| 52 | **테마**: 색·글꼴·간격은 전부 `edu/theme/tokens.h`(`docs/design/tokens.md`가 근거)에서 온다. 앱 스타일시트 `edu/theme/light.qss`는 `@name@` 자리를 토큰으로 채워 적용(`edu::theme::styleSheet()`), UI 글꼴 Pretendard 13px는 `QApplication::setFont`, 코드 글꼴 D2Coding 10pt는 설정 기본값(`state.cpp`)이라 Settings 대화상자로 바꿀 수 있다. 위젯이 직접 그리는 색(타입 배지, PC 행 틴트+왼쪽 3px 막대, 선택 행 틴트+진남 글자, pseudo 묶음 띠, 변경값 SemiBold #00736F, 에디터 문법·현재 줄·여백, Data 마커, 에러 목록)도 같은 토큰. 툴바 아이콘은 Lucide SVG를 `tools/make-theme-icons.py`가 토큰 색으로 PNG 렌더한 것(`edu::theme::toolIcon`), 원본 비트맵(`windows_images.qrc`)은 빌드에서 뺐다 | Courier 10pt, 시스템 스타일, 원본 아이콘 | tokens.md. QSS `font-family`는 `setFont()`를 다시 부르는 위젯(표·에디터·인스펙터)에 먹지 않아 코드 글꼴은 `applyPanelFont()` 경로 | H2 · `edu/theme/`, `edu_text_view.cpp`, `edu_register_model.cpp`, `edu_data_model.cpp`, `edu_code_editor.cpp` |
| 53 | 메시지 로그의 **표시** 글꼴·색: `WriteOutput()`의 HTML `font-family:Courier` → 토큰 코드 글꼴, 시작 배너의 초록 → `kTextLog`, `Error()`의 메시지는 `kError`. 저장 로그(`toPlainText`)는 바이트 동일 | Courier, 초록/검정 | tokens.md 5 | H2 · `spimview.cpp`(`// EDU:`), `menu.cpp` `SetOutputColor` |
| 54 | 코드 표 행 높이 **16px**(레지스터 트리·Text·Data), 도크 제목 아래 4px 여백(`eduInsetDockContent`, Text/Data 상자 여백). 1920×1080에서 레지스터 47행 중 41행이 보이고 Reserved 끝·CP0는 스크롤(인스펙터를 닫으면 47행 전부). 왼쪽 열의 세로 975px 중 레지스터 표에 돌아오는 것은 742px이라 47행을 다 넣으려면 행이 15px여야 한다 | 15~16px(3단계: 47행이 1080에 들어가게) | 토큰. H1 결정 ④(스크롤 허용) | H2 · `edu_register_view.cpp` `CompactRowDelegate`, `edu_text_view.cpp`, `edu_data_view.cpp` |
| 55 | 인스펙터의 고정폭 검사(`fixedPitchVersionOf`)는 **동봉 코드 글꼴이면 건너뛴다** | (3단계에서 추가한 검사) | fontconfig가 D2Coding을 dual spacing으로 분류해 Linux에서 `QFontInfo::fixedPitch()`가 false. 글꼴 자체는 고정폭 선언(post, PANOSE) | H2 · `edu_inspector.cpp` |
| 56 | **스플래시**: 시작 시 시그니처(국영문 좌우조합) 카드를 1.2초 또는 클릭까지. 스크립트 캡처 모드에서는 띄우지 않는다(`EduDevtools::wantsCaptureMode`). **About**: 엠블럼 A + 로고타입 + 이름·버전 + License 탭(원본 고지·Qt LGPL·OFL·ISC). 앱 아이콘은 심볼 기본형 16/32/48/256 | 없음 / `QMessageBox` | 브랜딩 | H2 · `edu/theme/edu_theme.cpp` `showSplash`, `edu/edu_about.cpp`, `edu/theme/brand/` |
| 57 | 툴바: Assemble이 아이콘+글자 주요 버튼(`QToolButton#EduAssembleButton`, 2945 채움), 나머지 아이콘만. 구분선으로 파일 / 실행 / 도움말 세 묶음 | 6묶음 | tokens.md | H2 · `spimview.ui` toolBar, `edu_editor_glue.cpp` |
| 58 | 상태바 배지·"Source changed" 띠·버전 라벨·에러 목록은 위젯 스타일시트가 아니라 앱 스타일시트의 객체 이름 규칙(`QLabel#EduModeBadge` 등) | 위젯 `setStyleSheet` 리터럴 | 색 리터럴 0 | H2 · `light.qss` |
| 59 | **시작 배너**: 로그 창의 시작 문구가 `Hallym MIPS Simulator 1.0.0` / `MIPS32 assembler and simulator · AIAC Lab, Hallym University` / `Based on SPIM 9.1.24 by James Larus (BSD). See Help > About > License.` 세 줄. 코어의 `write_startup_message()`(`CPU/spim-utils.cpp:132`)를 **호출하지 않는 것**으로 바꿨을 뿐 `CPU/`는 그대로. 저작권·BSD·LGPL 고지는 About의 License 탭과 LICENSE 파일에 있다 | `SPIM 9.1.24 …` 5줄 + `QtSPIM is linked to the Qt library …` | 프로그램을 켤 때마다 보이는 자리에 다른 제품 이름이 남아 있었다. **화면 표시만** 바뀐다: Save Log File·Print는 레지스터·Text·Data·콘솔만 쓰고 이 창은 쓰지 않는다(`file_SaveLogFile`, `file_Print`). 메시지 창 골든 `syntaxerror-log.txt`·`syntaxerror-run-log.txt` 두 개만 다시 떴고, 저장 로그 골든(`*-log`)은 바이트 그대로. 배너에 버전이 있으므로 **버전을 올릴 때마다 이 둘을 다시 떠야 한다**(`tests/golden/README.md`) | H2 · `menu.cpp` `sim_ReinitializeSimulator` |
| 60 | **Help 메뉴**: `User Guide`(= 툴바 `?`)가 동봉된 학생 안내문(zip의 `HallymMIPS-GUIDE-ko.pdf`, 개발 트리에서는 `docs/GUIDE-ko.md`)을 열고, 원본 SPIM 문서는 `MIPS Reference`로 따로 둔다(툴팁·헬프 창 제목에 원본 문서임을 밝힌다). 헬프 컬렉션에서 QtSpim GUI 설명서(`manual.html`과 그 스크린샷 3장)를 빼고 `HP_AppA.html`(어셈블러·링커·명령어 부록)만 남겼다. 헬프·assistant 탐색 경로는 실행 파일 폴더만 본다 | `View Help` 하나가 QtSpim 설명서를 열고, 표준 QtSpim 설치 폴더까지 찾았다 | 다른 프로그램의 화면을 설명하는 문서였고, 남의 설치 폴더에 기대지 않는다 | H2 · `edu_spimview_glue.cpp` `eduSetupHelpMenu`/`eduShowUserGuide`, `menu.cpp` `help_ViewHelp`, `help/HallymMIPS.qh*` |
| 61 | 설정 저장소의 조직명은 `HallymMIPS`, **도메인 문자열은 설정하지 않는다**(`setOrganizationDomain` 호출 삭제). Linux `~/.config/HallymMIPS/HallymMIPS.conf`, Windows `HKCU\Software\HallymMIPS\HallymMIPS` | `LarusStone`/`QtSpim` | 도메인은 macOS에서만 경로에 쓰이고, 학교 도메인을 제품 식별자로 쓰지 않는다 | H2 · `edu_version.h`, `main.cpp` |
| 62 | 내장 예외 핸들러를 뜻하는 표시값이 `<<Built-in Exception Handler>>` | `<<SPIM Exception Handler>>` | Settings 대화상자에 그대로 보인다. 값의 뜻은 같다(파일 이름이 아니라 sentinel) | H2 · `spimview.cpp` |
| 63 | 어셈블 에러를 **메시지 창에 그릴 때만** `spim: ` 접두사를 뗀다(`(parser)` 분류 표기는 남긴다). 코어가 만드는 문자열(`CPU/parser.y:2952`)과 그것을 받는 `SpimView::Error()`의 인자는 그대로라, 에디터 에러 목록의 파서(`edu/core/edu_asm_errors.cpp`)는 원래 형식을 계속 읽는다. 이 접두사가 붙는 코어 메시지는 이 한 곳뿐이다(`run_error()`에는 없음) | `spim: (parser) syntax error on line …` | 켜자마자 보이는 자리에 남은 마지막 다른 제품 이름. 메시지 창은 Save Log File·Print에 들어가지 않으므로(59번) 화면 표시만 바뀐다 — 메시지 창 골든 2개만 다시 떴고 `*-log` 골든은 그대로 | H2 · `spimview.cpp` `WriteOutput` |
| 64 | 인스펙터: 문서 여백 4→2px, 안쪽 프레임 제거(도크가 카드 테두리를 그린다) | Qt 기본 4px + StyledPanel\|Sunken | 54번의 47행을 위해 8px | H2 · `edu_inspector.cpp` |
| 65 | **시작 화면**: 시그니처·제품명·버전·구분선·`AIAC Lab · Hallym University`·바닥의 2px 진행 바(불확정, 좌→우)를 그리는 480×300 흰 카드. 1.5초 또는 클릭까지. **메인 창과 콘솔은 스플래시가 닫힌 뒤에 나타난다**(`SpimView::eduRevealWindows()`), 그 전에는 뒤에 보이지 않는다. 작업표시줄에 뜨지 않는다(`Qt::SplashScreen`) | 없음 | 로딩 화면. 스크립트 캡처 모드에서는 띄우지 않고 `--capture splash`가 같은 위젯을 grab한다 | H2 · `edu/theme/edu_splash.*`, `main.cpp` |
| 66 | **앱 아이콘이 크기마다 다른 공식 마크**: 16·24·32px은 심볼 기본형, 48·64·256px은 원형 엠블럼 A. 제목 표시줄(16)과 작업표시줄(24·32)은 심볼, 엠블럼은 글자 고리가 읽히는 48px부터. 마크는 변형하지 않고 축소·여백만. `.ico`는 크기마다 다른 이미지를 담아야 해서 `tools/make-theme-icons.py`가 직접 쓴다(Pillow의 `sizes=`는 한 이미지를 리사이즈할 뿐) | 심볼 한 종류 | 48px 아래에서는 엠블럼의 글자 고리가 얼룩으로만 보인다(1.0.1에서 임계값을 16→48로 올렸다). 근거 캡처 `docs/design/captures/app-icon-options.png`(16·24·32·48·64px 3안 비교) | H2 · `tools/make-theme-icons.py`, `theme/brand/HallymMIPS.ico`, `edu_theme.cpp` `apply` |
| 67 | 창 제목이 `helloworld.s \u2014 Hallym MIPS Simulator`(에디터에 파일이 열려 있을 때). Windows에서는 `SetCurrentProcessExplicitAppUserModelID`로 작업표시줄 묶음을 고정 | `QtSpim` 고정 | 편집기 관례. AppUserModelID가 없으면 작업표시줄이 실행한 프로그램의 아이콘으로 묶는다 | H2 · `edu_spimview_glue.cpp` `eduUpdateWindowTitle`, `main.cpp` |
| 68 | **최초 실행 튜토리얼**(7단계 스포트라이트 튜토리얼): 메인 창 위 반투명 오버레이가 패널 하나만 남기고 어둡게 하고, 옆의 카드가 그 패널이 표준 QtSpim과 무엇이 다른지 설명한다. 설정 `Tutorial/Shown`이 없으면 첫 실행에 한 번, 이후에는 Help > Tutorial. 사용자가 닫아 둔 패널의 단계는 빼고 번호를 다시 매기고, 탭 뒤에 있는 패널은 그 단계에서 앞으로 올린다(배치는 바꾸지 않는다). 시스템 언어가 한국어면 한글, 아니면 영어로 시작하고 카드의 토글로 즉시 바꾼다. Esc·건너뛰기로 종료, 바깥 클릭은 무시 | 없음 | 학생이 첫 실행에서 무엇이 다른지 화면 위에서 본다. 스크립트 모드에서는 자동 실행하지 않고 `--tutorial-step N`으로만 띄운다 | H2 · `edu/edu_tutorial.*`, `edu_spimview_glue.cpp` |
| 69 | 도크 탭 제목이 길면 말줄임(`QTabBar::setElideMode(Qt::ElideRight)`). 탭 바는 도크를 묶을 때 Qt가 만들므로 배치를 바꿀 때마다 다시 건다 | 가운데가 잘림(`:ditor: … .s`) | | H2 · `edu_spimview_glue.cpp` `eduElideDockTabs` |
| 70 | **튜토리얼의 카드는 언제나 창 안에**. 위치 계산을 위젯에서 떼어 `edu/core/edu_tutorial_layout.h`의 순수 함수로 만들고, 1366×768·1600×900·1920×1080·2000×1080에서 모든 단계의 카드가 창 안에 들어오는지 단위 테스트(`tst_tutorial_layout.cpp`)와 실행 검사(`--tutorial-report`)로 확인한다. 배치 순서는 대상이 납작한 띠(툴바·열 제목)면 아래→위→오른쪽→왼쪽, 아니면 오른쪽→왼쪽→아래→위이고, 어느 쪽도 안 되면 창 가운데 | 1.0.0: 오른쪽 후보가 창 밖이면 클램프가 있었지만 빈 사각형을 2px 키운 4×4를 대상으로 삼아 좌상단에 붙었다 | Windows에서 카드가 화면 밖에 놓여 [다음]을 누를 수 없었다(진행 불가). 키보드(Enter·Space·→ 다음, ← 이전, Esc 종료)도 안전장치로 추가 | 1.0.1 · `edu/core/edu_tutorial_layout.*`, `edu_tutorial.cpp` |
| 71 | **튜토리얼 오버레이는 메인 창의 자식이 아니라 프레임 없는 최상위 창**(`Qt::Tool | FramelessWindowHint | WindowStaysOnTopHint`, `WA_TranslucentBackground`, `WA_ShowWithoutActivating`)이고, 메인 창의 위치·크기를 따라간다(Move·Resize·WindowStateChange·Activate 감시). 최소화·비활성이면 숨고 돌아오면 다시 뜬다. 키는 `qApp` 이벤트 필터로 받는다(포커스를 가져가지 않으므로). 딤은 스포트라이트와 **카드를 뺀 영역만** 칠하고 카드는 자기 배경을 직접 채운다 | 1.0.0: 메인 창의 자식 위젯 | Windows에서 도크가 네이티브 윈도우로 승격되면 비네이티브 형제를 무조건 덮는다 — 딤이 아예 안 그려지고(탭 배치에서는 카드까지) 가려졌다. 최상위 창은 도크의 네이티브 여부와 무관하다. 캡처 하네스는 두 창을 합성해 찍는다(`grabToFile`) | 1.0.1 · `edu_tutorial.cpp` |
| 72 | **튜토리얼이 예제를 연다**: 아무것도 로드되지 않은 첫 실행에서는 `samples/tutorial.s`(zip·MSI 동봉)를 열고 12스텝 실행한 뒤 시작한다. 이미 연 파일이 있으면 건드리지 않고, 예제가 없으면 그것을 필요로 하는 단계만 빼고 진행한다 | — | 빈 화면에서는 변경 강조·배지·라벨·$sp 마커를 보여 줄 대상 자체가 없다 | 1.0.1 · `edu_spimview_glue.cpp` `eduLoadTutorialSample`, `samples/tutorial.s` |
| 73 | **튜토리얼이 요소를 지목한다**: 스포트라이트가 위젯 전체가 아니라 임의의 사각형 **여러 개**를 받는다(툴바 버튼 묶음, 열 제목 둘, 배지 셀 하나, 라벨 셀, $sp 마커 셀과 버튼). 대상이 스크롤 밖이면 먼저 보이게 하고, 탭 뒤면 앞으로 올린다. 단계는 18개이고 카드에 구역과 번호가 나온다(`툴바 · 4 / 18`) | 1.0.0: 7단계, 패널 전체만 | 패널을 어둡게 하는 것만으로는 "무엇이 다른지"가 전달되지 않는다 | 1.0.1 · `edu_tutorial.cpp` |
| 74 | **툴팁 전수 점검**: 툴바 12개 버튼(이름+단축키), 레지스터 4개 열·그룹 헤더, Text 6개 열과 타입 배지 셀, Data 7개 열·라벨 셀·마커 셀·환경변수 줄, 상태바 배지 2개, "Source changed" 띠, 에디터 상태줄과 에러 목록. 전부 영문 한 줄 + 한글 한 줄 | 일부만 있었다 | 튜토리얼의 툴바 단계는 실제 툴팁 문구를 그려서 보여 준다 | 1.0.1 · 각 모델의 `Qt::ToolTipRole`, `edu_spimview_glue.cpp` |
| 75 | **Windows 제목 표시줄을 밝게**: `DwmSetWindowAttribute`로 다크 모드 제목 표시줄을 끄고(속성 20·19), Windows 11 22H2 이상이면 제목 배경 #FFFFFF·글자 #00205B·테두리 #E1E5EA를 지정한다. 지원하지 않는 빌드에서는 호출이 거부될 뿐이다. 창이 뜰 때와 시스템 테마가 바뀔 때 적용 | 시스템이 다크면 검은 제목 표시줄 | 흰 창에 검은 제목만 따로 놀았다 | 1.0.1 · `edu/theme/edu_theme.cpp` `applyWindowChrome`, `QtSpim.pro`(dwmapi) |
| 76 | **앱 아이콘이 흰 타일 + 심볼**: 캔버스를 꽉 채우는 흰 둥근 사각형(라운드 18%, 1px #E1E5EA 테두리)에 심볼을 타일 폭의 76%로 중앙 배치. 16~256px 모두 같은 구성 | 1.0.0: 마크만(16은 심볼, 48 이상은 엠블럼) | 투명 배경의 납작한 마크는 어두운 작업표시줄에서 작고 흐리게 보였다. 근거 `docs/design/captures/app-icon-taskbar.png` | 1.0.1 · `tools/make-theme-icons.py` |
| 77 | **드래그로 나눈 도크는 균등**: 도크를 끌어다 놓아 배치가 바뀌면(`dockLocationChanged`·`topLevelChanged`) 한 줄에 놓인 도크들의 크기를 `resizeDocks`로 똑같이 맞춘다. 시작 시 복원한 배치와, 사용자가 그 뒤 분할 바를 끈 것은 건드리지 않는다 | 드롭 표시가 가장자리 좁은 띠로 나와 한쪽이 지나치게 좁아졌다 | 검사: `--dock-drop h|v`가 일부러 치우치게 나눈 뒤 균등화 결과의 차이를 잰다(좌우 1px, 상하 1px) | 1.0.1 · `edu_spimview_glue.cpp` `eduEqualiseDocks` |
| 78 | 흰 배경 위 회색 글자를 WCAG AA까지 진하게: `text.2` #5B6B7B → **#5A6472**(6.0), `text.muted` #8A94A0 → **#65707E**(5.0, 옅은 행 위에서도 4.6). 스플래시 제품명은 22px Bold | 줄 번호·주석이 3.1로 기준 미달 | tokens.md 1.4 대비 표 | 1.0.1 · `tokens.h` |
| 79 | **"Source changed" 띠가 원인을 구분한다**: 마지막 성공한 어셈블 시점의 **에디터 내용 해시 + 파일 경로**를 남겨 두고 현재 상태와 비교해 네 문구 중 하나를 쓴다 — 아직 아무것도 어셈블하지 않았으면 `Not assembled yet`, 어셈블했다가 초기화되었으면 `Simulator was reinitialized`, "Add to current program"으로 다른 파일이 얹혔거나 경로가 다르면 `Text shows a different program`, 내용이 바뀌었으면 `Source changed`. 빈 무제 에디터에는 띠를 띄우지 않는다. 한글 설명은 툴팁에 | 원인이 셋인데 문구는 "Source changed" 하나 | Reinitialize 직후 "소스가 바뀌었다"는 말은 사실이 아니다. 판정은 수정 플래그가 아니라 해시라, 외부에서 되돌려진 파일도 옳게 본다. 검사: `check-editor.sh` 8절이 네 경우를 만든다 | 1.0.1 · `edu_editor_glue.cpp` `eduUpdateStaleBanner` |
| 80 | **에디터 글꼴 크기**: `Ctrl+=`·`Ctrl++`(확대), `Ctrl+-`(축소), `Ctrl+0`(기본), `Ctrl+휠`. 8~32pt, 1pt 단위, 끝에서는 조용히 멈춘다. 에디터와 줄 번호 여백만 바뀌고 다른 패널은 설정 글꼴 그대로. 단축키는 `Qt::WidgetWithChildrenShortcut`으로 에디터 도크에만 걸려 다른 패널에서는 반응하지 않는다(검사: `--editor-key text:ctrl+=`). 크기는 `Editor/FontPointSize`에 저장되고, Settings에서 글꼴을 바꾸면 그 크기가 새 기준이 된다. 바꾼 크기는 상태줄 오른쪽에 1.5초 표시 | 없음 | Editor 메뉴에 Zoom In/Out/Reset Zoom을 두어 기능이 있다는 것을 알린다 | 1.0.1 · `edu_code_editor.*`, `edu_editor_glue.cpp` |
| 81 | **튜토리얼이 예제를 여는 조건**: `Help > Tutorial`은 에디터가 **비어 있고 이름도 없을 때만** `samples/tutorial.s`를 연다(`EduEditorDock::isUntouched()` = 경로 없음 + 수정 없음 + 빈 문서). 그 외에는 예제를 열지 않고 현재 화면 그대로 진행하며, 보여 줄 것이 없는 단계는 건너뛰고 번호를 다시 매긴다. 1단계 본문 끝 문장이 둘 중 하나로 갈린다 — 예제를 열었으면 "예제 프로그램을 열어 두었으니…", 아니면 "지금 열려 있는 프로그램으로 진행합니다. 예제로 보려면 편집기를 비우고 다시 실행하세요." | 프로그램이 로드되지 않았으면 무조건 예제를 열었다 | 편집 중에 튜토리얼을 열면 `openFile()`이 "저장할까요?"를 먼저 띄웠다. 학생 파일을 건드리지 않는 것이 튜토리얼보다 먼저다. 검사: `check-editor.sh` 9절이 빈 에디터·미저장 편집·열린 파일 세 경우에서 `sample=`과 대화상자 없음과 1단계 문구를 본다 **(83번으로 대체됨)** | 1.0.2 · `edu_spimview_glue.cpp` `eduShowTutorial`, `edu_tutorial.cpp` |
| 82 | **1단계의 [예제로 보기] 버튼**: 예제를 열지 않은 경우에만 1단계 카드에 보조 버튼(테두리만)을 [건너뛰기] 왼쪽에 둔다. 누르면 저장 확인을 거쳐(취소하면 아무 변화 없음) 시뮬레이터를 초기화하고 예제를 연 뒤 튜토리얼을 1단계부터 다시 시작한다. `samples/tutorial.s`가 없으면 버튼도 문장도 없다. 버튼이 보일 때는 카드 폭을 버튼 4개+단계 표시에 맞춰 넓힌다(한국어 440, 영어 470쯤) | 예제를 못 연 학생은 9단계짜리 튜토리얼만 봤다 | 저장 확인은 학생이 누른 동작이므로 놀랍지 않다. 초기화를 먼저 하는 이유는 `main:`이 두 번 정의되어 파서 오류가 나기 때문. 검사: `check-editor.sh` 9절의 tutorialE(취소)·tutorialF(진행)·tutorialG(어셈블된 파일 위에서 진행, 질문 0회·오류창 0회) **(83번으로 대체됨)** | 1.0.2 · `edu_tutorial.cpp` `useSample`, `edu_spimview_glue.cpp` `eduSwitchToTutorialSample` |
| 83 | **튜토리얼은 언제나 예제를 연다**: `Help > Tutorial`과 최초 실행 모두 초기화 후 `samples/tutorial.s`를 열고 같은 19단계를 돈다. 시작 전에 편집기에 저장 안 한 내용이 있으면 `maybeSave()`로 묻고, **취소면 튜토리얼을 시작하지 않는다**. 저장·버리기를 고르면 `forgetChanges()`로 질문이 두 번 뜨지 않게 한 뒤 연다. 81·82번의 조건부 로드, [예제로 보기] 버튼, 갈리는 1단계 문구는 모두 제거 | 1.0.2: 편집기가 비어 있을 때만 예제를 열고, 아니면 9단계로 줄었다 | 최초 실행이 아닌 학생이 절반만 보는 것이 더 나쁘다. 단계 수가 상태에 따라 달라지지 않는 것이 설명하기도 쉽다. 검사: `check-editor.sh` 9절의 tutorialEmpty·tutorialSaved·tutorialTyped·tutorialCancel | 1.0.3 · `edu_spimview_glue.cpp` `eduShowTutorial` |
| 84 | **예제를 멈추는 지점은 라벨로 정한다**: 로드 뒤 `sum_loop`에 **세 번째로 도달할 때까지** 단계 실행한다(최대 800步, 못 찾으면 경고 후 진입점 그대로). 그 자리에서 스택 프레임이 만들어져 $sp가 16 내려가 있고, 배열 두 개가 더해져 `total`에 18이 쓰여 있으며 $t·$s 레지스터가 바뀌어 있다. 단계 실행은 매번 변경 기준을 새로 잡으므로(`sim_SingleStep`→`eduBeginRunCommand`) 튜토리얼 로드 동안만 `EduRegisterModel::setSnapshotHeld(true)`로 기준을 고정해, 한 번의 실행이 바꾼 것 전부가 청록색으로 남는다 | 고정 횟수(12번) 단계 실행 | 예제를 고치면 12라는 숫자의 의미가 조용히 달라진다. 라벨이면 같이 움직인다 | 1.0.3 · `edu_spimview_glue.cpp` `eduRunToTutorialStop`, `edu_register_model.h` |
| 85 | **스포트라이트는 실제 셀을 찾는다**: 대상은 라벨(`nums`·`total`·`prompt`), 주소(PC, `$sp`), 니모닉(`jal sum_array`, `beq`, `addu`, `j`)으로 찾는다. 행 번호는 쓰지 않는다. Text는 기계어·형식 칸과 PC 줄과 `j`의 BP 칸을, Data는 배열 네 워드·`total`·문자열의 ASCII 칸·프레임에 저장된 $ra와 $s0을, 레지스터는 실제로 바뀐 $sp·$t0 줄을 짚는다. 인스펙터 단계는 그 명령을 실제로 선택해 둔다. 못 찾으면 그 단계를 빼고 `qWarning`과 `--tutorial-report`의 `skipped=`에 남긴다 | 열 머리글만 짚었다 | 머리글은 무엇을 보여 주는지 설명하지 못한다. 검사: `--tutorial-report`가 `steps=19 skipped=0`이어야 한다 | 1.0.3 · `edu_tutorial.cpp` `collectSpots` |
| 86 | **오버레이의 숨김은 애플리케이션 단위로 판단한다**: 메인 창의 `WindowDeactivate`에서 바로 숨기면, 카드를 클릭하는 순간 오버레이가 활성 창이 되어 튜토리얼이 사라진다(마우스로 [다음]을 누르면 튜토리얼이 끝나던 버그). 이제 활성화 변화는 `QTimer::singleShot(0, updateForActivation())`으로 미루고, `QApplication::applicationState()`와 새 활성 창이 우리 것인지로 판단한다. `finish()` 뒤에는 `running_`이 false라 다시 뜨지 않는다 | `WindowDeactivate` → `hide()` | 검사: `--tutorial-click-through`가 창 관리자가 보내는 활성화 이벤트까지 흉내 내어 마우스로만 19단계를 완주하고 Back·건너뛰기·마지막 단계까지 확인한다 | 1.0.3 · `edu_tutorial.cpp` `updateForActivation` |
| 87 | **예제의 스택 프레임은 16바이트**: MIPS ABI는 $sp의 8바이트 정렬을 요구하므로 12바이트 프레임은 정렬을 깬다. `addiu $sp, $sp, -16`에 `sw $ra, 12($sp)`·`sw $s0, 8($sp)`, 0·4는 지역 변수 자리로 비워 둔다. 튜토리얼의 스택 단계는 오프셋을 박아 두지 않고 **$sp부터 네 워드**를 밝힌다 | -12 프레임, +4·+8 두 워드만 밝힘 | 교재·조교 기준에서 지적받을 수 있고, 오프셋을 박으면 예제를 고칠 때 엉뚱한 칸을 짚는다. 실행 결과는 그대로 55, 호출 뒤 $s0=42 보존 | 1.0.4 · `samples/tutorial.s`, `edu_tutorial.cpp` |
| 88 | **최초 실행과 Help > Tutorial은 같은 함수**: 두 진입점 모두 `SpimView::eduShowTutorial()`을 부른다. 시작 경로가 더하는 것은 `Tutorial/Shown` 검사와 250ms 지연뿐이다. devtools `--tutorial-first-run`이 시작 경로를 그대로 타고(타이머를 실제로 기다린다), `--tutorial-report`가 로드한 파일·정지 지점(PC·$sp)·단계 수·각 카드의 사각형·한국어와 영어 제목과 본문을 모두 찍는다 | 같은지 확인된 바 없었다 | 검사: `check-editor.sh` 10절이 두 경로의 보고 60줄을 `diff`로 비교한다. 한 줄이라도 다르면 실패 | 1.0.4 · `edu_devtools.cpp`, `main.cpp` |
| 89 | **튜토리얼이 어떤 경로로 끝나도 아무것도 남지 않는다**: 완주·건너뛰기·Esc·창 닫기 네 경로가 모두 `finish()`로 모인다. `closeEvent`를 추가해 창 관리자가 닫아도 `running_`이 내려가고, 애플리케이션 이벤트 필터와 따라다니는 타이머가 함께 정리되며 메인 창이 다시 활성화된다. 오버레이는 클릭에도 포커스를 가져가지 않는다(`mousePressEvent`의 `setFocus()` 제거) | 창을 닫으면 숨기만 하고 계속 running 상태였다 | 남아 있는 튜토리얼은 키를 가로채고 250ms마다 단계의 패널을 앞으로 끌어와, 재시작 전까지 창이 말을 안 듣는 것처럼 보인다. 검사: `--tutorial-exit <finish|skip|escape|close>`가 네 경로마다 running·visible·키 입력 도달을 보고하고, 이어서 `--click-tab Data`가 실제 클릭으로 탭 전환을 확인한다 | 1.1.0 · `edu_tutorial.cpp` |
| 90 | **아래쪽은 Console / Messages 탭 패널**: 별도 창이던 콘솔과 중앙 위젯이던 메시지 창을 한 도크의 두 탭으로 합쳤다(`edu/edu_bottom_panel.*`). `Console::WriteOutput`과 `ReadChar`의 `activateWindow()`는 `SpimView::eduRevealConsole()` 호출로 바뀌어, 출력이 있으면 Console 탭이 앞으로 나오고 입력 syscall이면 키보드 포커스까지 받는다. 오류는 `eduShowLog()`가 Messages 탭을 앞으로 내보내고, 다른 탭을 보고 있었으면 탭에 점이 붙는다. Ctrl+L은 패널 전체를 접는다. Window > Console은 탭을 여는 동작으로 바뀌었다 | 콘솔은 별도 최상위 창, 메시지 창은 중앙 위젯 | 창이 뒤로 숨으면 출력이 어디로 갔는지 알 수 없다. 로그 저장·인쇄가 읽는 위젯은 그대로여서 골든은 바이트 동일. 검사: `check-editor.sh` 11절(입력 syscall·오류 시 탭 전환·실행 후 Console 유지) | 1.1.0 · `edu_bottom_panel.*`, `console.cpp`, `menu.cpp` |
| 91 | **Instruction Inspector**: 인스펙터는 명령어 전용이 되고 그림으로 그린다. 32칸 비트 그리드(필드마다 색, MSB/LSB 라벨, 칸 위 비트 번호), 필드별 줄(이름·비트 범위·2진수·값·뜻), 분기·점프의 목적지 계산식. 폭이 좁으면 31–16 / 15–0 두 줄로 접는다. 레지스터·메모리 선택에는 반응하지 않으며, 메모리 워드의 주소·hex·10진·가리키는 레지스터는 Data 셀 툴팁으로 옮겼다 | 레지스터·명령어·메모리를 텍스트로 나열하던 도크 | 세 가지를 한 위젯에 욱여넣으니 어느 것도 잘 보이지 않았다. 레지스터 2진수는 Registers > Binary에 이미 있다. 검사: `--inspector-report`가 그리는 내용을 텍스트로 찍는다 | 1.1.0 · `edu_instruction_inspector.*` |
| 92 | **세 열 배치, 프리셋 둘**: 왼쪽 레지스터 탭뷰(Int/FP), 가운데 Editor + Console/Messages, 오른쪽 Text/Data + Inspector. 모든 도크를 한 도크 영역에 넣고 `splitDockWidget`으로 나눈다(영역이 다르면 `resizeDocks`가 서로를 못 본다). 중앙 위젯은 0×0. 비율은 창이 실제 크기가 된 뒤에 적용한다(`eduApplyLayoutSizes`, 레지스터 380px·가운데와 오른쪽 50:50·위아래 65:35). 저장된 창 상태 버전은 5 | 탭/좌우/상하 세 프리셋, 인스펙터는 왼쪽 아래 | 탭 하나에 다 넣으면 학생이 화면을 옮겨 다녀야 한다. Window > Tile은 프리셋 1로 되돌린다 | 1.1.0 · `edu_spimview_glue.cpp` `eduApplyLayout` |
| 93 | **튜토리얼 문구에서 QtSpim 비교를 뺀다**: 20단계 본문(한/영)을 "무엇을 보여 주는 화면이고 어떻게 쓰는가"로 다시 썼다. 카드 본문은 회색을 쓰지 않는다(#2B3440 Medium 14px, 줄 간격 1.5), 제목 #00205B SemiBold 15px, 건너뛰기·이전 글자 #00205B, 언어 토글 #0055A5 | "표준 QtSpim에는 없는 기능입니다" 같은 문장, 본문은 #1F2933 13px | 튜토리얼의 독자는 QtSpim을 써 본 적 없는 학생이다. 비교는 README와 안내문이 한다 | 1.1.0 · `edu_tutorial.cpp` |
| 94 | **시작 배너는 앱 실행당 한 번**: `sim_ReinitializeSimulator()`가 매번 찍던 3줄을 `eduBannerShown`으로 한 번만 찍는다. 이후 초기화는 `Memory and registers cleared`만 남긴다 | 초기화마다 3줄 | 튜토리얼 한 번에 두 번씩 쌓여 Messages가 배너로 찼다. 로그 저장·인쇄가 읽는 위젯이 아니므로 vanilla 바이트 동일 규칙과 충돌하지 않는다(메시지 창 골든 2개만 갱신) | 1.2.0 · `menu.cpp` |
| 95 | **Bare Machine은 UI에서 뺀다**: Settings의 체크박스와 프리셋 버튼을 숨기고 `bare_machine`을 항상 false로 두며 상태바 배지에서도 제외. 디코더의 두 분기 규약과 오라클 테스트는 그대로. 명령줄 `-bare`는 남겼다 — `Tests/*.bare.s`가 그 모드용이고 `regress.sh`가 vanilla와 대조하기 때문 | 체크박스와 배지 | 켜 두면 li·la·move가 문법 오류가 되어 학생이 자기 코드에서 원인을 찾는다 | 1.2.0 · `menu.cpp`, `state.cpp`, `main.cpp` |
| 96 | **등폭 열에는 굵기를 쓰지 않는다**: 변경된 레지스터는 색(#00736F)과 옅은 틴트(#E6F6F5)로만 표시하고, 레지스터 이름·번호·그룹 제목, Text의 Instruction 열에서 굵기를 뺐다 | 변경 값·이름·명령어 열이 SemiBold | D2Coding에는 볼드 페이스가 없어 Windows가 합성하고, 합성된 볼드는 폭이 넓어 열 정렬이 깨진다(Windows 스크린샷에서 확인) | 1.2.0 · `edu_register_model.cpp`, `edu_text_model.cpp` |
| 97 | **명령어 약어 풀이**: `edu::mnemonicExpansion()`이 113개 니모닉의 영문 풀이를 준다(`lui` → Load Upper Immediate). 그 자체가 단어인 명령(add, and, or, nop…)은 빈 문자열. 인스펙터가 기계어 줄 아래 한 줄로 보여 준다 | 없음 | 한글 설명은 넣지 않는다(영문 약어의 풀이이므로) | 1.2.0 · `edu_decoder.cpp` |
| 98 | **레지스터 열: 폭 자유, 이름 열 고정**: 폭은 드래그로 바꾸고 창 상태와 함께 저장되며 프리셋·Tile에서만 기본값으로 돌아간다. Name·No.는 같은 모델·같은 선택을 쓰는 두 번째 뷰(`frozen_`)로 왼쪽에 겹쳐 두어 가로 스크롤에도 남는다. 최소 폭은 이름+번호 | 폭 고정(380px), 2진수에서 이름 열이 밀려 나감 | 2진수 값은 39자라 가로 스크롤이 필수인데, 이름이 같이 밀리면 어느 레지스터인지 알 수 없다. 탭 제목에서 진법 표시`[16]`도 뺐다(열 머리글이 이미 말한다) | 1.2.0 · `edu_register_view.cpp` |
| 99 | **2×2 경계는 한 몸처럼 움직인다**: 세로선은 도크 레이아웃이 이미 두 행을 함께 움직이고, 가로선은 `eduSyncSplits()`가 따라가는 열의 아래 패널 높이를 한 번 고정(`eduHoldDockSize`)해 줄을 맞춘다. 교차점에는 12×12 `EduCrossHandle`을 두어 두 축을 동시에 끈다. 패널이 닫히거나 떠 있으면 블록이 아니므로 아무것도 동기화하지 않는다 | 열마다 가로선이 따로 놀았다 | 검사: `--drag-split vertical|horizontal|cross`가 세 경우와 패널을 닫은 경우를 본다. 드롭 재배치의 50:50 균등화는 그대로, 경계 드래그 결과는 건드리지 않는다 | 1.2.0 · `edu_cross_handle.*`, `eduSyncSplits` |
| 100 | **File > Load File 제거**: 남은 하나는 `Open`(Ctrl+O)이고 항상 초기화 후 로드한다. "현재 프로그램에 추가" 3버튼 대화상자도 함께 제거 | Load File / Reinitialize and Load File 두 개 + 확인 대화상자 | 한 파일 실습에서 덧붙이기는 `main` 중복 오류의 원인일 뿐이다. 최근 파일·명령줄·Ctrl+S·튜토리얼 예제 모두 같은 경로 | 1.2.0 · `menu.cpp`, `spimview.ui` |
| 101 | **빈 에디터의 시작 화면**: 파일이 없으면 에디터 자리에 [새 파일]·[파일 열기] 두 버튼과 Ctrl+S 안내 한 줄. 새 파일은 Save As를 먼저 물어 저장 위치를 받고 그 경로로 시작한다(무제 문서를 만들지 않는다). 최근 파일 목록은 두지 않는다 | 빈 편집창 | 실습실 PC는 공용이라 앞사람 경로가 남으면 안 된다 | 1.2.0 · `edu_editor_dock.cpp` |
| 102 | **튜토리얼은 화면을 빌리고 돌려준다**: 시작할 때 예제를 읽기 전용으로 열고 진법(Hex)·단위(word)·Text 표시·배치(프리셋 1)를 기본값으로 맞춘다. 끝나면(네 경로 모두) 설정을 되돌리고 에디터를 닫아 시작 화면으로 간다 | 예제가 편집 가능한 채로 남았다 | 카드가 "Hex 열과 Decimal 열"이라고 말하는데 화면이 2진수이면 설명이 틀린 것이 된다. 검사: `check-editor.sh` 13절 | 1.2.0 · `eduTutorialTakeSettings`, `eduTutorialFinished` |
| 103 | **시작 화면 카드가 매번 묻는다**: 스플래시에 [튜토리얼 보기]·[바로 시작] 두 버튼을 두고 자동 넘김과 진행 바를 없앴다. `Tutorial/Shown` 설정과 최초 실행 판정은 폐기 | 1.5초 뒤 자동으로 닫히고, 최초 실행에만 튜토리얼 | 실습실 PC에서는 첫 사용자만 튜토리얼을 보게 된다. 기본 포커스는 [바로 시작], Esc도 그쪽 | 1.2.0 · `edu_splash.*`, `main.cpp` |
| 104 | **스포트라이트는 가로 스크롤까지 계산한다**: 대상 셀을 양방향으로 스크롤해 보이게 한 뒤 뷰포트 좌표로 옮기고, 뷰포트 밖은 잘라낸다. 8×6px보다 작아지면 아예 표시하지 않는다 | 세로만 처리 | 2진수 모드에서 빈 줄이나 셀 절반을 강조했다 | 1.2.0 · `edu_tutorial.cpp` |
| 105 | **패널 글자 크기**: Text·Data·Instruction Inspector·Console/Messages가 각각 `EduPanelZoom`을 가진다. Ctrl+= / Ctrl+- / Ctrl+0, Ctrl+휠, 우클릭 메뉴, 8~32pt, 패널별 설정 키(`Text/FontPointSize` 등). Settings의 "All panels text size"가 한 번에 맞춘다 | 에디터만 조절 가능 | 인스펙터 내부 글자도 본문 크기에 맞추고(비트 번호는 한 단계만 작게) 회색 대신 본문색을 쓴다 | 1.2.0 · `edu_panel_zoom.*`, `edu_instruction_inspector.cpp` |
| 106 | **zip을 평평하게**: 압축 파일 루트에 `HallymMIPS.exe`가 바로 오게 하고 감싸는 폴더를 없앴다. 패키징 스크립트가 루트에 exe가 있는지, 최상위가 디렉터리 하나뿐은 아닌지 검사한다 | zip 안에 같은 이름의 폴더가 한 겹 더 | 탐색기의 압축 풀기가 zip 이름으로 폴더를 만들어 `…-win64\…-win64\HallymMIPS.exe`가 됐다 | 1.2.0 · `tools/package-windows.ps1` |
| 107 | **세 패널에 가로 스크롤과 고정 열**: Text·Data·Registers 모두 내용이 넘치면 가로 스크롤바가 나온다. Text의 Source 열은 늘이지 않고 내용 폭에 맞춰(`fitSourceColumn`) 긴 줄이 잘리는 대신 오른쪽으로 흐르게 했다. 왼쪽 고정 열은 Registers의 Name·No.(1.2.0), Data의 Address, Text의 BP·Address다. 구현은 `EduFrozenColumns` 하나로 모았다 — 같은 모델·같은 선택 모델을 보는 두 번째 뷰를 왼쪽에 얹고 세로 스크롤·글꼴·열 폭·펼침을 맞춘다. 행 전체를 한 줄로 그리는 행(세그먼트 머리글, 0 반복 구간)은 고정 띠가 글자를 자르지 않도록 **띠 오른쪽에서 시작**하고, 고정 사본은 그 글자를 그리지 않는다 | 가로 스크롤바가 없어 2진수 값과 주석 달린 원본 줄을 볼 방법이 없었다. 고정 열은 레지스터에만 있었다 | Text에서 BP·Address를 고른 이유: BP는 브레이크포인트를 찍는 칸이라 손이 닿아야 하고, Address는 그 행이 **어느 명령어인지**를 말하는 유일한 열이다. Comments를 켜면 Source가 둘을 왼쪽으로 밀어낸다. 고정 띠 위의 클릭·더블클릭·오른쪽 클릭은 `EduFrozenColumns`가 패널의 핸들러로 넘긴다(`--click-bp`도 이제 띠를 누른다) **정렬은 구조로 보장한다(1.2.2)**: 고정 띠는 행 높이를 스스로 정하지 않는다 — `EduFrozenRowDelegate`(`edu_frozen_columns.cpp:31,38`)가 그리기는 패널이 준 델리게이트에 맡기고 높이는 패널에 물어보며, `sync()`가 띠의 헤더 높이를 패널 헤더에 고정하고(`edu_frozen_columns.cpp:172`) 세로 스크롤 모드까지 복사한다. 세 패널 모두 세로도 픽셀 단위로 스크롤한다(`edu_text_view.cpp:184`, `edu_data_view.cpp:131`, `edu_register_view.cpp:87`). 디버그 빌드는 띠가 그려질 때마다 어긋남을 경고한다 | 1.2.1 · `edu/edu_frozen_columns.*`, `edu_text_view.cpp`, `edu_data_view.cpp`, `edu_register_view.cpp` |
| 108 | **가로 위치는 학생 것이다**: `scrollTo()`는 두 축을 다 움직이고 `setCurrentIndex()`도 스크롤하므로, 스텝·Go to·모델 갱신이 패널을 옆으로 밀어 보던 자리를 잃게 했다. `EduKeepHorizontalScroll`(범위 안에서 값을 그대로 되돌리는 RAII)로 선택·갱신 경로를 모두 감쌌다. 튜토리얼은 예외 — 짚을 셀을 보이게 하려면 옆으로 가야 한다 — 이지만 시작 때 세 패널의 가로 위치를 적어 두고 끝나면 되돌린다. 되돌리기는 즉시 되지 않는다: 예제를 닫고 초기화하면 열 폭이 다음 레이아웃에서야 정해져 그 전에는 범위가 0이라 값이 잘린다. 그래서 10ms 간격으로 최대 20번 다시 시도한다 | 가로 위치를 지키는 곳이 없었다 | 검사: `--hscroll-report`가 세 패널을 범위 중간으로 보낸 뒤 스텝·선택·갱신을 거치며 값을 확인하고, `--tutorial-exit`가 튜토리얼 전후 값을 비교한다. `check-editor.sh` 14절 | 1.2.1 · `edu/edu_view_scroll.*`, `edu_spimview_glue.cpp` `eduTutorialPutScrollBack` |
| 109 | **시작 화면 버튼과 용어 통일**: 두 버튼의 테두리를 항상 2px로 두고 포커스는 **색만** 바꾼다(전에는 포커스에서 테두리가 생겨 그만큼 글자 자리를 빼앗아 한글이 좌우로 잘렸다). 두 버튼은 넓은 쪽에 맞춰 같은 크기(`setFixedSize`)다. 그리고 앱·안내문 전체에서 "투어 / tour"를 "튜토리얼 / Tutorial"로 통일했다(코드 식별자 포함, 잔여 0) | 포커스에서 `border: none` → `2px`, 버튼 크기 제각각, 같은 것을 투어·튜토리얼 두 이름으로 불렀다 | Windows 스크린샷에서 [바로 시작]의 글자가 잘렸다. 용어가 둘이면 안내문과 화면이 다른 것을 가리키는 것처럼 읽힌다 | 1.2.1 · `edu/theme/edu_splash.cpp`, 전 파일 |
| 110 | **U — 이름과 값이 다른 행에 있던 이유, 두 가지**. (가) 1.2.0: `initFrozen()`이 고정 띠에 델리게이트를 주지 않아, 패널은 `CompactRowDelegate`가 정한 높이(측정 20px)를 쓰고 띠는 스타일 기본값(21px, 사용자 글꼴에서는 24px)을 썼다 → 행마다 누적으로 벌어진다. (나) 1.2.1: 띠의 기하를 `패널 viewport 높이 + 패널 헤더 높이`로 만들면서 **띠 자신의 헤더 높이는 맞추지 않아** 두 viewport가 3~8px 달랐고, `ScrollPerItem`에서는 범위 끝의 오프셋이 viewport 높이로 계산되므로 Text 패널이 아래쪽에서 어긋났다(측정: `vp=423` vs `420`) | 증상만 보고 폰트·진법·리셋마다 따로 맞추기 | 재현: `--align-sweep`가 패널×진법×글자크기×접힘×스크롤×시점×창크기 48조합에서 **픽셀 행마다 두 뷰에 "이 자리는 몇 번째 행이냐"고 묻는다**. v1.2.0 레지스터 54조합 FAIL, v1.2.1 Text 8조합 FAIL, 수정 후 48/48 PASS. 검사: `check-editor.sh` 15절 | 1.2.2 · `edu/edu_frozen_columns.*` |
| 111 | **V — 갱신할 때 한 프레임 옆으로 밀리던 이유**: `scrollTo()`는 두 축을 다 움직이고(`PositionAtCenter`는 가로도 가운데 맞춤) `setCurrentIndex()`도 스크롤한다. 스크롤 값이 바뀌는 즉시 `QAbstractScrollArea`가 `viewport()->scroll()`로 blit하므로(Windows는 `ScrollWindowEx`), **사후에 값을 되돌리는 방식으로는 이미 그려진 프레임을 취소할 수 없다.** 이제 세 뷰가 `scrollTo()`를 덮어써서 `EduKeepHorizontalScroll` 안에서 기반 구현을 부르고, 그 가드가 viewport의 갱신을 꺼 둔다(`edu_view_scroll.cpp:22,31`) — `QWidget::scroll()`은 갱신이 꺼져 있으면 즉시 돌아오므로 blit 자체가 없고, 가드가 풀릴 때 viewport를 통째로 다시 그린다. 화살표 키는 예외(`keyNavigating_`): 오른쪽 열로 선택이 가면 보여 줘야 한다 | 사후 복구만(1.2.1) | 재현: `scrollContentsBy()`에서 **가로 이동이 갱신이 켜진 채 일어난 횟수**를 센다(`edu_view_scroll.cpp:64`). 이것이 "학생이 본 프레임"의 정의다. 수정 전 17회(`TextSegView +141/−141`, `IntRegView +102/−102` …), 수정 후 0회. 검사: `check-editor.sh` 14절 "not one frame was drawn with a panel moved sideways" | 1.2.2 · `edu/edu_view_scroll.*`, 세 뷰의 `scrollTo`/`scrollContentsBy` |
| 112 | **W — 모든 패널이 끝까지 읽힌다**: Registers·Text·Data·Editor·Console·Messages 여섯 개가 가로·세로 모두 `Qt::ScrollBarAsNeeded`이고, 마지막 열이 실제로 화면 안으로 들어오는지, Shift+휠이 듣는지를 `--scrollbar-report`가 확인한다. Shift+휠은 플랫폼이 가로 휠로 바꿔 주지 않을 때만 우리가 처리한다(`edu_view_scroll.cpp:35`) — 이미 가로 델타가 온 경우와 Ctrl(글자 크기)은 건드리지 않는다. Console·Messages는 줄을 접으므로 가로 범위가 0이고, 그것이 맞다 | 에디터는 Shift+휠이 듣지 않았다 | 검사: `check-editor.sh` 14절 | 1.2.2 · `edu/edu_view_scroll.*`, `edu_code_editor.cpp` |
| 113 | **Y — 패널을 창 밖으로 뺄 수 없다**: 일곱 개 도크 전부에서 `DockWidgetFloatable`을 뺐다(`edu_editor_glue.cpp:193`). 띄우기 버튼도, 제목 표시줄 더블클릭도, 창 밖으로 끌어내기도 사라진다. 놓을 자리는 배치가 쓰는 한 영역으로 제한한다(`edu_editor_glue.cpp:196`). 일곱 개 모두 Window 메뉴에 항목이 있어 닫기는 그대로 둔다(Editor·Instruction Inspector는 `toggleViewAction`). 예전 설정이 떠 있는 도크를 담고 있을 수 있으므로 `eduDockEverything()`이 전부 다시 도킹시킨다 | 다섯 개 도크가 띄울 수 있었다 | 학생 스크린샷에서 Editor가 독립 창으로 떨어져 나와 Console과 Text를 가렸고, 되돌리는 법을 알 수 없었다. 검사: `--dock-report`, `check-editor.sh` 16절(떠 있는 상태가 담긴 saveState를 복원시킨 뒤에도 0개) | 1.2.2 · `edu/edu_editor_glue.cpp`, `edu_spimview_glue.cpp` |
| 114 | **X — Assemble은 한 번의 사이클이다**: Ctrl+S·F3·툴바 Assemble이 "저장 → 메모리·레지스터 초기화 → 그 파일 어셈블"을 한 동작으로 수행하고, 사이클 안의 초기화는 자기 줄을 찍지 않는다(`menu.cpp:245`의 `eduAssembleCycle`). 끝에 한 줄만 남는다 — `p.s assembled (1 breakpoint(s) kept)`. 브레이크포인트는 **주소가 아니라 문장**으로 기억한다: 코어가 명령어마다 들고 있는 소스 줄의 번호와 그 뒤 문장 텍스트(`edu/core/edu_source_text.cpp`의 `sourceLineNumber`/`sourceLineStatement`)를 적어 두고, 어셈블 뒤 **같은 문장을 가진 가장 가까운 줄**에 다시 건다. 위에 줄이 끼어들어도 따라가고, 그 문장이 사라졌으면 조용히 버린다. 에디터의 커서·스크롤과 세 패널의 가로 위치도 사이클 전후로 유지된다 | Ctrl+S마다 "Memory and registers cleared"가 쌓이고 브레이크포인트가 사라졌다 | **"undefined symbol을 삼킨다"는 지시는 전제가 달랐다**: 그 메시지는 어셈블이 아니라 **실행**이 낸다(`CPU/run.cpp:240` — `EXPR(inst)->symbol->addr == 0`). 재현: `--trigger action_Sim_Reinitialize --run`이면 아무것도 로드하지 않은 채 시작 스텁의 `jal main`을 실행해 그 오류와 모달이 뜬다. 그래서 사이클 안에서 삼킬 것이 없고, 대신 **프로그램이 없을 때의 그 메시지만** 사람 말로 바꿔 메시지 창에만 적는다(`spimview.cpp`의 `Error()`, `!eduProgramLoaded` 조건). 시뮬레이터의 동작은 그대로라 골든에 영향이 없다. Save Log File은 Regs·Text·Data·Console 넷만 쓴다(`menu.cpp`의 `file_SaveLogFile`) — Messages는 대상이 아니므로 vanilla 바이트 동일 규칙과 무관하다(regress 재실행 통과). 검사: `check-editor.sh` 17절 | 1.2.2 · `edu/edu_editor_glue.cpp`, `menu.cpp`, `spimview.cpp`, `edu/core/edu_source_text.*` |
| 115 | **Z — 세 번째 배치: Editor·Text·Data를 한자리에**. 1920 화면의 좌우 절반(960px)에서 두 열로 나누면 코드 열이 300px씩이라 아무것도 읽히지 않는다. 배치 2는 세 패널을 **하나의 탭 영역**에 모아 Text가 657px, 레지스터가 제 폭 380px를 갖는다(측정: 배치 0·1은 text 300 / registers 200). Registers는 왼쪽, Console·Messages와 Instruction Inspector는 아래 그대로다. Window > Layout의 세 번째 항목, `action_Edu_LayoutTabbed` | 두 배치뿐 | **탭 뒤의 패널은 "Source changed" 띠를 보여 줄 수 없으므로 탭에 점(●)을 단다.** 점은 **도크의 windowTitle**에 넣는다 — Qt는 레이아웃을 다시 할 때마다 탭 글자를 도크 제목에서 다시 만들기 때문에 탭에 직접 쓴 글자는 다음 패스에 사라진다. 같은 이유로 에디터 도크 제목을 "Editor: 파일명*"에서 "Editor"로 줄이고 파일명은 에디터 아래 줄로 옮겼다(탭에서 좌우가 잘렸다). `raise()`만으로는 탭이 바뀌지 않는다: z-order가 실제로 바뀔 때만 Qt가 알아채므로 이미 맨 위인 도크는 아무 일도 일어나지 않는다 — `eduBringToFront()`가 lower→raise 후 탭 바에 직접 말한다. 튜토리얼은 짚을 패널을 앞으로 가져오고 끝나면 학생이 보던 탭을 되돌린다. U·V의 검사가 이 배치에서도 통과한다(sweep에 `tabbed` 시점 추가, 54조합). 검사: `check-editor.sh` 18절 | 1.2.2 · `edu/edu_spimview_glue.cpp`, `edu_editor_glue.cpp`, `edu_editor_dock.cpp` |
| 116 | **AA — 매 실행이 같은 화면에서 시작한다**: 시작할 때 `restoreGeometry()`/`restoreState()`를 부르지 않고 종료할 때 저장도 하지 않는다. 기본 화면은 `eduApplyDefaultState()` 한 곳에 모였다 — 창 크기(화면의 5/6, 가운데, 800~1600×600~1000으로 클램프), 배치 0, 모든 패널 열림, 진법 16/16, 단위 word, Text·Data 토글 전부 켬, 모든 패널 글자 크기 기본값, 열 너비 재계산(`resetColumnWidths()`), 스크롤 0, 앞에 오는 탭(Int Regs·Text·Editor·Console). `readSettings()`가 시작할 때 이 함수를 부르고, **Window > Reset Layout**(옛 "Restore to default", 재시작을 요구하던 것)이 같은 함수를 부른다. 이전 버전이 남긴 화면 상태 키는 `eduForgetScreenSettings()`가 시작 때 한 번 지운다 | 상태를 저장·복원했다(원본 QtSpim과 같게) | 실습실 PC는 여러 학생이 돌아가며 쓴다. 앞사람의 배치·확대·진법을 물려받은 다음 학생은 자기가 뭘 잘못한 줄 안다 — 최근 파일을 시작 화면에 넣지 않기로 한 것과 같은 이유다. **기능 설정은 그대로 둔다**: 예외 핸들러 경로, Delayed branches/loads, Mapped IO, Quiet, Accept pseudo, 시작 주소, 명령줄 인자, Settings의 글꼴 종류·색. 패널 글자 크기(`*/FontPointSize`)는 더 이상 쓰지도 읽지도 않는다. 부수 효과로 `eduHoldDockSize()`가 레이아웃 요청을 한 번 더 흘려보내고 `eduApplyLayoutSizes()`가 레지스터 열이 제 폭을 얻을 때까지(또는 더 나아지지 않을 때까지) 최대 10번 다시 시도한다 — 저장된 상태가 없으니 첫 배치가 곧 학생이 보는 배치다. 검사: `check-editor.sh` 19절 | 1.2.2 · `state.cpp`, `edu/edu_spimview_glue.cpp` |
| 117 | **알려진 취약점 — 레이아웃이 정해지기를 기다리는 재시도 루프 두 개**. `eduTutorialPutScrollBack()`(10ms 간격 최대 20회)과 `eduApplyLayoutSizes()`(10ms 간격 최대 10회, 레지스터 열 폭이 더 나아지지 않으면 중단)는 둘 다 "언젠가 레이아웃이 정해진다"에 기댄다. 한도를 넘기면 **조용히 잘못된 상태로 남는다** — 전자는 세 패널이 학생이 두고 간 자리보다 **왼쪽**에 있게 되고, 후자는 **레지스터 열이 좁고 옆의 두 열이 넓은** 채로 굳는다. 디버그 빌드는 한도를 소진할 때 각각 `qWarning`을 남긴다 | — | 느린 실습실 PC나 예상보다 오래 걸리는 레이아웃에서 터질 수 있다. **Windows에서 배치가 이상하게 뜨면 여기를 먼저 본다.** 구조적으로는 "레이아웃이 끝났다"는 신호를 받아 한 번만 적용하는 쪽이 옳지만, Qt의 도크 레이아웃에는 그런 신호가 없다(`resizeDocks()`는 요청일 뿐이고 `QEvent::LayoutRequest`는 도크 스플리터가 자리를 잡기 전에 온다). 지금은 기록만 해 둔다 | 1.2.2 · `edu/edu_spimview_glue.cpp` |
| 118 | **마지막 파일도, 최근 파일도 다음 실행으로 넘기지 않는다**(AA의 연장): `Editor/LastFile`(마지막 파일 다시 열기), `Editor/RecentFiles`(Editor > Open Recent), `FileMenu/RecentFile*`(File 메뉴의 최근 파일)을 저장하지도 읽지도 않고, 시작할 때 `Editor`·`FileMenu` 그룹을 통째로 지운다. 세션 안에서는 그대로 동작한다(메모리 목록 `eduEditorRecentFiles`·`st_recentFiles`) | 원본 QtSpim은 최근 파일을 기억하고, 우리는 마지막 파일까지 다시 열었다 | 공용 실습실 PC에서 앞사람의 파일 경로가 다음 학생 화면에 남는다. 마지막 파일을 다시 여는 동작은 부작용이 하나 더 있었다 — 1.1.0에서 만든 **시작 화면([새 파일]/[파일 열기])이 사실상 첫 실행에만 보였다.** 이제 설정 파일에 남는 것은 `[RegWin]`·`[TextWin]`의 글꼴·색과 `[Spim]`의 기능 설정뿐이다(실제 파일로 확인). 검사: `check-editor.sh` 19절 | 1.2.2 · `state.cpp`, `edu/edu_editor_glue.cpp` |

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

| 시나리오 | 원본 렌더링(f26128f) | 5단계 |
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

세 출처를 합친다(`SpimView::eduCollectLabels()` — 텍스트 세그먼트가 다시 그려질 때, 즉 로드·Reinitialize 뒤):

1. **파일을 읽는 시점의 `print_symbols()`** — `eduReadAssemblyFile()`(`QtSpim/edu/edu_loader.cpp`)이 코어의 `read_assembly_file()`
   (`CPU/spim-utils.cpp:170-188`)과 **줄 단위로 같은 호출**을 하면서 `flush_local_labels()` 직전에 한 번 캡처한다. 로컬 라벨 전부가 여기서 들어온다
   (`msg`, 참조되지 않는 `bytes`·`half`까지). File 메뉴와 명령행 두 로드 지점이 이 함수를 쓴다. Reinitialize(`InitializeWorld`) 때 비운다.
2. **지금의 `print_symbols()`** — 전역 라벨. 예외 핸들러는 코어가 직접 읽으므로(`initialize_world()`) 1번에 없고, 그 전역 라벨이 여기로 들어온다.
3. **명령어가 참조하는 라벨**(`EXPR(inst)->symbol`) — 예외 핸들러의 로컬 라벨(`__m1_` 등)이 이렇게 들어온다.

캡처는 `write_output()`의 `eduOutputCapture` 스위치(`QtSpim/spim_support.cpp`, `// EDU:`)로 하고 `edu::parseSymbolListing()`이 파싱한다.

**복제가 코어와 어긋나지 않는다는 근거**(`tests/edu_loader/tst_loader.cpp`, 코어를 링크한 테스트):
`Tests/*.s` 전부 + 샘플을 Makefile의 플래그와 GUI 기본 모드 양쪽에서, 코어 로더와 복제 로더로 각각 읽은 뒤
명령어(코어의 `format_an_inst` 줄), 0이 아닌 데이터 워드, 세그먼트 경계, 에러 메시지 목록, 로드 후 심볼 테이블을 비교한다.
같은 테스트가 **소스에 정의된 라벨 수 = 캡처된 라벨 수**도 확인한다(syntax error로 파싱이 멈춘 파일은 그 줄까지만 센다 — 에러 줄의 라벨은 등록된 뒤다).
GUI 수준에서는 기존 골든 26개(로드 직후 포함)와 새 `syntaxerror-*` 골든 5개(파일 중간 syntax error: 텍스트·데이터·메시지 로그·Run 후 레지스터·로그 — `stage-6` 빌드, 즉 코어 로더로 캡처),
`tools/check-menu-load.sh --compare-vanilla`가 같다.

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

---

## 16. 파일을 올리는 두 경로와 그 검사

| 경로 | 코드 | 하는 일 |
|---|---|---|
| 명령행 (`QtSpimEdu prog.s`) | `QtSpim/main.cpp` — `sim_ReinitializeSimulator()` 뒤에 `read_assembly_file()` 직접 호출 | 어셈블만. 최근 파일 목록을 건드리지 않는다 |
| File > Load File | `SpimView::file_LoadFile()` (`QtSpim/menu.cpp`) | 파일 대화상자 → 경로 검사 → `read_assembly_file()` → 최근 파일 갱신 → Text/Data/레지스터 다시 그림. **Reinitialize 없음** |
| File > Reinitialize and Load File | `SpimView::file_ReloadFile()` | `sim_ReinitializeSimulator()` 뒤에 `file_LoadFile()` |

`initStack()`은 `st_recentFiles[0]`를 argv[0]으로 쓰므로(`menu.cpp`), 메뉴로 올린 뒤 실행하면 **파일의 절대 경로가 시뮬레이션 스택에 올라간다** —
명령행 경로에서는 올라가지 않는다. 로그 골든(`tests/golden/`)이 명령행 경로(`--load-cmdline`)로 캡처·비교되는 이유: 메뉴 경로로 하면 골든이 체크아웃 위치에 묶인다.

**6단계까지 자동 검사는 전부 명령행 경로만 탔다**(`--load`가 파일을 위치 인자로 넘겼다). `file_LoadFile()`/`file_ReloadFile()`은 사람 체크리스트로만 확인됐다.
6단계 후속에서 바꾼 것:

- 하네스의 `--load` / `--reload`는 **실제 QAction을 trigger**하고 그 슬롯이 띄운 파일 대화상자에 경로를 입력한다. 스크린샷·속도 측정·`regress.sh` 3번이 이 경로를 탄다.
- `tools/check-menu-load.sh`: Load 1회, Reload 1회·2회, Load→Reload에 에러 없음 + 텍스트 세그먼트가 명령행 로드와 같음. CI에서 돈다.
- 같은 스크립트의 `--compare-vanilla`: `tools/menu-probe.py`가 **vanilla-9.1.24와 HEAD의 스크래치 worktree**에 같은 프로브(환경변수로 클릭 순서를 받아 QAction을 trigger하고 메시지 상자를 출력)를 넣어 빌드하고,
  기본 설정과 Bare Machine 설정에서 여섯 가지 클릭 순서의 메시지 상자를 글자 그대로 비교한다. CI에서 돈다.

**코어 동작으로 고정해 둔 것**(vanilla도 같다): Reinitialize 없이 같은 파일을 Load File로 두 번 올리면
`Label is defined for the second time … main:` — 전역 라벨이 심볼 테이블에 남아 있기 때문(로컬 라벨은 파일 끝에서 지워져 걸리지 않는다, §3.7).
Bare Machine이 켜져 있으면 pseudo 명령(`li` 등)이 `syntax error`가 되고, 그 줄의 라벨(`main:`)은 이미 등록된 뒤라 **이어서 Load File을 하면 같은 "second time" 에러**가 난다.
Bare Machine은 설정 파일에 저장되어 재시작 후에도 남는다(원본 동작).

---

## 17. 7단계 이후의 에디터

### 17.1 구조

```
EduEditorDock : QDockWidget  ("EditorDockWidget", Top/Bottom, Data·Text와 tabify)      edu/edu_editor_dock.*
├─ EduCodeEditor : QPlainTextEdit   줄 번호 여백, 현재 줄, 에러 줄 표시, 탭 = 8칸(문자는 그대로)   edu/edu_code_editor.*
│    └─ EduMipsHighlighter           edu::tokenizeMipsLine()의 토큰에 색만 입힌다
├─ QListWidget "EditorErrorList"     에러가 있을 때만 보인다. 클릭 = 그 줄로
└─ QLabel                            "UTF-8   CRLF   Ln 40, Col 1"
SpimView 쪽 연결: edu/edu_editor_glue.cpp (메뉴·툴바 항목, Assemble, 에러 수집, 로드한 파일 열기)
```

`edu/core`(QtCore만, 단위 테스트):
- `edu_mips_syntax` — 한 줄을 토큰으로. **명령어·지시어 목록은 `CPU/op.h` 자체**다: `#define OP(NAME, OPCODE, TYPE, R) {NAME, TYPE},`로
  그 파일을 포함해 이름과 종류만 남긴다(381개, pseudo 명령 포함). 그래서 에디터가 명령어로 칠하는 단어 = 어셈블러가 명령어로 받는 단어.
  식별자 규칙은 `CPU/scanner.l`의 `[a-zA-Z_.][a-zA-Z0-9_.]*`, 줄 앞의 `이름:`만 라벨 정의.
- `edu_text_file` — 바이트 ↔ 텍스트. UTF-8 BOM 기억, 유효한 UTF-8이면 UTF-8, 아니면 CP949, 그것도 아니면 Latin-1(모든 바이트가 그대로 왕복).
  **Qt의 CP949 코덱은 잘못된 입력을 세어 주지 않고 `canEncode()`도 늘 참**이라, "CP949인가"와 "이 글자를 CP949로 쓸 수 있나"는 둘 다 **왕복 결과가 같은지**로 판정한다.
  저장은 열 때의 인코딩·BOM·줄바꿈 그대로(새 파일은 UTF-8, BOM 없음, LF). CRLF와 LF가 섞인 파일은 많은 쪽으로 통일되고 정보 줄에 알린다.
  파일 인코딩으로 쓸 수 없는 글자를 넣고 저장하면 몇 번째 줄인지 알리고 UTF-8로 저장할지 묻는다.
- `edu_asm_errors` — `spim: (parser) <msg> on line <N> of file <path>` 파싱(§4), 형식이 다르면 원문 그대로. `resolveMessageLine()`은 §12 36번.

에디터의 텍스트는 `QTextDocument::toRawText()`에서 얻는다 — `toPlainText()`는 줄바꿈 없는 공백(U+00A0)을 보통 공백으로 바꿔 버린다.

### 17.2 Assemble

`SpimView::eduAssemble()` — Ctrl+S, F3, 툴바, 띠 클릭, Save As가 모두 여기로 온다(저장 = 어셈블, §12 40번): **묻지 않고 저장**(이름 없는 새 파일만 Save As) → `eduAssembleFile`에 경로를 넣고
**원본의 `file_ReloadFile()`을 그대로 호출**한다. `file_LoadFile()`은 `// EDU:` 한 곳에서 그 경로를 파일 대화상자 대신 쓴다.
그동안 `SpimView::Error()`는 메시지를 로그에 쓴 뒤(원본과 같음) 모달 대신 `eduCollectError()`에 넘긴다.
에러가 없으면 상태바에 "Saved and assembled"를 잠깐 띄우고 Text 탭으로, 있으면 Editor에 머물고 목록·여백 표시·상태바 배지("Assemble failed — N errors. Simulator was reset.").
어느 쪽이든 `eduSyncedPath`(시뮬레이터가 마지막으로 받은 파일)를 갱신해 "Source changed" 띠를 내린다. 띠는 File 메뉴로 올린 파일이 에디터에 열렸을 때도 내려가고, 입력·다른 파일 열기·Reinitialize(`InitializeWorld`)에서 올라온다.
`tools/check-editor.sh`가 Assemble 뒤의 텍스트·데이터 세그먼트 로그가 Reinitialize and Load File 뒤와 바이트 동일한지, 에러가 있는 파일의 메시지 로그가 File 메뉴 경로와 바이트 동일한지 확인한다.

최근 파일은 **두 목록**이다. 원본의 File > Recent Files에는 Assemble과 File > Load File이 올린 파일만 들어간다(원본 동작 그대로).
에디터가 열거나 저장한 파일은 **Editor > Open Recent**(설정 `Editor/RecentFiles`, 8개)에 따로 둔다 —
원본이 `st_recentFiles[0]`를 다음 실행의 argv[0]으로 쓰므로(§16), 열기만 해도 그 목록 맨 앞이 바뀌면 로드된 프로그램의 스택 내용이 달라지기 때문이다.

### 17.3 다른 프로그램이 파일을 바꿨을 때

`QFileSystemWatcher` → 150ms 뒤 파일을 다시 읽어 **마지막으로 읽거나 쓴 바이트와 다를 때만** 묻는다(이름 바꾸기로 저장하는 편집기는 감시 경로를 끊으므로 매번 다시 건다; 우리 자신의 저장은 감시를 잠시 뗀다).
"No"를 고르면 그 버전에 대해서는 다시 묻지 않고 문서를 수정됨 상태로 둔다.

---

## 18. 1.0.1 — 화면 배치

### 18.1 Inspector 높이

`EduInspector::setHeightLocked()`: 잠기면 `body_`가 내용 높이에 `setFixedHeight`, 풀리면 최소 3줄·최대 없음.
`SpimView::eventFilter`(메인 창 자신에 설치)가 분할 바를 잡는 순간을 본다 — QMainWindow는 분할 바(자식 위젯이 아닌 틈)의 마우스 이벤트를 직접 받으므로
`MouseButtonPress`에서 `childAt(pos) == 0`이면 분할 바다. 누르면 풀고, 놓을 때 높이가 바뀌었으면 사용자 크기로 확정(`eduInspectorSizing(true)`), 아니면 다시 잠근다.
사용자 크기 플래그는 `MainWin/InspectorUserSized`로 저장하고 `readSettings()`에서 **`restoreState()` 전에** 적용한다(잠긴 채로 복원하면 내용 높이가 이긴다).
`tools`의 `--drag-inspector <dy>`가 같은 경로(메인 창에 press/move/release)로 검사한다.

시도했다가 버린 것: 내용이 바뀔 때마다 `resizeDocks(Vertical)`로 따라가기. Qt 5.15의 `QDockAreaLayout::resizeDocks`는 세로 요청에도 열의 가로 크기를 sizeHint로 다시 잡아
왼쪽 열이 401→492px로 넓어졌고, 요청이 텍스트 위젯의 레이아웃 도중에 나오면 뒤따르는 relayout에 묻혔다.

### 18.2 메시지 로그

`ui->centralWidget`(QTextEdit)을 숨기면 QMainWindow가 도크 영역에 그 공간을 준다(확인: 1920×1080에서 Text 높이 623→950).
`eduShowLog()`는 `SpimView::Error()`에서 부른다 — `error()`·`run_error()` 둘 다 거기로 오므로 어셈블 에러와 실행 예외 모두 로그를 되살린다.
로그의 최소 높이 120px(없으면 Editor / Text 프리셋에서 로그가 71px로 눌렸다).

### 18.3 나란히 배치

- `dockOptions`: `AllowNestedDocks | AllowTabbedDocks | AnimatedDocks | GroupedDragging | VerticalTabs` (원본은 `ForceTabbedDocks`).
- 탭 하나를 끌어내는 것은 Qt 5.15의 `QMainWindowTabBar`가 한다(`libQt5Widgets.so.5.15`에 심볼 있음): 탭 위젯이 아니라 탭 자체를 끌면 그 도크만 떨어져 나온다.
  offscreen 하네스로는 창 관리자 없는 드래그를 재현할 수 없어 실제 모니터 항목이다.
- 프리셋(`eduArrangePanels`): 세 도크를 `addDockWidget(Top)`으로 다시 넣어 묶음에서 빼낸 뒤 Tabs는 tabify 둘, 나머지는 `splitDockWidget(editor, text, o)` + Data를 Text에 tabify,
  `resizeDocks({editor, text}, {1000, 1000}, o)`로 반반(같은 값을 주면 Qt가 비율로 맞춘다).
- 창 상태 버전 4: `ForceTabbedDocks`로 저장된 상태를 한 번 버린다.
- 검사: `--layout-report`가 각 패널의 위치·크기와 화면에 보이는지(`visibleRegion()`), Text의 Instruction·Source 열 폭을 찍는다.
  1920×1080 좌우 분할에서 Text 폭 753px, Instruction 191px, Source 319px.

Qt로 되는 것과 안 되는 것은 `docs/GUIDE-ko.md` 6절과 이번 보고의 표 참고.

---

## 19. H단계 — Hallym MIPS Simulator (겉모습만 바꾼 파생판)

`docs/design/tokens.md`가 디자인의 근거, 위 §12 51~58번이 코드에서 달라진 곳의 목록이다. 구조만 적는다.

```
QtSpim/edu/theme/
  tokens.h        색(QRgb)·글꼴·간격 상수 + QSS용 이름표(kNamedColors)  ← 유일한 값의 출처
  light.qss       앱 스타일시트. @navy@ 같은 자리를 styleSheet()가 채운다
  edu_theme.*     apply(): 글꼴 등록·앱 글꼴·스타일시트·창 아이콘 / codeFont() / toolIcon() / brandPixmap() / showSplash()
  theme.qrc       글꼴(Pretendard 4종, D2Coding 2종, OFL), 아이콘 PNG(15종×3상태×1x/2x), 브랜드 PNG, light.qss — CONFIG += resources_big
  fonts/ icons/lucide/(SVG 원본+ISC) icons/png/ brand/(SVG 원본, PNG, .ico, .icns, .rc)
tools/make-theme-icons.py   SVG → PNG (색·크기는 tokens.h에서 읽는다). 결과 PNG는 커밋한다
tools/capture-theme.sh      시안 캡처(H1). devtools --qss --font-dir --ui-font --icon-dir
```

- 적용 순서: `main.cpp`에서 `edu::theme::apply(&a)` → 스플래시 → `SpimView` 생성. 설정 글꼴 기본값(`state.cpp`)이 `codeFont()`라 처음 실행은 D2Coding, 사용자가 Settings에서 바꾸면 그 글꼴.
- 색 리터럴 검사: `grep -rn "QColor(\|QFont(\|setStyleSheet(" QtSpim/*.cpp QtSpim/edu` 에서 토큰 참조(`QColor(edu::theme::k…)`, `QColor(k…)`)와 설정값 변환(`QColor(st_…)`)만 남아야 한다 — H2 완료 시 0건 확인.
- 이름: `edu_version.h`의 `EDU_APP_NAME`/`EDU_TARGET_NAME`/`EDU_SETTINGS_*`. 코드 식별자 `edu_*`/`EDU_*`는 이름이 아니라 코드라 그대로.
- 헬프 컬렉션: `help/HallymMIPS.qhcp`/`.qhp`(네임스페이스 `kr.ac.hallym.mips.1.0`), 본문 `help/manual.html`은 원본 QtSpim 설명서 그대로(§7).
- 비교 이미지(`docs/images/compare/`): 왼쪽 표준 QtSpim 절반은 1.0.0 때의 캡처를 그대로 쓰고 오른쪽만 다시 찍는다 — `tools/make-compare-images.py`.
