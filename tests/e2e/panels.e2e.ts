/* The Run side's panels: the Inspector follows the program, Registers marks
   what just changed, Data reads as a table, slow runs can always be stopped
   or sped up, the Console is open from the start. */

import { expect, test } from '@playwright/test';

import { launch, openAndAssemble, program, regHex, settled, statusText, type Running } from './harness.ts';

let r: Running;
test.beforeEach(async () => { r = await launch(); });
test.afterEach(async () => { await r.close(); });

const LOOP = 'main:\nloop:\n  addi $t0, $t0, 1\n  j loop\n';

test('Inspector: follows PC at every step, pins to a chosen row, follows again on request', async () => {
  const { page } = r;
  await openAndAssemble(r, program(r.dir, 'p.s', 'main:\n  li $t0, 5\n  li $t1, 7\n  li $v0, 10\n  syscall\n'));
  const insp = page.locator('.insp');
  await expect(insp.locator('.ihead')).toHaveCount(0); // not started, nothing chosen: the guide
  await expect(insp).toContainText('한 줄 실행하면');
  await page.keyboard.press('F10');
  await settled(page);
  let pc = await regHex(page, 'PC');
  await expect(insp.locator('.ihead .where')).toContainText(pc);
  await expect(insp.locator('.phead')).toContainText('다음에 실행할 명령');
  await page.keyboard.press('F10');
  await settled(page);
  pc = await regHex(page, 'PC');
  await expect(insp.locator('.ihead .where')).toContainText(pc);

  const chosen = await page.locator('.trow').nth(2).getAttribute('data-addr');
  await page.locator('.trow').nth(2).locator('.dis').click();
  await expect(insp.locator('.phead')).toContainText('고정');
  await expect(insp.locator('.ihead .where')).toContainText(chosen!);
  await page.keyboard.press('F10');
  await settled(page);
  await expect(insp.locator('.ihead .where')).toContainText(chosen!); // still the chosen one
  await insp.getByRole('button', { name: '현재 명령 따라가기' }).click();
  pc = await regHex(page, 'PC');
  await expect(insp.locator('.ihead .where')).toContainText(pc);
  await expect(insp.locator('.phead')).toContainText('다음에 실행할 명령');
});

test('Registers: the register a step changed is marked, with a tag, until the next step', async () => {
  const { page } = r;
  await openAndAssemble(r, program(r.dir, 'p.s', 'main:\n  li $t0, 5\n  li $t1, 7\n  li $v0, 10\n  syscall\n'));
  for (let i = 0; i < 20 && (await regHex(page, '$t0')) === '0x00000000'; i += 1) {
    await page.keyboard.press('F10');
    await settled(page);
  }
  const t0 = page.locator('.rrow[data-reg="$t0"]');
  await expect(t0).toHaveClass(/chg/);
  await expect(t0.locator('.tag')).toBeVisible();
  await expect(page.locator('.rrow.chg')).toHaveCount(1);
  await page.keyboard.press('F10');
  await settled(page);
  await expect(t0).not.toHaveClass(/chg/);
  await expect(page.locator('.rrow[data-reg="$t1"]')).toHaveClass(/chg/);
  await expect(page.locator('.rgroup')).toContainText(['특수', '반환값', '인자', '임시']);
});

test('Data: one address form, sections apart, zero runs spelled out, labels over their line, word and ASCII together', async () => {
  const { page } = r;
  await openAndAssemble(r, program(r.dir, 'd.s',
    '  .data\nmsg: .asciiz "Hello"\nnum: .word 0x12345678\n  .text\nmain:\n  li $v0, 10\n  syscall\n'));
  await page.locator('.ptab', { hasText: 'Data' }).click();
  await expect(page.locator('.dsec')).toHaveText([/사용자 데이터/, /스택/, /커널 데이터.*눌러서 펼치기/]);
  const addresses = await page.locator('.daddr').allTextContents();
  expect(addresses.length).toBeGreaterThan(2);
  for (const a of addresses) expect(a).toMatch(/^0x[0-9a-f]{8}$/);
  await expect(page.locator('.dzero .dzerotext').first()).toContainText(/까지 모두 0 · [\d,]+ 워드/);
  await expect(page.locator('.dtags').filter({ hasText: 'msg' })).toContainText('num');
  const line = page.locator('.drow', { has: page.locator('.dch', { hasText: 'Hell' }) });
  await expect(line.locator('.dval').first()).toHaveText('6c6c6548'); // "Hell", little-endian
  await line.locator('.dval').first().hover();
  await expect(line.locator('.dch.lit')).toHaveText('Hell');
  await page.locator('.dsec', { hasText: '커널 데이터' }).click();
  await expect(page.locator('.dsec', { hasText: '커널 데이터' })).not.toContainText('눌러서 펼치기');
});

test('slow run: one line a second, the Editor and the Inspector follow; Esc stops at once', async () => {
  const { page } = r;
  await openAndAssemble(r, program(r.dir, 'loop.s', LOOP));
  await page.getByRole('radio', { name: '1줄/1초' }).click();
  await page.keyboard.press('F5');
  await expect(page.locator('.status')).toContainText('천천히 실행 중');
  await page.waitForTimeout(2600);
  const text = await statusText(page);
  const n = Number(/(\d+)단계/.exec(text)?.[1]);
  expect(n).toBeGreaterThanOrEqual(2);
  expect(n).toBeLessThanOrEqual(4);   // not the core's millions a second
  await expect(page.locator('.insp .ihead')).toHaveCount(1);
  // Right after a step lands, a whole second of waiting is ahead: Esc must not wait it out.
  await page.waitForFunction((k) => Number(/(\d+)단계/.exec(document.querySelector('.status')!.textContent!)?.[1]) > k, n);
  const t0 = Date.now();
  await page.keyboard.press('Escape');
  await expect(page.locator('.status')).toContainText('멈췄습니다');
  expect(Date.now() - t0).toBeLessThan(500);
  const after = await regHex(page, '$t0');
  await page.waitForTimeout(1500);
  expect(await regHex(page, '$t0')).toBe(after); // and it stays stopped
});

test('slow run switched to 즉시 goes on at full speed; 즉시 switched to slow slows down', async () => {
  const { page } = r;
  await openAndAssemble(r, program(r.dir, 'loop.s', LOOP));
  await page.getByRole('radio', { name: '1줄/1초' }).click();
  await page.keyboard.press('F5');
  await expect(page.locator('.status')).toContainText('천천히 실행 중');
  await page.getByRole('radio', { name: '즉시' }).click();
  await expect(page.locator('.status')).toContainText('개 명령'); // the core's own run, with progress
  await page.waitForTimeout(500);
  await page.getByRole('radio', { name: '1줄/1초' }).click();
  await expect(page.locator('.status')).toContainText('천천히 실행 중');
  const fast = parseInt(await regHex(page, '$t0'), 16);
  expect(fast).toBeGreaterThan(10000);
  await page.keyboard.press('Escape');
  await expect(page.locator('.status')).toContainText('멈췄습니다');
});

test('Console: open from the start; what the program prints is in the body only', async () => {
  const { page } = r;
  await openAndAssemble(r, program(r.dir, 'hi.s',
    '  .data\ns: .asciiz "Hello World"\n  .text\nmain:\n  la $a0, s\n  li $v0, 4\n  syscall\n  li $v0, 10\n  syscall\n'));
  await expect(page.locator('.console')).toHaveClass(/open/);
  await page.keyboard.press('F5');
  await settled(page);
  await expect(page.locator('.clog')).toHaveText('Hello World');
  await expect(page.locator('.console .phead')).not.toContainText('Hello World');
  await page.locator('.console .phead .hbtn').click();
  await expect(page.locator('.console .cbody')).toBeHidden();
});
