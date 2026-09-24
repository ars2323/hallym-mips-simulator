// ============================================================================
//  WINDOWS ONLY.  CPU/run.cpp, with one Windows call replaced at build time.
//
//  On Windows, native/binding.gyp compiles this file INSTEAD OF CPU/run.cpp.
//  It puts the lines below in front of the core's run.cpp -- a forced include
//  (gyp cannot give one source file its own /FI) -- and then includes
//  CPU/run.cpp itself, which stays byte for byte as it is.  Linux and macOS
//  compile CPU/run.cpp directly and are not affected.
//
//  What:  CreateWaitableTimer() in CPU/run.cpp start_CP0_timer() becomes
//         spimCreateWaitableTimer() below: ONE UNNAMED waitable timer per
//         process, made on the first call and returned on every later one.
//
//  Why:   start_CP0_timer() runs at every run_spim() -- every slice of a run
//         and every single step -- and calls
//             CreateWaitableTimer(NULL, TRUE, TEXT("SPIMTimer"))
//         without ever closing the handle.
//         1. The handles leak: one per run_spim(), measured on Windows at
//            364-850 a second while a program runs and 1 per F10.
//         2. The name is shared by the whole Windows session: two simulators
//            running at once (this one and the Qt build 1.x, or two of this
//            one) arm the SAME timer, and each SetWaitableTimer() takes it
//            over from the other -- the other's CP0 Count stops counting.
//         An unnamed timer made once has neither problem.  Everything else
//         stays as the core wrote it: SetWaitableTimer() re-arms the one
//         timer at every run_spim() (as it re-armed the one named timer),
//         and its completion routine (an APC) still reaches the thread that
//         runs the core, which calls SleepEx(0, TRUE) at every instruction.
//
//  The timer only drives CP0 Count/Compare (interrupt 7); nothing else in the
//  core uses it.  docs/PORTING.md 14, "코어 타이머".
// ============================================================================

#define VC_EXTRALEAN  // as CPU/run.cpp has it, so that <Windows.h> is the same
#include <Windows.h>

#undef CreateWaitableTimer
#define CreateWaitableTimer spimCreateWaitableTimer
static HANDLE spimCreateWaitableTimer(LPSECURITY_ATTRIBUTES, BOOL manualReset, LPCTSTR name);

// The core's own file, unchanged.  Its "quoted" includes resolve next to it.
#include "../../CPU/run.cpp"

#undef CreateWaitableTimer

static HANDLE spimCreateWaitableTimer(LPSECURITY_ATTRIBUTES, BOOL manualReset, LPCTSTR) {
  // No name: private to this process.  Made once: nothing to leak.  (A
  // failure returns NULL, which start_CP0_timer() reports as before.)
  static HANDLE timer = CreateWaitableTimerW(NULL, manualReset, NULL);
  return timer;
}
