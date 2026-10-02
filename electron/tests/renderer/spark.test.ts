/* The light that runs on from the board into the card
   (src/renderer/app/panels/spark.ts).

   What is checked here is the part that is arithmetic: that the three things
   the card carries are in one order on every axis, and that the order is in
   the numbers rather than in a comment.  What the three actually look like
   on screen -- which is the claim that matters -- is measured off a
   photograph of the window in tests/e2e/start.e2e.ts. */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { offsets, peakAt, SEED, SPARK_ORDER, SPARKS, sparkAt, SWEEP_MS } from '../../src/renderer/app/panels/spark.ts';

const root = path.join(import.meta.dirname, '../..');
const css = readFileSync(path.join(root, 'src/renderer/app/app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const glints = readFileSync(path.join(root, 'src/renderer/startfield/glints.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

test('the three are in one order on every axis: how bright, and how often', () => {
  assert.deepEqual(SPARK_ORDER, ['title', 'primary', 'secondary']);
  for (let k = 1; k < SPARK_ORDER.length; k++) {
    const a = SPARKS[SPARK_ORDER[k - 1]], b = SPARKS[SPARK_ORDER[k]];
    assert.ok(a.peak > b.peak, `${SPARK_ORDER[k - 1]} peaks at ${a.peak} and ${SPARK_ORDER[k]} at ${b.peak}`);
    assert.ok(a.periodMs < b.periodMs, `${SPARK_ORDER[k - 1]} every ${a.periodMs} ms and ${SPARK_ORDER[k]} every ${b.periodMs} ms`);
  }
});

test('a pass: nothing, then up and down, then nothing again', () => {
  const phase = offsets(SEED);
  for (const name of SPARK_ORDER) {
    const start = phase[name];
    assert.equal(sparkAt(name, start - 1, start).amp, 0, `${name}: lit before its pass`);
    assert.equal(sparkAt(name, start, start).amp, 0, `${name}: starts at its full height`);
    const top = sparkAt(name, start + SWEEP_MS / 2, start);
    assert.ok(Math.abs(top.amp - SPARKS[name].peak) < 1e-9, `${name}: the top of the pass is ${top.amp}`);
    assert.ok(Math.abs(top.at - 0.5) < 1e-9, `${name}: the top is at ${top.at} of the way across`);
    assert.equal(sparkAt(name, start + SWEEP_MS + 1, start).amp, 0, `${name}: still lit after its pass`);
    // And again one period later, to the same height.
    const next = sparkAt(name, start + SPARKS[name].periodMs + SWEEP_MS / 2, start);
    assert.ok(Math.abs(next.amp - top.amp) < 1e-9, `${name}: the next pass is a different height`);
  }
});

test('how much of the time each is lit follows the order too', () => {
  const lit = SPARK_ORDER.map((name) => SWEEP_MS / SPARKS[name].periodMs);
  for (let k = 1; k < lit.length; k++) assert.ok(lit[k - 1] > lit[k], `${SPARK_ORDER[k - 1]} is lit less of the time`);
});

test('peakAt lands on the top of the next pass, never before the moment asked for', () => {
  const phase = offsets(SEED);
  for (const name of SPARK_ORDER) {
    for (const after of [0, 1000, 11000, 23456]) {
      const at = peakAt(name, phase[name], after);
      assert.ok(at >= after, `${name}: ${at} is before ${after}`);
      const there = sparkAt(name, at, phase[name]);
      assert.ok(Math.abs(there.amp - SPARKS[name].peak) < 1e-9, `${name}: ${there.amp} at its own peak`);
    }
  }
});

test('the moments come from the board\'s seed, and two boards do not share them', () => {
  const a = offsets(SEED), b = offsets(SEED + 1);
  assert.deepEqual(offsets(SEED), a, 'the same seed gives different moments');
  for (const name of SPARK_ORDER) {
    assert.ok(a[name] >= 0 && a[name] < SPARKS[name].periodMs, `${name}: ${a[name]} is outside its period`);
    assert.notEqual(a[name], b[name], `${name}: another seed gives the same moment`);
  }
});

/* Nothing of the card loops in CSS, for the same two reasons as the board:
   the capture tool freezes animations to take a frame, so anything that
   loops in CSS is missing from every picture of the screen, and a looping
   animation keeps a compositor thread awake for as long as the window is
   open.  Both files, because the card's are in one and the board's in the
   other. */
test('no CSS animation on the first screen runs for ever', () => {
  for (const [what, code] of [['the card', css], ['the board', glints]] as const) {
    assert.doesNotMatch(code, /animation[^;}]*\binfinite\b/, `${what} has an animation that never ends`);
    assert.doesNotMatch(code, /animation-iteration-count\s*:\s*infinite/, `${what} has an animation that never ends`);
  }
  // What moves instead: properties the clock sets, read by the card's CSS.
  assert.match(css, /--sp-amp/, 'the card does not read the light its clock sets');
  assert.match(css, /--sp-at/, 'the card does not read where the light has got to');
  assert.match(glints, /--sf-die/, 'the die frame does not read its own breath');
});
