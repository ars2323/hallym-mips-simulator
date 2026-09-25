/* The stack a program starts with depends only on the run parameters: not
   on the process's environment, not on the file's name.  The default
   (argv ["program.s"], no environment) gives every machine the same $sp. */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

import * as spim from '../../native/index.ts';
import { root } from '../helpers/machine.ts';

const hello = readFileSync(path.join(root, 'tests/programs/helloworld.s'));

function runHello(options: spim.AssembleOptions = {}) {
  spim.assemble(hello, options);
  const atLoad = spim.registers();
  while (spim.step(100000));
  return { atLoad, atEnd: spim.registers() };
}

test('the default parameters', () => {
  assert.deepEqual(spim.DEFAULT_RUN_PARAMETERS, { argv: ['program.s'], env: [] });
  assert.ok(Object.isFrozen(spim.DEFAULT_RUN_PARAMETERS));
  const { atLoad, atEnd } = runHello();
  assert.equal(atLoad.general[4], 1, 'argc');
  assert.equal(atLoad.general[29], 0x7fffffe4, '$sp');
  assert.equal(atEnd.general[29], 0x7fffffe4);
  // argv[0] is on the stack; the process's environment is not.
  const stack = Buffer.from(spim.readBytes(0x7fffffe4, 0x80000000 - 0x7fffffe4));
  assert.ok(stack.includes(Buffer.from('program.s\0')));
  assert.ok(!stack.includes(Buffer.from('PATH=')));
});

test('the file name does not move the stack', () => {
  const a = runHello({ fileName: 'a.s' });
  const b = runHello({ fileName: 'a-rather-long-homework-file-name.s' });
  assert.deepEqual(a, b);
});

test('the process environment does not move the stack', () => {
  const script = `
    import * as spim from ${JSON.stringify(pathToFileURL(path.join(root, 'native/index.ts')).href)};
    import { readFileSync } from 'node:fs';
    spim.assemble(readFileSync(${JSON.stringify(path.join(root, 'tests/programs/helloworld.s'))}));
    while (spim.step(100000));
    console.log(JSON.stringify(spim.registers()));`;
  const run = (env: NodeJS.ProcessEnv) =>
    execFileSync(process.execPath, ['--input-type=module', '-e', script], { env, encoding: 'utf8' });
  const small = run({ PATH: process.env.PATH });
  const large = run({ PATH: process.env.PATH, EXTRA: 'x'.repeat(5000), HOME: '/home/somebody', LANG: 'ko_KR.UTF-8' });
  assert.equal(small, large);
  assert.equal(JSON.parse(small).general[29], 0x7fffffe4);
});

test('run parameters reach the program', () => {
  spim.assemble(hello, { run: { argv: ['prog', 'first', '두번째'], env: ['A=1'] } });
  const r = spim.registers();
  assert.equal(r.general[4], 3, 'argc');
  const stack = Buffer.from(spim.readBytes(r.general[29] - (r.general[29] % 4), 0x80000000 - (r.general[29] - (r.general[29] % 4))));
  for (const s of ['prog', 'first', '두번째', 'A=1']) assert.ok(stack.includes(Buffer.from(s + '\0')), s);
});

test('argv entries the core would split are refused', () => {
  for (const argv of [['two words'], [''], ['tab\there'], ['nul\0']]) {
    assert.throws(() => spim.assemble(hello, { run: { argv, env: [] } }), TypeError, JSON.stringify(argv));
  }
  assert.throws(() => spim.assemble(hello, { run: { argv: ['p'], env: ['A=\0'] } }), TypeError);
});
