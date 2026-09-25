/* Which columns a table keeps as it narrows (src/renderer/app/logic/
   columns.ts): margins first, then a pixel of font, then whole columns in
   the table's order; a column turned back on is added, never swapped. */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fit, needed, styles, type Column } from '../../src/renderer/app/logic/columns.ts';

// Text's columns, with ch = 6.5 px (D2Coding at 13 px).
const TEXT: Column[] = [{ key: 'bpc', px: 12 }, { key: 'addr', ch: 8 }, { key: 'word', ch: 8 }, { key: 'fmt', px: 38 },
  { key: 'dis', ch: 18 }, { key: 'lno', ch: 4 }, { key: 'src', ch: 14 }];
const DROPS = [['src', 'lno'], ['fmt'], ['addr'], ['word']];
const CH = 6.5;
const ALL = styles({ pad: 19, gap: 12 }, { pad: 11, gap: 6 }, 13);
const without = (...keys: string[]) => TEXT.filter((c) => !keys.includes(c.key));
const at = (width: number, forced: string[] = []) => {
  const f = fit(width, TEXT, DROPS, new Set(forced), CH, ALL);
  return { style: f.style.name, hidden: [...f.hidden].sort(), overflow: f.overflow };
};

test('needed: padding, the columns in px and in ch (scaled with the font), and the gaps between them', () => {
  const [normal, , small] = ALL;
  assert.equal(needed([{ key: 'a', px: 12 }, { key: 'b', ch: 8 }], normal, CH), 19 + 12 + 52 + 12);
  assert.equal(needed([{ key: 'b', ch: 13 }], small, CH), 11 + 13 * CH * 12 / 13);
  assert.equal(needed([], normal, CH), 19);
});

test('fit: margins give way first, then the font, then Source and Line, Format, Address -- Encoding last', () => {
  const full = needed(TEXT, ALL[0], CH);
  assert.deepEqual(at(full), { style: 'normal', hidden: [], overflow: false });
  assert.deepEqual(at(full - 1), { style: 'tight', hidden: [], overflow: false });
  assert.deepEqual(at(needed(TEXT, ALL[2], CH)), { style: 'small', hidden: [], overflow: false });
  assert.deepEqual(at(needed(TEXT, ALL[2], CH) - 1), { style: 'normal', hidden: ['lno', 'src'], overflow: false });
  // The roomiest style that fits the columns left, not the tightest.
  assert.deepEqual(at(needed(without('src', 'lno'), ALL[1], CH)), { style: 'tight', hidden: ['lno', 'src'], overflow: false });
  assert.deepEqual(at(needed(without('src', 'lno'), ALL[2], CH) - 1), { style: 'normal', hidden: ['fmt', 'lno', 'src'], overflow: false });
  assert.deepEqual(at(needed(without('src', 'lno', 'fmt'), ALL[2], CH) - 1).hidden, ['addr', 'fmt', 'lno', 'src']);
  assert.deepEqual(at(needed(without('src', 'lno', 'fmt', 'addr'), ALL[2], CH) - 1).hidden, ['addr', 'fmt', 'lno', 'src', 'word']);
  assert.deepEqual(at(10), { style: 'small', hidden: ['addr', 'fmt', 'lno', 'src', 'word'], overflow: true });
});

test('fit: a column turned back on is added to what the width shows, never in place of another', () => {
  const width = needed(without('src', 'lno', 'fmt'), ALL[1], CH);
  assert.deepEqual(at(width).hidden, ['fmt', 'lno', 'src']);
  assert.deepEqual(at(width, ['src', 'lno']), { style: 'small', hidden: ['fmt'], overflow: true });
  assert.deepEqual(at(width, ['fmt']), { style: 'small', hidden: ['lno', 'src'], overflow: true });
  // Turned on while it would show anyway: nothing changes.
  assert.deepEqual(at(needed(TEXT, ALL[0], CH), ['src']), { style: 'normal', hidden: [], overflow: false });
});
