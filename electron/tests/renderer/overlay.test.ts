/* src/renderer/app/logic/overlay.ts: the caption buttons' colour under
   the tutorial's dim and a dialog's backdrop. */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { composite, hex, NAVY, overlayColor, WHITE } from '../../src/renderer/app/logic/overlay.ts';

test('white under nothing is white; under navy at 100% is navy', () => {
  assert.equal(hex(composite(WHITE, [])), '#ffffff');
  assert.equal(hex(composite(WHITE, [{ color: NAVY, alpha: 1 }])), '#00205b');
});

test('the tutorial\'s dim, a dialog\'s backdrop, and both: each darker than the last', () => {
  const none = overlayColor(false, false);
  const tutorial = overlayColor(true, false);
  const dialog = overlayColor(false, true);
  const both = overlayColor(true, true);
  assert.equal(none, '#ffffff');
  assert.equal(tutorial, '#bdc5d4'); // 255 * .74 + navy * .26
  const lum = (c: string) => parseInt(c.slice(1, 3), 16) + parseInt(c.slice(3, 5), 16) + parseInt(c.slice(5, 7), 16);
  assert.ok(lum(tutorial) < lum(none) && lum(dialog) < lum(tutorial) && lum(both) < lum(dialog), [none, tutorial, dialog, both].join(' '));
});
