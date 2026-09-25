/* Packages the app with electron-builder.

     node tools/package.ts            Windows: NSIS installer + zip (on Windows)
     node tools/package.ts --dir      this platform, unpacked only (a check)

   1. Stages build/package/app/: the main process and the simulator process
      bundled by esbuild (SPIM_BUNDLE defined: src/main/paths.ts,
      src/sim/transport.ts and native/index.ts then look next to the
      bundle), the window, the addon, the default exception handler, the
      example, and the notices.  No node_modules: everything is bundled.
   2. Runs electron-builder on it.

   The addon must already be built for Electron (npm run build:electron).

   The program is called Hallym MIPS everywhere: window, About, Start menu,
   install folder, uninstall entry.

   Next to the Qt build (Hallym MIPS Simulator 1.x, an MSI installed per
   machine into Program Files) nothing may be shared:
     - install folder   per user, %LOCALAPPDATA%\Programs\Hallym MIPS (Qt's: Program Files)
     - Start menu       "Hallym MIPS" (Qt's is a folder "Hallym MIPS Simulator")
     - settings         %APPDATA%\HallymMIPS2 (Qt's: registry HKCU\Software\HallymMIPS)
     - uninstall entry  its own appId / GUID, per user (HKCU)
     - no file association (no .s), no desktop shortcut, no elevation.
   The Windows CI job checks each of these against a real 1.2.4 install. */

import { build as electronBuild, type Configuration } from 'electron-builder';
import * as esbuild from 'esbuild';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { LICENSE_SOURCES } from '../src/main/paths.ts';
import { nodeOptions, rendererOptions, writeThirdParty } from './build-ui.ts';

const root = path.join(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const electronVersion = JSON.parse(readFileSync(path.join(root, 'node_modules/electron/package.json'), 'utf8')).version;
const stage = path.join(root, 'build/package/app');
const at = (...p: string[]) => path.join(stage, ...p);
const dirOnly = process.argv.includes('--dir');

export const APP_ID = 'kr.ac.hallym.mips-simulator.electron';

async function stageApp(): Promise<void> {
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  const define = { 'process.env.SPIM_BUNDLE': '"1"', 'process.env.SPIM_VERSION': JSON.stringify(pkg.version) };
  const main = await esbuild.build({ ...nodeOptions('src/main/main.ts', at('main.js')), define });
  const worker = await esbuild.build({ ...nodeOptions('src/sim/worker.ts', at('worker.js')), define });
  const ui = await esbuild.build({ ...rendererOptions, outfile: at('renderer/app/app.js'), sourcemap: false });
  await writeThirdParty([ui.metafile!, main.metafile!, worker.metafile!]);

  const html = readFileSync(path.join(root, 'src/renderer/app/index.html'), 'utf8');
  const packagedHtml = html.replace('src="../../../build/renderer/app.js"', 'src="app.js"');
  if (packagedHtml === html) throw new Error('index.html: the script tag to rewrite was not found');
  writeFileSync(at('renderer/app/index.html'), packagedHtml);
  cpSync(path.join(root, 'src/renderer/app/app.css'), at('renderer/app/app.css'));
  cpSync(path.join(root, 'src/renderer/assets'), at('renderer/assets'), { recursive: true });
  cpSync(path.join(root, 'src/main/preload.cjs'), at('preload.cjs'));
  cpSync(path.join(root, 'CPU/exceptions.s'), at('exceptions.s'));
  cpSync(path.join(root, 'src/examples'), at('examples'), { recursive: true });
  const addon = path.join(root, 'native/build/Release/spim.node');
  if (!existsSync(addon)) throw new Error('no native/build/Release/spim.node: npm run build:electron first');
  cpSync(addon, at('spim.node'));
  for (const [name, source] of Object.entries(LICENSE_SOURCES)) cpSync(path.join(root, source), at('licenses', name));

  writeFileSync(at('package.json'), JSON.stringify({
    // An npm name (no blanks, lower case); the install folder is still
    // called "Hallym MIPS": packaging/installer.nsh sets it.
    name: 'hallym-mips', productName: 'Hallym MIPS', version: pkg.version,
    description: 'MIPS simulator for Hallym University (based on SPIM 9.1.24)',
    author: 'AIAC Lab, Hallym University', license: 'BSD-3-Clause', type: 'module', main: 'main.js',
  }, null, 1));
}

export const config: Configuration = {
  appId: APP_ID,
  productName: 'Hallym MIPS',
  executableName: 'HallymMIPS',
  electronVersion,
  directories: { app: stage, output: path.join(root, 'dist'), buildResources: path.join(root, 'packaging') },
  // Only the staged files: everything the program uses is in its bundles
  // (electron-builder would otherwise add the repository's dependencies).
  files: ['**/*', '!node_modules/**'],
  publish: null,
  asar: true,
  asarUnpack: ['spim.node'],
  electronLanguages: ['ko', 'en-US'], // Chromium's UI strings: Korean, and its fallback
  npmRebuild: false,
  nodeGypRebuild: false,
  // BSD: the notice goes with the binary, next to the executable as well as in About.
  extraFiles: [{ from: path.join(root, 'LICENSE'), to: 'LICENSE.txt' }, { from: path.join(root, 'NOTICE'), to: 'NOTICE.txt' }],
  win: {
    target: ['nsis', 'zip'],
    icon: path.join(root, 'packaging/icons/HallymMIPS.ico'),
    signAndEditExecutable: true,
    artifactName: 'HallymMIPS-${version}-win-x64.${ext}', // the zip (nsis has its own below)
  },
  nsis: {
    oneClick: true,
    perMachine: false,
    allowElevation: false,
    shortcutName: 'Hallym MIPS',
    createDesktopShortcut: false,
    createStartMenuShortcut: true,
    deleteAppDataOnUninstall: false,
    runAfterFinish: false,
    include: path.join(root, 'packaging/installer.nsh'), // no copy of the installer kept for an updater
    artifactName: 'HallymMIPS-${version}-win-x64-setup.${ext}',
    uninstallDisplayName: 'Hallym MIPS ${version}',
  },
  linux: { target: ['dir'], icon: path.join(root, 'packaging/icons/app-256.png'), category: 'Education' },
  // No fileAssociations, no protocols: the Qt build's CI checks that .s is left alone.
};

if (import.meta.main) {
  await stageApp();
  await electronBuild({ config, dir: dirOnly, publish: 'never' });
}
