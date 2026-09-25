/* This front end's goldens under its default run parameters
   (tests/golden/default/, written by tools/capture-default-goldens.ts).

   The Qt goldens (qt.test.ts) prove the core is the Qt build's; these prove
   that what ships -- DEFAULT_RUN_PARAMETERS -- gives the same machine state
   every time. */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';

import { defaultCases, snapshotText } from '../helpers/default-golden.ts';
import { root } from '../helpers/machine.ts';

describe('default-parameter goldens', () => {
  const cases = defaultCases();
  test('there are seventeen', () => assert.equal(cases.length, 17));
  for (const c of cases) {
    test(c.name, () => {
      const expected = readFileSync(path.join(root, 'tests/golden/default', `${c.name}.json`), 'utf8');
      assert.equal(snapshotText(c), expected);
    });
  }
});
