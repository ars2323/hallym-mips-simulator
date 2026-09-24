/* Screenshots of the second UI pass (docs/screens/ui2/README.md):

     xvfb-run -a -s '-screen 0 2400x1400x24' node tools/capture-ui2.ts

   split-before, split-running, error, data, inspector, dialog at 1280x800;
   the lab PC (1366x768 at 125%: a maximised window is 1093x582 CSS px,
   drawn at 1.25) running; and the sizes the layout is asked to survive:
   1024x768, 1366x768 at 150% (910x505 CSS px). */

import path from 'node:path';

import { launch, openAndAssemble, program, root, sample, settled, textRow, type Running } from '../tests/e2e/harness.ts';

const out = path.join(root, 'docs/screens/ui2');
const LAB04 = 'tests/samples/lab04-ok.s';
const DATA = ['  .data', 'msg:   .asciiz "Hello, MIPS!"', 'count: .word 3', 'table: .word 0x12345678, -1, 255', '  .text', 'main:',
  '  la   $a0, msg', '  li   $v0, 4', '  syscall', '  lw   $t0, count', '  la   $t1, table', '  lw   $t2, 4($t1)',
  '  addi $sp, $sp, -8', '  sw   $t0, 4($sp)', '  li   $v0, 10', '  syscall', ''].join('\n');

async function shot(r: Running, name: string): Promise<void> {
  await r.page.mouse.move(0, 300);
  await r.page.evaluate(() => document.fonts.ready);
  await r.page.waitForTimeout(1100); // past the registers' flash
  await r.page.screenshot({ path: path.join(out, `${name}.png`) });
  console.log(`wrote docs/screens/ui2/${name}.png`);
}

async function stepped(r: Running, n: number): Promise<void> {
  await openAndAssemble(r, sample(r.dir, LAB04, 'lab04.s'));
  for (let i = 0; i < n; i += 1) { await r.page.keyboard.press('F10'); await settled(r.page); }
}

{
  const r = await launch({ width: 1280, height: 800 });
  await r.page.getByRole('button', { name: /바로 시작/ }).click();
  await r.page.getByRole('button', { name: /새 파일/ }).first().click();
  await r.page.locator('.cm-content').click();
  await r.page.keyboard.insertText('main:\n    li   $t0, 5\n    li   $t1, 7\n    add  $t2, $t0, $t1\n    li   $v0, 10\n    syscall\n');
  await shot(r, 'split-before');
  await stepped(r, 16);
  await shot(r, 'split-running');
  await (await textRow(r.page, '0x00400054')).locator('.dis').click();
  await shot(r, 'inspector');
  await r.page.getByTitle('새 파일').click();
  await r.page.waitForSelector('dialog.ask');
  await shot(r, 'dialog');
  await r.page.keyboard.press('Escape');
  await openAndAssemble(r, sample(r.dir, 'tests/samples/lab04.s'));
  await shot(r, 'error');
  await openAndAssemble(r, program(r.dir, 'data.s', DATA));
  for (let i = 0; i < 14; i += 1) { await r.page.keyboard.press('F10'); await settled(r.page); }
  await r.page.locator('.ptab', { hasText: 'Data' }).click();
  await r.page.waitForSelector('.drow');
  await shot(r, 'data');
  await r.close();
}

for (const [name, size, scale] of [
  ['lab-1366x768-125', { width: 1093, height: 582 }, '1.25'],
  ['1366x768-150', { width: 910, height: 505 }, '1.5'],
  ['1024x768', { width: 1024, height: 728 }, '1'],
] as const) {
  const r = await launch(size, { switches: [`--force-device-scale-factor=${scale}`] });
  await stepped(r, 16);
  await shot(r, name);
  await r.close();
}
