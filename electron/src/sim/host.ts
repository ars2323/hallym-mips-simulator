/* The host's handle on the simulator process (worker.ts).

   Calls are requests with an id; the answer with the same id settles the
   promise.  Console output and progress arrive as events.  If the process
   dies -- the core's fatal_error() abort()s, or stop() had to kill it -- the
   host notices, fails what was pending with SimulatorCrashed, reports the
   crash, and starts a fresh process: the machine is empty again, the host
   goes on.
*/

import { EventEmitter } from 'node:events';

import type { CallName, Calls, RunResult, WorkerMessage } from './protocol.ts';
import { forkTransport, type ExitInfo, type Transport, type TransportFactory } from './transport.ts';

export const CRASH_MESSAGE = '시뮬레이터가 중단되었습니다';

// The exit code of a fatal_error() in the core (native/src/addon.cc).
export const FATAL_EXIT_CODE = 70;

export class SimulatorCrashed extends Error {
  readonly exit: ExitInfo;
  readonly fatal: string | null; // the core's own words, when it was a fatal_error()
  constructor(exit: ExitInfo, cause: string) {
    const fatal = /SPIM core fatal error: (.*)/.exec(exit.stderr)?.[1]?.trim() ?? null;
    super(`${CRASH_MESSAGE} (${cause}${fatal ? `: ${fatal}` : ''})`);
    this.name = 'SimulatorCrashed';
    this.exit = exit;
    this.fatal = fatal;
  }
}

export interface CrashReport {
  message: string;       // CRASH_MESSAGE, for the user
  error: SimulatorCrashed;
  restarted: boolean;
}

export interface SimulatorEvents {
  console: [text: string];
  progress: [info: { pc: number; instructions: number }];
  crashed: [report: CrashReport];
}

export interface HostOptions {
  transport?: TransportFactory;
  restartOnCrash?: boolean;     // default true
  stopTimeoutMs?: number;       // how long stop() waits before killing; default 2000
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

export class Simulator extends EventEmitter<SimulatorEvents> {
  private readonly factory: TransportFactory;
  private readonly restartOnCrash: boolean;
  private readonly stopTimeoutMs: number;
  private transport!: Transport;
  private ready!: Promise<void>;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private killing: string | null = null; // why the host itself is killing the process
  private closed = false;
  private runInFlight: Promise<RunResult> | null = null;

  private constructor(options: HostOptions) {
    super();
    this.factory = options.transport ?? (() => forkTransport());
    this.restartOnCrash = options.restartOnCrash ?? true;
    this.stopTimeoutMs = options.stopTimeoutMs ?? 2000;
  }

  /** Starts the simulator process and waits until it is ready. */
  static async start(options: HostOptions = {}): Promise<Simulator> {
    const sim = new Simulator(options);
    sim.launch();
    await sim.ready;
    return sim;
  }

  private launch(): void {
    const transport = this.factory();
    this.transport = transport;
    this.killing = null;
    let markReady!: () => void;
    this.ready = new Promise((resolve) => { markReady = resolve; });
    transport.onMessage((m: WorkerMessage) => {
      if (transport !== this.transport) return; // a process already replaced
      switch (m.type) {
        case 'ready': markReady(); break;
        case 'console': this.emit('console', m.text); break;
        case 'progress': this.emit('progress', { pc: m.pc, instructions: m.instructions }); break;
        case 'response': {
          const p = this.pending.get(m.id);
          if (!p) return;
          this.pending.delete(m.id);
          if (m.ok) p.resolve(m.value);
          else p.reject(Object.assign(new Error(m.error.message), { name: m.error.name }));
          break;
        }
      }
    });
    transport.onExit((exit) => {
      if (transport !== this.transport) return;
      this.onExit(exit);
    });
  }

  private onExit(exit: ExitInfo): void {
    if (this.closed) return;
    const cause = this.killing
      ?? (exit.code === FATAL_EXIT_CODE ? 'fatal error in the simulator core'
        : exit.signal ? `signal ${exit.signal}` : `exit code ${exit.code}`);
    const error = new SimulatorCrashed(exit, cause);
    for (const p of this.pending.values()) p.reject(error);
    this.pending.clear();
    this.runInFlight = null;
    const restarted = this.restartOnCrash;
    if (restarted) this.launch();
    this.emit('crashed', { message: CRASH_MESSAGE, error, restarted });
  }

  /** Resolves once a (re)started process is ready. */
  whenReady(): Promise<void> {
    return this.ready;
  }

  /** One call to the simulator.  Rejects with SimulatorCrashed if the process dies first. */
  call<M extends CallName>(method: M, ...args: Calls[M][0]): Promise<Calls[M][1]> {
    if (this.closed) return Promise.reject(new Error('simulator closed'));
    const id = this.nextId++;
    return new Promise<Calls[M][1]>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.transport.send({ type: 'request', id, method, args });
    });
  }

  assemble(...args: Calls['assemble'][0]) { return this.call('assemble', ...args); }
  step(count?: number) { return this.call('step', count); }
  registers() { return this.call('registers'); }

  /** Runs until the program ends, fails, reaches a breakpoint or is stopped. */
  run(): Promise<RunResult> {
    const running = this.call('run');
    this.runInFlight = running;
    void running.finally(() => { if (this.runInFlight === running) this.runInFlight = null; }).catch(() => {});
    return running;
  }

  /** Stops a run between two slices; the machine stays as it is, for looking
      at.  Only if the process does not answer within stopTimeoutMs is it
      killed (and restarted) -- the last resort, which loses the machine. */
  async stop(): Promise<'stopped' | 'idle' | 'killed'> {
    const running = this.runInFlight;
    const kill = () => {
      this.killing = 'killed by stop(): no answer';
      this.transport.kill();
    };
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), this.stopTimeoutMs); });
    try {
      const stopCall = this.call('stop');
      stopCall.catch(() => {}); // if the process dies meanwhile, the answer below says so
      const answered = await Promise.race([stopCall, timeout]);
      if (answered === 'timeout') {
        kill();
        return 'killed';
      }
      if (!answered.wasRunning || !running) return 'idle';
      const ended = await Promise.race([running.then(() => 'ended' as const, () => 'ended' as const), timeout]);
      if (ended === 'timeout') {
        kill();
        return 'killed';
      }
      return 'stopped';
    } catch (e) {
      if (e instanceof SimulatorCrashed) return 'killed';
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Ends the simulator process for good. */
  close(): void {
    this.closed = true;
    for (const p of this.pending.values()) p.reject(new Error('simulator closed'));
    this.pending.clear();
    this.transport.kill();
  }
}
