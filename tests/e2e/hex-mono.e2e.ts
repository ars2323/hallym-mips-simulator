/* "Every place a hexadecimal literal can appear is in the mono font"
   (Pretendard draws 0x1 as 0×1), checked on the rendered window: every text
   node that holds something hexadecimal-looking -- 0x..., or eight hex
   digits as the Text panel shows addresses and words -- must be set in
   D2Coding.  Visited: all four scenes, the Data tab, the console with
   program output and a run-time error, the settings, the CP0 fold. */

import { expect, test, type Page } from '@playwright/test';

import { launch, openAndAssemble, program, sample, settled, textRow, type Running } from './harness.ts';

let r: Running;
test.beforeEach(async () => { r = await launch(); });
test.afterEach(async () => { await r.close(); });

async function offenders(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    // Hexadecimal (0x..., eight hex digits), and any Latin identifier with
    // the digit zero in it ($t0, CP0, F10): Pretendard's zero is a plain
    // oval, next to letters it reads as the letter O.
    const hexish = /0x[0-9a-f]|\b[0-9a-f]{8}\b|[A-Za-z$][A-Za-z0-9$]*0|0[A-Za-z]/i;
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
    await (await textRow(page, addr)).locator('.dis').click();
    await check(`D ${addr}`);
  }
  await page.locator('.ptab', { hasText: 'Data' }).click();
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
  await page.locator('.console .phead .hbtn').click();
  await check('console folded');
  expect(seen.length).toBeGreaterThan(8);
});

test('Pretendard and D2Coding are loaded, not stood in for by a system font', async () => {
  const { page } = r;
  await openAndAssemble(r, sample(r.dir, 'tests/samples/lab04-ok.s', 'lab04.s'));
  await (await textRow(page, '0x00400054')).locator('.dis').click(); // headings, bold, mono: every face in use
  await page.evaluate(() => document.fonts.ready);
  const faces = await page.evaluate(() => [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.status}`));
  expect(faces.sort()).toEqual([
    'D2Coding normal loaded', // its @font-face gives no weight
    'Pretendard 400 loaded', 'Pretendard 500 loaded', 'Pretendard 600 loaded', 'Pretendard 700 loaded',
  ]);
  expect(await page.evaluate(() => document.fonts.check('13px D2Coding') && document.fonts.check('600 13px Pretendard'))).toBe(true);
});
