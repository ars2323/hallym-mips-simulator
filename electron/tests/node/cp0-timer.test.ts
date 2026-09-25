/* The core's timer: CP0 Count goes up every 10 ms while a program runs
   (CPU/run.cpp start_CP0_timer / bump_CP0_timer).  On Windows it runs on
   the one unnamed waitable timer of native/src/run-win.cpp; this is the
   check that it still ticks there (docs/PORTING.md 14). */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as spim from '../../native/index.ts';

test('CP0 Count counts while a program runs, in slices as the simulator process runs it', () => {
  // About 3 million instructions (roughly a second), then Count into $t1.
  spim.assemble('main: li $t0, 1000000\nloop: addi $t0, $t0, -1\n bne $t0, $0, loop\n mfc0 $t1, $9\n li $v0, 10\n syscall\n');
  const started = Date.now();
  let stop: spim.RunStop = 'limit';
  while (stop === 'limit') stop = spim.run(10000);
  const ms = Date.now() - started;
  assert.equal(stop, 'exit');
  const count = spim.registers().general[9];
  assert.ok(count > 0, `Count stayed 0 over ${ms} ms`);
  // Not a clock: the core's 10 ms is the OS timer's, and under load it runs
  // a little ahead of Date.now().  Only a runaway count is wrong.
  assert.ok(count <= 2 * Math.ceil(ms / 10) + 5, `Count ${count} runs away: over ${ms} ms`);
});
