/* No Korean particle right after a name.  Whether a name takes 은 or 는,
   이 or 가, 을 or 를, 로 or 으로 depends on how it is read ("lab04.s" ends in
   "에스", `$a0` in "제로" or "영"), so the window never lets a name -- a file,
   a register, a key, a panel, anything put in from a variable -- carry one:
   the particle goes after a Korean noun (`$t7` 레지스터에, Data 탭의,
   F10 키를), or the sentence is written another way ("File: lab04.s").

   This reads the window's sources (and the Inspector's sentences,
   src/core/explain.ts) and looks, outside comments, for a particle after
   an interpolation, after inline code, after a Latin word, or at the start
   of a string that follows an element. */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const root = path.join(import.meta.dirname, '..', '..');
const PARTICLE = '(?:은|는|이|가|을|를|과|와|으로|로|의|에|에서|에게|만큼|처럼|보다|까지|부터|이나|나|도|만)(?![가-힣])';
const PATTERNS: [string, RegExp][] = [
  // (Save those that end in a Korean noun: explain.ts's val() "`$t6` 값(…)",
  // its `where` "… 주소(…)" and `unit` "워드", and a choice between words
  // written in, ${left ? '왼쪽' : '오른쪽'}.)
  ['after an interpolation', new RegExp(`\\$\\{(?!val\\(|where\\}|unit\\})[^{}]*[^'{}]\\}\\s?${PARTICLE}`)],
  ['after inline code', new RegExp(`\`\\s?${PARTICLE}`)],
  ['after a Latin word', new RegExp(`[A-Za-z][A-Za-z0-9+./_-]*\\)?\\s?${PARTICLE}`)],
  ['after an element', new RegExp(`'\\s${PARTICLE}`)],
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

// The source without its comments, line numbers kept: line comments first
// (one may hold a "/*", as in "panels/*.ts"), then block comments.
function code(text: string): string[] {
  const noLines = text.split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');
  return noLines.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).split('\n');
}

test('no Korean particle right after a name, a key or a value put into a sentence', () => {
  const found: string[] = [];
  for (const file of [...files(path.join(root, 'src/renderer/app')), path.join(root, 'src/core/explain.ts')]) {
    code(readFileSync(file, 'utf8')).forEach((line, i) => {
      if (!/[가-힣]/.test(line)) return;
      for (const [what, re] of PATTERNS) {
        const m = re.exec(line);
        if (m) found.push(`${path.relative(root, file)}:${i + 1}: ${what}: …${line.slice(Math.max(0, m.index - 20), m.index + m[0].length + 10).trim()}…`);
      }
    });
  }
  assert.deepEqual(found, []);
});
