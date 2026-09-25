/* A file's name shortened for the title bar (src/renderer/app/logic/
   names.ts): the stem gives way, the extension stays; Hangul is two
   columns wide. */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { columns, shortName } from '../../src/renderer/app/logic/names.ts';

test('columns: Hangul takes two', () => {
  assert.equal(columns('lab04.s'), 7);
  assert.equal(columns('lab04_김학현.s'), 14);
});

test('shortName: whole when it fits; else the stem cut, the extension kept, within the columns', () => {
  assert.equal(shortName('lab04.s', 10), 'lab04.s');
  assert.equal(shortName('hw03_2021012345.s', 12), 'hw03_2021….s');
  assert.equal(shortName('lab04_김학현_20210123.s', 10), 'lab04_….s');
  assert.equal(shortName('lab04_김학현_20210123.s', 12), 'lab04_김….s');
  for (const cols of [10, 11, 12, 16, 20]) assert.ok(columns(shortName('lab04_김학현_20210123.s', cols)) <= cols);
  assert.equal(shortName('README', 4), 'REA…');
});
