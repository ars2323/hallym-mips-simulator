/* What only a real machine of the platform can show, measured on the app
   (the source tree, or a packaged one with SPIM_E2E_EXE):

     1. the simulator process's handles (Windows) or file descriptors
        (Linux) while a program runs and while it is stepped -- the core
        makes a waitable timer on every run_spim() call on Windows
        (CPU/run.cpp start_CP0_timer) and never closes it;
     2. the native file dialogs, as they look: a screenshot of the whole
        screen while the save and the open dialog are up.

     node tools/probe-platform.ts OUTDIR [--expect-no-leak]

   Writes OUTDIR/probe.json and OUTDIR/dialog-*.png. */

import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { launch, openAndAssemble, program, settled, type Running } from '../tests/e2e/harness.ts';

const out = path.resolve(process.argv[2] ?? 'build/probe');
mkdirSync(out, { recursive: true });
const report: Record<string, unknown> = { platform: process.platform };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (m: string) => console.log(`[probe ${new Date().toISOString().slice(11, 19)}] ${m}`);

// Ends the app for good: the whole process tree, whatever it is doing (a
// native dialog may be up, which a polite close waits for).
function kill(r: Running): void {
  let pid: number | undefined;
  try { pid = r.app.process().pid; } catch { return; } // already closed
  if (!pid) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F']);
  else try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ }
}

async function phase(name: string, ms: number, body: () => Promise<void>): Promise<void> {
  log(`${name}: start`);
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([body(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms); })]);
    log(`${name}: done`);
  } catch (e) {
    report[`${name}-error`] = String(e);
    log(`${name}: ${e}`);
  } finally {
    clearTimeout(timer);
  }
}

function pressEscape(): void {
  if (process.platform === 'win32') {
    spawnSync('powershell', ['-NoProfile', '-Command',
      "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{ESC}')"]);
  }
}

function handles(pid: number): number {
  if (process.platform === 'win32') {
    const r = spawnSync('powershell', ['-NoProfile', '-Command', `(Get-Process -Id ${pid}).HandleCount`], { encoding: 'utf8' });
    return Number(r.stdout.trim());
  }
  return readdirSync(`/proc/${pid}/fd`).length;
}

function screenshot(file: string): string {
  if (process.platform === 'win32') {
    const ps = `Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
$bmp.Save('${file}', [System.Drawing.Imaging.ImageFormat]::Png)`;
    const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
    return r.status === 0 ? 'ok' : r.stderr;
  }
  const r = spawnSync('import', ['-window', 'root', file], { encoding: 'utf8' });
  return r.error ? `no screenshot tool (${r.error.message})` : r.status === 0 ? 'ok' : r.stderr;
}

async function simulatorPid(r: Running): Promise<number> {
  const metrics = await r.app.evaluate(({ app }) => app.getAppMetrics().map((m) => ({ pid: m.pid, type: m.type, name: m.name, serviceName: m.serviceName })));
  const sim = metrics.find((m) => m.type === 'Utility' && (m.serviceName === 'Hallym MIPS simulator' || m.name === 'Hallym MIPS simulator'));
  if (!sim) throw new Error(`no simulator process among ${JSON.stringify(metrics)}`);
  return sim.pid;
}

// 1. handles while running and stepping
await phase('handles', 240_000, async () => {
  const r = await launch();
  try {
    await openAndAssemble(r, program(r.dir, 'loop.s', 'main:\nloop:\n  addi $t0, $t0, 1\n  j loop\n'));
    const pid = await simulatorPid(r);
    const before = handles(pid);
    await r.page.keyboard.press('F5');
    await sleep(1000);
    const running1s = handles(pid);
    log(`handles: running, ${running1s}`);
    await sleep(10000);
    const running11s = handles(pid);
    const whileRunning = await r.page.locator('.status').innerText();
    await r.page.keyboard.press('Escape');
    await settled(r.page);
    const stopped = handles(pid);
    log(`handles: stopped, ${stopped}; stepping`);
    for (let i = 0; i < 200; i += 1) {
      await r.page.keyboard.press('F10');
      await settled(r.page);
    }
    const after200Steps = handles(pid);
    const instructions = Number(/([\d,]+)개 명령/.exec(whileRunning)?.[1].replace(/,/g, '') ?? 0);
    report.handles = {
      what: process.platform === 'win32' ? 'HandleCount of the simulator process' : 'open file descriptors of the simulator process',
      before, running1s, running11s, perSecondWhileRunning: (running11s - running1s) / 10,
      stopped, after200Steps, perStep: (after200Steps - stopped) / 200,
      instructionsIn11s: instructions, statusWhileRunning: whileRunning,
    };
    await r.close();
  } finally {
    kill(r);
  }
});

// 2. the native file dialogs
for (const [which, key] of [['save', 'Control+s'], ['open', 'Control+o']] as const) {
  await phase(`dialog-${which}`, 90_000, async () => {
    const r = await launch();
    r.page.on('dialog', (d) => void d.accept()); // "버리고 계속할까요?" before opening
    try {
      await r.page.getByRole('button', { name: /바로 시작/ }).click();
      await r.page.getByRole('button', { name: /새 파일/ }).first().click();
      await r.page.locator('.cm-content').click();
      await r.page.keyboard.insertText('main:\n  li $v0, 10\n  syscall  # 한글 주석\n');
      void r.page.keyboard.press(key).catch(() => {}); // the dialog is modal: do not wait on it
      await sleep(4000);
      report[`dialog-${which}`] = screenshot(path.join(out, `dialog-${which}.png`));
      pressEscape();
      await sleep(1000);
    } finally {
      kill(r);
    }
  });
}

writeFileSync(path.join(out, 'probe.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));

// --expect-no-leak: fail unless the simulator process's handles stay put
// while running and stepping (a little slack for Windows' own thread pool).
if (process.argv.includes('--expect-no-leak')) {
  const h = report.handles as { running1s: number; running11s: number; stopped: number; after200Steps: number } | undefined;
  const grew = h ? { running: h.running11s - h.running1s, stepping: h.after200Steps - h.stopped } : null;
  console.log(`handle growth: ${JSON.stringify(grew)}`);
  if (!grew || grew.running > 10 || grew.stepping > 5) {
    console.error('FAIL  the simulator process gains handles while running or stepping');
    process.exit(1);
  }
  console.log('PASS  no handle growth while running (10 s) or stepping (200 F10)');
}
