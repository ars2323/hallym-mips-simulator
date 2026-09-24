/* The one thing that knows how the simulator process is started and talked
   to.  The host (host.ts) sees only this interface; the worker (worker.ts)
   sees only WorkerPort.

   Two implementations: child_process.fork() for Node (the tests), and
   Electron's utilityProcess.fork() for the app.  The worker picks its side
   by what it finds: process.parentPort under utilityProcess, process.send
   under fork (docs/ARCHITECTURE.md 4).
*/

import { fork } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { HostMessage, WorkerMessage } from './protocol.ts';

export interface ExitInfo {
  code: number | null;
  signal: string | null;
  stderr: string; // the process's last words (a fatal error from the core lands here)
}

export interface Transport {
  send(message: HostMessage): void;
  onMessage(listener: (message: WorkerMessage) => void): void;
  onExit(listener: (info: ExitInfo) => void): void;
  kill(): void; // forcibly; the host uses it only as a last resort
}

export type TransportFactory = () => Transport;

// In the packaged app the worker is bundled next to the main process's
// bundle (tools/package.ts, which defines SPIM_BUNDLE).
const WORKER = process.env.SPIM_BUNDLE === '1'
  ? path.join(import.meta.dirname, 'worker.js') : path.join(import.meta.dirname, 'worker.ts');
const STDERR_KEPT = 8192;

export function forkTransport(env: NodeJS.ProcessEnv = process.env): Transport {
  const child = fork(WORKER, [], {
    serialization: 'advanced', // structured clone: Uint8Array crosses as it is
    stdio: ['ignore', 'inherit', 'pipe', 'ipc'],
    env,
  });
  let stderr = '';
  child.stderr!.setEncoding('utf8');
  child.stderr!.on('data', (chunk: string) => {
    stderr = (stderr + chunk).slice(-STDERR_KEPT);
    process.stderr.write(chunk);
  });
  const exitListeners: ((info: ExitInfo) => void)[] = [];
  // 'close' comes after stderr has been read to its end.
  child.on('close', (code, signal) => {
    for (const l of exitListeners) l({ code, signal, stderr });
  });
  return {
    send: (message) => { if (child.connected) child.send(message); },
    onMessage: (listener) => { child.on('message', (m) => listener(m as WorkerMessage)); },
    onExit: (listener) => { exitListeners.push(listener); },
    kill: () => { child.kill('SIGKILL'); },
  };
}

/* Electron's utility process.  Only in Electron's main process: 'electron'
   is loaded here, when it is asked for, so Node never needs it. */
export function utilityTransport(env: NodeJS.ProcessEnv = process.env): Transport {
  const { utilityProcess } = createRequire(import.meta.url)('electron') as typeof import('electron');
  const child = utilityProcess.fork(WORKER, [], { stdio: 'pipe', serviceName: 'Hallym MIPS simulator', env });
  let stderr = '';
  child.stderr!.setEncoding('utf8');
  child.stderr!.on('data', (chunk: string) => {
    stderr = (stderr + chunk).slice(-STDERR_KEPT);
    process.stderr.write(chunk);
  });
  child.stdout!.on('data', (chunk: Buffer) => process.stdout.write(chunk));
  const exitListeners: ((info: ExitInfo) => void)[] = [];
  // Measured with Electron 44 on Linux (docs/ARCHITECTURE.md 4):
  //  - 'exit' carries a code only.  A process killed by kill() reports 0;
  //    only the host knows it killed it.
  //  - A native _exit(n) -- the core's fatal_error() -- reports the raw wait
  //    status, n << 8 (70 arrives as 17920); process.exit(n) reports n.
  //  - stderr never signals its end.  Whatever the process wrote before it
  //    died has normally arrived by 'exit'; a short wait covers stragglers.
  child.on('exit', (raw) => {
    const code = raw > 255 && (raw & 0xff) === 0 ? raw >> 8 : raw;
    setTimeout(() => { for (const l of exitListeners) l({ code, signal: null, stderr }); }, 100);
  });
  let alive = true;
  child.on('exit', () => { alive = false; });
  return {
    send: (message) => { if (alive) child.postMessage(message); },
    onMessage: (listener) => { child.on('message', (m: unknown) => listener(m as WorkerMessage)); },
    onExit: (listener) => { exitListeners.push(listener); },
    kill: () => { child.kill(); },
  };
}

/* The worker's side of the same link. */
export interface WorkerPort {
  send(message: WorkerMessage): void;
  onMessage(listener: (message: HostMessage) => void): void;
}

interface ParentPort {
  postMessage(message: unknown): void;
  on(event: 'message', listener: (event: { data: unknown }) => void): void;
}

export function processPort(): WorkerPort {
  const parentPort = (process as { parentPort?: ParentPort }).parentPort;
  if (parentPort) { // started by utilityTransport()
    return {
      send: (message) => { parentPort.postMessage(message); },
      onMessage: (listener) => { parentPort.on('message', (e) => listener(e.data as HostMessage)); },
    };
  }
  if (!process.send) throw new Error('worker.ts must be started by forkTransport() or utilityTransport()');
  return {
    send: (message) => { process.send!(message); },
    onMessage: (listener) => { process.on('message', (m) => listener(m as HostMessage)); },
  };
}
