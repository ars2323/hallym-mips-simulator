/* Every e2e test at the four window sizes the app is made for: 1280x800,
   the lab PC (1366x768 at 125%: 1093x582), 1024x768 (1024x728 under the
   taskbar) and the narrow window (1366x768 at 150%: 910x505, Editor and Run
   as two tabs).  Tests that size their own windows (fit, tutorial) keep
   theirs; every other one runs at the size given (tests/e2e/harness.ts,
   SPIM_E2E_SIZE).

     xvfb-run -a -s '-screen 0 2400x1400x24' node tools/e2e-widths.ts [playwright args]

   Prints a line per size and fails if any size failed. */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const SIZES = ['1280x800', '1093x582', '1024x728', '910x505'];
const results: string[] = [];
let failed = false;
for (const size of SIZES) {
  const run = spawnSync('npx', ['playwright', 'test', ...process.argv.slice(2)], {
    cwd: root, env: { ...process.env, SPIM_E2E_SIZE: size }, encoding: 'utf8', shell: process.platform === 'win32',
  });
  const out = `${run.stdout}${run.stderr}`;
  process.stdout.write(out);
  const count = (word: string) => Number(new RegExp(`(\\d+) ${word}`).exec(out)?.[1] ?? 0);
  results.push(`${size.padEnd(9)} passed ${count('passed')}, failed ${count('failed')}, flaky ${count('flaky')}, skipped ${count('skipped')}`);
  if (run.status !== 0) failed = true;
}
console.log(`\n${results.join('\n')}`);
process.exit(failed ? 1 : 0);
