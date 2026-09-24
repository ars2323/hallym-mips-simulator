/* What a window keeps as it narrows (docs/PORTING.md 17):
   - Registers keep Hex, Dec and Bin, Text keeps Address, Encoding and
     Instruction, at 1280x800, on a lab PC (1366x768 at 125%: 1093x582),
     at 1024x768 and at 1366x768 at 150% (910x505, the Run tab);
   - a column the width takes away comes back from the panel's head;
   - the toolbar's buttons keep their names, the speed says what it is,
     and the first screen has no toolbar;
   - no Korean word is broken across two lines;
   - a file's name is never followed by a particle;
   - the Editor has no band for the cursor, only the line of PC;
   - assembly errors are on the Run side with one Haram;
   - after a step the Registers show the register it changed, unless the
     student is scrolling them;
   - the Inspector folds instead of scrolling sideways. */

import { expect, test, type Page } from '@playwright/test';

import { brokenWords, launch, openAndAssemble, resize, sample, settled, type Running } from './harness.ts';

const SIZES = [
  { name: '1280x800', width: 1280, height: 800 },
  { name: 'a lab PC (1366x768 at 125%)', width: 1093, height: 582 },
  { name: '1024x768', width: 1024, height: 728 },
  { name: '1366x768 at 150%, the Run tab', width: 910, height: 505 },
];

async function lab04(r: Running, steps = 16): Promise<void> {
  await openAndAssemble(r, sample(r.dir, 'tests/samples/lab04-ok.s', 'lab04.s'));
  for (let i = 0; i < steps; i += 1) { await r.page.keyboard.press('F10'); await settled(r.page); }
}

const shown = (page: Page, selector: string) =>
  page.locator(selector).evaluateAll((els) => els.filter((e) => e.checkVisibility()).map((e) => e.textContent));
const whole = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((e) => e.scrollWidth <= e.clientWidth + 1);

for (const size of SIZES) {
  test(`${size.name}: the course's columns, the buttons' names, whole words`, async () => {
    const r = await launch(size);
    const { page } = r;
    try {
      await lab04(r);
      expect(await shown(page, '.rhead > span')).toEqual(expect.arrayContaining(['Name', 'Hex', 'Dec', 'Bin']));
      expect(await shown(page, '.theader > span')).toEqual(expect.arrayContaining(['Address', 'Encoding', 'Instruction']));
      // $t6 = 0x80000001: its binary whole, eight groups of four.
      await expect(page.locator('.rrow[data-reg="$t6"] .bin span')).toHaveCount(8);
      expect(await whole(page, '.rrow[data-reg="$t6"] .bin')).toBe(true);
      expect(await whole(page, '.rrow[data-reg="$t6"] .dec')).toBe(true);

      for (const name of ['Assemble', 'Run', 'Step', 'Reset']) {
        await expect(page.locator('.toolbar .btn .label', { hasText: new RegExp(`^${name}$`) })).toBeVisible();
      }
      expect(await shown(page, '.speedlabel, .speedone .label')).toEqual([expect.stringMatching(/^(Run speed|Speed: Instant)$/)]);
      expect(await page.locator('.titlebar').evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
      // Panel heads hold their names and switches ("+ Source" and all).
      for (const head of ['.regs .phead', '.textpanel .phead', '.insp .phead', '.console .phead']) {
        expect(await page.locator(head).evaluate((e) => e.scrollWidth <= e.clientWidth), head).toBe(true);
      }
      // A note in a head is whole or not there (never "30 instr…").
      expect(await page.locator('.phead .pmeta').evaluateAll((els) =>
        els.filter((e) => e.checkVisibility() && e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent))).toEqual([]);

      // The Inspector: no sideways scroll, its head not cut short.
      expect(await whole(page, '.insp .ibody')).toBe(true);
      expect(await whole(page, '.ihead .isrc')).toBe(true);
      expect(await whole(page, '.ihead .where')).toBe(true);
      // Data: the four words, and no sideways scroll where they fit.
      await page.locator('.ptab', { hasText: 'Data' }).click();
      await page.waitForSelector('.drow');
      expect(await shown(page, '.dhead > span')).toEqual(expect.arrayContaining(['Address', '+0', '+4', '+8', '+C']));
      // (At 1024 the four words need ~25 px more than the tab has, even
      // tight and a pixel smaller: there Data scrolls sideways.)
      if (size.width !== 1024) expect(await whole(page, '.data')).toBe(true);
      await page.locator('.ptab', { hasText: 'Text' }).click();

      expect(await brokenWords(page)).toEqual([]);
      await page.getByTitle('New file').click();
      await page.waitForSelector('dialog.ask');
      expect(await brokenWords(page)).toEqual([]);
      await page.keyboard.press('Escape');
      await openAndAssemble(r, sample(r.dir, 'tests/samples/lab04.s'));
      await expect(page.locator('.run-side .errors')).toBeVisible();
      expect(await brokenWords(page)).toEqual([]);
    } finally {
      await r.close();
    }
  });
}

test.describe(() => {
  let r: Running;
  test.beforeEach(async () => { r = await launch(); });
  test.afterEach(async () => { await r.close(); });

  test('the first screen has no toolbar; a file brings it', async () => {
    const { page } = r;
    await expect(page.locator('.toolbar')).toBeHidden();
    await page.getByRole('button', { name: /바로 시작/ }).click();
    await page.getByRole('button', { name: /새 파일/ }).first().click();
    await expect(page.locator('.toolbar')).toBeVisible();
  });

  test('a column the width takes away comes back from the head, and goes again', async () => {
    const { page } = r;
    await lab04(r, 2);
    await resize(r, { width: 1024, height: 728 });
    const source = page.locator('.theader .src');
    await expect(source).toBeHidden();
    await page.locator('.textpanel .paside .hbtn', { hasText: '+ Source' }).click();
    await expect(source).toBeVisible();
    await expect(page.locator('.trow .src').first()).toBeVisible();
    await expect(page.locator('.textpanel')).toHaveClass(/overflow/);
    await page.locator('.text').evaluate((e) => { e.scrollLeft = 40; });
    await expect.poll(() => page.locator('.theader').evaluate((e) => e.scrollLeft)).toBe(40); // the head goes along
    await page.locator('.textpanel .paside .hbtn', { hasText: /^Source$/ }).click();
    await expect(source).toBeHidden();
    // Data gives up ASCII, and has it back from the same place.
    await page.locator('.ptab', { hasText: 'Data' }).click();
    await page.waitForSelector('.drow');
    await expect(page.locator('.dhead .ascii')).toBeHidden();
    await page.locator('.textpanel .paside .hbtn', { hasText: '+ ASCII' }).click();
    await expect(page.locator('.dhead .ascii')).toBeVisible();
    await page.locator('.ptab', { hasText: 'Text' }).click();
    await expect(page.locator('.textpanel .paside .hbtn', { hasText: 'ASCII' })).toHaveCount(0);

    // Registers squeezed by the splitter: Dec gives way before Bin.
    const bar = await page.locator('.splitter .grip').boundingBox();
    await page.mouse.move(bar!.x + 1, bar!.y + 5);
    await page.mouse.down();
    await page.mouse.move(1024 - 300, bar!.y + 5, { steps: 5 });
    await page.mouse.up();
    await expect(page.locator('.rhead .bin')).toBeVisible();
    await expect(page.locator('.rhead .dec')).toBeHidden();
    await page.locator('.regs .paside .hbtn', { hasText: '+ Dec' }).click();
    await expect(page.locator('.rhead .dec')).toBeVisible();
    await expect(page.locator('.rrow[data-reg="$t0"] .dec')).toBeVisible();
  });

  test('a file\'s name stands on a line of its own in a question', async () => {
    const { page } = r;
    await lab04(r, 0);
    await page.getByTitle('New file').click();
    const dialog = page.locator('dialog.ask');
    await expect(dialog.locator('.askfile')).toHaveText('File: lab04.s');
    await expect(dialog.locator('p:not(.askfile)')).not.toContainText('lab04.s');
    await page.keyboard.press('Escape');
  });

  test('the Editor: no band for the cursor; while running, the line of PC alone', async () => {
    const { page } = r;
    await lab04(r);
    await page.locator('.cm-line', { hasText: 'syscall' }).first().click();
    await expect(page.locator('.cm-activeLine')).toHaveCount(0);
    await expect(page.locator('.cm-pc-line')).toHaveCount(1);
  });

  test('assembly errors: on the Run side, Haram once and no arrow; a narrow window shows them on the Run tab', async () => {
    const { page } = r;
    await openAndAssemble(r, sample(r.dir, 'tests/samples/lab04.s'));
    await expect(page.locator('.run-side .errors')).toBeVisible();
    await expect(page.locator('.editor-panel .errors')).toHaveCount(0);
    await expect(page.locator('.run-placeholder')).toBeHidden();
    expect(await page.locator('img.char').evaluateAll((els) => els.filter((e) => e.checkVisibility()).length)).toBe(1);

    await resize(r, { width: 910, height: 505 });
    await page.locator('.viewswitch button', { hasText: 'Editor' }).click();
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+s');
    await expect(page.locator('.run-side .errors')).toBeVisible();
    await expect(page.locator('.editor-panel')).toBeHidden();
    await page.getByRole('button', { name: '15행으로 가기' }).click();
    await expect(page.locator('.editor-panel')).toBeVisible();
    expect(await page.evaluate(() => document.getSelection()?.anchorNode?.parentElement?.closest('.cm-line')?.textContent?.trim()))
      .toBe('srll $s0, $t6, 1');
  });

  test('after a step the Registers show the register it changed, unless the student is scrolling them', async () => {
    const { page } = r;
    await resize(r, { width: 1093, height: 582 });
    await lab04(r);
    const inView = (key: string) => page.evaluate((k) => {
      const list = document.querySelector('.regs-list')!;
      const a = list.getBoundingClientRect();
      const b = list.querySelector(`.rrow[data-reg="${k}"]`)!.getBoundingClientRect();
      const head = list.querySelector('.rhead')!.getBoundingClientRect().height;
      return b.top >= a.top + head - 1 && b.bottom <= a.bottom + 1;
    }, key);
    expect(await inView('$t6')).toBe(true);
    // The student scrolls back to the top: the next step leaves it there.
    await page.locator('.regs-list').hover();
    await page.mouse.wheel(0, -3000);
    await expect.poll(() => page.locator('.regs-list').evaluate((e) => e.scrollTop)).toBe(0);
    await page.keyboard.press('F10');
    await settled(page);
    await expect(page.locator('.rrow[data-reg="$t7"]')).toHaveClass(/chg/); // sll $t7, $t6, 1
    expect(await page.locator('.regs-list').evaluate((e) => e.scrollTop)).toBe(0);
    // Two seconds later it follows again.
    await page.mouse.move(-5, -5);
    await page.waitForTimeout(2100);
    await page.keyboard.press('F10');
    await settled(page);
    await expect(page.locator('.rrow[data-reg="$s0"]')).toHaveClass(/chg/); // srl $s0, $t6, 1
    expect(await inView('$s0')).toBe(true);
  });
});
