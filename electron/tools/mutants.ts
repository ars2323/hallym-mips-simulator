/* Shows that the tests catch a wrong module, before they are trusted to say
   a right one is right.

     node tools/mutants.ts [FILTER]            every mutant (or those whose "module what" holds FILTER)
     node tools/mutants.ts --changed           only those the changes since the baseline could touch
       --list            say which would run, and why; run nothing
       --jobs N          N mutants at a time (default: a third of the cores, 1 to 6); those that
                         rebuild the addon run one at a time, after the others
       --shard I/N       the I-th of N parts of the selection (CI: .github/workflows/mutants.yml)
       --no-control      skip the control (on by default): first the selection's tests are run with
                         no mutant, since a failure there would make every kill meaningless (a test
                         failing on its own reads as a kill), so the run stops
       --json FILE       the results: each mutant, killed or not, by which test, in how many seconds
     node tools/mutants.ts --check             every mutant's `find` exactly once in its `file`; nothing built or run
     node tools/mutants.ts --merge OUT IN...   one result from the shards' JSON; fails unless every mutant is in it, killed
     node tools/mutants.ts --baseline-from MERGED [--run URL]
                                               print the baseline record of a green full pass (to commit by hand)
     node tools/mutants.ts --verify-selector   the selector's own checks, in a temporary git worktree

   Each mutant changes one thing in one file -- the text `find` must occur
   exactly once -- in a copy of src/, tests/, tools/ and native/'s sources
   in a temporary directory, <tmp>/electron (the built addon and
   node_modules/ are linked, not copied, and the repository's CPU/ is linked
   at <tmp>/CPU; a mutant marked `rebuild` in native/src gets its own build
   of the addon there), and runs the tests named for it there.  A mutant is
   KILLED when those tests fail; one that survives, or does not apply, fails
   this script.  Nothing in the working tree is touched.

   --changed.  The baseline, tools/mutants-baseline.json, is a full pass
   that killed every mutant: its commit, date, and the mutants it killed.
   From it, a mutant runs if its `file` or one of its `tests` changed since
   that commit -- committed (git diff <sha>..HEAD) or not (git status:
   staged, unstaged, untracked) -- or if it is not among the baseline's.
   The rest were killed at the baseline against the same code and tests,
   and are listed as skipped, each with why; that none of them has a file in
   the changes is checked again before anything runs.  Whenever the change
   set cannot be trusted, it runs them all and says why: no baseline file,
   the baseline commit not an ancestor of HEAD, git not answering, a
   mutant's file or test missing.  The find check runs first in every mode:
   a `find` that does not occur exactly once stops everything.

   Tests named *.e2e.ts run the real window through Playwright (the copy's
   window script is bundled first); they need a display.  On Linux each
   worker gets its own (xvfb-run -n, from :120 up) when there is none or
   when more than one runs at a time; otherwise the one in DISPLAY.
*/

import { execFileSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

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
  // Nothing kept between runs (docs/PORTING.md 20).
  { module: 'window', file: 'src/main/main.ts', what: 'the run folder left behind after the app exits',
    find: "    spawn(process.execPath, ['-e', script], { detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }).unref();",
    replace: '    void script;', tests: ['tests/e2e/settings.e2e.ts'] },
  { module: 'window', file: 'src/main/main.ts', what: 'a run starts from other settings than the defaults',
    find: 'let settings: Settings = { ...DEFAULT_SETTINGS };', replace: 'let settings: Settings = { ...DEFAULT_SETTINGS, fontSize: 15, dataBase: 10 };',
    tests: ['tests/e2e/settings.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'Run Parameters not passed on',
    find: "run: { argv: ['program.s', ...a.args.split(/\\s+/).filter(Boolean)], env: [] },", replace: "run: { argv: ['program.s'], env: [] },",
    tests: ['tests/e2e/settings.e2e.ts'] },
  { module: 'window', file: 'src/main/paths.ts', what: 'a notice missing from About',
    find: "  { name: 'lucide-LICENSE.txt', title: 'Lucide icons — ISC License' },\n", replace: '', tests: ['tests/e2e/settings.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/panels/registers.ts', what: "CP0 in Pretendard (reads 'CPO')",
    find: "group === 'CP0' ? code('CP0') : h('span', { class: 'gname' }, group)", replace: "h('span', { class: 'gname' }, group)",
    tests: ['tests/e2e/hex-mono.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'Inspector does not follow PC',
    find: 'const atPc = lastRegs && started ? text.rowFor(lastRegs.pc) : undefined;', replace: 'const atPc = undefined;',
    tests: ['tests/e2e/panels.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'Esc waits out a slow run\'s second',
    find: 'slow = { cancel: () => { cancelled = true; wake?.(); } };', replace: 'slow = { cancel: () => { cancelled = true; } };',
    tests: ['tests/e2e/panels.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/panels/data.ts', what: 'Data addresses without 0x',
    find: "code(hex32(base16), 'daddr')", replace: "code(hex32(base16).slice(2), 'daddr')", tests: ['tests/e2e/panels.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/panels/console.ts', what: 'Console folded at the start',
    find: '  expanded = true;', replace: '  expanded = false;', tests: ['tests/e2e/panels.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/editor.ts', what: 'Ctrl+S saves in the middle of a syllable',
    find: '    if (composing) saveAfterComposition = true;\n    else onSave();',
    replace: '    onSave();', tests: ['tests/e2e/ime.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'Ctrl+S in the middle of a syllable taken as not composing',
    find: 'editor.requestSave(e.isComposing)', replace: 'editor.requestSave(false)', tests: ['tests/e2e/ime.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/panels/console.ts', what: 'Console Enter taken in the middle of a syllable',
    find: "if (e.key === 'Enter' && !e.isComposing) {", replace: "if (e.key === 'Enter') {", tests: ['tests/e2e/ime.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.css', what: 'mono spans in the UI font',
    find: '.mono { font-family: var(--code); }', replace: '.mono { font-family: var(--ui); }', tests: ['tests/e2e/hex-mono.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/panels/inspector.ts', what: 'Inspector heading in the UI font',
    find: "code(row.disassembly, 'dis')", replace: "h('span', { class: 'dis' }, row.disassembly)", tests: ['tests/e2e/hex-mono.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/panels/registers.ts', what: 'every row marked changed',
    find: "row.el.classList.toggle('chg', isChanged);", replace: "row.el.classList.toggle('chg', true);",
    tests: ['tests/e2e/flows.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'the executed line not followed in the Editor',
    find: "editor.showPcLine(current() && runState !== 'ready' ? pcSourceLine() : null);", replace: 'editor.showPcLine(null);',
    tests: ['tests/e2e/layout.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'start-up code marked on the Editor\'s lines',
    find: 'return simplified(editor.view.state.doc.line(row.line).text).includes(simplified(row.source));', replace: 'return true;',
    tests: ['tests/e2e/layout.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'the Editor marks a line while its code has changed',
    find: "editor.showPcLine(current() && runState !== 'ready' ? pcSourceLine() : null);",
    replace: "editor.showPcLine(machineShown() && runState !== 'ready' ? pcSourceLine() : null);", tests: ['tests/e2e/editing.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'changed code hides the machine',
    find: 'const machineShown = () => assembledText !== null;', replace: 'const machineShown = () => assembledText !== null && !edited;',
    tests: ['tests/e2e/editing.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'F10 after an edit assembles the Editor\'s code',
    find: '  if (assembledText === null) {\n    if (!open) return false;\n    return saveAndAssemble();',
    replace: '  if (assembledText === null || edited) {\n    if (!open) return false;\n    return saveAndAssemble();', tests: ['tests/e2e/editing.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'an assemble with errors takes the machine with it',
    find: '    if (check && !check.ok) return failed(parsed(check.errors));\n', replace: '', tests: ['tests/e2e/editing.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'a .err ends the machine on screen',
    find: '    if (check?.crashed) return failed([{ message: parseAssemblerMessage(check.crashed), line: 0 }]);\n', replace: '',
    tests: ['tests/e2e/editing.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'Reset assembles the Editor\'s code',
    find: "      r = await api.call('assemble', good.source, good.options);", replace: "      r = await api.call('assemble', editor.text(), good.options);",
    tests: ['tests/e2e/editing.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'a dot in changed code applied at once',
    find: "  if (!current()) {\n    if (machineShown()) { note =", replace: "  if (!machineShown()) {\n    if (machineShown()) { note =",
    tests: ['tests/e2e/editing.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.css', what: 'the Assemble panel as tall as it likes',
    find: '.asm { height: var(--asm-h, auto); max-height: var(--asm-max, 45%); }', replace: '.asm { height: var(--asm-h, auto); }',
    tests: ['tests/e2e/editing.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/panels/console.ts', what: 'Enter does not hand the line on',
    find: '        this.onInput(line);\n', replace: '', tests: ['tests/e2e/flows.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'breakpoints not given to the new machine',
    find: '    for (const a of breakpoints) await api.call(\'setBreakpoint\', a);\n    for (const x of rows) x.breakpoint = breakpoints.has(x.addr);\n    assembledText = source;',
    replace: '    for (const x of rows) x.breakpoint = breakpoints.has(x.addr);\n    assembledText = source;', tests: ['tests/e2e/editing.e2e.ts', 'tests/e2e/editor.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'Reset drops the breakpoints',
    find: "    rows = textRows(await api.call('textSegment'));\n    for (const a of breakpoints) await api.call('setBreakpoint', a);",
    replace: "    rows = textRows(await api.call('textSegment'));", tests: ['tests/e2e/flows.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'a saved file dropped for a new one without asking',
    find: "  if (what === 'new') {", replace: '  if (false) {', tests: ['tests/e2e/editor.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/editor.ts', what: 'Enter copies the indentation above',
    find: "{ key: 'Enter', run: insertNewline },", replace: '', tests: ['tests/e2e/editor.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/editor.ts', what: 'an error marked with a breakpoint\'s dot',
    find: "s.className = 'cm-error-mark';", replace: "s.className = 'cm-bp-dot';", tests: ['tests/e2e/editor.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/editor.ts', what: 'breakpoint marks left behind by edits',
    find: '    set = set.map(tr.changes); // they move with the text', replace: '', tests: ['tests/e2e/editor.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'a run after input resumes as a step',
    find: "  if (resumeWith === 'run') await run();\n  else await step();", replace: '  await step();',
    tests: ['tests/e2e/flows.e2e.ts'] },
  // ---- what a narrow window keeps (docs/PORTING.md 17)
  { module: 'columns', file: 'src/renderer/app/logic/columns.ts', what: 'a column given up before it has to',
    find: 'const hidden = new Set(drops.slice(0, k).flat());', replace: 'const hidden = new Set(drops.slice(0, k + 1).flat());',
    tests: ['tests/renderer/columns.test.ts'] },
  { module: 'columns', file: 'src/renderer/app/logic/columns.ts', what: 'a column turned back on stays off',
    find: 'const hidden = new Set([...auto.hidden].filter((key) => !forced.has(key)));', replace: 'const hidden = new Set(auto.hidden);',
    tests: ['tests/renderer/columns.test.ts'] },
  { module: 'columns', file: 'src/renderer/app/logic/columns.ts', what: 'the smaller font before the tighter margins',
    find: "    { name: 'tight', ...tight, scale: 1 },\n    { name: 'small', ...tight, scale: (fontPx - 1) / fontPx },",
    replace: "    { name: 'small', ...tight, scale: (fontPx - 1) / fontPx },\n    { name: 'tight', ...tight, scale: 1 },",
    tests: ['tests/renderer/columns.test.ts'] },
  { module: 'window', file: 'src/renderer/app/panels/registers.ts', what: 'Bin given up before Dec',
    find: "const DROPS = [['dec'], ['bin']];", replace: "const DROPS = [['bin'], ['dec']];", tests: ['tests/e2e/fit.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/panels/text.ts', what: 'Encoding given up first',
    find: "const DROPS = [['src', 'lno'], ['fmt'], ['addr'], ['word']];", replace: "const DROPS = [['word'], ['src', 'lno'], ['fmt'], ['addr']];",
    tests: ['tests/e2e/fit.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'the Editor keeps its 72 columns however narrow the window',
    find: 'Math.min(editorMost(), inner - runLeast)', replace: 'editorMost()', tests: ['tests/e2e/fit.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'the Editor wider than 72 columns need',
    find: 'const EDITOR_COLUMNS = 72;', replace: 'const EDITOR_COLUMNS = 100;', tests: ['tests/e2e/fit.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.css', what: 'the empty Console as tall as with output',
    find: '.console.open.is-empty { height: var(--console-h, auto); }\n', replace: '', tests: ['tests/e2e/layout.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'the grip over the Console does nothing',
    find: "  else leftCol.style.setProperty('--console-h', `${consoleHeight}px`);", replace: '', tests: ['tests/e2e/layout.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'the line number in the Errors title as well',
    find: "  const title = errors.length > 1 ? `코드에 오류가 ${errors.length}개 있습니다` : '코드에 오류가 있습니다';",
    replace: "  const title = `${first.line}행을 고친 뒤 다시 Ctrl+S 키를 누르세요`;", tests: ['tests/e2e/editor.e2e.ts'] },
  { module: 'tutorial', file: 'src/renderer/app/tutorial.ts', what: 'a line of instructions under the card\'s text again',
    find: "        h('p', {}, codeText((res ?? step).body(this))),\n",
    replace: "        h('p', {}, codeText((res ?? step).body(this))),\n        step.kind === 'practice' ? h('p', { class: 'tut-doing' }, '직접 해 보세요') : null,\n",
    tests: ['tests/e2e/tutorial.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.css', what: "the Inspector's empty word at the top of the panel",
    find: '.insp .ibody.is-empty { display: flex; }\n', replace: '', tests: ['tests/e2e/notices.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/panels/ask.ts', what: 'a question closes on a click outside it',
    find: "    dialog.addEventListener('close', () => {", replace: "    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });\n    dialog.addEventListener('close', () => {",
    tests: ['tests/e2e/window.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.css', what: "the tutorial's own Haram stays up behind a question",
    find: 'body.dialog-open .tut-card img.char { visibility: hidden; }\n', replace: '', tests: ['tests/e2e/window.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: "the caption buttons' patch stays white under the tutorial",
    find: "new MutationObserver(updateOverlay).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'open'] });",
    replace: 'void updateOverlay;', tests: ['tests/e2e/window.e2e.ts'] },
  { module: 'near-miss', file: 'src/core/near-miss.ts', what: 'a name two letters off guessed at',
    find: '(length <= 2 ? 0 : length <= 5 ? 1 : 2)', replace: '(length <= 2 ? 0 : 2)', tests: ['tests/core/near-miss.test.ts'] },
  { module: 'near-miss', file: 'src/core/near-miss.ts', what: 'a tie between two names guessed at',
    find: '  return best.length === 1 ? best[0].name : null;', replace: '  return best[0].name;', tests: ['tests/core/near-miss.test.ts'] },
  { module: 'window', file: 'src/renderer/app/panels/registers.ts', what: 'the changed register left out of view',
    find: '    if (first && !this.scrolledByStudent()) this.reveal(this.rows.get(first)!.el);', replace: '', tests: ['tests/e2e/fit.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/panels/registers.ts', what: 'the Registers scrolled from under the student',
    find: '    if (first && !this.scrolledByStudent()) this.reveal', replace: '    if (first) this.reveal', tests: ['tests/e2e/fit.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.css', what: 'the buttons lose their names before their icons',
    find: '.titlebar.noicons .toolbar .btn img { display: none; }', replace: '.titlebar.noicons .toolbar .btn .label { display: none; }',
    tests: ['tests/e2e/fit.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'the tutorial\'s example called Save & Assemble',
    find: "const assembleName = (short: boolean): string => (saves() && !short ? 'Save & Assemble' : 'Assemble');",
    replace: "const assembleName = (short: boolean): string => (!short ? 'Save & Assemble' : 'Assemble');", tests: ['tests/e2e/assemble.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'Save & Assemble kept in a narrow title bar',
    find: "const TITLE_STEPS = ['nokeys', 'noicons', 'short', 'onespeed', 'tighter'] as const;",
    replace: "const TITLE_STEPS = ['nokeys', 'noicons', 'onespeed', 'tighter'] as const;", tests: ['tests/e2e/fit.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'a window made wider keeps its narrow title bar',
    find: "  ?.addEventListener('geometrychange', () => fitTitlebar());", replace: "  ?.addEventListener('geometrychange', () => {});",
    tests: ['tests/e2e/assemble.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'a cancelled save hides the machine it assembled',
    find: "const machineShown = () => assembledText !== null;", replace: "const machineShown = () => assembledText !== null && !dirty;",
    tests: ['tests/e2e/assemble.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'what Ctrl+S did with the file not said after a clean assemble',
    find: "      if (runState === 'ready' && steps === 0 && saveNote) parts.push(span(saveWarn ? 'warn' : '', saveNote));\n", replace: '',
    tests: ['tests/e2e/assemble.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/panels/registers.ts', what: 'the Changed tag only with the roomiest margins',
    find: '    const withTag = badgeStyle(width, COLUMNS, f, TAG, ch, all);',
    replace: '    const withTag = badgeStyle(width, COLUMNS, f, TAG, ch, all.slice(0, 1));', tests: ['tests/e2e/fit.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/panels/registers.ts', what: 'the legend back in the Registers head',
    find: "    this.head = panelHead('Registers');\n", replace: "    this.head = panelHead('Registers');\n    this.head.setMeta('노란 줄은 방금 바뀐 레지스터');\n",
    tests: ['tests/e2e/fit.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'the status bar names one yellow row only',
    find: '    changedNow = [...changedKeys(before, now)];', replace: '    changedNow = [...changedKeys(before, now)].slice(0, 1);',
    tests: ['tests/e2e/fit.e2e.ts'] },
  { module: 'columns', file: 'src/renderer/app/logic/columns.ts', what: 'a badge at the cost of the font\'s pixel',
    find: 'style.scale === 1 && needed(shown, style, ch) <= width', replace: 'needed(shown, style, ch) <= width',
    tests: ['tests/renderer/columns.test.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'the title bar never gives way',
    find: '  const fits = () => tools.getBoundingClientRect().right <= end() + 0.5;', replace: '  const fits = () => true;', tests: ['tests/e2e/fit.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'the program\'s name given up before the file\'s',
    find: "  if (longest()) return;\n  titlebar.classList.add('noapp');", replace: "  titlebar.classList.add('noapp');", tests: ['tests/e2e/fit.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/logic/names.ts', what: 'a long name cut at its end (extension lost)',
    find: '  return `${head}…${ext}`;', replace: '  return `${head}${ext}…`;', tests: ['tests/renderer/names.test.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'a toolbar on the first screen',
    find: '  toolbar.hidden = !open;', replace: '  toolbar.hidden = false;', tests: ['tests/e2e/fit.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.css', what: 'Korean words broken anywhere',
    find: '  word-break: keep-all;', replace: '  word-break: normal;', tests: ['tests/e2e/fit.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/dom.ts', what: 'a word broken before its parenthesis',
    find: "p.text.replace(/([가-힣])\\(/g, '$1\\u2060(')", replace: 'p.text', tests: ['tests/e2e/fit.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'a file name before a particle',
    find: "      body: '이 파일은 저장되어 있습니다. 편집기를 비우고 새 파일을 시작합니다.',",
    replace: "      body: `${file.name} 은 저장되어 있습니다. 편집기를 비우고 새 파일을 시작합니다.`,",
    tests: ['tests/renderer/particles.test.ts'] },
  { module: 'window', file: 'src/core/explain.ts', what: 'a register name before a particle',
    find: "case 'mfhi': return `HI 레지스터 값을 ${reg(rd)} 레지스터에 옮깁니다.`;", replace: "case 'mfhi': return `HI를 ${reg(rd)}에 옮깁니다.`;",
    tests: ['tests/renderer/particles.test.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'errors not listed under the Editor',
    find: '    asmBody.replaceChildren(errorNotice());', replace: '    asmBody.replaceChildren();', tests: ['tests/e2e/fit.e2e.ts'] },
  // ---- the tutorial (docs/PORTING.md 18, 25)
  { module: 'tutorial', file: 'src/renderer/app/tutorial.ts', what: 'only the targets lit, their panels dimmed',
    find: "    this.dim.setAttribute('d', path(lit));", replace: "    this.dim.setAttribute('d', path(merge(rects.list.map((r) => grow(r, 4)))));",
    tests: ['tests/e2e/tutorial.e2e.ts'] },
  { module: 'tutorial', file: 'src/renderer/app/tutorial.ts', what: 'a lit panel takes clicks',
    find: "    this.block.setAttribute('d', path(merge(rects.list.map((r) => grow(r, 4)))));", replace: "    this.block.setAttribute('d', path(lit));",
    tests: ['tests/e2e/tutorial.e2e.ts'] },
  // The card next to what a step is about (2.7.0, docs/PORTING.md 30).
  { module: 'tutorial', file: 'src/renderer/app/tutorial.ts', what: 'the card kept off the lit panels (2.6.0: a toolbar step\'s card under the bar\'s middle)',
    find: '      : place(grown, size, view, keepOff) ?? place(grown, size, view)',
    replace: '      : place([...grown, ...lit], size, view, keepOff) ?? place([...grown, ...lit], size, view)', tests: ['tests/e2e/tutorial.e2e.ts'] },
  { module: 'tutorial', file: 'src/renderer/app/logic/placement.ts', what: 'the card over a target',
    find: '&& targets.every((t) => !intersects(card, t, gap)) &&', replace: '&&', tests: ['tests/renderer/placement.test.ts'] },
  { module: 'tutorial', file: 'src/renderer/app/logic/placement.ts', what: 'the card beside its target, never below or above it',
    find: "    const rows: [Side, number][] = [['below', Math.max(first.bottom + gap, view.top + margin)], ['above', first.top - gap - size.height]];",
    replace: '    const rows: [Side, number][] = [];', tests: ['tests/renderer/placement.test.ts'] },
  { module: 'tutorial', file: 'src/renderer/app/tutorial.ts', what: 'step 20 points at nothing (not the line to fix)',
    find: '    targets: (t) => { const n = t.host.errorLine(); return n ? [lines(t, n)] : []; },', replace: '    targets: () => [],',
    tests: ['tests/e2e/tutorial.e2e.ts'] },
  // The title bar at every font (2.7.0, docs/PORTING.md 30).
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'the title bar not fitted again when the font changes',
    find: '  fitTitlebar(); // the bar\'s words grow with the font', replace: '  // the bar\'s words grow with the font', tests: ['tests/e2e/titlebar.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.css', what: 'the title bar\'s controls as tall as their words',
    find: '.titlebar .btn, .titlebar .seg { height: var(--ctl); line-height: 1; }\n', replace: '', tests: ['tests/e2e/titlebar.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.ts', what: 'no step past the program\'s name (a big font runs off the window)',
    find: '  for (let level = 1; level <= TITLE_LAST.length; level += 1) {', replace: '  for (let level = 1; level <= 0; level += 1) {',
    tests: ['tests/e2e/titlebar.e2e.ts'] },
  { module: 'tutorial', file: 'src/renderer/app/tutorial.ts', what: 'keys a step does not ask for go through',
    find: '      return allowed.has(key) ? false : take();', replace: '      return false;', tests: ['tests/e2e/tutorial.e2e.ts'] },
  { module: 'tutorial', file: 'src/renderer/app/tutorial.ts', what: 'targets left out of view',
    find: '    if (now.reveal && (rects.missing || rects.clipped) &&', replace: '    if (false &&', tests: ['tests/e2e/tutorial.e2e.ts'] },
  { module: 'tutorial', file: 'src/renderer/app/tutorial.ts', what: 'a practice step goes on without showing its result',
    find: '      if (STEPS[this.index].result) { if (!this.result) this.showResult(); return; }\n', replace: '', tests: ['tests/e2e/tutorial.e2e.ts'] },
  { module: 'tutorial', file: 'src/renderer/app/tutorial.ts', what: 'Reset not seen at step 17',
    find: "    done: (_t, s) => (s.kind === 'reset' ? 'next' : null),", replace: '    done: () => null,', tests: ['tests/e2e/tutorial.e2e.ts'] },
  { module: 'tutorial', file: 'src/renderer/app/tutorial.ts', what: '[건너뛰기] never turns up',
    find: 'this.renderCard(); }, 6000);', replace: 'this.renderCard(); }, 600000);', tests: ['tests/e2e/tutorial.e2e.ts'] },
  { module: 'tutorial', file: 'src/renderer/app/tutorial.ts', what: 'Encoding not turned on at step 9',
    find: " t.host.pin(t.addr(ADD)); t.column('text', 'word'); },", replace: ' t.host.pin(t.addr(ADD)); },', tests: ['tests/e2e/tutorial.e2e.ts'] },
  { module: 'tutorial', file: 'src/renderer/app/tutorial.ts', what: 'Haram between the card and the target',
    find: "    this.card.classList.toggle('haram-left', far === 'left');", replace: "    this.card.classList.toggle('haram-left', far !== 'left');", tests: ['tests/e2e/tutorial.e2e.ts'] },
  { module: 'tutorial', file: 'src/renderer/app/app.css', what: 'two Harams on screen',
    find: 'body.tutorial-on img.char:not(.tut-char):not(.modal img.char) { visibility: hidden; }', replace: '', tests: ['tests/e2e/tutorial.e2e.ts'] },
  { module: 'tutorial', file: 'src/renderer/app/app.ts', what: 'the example not read-only',
    find: '  editor.setReadOnly(example !== undefined);', replace: '  editor.setReadOnly(false);', tests: ['tests/e2e/tutorial.e2e.ts'] },
  { module: 'tutorial', file: 'src/renderer/app/app.ts', what: 'unsaved changes not put back',
    find: '      dirty = back.dirty;', replace: '', tests: ['tests/e2e/tutorial.e2e.ts'] },
  { module: 'window', file: 'src/renderer/app/app.css', what: 'a narrow Inspector scrolls sideways',
    find: '@container (max-width: 480px) {\n  .ihead', replace: '@container (max-width: 200px) {\n  .ihead', tests: ['tests/e2e/fit.e2e.ts'] },
  // ---- the first screen's circuit board (src/renderer/startfield/)
  // One mutant for each check in tests/renderer/startfield.test.ts and in
  // tests/e2e/start.e2e.ts: what makes the board look like a board is a
  // constraint, and a constraint nothing notices breaking is not one.
  { module: 'first screen', file: 'src/renderer/app/app.css', what: 'the package no longer square',
    find: 'aspect-ratio: 1; max-width: calc(100vw - 48px);', replace: 'max-width: calc(100vw - 48px);',
    tests: ['tests/renderer/startfield.test.ts', 'tests/e2e/start.e2e.ts'] },
  { module: 'first screen', file: 'src/renderer/startfield/render.ts', what: 'rounded joins: a board drawn as ribbon',
    find: "  ctx.lineJoin = 'miter';        // never 'round': that is what makes ribbons",
    replace: "  ctx.lineJoin = 'round';",
    tests: ['tests/renderer/startfield.test.ts'] },
  { module: 'first screen', file: 'src/renderer/startfield/generate.ts', what: 'a chamfer that is not at 45 deg',
    find: '    const ci = Math.min(chamfer, li / 2), co = Math.min(chamfer, lo / 2);',
    replace: '    const ci = Math.min(chamfer, li / 2), co = Math.min(chamfer * 2, lo / 2);',
    tests: ['tests/renderer/startfield.test.ts'] },
  { module: 'first screen', file: 'src/renderer/startfield/generate.ts', what: 'no pad where a trace ends',
    find: "  for (const p of paths) padAt(p.points[p.points.length - 1], p.layer, 'end', p.id);", replace: '',
    tests: ['tests/renderer/startfield.test.ts'] },
  { module: 'first screen', file: 'src/renderer/startfield/generate.ts', what: 'none of the pads that join nothing',
    find: '  const wantPads = Math.round((width * height) / PAD_AREA);', replace: '  const wantPads = 0;',
    tests: ['tests/renderer/startfield.test.ts'] },
  { module: 'first screen', file: 'src/renderer/startfield/render.ts', what: 'the light drawn over instead of added',
    find: "  // ---- light, added ------------------------------------------------------\n  ctx.globalCompositeOperation = 'lighter';",
    replace: "  ctx.globalCompositeOperation = 'source-over';",
    tests: ['tests/renderer/startfield.test.ts'] },
  { module: 'first screen', file: 'src/renderer/startfield/generate.ts', what: 'a near line wider than the board allows',
    find: '  { width: 2.0, alpha: 0.92, share: 0.20 },', replace: '  { width: 4.0, alpha: 0.92, share: 0.20 },',
    tests: ['tests/renderer/startfield.test.ts'] },
  { module: 'first screen', file: 'src/renderer/startfield/generate.ts', what: 'the pins not put on the grid',
    find: '      let line = Math.round(along / grid);', replace: '      let line = along / grid;',
    tests: ['tests/renderer/startfield.test.ts'] },
  { module: 'first screen', file: 'src/renderer/startfield/generate.ts', what: 'traces allowed to run over one another',
    find: '    if (this.takenVertex(ni, nj)) return false;', replace: '    if (false) return false;',
    tests: ['tests/renderer/startfield.test.ts'] },
  { module: 'first screen', file: 'src/renderer/startfield/generate.ts', what: 'two diagonals allowed to cross in a cell',
    find: '    if (d.x !== 0 && d.y !== 0 && !this.diagonalFree(i, j, d)) return false;', replace: '',
    tests: ['tests/renderer/startfield.test.ts'] },
  { module: 'first screen', file: 'src/renderer/startfield/generate.ts', what: 'the corners of the package given pins too',
    find: 'const PIN_BARE_ENDS = 0.12;', replace: 'const PIN_BARE_ENDS = 0;',
    tests: ['tests/renderer/startfield.test.ts'] },
  { module: 'first screen', file: 'src/renderer/startfield/generate.ts', what: 'every trace given the same time whatever its length',
    find: '    p.durationMs = p.length / (speed * p.speedMul);', replace: '    p.durationMs = SPEED_FITS_IN;',
    tests: ['tests/renderer/startfield.test.ts'] },
  { module: 'first screen', file: 'src/renderer/startfield/generate.ts', what: 'the board no longer settled by its seed',
    find: '  const rand = rng(seed);', replace: '  const rand = Math.random;',
    tests: ['tests/renderer/startfield.test.ts'] },
  { module: 'first screen', file: 'src/renderer/startfield/generate.ts', what: 'the pins put on a fixed rectangle, not on the card',
    find: '  const pins = pinsOf(card, GRID);',
    replace: '  const pins = pinsOf({ x: 100, y: 100, width: 400, height: 400 }, GRID);',
    tests: ['tests/renderer/startfield.test.ts'] },
  { module: 'first screen', file: 'src/renderer/startfield/generate.ts', what: 'the three depths left to chance instead of dealt',
    find: '    for (const L of [1, 2] as Layer[]) if (got[L] / target[L] < got[pick] / target[pick]) pick = L;',
    replace: '    pick = 2;',
    tests: ['tests/renderer/startfield.test.ts'] },
  { module: 'first screen', file: 'src/renderer/startfield/index.ts', what: 'the board measured through the package\'s entrance transform',
    find: '    const box = { width: el.offsetWidth, height: el.offsetHeight,\n                  x: r.x + r.width / 2 - el.offsetWidth / 2, y: r.y + r.height / 2 - el.offsetHeight / 2 };',
    replace: '    const box = r;',
    tests: ['tests/e2e/start.e2e.ts'] },
  { module: 'first screen', file: 'src/renderer/app/app.css', what: 'the package no darker than the board around it',
    find: '  background: #050505; border: 2.5px solid #fff;', replace: '  background: #0d0d0d; border: 2.5px solid #fff;',
    tests: ['tests/e2e/start.e2e.ts'] },
  { module: 'first screen', file: 'src/renderer/app/app.css', what: 'the way back below 4.5:1 on the package',
    find: 'height: 18px; color: #8a8a8a; text-align: center; }', replace: 'height: 18px; color: #6a6a6a; text-align: center; }',
    tests: ['tests/e2e/start.e2e.ts'] },
  // ---- the board's brightness, its timing, and what is left moving
  // Measured off the board's own pixels (tests/e2e/board-measure.ts), at the
  // window it was tuned at: each of these is a band the measurement has to
  // land in, and a mutant that walks it out of one.
  { module: 'first screen', file: 'src/renderer/startfield/generate.ts', what: 'the three depths back at the alphas that made a board of scratches on black',
    find: '  { width: 1.0, alpha: 0.28, share: 0.40 },\n  { width: 1.5, alpha: 0.62, share: 0.40 },\n  { width: 2.0, alpha: 0.92, share: 0.20 },',
    replace: '  { width: 1.0, alpha: 0.10, share: 0.40 },\n  { width: 1.5, alpha: 0.22, share: 0.40 },\n  { width: 2.0, alpha: 0.55, share: 0.20 },',
    tests: ['tests/e2e/start.e2e.ts'] },
  { module: 'first screen', file: 'src/renderer/startfield/render.ts', what: 'no ambient haze: the board back to lines on black',
    find: '    ctx.globalAlpha = hazeIn;\n    ctx.fillStyle = haze;\n    ctx.fillRect(0, 0, g.width, g.height);',
    replace: '    ctx.globalAlpha = hazeIn;',
    tests: ['tests/e2e/start.e2e.ts'] },
  { module: 'first screen', file: 'src/renderer/startfield/generate.ts', what: 'the flares back to twelve: almost no near-white left on the board',
    find: 'const FLARES_MIN = 22, FLARES_MAX = 30;', replace: 'const FLARES_MIN = 12, FLARES_MAX = 12;',
    tests: ['tests/e2e/start.e2e.ts', 'tests/renderer/startfield.test.ts'] },
  { module: 'first screen', file: 'src/renderer/startfield/generate.ts', what: 'every trace at one rate: the opening lands all at once',
    find: '    p.speedMul = SPEED_MUL.min + rand() * (SPEED_MUL.max - SPEED_MUL.min);', replace: '    p.speedMul = 1;',
    tests: ['tests/e2e/start.e2e.ts', 'tests/renderer/startfield.test.ts'] },
  { module: 'first screen', file: 'src/renderer/startfield/generate.ts', what: 'no distance stagger: the far corners arrive with the pins',
    find: 'const DIST_DELAY = 6800;', replace: 'const DIST_DELAY = 0;',
    tests: ['tests/e2e/start.e2e.ts', 'tests/renderer/startfield.test.ts'] },
  { module: 'first screen', file: 'src/renderer/startfield/index.ts', what: 'nothing left moving: no layer above the board',
    find: '    drawPulse(upper, geo, t);', replace: '',
    tests: ['tests/e2e/start.e2e.ts'] },
  { module: 'first screen', file: 'src/renderer/startfield/index.ts', what: 'the board below redrawn every frame for as long as the window is open',
    find: '    if (drawnAt < geo.grownMs || t < drawnAt) {', replace: '    if (true) {',
    tests: ['tests/e2e/start.e2e.ts'] },
  { module: 'first screen', file: 'src/renderer/startfield/generate.ts', what: 'twice the traces -- brightness answered with more lines',
    find: 'const DECOR_AREA = 7000;', replace: 'const DECOR_AREA = 3500;',
    tests: ['tests/renderer/startfield.test.ts'] },
  // ---- what the package carries (2.8.0): the mark, the name, the two ways in
  { module: 'first screen', file: 'src/renderer/app/panels/welcome.ts', what: 'a sentence back on the package',
    find: "    h('div', { class: 'wstack' },\n      h('img', { class: 'wlogo',",
    replace: "    h('div', { class: 'wstack' },\n      h('p', {}, 'MIPS 어셈블리를 쓰고, 한 줄씩 실행해 보는 곳입니다.'),\n      h('img', { class: 'wlogo',",
    tests: ['tests/e2e/start.e2e.ts'] },
  { module: 'first screen', file: 'src/renderer/app/panels/welcome.ts', what: 'the die marking back on the package',
    find: "      h('div', { class: 'wbody' }, actions, back)));",
    replace: "      h('div', { class: 'wbody' }, actions, back),\n      h('span', { class: 'die' }, 'MIPS32')));",
    tests: ['tests/e2e/start.e2e.ts'] },
  { module: 'first screen', file: 'src/renderer/app/panels/welcome.ts', what: 'the package carrying a name that is not the product\'s',
    find: "export const WORDMARK = 'Hallym MIPS Simulator';", replace: "export const WORDMARK = 'Hallym MIPS';",
    tests: ['tests/e2e/start.e2e.ts'] },
  { module: 'first screen', file: 'src/renderer/app/app.css', what: 'the column upside down: the two ways in above the mark',
    find: '.wstack { position: absolute; inset: 18px; display: flex; flex-direction: column;',
    replace: '.wstack { position: absolute; inset: 18px; display: flex; flex-direction: column-reverse;',
    tests: ['tests/e2e/start.e2e.ts'] },
  { module: 'first screen', file: 'src/renderer/app/app.css', what: 'the mark back at the size it was beside the name',
    find: '.wlogo { height: 60px; width: auto; margin: 0 auto; }', replace: '.wlogo { height: 26px; width: auto; margin: 0 auto; }',
    tests: ['tests/e2e/start.e2e.ts'] },
  { module: 'first screen', file: 'src/renderer/app/app.css', what: 'the mark pushed off the middle of the package',
    find: '.wstack { position: absolute; inset: 18px; display: flex; flex-direction: column; justify-content: center; align-items: center;',
    replace: '.wstack { position: absolute; inset: 18px; display: flex; flex-direction: column; justify-content: center; align-items: flex-start;',
    tests: ['tests/e2e/start.e2e.ts'] },
  { module: 'first screen', file: 'src/renderer/app/app.css', what: 'the two ways in out to the die frame\'s edge',
    find: '.wbody { display: flex; flex-direction: column; width: 70%; margin-top: var(--gap-ways); }',
    replace: '.wbody { display: flex; flex-direction: column; width: 100%; margin-top: var(--gap-ways); }',
    tests: ['tests/e2e/start.e2e.ts'] },
  { module: 'first screen', file: 'src/renderer/app/app.css', what: 'the column too tall for the die frame (the gaps doubled)',
    find: '  --gap-name: 14px; --gap-ways: 40px; --gap-between: 12px; }',
    replace: '  --gap-name: 28px; --gap-ways: 80px; --gap-between: 24px; }',
    tests: ['tests/e2e/start.e2e.ts'] },
  // ---- the hierarchy the card is read in, on all three of its axes
  { module: 'first screen', file: 'src/renderer/app/app.css', what: 'the two ways in dressed as each other',
    find: '  border: 1px solid rgba(255,255,255,.28); border-radius: 6px; background: #0a0a0a; }\n'
      + '.action b { color: rgba(255,255,255,.82); font-weight: 600; }\n'
      + '.action.main { border-color: rgba(255,255,255,.55); background: #141414; }\n'
      + '.action.main b { color: #fff; }',
    replace: '  border: 1px solid rgba(255,255,255,.55); border-radius: 6px; background: #141414; }\n'
      + '.action b { color: #fff; font-weight: 600; }\n'
      + '.action.main { border-color: rgba(255,255,255,.28); background: #0a0a0a; }\n'
      + '.action.main b { color: rgba(255,255,255,.82); }',
    tests: ['tests/e2e/start.e2e.ts'] },
  { module: 'first screen', file: 'src/renderer/app/panels/spark.ts', what: 'every light on the card as bright as every other',
    find: '  title: { periodMs: 3500, peak: 1.0 },\n  primary: { periodMs: 5000, peak: 0.85 },\n  secondary: { periodMs: 8000, peak: 0.55 },',
    replace: '  title: { periodMs: 3500, peak: 1.0 },\n  primary: { periodMs: 5000, peak: 1.0 },\n  secondary: { periodMs: 8000, peak: 1.0 },',
    tests: ['tests/e2e/start.e2e.ts', 'tests/renderer/spark.test.ts'] },
  { module: 'first screen', file: 'src/renderer/app/panels/spark.ts', what: 'every light on the card as often as every other',
    find: '  title: { periodMs: 3500, peak: 1.0 },\n  primary: { periodMs: 5000, peak: 0.85 },\n  secondary: { periodMs: 8000, peak: 0.55 },\n} as const;',
    replace: '  title: { periodMs: 3500, peak: 1.0 },\n  primary: { periodMs: 3500, peak: 0.85 },\n  secondary: { periodMs: 3500, peak: 0.55 },\n} as const;',
    tests: ['tests/renderer/spark.test.ts'] },
  { module: 'first screen', file: 'src/renderer/app/app.css', what: 'a border light that loops in CSS (and so is in no picture of the screen)',
    find: "  box-sizing: border-box; filter: blur(.7px);",
    replace: "  box-sizing: border-box; filter: blur(.7px); animation: sp-run 2s linear infinite;",
    tests: ['tests/renderer/spark.test.ts'] },
  { module: 'first screen', file: 'src/renderer/app/panels/welcome.ts', what: 'the card lit although motion is turned down',
    find: '    const now = calm.matches ? -1 : t;', replace: '    const now = t;',
    tests: ['tests/e2e/start.e2e.ts'] },
  // ---- and that none of it outlives the first screen
  { module: 'first screen', file: 'src/renderer/startfield/index.ts', what: 'the canvases left in the document after the first screen',
    find: '    board.remove();\n    pulse.remove();\n', replace: '',
    tests: ['tests/e2e/start.e2e.ts'] },
  { module: 'first screen', file: 'src/renderer/startfield/index.ts', what: 'the board held on to after the first screen',
    find: '    geo = undefined;\n    drawnAt = -1;', replace: '    drawnAt = -1;',
    tests: ['tests/e2e/start.e2e.ts'] },
  // ---- the executable image (.hmx: src/core/hmx.ts, src/sim/image.ts)
  { module: 'hmx', file: 'src/core/hmx.ts', what: '.text written at the wrong address',
    find: 'lines.push(`.text ${hex32(text.addr)} words', replace: 'lines.push(`.text ${hex32(text.addr + 4)} words', tests: ['tests/sim/hmx.test.ts'] },
  { module: 'hmx', file: 'src/core/hmx.ts', what: '.data with the wrong count',
    find: 'bytes ${data.bytes.length}`', replace: 'bytes ${data.bytes.length - 1}`', tests: ['tests/sim/hmx.test.ts'] },
  { module: 'hmx', file: 'src/sim/image.ts', what: 'the byte order the other way round',
    find: "endian: little ? 'little' : 'big',", replace: "endian: little ? 'big' : 'little',", tests: ['tests/sim/hmx.test.ts'] },
  { module: 'hmx', file: 'src/renderer/app/app.ts', what: "the hash (and image) of the Editor's text, not of the assembled program",
    find: 'api.exportImage({ source: good.source,', replace: 'api.exportImage({ source: editor.text(),', tests: ['tests/e2e/export.e2e.ts'] },
  { module: 'hmx', file: 'src/sim/image.ts', what: 'the start-up code left out of .text',
    find: '.filter((w) => w.addr >= seg.textBot && w.addr < seg.textTop);', replace: '.filter((w) => w.addr >= seg.textBot + 0x24 && w.addr < seg.textTop);', tests: ['tests/sim/hmx.test.ts'] },
  { module: 'hmx', file: 'src/sim/image.ts', what: "the handler's labels listed as the program's",
    find: 'const own = listed.filter((s) => !handlerNames.has(s.name) &&', replace: 'const own = listed.filter((s) =>', tests: ['tests/sim/hmx.test.ts'] },
  { module: 'hmx', file: 'src/sim/image.ts', what: 'entry written as 0x00400024 whatever the program',
    find: 'entry: main.address >>> 0,', replace: 'entry: 0x00400024,', tests: ['tests/sim/hmx.test.ts', 'tests/e2e/settings.e2e.ts'] },
  { module: 'hmx', file: 'src/sim/image.ts', what: 'a trailing .space left out of .data',
    find: 'let lo = r.data.start, hi = r.data.end;', replace: 'let lo = r.data.start, hi = r.data.start;', tests: ['tests/sim/hmx.test.ts'] },
  { module: 'hmx', file: 'src/renderer/app/app.ts', what: 'Export before anything is assembled',
    find: '  bExport.disabled = lastGood === null || busy;', replace: '  bExport.disabled = busy;', tests: ['tests/e2e/export.e2e.ts'] },
];

function copyTree(dir: string, linkBuild: boolean): void {
  for (const d of ['src', 'tests', 'tools']) cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  for (const f of ['package.json', 'tsconfig.json', 'playwright.config.ts']) cpSync(path.join(root, f), path.join(dir, f));
  for (const f of ['LICENSE', 'NOTICE']) cpSync(path.join(root, '..', f), path.join(dir, '..', f)); // the repository's
  // The .hmx specification, whose example tests/sim/hmx.test.ts compares with a golden (the repository's docs/).
  cpSync(path.join(root, '..', 'docs/hmx-format.md'), path.join(dir, '..', 'docs/hmx-format.md'));
  cpSync(path.join(root, 'native'), path.join(dir, 'native'), {
    recursive: true, filter: (from) => !from.startsWith(path.join(root, 'native', 'build')),
  });
  if (linkBuild) symlinkSync(path.join(root, 'native', 'build'), path.join(dir, 'native', 'build'));
  symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'));
  // The repository's one CPU/, beside the copy as it is beside electron/.
  symlinkSync(path.join(root, '..', 'CPU'), path.join(dir, '..', 'CPU'));
}

// ---- which mutants ------------------------------------------------------------------------

const repo = path.join(root, '..');
const BASELINE = path.join(root, 'tools/mutants-baseline.json');
const keyOf = (m: Mutant): string => `${m.module}: ${m.what}`;

interface Baseline { sha: string; date: string; killed: number; run?: string; mutants: string[] }

// Every mutant's `find` exactly once in its `file` (text only): the mutants
// that do not apply any more, with how often their text occurs.
function staleFinds(dir: string): { m: Mutant; count: number }[] {
  const out: { m: Mutant; count: number }[] = [];
  for (const m of MUTANTS) {
    const file = path.join(dir, m.file);
    const count = existsSync(file) ? readFileSync(file, 'utf8').split(m.find).length - 1 : 0;
    if (count !== 1) out.push({ m, count });
  }
  return out;
}

// The repository's paths changed since `sha`: committed, staged, unstaged,
// untracked.  git status -z gives "XY path\0", and for a rename or copy
// "XY new\0old\0": both paths count.
function changedSince(repoDir: string, sha: string): Set<string> {
  const git = (args: string[]) => execFileSync('git', ['-C', repoDir, ...args], { encoding: 'utf8', maxBuffer: 64 << 20 });
  const files = new Set<string>();
  for (const f of git(['diff', '--name-only', '-z', `${sha}..HEAD`]).split('\0')) if (f) files.add(f);
  const records = git(['status', '--porcelain=v1', '-z', '--untracked-files=all']).split('\0');
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (!r) continue;
    files.add(r.slice(3));
    if (r[0] === 'R' || r[0] === 'C') { i += 1; if (records[i]) files.add(records[i]); }
  }
  return files;
}

interface Picked { m: Mutant; why: string[] }
type Selection =
  | { all: true; reason: string }
  | { all: false; baseline: Baseline; changed: Set<string>; run: Picked[]; skipped: Mutant[] };

// What --changed runs, from the baseline at `baselineFile` and the changes in
// `repoDir` (whose electron/ holds the mutants' files).  Any doubt: all of them.
function select(repoDir: string, baselineFile: string): Selection {
  const electronDir = path.join(repoDir, 'electron');
  let baseline: Baseline;
  try {
    baseline = JSON.parse(readFileSync(baselineFile, 'utf8')) as Baseline;
  } catch (e) {
    return { all: true, reason: `no baseline to go from (${path.relative(repo, baselineFile)}: ${(e as Error).message})` };
  }
  if (!/^[0-9a-f]{40}$/.test(baseline.sha ?? '') || !Array.isArray(baseline.mutants)) {
    return { all: true, reason: `${path.relative(repo, baselineFile)} has no commit or no list of mutants` };
  }
  try {
    execFileSync('git', ['-C', repoDir, 'merge-base', '--is-ancestor', baseline.sha, 'HEAD'], { stdio: 'ignore' });
  } catch {
    return { all: true, reason: `the baseline commit ${baseline.sha.slice(0, 7)} is not an ancestor of HEAD` };
  }
  let changed: Set<string>;
  try {
    changed = changedSince(repoDir, baseline.sha);
  } catch (e) {
    return { all: true, reason: `git did not give the changes since ${baseline.sha.slice(0, 7)}: ${(e as Error).message.split('\n')[0]}` };
  }
  for (const m of MUTANTS) {
    for (const f of [m.file, ...m.tests]) {
      if (!existsSync(path.join(electronDir, f))) return { all: true, reason: `${keyOf(m)}: ${f} does not exist` };
    }
  }
  const known = new Set(baseline.mutants);
  const run: Picked[] = [], skipped: Mutant[] = [];
  for (const m of MUTANTS) {
    const why: string[] = [];
    if (!known.has(keyOf(m))) why.push('new since the baseline');
    if (changed.has(`electron/${m.file}`)) why.push(`file ${m.file} changed`);
    for (const t of m.tests) if (changed.has(`electron/${t}`)) why.push(`test ${t} changed`);
    if (why.length) run.push({ m, why }); else skipped.push(m);
  }
  return { all: false, baseline, changed, run, skipped };
}

// ---- running them ----------------------------------------------------------------------------

interface Result { key: string; module: string; what: string; rebuild: boolean; result: 'killed' | 'survived' | 'not applied' | 'error'; seconds: number; by: string }

function run(cmd: string, args: string[], cwd: string, timeout: number): Promise<{ status: number | null; stdout: string }> {
  return new Promise((done) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', () => {});
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.on('close', (status) => { clearTimeout(timer); done({ status, stdout }); });
  });
}

// The command for tests of one kind (all *.e2e.ts, or none); e2e ones on
// their own display when this is Linux and there is none, or more than one
// worker runs.
function testCommand(tests: string[], display: number | null): [string, string[]] {
  const e2e = tests[0].endsWith('.e2e.ts');
  const args = e2e
    ? [path.join(root, 'node_modules/@playwright/test/cli.js'), 'test', ...tests]
    : ['--test', '--import', './tests/helpers/timer-at-exit.ts', '--test-reporter=tap', ...tests];
  if (e2e && display !== null) return ['xvfb-run', ['-n', String(display), '-s', '-screen 0 2400x1400x24', process.execPath, ...args]];
  return [process.execPath, args];
}

async function runOne(m: Mutant, display: number | null): Promise<Result> {
  const started = Date.now();
  const result = (r: Result['result'], by: string): Result =>
    ({ key: keyOf(m), module: m.module, what: m.what, rebuild: !!m.rebuild, result: r, seconds: Math.round((Date.now() - started) / 100) / 10, by });
  const outer = mkdtempSync(path.join(os.tmpdir(), 'mutant-'));
  const dir = path.join(outer, 'electron');
  mkdirSync(dir);
  try {
    copyTree(dir, !m.rebuild);
    const file = path.join(dir, m.file);
    const text = readFileSync(file, 'utf8');
    const count = text.split(m.find).length - 1;
    if (count !== 1) return result('not applied', `found ${count} times`);
    writeFileSync(file, text.replace(m.find, m.replace));
    if (m.rebuild) {
      const b = await run(path.join(root, 'node_modules/.bin/node-gyp'), ['rebuild', '--directory', path.join(dir, 'native')], dir, 900000);
      if (b.status !== 0) return result('error', 'the addon did not build');
    }
    // Unit tests (node --test) first, then e2e ones (Playwright): a list may name both.
    const unit = m.tests.filter((t) => !t.endsWith('.e2e.ts')), e2e = m.tests.filter((t) => t.endsWith('.e2e.ts'));
    if (e2e.length) {
      const b = await run(process.execPath, ['tools/build-ui.ts'], dir, 120000);
      if (b.status !== 0) return result('error', 'the window script did not bundle');
    }
    for (const tests of [unit, e2e]) {
      if (!tests.length) continue;
      const isE2e = tests === e2e;
      const [cmd, args] = testCommand(tests, isE2e ? display : null);
      const t = await run(cmd, args, dir, 300000);
      if (t.status !== 0) {
        const first = (isE2e ? /^\s*\d+\) (.*)$/m.exec(t.stdout)?.[1]?.replace(/─+$/, '').trim()
                             : /^\s*not ok \d+ - (.*)$/m.exec(t.stdout)?.[1]) ?? '(no test reported a failure)';
        return result('killed', first);
      }
    }
    return result('survived', '');
  } finally {
    rmSync(outer, { recursive: true, force: true });
  }
}

// The selection's tests with no mutant: they must pass, or a kill says nothing.
async function control(list: Mutant[], display: number | null): Promise<string | null> {
  const unit = [...new Set(list.flatMap((m) => m.tests).filter((t) => !t.endsWith('.e2e.ts')))];
  const e2e = [...new Set(list.flatMap((m) => m.tests).filter((t) => t.endsWith('.e2e.ts')))];
  const outer = mkdtempSync(path.join(os.tmpdir(), 'mutant-control-'));
  const dir = path.join(outer, 'electron');
  mkdirSync(dir);
  try {
    copyTree(dir, true);
    for (const tests of [unit, e2e]) {
      if (!tests.length) continue;
      if (tests === e2e) await run(process.execPath, ['tools/build-ui.ts'], dir, 120000);
      const [cmd, args] = testCommand(tests, tests === e2e ? display : null);
      const t = await run(cmd, args, dir, 3600000);
      if (t.status !== 0) {
        const first = (/^\s*\d+\) (.*)$/m.exec(t.stdout)?.[1] ?? /^\s*not ok \d+ - (.*)$/m.exec(t.stdout)?.[1] ?? '').trim();
        return `${tests.length} test file(s) fail with no mutant${first ? `: ${first}` : ''}`;
      }
    }
    return null;
  } finally {
    rmSync(outer, { recursive: true, force: true });
  }
}

// `jobs` at a time; those that rebuild the addon one at a time, after.
async function runAll(list: Mutant[], jobs: number, displays: boolean): Promise<Result[]> {
  const results: Result[] = [];
  const say = (r: Result) => console.log(`${r.result.padEnd(12)} ${r.key}${r.by ? `  <-  ${r.by}` : ''}  (${r.seconds} s)`);
  const pool = async (items: Mutant[], width: number) => {
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(width, items.length) }, async (_, w) => {
      for (let i = next++; i < items.length; i = next++) {
        const r = await runOne(items[i], displays ? 120 + w : null);
        results.push(r);
        say(r);
      }
    }));
  };
  await pool(list.filter((m) => !m.rebuild), jobs);
  await pool(list.filter((m) => m.rebuild), 1);
  const order = new Map(list.map((m, i) => [keyOf(m), i]));
  return results.sort((a, b) => order.get(a.key)! - order.get(b.key)!);
}

// ---- the selector's own checks ------------------------------------------------------------

// In a temporary worktree of HEAD (removed after; nothing in this tree is
// touched): the baseline HEAD itself picks nothing; a blank line added to one
// mutant's file picks exactly the mutants that name that file; a blank line
// added to a test file that is no mutant's `file` (the one running most
// mutants on other files) picks exactly those that run it.
function verifySelector(): boolean {
  const wt = mkdtempSync(path.join(os.tmpdir(), 'mutants-selector-'));
  let ok = true;
  const check = (what: string, got: Selection, want: Mutant[]) => {
    if (got.all) { console.log(`FAIL  ${what}: fell back to all (${got.reason})`); ok = false; return; }
    const g = got.run.map((p) => keyOf(p.m)).sort(), w = want.map(keyOf).sort();
    const same = g.length === w.length && g.every((k, i) => k === w[i]);
    console.log(`${same ? 'PASS' : 'FAIL'}  ${what}: picked ${g.length}${g.length ? `:\n        ${g.join('\n        ')}` : ''}`);
    if (!same) { console.log(`      expected ${w.length}: ${w.join('; ')}`); ok = false; }
  };
  try {
    execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'ignore' });
    const head = execFileSync('git', ['-C', wt, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const base = path.join(os.tmpdir(), `mutants-baseline-${process.pid}.json`); // outside the worktree: not a change
    writeFileSync(base, JSON.stringify({ sha: head, date: new Date().toISOString(), killed: MUTANTS.length, mutants: MUTANTS.map(keyOf) }));
    check('1. the baseline commit itself, nothing changed', select(wt, base), []);
    const target = MUTANTS[0].file;                        // src/core/decoder.ts
    const f = path.join(wt, 'electron', target);
    writeFileSync(f, readFileSync(f, 'utf8') + '\n');
    check(`2. a blank line added to ${target}`, select(wt, base), MUTANTS.filter((m) => m.file === target || m.tests.includes(target)));
    execFileSync('git', ['-C', wt, 'checkout', '--', `electron/${target}`]);
    // The test file that is no mutant's `file` and runs the most mutants on other files than check 2's.
    const files = new Set(MUTANTS.map((m) => m.file));
    const uses = new Map<string, number>();
    for (const m of MUTANTS) if (m.file !== target) for (const t of m.tests) if (!files.has(t)) uses.set(t, (uses.get(t) ?? 0) + 1);
    const test = [...uses].sort((a, b) => b[1] - a[1])[0][0];
    const t = path.join(wt, 'electron', test);
    writeFileSync(t, readFileSync(t, 'utf8') + '\n');
    check(`3. a blank line added to ${test} (a test file only)`, select(wt, base), MUTANTS.filter((m) => m.tests.includes(test)));
    rmSync(base, { force: true });
  } finally {
    execFileSync('git', ['-C', repo, 'worktree', 'remove', '--force', wt], { stdio: 'ignore' });
  }
  return ok;
}

// ---- the command line -------------------------------------------------------------------

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  allowNegative: true, // --no-control
  options: {
    changed: { type: 'boolean', default: false },
    list: { type: 'boolean', default: false },
    check: { type: 'boolean', default: false },
    control: { type: 'boolean', default: true },
    jobs: { type: 'string' },
    shard: { type: 'string' },
    json: { type: 'string' },
    merge: { type: 'string' },
    'baseline-from': { type: 'string' },
    run: { type: 'string' },
    'verify-selector': { type: 'boolean', default: false },
  },
});

if (opt['verify-selector']) process.exit(verifySelector() ? 0 : 1);

if (opt.merge) {
  // --merge OUT IN...: every mutant exactly once, and killed.
  const parts = positionals.map((f) => JSON.parse(readFileSync(f, 'utf8')) as { sha: string; results: Result[] });
  const all = parts.flatMap((p) => p.results);
  const shas = new Set(parts.map((p) => p.sha));
  const seen = new Map<string, number>();
  for (const r of all) seen.set(r.key, (seen.get(r.key) ?? 0) + 1);
  const missing = MUTANTS.map(keyOf).filter((k) => !seen.has(k));
  const twice = [...seen].filter(([, n]) => n > 1).map(([k]) => k);
  const notKilled = all.filter((r) => r.result !== 'killed');
  const merged = { sha: [...shas].join(','), date: new Date().toISOString(), total: MUTANTS.length, killed: all.filter((r) => r.result === 'killed').length,
                   seconds: Math.round(all.reduce((n, r) => n + r.seconds, 0)), results: all };
  writeFileSync(opt.merge, JSON.stringify(merged, null, 1));
  const lines = [`## Mutants: ${merged.killed} of ${MUTANTS.length} killed`, '', `commit ${merged.sha}; ${parts.length} shard(s); ${merged.seconds} s of mutant time`, '',
    '| Mutant | Result | Seconds | Killed by |', '|---|---|---|---|',
    ...all.map((r) => `| ${r.key.replace(/\|/g, '\\|')} | ${r.result} | ${r.seconds} | ${r.by.replace(/\|/g, '\\|').slice(0, 120)} |`)];
  console.log(lines.join('\n'));
  const bad = [shas.size !== 1 ? `the shards ran on different commits: ${[...shas].join(', ')}` : '',
    missing.length ? `not run: ${missing.join('; ')}` : '', twice.length ? `run twice: ${twice.join('; ')}` : '',
    notKilled.length ? `not killed: ${notKilled.map((r) => `${r.key} (${r.result})`).join('; ')}` : ''].filter(Boolean);
  for (const b of bad) console.error(`FAIL  ${b}`);
  process.exit(bad.length ? 1 : 0);
}

if (opt['baseline-from']) {
  // A green, complete full pass -> the baseline record, printed (committed by hand).
  const merged = JSON.parse(readFileSync(opt['baseline-from'], 'utf8')) as { sha: string; results: Result[] };
  const killed = merged.results.filter((r) => r.result === 'killed').map((r) => r.key);
  const missing = MUTANTS.map(keyOf).filter((k) => !killed.includes(k));
  if (!/^[0-9a-f]{40}$/.test(merged.sha) || missing.length) {
    console.error(`not a baseline: ${missing.length ? `not killed there: ${missing.join('; ')}` : `commit ${merged.sha}`}`);
    process.exit(1);
  }
  const date = execFileSync('git', ['-C', repo, 'show', '-s', '--format=%cI', merged.sha], { encoding: 'utf8' }).trim();
  console.log(JSON.stringify({ sha: merged.sha, date, killed: killed.length, run: opt.run, mutants: killed.sort() }, null, 1));
  process.exit(0);
}

// --check, and before every run: a mutant that no longer applies stops everything.
const stale = staleFinds(root);
for (const { m, count } of stale) console.error(`STALE        ${keyOf(m)}: its find occurs ${count} times in ${m.file}`);
console.log(`find: ${MUTANTS.length - stale.length} of ${MUTANTS.length} mutants apply (their text once in their file)`);
if (stale.length) process.exit(1);
if (opt.check) process.exit(0);

let list = MUTANTS.filter((m) => `${m.module} ${m.what}`.includes(positionals[0] ?? ''));
if (!list.length) { console.error(`no mutant's "module what" holds "${positionals[0]}"`); process.exit(1); }
if (opt.changed) {
  const sel = select(repo, BASELINE);
  if (sel.all) {
    console.log(`ALL          ${sel.reason}: every mutant runs`);
  } else {
    const b = sel.baseline;
    console.log(`baseline     ${b.sha} (${b.date}; ${b.killed} killed${b.run ? `; ${b.run}` : ''})`);
    console.log(`changes      ${sel.changed.size} files since then (committed, staged, unstaged, untracked)`);
    console.log(`to run       ${sel.run.length}`);
    for (const p of sel.run) console.log(`  run        ${keyOf(p.m)}  <-  ${p.why.join('; ')}`);
    console.log(`skipped      ${sel.skipped.length}: file and tests unchanged since ${b.sha.slice(0, 7)}, killed there`);
    for (const m of sel.skipped) console.log(`  skip       ${keyOf(m)}  (${[m.file, ...m.tests].join(', ')})`);
    // Checked again, now, against the same change set: a skipped mutant with a changed file is a bug here.
    const leak = sel.skipped.filter((m) => [m.file, ...m.tests].some((f) => sel.changed.has(`electron/${f}`)));
    if (leak.length) {
      for (const m of leak) console.error(`FAIL         skipped although changed: ${keyOf(m)}`);
      process.exit(1);
    }
    console.log(`PASS         no skipped mutant has its file or a test among the ${sel.changed.size} changed files`);
    const chosen = new Set(sel.run.map((p) => p.m));
    list = list.filter((m) => chosen.has(m));
  }
}
if (opt.shard) {
  const [i, n] = opt.shard.split('/').map(Number);
  if (!(n >= 1 && i >= 1 && i <= n)) throw new Error(`--shard ${opt.shard}: I/N with 1 <= I <= N`);
  // Round-robin, the addon-rebuilding ones apart, so each part gets its share of both.
  const deal = (xs: Mutant[]) => xs.filter((_, k) => k % n === i - 1);
  list = [...deal(list.filter((m) => !m.rebuild)), ...deal(list.filter((m) => m.rebuild))];
  console.log(`shard        ${i}/${n}: ${list.length} mutants`);
}

if (opt.list) {
  for (const m of list) console.log(`  would run  ${keyOf(m)}`);
  console.log(`${list.length} would run`);
  process.exit(0);
}
const jobs = opt.jobs ? Number(opt.jobs) : Math.max(1, Math.min(6, Math.floor(os.cpus().length / 3)));
const displays = process.platform === 'linux' && (jobs > 1 || !process.env.DISPLAY);
console.log(`running      ${list.length} mutants, ${jobs} at a time${displays ? ' (each on its own display)' : ''}`);
const started = Date.now();
if (opt.control && list.length) {
  const bad = await control(list, displays ? 119 : null);
  if (bad) { console.error(`CONTROL      ${bad}: no kill would mean anything`); process.exit(1); }
  console.log('control      the selection\'s tests pass with no mutant');
}
const results = await runAll(list, jobs, displays);
const head = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (opt.json) writeFileSync(opt.json, JSON.stringify({ sha: head, shard: opt.shard ?? null, results }, null, 1));
const killed = results.filter((r) => r.result === 'killed').length;
console.log(`\n${killed} of ${results.length} mutants killed (${Math.round((Date.now() - started) / 1000)} s)`);
process.exit(killed === results.length ? 0 : 1);
