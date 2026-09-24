/* window.app, as src/main/preload.cjs exposes it. */

import type { OpenedFile, Settings } from '../../main/main.ts';
import type { TextFileFormat } from '../../node/text-file.ts';
import type { CallName, Calls } from '../../sim/protocol.ts';

export interface AppApi {
  call<M extends CallName>(method: M, ...args: Calls[M][0]): Promise<Calls[M][1]>;
  stop(): Promise<'stopped' | 'idle' | 'killed'>;
  onConsole(listener: (text: string) => void): void;
  onProgress(listener: (p: { pc: number; instructions: number }) => void): void;
  onCrashed(listener: (message: string, detail: string) => void): void;
  openFile(): Promise<OpenedFile | null>;
  saveFile(file: { path: string | null; name: string; text: string; format: TextFileFormat | null }):
    Promise<{ path: string; name: string } | null>;
  openExample(name: string): Promise<OpenedFile>;
  getSettings(): Promise<Settings>;
  setSettings(s: Settings): Promise<Settings>;
}

declare global { interface Window { app: AppApi } }
