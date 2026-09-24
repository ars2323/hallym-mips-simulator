/* Replaying the Qt build's golden cases on the addon, and taking the
   machine's state as data.

   tests/golden/cases.txt lists each case as the Qt build's devtools ran it
   (tools/capture-goldens.sh there): a program, command-line actions, and
   which log to dump.  replay() does the same actions through native/:
   load, then --steps N (N single steps) or --run (run to the end), and
   collects what the --trigger options switch in the Qt windows.  Those
   switches only decide what the Qt log shows; they are kept as `Display`
   and change nothing in the machine.
*/

import { readFileSync } from 'node:fs';
import path from 'node:path';

import * as spim from '../../native/index.ts';
import { layoutMemoryRows, type MemoryRow } from '../../src/core/memory-rows.ts';

export const root = path.join(import.meta.dirname, '..', '..');

export interface GoldenCase {
  name: string;
  program: string; // as cases.txt names it, relative to the Qt repository
  args: string[];
  stream: 'intregs-log' | 'text-log' | 'data-log' | 'log';
}

export function readCases(): GoldenCase[] {
  return readFileSync(path.join(root, 'tests/golden/cases.txt'), 'utf8')
    .split('\n')
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => {
      const [name, program, args, stream] = line.split('|');
      return { name, program, args: args.split(' ').filter(Boolean), stream: stream as GoldenCase['stream'] };
    });
}

// Where this repository keeps the program a case names.
export function programPath(program: string): string {
  if (program === 'helloworld.s') return path.join(root, 'tests/programs/helloworld.s');
  if (program.startsWith('Tests/')) return path.join(root, 'tests/programs', program.slice(6));
  if (program.startsWith('tests/samples/')) return path.join(root, program);
  throw new Error(`unknown program ${program}`);
}

export interface Display {
  textUser: boolean;
  textKernel: boolean;
  textComments: boolean;
  textValue: boolean;
  dataUser: boolean;
  dataStack: boolean;
  dataKernel: boolean;
  dataBase: 2 | 10 | 16;
  regBase: 2 | 10 | 16;
}

export const DEFAULT_DISPLAY: Readonly<Display> = Object.freeze({
  textUser: true, textKernel: true, textComments: true, textValue: true,
  dataUser: true, dataStack: true, dataKernel: true, dataBase: 16, regBase: 16,
});

const TRIGGERS: Record<string, (d: Display) => void> = {
  action_Text_DisplayKernelText: (d) => { d.textKernel = !d.textKernel; },
  action_Text_DisplayUserText: (d) => { d.textUser = !d.textUser; },
  action_Text_DisplayComments: (d) => { d.textComments = !d.textComments; },
  action_Text_DisplayInstructionValue: (d) => { d.textValue = !d.textValue; },
  action_Data_DisplayBinary: (d) => { d.dataBase = 2; },
  action_Data_DisplayDecimal: (d) => { d.dataBase = 10; },
  action_Data_DisplayUserData: (d) => { d.dataUser = !d.dataUser; },
  action_Data_DisplayUserStack: (d) => { d.dataStack = !d.dataStack; },
  action_Data_DisplayKernelData: (d) => { d.dataKernel = !d.dataKernel; },
};

export interface Replayed {
  display: Display;
  assembled: spim.AssembleResult;
  runErrors: string[];     // what the core reported while stepping or running
  unsupported?: string;    // an action this front end does not offer yet
}

export function replay(c: GoldenCase, run: spim.RunParameters): Replayed {
  const display: Display = { ...DEFAULT_DISPLAY };
  const assembled = spim.assemble(readFileSync(programPath(c.program)), { run, fileName: c.program });
  const runErrors: string[] = [];
  let unsupported: string | undefined;
  for (let i = 0; i < c.args.length; i += 1) {
    const a = c.args[i];
    if (a === '--steps') {
      const n = Number(c.args[++i]);
      for (let s = 0; s < n; s += 1) {
        spim.step(1);
        runErrors.push(...spim.errors());
      }
    } else if (a === '--run') {
      while (spim.step(100000)) runErrors.push(...spim.errors());
      runErrors.push(...spim.errors());
    } else if (a === '--reg-base') {
      display.regBase = Number(c.args[++i]) as Display['regBase'];
    } else if (a === '--trigger') {
      const t = TRIGGERS[c.args[++i]];
      if (!t) throw new Error(`unknown trigger ${c.args[i]}`);
      t(display);
    } else if (a === '--redisplay') {
      // Qt only: its toggles do not redraw by themselves.
    } else if (a === '--breakpoint') {
      unsupported = `--breakpoint ${c.args[++i]} (setting a breakpoint is a write the addon does not offer yet)`;
    } else {
      throw new Error(`unknown argument ${a}`);
    }
  }
  return { display, assembled, runErrors, unsupported };
}

// ---- the machine as data -------------------------------------------------

export interface TextSection {
  name: 'User Text Segment' | 'Kernel Text Segment';
  from: number;
  to: number;
  lines: spim.TextWord[];
}

export function textSections(display: Display): TextSection[] {
  const s = spim.segments();
  const all = spim.textSegment();
  const sections: TextSection[] = [];
  if (display.textUser) {
    sections.push({ name: 'User Text Segment', from: s.textBot, to: s.textTop,
                    lines: all.filter((t) => t.addr >= s.textBot && t.addr < s.textTop) });
  }
  if (display.textKernel) {
    sections.push({ name: 'Kernel Text Segment', from: s.kTextBot, to: s.kTextTop,
                    lines: all.filter((t) => t.addr >= s.kTextBot && t.addr < s.kTextTop) });
  }
  return sections;
}

export interface DataRow extends MemoryRow {
  values: number[];   // Words rows: the words, unsigned
  bytes: number[];    // Words rows: their bytes in memory order
}

export interface DataSection {
  name: 'User data segment' | 'User Stack' | 'Kernel data segment';
  from: number;
  to: number;
  rows: DataRow[];
}

function dataSection(name: DataSection['name'], from: number, to: number): DataSection {
  const first = Math.ceil(from / 4) * 4;
  const words = spim.readWords(first, (to - first) / 4);
  const reader = { word: (a: number) => words[(a - first) / 4] };
  const rows = layoutMemoryRows(from, to, reader).map((row) => {
    if (row.kind === 'ZeroRun') return { ...row, values: [], bytes: [] };
    return {
      ...row,
      values: Array.from({ length: row.words }, (_, i) => reader.word(row.address + 4 * i)),
      bytes: [...spim.readBytes(row.address, 4 * row.words)],
    };
  });
  return { name, from, to, rows };
}

// The sections as QtSpim's data window lists them (QtSpim/datawin.cpp):
// user data, the stack from $sp (rounded down to a word), kernel data.
export function dataSections(display: Display): DataSection[] {
  const s = spim.segments();
  const sp = spim.registers().general[29];
  const sections: DataSection[] = [];
  if (display.dataUser) sections.push(dataSection('User data segment', s.dataBot, s.dataTop));
  if (display.dataStack) sections.push(dataSection('User Stack', sp - (sp % 4), s.stackTop));
  if (display.dataKernel) sections.push(dataSection('Kernel data segment', s.kDataBot, s.kDataTop));
  return sections;
}
