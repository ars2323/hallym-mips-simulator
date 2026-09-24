/* The goldens of this front end's own default run parameters.

   Under DEFAULT_RUN_PARAMETERS (argv ["program.s"], no environment) the
   stack, and so $sp, $a1, $a2 and the stack's memory, differ from what the
   Qt build's goldens were captured with.  The cases whose output depends on
   that -- the six register logs and the eleven data logs that show the
   stack -- are captured again here, as data (JSON), in the form this front
   end shows them: values through src/core/format.ts and memory-text.ts,
   rows through memory-rows.ts.  tools/capture-default-goldens.ts writes
   them; tests/golden/default.test.ts compares.
*/

import * as spim from '../../native/index.ts';
import { hex32, inBase32 } from '../../src/core/format.ts';
import { rowEnd } from '../../src/core/memory-rows.ts';
import { asciiText, memoryValueText } from '../../src/core/memory-text.ts';
import { generalRegisterName } from '../../src/core/registers.ts';
import { dataSections, readCases, replay, type GoldenCase } from './machine.ts';

// The seventeen: every register log, and every data log with the stack in it.
export function defaultCases(): GoldenCase[] {
  return readCases().filter((c) =>
    c.stream === 'intregs-log' || (c.stream === 'data-log' && !c.args.includes('action_Data_DisplayUserStack')));
}

export function snapshot(c: GoldenCase): unknown {
  const r = replay(c, spim.DEFAULT_RUN_PARAMETERS);
  if (c.stream === 'intregs-log') {
    const g = spim.registers();
    const v = (n: number) => inBase32(n, r.display.regBase);
    return {
      case: c.name,
      base: r.display.regBase,
      registers: {
        PC: v(g.pc), EPC: v(g.epc), Cause: v(g.cause), BadVAddr: v(g.badVAddr), Status: v(g.status),
        HI: v(g.hi), LO: v(g.lo),
        ...Object.fromEntries(g.general.map((value, n) => [generalRegisterName(n), v(value)])),
      },
    };
  }
  return {
    case: c.name,
    base: r.display.dataBase,
    sections: dataSections(r.display).map((s) => ({
      name: s.name,
      from: hex32(s.from),
      to: hex32(s.to),
      rows: s.rows.map((row) => (row.kind === 'ZeroRun'
        ? `${hex32(row.address)}..${hex32(rowEnd(row) - 1)} zero`
        : `${hex32(row.address)} ${row.values.map((w) => memoryValueText(w, 4, r.display.dataBase)).join(' ')} |${asciiText(row.bytes)}|`)),
    })),
  };
}

export const snapshotText = (c: GoldenCase): string => JSON.stringify(snapshot(c), null, 1) + '\n';
