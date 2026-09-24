import { launch, openAndAssemble, program, sample, settled } from '../tests/e2e/harness.ts';
const [w, hgt, tag] = [Number(process.argv[2] ?? 1280), Number(process.argv[3] ?? 800), process.argv[4] ?? 'x'];
const r = await launch({ width: w, height: hgt });
const { page } = r;
page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
await openAndAssemble(r, sample(r.dir, 'tests/samples/lab04-ok.s', 'lab04.s'));
for (let i = 0; i < 16; i += 1) { await page.keyboard.press('F10'); await settled(page); }
await page.waitForTimeout(1000);
await page.screenshot({ path: '/tmp/claude-1000/-home-khh-workspace-hallym-mips-simulator-electron/bdfab4fd-0dc7-4e59-a54f-a51229f39055/scratchpad/look-' + tag + '-c.png' });
await page.locator('.ptab', { hasText: 'Data' }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/claude-1000/-home-khh-workspace-hallym-mips-simulator-electron/bdfab4fd-0dc7-4e59-a54f-a51229f39055/scratchpad/look-' + tag + '-d.png' });
await r.close();
