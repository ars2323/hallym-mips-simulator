/* Writes tests/golden/default/*.json: the goldens of this front end's own
   default run parameters (tests/helpers/default-golden.ts says which and
   why).  Run it only when a change to them is intended, and say so in the
   commit; tests/golden/default.test.ts compares against what it wrote. */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { defaultCases, snapshotText } from '../tests/helpers/default-golden.ts';
import { root } from '../tests/helpers/machine.ts';

const dir = path.join(root, 'tests/golden/default');
mkdirSync(dir, { recursive: true });
for (const c of defaultCases()) {
  writeFileSync(path.join(dir, `${c.name}.json`), snapshotText(c));
  console.log(`captured tests/golden/default/${c.name}.json`);
}
