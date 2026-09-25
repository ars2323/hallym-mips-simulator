/* The simulator in its own process (src/sim/), as the app will use it.

   1. An endless loop is stopped: the host answers meanwhile, and afterwards
      registers and memory can be read and PC is in the loop.
   2. A breakpoint stops the run at its address; the run goes on from it to
      the end.
   3. The process dying -- the core's fatal_error(), or stop() having to
      kill -- is reported, and a fresh process works.
   4. Console output arrives in pieces, while the program runs.
   And the five ways a run or step ends can be told apart. */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { CRASH_MESSAGE, FATAL_EXIT_CODE, Simulator, SimulatorCrashed, type CrashReport } from '../../src/sim/host.ts';
import { forkTransport } from '../../src/sim/transport.ts';
import { parseSymbolListing } from '../../src/core/symbols.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const labels = (symbols: string) => Object.fromEntries(parseSymbolListing(symbols).map((s) => [s.name, s.address]));

const LOOP = '\t.text\n\t.globl main\nmain:\nloop:\tj loop\n';
const BREAK = `
	.text
	.globl main
main:	li $t0, 1
	addi $t0, $t0, 1
there:	addi $t0, $t0, 40
	li $v0, 10
	syscall
`;
// Five numbers, each followed by some 600,000 instructions of busy work
// (about 150 ms), then a Hangul character printed one byte at a time with
// busy work between the bytes.
const PRINTS = `
	.data
han:	.asciiz "한"
	.text
	.globl main
main:	li $s0, 0
line:	li $v0, 1
	move $a0, $s0
	syscall
	li $v0, 11
	li $a0, 10
	syscall
	li $t0, 300000
busy:	addi $t0, $t0, -1
	bnez $t0, busy
	addi $s0, $s0, 1
	blt $s0, 5, line
	la $s1, han
byte:	lbu $a0, 0($s1)
	beqz $a0, done
	li $v0, 11
	syscall
	li $t0, 100000
busy2:	addi $t0, $t0, -1
	bnez $t0, busy2
	addi $s1, $s1, 1
	j byte
done:	li $v0, 10
	syscall
`;

describe('the simulator process', { timeout: 60000 }, () => {
  let sim: Simulator;
  before(async () => { sim = await Simulator.start(); });
  after(() => sim.close());

  test('1. an endless loop is stopped and can then be looked at', async () => {
    const r = await sim.assemble(LOOP);
    assert.ok(r.ok, r.errors.join(''));
    const loop = labels(r.symbols).loop;
    let ticks = 0;
    const ticker = setInterval(() => { ticks += 1; }, 10);
    const progress: number[] = [];
    const onProgress = ({ pc }: { pc: number }) => progress.push(pc);
    sim.on('progress', onProgress);
    try {
      const running = sim.run();
      await sleep(300);
      // The host is not blocked, and the process answers reads between slices.
      assert.ok(ticks >= 10, `host timer ran ${ticks} times`);
      assert.equal((await sim.registers()).pc, loop, 'read while running');
      assert.equal(await sim.stop(), 'stopped');
      const result = await running;
      assert.equal(result.reason, 'stopped');
      assert.equal(result.pc, loop);
    } finally {
      clearInterval(ticker);
      sim.off('progress', onProgress);
    }
    assert.ok(progress.length >= 1 && progress.every((pc) => pc === loop), `progress ${progress}`);
    // The machine is all there.
    const regs = await sim.registers();
    assert.equal(regs.pc, loop);
    assert.equal(regs.general[4], 1, '$a0 = argc');
    const sp = regs.general[29];
    assert.deepEqual(await sim.call('readWords', sp, 1), [1], 'argc on the stack');
    const top = 0x80000000;
    assert.ok(Buffer.from(await sim.call('readBytes', sp, top - sp)).includes(Buffer.from('program.s\0')));
    // And it can go on from where it stopped.
    const again = sim.run();
    await sleep(50);
    assert.equal(await sim.stop(), 'stopped');
    assert.equal((await again).pc, loop);
  });

  test('2. a breakpoint stops the run, which then goes on to the end', async () => {
    const r = await sim.assemble(BREAK);
    const there = labels(r.symbols).there;
    assert.equal(await sim.call('setBreakpoint', there), true);
    assert.deepEqual(await sim.call('breakpoints'), [there]);
    const first = await sim.run();
    assert.deepEqual([first.reason, first.pc], ['breakpoint', there]);
    assert.equal((await sim.registers()).general[8], 2);
    const text = await sim.call('textSegment');
    assert.equal(text.find((t) => t.addr === there)?.breakpoint, true);
    const second = await sim.run();
    assert.equal(second.reason, 'exit');
    assert.equal((await sim.registers()).general[8], 42);
  });

  test('3a. fatal_error() ends the process, not the host; a new one works', async () => {
    const crashes: CrashReport[] = [];
    sim.on('crashed', (c) => crashes.push(c));
    // An .err directive makes the core call fatal_error(), which ends the process.
    await assert.rejects(sim.assemble('\t.text\n\t.err\n'), (e: unknown) => {
      assert.ok(e instanceof SimulatorCrashed);
      assert.equal(e.fatal, 'File contains an .err directive');
      assert.equal(e.exit.code, FATAL_EXIT_CODE);
      return true;
    });
    assert.equal(crashes.length, 1);
    assert.equal(crashes[0].message, CRASH_MESSAGE);
    assert.ok(crashes[0].restarted);
    await sim.whenReady();
    const r = await sim.assemble(BREAK);
    assert.ok(r.ok);
    assert.deepEqual(await sim.call('breakpoints'), [], 'a fresh machine');
    assert.equal((await sim.run()).reason, 'exit');
    assert.equal((await sim.registers()).general[8], 42);
  });

  test('4. console output arrives in pieces, while the program runs', async () => {
    await sim.assemble(PRINTS);
    const pieces: { text: string; at: number }[] = [];
    const onConsole = (text: string) => pieces.push({ text, at: Date.now() });
    sim.on('console', onConsole);
    const result = await sim.run();
    const done = Date.now();
    sim.off('console', onConsole);
    assert.equal(result.reason, 'exit');
    assert.equal(pieces.map((p) => p.text).join(''), '0\n1\n2\n3\n4\n한');
    assert.ok(pieces.length >= 6, `${pieces.length} pieces: ${JSON.stringify(pieces.map((p) => p.text))}`);
    assert.ok(done - pieces[0].at >= 300, `first piece ${done - pieces[0].at} ms before the end`);
    // The Hangul character's three bytes came in three slices; the decoder
    // put them back together.
    assert.ok(!pieces.some((p) => p.text.includes('�')));
  });

  test('five ways to end, told apart', async () => {
    await sim.assemble(BREAK);
    assert.equal((await sim.step(3)).reason, 'limit');
    assert.equal((await sim.run()).reason, 'exit');
    const r = await sim.assemble(BREAK);
    await sim.call('setBreakpoint', labels(r.symbols).there);
    assert.equal((await sim.run()).reason, 'breakpoint');
    await sim.assemble('\t.text\n\t.globl main\nmain:\tnop\n');
    const failed = await sim.run();
    assert.equal(failed.reason, 'error');
    assert.match(failed.errors.join(''), /Attempt to execute non-instruction/);
    await sim.assemble(LOOP);
    const running = sim.run();
    await sleep(30);
    await sim.stop();
    assert.equal((await running).reason, 'stopped');
    assert.equal(await sim.stop(), 'idle');
  });

  test('changes are refused while the program runs', async () => {
    await sim.assemble(LOOP);
    const running = sim.run();
    await assert.rejects(sim.assemble(LOOP), /busy/);
    await assert.rejects(sim.call('setBreakpoint', 0x00400000), /busy/);
    await sim.stop();
    assert.equal((await running).reason, 'stopped');
  });
});

describe('the last resort', { timeout: 60000 }, () => {
  test('3b. a process that stops answering is killed by stop(), and replaced', async () => {
    const sim = await Simulator.start({
      transport: () => forkTransport({ ...process.env, SPIM_TEST_HOOKS: '1' }),
      stopTimeoutMs: 500,
    });
    try {
      const crashes: CrashReport[] = [];
      sim.on('crashed', (c) => crashes.push(c));
      const hung = sim.call('testHang');
      hung.catch(() => {});
      assert.equal(await sim.stop(), 'killed');
      await assert.rejects(hung, SimulatorCrashed);
      assert.equal(crashes.length, 1);
      assert.match(crashes[0].error.message, /killed by stop\(\)/);
      await sim.whenReady();
      assert.ok((await sim.assemble(BREAK)).ok);
      assert.equal((await sim.run()).reason, 'exit');
    } finally {
      sim.close();
    }
  });

  test('without the test hooks, the hook is refused', async () => {
    const sim = await Simulator.start();
    try {
      await assert.rejects(sim.call('testHang'), /test hooks are off/);
    } finally {
      sim.close();
    }
  });
});

describe('console input through the simulator process', { timeout: 60000 }, () => {
  test('waiting for input: the host answers, stop is idle, input resumes it', async () => {
    const sim = await Simulator.start();
    try {
      const r = await sim.assemble('\t.text\n\t.globl main\nmain:\tli $v0, 5\nread:\tsyscall\n\tmove $a0, $v0\n\tli $v0, 1\n\tsyscall\n\tli $v0, 10\n\tsyscall\n');
      const read = labels(r.symbols).read;
      const pieces: string[] = [];
      sim.on('console', (t) => pieces.push(t));
      const first = await sim.run();
      assert.deepEqual([first.reason, first.pc], ['input', read]);
      assert.equal((await sim.registers()).pc, read, 'the machine can be read while it waits');
      assert.equal(await sim.stop(), 'idle', 'waiting is not running: stop has nothing to stop');
      await sim.call('provideInput', '1234\n');
      const second = await sim.run();
      assert.equal(second.reason, 'exit');
      assert.equal(pieces.join(''), '1234');
    } finally {
      sim.close();
    }
  });

  test('with mapped I/O the program polls while it runs, and input given meanwhile reaches it', async () => {
    const sim = await Simulator.start();
    try {
      await sim.assemble('main: lui $t0, 0xffff\nw: lw $t1, 0($t0)\n andi $t1, $t1, 1\n beq $t1, $0, w\n lw $t4, 4($t0)\n li $v0, 10\n syscall\n',
                         { machine: { mappedIo: true } });
      const running = sim.run();
      await new Promise((r) => setTimeout(r, 200));
      await sim.call('provideInput', 'q\n');
      assert.equal((await running).reason, 'exit');
      assert.equal((await sim.registers()).general[12], 'q'.charCodeAt(0));
    } finally {
      sim.close();
    }
  });
});
