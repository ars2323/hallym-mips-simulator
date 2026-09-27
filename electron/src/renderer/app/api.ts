/* window.app, as src/main/preload.cjs exposes it. */

import type { ImageJob, OpenedFile, Settings } from '../../main/main.ts';
import type { TextFileFormat } from '../../node/text-file.ts';
import type { CallName, Calls } from '../../sim/protocol.ts';

export interface AppApi {
  call<M extends CallName>(method: M, ...args: Calls[M][0]): Promise<Calls[M][1]>;
  stop(): Promise<'stopped' | 'idle' | 'killed'>;
  // Assembles in a second process, the machine on screen untouched: does it assemble?
  // `crashed`: the core ended while assembling it (a .err directive), in that process only.
  check(source: string, options?: Calls['assemble'][0][1]): Promise<Calls['assemble'][1] & { crashed?: string }>;
  onConsole(listener: (text: string) => void): void;
  onProgress(listener: (p: { pc: number; instructions: number }) => void): void;
  onCrashed(listener: (message: string, detail: string) => void): void;
  openFile(): Promise<OpenedFile | null>;
  saveFile(file: { path: string | null; name: string; text: string; format: TextFileFormat | null }):
    Promise<{ path: string; name: string } | null>;
  // The last assembled program as an executable image (.hmx): the save
  // dialog, then the file.  null: cancelled; { error }: no image (why, for the student).
  exportImage(job: ImageJob): Promise<{ path: string; name: string } | { error: string } | null>;
  openExample(name: string): Promise<OpenedFile>;
  openHandler(): Promise<{ name: string; text: string } | null>;
  about(): Promise<AboutInfo>;
  license(index: number): Promise<string>;  // LICENSES[index]; one past the end: Electron's
  openCredits(): Promise<void>;             // LICENSES.chromium.html, in the browser
  getSettings(): Promise<Settings>;
  setSettings(s: Settings): Promise<Settings>;
  setOverlay(color: string | null): Promise<void>;  // the caption buttons' patch; null: white
}

export interface AboutInfo {
  version: string; electron: string; chrome: string; node: string;
  licenses: string[]; // titles, in order
}

declare global { interface Window { app: AppApi } }
