/* Export executable image (.hmx): the icon in the title bar's right group,
   there once a file is open and usable once it has assembled; the save
   dialog offers <name>.hmx next to the source; the file is the golden image
   of the same program (tests/hmx/, all but the time and the version) and
   carries the Text panel's addresses and words; after the Editor changes it
   is still the last assembled program, with that program's hash. */

import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { readHmx } from '../helpers/hmx-read.ts';
import { launch, openOnly, program, root, sample, side, type Running } from './harness.ts';

const TITLE = 'Export executable image (.hmx)';
const comparable = (hmx: string) => hmx.split('\n').filter((l) => !l.startsWith('assembled '))
  .map((l) => l.replace(/^(produced-by +Hallym MIPS) \d+\.\d+\.\d+$/, '$1 x.y.z'));

// The next save dialogs answer `file`; what they were asked is kept.
async function catchSave(r: Running, file: string): Promise<void> {
  await r.app.evaluate(({ dialog }, f) => {
    const g = globalThis as unknown as { saveAsked: unknown[] };
    g.saveAsked = [];
    dialog.showSaveDialog = (async (_w: unknown, o: unknown) => { g.saveAsked.push(o); return { canceled: false, filePath: f }; }) as typeof dialog.showSaveDialog;
  }, file);
}
const saveAsked = (r: Running) => r.app.evaluate(() => (globalThis as unknown as { saveAsked: { defaultPath: string; filters: { extensions: string[] }[] }[] }).saveAsked);

// Every row the Text panel draws, scrolled through: address -> word, as shown.
async function textPanel(page: Page): Promise<Map<string, string>> {
  await side(page, 'Run');
  const seen = new Map<string, string>();
  const list = page.locator('.text');
  await list.evaluate((el) => { el.scrollTop = 0; });
  for (let i = 0; i < 400; i++) {
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    for (const [a, w] of await page.locator('.trow').evaluateAll((rows) => rows.map((x) => [x.querySelector('.addr')!.textContent!, x.querySelector('.word')!.textContent!])))
      seen.set(a, w);
    if (await list.evaluate((el) => { const was = el.scrollTop; el.scrollTop += el.clientHeight / 2; return el.scrollTop === was; })) break;
  }
  return seen;
}

test('in the right icon group, usable once assembled; the file is the golden image, with the Text panel\'s words', async () => {
  const r = await launch();
  const { page } = r;
  try {
    const button = page.getByTitle(TITLE);
    await expect(button).toBeHidden(); // the first screen: nothing to export
    expect(await page.locator('.titlebar .tools').getByTitle(TITLE).count()).toBe(1);
    const file = sample(r.dir, 'tests/hmx/data.s');
    await openOnly(r, file);
    await expect(button).toBeVisible();
    await expect(button).toBeDisabled(); // not assembled yet
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+s');
    await expect(button).toBeEnabled();
    const out = path.join(r.dir, 'chosen.hmx');
    await catchSave(r, out);
    await button.click();
    await expect(page.locator('.status')).toContainText('실행 이미지로 저장했습니다 — chosen.hmx');
    await expect(page.locator('.status')).not.toContainText('마지막으로 어셈블한');
    // The dialog: data.hmx next to data.s, as an .hmx.
    const [asked] = await saveAsked(r);
    expect(asked.defaultPath).toBe(path.join(r.dir, 'data.hmx'));
    expect(asked.filters[0].extensions).toEqual(['hmx']);

    const written = readFileSync(out, 'utf8');
    expect(comparable(written)).toEqual(comparable(readFileSync(path.join(root, 'tests/hmx/data.hmx'), 'utf8')));
    const image = readHmx(written);
    expect(image.fields.get('source-sha256')).toBe(createHash('sha256').update(readFileSync(file)).digest('hex'));
    expect(image.entry).toBe(0x00400024); // main, after the nine words of the start-up code

    // The Text panel: the same addresses, the same words, no more user words.
    const shown = await textPanel(page);
    image.text.words.forEach((w, i) => {
      const addr = (image.text.addr + 4 * i).toString(16).padStart(8, '0');
      expect(shown.get(addr), addr).toBe(w.toString(16).padStart(8, '0'));
    });
    expect([...shown.keys()].filter((a) => parseInt(a, 16) < 0x80000000).length).toBe(image.text.words.length);
  } finally {
    await r.close();
  }
});

test('after the Editor changes: the last assembled program, and its source\'s hash, not the Editor\'s', async () => {
  const r = await launch();
  const { page } = r;
  try {
    const file = sample(r.dir, 'tests/hmx/data.s');
    await openOnly(r, file);
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+s');
    await expect(page.getByTitle(TITLE)).toBeEnabled();
    const before = await textPanel(page);
    await side(page, 'Editor');
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.insertText('\n        addi  $t0, $t0, 1\n');
    const out = path.join(r.dir, 'changed.hmx');
    await catchSave(r, out);
    await page.getByTitle(TITLE).click();
    await expect(page.locator('.status')).toContainText('마지막으로 어셈블한 코드를 실행 이미지로 저장했습니다 — changed.hmx');
    const image = readHmx(readFileSync(out, 'utf8'));
    expect(image.fields.get('source-sha256')).toBe(createHash('sha256').update(readFileSync(file)).digest('hex'));
    expect(comparable(readFileSync(out, 'utf8'))).toEqual(comparable(readFileSync(path.join(root, 'tests/hmx/data.hmx'), 'utf8')));
    expect(await textPanel(page)).toEqual(before);
  } finally {
    await r.close();
  }
});

test('a program without main: no file, and the status bar says why', async () => {
  const r = await launch();
  const { page } = r;
  try {
    await openOnly(r, program(r.dir, 'nomain.s', 'start:  li $v0, 10\n        syscall\n'));
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+s');
    await expect(page.getByTitle(TITLE)).toBeEnabled();
    const out = path.join(r.dir, 'nomain.hmx');
    await catchSave(r, out);
    await page.getByTitle(TITLE).click();
    await expect(page.locator('.status')).toContainText('main 레이블이 없어 실행 이미지를 만들 수 없습니다');
    expect(await saveAsked(r)).toEqual([]);
    expect(existsSync(out)).toBe(false);
  } finally {
    await r.close();
  }
});
