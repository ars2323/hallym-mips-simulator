/* Check 2 of the spike: src/core/decoder.ts against the SPIM core.

     node tests/spike/check-decoder.ts [PROGRAM...]

   Defaults to tests/programs/tt.core.s.  The comparison itself is
   tests/helpers/decoder-oracle.ts, which tests/core/decoder.test.ts runs
   too. */

import path from 'node:path';

import { checkDecoder } from '../helpers/decoder-oracle.ts';

const root = path.join(import.meta.dirname, '..', '..');
const programs = process.argv.length > 2 ? process.argv.slice(2) : [path.join(root, 'tests/programs/tt.core.s')];

let failed = false;
for (const program of programs) {
  const r = checkDecoder(program);
  console.log(`${r.failures.length ? 'FAIL' : 'PASS'}  ${path.basename(program)}: ${r.instructions} instructions `
              + `(${r.distinctWords} distinct words, ${r.mnemonics} mnemonics), `
              + `${r.fieldChecks} operand texts matched field by field`
              + (r.assemblerErrors ? `  [assembler reported ${r.assemblerErrors} error(s)]` : ''));
  console.log(`      formats: ${[...r.formats].map(([k, v]) => `${k} ${v}`).join(', ')}`);
  if (r.quirks.size) console.log(`      core inst_decode() quirks met: ${[...r.quirks].map(([k, v]) => `${k} x${v}`).join(', ')}`);
  if (r.release2.size) console.log(`      Release 2 duplicate encodings: ${[...r.release2].map(([k, v]) => `${k} x${v}`).join(', ')}`);
  for (const f of r.failures) console.log(`      ${f}`);
  if (r.failures.length) failed = true;
}
process.exit(failed ? 1 : 0);
