/* A test program assembled under the default run parameters, with what the
   core says about it: its instructions, its symbol listing as a LabelMap,
   and the source file each instruction's line number refers to. */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import * as spim from '../../native/index.ts';
import { LabelMap, parseSymbolListing } from '../../src/core/symbols.ts';
import { root } from './machine.ts';

export interface Loaded {
  result: spim.AssembleResult;
  text: spim.TextWord[];
  labels: LabelMap;
  // The files an instruction can have come from, as lines: the exception
  // handler for the start-up code (below __eoth), the program for the rest
  // of user text, and either for kernel text (a program may add .ktext).
  sourcesOf(addr: number): string[][];
}

export function load(file: string): Loaded {
  const bytes = readFileSync(path.isAbsolute(file) ? file : path.join(root, file));
  const result = spim.assemble(bytes);
  const labels = new LabelMap();
  for (const s of parseSymbolListing(result.symbols)) labels.add(s.name, s.address);
  const program = bytes.toString('utf8').split('\n');
  const handler = readFileSync(path.join(root, '../CPU/exceptions.s'), 'utf8').split('\n');
  const eoth = labels.find('__eoth');
  if (eoth === undefined) throw new Error('no __eoth in the symbol listing');
  return {
    result,
    text: spim.textSegment(),
    labels,
    sourcesOf: (addr) => (addr < eoth ? [handler] : addr >= 0x80000000 ? [handler, program] : [program]),
  };
}

// "[0x00400014]\t0x0c100009  jal 0x00400024 [main]   ; 188: jal main"
//  -> { disassembly: "jal 0x00400024 [main]", source: "188: jal main" }
export function coreLine(line: string): { disassembly: string; source: string | null } {
  const m = /^\[0x[0-9a-f]{8}\]\t0x[0-9a-f]{8}  (.*)$/s.exec(line);
  if (!m) throw new Error(`not a core line: ${JSON.stringify(line)}`);
  const i = m[1].indexOf(';');
  if (i < 0) return { disassembly: m[1].trim(), source: null };
  return { disassembly: m[1].slice(0, i).trim(), source: m[1].slice(i + 1).trim() };
}
