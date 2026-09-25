/* The tutorial (src/renderer/app/tutorial.ts, docs/PORTING.md 18):
   - all twenty steps, walked with the real actions, at 1093x582 (a lab PC),
     1024x728 and 910x505 (the narrow window): at every step what it points
     at is on screen, and the card covers none of it (a click at a target's
     middle reaches the target, not the tutorial);
   - the same walk with [건너뛰기] at every practice step;
   - stopping at step 16 while the slow run goes;
   - the examples on disk unchanged; a student's unsaved file back as it
     was; a new start of the program begins at step 1 again. */

import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { launch, openAndAssemble, resize, root, sample, type Running } from './harness.ts';

interface Shown { step: number; phase: number; hits: boolean[]; did: string[]; targets: { left: number; top: number; right: number; bottom: number }[]; card: { left: number; top: number; right: number; bottom: number } | null }
const shown = (page: Page) => page.evaluate(() => (window as unknown as { __tutorial: { shown: Shown; active: boolean } }).__tutorial.shown);
const active = (page: Page) => page.evaluate(() => (window as unknown as { __tutorial: { active: boolean } }).__tutorial.active);
const hash = (name: string) => createHash('sha256').update(readFileSync(path.join(root, 'src/examples', name))).digest('hex');

async function atStep(page: Page, n: number, phase = 0): Promise<Shown> {
  await expect.poll(async () => { const s = await shown(page); return `${s.step}.${s.phase}`; }, { timeout: 15_000 }).toBe(`${n}.${phase}`);
  // Laid out for this step, and settled (the Data tab and lists redraw).
  let last = '';
  for (let i = 0; i < 40; i += 1) {
    await page.waitForTimeout(100);
    const s = JSON.stringify(await shown(page));
    if (s === last && (n === 20 || JSON.parse(s).targets.length > 0)) break;
    last = s;
  }
  return shown(page);
}

// What the step points at is on screen and the card is clear of it; the
// middle of each target is the app's (not the dim layer's, not the card's).
async function checkStep(page: Page, n: number, phase = 0): Promise<void> {
  const s = await atStep(page, n, phase);
  const where = `step ${n}.${phase}`;
  if (n < 20) expect(s.targets.length, where).toBeGreaterThan(0);
  // A click in the middle of each target reaches that very target.
  expect(s.hits, `${where}: ${JSON.stringify(s.targets)}`).toEqual(s.targets.map(() => true));
  const w = await page.evaluate(() => [window.innerWidth, window.innerHeight]);
  if (s.did.length) console.log(`[${w[0]}] step ${n}${phase ? `.${phase}` : ''}: ${s.did.join(', ')}`);
  for (const t of s.targets) {
    expect(t.left >= 0 && t.top >= 0 && t.right <= w[0] && t.bottom <= w[1], `${where}: target on screen ${JSON.stringify(t)}`).toBe(true);
    const c = s.card!;
    const apart = c.right <= t.left || t.right <= c.left || c.bottom <= t.top || t.bottom <= c.top;
    expect(apart, `${where}: the card over a target ${JSON.stringify({ t, c })}`).toBe(true);
    const hit = await page.evaluate(([x, y]) => {
      const e = document.elementFromPoint(x, y);
      return e ? (e.closest('.tut') ? 'tutorial' : 'app') : 'nothing';
    }, [(t.left + t.right) / 2, (t.top + t.bottom) / 2]);
    expect(hit, `${where}: middle of ${JSON.stringify(t)}`).toBe('app');
  }
  const c = s.card!;
  expect(c.left >= 0 && c.top >= 0 && c.right <= w[0] && c.bottom <= w[1], `${where}: card on screen`).toBe(true);
  // One Haram on screen, on the card, at its end away from what it points at.
  const haram = await page.evaluate(() => {
    const seen = [...document.querySelectorAll('img.char')].filter((e) => e.checkVisibility({ visibilityProperty: true }));
    const say = document.querySelector('.tut-card .tut-say')!.getBoundingClientRect();
    const img = document.querySelector('.tut-card img.char')!.getBoundingClientRect();
    return { count: seen.length, onCard: seen[0]?.closest('.tut-card') !== null, say: (say.left + say.right) / 2, img: (img.left + img.right) / 2 };
  });
  expect(haram.count, `${where}: Haram once`).toBe(1);
  expect(haram.onCard, where).toBe(true);
  if (s.targets.length) {
    const tx = (s.targets[0].left + s.targets[0].right) / 2;
    expect(Math.abs(haram.img - tx) >= Math.abs(haram.say - tx), `${where}: Haram at the far end`).toBe(true);
  }
}

const next = (page: Page) => page.locator('.tut-card .tut-next').click();
const skip = async (page: Page) => { await page.locator('.tut-card .tut-skip').click({ timeout: 10_000 }); };
const middle = (r: { left: number; top: number; right: number; bottom: number }) => [(r.left + r.right) / 2, (r.top + r.bottom) / 2] as const;

// Walks steps 1..20: by doing each practice step, or by skipping it.
async function walk(page: Page, how: 'do' | 'skip'): Promise<void> {
  const practice = async (n: number, act: () => Promise<void>, phase = 0) => {
    await checkStep(page, n, phase);
    if (how === 'skip') await skip(page); else await act();
  };
  await checkStep(page, 1); await next(page);
  await practice(2, () => page.keyboard.press('Control+s'));
  await checkStep(page, 3); await next(page);
  await checkStep(page, 4); await next(page);
  await practice(5, () => page.keyboard.press('F10'));
  for (const n of [6, 7, 8, 9]) { await checkStep(page, n); await next(page); }
  await practice(10, () => page.locator('.textpanel .ptab', { hasText: 'Data' }).click());
  await checkStep(page, 11); await next(page);
  await practice(12, async () => {
    for (let i = 0; i < 20 && (await shown(page)).step === 12; i += 1) { await page.keyboard.press('F10'); await page.waitForTimeout(150); }
  });
  await checkStep(page, 13); await next(page);
  await practice(14, async () => { const [x, y] = middle((await shown(page)).targets[1]); await page.mouse.click(x, y); }); // the gutter cell
  await practice(15, () => page.keyboard.press('F5'));
  await practice(16, async () => {
    const radio = page.getByRole('radio', { name: '1 line/s' });
    if (await radio.isVisible()) await radio.click(); else await page.locator('.speedone').click();
    await page.keyboard.press('F5');
    await expect(page.locator('.status')).toContainText('천천히 실행 중');
    await page.waitForTimeout(1500);
    await page.keyboard.press('Escape');
  });
  await practice(17, () => page.locator('[data-tut="reset"]').click());
  await practice(18, async () => {
    for (let i = 0; i < 3 && (await shown(page)).step === 18; i += 1) { await page.keyboard.press('F5'); await page.waitForTimeout(600); }
  });
  await practice(19, () => page.keyboard.press('Control+s'));
  await practice(19, () => page.locator('.run-side .errors').getByRole('button', { name: /행으로 가기/ }).click(), 1);
  await checkStep(page, 20);
  await page.locator('.tut-card .tut-finish').click();
  await expect.poll(() => active(page)).toBe(false);
}

const SIZES = [
  { name: '1280x800', width: 1280, height: 800 },
  { name: 'a lab PC (1093x582)', width: 1093, height: 582 },
  { name: '1024x728', width: 1024, height: 728 },
  { name: 'the narrow window (910x505)', width: 910, height: 505 },
];

for (const size of SIZES) {
  test(`${size.name}: twenty steps, done for real; every target on screen, none under the card`, async () => {
    test.setTimeout(180_000);
    const before = [hash('tutorial.s'), hash('tutorial-error.s')];
    const r = await launch(size);
    try {
      await r.page.getByRole('button', { name: /튜토리얼 보기/ }).click();
      await walk(r.page, 'do');
      // Back where it started: the first screen, nothing open.
      await expect(r.page.locator('.wcard')).toBeVisible();
      await expect(r.page.locator('.tut')).toHaveCount(0);
      expect([hash('tutorial.s'), hash('tutorial-error.s')]).toEqual(before);
    } finally {
      await r.close();
    }
  });
}

test.describe(() => {
  let r: Running;
  test.beforeEach(async () => { r = await launch({ width: 1093, height: 582 }); });
  test.afterEach(async () => { await r.close(); });

  test('every practice step can be skipped, and the steps after it still have what they point at', async () => {
    test.setTimeout(180_000);
    await r.page.getByRole('button', { name: /튜토리얼 보기/ }).click();
    await walk(r.page, 'skip');
  });

  test('step 16: stopping the tutorial while the slow run goes', async () => {
    test.setTimeout(120_000);
    const { page } = r;
    await page.getByRole('button', { name: /튜토리얼 보기/ }).click();
    await page.evaluate(() => (window as unknown as { __tutorial: { go(i: number): Promise<void> } }).__tutorial.go(15));
    await checkStep(page, 16);
    await page.getByRole('radio', { name: '1 line/s' }).click();
    await page.keyboard.press('F5');
    await expect(page.locator('.status')).toContainText('천천히 실행 중');
    await page.locator('.tut-card .tut-quit').click();
    await page.locator('dialog.ask').getByRole('button', { name: '그만두기' }).click();
    await expect.poll(() => active(page)).toBe(false);
    await expect(page.locator('.status')).not.toContainText('실행 중');
    await expect(page.locator('.wcard')).toBeVisible();
    // Within this run: asked whether to go on from step 16.
    await page.getByRole('button', { name: /튜토리얼 보기/ }).click();
    await expect(page.locator('dialog.ask')).toContainText('16단계');
    await page.locator('dialog.ask').getByRole('button', { name: /이어서/ }).click();
    await atStep(page, 16);
  });

  test('a column the width took away is turned on for the step that points at it, and let go at the end', async () => {
    const { page } = r;
    await resize(r, { width: 1024, height: 728 });
    for (let i = 0; i < 4; i += 1) await page.keyboard.press('Control+='); // a big font: Text gives up Encoding
    await page.getByRole('button', { name: /튜토리얼 보기/ }).click();
    await page.evaluate(() => (window as unknown as { __tutorial: { go(i: number): Promise<void> } }).__tutorial.go(8));
    await checkStep(page, 9);
    expect((await shown(page)).did).toContain('column word on');
    await expect(page.locator('.theader .word')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.locator('dialog.ask').getByRole('button', { name: '그만두기' }).click();
    await expect.poll(() => active(page)).toBe(false);
    // Let go: the next program's Text is as the width makes it.
    await openAndAssemble(r, sample(r.dir, 'tests/samples/lab04-ok.s'));
    await expect(page.locator('.theader .word')).toBeHidden();
    await expect(page.locator('.textpanel .paside')).toContainText('+ Encoding');
  });

  test('keys a step does not ask for do nothing; Esc asks before stopping; → and ← step through', async () => {
    const { page } = r;
    await page.getByRole('button', { name: /튜토리얼 보기/ }).click();
    await atStep(page, 1);
    await page.keyboard.press('F5'); // not asked for: nothing assembles, nothing runs
    await page.keyboard.press('F10');
    await page.waitForTimeout(300);
    await expect(page.locator('.run-placeholder')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await atStep(page, 2);
    await page.keyboard.press('ArrowRight'); // a practice step: → waits for the student
    await page.waitForTimeout(300);
    expect((await shown(page)).step).toBe(2);
    await page.keyboard.press('ArrowLeft');
    await atStep(page, 1);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.ask')).toContainText('튜토리얼을 그만둘까요?');
    await page.locator('dialog.ask').getByRole('button', { name: '계속하기' }).click();
    expect(await active(page)).toBe(true);
    // The example is read-only.
    const text = await page.locator('.cm-content').innerText();
    const [x, y] = middle((await shown(page)).targets[0]);
    await page.mouse.click(x, y + 20); // in the lines step 1 points at
    await page.keyboard.type('xyz');
    expect(await page.locator('.cm-content').innerText()).toBe(text);
    await expect(page.locator('.titlebar .dirty')).toHaveCount(0);
  });

  test('a student\'s file with unsaved changes: asked first, and back as it was after the tutorial', async () => {
    const { page } = r;
    await page.getByRole('button', { name: /바로 시작/ }).click();
    await page.getByRole('button', { name: /새 파일/ }).first().click();
    await page.locator('.cm-content').click();
    await page.keyboard.insertText('main:\n    li $t0, 1\n');
    await page.getByTitle('Tutorial').click();
    const ask = page.locator('dialog.ask');
    await expect(ask).toContainText('저장하지 않은 변경이 있습니다');
    await ask.getByRole('button', { name: '튜토리얼 시작' }).click();
    await atStep(page, 1);
    await expect(page.locator('.titlebar .file')).toContainText('tutorial.s');
    await page.keyboard.press('Escape');
    await page.locator('dialog.ask').getByRole('button', { name: '그만두기' }).click();
    await expect.poll(() => active(page)).toBe(false);
    await expect(page.locator('.titlebar .file')).toContainText('untitled.s');
    await expect(page.locator('.titlebar .dirty')).toHaveCount(1);
    expect(await page.locator('.cm-content').innerText()).toContain('li $t0, 1');
  });
});

test('a new start of the program: step 1, not asked to go on', async () => {
  const userData = path.join((await import('node:os')).tmpdir(), `spim-tut-${process.pid}`);
  const first = await launch({ width: 1093, height: 582 }, { userData });
  await first.page.getByRole('button', { name: /튜토리얼 보기/ }).click();
  await atStep(first.page, 1);
  await first.page.keyboard.press('ArrowRight');
  await atStep(first.page, 2);
  await first.close();
  const again = await launch({ width: 1093, height: 582 }, { userData });
  try {
    await again.page.getByRole('button', { name: /튜토리얼 보기/ }).click();
    await expect(again.page.locator('dialog.ask')).toHaveCount(0);
    await atStep(again.page, 1);
  } finally {
    await again.close();
  }
});
