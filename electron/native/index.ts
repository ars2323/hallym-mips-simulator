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
import path from 'node:path';

import { decodeTextFile, type TextFileFormat } from '../src/node/text-file.ts';

export interface TextWord {
  addr: number;
  word: number;  // unsigned
  line: string;  // the core's format_an_inst() for the stored instruction
  breakpoint: boolean;
}

/* Why a run() stopped.  "limit" means there is more to run; "input" that
   PC is at a read syscall waiting for provideInput(). */
export type RunStop = 'exit' | 'error' | 'breakpoint' | 'input' | 'limit';

export interface Registers {
  pc: number;
  hi: number;
  lo: number;
  epc: number;
  cause: number;
  badVAddr: number;
  status: number;
  general: number[]; // $0..$31, unsigned
  fp: number[];      // $f0..$f31 as raw 32-bit words (a double is $f2n, $f2n+1)
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
           env: Uint8Array[], fileName: Uint8Array, options: MachineOptions): { ok: boolean; errors: string[]; symbols: string };
  run(steps: number): RunStop;
  consoleOutput(): Uint8Array;
  provideInput(bytes: Uint8Array): void;
  setBreakpoint(addr: number): boolean;
  clearBreakpoint(addr: number): boolean;
  breakpoints(): string;
  errors(): string[];
  textSegment(): TextWord[];
  registers(): Registers;
  registerNames(): string[];
  segments(): Segments;
  readWords(addr: number, count: number): number[];
  readBytes(addr: number, count: number): Uint8Array;
  disassemble(word: number, addr: number): string;
}

// In the packaged app this file is bundled (tools/package.ts defines
// SPIM_BUNDLE), and the addon and the handler sit next to the bundle.
const bundled = process.env.SPIM_BUNDLE === '1';
const here = import.meta.dirname;
const core = createRequire(import.meta.url)(
  bundled ? path.join(here, 'spim.node') : path.join(here, 'build/Release/spim.node')) as NativeCore;

// The default exception handler, as QtSpim loads it (QtSpim/exception.qrc
// embeds ../CPU/exceptions.s).
const defaultHandler = readFileSync(bundled ? path.join(here, 'exceptions.s') : path.join(here, '../CPU/exceptions.s'));

/* QtSpim's Simulator > Settings, the machine part.  Each defaults to
   QtSpim's default.  There is no bare machine: the Qt build keeps it off
   and does not offer it (QtSpim/menu.cpp, "EDU"), and so does this one. */
export interface MachineOptions {
  acceptPseudo: boolean;     // pseudo instructions (li, la, move ...)
  delayedBranches: boolean;  // branches and jumps take effect one instruction late
  delayedLoads: boolean;     // a load's register is written one instruction late
  mappedIo: boolean;         // the console as memory-mapped device registers
  quiet: boolean;            // no message from the exception handler
}

export const DEFAULT_MACHINE: Readonly<MachineOptions> = Object.freeze({
  acceptPseudo: true, delayedBranches: false, delayedLoads: false, mappedIo: false, quiet: false,
});

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
  machine?: Partial<MachineOptions>;
  // The exception handler's source: undefined for the default one
  // (CPU/exceptions.s), null for none -- the program then needs its own
  // __start.  Bytes are decoded like the program's.
  handler?: Uint8Array | string | null;
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
  const handler = options.handler === undefined ? new Uint8Array(defaultHandler)
    : options.handler === null ? new Uint8Array(0)
      : utf8(typeof options.handler === 'string' ? options.handler : decodeTextFile(options.handler).text);
  const result = core.assemble(utf8(text), handler, run.argv.map(utf8), run.env.map(utf8),
                               utf8(options.fileName ?? 'program.s'), { ...DEFAULT_MACHINE, ...options.machine });
  return { ...result, format };
}

/** Runs at most `steps` instructions and says why it stopped.  The first
    run after assemble() (or after the program ended) starts the program: PC
    to the start address, stack rebuilt.  Right after stopping at a
    breakpoint, the next run first executes the instruction under it. */
export const run = (steps: number): RunStop => core.run(steps);

/** QtSpim's Single Step, n times (Run is a large n).  Returns whether the
    program can go on -- at a breakpoint or waiting for input too. */
export function step(n = 1): boolean {
  const stop = core.run(n);
  return stop !== 'exit' && stop !== 'error';
}

/** What the program printed since the last call, as bytes (UTF-8 when the
    program prints what its UTF-8 source put in memory). */
export const consoleOutput = (): Uint8Array => core.consoleOutput();

/** Queues console input for the program's read syscalls, as UTF-8.  A line
    typed at the console is its text and '\n'. */
export const provideInput = (text: string): void => core.provideInput(utf8(text));

const checkAddress = (addr: number): void => {
  if (!Number.isInteger(addr) || addr < 0 || addr > 0xffffffff) throw new TypeError(`not an address: ${addr}`);
};
/** Whether there is a breakpoint at addr now (false: no instruction there;
    errors() says why). */
export function setBreakpoint(addr: number): boolean {
  checkAddress(addr);
  return core.setBreakpoint(addr);
}
/** Whether one was there to remove. */
export function clearBreakpoint(addr: number): boolean {
  checkAddress(addr);
  return core.clearBreakpoint(addr);
}
/** The addresses with a breakpoint, ascending, from the core's own list. */
export function breakpoints(): number[] {
  return [...core.breakpoints().matchAll(/^Breakpoint at 0x([0-9a-f]{8})$/gm)]
    .map((m) => parseInt(m[1], 16)).sort((a, b) => a - b);
}
/** What the core reported during the last assemble(), run()/step() or setBreakpoint(). */
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
