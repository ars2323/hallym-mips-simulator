/* Measures the window, in the real app:

     1. registers under repeated F10: time per update, which rows the DOM
        update touched, frame times while it goes on
     2. frame times while a program runs (progress events arrive)
     3. tt.core.s (4,758 instructions) in the Text panel, with the virtual
        list and with every row in the DOM (?text=full): time until painted,
        DOM rows, frame times while scrolling through it

     xvfb-run -a -s '-screen 0 2400x1400x24' npm run measure:ui

   Prints the results and writes them to build/measure-ui.json.  Frame times are from
   requestAnimationFrame; long tasks (>50 ms) from PerformanceObserver. */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';

import { launch, openAndAssemble, program, root, sample, settled, type Running } from '../tests/e2e/harness.ts';

const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return { n: s.length, p50: r2(at(0.5)), p95: r2(at(0.95)), max: r2(s[s.length - 1] ?? 0) };
};

async function startFrames(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __long: number[]; __on: boolean };
    w.__frames = []; w.__long = []; w.__on = true;
    let last = performance.now();
    const tick = (t: number) => { w.__frames.push(t - last); last = t; if (w.__on) requestAnimationFrame(tick); };
    requestAnimationFrame((t) => { last = t; requestAnimationFrame(tick); });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__long.push(e.duration); }).observe({ type: 'longtask' });
  });
}
async function stopFrames(page: Page) {
  const { frames, long } = await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __long: number[]; __on: boolean };
    w.__on = false;
    return { frames: w.__frames, long: w.__long };
  });
  return { frames: stats(frames), over33ms: frames.filter((f) => f > 33.4).length, longTasks: long.length };
}

// Counts, per step, the register rows whose DOM changed at all.
async function watchRegisterRows(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __rowsTouched: number[] };
    w.__rowsTouched = [];
    const list = document.querySelector('.regs-list')!;
    new MutationObserver((ms) => {
      const rows = new Set(ms.map((m) => (m.target instanceof Element ? m.target : m.target.parentElement)!.closest('.rrow')).filter(Boolean));
      w.__rowsTouched.push(rows.size);
    }).observe(list, { subtree: true, childList: true, characterData: true, attributes: true });
  });
}

const results: Record<string, unknown> = {};

async function registers(r: Running) {
  const { page } = r;
  await openAndAssemble(r, program(r.dir, 'loop.s', 'main:\nloop:\n  addi $t0, $t0, 1\n  addi $t1, $t1, 3\n  xor  $t2, $t0, $t1\n  j loop\n'));
  await page.evaluate(() => { window.__perf.registers.length = 0; });
  await watchRegisterRows(page);
  await startFrames(page);
  const t0 = Date.now();
  const STEPS = 300;
  for (let i = 0; i < STEPS; i += 1) {
    await page.keyboard.press('F10');
    await page.waitForFunction((n) => window.__perf.registers.length > n, i);
  }
  const seconds = (Date.now() - t0) / 1000;
  const frames = await stopFrames(page);
  const perf = await page.evaluate(() => window.__perf.registers);
  const touched = await page.evaluate(() => (window as unknown as { __rowsTouched: number[] }).__rowsTouched);
  const totalRows = await page.locator('.rrow').count();
  results.registers = {
    steps: STEPS, stepsPerSecond: Math.round(STEPS / seconds),
    updateMs: stats(perf.map((p) => p.ms)),
    rowsWithNewText: stats(perf.map((p) => p.rows)),
    domRowsTouchedPerStep: stats(touched), totalRegisterRows: totalRows,
    ...frames,
  };
}

async function running(r: Running) {
  const { page } = r;
  await page.getByRole('button', { name: /Reset/ }).click();
  await settled(page);
  await startFrames(page);
  await page.keyboard.press('F5');
  await page.waitForTimeout(2000);
  const frames = await stopFrames(page);
  const status = await page.locator('.status').innerText();
  await page.keyboard.press('Escape');
  await settled(page);
  const instructions = Number(/([\d,]+)개 명령/.exec(status)?.[1].replace(/,/g, '') ?? 0);
  results.running = { seconds: 2, instructionsSoFar: instructions, ...frames };
}

// Fills Text with tt.core.s, scrolls through it, takes one step -- at
// normal speed and with the CPU slowed 4x (CDP), for a slower lab PC.
async function ttcore(r: Running, mode: 'virtual' | 'full') {
  const { page } = r;
  if (mode === 'full') {
    await page.goto(page.url().split('?')[0] + '?text=full');
    await page.waitForSelector('.wcard');
  }
  const cdp = await page.context().newCDPSession(page);
  const out: Record<string, unknown> = {};
  for (const rate of [1, 4]) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await page.evaluate(() => { window.__perf.text.length = 0; });
    const t0 = Date.now();
    if (rate === 1) await openAndAssemble(r, sample(r.dir, 'tests/programs/tt.core.s', `tt.core-${mode}.s`));
    else await page.getByRole('button', { name: /Reset/ }).click(); // assembles the same program again
    await page.waitForFunction(() => window.__perf.text.length > 0);
    const assembleToPainted = Date.now() - t0;
    const text = await page.evaluate(() => window.__perf.text.at(-1)!);
    await startFrames(page);
    await page.evaluate(() => new Promise<void>((done) => { // top to bottom, one step per frame
      const list = document.querySelector('.text') as HTMLElement;
      const max = list.scrollHeight - list.clientHeight;
      let i = 0;
      const next = () => { i += 1; list.scrollTop = (max * i) / 240; if (i < 240) requestAnimationFrame(next); else done(); };
      requestAnimationFrame(next);
    }));
    const scroll = await stopFrames(page);
    const n = await page.evaluate(() => window.__perf.registers.length);
    const s0 = Date.now();
    await page.keyboard.press('F10');
    await page.waitForFunction((k) => window.__perf.registers.length > k, n);
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => setTimeout(done))));
    out[`cpu/${rate}`] = {
      rows: text.rows, domRows: text.nodes, fillMs: Math.round(text.ms), assembleToPaintedMs: assembleToPainted,
      elements: await page.evaluate(() => document.getElementsByTagName('*').length),
      scroll, oneStepToPaintedMs: Date.now() - s0,
    };
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  results[`ttcore-${mode}`] = out;
}

const r = await launch({ width: 1280, height: 800 });
try {
  await registers(r);
  await running(r);
  await ttcore(r, 'virtual');
  await ttcore(r, 'full');
} finally {
  await r.close();
}
const out = path.join(root, 'build/measure-ui.json');
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(results, null, 1));
console.log(JSON.stringify(results, null, 1));
