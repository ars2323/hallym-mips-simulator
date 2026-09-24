/* "Every place a hexadecimal literal can appear is in the mono font"
   (Pretendard draws 0x1 as 0×1), checked on the rendered window: every text
   node that holds something hexadecimal-looking -- 0x..., or eight hex
   digits as the Text panel shows addresses and words -- must be set in
   D2Coding.  Visited: all four scenes, the Data tab, the console with
   program output and a run-time error, the settings, the CP0 fold. */

import { expect, test, type Page } from '@playwright/test';

import { launch, openAndAssemble, program, sample, settled, type Running } from './harness.ts';

let r: Running;
test.beforeEach(async () => { r = await launch(); });
test.afterEach(async () => { await r.close(); });

async function offenders(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const hexish = /0x[0-9a-f]|\b[0-9a-f]{8}\b/i;
    const bad: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement!;
      if (el.closest('script, style') || !hexish.test(n.textContent!)) continue;
      const font = getComputedStyle(el).fontFamily;
      if (!font.startsWith('D2Coding')) bad.push(`${JSON.stringify(n.textContent)} in <${el.tagName.toLowerCase()} class="${el.className}"> (${font})`);
    }
    return bad;
  });
}

test('hexadecimal is monospaced in every scene', async () => {
  const { page } = r;
  const seen: string[] = [];
  const check = async (where: string) => {
    const bad = await offenders(page);
    seen.push(where);
    expect(bad, where).toEqual([]);
  };
  await check('A');
  await openAndAssemble(r, sample(r.dir, 'tests/samples/lab04.s'));
  await check('B (errors)');
  await openAndAssemble(r, sample(r.dir, 'tests/samples/lab04-ok.s', 'lab04.s'));
  for (let i = 0; i < 16; i += 1) { await page.keyboard.press('F10'); await settled(page); }
  await check('C');
  await page.locator('.regs .fold button').click();
  await check('C with CP0');
  for (const addr of ['0x00400054', '0x00400024', '0x00400014', '0x0040005c']) {
    await page.locator(`.trow[data-addr="${addr}"] .dis`).click();
    await check(`D ${addr}`);
  }
  await page.locator('.tab', { hasText: 'Data' }).click();
  await page.waitForSelector('.drow');
  await check('Data');
  await page.getByTitle('설정').click();
  await check('settings');
  await page.keyboard.press('Escape');

  // Program output with hexadecimal in it, and a run-time error with an address.
  await openAndAssemble(r, program(r.dir, 'out.s', [
    '  .data', 'msg: .asciiz "word 0x10010000 deadbeef\\n"', '  .text', 'main:',
    '  la $a0, msg', '  li $v0, 4', '  syscall', '  li $t0, 0x10010001', '  sw $t0, 0($t0)', '  li $v0, 10', '  syscall', ''].join('\n')));
  await page.keyboard.press('F5');
  await settled(page);
  await expect(page.locator('.clog')).toContainText('0x10010000');
  await check('console + run-time error');
  await page.locator('.console-bar').click();
  await check('console folded');
  expect(seen.length).toBeGreaterThan(8);
});
