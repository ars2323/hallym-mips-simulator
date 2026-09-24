/* Starts the Electron app (src/main/main.ts) with arguments passed on.

   ELECTRON_RUN_AS_NODE is removed from the environment first: tools that are
   themselves Electron apps (VS Code among them) export it, and with it set
   the electron binary runs as plain Node and the app never starts. */

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const electron = createRequire(import.meta.url)('electron') as unknown as string; // the binary's path
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const r = spawnSync(electron, [path.join(root, 'src/main/main.ts'), ...process.argv.slice(2)], { stdio: 'inherit', env });
process.exit(r.status ?? 1);
