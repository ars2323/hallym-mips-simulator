/* The measurement behind docs/PORTING.md, "Source line display".

     node tools/scanner-input-experiment.ts

   Builds, in a temporary directory, the addon with the scanner fed the way
   QtSpim feeds it -- a FILE* (here fmemopen() on the same bytes) -- once
   with flex's usual 16 KB reads and once each with 4 KB and 1 MB reads, and
   compares every instruction's source line with this repository's addon,
   which hands flex the whole file in one buffer (yy_scan_bytes).

   If the differences come from flex refilling its buffer, they sit just
   below multiples of the read size, move when it changes, and vanish when
   one read takes the whole file.  Linux only (fmemopen); needs the same
   tools as `npm run build`.  Nothing in the working tree is touched.
*/

import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');

const VARIANTS = [
  { name: 'FILE*, 16 KB reads (QtSpim)', size: 16384, flags: '' },
  { name: 'FILE*, 4 KB reads', size: 4096, flags: '-DYY_READ_BUF_SIZE=4096' },
  { name: 'FILE*, one 1 MB read', size: 1048576, flags: '-DYY_READ_BUF_SIZE=1048576 -DYY_BUF_SIZE=2097152' },
];

const programs = [
  ...readdirSync(path.join(root, 'tests/programs')).map((f) => path.join(root, 'tests/programs', f)),
  ...readdirSync(path.join(root, 'tests/samples')).map((f) => path.join(root, 'tests/samples', f)),
].filter((f) => f.endsWith('.s'));

// Every program's instruction lines through the addon at `addon`, in a
// child process (each addon is its own copy of the core).
function lines(addon: string): Record<string, { addr: number; line: string }[]> {
  const script = `
    import { createRequire } from 'node:module';
    import { readFileSync } from 'node:fs';
    const core = createRequire(import.meta.url)(${JSON.stringify(addon)});
    const u8 = (b) => new Uint8Array(b);
    const handler = u8(readFileSync(${JSON.stringify(path.join(root, '../CPU/exceptions.s'))}));
    const out = {};
    for (const f of ${JSON.stringify(programs)}) {
      core.assemble(u8(readFileSync(f)), handler, [u8(Buffer.from('program.s'))], [], u8(Buffer.from('program.s')));
      out[f] = core.textSegment().map((t) => ({ addr: t.addr, line: t.line }));
    }
    console.log(JSON.stringify(out));`;
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script],
                                 { encoding: 'utf8', maxBuffer: 1 << 28 }));
}

const outer = mkdtempSync(path.join(os.tmpdir(), 'scanner-input-'));
const dir = path.join(outer, 'electron');
mkdirSync(dir);
try {
  cpSync(path.join(root, 'native'), path.join(dir, 'native'), {
    recursive: true, filter: (from) => !from.startsWith(path.join(root, 'native', 'build')),
  });
  symlinkSync(path.join(root, '..', 'CPU'), path.join(outer, 'CPU')); // as beside electron/
  symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'));

  // The FILE* route: read_assembly_file()'s own way of feeding the scanner.
  const addonFile = path.join(dir, 'native/src/addon.cc');
  const source = readFileSync(addonFile, 'utf8');
  const memory = '  initialize_scanner(stdin);\n  YY_BUFFER_STATE buffer = yy_scan_bytes(bytes.data(), (int)bytes.size());';
  const close = '  yy_delete_buffer(buffer);';
  if (source.split(memory).length !== 2 || source.split(close).length !== 2) throw new Error('addon.cc has changed shape');
  writeFileSync(addonFile, source
    .replace(memory, '  FILE *file = fmemopen((void *)bytes.data(), bytes.size(), "r");\n  initialize_scanner(file);')
    .replace(close, '  fclose(file);'));

  const ours = lines(path.join(root, 'native/build/Release/spim.node'));
  const sizes = Object.fromEntries(programs.map((f) => [f, readFileSync(f)]));
  for (const v of VARIANTS) {
    execFileSync(path.join(root, 'node_modules/.bin/node-gyp'), ['rebuild', '--directory', path.join(dir, 'native')],
                 { env: { ...process.env, CXXFLAGS: v.flags }, stdio: 'ignore' });
    const addon = path.join(dir, `variant-${v.size}.node`);
    cpSync(path.join(dir, 'native/build/Release/spim.node'), addon);
    const theirs = lines(addon);
    const rows: string[] = [];
    for (const f of programs) {
      const bytes = sizes[f];
      const starts = [0];
      bytes.forEach((b, i) => { if (b === 10) starts.push(i + 1); });
      ours[f].forEach((o, i) => {
        const t = theirs[f][i];
        if (t.addr !== o.addr) throw new Error(`${f}: instruction lists differ`);
        if (t.line === o.line) return;
        const n = Number(/; (\d+): /.exec(o.line)?.[1] ?? 0);
        const offset = starts[n - 1] ?? 0;
        rows.push(`    ${path.basename(f).padEnd(24)} line ${String(n).padStart(4)}  byte ${String(offset).padStart(6)}`
                  + ` = ${(offset / v.size).toFixed(3)} x read size   FILE* shows ${JSON.stringify(t.line.split('; ')[1] ?? '')}`);
      });
    }
    console.log(`${v.name}: ${rows.length} source line(s) differ from the one-buffer addon`);
    for (const r of rows) console.log(r);
  }
} finally {
  rmSync(outer, { recursive: true, force: true });
}
