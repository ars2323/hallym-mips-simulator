/* Bundles the window's script: src/renderer/app/app.ts and what it imports
   (CodeMirror, src/core) into build/renderer/app.js, which
   src/renderer/app/index.html loads.  Also writes
   build/licenses/third-party.txt: the licenses of every npm package the
   app bundles -- the window's, and the main process's and the simulator
   process's (analysed here, bundled only by tools/package.ts).

     node tools/build-ui.ts [--watch]
*/

import * as esbuild from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { thirdPartyText } from './licenses.ts';

const root = path.join(import.meta.dirname, '..');
export const rendererOptions: esbuild.BuildOptions = {
  entryPoints: [path.join(root, 'src/renderer/app/app.ts')],
  outfile: path.join(root, 'build/renderer/app.js'),
  bundle: true,
  format: 'iife',
  target: 'chrome140',
  sourcemap: true,
  metafile: true,
  logLevel: 'info',
};
export const nodeOptions = (entry: string, outfile: string): esbuild.BuildOptions => ({
  entryPoints: [path.join(root, entry)],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  external: ['electron'],
  metafile: true,
  // CommonJS packages (iconv-lite) call require(); give the ESM bundle one.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});

export async function writeThirdParty(metafiles: esbuild.Metafile[]): Promise<void> {
  const out = path.join(root, 'build/licenses/third-party.txt');
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, thirdPartyText(metafiles));
}

if (import.meta.main) {
  if (process.argv.includes('--watch')) {
    await (await esbuild.context(rendererOptions)).watch();
  } else {
    const ui = await esbuild.build(rendererOptions);
    const main = await esbuild.build({ ...nodeOptions('src/main/main.ts', 'main.js'), write: false, logLevel: 'silent' });
    const worker = await esbuild.build({ ...nodeOptions('src/sim/worker.ts', 'worker.js'), write: false, logLevel: 'silent' });
    await writeThirdParty([ui.metafile!, main.metafile!, worker.metafile!]);
  }
}
