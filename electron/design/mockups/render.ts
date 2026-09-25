/* Renders every mockup to PNG with Electron (the app's own engine).

     npm run mockups          (data from the simulator, then this)

   docs/mockups/<scene>-<direction>-<width>x<height>.png for scenes A-D,
   directions 1-2 and three window sizes, and docs/mockups/sheet.png, the
   comparison of all of them. */

import { app, BrowserWindow } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const here = import.meta.dirname;
const out = path.resolve(process.argv[process.argv.length - 1]);
const SIZES: [number, number][] = [[1920, 1080], [1280, 800], [960, 1080]];

let win: BrowserWindow;

async function capture(file: string, query: Record<string, string>, width: number, height: number, target: string) {
  win.setContentSize(width, height);
  for (let attempt = 1; ; attempt += 1) {
    try {
      await win.loadFile(path.join(here, file), { query });
      break;
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 150)))');
  if (file === 'sheet.html') {
    const w = await win.webContents.executeJavaScript("document.querySelector('table').getBoundingClientRect().right + 32");
    const h = await win.webContents.executeJavaScript('document.body.scrollHeight');
    win.setContentSize(Math.ceil(w), Math.ceil(h));
    await new Promise((r) => setTimeout(r, 400));
  }
  const [cw, ch] = win.getContentSize();
  if (file !== 'sheet.html' && (cw !== width || ch !== height)) throw new Error(`window is ${cw}x${ch}, not ${width}x${height}`);
  const image = await win.webContents.capturePage();
  writeFileSync(target, image.toPNG());
  console.log(`wrote ${path.relative(process.cwd(), target)} (${image.getSize().width}x${image.getSize().height})`);
}

app.whenReady().then(async () => {
  mkdirSync(out, { recursive: true });
  win = new BrowserWindow({ show: false, width: 1920, height: 1080, useContentSize: true, enableLargerThanScreen: true,
                            webPreferences: { sandbox: true } });
  for (const dir of ['1', '2']) {
    for (const scene of ['A', 'B', 'C', 'D']) {
      for (const [w, h] of SIZES) await capture('index.html', { dir, scene }, w, h, path.join(out, `${scene}-${dir}-${w}x${h}.png`));
    }
  }
  await capture('sheet.html', {}, 3200, 1200, path.join(out, 'sheet.png'));
  app.exit(0);
}).catch((e) => { console.error(e); app.exit(1); });
