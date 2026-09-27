/* The executable image (.hmx): tests/hmx/<case>.s and the image the app
   writes for it, <case>.hmx, with the app's default settings (a case whose
   source says "# assemble: no exception handler" without the handler).

   1. Golden: the image, made again from the .s on every run, is the .hmx
      committed, line for line -- all but "assembled" (the time) and the
      version in "produced-by".  HMX_UPDATE=1 writes them instead.  These
      files are the test inputs docs/hmx-format.md points readers to.
   2. Round trip: each .hmx read back (tests/helpers/hmx-read.ts, a strict
      reader) against a fresh core: every word of .text is the core's word at
      that address, the start-up code included; every byte of .data the
      core's, and every other byte of the user data segment zero; entry, $sp,
      $gp, the byte order and the labels the core's.
   3. The same program gives the same image, whatever was assembled before.
   4. The reader refuses what the format tells it to refuse. */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

import { formatHmx, hmxTime } from '../../src/core/hmx.ts';
import { parseSymbolListing } from '../../src/core/symbols.ts';
import { Simulator } from '../../src/sim/host.ts';
import { readImage, type Call } from '../../src/sim/image.ts';
import { readHmx } from '../helpers/hmx-read.ts';

const root = path.join(import.meta.dirname, '..', '..');
const dir = path.join(root, 'tests/hmx');
const VERSION = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version as string;
const CASES = readdirSync(dir).filter((f) => f.endsWith('.s')).sort();
const EXPECTED_CASES = ['branches.s', 'data.s', 'main-later.s', 'no-data.s', 'no-handler.s', 'pseudo.s', 'space-gap.s'];

// The app's options with its default settings (app.ts assembleOptions).
const optionsFor = (name: string, source: string) => ({
  fileName: name,
  run: { argv: ['program.s'], env: [] },
  handler: /^# assemble: no exception handler$/m.test(source) ? null : undefined,
});
// Lines compared: all but the time, and produced-by without its version.
const comparable = (hmx: string) => hmx.split('\n').filter((l) => !l.startsWith('assembled '))
  .map((l) => l.replace(/^(produced-by +Hallym MIPS) \d+\.\d+\.\d+$/, '$1 x.y.z'));

let sim: Simulator;
let call: Call;
before(async () => { sim = await Simulator.start(); call = (m, ...a) => sim.call(m, ...a); });
after(() => sim.close());

async function imageOf(name: string, at = new Date()): Promise<string> {
  const bytes = readFileSync(path.join(dir, name));
  const source = bytes.toString('utf8');
  const machine = await readImage(call, source, optionsFor(name, source));
  return formatHmx({ ...machine, source: name, sourceSha256: createHash('sha256').update(bytes).digest('hex'),
                     producedBy: `Hallym MIPS ${VERSION}`, assembled: hmxTime(at) });
}

test('the golden cases are all there', () => {
  assert.deepEqual(CASES, EXPECTED_CASES);
});

describe('each image is its golden .hmx (all but the time and the version)', () => {
  for (const name of CASES) {
    test(name, async () => {
      const golden = path.join(dir, name.replace(/\.s$/, '.hmx'));
      if (process.env.HMX_UPDATE === '1') {
        // Keeps the time a golden has, so an update shows only what changed.
        const was = existsSync(golden) ? /^assembled +(.*)$/m.exec(readFileSync(golden, 'utf8'))?.[1] : undefined;
        const made = await imageOf(name);
        writeFileSync(golden, was ? made.replace(/^(assembled +).*$/m, `$1${was}`) : made);
      }
      assert.deepEqual(comparable(await imageOf(name)), comparable(readFileSync(golden, 'utf8')));
    });
  }
});

describe('each golden .hmx, read back, is the core\'s program', () => {
  for (const name of CASES) {
    test(name, async () => {
      const file = readHmx(readFileSync(path.join(dir, name.replace(/\.s$/, '.hmx')), 'utf8'));
      const bytes = readFileSync(path.join(dir, name));
      const source = bytes.toString('utf8');
      const r = await sim.assemble(source, optionsFor(name, source));
      assert.ok(r.ok);
      const seg = await sim.call('segments');
      const regs = await sim.call('registers');

      assert.equal(file.version, 1);
      assert.equal(file.fields.get('source'), name);
      assert.equal(file.fields.get('source-sha256'), createHash('sha256').update(bytes).digest('hex'));
      assert.match(file.fields.get('produced-by')!, /^Hallym MIPS \d+\.\d+\.\d+$/);
      assert.match(file.fields.get('assembled')!, /^\d{4}-\d\d-\d\dT\d\d:\d\d[+-]\d\d:\d\d$/);

      // .text: the user text segment, word for word, from its first instruction.
      const core = (await sim.call('textSegment')).filter((w) => w.addr >= seg.textBot && w.addr < seg.textTop);
      assert.equal(file.text.addr, core[0].addr);
      assert.equal(file.text.addr, seg.textBot); // the start-up code (or the program's own __start) is first
      assert.equal(file.text.words.length, (core[core.length - 1].addr - core[0].addr) / 4 + 1);
      const at = new Map(core.map((w) => [w.addr, w.word >>> 0]));
      file.text.words.forEach((w, i) => assert.equal(w, at.get(file.text.addr + 4 * i) ?? 0, `word at ${(file.text.addr + 4 * i).toString(16)}`));

      // .data: those bytes, and nothing else in the user data segment.
      const all = await sim.call('readBytes', seg.dataBot, seg.dataTop - seg.dataBot);
      const from = file.data ? file.data.addr - seg.dataBot : 0, to = file.data ? from + file.data.bytes.length : 0;
      if (file.data) assert.deepEqual([...file.data.bytes], [...all.subarray(from, to)]);
      assert.ok(all.every((b, i) => b === 0 || (i >= from && i < to)), 'a byte of data left out');
      if (file.data) assert.equal(file.data.addr, r.data.start);
      if (file.data) assert.ok(file.data.addr + file.data.bytes.length >= r.data.end);

      // entry, registers, byte order, labels.
      const listed = parseSymbolListing(r.symbols).filter((s) => s.address !== 0);
      const main = listed.find((s) => s.name === 'main');
      assert.equal(file.entry, main ? main.address : listed.find((s) => s.name === '__start')!.address);
      assert.deepEqual([...file.regs], [['$sp', regs.general[29]], ['$gp', regs.general[28]]]);
      assert.equal(file.endian, 'little');
      const [word] = await sim.call('readWords', seg.dataBot + from, 1);
      const lead = await sim.call('readBytes', seg.dataBot + from, 4);
      if (word !== 0) assert.equal(lead[0], word & 0xff); // little: the low byte first
      for (const s of file.symbols) assert.ok(listed.some((l) => l.name === s.name && l.address === s.addr), s.name);
      assert.ok(!file.symbols.some((s) => s.addr >= seg.kTextBot), 'a kernel label');
    });
  }
});

test('what each case is for shows in its image', async () => {
  const read = (name: string) => readHmx(readFileSync(path.join(dir, `${name}.hmx`), 'utf8'));
  const withHandler = read('main-later'), without = read('no-handler');
  // entry is main, measured: after the start-up code and square, not the text's start.
  const mainLater = withHandler.symbols.find((s) => s.name === 'main')!;
  assert.equal(withHandler.entry, mainLater.addr);
  assert.ok(withHandler.entry > withHandler.text.addr + 4 * 9);
  assert.ok(!withHandler.symbols.some((s) => s.name === '__start' || s.name === '__eoth')); // the handler's, not the program's
  // Without the handler: no start-up code, the program's own __start is the entry.
  assert.equal(without.entry, without.text.addr);
  assert.deepEqual(without.symbols, [{ name: '__start', addr: without.text.addr }]);
  assert.equal(read('no-data').data, null);
  const gap = read('space-gap');
  assert.equal(gap.data!.bytes.length, 4 + 4096 + 4 + 64);
  assert.match(readFileSync(path.join(dir, 'space-gap.hmx'), 'utf8'), /^zero 4096$/m);
  const data = read('data');
  assert.deepEqual(data.symbols.map((s) => s.name), ['main', 'next', 'msg', 'nums', 'count']);
});

test('the same program, the same image, whatever was assembled before', async () => {
  const first = await imageOf('data.s', new Date(0));
  await imageOf('space-gap.s');
  await sim.assemble('main: li $t0, 1\n');
  assert.equal(await imageOf('data.s', new Date(0)), first);
});

test('a reader refuses a later version and a count that is not the lines\', and ignores comments and unknown fields', () => {
  const good = readFileSync(path.join(dir, 'no-data.hmx'), 'utf8');
  assert.throws(() => readHmx(good.replace('HALLYM-EXEC 1', 'HALLYM-EXEC 2')), /version 2/);
  assert.throws(() => readHmx(good.replace(/words (\d+)/, (_m, n) => `words ${Number(n) + 1}`)), /said/);
  assert.throws(() => readHmx(good.replace(/\n[0-9a-f]{8}\n/, '\n')), /said/);
  const commented = good.replace('\nentry', '\n# a comment\n\n   # another\nlater-field  anything\nentry');
  assert.deepEqual(readHmx(commented).text, readHmx(good).text);
});

test('docs/hmx-format.md: its example is the data case, source and image; its table lists every case', () => {
  const doc = readFileSync(path.join(root, 'docs/hmx-format.md'), 'utf8');
  const block = (lang: string) => new RegExp('```' + lang + '\\n([\\s\\S]*?)\\n```').exec(doc)![1] + '\n';
  assert.equal(block('asm'), readFileSync(path.join(dir, 'data.s'), 'utf8'));
  assert.deepEqual(comparable(block('text')), comparable(readFileSync(path.join(dir, 'data.hmx'), 'utf8')));
  for (const name of CASES) {
    const base = name.replace(/\.s$/, '');
    assert.ok(doc.includes(`/main/electron/tests/hmx/${base}.s)`) && doc.includes(`/main/electron/tests/hmx/${base}.hmx)`), base);
  }
});
