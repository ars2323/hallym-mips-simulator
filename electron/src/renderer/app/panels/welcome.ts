/* The first screen: the hello character and two ways in -- the tutorial
   program, or straight to work (a new file, or one from disk).  No recent
   files: nothing of a session is kept (lab PCs are shared).

   Both steps have the same shape: the card has a fixed width, each choice
   a fixed size with its line break written in, and the "← 처음으로" row is
   there in both (hidden in the first), so going from one step to the other
   moves nothing but the words.  Behind the card, the same for both steps:
   the circuit board (../../startfield/), which a step never restarts.

   The card is the chip.  It carries CHIP_ATTR, which is how the board finds
   the rectangle to put its pins on -- there is no second drawn square under
   it, so the two can never disagree.  Its die marking is the only thing the
   board needs from the app besides the seed. */

import { asset, h, icon } from '../dom.ts';
import { CHIP_ATTR, startfield } from '../../startfield/index.ts';

/** The die marking, the product name on the package, and the seed the board
    is grown from. */
export const CHIP_LABEL = 'MIPS32';
export const WORDMARK = 'Hallym MIPS Simulator';
export const SEED = 20261002;

export interface WelcomeEvents {
  tutorial(): void;
  newFile(): void;
  openFile(): void;
}

function action(label: string, ic: string, onClick: () => void, main = false): HTMLElement {
  const b = h('button', { class: `action${main ? ' main' : ''}`, type: 'button' }, icon(ic), h('b', {}, label));
  b.addEventListener('click', onClick);
  return b;
}

export function welcome(events: WelcomeEvents): { root: HTMLElement; show(on: boolean): void } {
  const actions = h('div', { class: 'actions' });
  const back = h('button', { class: 'linkbtn back', type: 'button' }, '← 처음으로');
  const first = () => {
    actions.replaceChildren(
      action('튜토리얼 보기', 'circle-question-mark', events.tutorial, true),
      action('바로 시작', 'play', second));
    back.style.visibility = 'hidden';
  };
  const second = () => {
    actions.replaceChildren(
      action('새 파일', 'file-plus', events.newFile, true),
      action('파일 열기', 'folder-open', events.openFile));
    back.style.visibility = 'visible';
    (actions.firstElementChild as HTMLElement).focus();
  };
  back.addEventListener('click', first);
  first();
  // The seed is a constant: the same board every start, on every machine.
  const start = startfield({ seed: SEED, chipLabel: CHIP_LABEL });
  /* Three things, down the middle of the die frame: the mark with the
     product's name, the two ways in, and the die marking at the foot.  The
     symbol is the top bar's own file (marks/symbol-basic.svg, a vector, so
     it is sharp at any size) in its own colours -- the university's rules
     forbid recolouring it, and the repository holds no reversed version for
     a dark ground (assets/hallym/README.md). */
  const card = h('div', { class: 'wcard', [CHIP_ATTR]: '' },
    h('div', { class: 'wstack' },
      h('div', { class: 'wlogo' },
        h('img', { class: 'logo', src: asset('hallym/marks/symbol-basic.svg'), alt: '' }),
        h('span', { class: 'wordmark' }, WORDMARK)),
      h('div', { class: 'wbody' }, actions, back),
      h('span', { class: 'die' }, CHIP_LABEL)));
  return { root: h('div', { class: 'welcome' }, start.root, card), show: start.show };
}
