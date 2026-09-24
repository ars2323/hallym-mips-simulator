/* The licenses of the npm packages that end up in the app: every package
   esbuild bundled (from its metafile), plus node-addon-api, whose headers
   are compiled into the addon.  Written as one text file that About shows
   and the package carries (src/main/paths.ts, LICENSES). */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Metafile } from 'esbuild';

const root = path.join(import.meta.dirname, '..');
const COMPILED_IN = ['node-addon-api'];

function packageOf(input: string): string | null {
  const m = /node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(input.replace(/\\/g, '/'));
  return m ? m[1] : null;
}

export function thirdPartyText(metafiles: Metafile[]): string {
  const names = new Set<string>(COMPILED_IN);
  for (const meta of metafiles) for (const input of Object.keys(meta.inputs)) {
    const p = packageOf(input);
    if (p) names.add(p);
  }
  const parts = [...names].sort().map((name) => {
    const dir = path.join(root, 'node_modules', name);
    const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
    const file = readdirSync(dir).find((f) => /^(licen[sc]e|copying)(\.(md|txt))?$/i.test(f));
    if (!file) throw new Error(`${name}: no license file in ${dir}`);
    const text = readFileSync(path.join(dir, file), 'utf8').trim();
    return `${'='.repeat(78)}\n${pkg.name} ${pkg.version} — ${pkg.license}\n${'='.repeat(78)}\n\n${text}\n`;
  });
  return `npm packages in this program: bundled into its JavaScript, or (node-addon-api)\ncompiled into its native addon.  ${names.size} packages.\n\n${parts.join('\n')}`;
}

