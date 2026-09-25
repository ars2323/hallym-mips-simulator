/* One sentence that says what an instruction does, with the values it will
   use -- the Inspector's last line:

     sra — Shift Right Arithmetic. `$t6` 값(`0x80000001`)을 shamt 값(`1`)만큼
     오른쪽으로 옮겨 `$s1` 레지스터에 넣습니다. 빈 자리는 부호 비트로 채웁니다.

   New in this front end; the Qt build has no such line.  Pure: it takes the
   decoded word and the register values *before* the instruction runs.

   Everything that is code -- register names, hexadecimal and other numbers
   taken from the machine -- is wrapped in backticks, and the view sets those
   parts in the monospaced font.  That is how "every hexadecimal literal is
   monospaced" holds here: Pretendard draws 0x1 as 0×1 (docs/PORTING.md).
   A particle always follows a Korean noun -- 값(`…`)을, 즉시값(`5`)을,
   `0x…` 주소로, `$t7` 레지스터에 -- never a register name or a number,
   whose reading ($a0: 에이제로? 에이영?  5: 오) would decide between 을/를,
   이/가, 로/으로 (tests/renderer/particles.test.ts).
*/

import type { DecodedInstruction } from './decoder.ts';
import { mnemonicExpansion } from './decoder.ts';
import { hex32 } from './format.ts';
import { generalRegisterName } from './registers.ts';

export interface Explanation {
  title: string;    // "sra — Shift Right Arithmetic" ("syscall" alone when no expansion)
  sentence: string; // with `code` parts; '' when there is nothing to add
}

const code = (s: string | number): string => '`' + s + '`';
const reg = (n: number): string => code(generalRegisterName(n));
const val = (regs: readonly number[], n: number): string => `${reg(n)} 값(${code(hex32(regs[n]))})`;

// SPIM's syscalls ($v0), by the names the course uses.
const SYSCALLS: Record<number, string> = {
  1: 'print_int — `$a0` 레지스터의 정수를 출력', 2: 'print_float — `$f12` 값을 출력', 3: 'print_double — `$f12` 값을 출력',
  4: 'print_string — `$a0` 값이 가리키는 문자열을 출력', 5: 'read_int — 정수 한 줄을 읽어 `$v0` 레지스터에',
  6: 'read_float — 실수 한 줄을 읽어 `$f0` 레지스터에', 7: 'read_double — 실수 한 줄을 읽어 `$f0` 레지스터에',
  8: 'read_string — 한 줄을 `$a0` 값이 가리키는 곳에(최대 `$a1` 값만큼)', 9: 'sbrk — `$a0` 값만큼 할당해 그 주소를 `$v0` 레지스터에',
  10: 'exit — 프로그램을 끝냄', 11: 'print_char — `$a0` 레지스터의 문자를 출력', 12: 'read_char — 문자 하나를 읽어 `$v0` 레지스터에',
  13: 'open', 14: 'read', 15: 'write', 16: 'close', 17: 'exit2 — `$a0` 값을 종료 코드로 끝냄',
};

function sentence(d: DecodedInstruction, regs: readonly number[], pc: number): string {
  const { rs, rt, rd, shamt, simm, imm, name } = d;
  const ops: Record<string, string> = { and: 'AND', or: 'OR', xor: 'XOR', nor: 'NOR', andi: 'AND', ori: 'OR', xori: 'XOR' };
  switch (name) {
    case 'nop':
      return '아무것도 하지 않습니다.';
    case 'add': case 'addu':
      return `${val(regs, rs)}과 ${val(regs, rt)}을 더해 ${reg(rd)} 레지스터에 넣습니다.`
        + (name === 'add' ? ' 부호 있는 덧셈이 넘치면 예외가 납니다.' : ' 넘쳐도 예외는 나지 않습니다.');
    case 'sub': case 'subu':
      return `${val(regs, rs)}에서 ${val(regs, rt)}을 빼 ${reg(rd)} 레지스터에 넣습니다.`;
    case 'and': case 'or': case 'xor':
      return `${val(regs, rs)}과 ${val(regs, rt)}을 비트마다 ${ops[name]} 해 ${reg(rd)} 레지스터에 넣습니다.`;
    case 'nor':
      return `${val(regs, rs)}과 ${val(regs, rt)}을 비트마다 OR 한 뒤 뒤집어 ${reg(rd)} 레지스터에 넣습니다.`;
    case 'slt': case 'sltu':
      return `${val(regs, rs)}이 ${val(regs, rt)}보다 작으면 1, 아니면 0을 ${reg(rd)} 레지스터에 넣습니다(${name === 'slt' ? '부호 있는' : '부호 없는'} 비교).`;
    case 'sll': case 'srl': case 'sra':
      return `${val(regs, rt)}을 shamt 값(${code(shamt)})만큼 ${name === 'sll' ? '왼쪽' : '오른쪽'}으로 옮겨 ${reg(rd)} 레지스터에 넣습니다. `
        + `빈 자리는 ${name === 'sra' ? '부호 비트로' : '0으로'} 채웁니다.`;
    case 'sllv': case 'srlv': case 'srav':
      return `${val(regs, rt)}을 ${reg(rs)} 레지스터의 아래 5비트(${code(regs[rs] & 31)})만큼 ${name === 'sllv' ? '왼쪽' : '오른쪽'}으로 옮겨 ${reg(rd)} 레지스터에 넣습니다.`;
    case 'mult': case 'multu':
      return `${val(regs, rs)}과 ${val(regs, rt)}을 곱해 64비트 결과의 위 절반을 HI 레지스터에, 아래 절반을 LO 레지스터에 넣습니다.`;
    case 'div': case 'divu':
      return `${val(regs, rs)}을 ${val(regs, rt)}으로 나눠 몫은 LO 레지스터에, 나머지는 HI 레지스터에 넣습니다.`;
    case 'mul':
      return `${val(regs, rs)}과 ${val(regs, rt)}을 곱한 아래 32비트를 ${reg(rd)} 레지스터에 넣습니다.`;
    case 'mfhi': return `HI 레지스터 값을 ${reg(rd)} 레지스터에 옮깁니다.`;
    case 'mflo': return `LO 레지스터 값을 ${reg(rd)} 레지스터에 옮깁니다.`;
    case 'mthi': return `${val(regs, rs)}을 HI 레지스터에 옮깁니다.`;
    case 'mtlo': return `${val(regs, rs)}을 LO 레지스터에 옮깁니다.`;
    case 'jr':
      return rs === 31
        ? `${val(regs, rs)}이 가리키는 곳, 곧 이 함수를 부른 곳 다음으로 돌아갑니다.`
        : `${val(regs, rs)}이 가리키는 주소로 점프합니다.`;
    case 'jalr':
      return `돌아올 주소(${code(hex32(pc + 4))})를 ${reg(rd)} 레지스터에 넣고 ${val(regs, rs)}이 가리키는 주소로 점프합니다.`;
    case 'syscall': {
      const what = SYSCALLS[regs[2]];
      return `${val(regs, 2)}에 따라 시스템 호출을 합니다${what ? `: ${what}` : ''}.`;
    }
    case 'break':
      return 'Breakpoint 예외를 일으킵니다.';
    case 'addi': case 'addiu':
      return `${val(regs, rs)}에 즉시값(${code(simm)})을 더해 ${reg(rt)} 레지스터에 넣습니다.`;
    case 'andi': case 'ori': case 'xori':
      return `${val(regs, rs)}과 즉시값(${code('0x' + imm.toString(16).padStart(4, '0'))}, 위 16비트는 0)을 비트마다 ${ops[name]} 해 ${reg(rt)} 레지스터에 넣습니다.`;
    case 'slti': case 'sltiu':
      return `${val(regs, rs)}이 즉시값(${code(simm)})보다 작으면 1, 아니면 0을 ${reg(rt)} 레지스터에 넣습니다.`;
    case 'lui':
      return `즉시값(${code('0x' + imm.toString(16).padStart(4, '0'))})을 위 16비트에, 0을 아래 16비트에 두어 ${reg(rt)} 레지스터에 넣습니다(${code(hex32(imm << 16))}).`;
    case 'lw': case 'lh': case 'lhu': case 'lb': case 'lbu': case 'sw': case 'sh': case 'sb': {
      const addr = (regs[rs] + simm) >>> 0;
      const unit = { w: '워드', h: '하프워드', b: '바이트' }[name[1]]!;
      const where = `${val(regs, rs)}${simm < 0 ? '에서' : '에'} 오프셋(${code(Math.abs(simm))})을 ${simm < 0 ? '뺀' : '더한'} 주소(${code(hex32(addr))})`;
      return name[0] === 'l'
        ? `${where}의 ${unit}를 읽어 ${reg(rt)} 레지스터에 넣습니다${name.endsWith('u') ? '(0으로 확장)' : name === 'lw' ? '' : '(부호 확장)'}.`
        : `${val(regs, rt)}의 ${name === 'sw' ? '' : '아래 '}${unit}를 ${where}에 씁니다.`;
    }
    case 'beq': case 'bne':
      return `${val(regs, rs)}과 ${val(regs, rt)}이 ${name === 'beq' ? '같으면' : '다르면'} ${code(hex32(d.destination))} 주소로 분기합니다.`;
    case 'blez': case 'bgtz': case 'bltz': case 'bgez': {
      const cond = { blez: '0 이하이면', bgtz: '0보다 크면', bltz: '0보다 작으면', bgez: '0 이상이면' }[name]!;
      return `${val(regs, rs)}이 ${cond} ${code(hex32(d.destination))} 주소로 분기합니다.`;
    }
    case 'j':
      return `${code(hex32(d.destination))} 주소로 점프합니다.`;
    case 'jal':
      return `돌아올 주소(${code(hex32(pc + 4))})를 ${reg(31)} 레지스터에 넣고 ${code(hex32(d.destination))} 주소로 점프합니다(함수 호출).`;
    default:
      return '';
  }
}

// `d` should come from decode(word, pc, convention), so that branches carry
// their destination; `regs` are the 32 general registers as they are now.
export function explain(d: DecodedInstruction, regs: readonly number[], pc: number): Explanation {
  if (!d.known) return { title: '이 시뮬레이터가 실행하지 않는 워드입니다', sentence: '' };
  const expansion = mnemonicExpansion(d.name);
  return { title: expansion ? `${d.name} — ${expansion}` : d.name, sentence: sentence(d, regs, pc) };
}

// Splits a sentence into plain and `code` parts, for a view to set.
export function codeParts(text: string): { text: string; code: boolean }[] {
  return text.split('`').map((t, i) => ({ text: t, code: i % 2 === 1 })).filter((p) => p.text !== '');
}
