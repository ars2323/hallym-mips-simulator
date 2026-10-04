/* Which way Ctrl+/ goes and where it puts the mark
   (src/renderer/app/logic/comment.ts).

   The part that is arithmetic is checked here; that the editor does it in
   one undo step, leaves a read-only document alone and keeps the selection
   on the same lines is checked in tests/e2e/editor.e2e.ts, where there is an
   editor to do it to. */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isBlank, isCommented, MARK, plan, take } from '../../src/renderer/app/logic/comment.ts';

test('one line: on, then off again', () => {
  const on = plan(['    li $t0, 5']);
  assert.deepEqual(on, { comment: true, column: 4, nothing: false });
  const off = plan(['    # li $t0, 5']);
  assert.equal(off.comment, false);
});

test('some of them commented: all of them get the mark', () => {
  const some = plan(['  li $t0, 5', '  # li $t1, 6', '  li $t2, 7']);
  assert.equal(some.comment, true, 'a block that is only part commented should be commented');
});

test('all of them commented: all of them lose it', () => {
  const all = plan(['  # li $t0, 5', '  # li $t1, 6']);
  assert.equal(all.comment, false);
});

test('the mark goes in one column, the shallowest of them', () => {
  // Four, eight and two spaces: the marks line up at two, not each at its own.
  const p = plan(['    li $t0, 5', '        add $t1, $t0, $t0', '  sw $t1, x']);
  assert.equal(p.column, 2);
  assert.equal(p.comment, true);
  // A line with no indent at all puts them all at the margin.
  assert.equal(plan(['main:', '    li $t0, 5']).column, 0);
});

test('a blank line in the middle counts for nothing', () => {
  // Neither for which way the toggle goes...
  assert.equal(plan(['  # a', '', '  # b']).comment, false, 'the blank line made it comment again');
  // ...nor for where the mark sits: "" has no indent, and would drag it to 0.
  assert.equal(plan(['    # a', '', '    # b']).column, 4);
  assert.equal(plan(['  li $t0, 5', '   ', '  li $t1, 6']).column, 2);
});

test('nothing but blank lines: nothing to do', () => {
  assert.equal(plan(['', '   ', '\t']).nothing, true);
  assert.equal(plan([]).nothing, true);
  assert.equal(plan(['x']).nothing, false);
});

test('taking the mark off takes the space it put there, and only then', () => {
  assert.deepEqual(take('# li $t0, 5'), { at: 0, length: 2 });
  assert.deepEqual(take('    # li $t0, 5'), { at: 4, length: 2 });
  assert.deepEqual(take('    #li $t0, 5'), { at: 4, length: 1 }, 'a mark with nothing after it loses only itself');
  assert.deepEqual(take('    ## two'), { at: 4, length: 1 }, 'only the outer mark comes off');
  // Not a comment at all: a mark with code before it is part of the line.
  assert.equal(take('  li $t0, 5   # five'), null);
  assert.equal(take('  li $t0, 5'), null);
});

test('what counts as commented, and as blank', () => {
  assert.ok(isCommented('# x') && isCommented('    # x') && isCommented('#x'));
  assert.ok(!isCommented('li $t0, 5 # x') && !isCommented(''));
  assert.ok(isBlank('') && isBlank('   ') && isBlank('\t '));
  assert.ok(!isBlank('  x'));
  assert.equal(MARK, '#');
});
