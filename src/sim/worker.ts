/* The simulator process.  It owns the core (native/): one machine, its
   process-wide globals, its SIGALRM timer, and a fatal_error() that
   abort()s -- which here ends this process and not the host.

   Running is done in slices: run() executes at most SLICE instructions and
   returns, the loop yields to the event loop, and in between requests are
   answered -- a stop, or reads of a consistent machine.  So a program in an
   endless loop can be stopped and then looked at: registers, memory, PC.
   What a slice printed is sent when the slice ends, so output arrives as
   the program prints it, a few milliseconds late at most.
   (docs/PORTING.md, "Stop".)
*/

import * as spim from '../../native/index.ts';
import type { CallName, Calls, HostMessage, Request, RunResult, StopReason, WorkerMessage } from './protocol.ts';
import { processPort } from './transport.ts';

// About 2.6 ms of instructions (the core runs some 3.8 million a second):
// the longest a stop, a read or a line of output waits.
export const SLICE = 10000;
const PROGRESS_EVERY_MS = 200;

const port = processPort();
const send = (m: WorkerMessage) => port.send(m);
const testHooks = process.env.SPIM_TEST_HOOKS === '1';

// Console bytes are decoded here, as a stream: a character may be printed
// one byte at a time (print_char), across slices.
const decoder = new TextDecoder('utf-8');
function flushConsole(): void {
  const text = decoder.decode(spim.consoleOutput(), { stream: true });
  if (text !== '') send({ type: 'console', text });
}

let running = false;
let stopRequested = false;

const yieldToEvents = () => new Promise<void>((resolve) => setImmediate(resolve));

function result(reason: StopReason, errors: string[]): RunResult {
  return { reason, pc: spim.registers().pc, errors };
}

async function run(): Promise<RunResult> {
  running = true;
  stopRequested = false;
  const errors: string[] = [];
  let instructions = 0;
  let lastProgress = Date.now();
  try {
    for (;;) {
      if (stopRequested) return result('stopped', errors);
      const stop = spim.run(SLICE);
      errors.push(...spim.errors());
      flushConsole();
      if (stop !== 'limit') return result(stop, errors);
      instructions += SLICE;
      if (Date.now() - lastProgress >= PROGRESS_EVERY_MS) {
        lastProgress = Date.now();
        send({ type: 'progress', pc: spim.registers().pc, instructions });
      }
      await yieldToEvents();
    }
  } finally {
    running = false;
  }
}

function step(count = 1): RunResult {
  const stop = spim.run(count);
  const errors = spim.errors();
  flushConsole();
  return result(stop, errors);
}

type Handler = (...args: never[]) => unknown;
const handlers: { [M in CallName]: Handler } = {
  assemble: (source: Uint8Array | string, options?: spim.AssembleOptions) => spim.assemble(source, options),
  run,
  step,
  stop: () => {
    const wasRunning = running;
    if (running) stopRequested = true;
    return { wasRunning };
  },
  provideInput: (text: string) => spim.provideInput(text),
  setBreakpoint: (addr: number) => spim.setBreakpoint(addr),
  clearBreakpoint: (addr: number) => spim.clearBreakpoint(addr),
  breakpoints: () => spim.breakpoints(),
  registers: () => spim.registers(),
  registerNames: () => spim.registerNames(),
  segments: () => spim.segments(),
  textSegment: () => spim.textSegment(),
  readWords: (addr: number, count: number) => spim.readWords(addr, count),
  readBytes: (addr: number, count: number) => spim.readBytes(addr, count),
  disassemble: (word: number, addr: number) => spim.disassemble(word, addr),
  testHang: () => {
    if (!testHooks) throw new Error('test hooks are off');
    for (;;) { /* a worker that never answers again: stop() must fall back to kill */ }
  },
};

// While a run is going on, only reads and stop are served; anything that
// would change the machine under it is refused.
const WHILE_RUNNING = new Set<CallName>(['stop', 'breakpoints', 'registers', 'registerNames', 'segments',
                                         'textSegment', 'readWords', 'readBytes', 'disassemble']);

async function serve(request: Request): Promise<void> {
  const { id, method, args } = request;
  try {
    if (running && !WHILE_RUNNING.has(method)) throw new Error(`busy: ${method} while the program runs`);
    const handler = handlers[method];
    if (!handler) throw new Error(`no such call: ${String(method)}`);
    const value = await (handler as (...a: unknown[]) => unknown)(...(args as unknown[]));
    send({ type: 'response', id, ok: true, value });
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    send({ type: 'response', id, ok: false, error: { name: error.name, message: error.message } });
  }
}

port.onMessage((message: HostMessage) => {
  if (message.type === 'request') void serve(message);
});
send({ type: 'ready' });

export type { Calls };
