export interface AssembleResult {
  ok: boolean;
  /** The core's error() / run_error() messages, in order. */
  errors: string[];
}

export interface TextWord {
  addr: number;
  /** The instruction word, unsigned. */
  word: number;
}

export interface Registers {
  pc: number;
  hi: number;
  lo: number;
  /** $0..$31, unsigned. */
  general: number[];
}

/** Resets the machine, loads the default exception handler, assembles `source`. */
export function assemble(source: string): AssembleResult;
/** User text, then kernel text, in address order. */
export function textSegment(): TextWord[];
export function registers(): Registers;
/** The core's inst_decode() + format_an_inst(), e.g. "[0x00400000]\t0x8fa40000  lw $4, 0($29)". */
export function disassemble(word: number, addr: number): string;
/** QtSpim's Single Step, n times (default 1). */
export function step(n?: number): void;
