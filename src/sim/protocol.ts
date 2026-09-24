/* What crosses between the host and the simulator process.  Types only.

   Everything here must survive a structured clone (child_process with
   `serialization: 'advanced'` now, Electron's utilityProcess later):
   plain objects, strings, numbers, Uint8Array.  No functions, no classes.
*/

import type { AssembleOptions } from '../../native/index.ts';

/* Why a run or step ended.
     exit        the program ended
     error       the core reported a run-time error and cannot go on
     breakpoint  PC is at a breakpoint, not yet executed
     stopped     the user stopped it (stop())
     limit       a step(n) ran its n instructions */
export type StopReason = 'exit' | 'error' | 'breakpoint' | 'stopped' | 'limit';

export interface RunResult {
  reason: StopReason;
  pc: number;
  errors: string[]; // the core's run-time messages during this run
}

/* The simulator's calls: name -> [arguments, result].  run and step answer
   when the program stops; everything else answers at once.  While a run is
   going on, reads are answered between two slices of it, so they see a
   consistent machine. */
export interface Calls {
  assemble: [[source: Uint8Array | string, options?: AssembleOptions],
             { ok: boolean; errors: string[]; symbols: string; format: unknown }];
  run: [[], RunResult];
  step: [[count?: number], RunResult];
  stop: [[], { wasRunning: boolean }];
  setBreakpoint: [[addr: number], boolean];
  clearBreakpoint: [[addr: number], boolean];
  breakpoints: [[], number[]];
  registers: [[], import('../../native/index.ts').Registers];
  registerNames: [[], string[]];
  segments: [[], import('../../native/index.ts').Segments];
  textSegment: [[], import('../../native/index.ts').TextWord[]];
  readWords: [[addr: number, count: number], number[]];
  readBytes: [[addr: number, count: number], Uint8Array];
  disassemble: [[word: number, addr: number], string];
  // Test hooks, answered only when the worker runs with SPIM_TEST_HOOKS=1.
  testHang: [[], never];
}

export type CallName = keyof Calls;

export interface Request<M extends CallName = CallName> {
  type: 'request';
  id: number;
  method: M;
  args: Calls[M][0];
}

export type Response =
  | { type: 'response'; id: number; ok: true; value: unknown }
  | { type: 'response'; id: number; ok: false; error: { name: string; message: string } };

export type WorkerEvent =
  | { type: 'ready' }
  | { type: 'console'; text: string }                        // decoded UTF-8, in order
  | { type: 'progress'; pc: number; instructions: number };  // while running, a few times a second

export type HostMessage = Request;
export type WorkerMessage = Response | WorkerEvent;
