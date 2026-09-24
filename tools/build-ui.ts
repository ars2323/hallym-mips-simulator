/* Bundles the window's script: src/renderer/app/app.ts and what it imports
   (CodeMirror, src/core) into build/renderer/app.js, which
   src/renderer/app/index.html loads.

     node tools/build-ui.ts [--watch]
*/

import * as esbuild from 'esbuild';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const options: esbuild.BuildOptions = {
  entryPoints: [path.join(root, 'src/renderer/app/app.ts')],
  outfile: path.join(root, 'build/renderer/app.js'),
  bundle: true,
  format: 'iife',
  target: 'chrome140',
  sourcemap: true,
  logLevel: 'info',
};
if (process.argv.includes('--watch')) await (await esbuild.context(options)).watch();
else await esbuild.build(options);
