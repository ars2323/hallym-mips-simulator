/* The first screen: the hello character and two ways in -- the tutorial
   program, or straight to work (a new file, or one from disk).  No recent
   files: nothing of a session is kept (lab PCs are shared).

   Both steps have the same shape: the card has a fixed width, each choice
   a fixed size with its line break written in, and the "← 처음으로" row is
   there in both (hidden in the first), so going from one step to the other
   moves nothing but the words. */

import { character, h, icon } from '../dom.ts';

export interface WelcomeEvents {
  tutorial(): void;
  newFile(): void;
  openFile(): void;
}

function action(label: string, lines: [string, string], ic: string, onClick: () => void, main = false): HTMLElement {
  const b = h('button', { class: `action${main ? ' main' : ''}`, type: 'button' }, icon(ic),
    h('span', {}, h('b', {}, label), h('span', { class: 'sub' }, lines[0], h('br'), lines[1])));
  b.addEventListener('click', onClick);
  return b;
}

export function welcome(events: WelcomeEvents): HTMLElement {
  const actions = h('div', { class: 'actions' });
  const back = h('button', { class: 'linkbtn back', type: 'button' }, '← 처음으로');
  const first = () => {
    actions.replaceChildren(
      action('튜토리얼 보기', ['예제를 열어', '한 줄씩 따라가 봅니다'], 'circle-question-mark', events.tutorial, true),
      action('바로 시작', ['새 파일을 쓰거나', '가진 파일을 엽니다'], 'play', second));
    back.style.visibility = 'hidden';
  };
  const second = () => {
    actions.replaceChildren(
      action('새 파일', ['빈 .s 파일에서', '시작합니다'], 'file-plus', events.newFile, true),
      action('파일 열기', ['가진 .s 파일을', '엽니다 (Ctrl+O)'], 'folder-open', events.openFile));
    back.style.visibility = 'visible';
    (actions.firstElementChild as HTMLElement).focus();
  };
  back.addEventListener('click', first);
  first();
  return h('div', { class: 'welcome' }, h('div', { class: 'wcard' },
    character('hello', 200),
    h('div', { class: 'wbody' }, h('h1', {}, '안녕하세요!'),
      h('p', { class: 'lead' }, 'MIPS 어셈블리를 쓰고, 어셈블하고,', h('br'), '한 줄씩 실행해 보는 곳입니다.'),
      actions, back)));
}
