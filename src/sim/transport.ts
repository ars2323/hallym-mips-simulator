/* The one thing that knows how the simulator process is started and talked
   to.  The host (host.ts) sees only this interface; the worker (worker.ts)
   sees only WorkerPort.

   Now: child_process.fork().  In the Electron app: utilityProcess.fork(),
   whose shape is close enough that a second implementation of Transport and
   of WorkerPort is all it should take (docs/ARCHITECTURE.md, "When
   utilityProcess comes").
*/

import { fork } from 'node:child_process';
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

const WORKER = path.join(import.meta.dirname, 'worker.ts');
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

/* The worker's side of the same link. */
export interface WorkerPort {
  send(message: WorkerMessage): void;
  onMessage(listener: (message: HostMessage) => void): void;
}

export function processPort(): WorkerPort {
  if (!process.send) throw new Error('worker.ts must be started by forkTransport()');
  return {
    send: (message) => { process.send!(message); },
    onMessage: (listener) => { process.on('message', (m) => listener(m as HostMessage)); },
  };
}
