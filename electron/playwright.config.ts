/* End-to-end tests: the real Electron app (tests/e2e).  One at a time --
   each starts its own window and simulator process.  Needs a display; on a
   Linux machine without one: xvfb-run -a npm run e2e */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '*.e2e.ts',
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
});
