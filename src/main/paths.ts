/* Where the app's own files are.  Run from the source tree (npm run
   electron, the e2e tests) they are where the repository keeps them; in the
   packaged app, tools/package.ts bundles the main process into one file
   (defining SPIM_BUNDLE) and puts everything else next to it:

     main.js  worker.js  preload.cjs  spim.node  exceptions.s
     renderer/app/{index.html, app.css, app.js}   renderer/assets/
     examples/   licenses/                         (resources/app.asar)
     LICENSE  NOTICE  LICENSE.electron.txt  LICENSES.chromium.html   (next to HallymMIPS.exe) */

import { readFileSync } from 'node:fs';
import path from 'node:path';

const bundled = process.env.SPIM_BUNDLE === '1';
const here = import.meta.dirname;
const root = path.join(here, '..', '..');
const electronDist = () => path.dirname(process.execPath); // the Electron binary's folder, in both cases

export const paths = {
  page: bundled ? path.join(here, 'renderer/app/index.html') : path.join(root, 'src/renderer/app/index.html'),
  preload: path.join(here, 'preload.cjs'),
  examples: bundled ? path.join(here, 'examples') : path.join(root, 'src/examples'),
  // A license file by its name in licenses/ (the packaged name; see LICENSES).
  license: (name: string) => (bundled ? path.join(here, 'licenses', name) : path.join(root, LICENSE_SOURCES[name])),
  electronLicense: () => path.join(electronDist(), bundled ? 'LICENSE.electron.txt' : 'LICENSE'),
  chromiumCredits: () => path.join(electronDist(), 'LICENSES.chromium.html'),
};

export const version: string = bundled
  ? (process.env.SPIM_VERSION as string)
  : JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;

/* The notices About shows, in order: title, and the file in the source tree.
   tools/package.ts copies each into licenses/ under the same key, and puts
   LICENSE and NOTICE next to the executable as well (BSD: the notice goes
   with the binary). */
export const LICENSES: { name: string; title: string }[] = [
  { name: 'LICENSE', title: 'SPIM — BSD License (James R. Larus)' },
  { name: 'NOTICE', title: 'NOTICE — what this program contains, and their licenses' },
  { name: 'hallym-assets.md', title: 'Hallym University assets (marks, characters, app icon)' },
  { name: 'OFL-Pretendard.txt', title: 'Pretendard — SIL Open Font License 1.1' },
  { name: 'OFL-D2Coding.txt', title: 'D2Coding — SIL Open Font License 1.1' },
  { name: 'lucide-LICENSE.txt', title: 'Lucide icons — ISC License' },
  { name: 'flex-LICENSE.txt', title: 'flex — made the core\'s scanner (an acknowledgement; no notice required)' },
  { name: 'third-party.txt', title: 'Bundled libraries (CodeMirror, iconv-lite, node-addon-api …)' },
];

export const LICENSE_SOURCES: Record<string, string> = {
  'LICENSE': 'LICENSE',
  'NOTICE': 'NOTICE',
  'hallym-assets.md': 'src/renderer/assets/hallym/README.md',
  'OFL-Pretendard.txt': 'src/renderer/assets/fonts/OFL-Pretendard.txt',
  'OFL-D2Coding.txt': 'src/renderer/assets/fonts/OFL-D2Coding.txt',
  'lucide-LICENSE.txt': 'src/renderer/assets/icons/lucide/LICENSE.txt',
  'flex-LICENSE.txt': 'native/LICENSE.flex.txt',
  'third-party.txt': 'build/licenses/third-party.txt', // tools/build-ui.ts writes it
};
