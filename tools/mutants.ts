/* Shows that the tests catch a wrong module, before they are trusted to say
   a right one is right.

     node tools/mutants.ts [FILTER]

   Each mutant below changes one thing in one file -- the text `find` must
   occur exactly once -- in a copy of src/, tests/, tools/ and native/'s
   sources in a temporary directory (the built addon, CPU/ and node_modules/
   are linked, not copied; a mutant marked `rebuild` in native/src gets its
   own build of the addon there), and
   runs the tests named for it there.  A mutant is KILLED when those tests
   fail; one that survives, or does not apply, fails this script.  Nothing in
   the working tree is touched.

   Tests named *.e2e.ts run the real window through Playwright (the copy's
   window script is bundled first); they need a display -- on Linux without
   one, xvfb-run -a npm run test:mutants.
*/

import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');

interface Mutant {
  module: string;
  file: string;
  find: string;
  replace: string;
  tests: string[];
  what: string;
  rebuild?: boolean; // the mutant is in native/src: build the addon again
}

const MUTANTS: Mutant[] = [
  // ---- decoder
  { module: 'decoder', file: 'src/core/decoder.ts', what: 'rt taken from bit 17',
    find: 'rt: (word >>> 16) & 0x1f,', replace: 'rt: (word >>> 17) & 0x1f,', tests: ['tests/core/decoder.test.ts'] },
  { module: 'decoder', file: 'src/core/decoder.ts', what: 'addiu named addi',
    find: "[0x09, 'addiu', 'Plain']", replace: "[0x09, 'addi', 'Plain']", tests: ['tests/core/decoder.test.ts'] },
  { module: 'decoder', file: 'src/core/decoder.ts', what: 'SPECIAL2 formatted as I',
    find: '    case 0x00:\n    case 0x1c:\n      return \'R\';', replace: '    case 0x00:\n      return \'R\';',
    tests: ['tests/core/decoder.test.ts'] },
  // ---- registers
  { module: 'registers', file: 'src/core/registers.ts', what: '$t8 and $t9 swapped',
    find: "'s6', 's7', 't8', 't9',", replace: "'s6', 's7', 't9', 't8',", tests: ['tests/core/registers.test.ts'] },
  { module: 'registers', file: 'src/core/registers.ts', what: 'Cause numbered 14',
    find: 'export const CP0_CAUSE = 13;', replace: 'export const CP0_CAUSE = 14;', tests: ['tests/core/registers.test.ts'] },
  { module: 'registers', file: 'src/core/registers.ts', what: '"r32" accepted',
    find: 'Number(digits) <= 31', replace: 'Number(digits) <= 32', tests: ['tests/core/registers.test.ts'] },
  // ---- format
  { module: 'format', file: 'src/core/format.ts', what: 'nibbles joined with _',
    find: ".match(/.{4}/g)!.join(' ')", replace: ".match(/.{4}/g)!.join('_')", tests: ['tests/core/format.test.ts'] },
  { module: 'format', file: 'src/core/format.ts', what: 'decimal below INT32_MIN accepted',
    find: 'parsed < -2147483648n', replace: 'parsed < -2147483649n', tests: ['tests/core/format.test.ts'] },
  { module: 'format', file: 'src/core/format.ts', what: 'signed decimal printed unsigned',
    find: 'String(value | 0)', replace: 'String(value >>> 0)', tests: ['tests/core/format.test.ts'] },
  // ---- instruction-text
  { module: 'instruction-text', file: 'src/core/instruction-text.ts', what: 'immediate value shown unsigned',
    find: "field.name === 'immediate' ? String(d.simm)", replace: "field.name === 'immediate' ? String(d.imm)",
    tests: ['tests/core/instruction-text.test.ts'] },
  { module: 'instruction-text', file: 'src/core/instruction-text.ts', what: 'rs meaning off by one',
    find: "return generalRegisterName(v);\n      break;\n    case 'Cp0':",
    replace: "return generalRegisterName(field.name === 'rs' ? (v + 1) % 32 : v);\n      break;\n    case 'Cp0':",
    tests: ['tests/core/instruction-text.test.ts'] },
  { module: 'instruction-text', file: 'src/core/instruction-text.ts', what: 'jump destination label dropped',
    find: "(destinationLabel === '' ? '' : ` [${destinationLabel}]`)", replace: "''",
    tests: ['tests/core/instruction-text.test.ts'] },
  // ---- source-text
  { module: 'source-text', file: 'src/core/source-text.ts', what: 'statement keeps the colon',
    find: 'source.slice(colon + 1).trim()', replace: 'source.slice(colon).trim()', tests: ['tests/core/source-text.test.ts'] },
  { module: 'source-text', file: 'src/core/source-text.ts', what: 'thirteen digits taken as a line number',
    find: 'm[1].length > 9', replace: 'm[1].length > 13', tests: ['tests/core/source-text.test.ts'] },
  // ---- symbols
  { module: 'symbols', file: 'src/core/symbols.ts', what: 'address read as decimal',
    find: 'address: parseInt(m[3], 16)', replace: 'address: parseInt(m[3], 10)', tests: ['tests/core/symbols.test.ts'] },
  { module: 'symbols', file: 'src/core/symbols.ts', what: 'undefined (address 0) labels kept',
    find: "if (name === '' || address === 0) return;", replace: "if (name === '') return;",
    tests: ['tests/core/symbols.test.ts'] },
  // ---- memory-rows
  { module: 'memory-rows', file: 'src/core/memory-rows.ts', what: 'three zero words make a run',
    find: 'if (zeros >= 4) {', replace: 'if (zeros >= 3) {', tests: ['tests/core/memory-rows.test.ts'] },
  { module: 'memory-rows', file: 'src/core/memory-rows.ts', what: 'no short first line',
    find: 'if (from % LINE === 0 || from >= to) return from;', replace: 'if (from % WORD === 0 || from >= to) return from;',
    tests: ['tests/core/memory-rows.test.ts'] },
  { module: 'memory-rows', file: 'src/core/memory-rows.ts', what: 'goldens: zero runs one word short',
    find: "rows.push({ kind: 'ZeroRun', address: i, words: zeros });",
    replace: "rows.push({ kind: 'ZeroRun', address: i, words: zeros - 1 });",
    tests: ['tests/golden/qt.test.ts'] },
  // ---- memory-text
  { module: 'memory-text', file: 'src/core/memory-text.ts', what: "'~' shown as '.'",
    find: 'c >= 0x20 && c <= 0x7e', replace: 'c >= 0x20 && c < 0x7e', tests: ['tests/core/memory-text.test.ts'] },
  { module: 'memory-text', file: 'src/core/memory-text.ts', what: 'bytes and halves unsigned in decimal',
    find: 'return String(v & (1 << (bits - 1)) ? v - (1 << bits) : v);', replace: 'return String(v);',
    tests: ['tests/core/memory-text.test.ts'] },
  { module: 'memory-text', file: 'src/core/memory-text.ts', what: 'goldens: space shown as .',
    find: 'c >= 0x20 && c <= 0x7e', replace: 'c > 0x20 && c <= 0x7e', tests: ['tests/golden/qt.test.ts'] },
  // ---- mips-syntax
  { module: 'mips-syntax', file: 'src/core/mips-syntax.ts', what: 'first keyword lost',
    find: 'new Map(OP_TABLE.map(', replace: 'new Map(OP_TABLE.slice(1).map(', tests: ['tests/core/mips-syntax.test.ts'] },
  { module: 'mips-syntax', file: 'src/core/mips-syntax.ts', what: "names may not start with '.'",
    find: '/^[A-Za-z_.]$/', replace: '/^[A-Za-z_]$/', tests: ['tests/core/mips-syntax.test.ts'] },
  { module: 'mips-syntax', file: 'src/core/op-table.ts', what: 'generated table edited by hand',
    find: '["add", \'R3_TYPE_INST\'', replace: '["addd", \'R3_TYPE_INST\'', tests: ['tests/core/mips-syntax.test.ts'] },
  // ---- asm-errors
  { module: 'asm-errors', file: 'src/core/asm-errors.ts', what: 'first " on line " taken as the location',
    find: '/^spim: \\(parser\\) (.*) on line', replace: '/^spim: \\(parser\\) (.*?) on line',
    tests: ['tests/core/asm-errors.test.ts'] },
  { module: 'asm-errors', file: 'src/core/asm-errors.ts', what: 'quoted source not trimmed',
    find: "!lines[1].includes('^') ? lines[1].trim() : ''", replace: "!lines[1].includes('^') ? lines[1] : ''",
    tests: ['tests/core/asm-errors.test.ts'] },
  { module: 'asm-errors', file: 'src/core/asm-errors.ts', what: 'search goes down instead of up',
    find: 'for (let line = from; line >= 1 && line > from - 200; line -= 1) {',
    replace: 'for (let line = 1; line <= from; line += 1) {', tests: ['tests/core/asm-errors.test.ts'] },
  // ---- text-file (Node side)
  { module: 'text-file', file: 'src/node/text-file.ts', what: 'byte order mark not noted',
    find: '    byteOrderMark = true;\n    bytes = bytes.subarray(3);', replace: '    bytes = bytes.subarray(3);',
    tests: ['tests/node/text-file.test.ts'] },
  { module: 'text-file', file: 'src/node/text-file.ts', what: 'anything not UTF-8 taken for CP949',
    find: 'if (sameBytes(iconv.encode(korean, \'cp949\'), bytes)) {', replace: 'if (true) {',
    tests: ['tests/node/text-file.test.ts'] },
  { module: 'text-file', file: 'src/node/text-file.ts', what: 'CRLF counted as LF',
    find: "lineEnd: crlf > lf ? 'CRLF' : 'LF'", replace: "lineEnd: 'LF'", tests: ['tests/node/text-file.test.ts'] },
  // ---- the Node boundary
  { module: 'native/index.ts', file: 'native/index.ts', what: 'default argv[0] changed',
    find: "Object.freeze(['program.s'])", replace: "Object.freeze(['prog.s'])",
    tests: ['tests/golden/default.test.ts', 'tests/node/run-parameters.test.ts'] },
  { module: 'native/index.ts', file: 'native/index.ts', what: 'bytes passed on undecoded',
    find: '    text = decoded.text;', replace: "    text = Buffer.from(source).toString('latin1');",
    tests: ['tests/node/encoding.test.ts'] },
  { module: 'native/index.ts', file: 'native/index.ts', what: 'process environment leaks in by default',
    find: 'env: Object.freeze([]) });', replace: "env: Object.freeze(['HOME=' + (process.env.HOME ?? '')]) });",
    tests: ['tests/node/run-parameters.test.ts'] },
  // ---- execution control in the addon (rebuilt for each)
  { module: 'addon run', file: 'native/src/addon.cc', what: 'no stepping over the breakpoint stopped at', rebuild: true,
    find: 'bool stepOver = stoppedAt != 0 && stoppedAt == PC && inst_is_breakpoint(PC);', replace: 'bool stepOver = false;',
    tests: ['tests/node/run-control.test.ts'] },
  { module: 'addon run', file: 'native/src/addon.cc', what: 'a run-time error reported as an exit', rebuild: true,
    find: 'reason = errors.empty() ? "exit" : "error";', replace: 'reason = "exit";',
    tests: ['tests/node/run-control.test.ts'] },
  { module: 'addon breakpoints', file: 'native/src/addon.cc', what: 'addresses outside text reach the core', rebuild: true,
    find: '  if (!inText(addr)) {', replace: '  if (false) {', tests: ['tests/node/run-control.test.ts'] },
  { module: 'addon breakpoints', file: 'native/src/addon.cc', what: 'text segment shows the break, not the instruction',
    rebuild: true, find: '    if (breakpoint) delete_breakpoint(addr);\n', replace: '',
    tests: ['tests/node/run-control.test.ts'] },
  // ---- the Node side of execution control
  { module: 'native/index.ts', file: 'native/index.ts', what: 'breakpoint list misread',
    find: '/^Breakpoint at 0x([0-9a-f]{8})$/gm', replace: '/^Breakpoint at 0x([0-9a-f]{8})$/g',
    tests: ['tests/node/run-control.test.ts'] },
  { module: 'native/index.ts', file: 'native/index.ts', what: 'step() stops going at a breakpoint',
    find: "return stop !== 'exit' && stop !== 'error';", replace: "return stop === 'limit';",
    tests: ['tests/node/run-control.test.ts'] },
  // ---- the simulator process
  { module: 'sim worker', file: 'src/sim/worker.ts', what: 'stop requests ignored',
    find: "      if (stopRequested) return result('stopped', errors);\n", replace: '',
    tests: ['tests/sim/process.test.ts'] },
  { module: 'sim worker', file: 'src/sim/worker.ts', what: 'output sent only at the end',
    find: "      flushConsole();\n      if (stop !== 'limit')", replace: "      if (stop !== 'limit') flushConsole();\n      if (stop !== 'limit')",
    tests: ['tests/sim/process.test.ts'] },
  { module: 'sim worker', file: 'src/sim/worker.ts', what: 'console decoded without streaming',
    find: 'decoder.decode(spim.consoleOutput(), { stream: true })', replace: 'decoder.decode(spim.consoleOutput())',
    tests: ['tests/sim/process.test.ts'] },
  { module: 'sim worker', file: 'src/sim/worker.ts', what: 'slices too long to stop between',
    find: 'export const SLICE = 10000;', replace: 'export const SLICE = 20000000;', tests: ['tests/sim/process.test.ts'] },
  { module: 'sim worker', file: 'src/sim/worker.ts', what: 'changes allowed while running',
    find: "    if (running && !WHILE_RUNNING.has(method))", replace: "    if (false && running && !WHILE_RUNNING.has(method))",
    tests: ['tests/sim/process.test.ts'] },
  { module: 'sim host', file: 'src/sim/host.ts', what: 'no restart after a crash by default',
    find: 'this.restartOnCrash = options.restartOnCrash ?? true;', replace: 'this.restartOnCrash = options.restartOnCrash ?? false;',
    tests: ['tests/sim/process.test.ts'] },
  { module: 'sim host', file: 'src/sim/host.ts', what: 'stop() kills at once',
    find: '      const stopCall = this.call(\'stop\');', replace: "      kill(); return 'killed';\n      const stopCall = this.call('stop');",
    tests: ['tests/sim/process.test.ts'] },
  { module: 'sim host', file: 'src/sim/host.ts', what: "the core's fatal message lost",
    find: '/SPIM core fatal error: (.*)/', replace: '/SPIM core fatal eror: (.*)/', tests: ['tests/sim/process.test.ts'] },
  // ---- the golden harness itself
  { module: 'qt goldens', file: 'tests/golden/qt.test.ts', what: 'capture environment in another order',
    find: "env: ['QT_QPA_PLATFORM=offscreen', 'HOME=/nonexistent',", replace: "env: ['HOME=/nonexistent', 'QT_QPA_PLATFORM=offscreen',",
    tests: ['tests/golden/qt.test.ts'] },
  { module: 'qt goldens', file: 'tests/golden/qt.test.ts', what: "a pinned source line's Qt text changed",
    find: "qt: '; 3577: _str)'", replace: "qt: '; 3577: _str'", tests: ['tests/golden/qt.test.ts'] },
  { module: 'qt goldens', file: 'tests/golden/qt.test.ts', what: "a pinned source line's own text changed",
    find: "ours: '; 1155: mtlo $0'", replace: "ours: '; 1155: mtlo $1'", tests: ['tests/golden/qt.test.ts'] },
  // ---- console input: the read syscall is rewound when there is nothing to read
  { module: 'addon input', file: 'native/src/addon.cc', what: 'PC not rewound to the syscall', rebuild: true,
    find: '    PC = inputPC;\n', replace: '', tests: ['tests/node/console-input.test.ts'] },
  { module: 'addon input', file: 'native/src/addon.cc', what: '$v0 not restored', rebuild: true,
    find: '    R[REG_V0] = inputV0;\n', replace: '', tests: ['tests/node/console-input.test.ts'] },
  { module: 'addon input', file: 'native/src/addon.cc', what: '$f0 not restored', rebuild: true,
    find: '    FPR[0] = inputF0;\n', replace: '', tests: ['tests/node/console-input.test.ts'] },
  { module: 'sim worker', file: 'src/sim/worker.ts', what: 'input not handed to the core',
    find: 'provideInput: (text: string) => spim.provideInput(text),', replace: 'provideInput: (_text: string) => undefined,',
    tests: ['tests/sim/process.test.ts'] },
  // ---- the window's logic
  { module: 'renderer logic', file: 'src/renderer/app/logic/virtual.ts', what: 'no rows kept around the view',
    find: 'overscan = 10', replace: 'overscan = 0', tests: ['tests/renderer/logic.test.ts'] },
  { module: 'renderer logic', file: 'src/renderer/app/logic/virtual.ts', what: 'scrolls without a margin',
    find: 'margin = 2', replace: 'margin = 0', tests: ['tests/renderer/logic.test.ts'] },
  { module: 'renderer logic', file: 'src/renderer/app/logic/machine.ts', what: 'PC counted as changed',
    find: "if (row.key !== 'PC' && row.value !== a[i].value)", replace: 'if (row.value !== a[i].value)',
    tests: ['tests/renderer/logic.test.ts'] },
  { module: 'renderer logic', file: 'src/renderer/app/logic/machine.ts', what: 'waiting for input taken as paused',
    find: "    case 'input': return 'input';\n", replace: '', tests: ['tests/renderer/logic.test.ts'] },
  { module: 'explain', file: 'src/core/explain.ts', what: 'sra says it fills with zeros',
    find: "name === 'sra' ? '부호 비트로' : '0으로'", replace: "'0으로'", tests: ['tests/core/explain.test.ts'] },
  { module: 'explain', file: 'src/core/explain.ts', what: 'jal return address is PC',
    find: '`돌아올 주소(${code(hex32(pc + 4))})를 ${reg(31)}', replace: '`돌아올 주소(${code(hex32(pc))})를 ${reg(31)}',
    tests: ['tests/core/explain.test.ts'] },
  // ---- Settings: machine options and the exception handler
  { module: 'addon options', file: 'native/src/addon.cc', what: 'delayed branches never reach the core', rebuild: true,
    find: 'delayed_branches = flagOf(options, "delayedBranches", false);', replace: 'delayed_branches = false;',
    tests: ['tests/node/machine-options.test.ts'] },
  { module: 'addon options', file: 'native/src/addon.cc', what: 'an empty handler is read (flex dies on it)', rebuild: true,
    find: '  if (!handler.empty()) {', replace: '  if (true) {', tests: ['tests/node/machine-options.test.ts'] },
  { module: 'native/index.ts', file: 'native/index.ts', what: 'no handler taken as the default one',
    find: ': options.handler === null ? new Uint8Array(0)', replace: ': options.handler === null ? new Uint8Array(defaultHandler)',
    tests: ['tests/node/machine-options.test.ts'] },
  { module: 'sim worker', file: 'src/sim/worker.ts', what: 'input refused while running (mapped I/O)',
    find: "'readBytes', 'disassemble', 'provideInput']);", replace: "'readBytes', 'disassemble']);",
    tests: ['tests/sim/process.test.ts'] },
  // ---- the window, end to end
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'font size kept for the session only',
    find: 'settings = await api.setSettings({ ...settings, fontSize: Math.max(10, Math.min(24, px)) });',
    replace: 'settings = { ...settings, fontSize: Math.max(10, Math.min(24, px)) };', tests: ['tests/e2e/settings.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'Run Parameters not passed on',
    find: "run: { argv: ['program.s', ...a.args.split(/\\s+/).filter(Boolean)], env: [] },", replace: "run: { argv: ['program.s'], env: [] },",
    tests: ['tests/e2e/settings.e2e.ts'] },
  { module: 'window', file: 'src/main/paths.ts', what: 'a notice missing from About',
    find: "  { name: 'lucide-LICENSE.txt', title: 'Lucide icons — ISC License' },\n", replace: '', tests: ['tests/e2e/settings.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/panels/registers.ts', what: "CP0 in Pretendard (reads 'CPO')",
    find: "group === 'CP0' ? code('CP0') : group", replace: 'group', tests: ['tests/e2e/hex-mono.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/editor.ts', what: 'Ctrl+S saves in the middle of a syllable',
    find: '    if (composing || view.composing || view.compositionStarted) saveAfterComposition = true;\n    else onSave();',
    replace: '    onSave();', tests: ['tests/e2e/ime.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.css', what: 'mono spans in the UI font',
    find: '.mono { font-family: var(--code); }', replace: '.mono { font-family: var(--ui); }', tests: ['tests/e2e/hex-mono.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/panels/inspector.ts', what: 'Inspector heading in the UI font',
    find: "code(row.disassembly, 'dis')", replace: "h('span', { class: 'dis' }, row.disassembly)", tests: ['tests/e2e/hex-mono.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/panels/registers.ts', what: 'every row marked changed',
    find: "row.el.classList.toggle('chg', changed.has(r.key));", replace: "row.el.classList.toggle('chg', true);",
    tests: ['tests/e2e/flows.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'the executed line not followed in the Editor',
    find: "editor.showPcLine(shown && runState !== 'ready' ? pcSourceLine() : null);", replace: 'editor.showPcLine(null);',
    tests: ['tests/e2e/layout.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'start-up code marked on the Editor\'s lines',
    find: 'return row.source && onLine.includes(simplified(row.source)) ? row.line : null;', replace: 'return row.line;',
    tests: ['tests/e2e/layout.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'stale machine shown after an edit',
    find: 'const machineShown = () => assembledText !== null && !dirty;', replace: 'const machineShown = () => assembledText !== null;',
    tests: ['tests/e2e/layout.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/panels/console.ts', what: 'Enter does not hand the line on',
    find: '        this.onInput(line);\n', replace: '', tests: ['tests/e2e/flows.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'breakpoints lost on 처음으로',
    find: '    if (!same) breakpoints.clear();', replace: '    breakpoints.clear();', tests: ['tests/e2e/flows.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'a run after input resumes as a step',
    find: "  if (resumeWith === 'run') await run();\n  else await step();", replace: '  await step();',
    tests: ['tests/e2e/flows.e2e.ts'] },
];

function copyTree(dir: string, linkBuild: boolean): void {
  for (const d of ['src', 'tests', 'tools']) cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  for (const f of ['package.json', 'tsconfig.json', 'playwright.config.ts', 'LICENSE', 'NOTICE']) cpSync(path.join(root, f), path.join(dir, f));
  cpSync(path.join(root, 'native'), path.join(dir, 'native'), {
    recursive: true, filter: (from) => !from.startsWith(path.join(root, 'native', 'build')),
  });
  if (linkBuild) symlinkSync(path.join(root, 'native', 'build'), path.join(dir, 'native', 'build'));
  for (const l of ['CPU', 'node_modules']) symlinkSync(path.join(root, l), path.join(dir, l));
}

const filter = process.argv[2] ?? '';
const selected = MUTANTS.filter((m) => `${m.module} ${m.what}`.includes(filter));
let bad = 0;
const rows: string[] = [];
for (const m of selected) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'mutant-'));
  try {
    copyTree(dir, !m.rebuild);
    const file = path.join(dir, m.file);
    const text = readFileSync(file, 'utf8');
    const count = text.split(m.find).length - 1;
    if (count !== 1) {
      rows.push(`NOT APPLIED  ${m.module}: ${m.what} (found ${count} times)`);
      bad += 1;
      continue;
    }
    writeFileSync(file, text.replace(m.find, m.replace));
    if (m.rebuild) {
      execFileSync(path.join(root, 'node_modules/.bin/node-gyp'), ['rebuild', '--directory', path.join(dir, 'native')],
                   { stdio: 'ignore' });
    }
    const e2e = m.tests.every((t) => t.endsWith('.e2e.ts'));
    if (e2e) execFileSync(process.execPath, ['tools/build-ui.ts'], { cwd: dir, stdio: 'ignore' });
    const run = e2e
      ? spawnSync(process.execPath, [path.join(root, 'node_modules/@playwright/test/cli.js'), 'test', ...m.tests],
                  { cwd: dir, encoding: 'utf8', timeout: 300000 })
      : spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...m.tests],
                  { cwd: dir, encoding: 'utf8', timeout: 300000 });
    const firstFailure = (e2e ? /^\s*\d+\) (.*)$/m.exec(run.stdout)?.[1]?.replace(/─+$/, '').trim()
                              : /^\s*not ok \d+ - (.*)$/m.exec(run.stdout)?.[1]) ?? '(no test reported a failure)';
    if (run.status === 0) {
      rows.push(`SURVIVED     ${m.module}: ${m.what}`);
      bad += 1;
    } else {
      rows.push(`killed       ${m.module}: ${m.what}  <-  ${firstFailure}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
console.log(rows.join('\n'));
console.log(`\n${selected.length - bad} of ${selected.length} mutants killed`);
process.exit(bad === 0 ? 0 : 1);
