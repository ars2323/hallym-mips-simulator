/* The simulator core, as Node sees it.

   Everything that touches a path or an encoding happens here; the addon
   (native/src/addon.cc) only ever receives bytes.  Source files are decoded
   by src/node/text-file.ts and handed to the core as UTF-8, so a CP949 file
   and its UTF-8 twin assemble to the same machine.

   All of it is synchronous and stateful (the core is one machine per
   process).  This is the boundary where that state lives; src/core/ stays
   pure.
*/

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { decodeTextFile, type TextFileFormat } from '../src/node/text-file.ts';

export interface TextWord {
  addr: number;
  word: number;  // unsigned
  line: string;  // the core's format_an_inst() for the stored instruction
}

export interface Registers {
  pc: number;
  hi: number;
  lo: number;
  epc: number;
  cause: number;
  badVAddr: number;
  status: number;
  general: number[]; // $0..$31, unsigned
}

export interface Segments {
  textBot: number; textTop: number;
  dataBot: number; dataTop: number;
  stackBot: number; stackTop: number;
  kTextBot: number; kTextTop: number;
  kDataBot: number; kDataTop: number;
}

interface NativeCore {
  assemble(source: Uint8Array, handler: Uint8Array, argv: Uint8Array[],
           env: Uint8Array[], fileName: Uint8Array): { ok: boolean; errors: string[]; symbols: string };
  step(n?: number): boolean;
  errors(): string[];
  textSegment(): TextWord[];
  registers(): Registers;
  registerNames(): string[];
  segments(): Segments;
  readWords(addr: number, count: number): number[];
  readBytes(addr: number, count: number): Uint8Array;
  disassemble(word: number, addr: number): string;
}

const core = createRequire(import.meta.url)('./build/Release/spim.node') as NativeCore;

// The default exception handler, as QtSpim loads it (QtSpim/exception.qrc
// embeds ../CPU/exceptions.s).
const handler = readFileSync(new URL('../CPU/exceptions.s', import.meta.url));

/* What the simulated program finds on its stack: argv (argv[0] included)
   and its environment -- Simulator > Run Parameters in the Qt build.

   The default is fixed so that every machine starts a program with the same
   stack, and so the same $sp, $a1 and $a2: two students running the same
   code can compare registers.  argv[0] is not the file's name, whose length
   would move $sp from one file to the next.  (docs/PORTING.md, "Run
   parameters".) */
export interface RunParameters {
  argv: readonly string[];
  env: readonly string[];
}

export const DEFAULT_RUN_PARAMETERS: RunParameters =
  Object.freeze({ argv: Object.freeze(['program.s']), env: Object.freeze([]) });

export interface AssembleOptions {
  run?: RunParameters;
  // What the core's messages call the file ("... of file lab04.s").  Only
  // text: nothing is opened by this name.
  fileName?: string;
}

export interface AssembleResult {
  ok: boolean;
  errors: string[];   // the core's messages, in order
  symbols: string;    // print_symbols() before local labels are dropped
  // How the source bytes were read; null when the source was a string.
  format: TextFileFormat | null;
}

const utf8 = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, 'utf8'));

function checkRunParameters(run: RunParameters): void {
  // The core rebuilds argv by splitting one command line on blanks.
  for (const a of run.argv) {
    if (a === '' || /[\s\0]/.test(a)) throw new TypeError(`argv entry ${JSON.stringify(a)}: no blanks, no NUL, not empty`);
  }
  for (const e of run.env) {
    if (e.includes('\0')) throw new TypeError(`env entry ${JSON.stringify(e)} contains NUL`);
  }
}

/** Resets the machine, loads the default exception handler, builds the
    stack from `run`, and assembles `source`.  Bytes are decoded by the rule
    in src/node/text-file.ts; a string is taken as it is. */
export function assemble(source: Uint8Array | string, options: AssembleOptions = {}): AssembleResult {
  const run = options.run ?? DEFAULT_RUN_PARAMETERS;
  checkRunParameters(run);
  let text: string;
  let format: TextFileFormat | null = null;
  if (typeof source === 'string') {
    text = source;
  } else {
    const decoded = decodeTextFile(source);
    text = decoded.text;
    format = decoded.format;
  }
  const result = core.assemble(utf8(text), new Uint8Array(handler), run.argv.map(utf8),
                               run.env.map(utf8), utf8(options.fileName ?? 'program.s'));
  return { ...result, format };
}

/** QtSpim's Single Step, n times (Run is a large n).  The first call after
    assemble() starts the program: PC to the start address, stack rebuilt.
    Returns whether the program can continue. */
export const step = (n = 1): boolean => core.step(n);
/** What the core reported during the last assemble() or step(). */
export const errors = (): string[] => core.errors();
/** User text, then kernel text, in address order. */
export const textSegment = (): TextWord[] => core.textSegment();
export const registers = (): Registers => core.registers();
/** The core's own names: "r0", "at", ... "s8", "ra". */
export const registerNames = (): string[] => core.registerNames();
export const segments = (): Segments => core.segments();
/** Words at addr (word aligned), inside the data, stack or kernel data segment. */
export const readWords = (addr: number, count: number): number[] => core.readWords(addr, count);
/** Bytes in memory order, inside the data, stack or kernel data segment. */
export const readBytes = (addr: number, count: number): Uint8Array => core.readBytes(addr, count);
/** The core's inst_decode() + format_an_inst() of a bare word. */
export const disassemble = (word: number, addr: number): string => core.disassemble(word, addr);
