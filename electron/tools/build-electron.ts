/* Builds the addon against Electron's headers, as Electron's docs describe
   for a native module built by hand (node-gyp with --target and
   --dist-url).  @electron/rebuild does the same for modules under
   node_modules; the addon here is not one.

     node tools/build-electron.ts

   The result goes to native/build/Release/spim.node, where `npm run build`
   puts the Node build.  Either one loads in both: the addon uses N-API
   only, whose ABI does not change with Node's (docs/ARCHITECTURE.md 4).
*/

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const electron = JSON.parse(readFileSync(path.join(root, 'node_modules/electron/package.json'), 'utf8')).version;
const nodeGyp = path.join(root, 'node_modules/.bin', process.platform === 'win32' ? 'node-gyp.cmd' : 'node-gyp');
console.log(`building native/ for Electron ${electron}`);
execFileSync(nodeGyp, ['rebuild', '--directory', path.join(root, 'native'),
                       `--target=${electron}`, `--arch=${process.arch}`, '--dist-url=https://electronjs.org/headers'],
             { stdio: 'inherit', shell: process.platform === 'win32' });
