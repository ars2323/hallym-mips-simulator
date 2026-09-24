/* The first screen: the hello character and two ways in -- the tutorial
   program, or straight to work (a new file, or one from disk).  No recent
   files: nothing of a session is kept (lab PCs are shared). */

import { character, h, icon } from '../dom.ts';

export interface WelcomeEvents {
  tutorial(): void;
  newFile(): void;
  openFile(): void;
}

function action(label: string, sub: string, ic: string, onClick: () => void, main = false): HTMLElement {
  const b = h('button', { class: `action${main ? ' main' : ''}`, type: 'button' }, icon(ic),
    h('span', {}, h('b', {}, label), h('span', {}, sub)));
  b.addEventListener('click', onClick);
  return b;
}

export function welcome(events: WelcomeEvents): HTMLElement {
  const actions = h('div', { class: 'actions' });
  const first = () => actions.replaceChildren(
    action('튜토리얼 보기', '예제를 열어 한 줄씩 따라가 봅니다', 'circle-question-mark', events.tutorial, true),
    action('바로 시작', '새 파일을 쓰거나 가진 파일을 엽니다', 'play', second));
  const second = () => {
    const back = h('button', { class: 'linkbtn back', type: 'button' }, '← 처음으로');
    back.addEventListener('click', first);
    actions.replaceChildren(
      action('새 파일', '빈 .s 파일', 'file-plus', events.newFile, true),
      action('파일 열기', 'Ctrl+O', 'folder-open', events.openFile),
      back);
    (actions.firstElementChild as HTMLElement).focus();
  };
  first();
  return h('div', { class: 'welcome' }, h('div', { class: 'wcard' },
    character('hello', 210),
    h('div', {}, h('h1', {}, '안녕하세요!'),
      h('p', { class: 'lead' }, 'MIPS 어셈블리를 쓰고, 어셈블하고, 한 줄씩 실행해 보는 곳입니다.', h('br'),
        '처음이라면 튜토리얼부터 시작해 보세요.'),
      actions)));
}
