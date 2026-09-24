/* The window's main paths, end to end in the real app. */

import { expect, test } from '@playwright/test';
import path from 'node:path';

import { answerSave, launch, openAndAssemble, program, regHex, sample, settled, statusText, type Running } from './harness.ts';

let r: Running;
test.beforeEach(async () => { r = await launch(); });
test.afterEach(async () => { await r.close(); });

test('first screen -> new file -> paste -> Ctrl+S -> errors -> fix -> Ctrl+S -> Text', async () => {
  const { app, page } = r;
  await expect(page.locator('.wcard h1')).toHaveText('안녕하세요!');
  await page.getByRole('button', { name: /바로 시작/ }).click();
  await page.getByRole('button', { name: /새 파일/ }).first().click();
  await expect(page.locator('.editor-panel')).toBeVisible();

  const source = 'main:\n  li   $t0, 5\n  srll $t1, $t0, 1\n  li   $v0, 10\n  syscall\n';
  await app.evaluate(({ clipboard }, t) => clipboard.writeText(t), source);
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+v');
  await expect(page.locator('.cm-line').nth(2)).toHaveText('  srll $t1, $t0, 1');

  const saved = path.join(r.dir, 'week1.s');
  await answerSave(app, saved);
  await page.keyboard.press('Control+s');
  const item = page.locator('.errors .item');
  await expect(item).toHaveCount(1);
  await expect(item.locator('.line')).toHaveText('3행');
  await expect(page.locator('.cm-error-line')).toHaveCount(1);
  await expect(page.locator('.titlebar .file')).toContainText('week1.s');

  await item.getByRole('button', { name: '이 줄로 가기' }).click();
  await page.keyboard.press('Shift+End');
  await page.keyboard.insertText('  srl  $t1, $t0, 1');
  await page.keyboard.press('Control+s');

  await expect(page.locator('.run-grid')).toBeVisible();
  await expect(page.locator('.ptab.on')).toHaveText('Text');
  await expect(page.locator('.errors')).toBeHidden();
  await expect(page.locator('.trow .src', { hasText: 'srl  $t1, $t0, 1' })).toHaveCount(1);
});

test('F10 changes registers and highlights only what changed', async () => {
  const { page } = r;
  await openAndAssemble(r, program(r.dir, 'f10.s', 'main:\n  li $t0, 5\n  srl $t1, $t0, 1\n  li $v0, 10\n  syscall\n'));
  await expect(page.locator('.run-grid')).toBeVisible();
  for (let i = 0; i < 20 && (await regHex(page, '$t0')) === '0x00000000'; i += 1) {
    await page.keyboard.press('F10');
    await settled(page);
  }
  expect(await regHex(page, '$t0')).toBe('0x00000005');
  await expect(page.locator('.rrow[data-reg="$t0"]')).toHaveClass(/chg/);
  await expect(page.locator('.rrow.chg')).toHaveCount(1);
  await expect(page.locator('.status')).toContainText('$t0');

  await page.keyboard.press('F10');
  await settled(page);
  expect(await regHex(page, '$t1')).toBe('0x00000002');
  await expect(page.locator('.rrow.chg')).toHaveCount(1);
  await expect(page.locator('.rrow[data-reg="$t1"]')).toHaveClass(/chg/);
  await expect(page.locator('.rrow[data-reg="$t0"]')).not.toHaveClass(/chg/);
  // The PC row in Text follows.
  const pc = await regHex(page, 'PC');
  await expect(page.locator('.trow.pc')).toHaveAttribute('data-addr', pc);
});

test('choosing an instruction opens the Inspector with its fields', async () => {
  const { page } = r;
  await openAndAssemble(r, sample(r.dir, 'tests/samples/lab04-ok.s', 'lab04.s'));
  const panel = page.locator('.insp');
  await expect(panel.locator('.ihead')).toHaveCount(0); // nothing chosen: the guide
  await page.locator('.trow[data-addr="0x00400054"] .dis').click();
  await expect(panel.locator('.ihead .dis')).toHaveText('sra $17, $14, 1');
  await expect(panel.locator('.bits .fn')).toHaveText(['opcode', 'rs', 'rt', 'rd', 'shamt', 'funct']);
  await expect(panel.locator('.bits .b')).toHaveText(['000000', '00000', '01110', '10001', '00001', '000011']);
  await expect(panel.locator('.ftable tr').nth(3).locator('td').last()).toHaveText('$t6');
  await expect(panel.locator('.explain')).toContainText('sra — Shift Right Arithmetic');
  await expect(panel.locator('.explain')).toContainText('$s1');
  await page.keyboard.press('Escape');
  await expect(panel.locator('.ihead')).toHaveCount(0);
});

test('breakpoint -> F5 stops there -> F5 goes on to the end', async () => {
  const { page } = r;
  await openAndAssemble(r, program(r.dir, 'bp.s', 'main:\n  li $t0, 1\n  li $t1, 2\n  add $t2, $t0, $t1\n  li $v0, 10\n  syscall\n'));
  const row = page.locator('.trow', { has: page.locator('.src', { hasText: 'add $t2' }) });
  const addr = await row.getAttribute('data-addr');
  await row.locator('.bp').click();
  await expect(row).toHaveClass(/bp-on/);
  await page.keyboard.press('F5');
  await settled(page);
  expect(await statusText(page)).toContain('브레이크포인트');
  await expect(page.locator('.trow.pc')).toHaveAttribute('data-addr', addr!);
  expect(await regHex(page, '$t2')).toBe('0x00000000');
  expect(await regHex(page, '$t1')).toBe('0x00000002');

  await page.keyboard.press('F5');
  await settled(page);
  expect(await statusText(page)).toContain('프로그램이 끝났습니다');
  expect(await regHex(page, '$t2')).toBe('0x00000003');
  // The first run that ends well, once a session.
  await expect(page.locator('.congrats')).toBeVisible();
  await page.locator('.congrats').getByRole('button', { name: '닫기' }).click();
  await page.getByRole('button', { name: /처음으로/ }).click();
  await expect(page.locator('.trow', { has: page.locator('.src', { hasText: 'add $t2' }) })).toHaveClass(/bp-on/);
  await page.keyboard.press('F5');
  await settled(page);
  await page.keyboard.press('F5');
  await settled(page);
  expect(await statusText(page)).toContain('프로그램이 끝났습니다');
  await expect(page.locator('.congrats')).toBeHidden();
});

test('an endless loop: F5, stop, the registers are there to read', async () => {
  const { page } = r;
  await openAndAssemble(r, program(r.dir, 'loop.s', 'main:\nloop:\n  addi $t0, $t0, 1\n  j loop\n'));
  await page.keyboard.press('F5');
  await expect(page.locator('.status .run')).toHaveText('실행 중');
  await expect(page.locator('.status')).toContainText('개 명령'); // progress arrives while running
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await settled(page);
  expect(await statusText(page)).toContain('멈췄습니다');
  const t0 = parseInt(await regHex(page, '$t0'), 16);
  expect(t0).toBeGreaterThan(1000);
  // Still a machine: one more step, and the Inspector reads it.
  await page.keyboard.press('F10');
  await settled(page);
  const pc = await regHex(page, 'PC');
  await page.locator(`.trow[data-addr="${pc}"] .dis`).click();
  await expect(page.locator('.insp .ihead .dis')).toBeVisible();
});

test('console input: the run waits, Enter goes on', async () => {
  const { page } = r;
  await openAndAssemble(r, program(r.dir, 'read.s',
    'main:\n  li $v0, 5\n  syscall\n  addi $a0, $v0, 1\n  li $v0, 1\n  syscall\n  li $v0, 10\n  syscall\n'));
  await page.keyboard.press('F5');
  const input = page.locator('.cinput');
  await expect(input).toBeVisible();
  await expect(input).toBeFocused();
  expect(await statusText(page)).toContain('입력을 기다립니다');
  // The run is not going on: F5 again just points at the field.
  await expect(page.getByTitle('실행 (F5)')).toBeDisabled();
  await input.fill('41');
  await input.press('Enter');
  await expect(page.locator('.clog')).toHaveText('41\n42');
  await settled(page);
  expect(await statusText(page)).toContain('프로그램이 끝났습니다');
  await expect(input).toBeHidden();
});

test('the simulator process dies (.err): the window says so and goes on with a fresh one', async () => {
  const { page } = r;
  await openAndAssemble(r, program(r.dir, 'err.s', '  .text\nmain:\n  .err\n'));
  await expect(page.locator('.status .err')).toContainText('시뮬레이터가 중단되었습니다');
  await openAndAssemble(r, program(r.dir, 'ok.s', 'main:\n  li $t0, 7\n  li $v0, 10\n  syscall\n'));
  await page.keyboard.press('F5');
  await settled(page);
  expect(await statusText(page)).toContain('프로그램이 끝났습니다');
  expect(await regHex(page, '$t0')).toBe('0x00000007');
});
