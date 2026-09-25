/* Preloaded into every Node test process (package.json "test",
   tools/mutants.ts, and the child that tests/node/run-parameters.test.ts
   starts).

   On Linux the core's CP0 timer is a one-shot real-time itimer: each run
   arms it for 10 ms (TIMER_TICK_MS) and sets SIGALRM to be ignored
   (CPU/run.cpp start_CP0_timer).  A test file whose last test ran the core
   can reach its end with the tick still pending; if it falls due while the
   process is tearing down, SIGALRM is no longer ignored and kills it after
   every test has passed ("signal: SIGALRM", once in several runs).  So a
   test process waits out the tick before it exits.  CPU/ is not changed;
   the application is not affected (this file is for the tests only). */

if (process.platform !== 'win32') {
  process.on('exit', () => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25); });
}
