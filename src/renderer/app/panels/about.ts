/* About: the version, what it is built on, and every notice that goes with
   the program -- read from the same files the package carries
   (src/main/paths.ts LICENSES), so the two cannot drift apart. */

import type { AboutInfo } from '../api.ts';
import { code, h } from '../dom.ts';

export function aboutDialog(): { root: HTMLDialogElement; open(): Promise<void> } {
  const dialog = h('dialog', { class: 'modal about', 'aria-label': '정보' });

  const open = async () => {
    const info: AboutInfo = await window.app.about();
    const body = h('div', { class: 'tabbody' });
    const tabs = h('div', { class: 'tabs' });
    const pick = (i: number) => {
      [...tabs.children].forEach((t, k) => t.classList.toggle('on', k === i));
      if (i === 0) {
        body.replaceChildren(
          h('p', {}, h('b', {}, 'Hallym MIPS'), ' ', code(info.version)),
          h('p', {}, 'Based on SPIM 9.1.24 by James R. Larus (BSD)'),
          h('p', { class: 'hint' }, 'Hallym University 컴퓨터 구조 실습을 위한 MIPS 시뮬레이터입니다.'),
          h('p', { class: 'hint' }, 'Electron ', code(info.electron), ' · Chromium ', code(info.chrome), ' · Node.js ', code(info.node)));
      } else {
        const list = h('div', { class: 'licenses' });
        const titles = [...info.licenses, 'Electron — MIT License'];
        titles.forEach((title, k) => {
          const pre = h('pre', { class: 'mono' });
          const d = h('details', {}, h('summary', {}, title), pre);
          d.addEventListener('toggle', async () => {
            if (d.open && pre.textContent === '') pre.textContent = await window.app.license(k);
          }, { once: false });
          list.append(d);
        });
        const credits = h('button', { class: 'btn small', type: 'button' }, 'Chromium · Node.js 고지 열기 (LICENSES.chromium.html)');
        credits.addEventListener('click', () => void window.app.openCredits());
        list.append(h('p', { class: 'hint' }, 'Chromium 과 Node.js, 그리고 그 안의 라이브러리 고지는 설치 폴더의 ',
          code('LICENSES.chromium.html'), ' 에 있습니다(약 20 MB).'), credits);
        body.replaceChildren(list);
      }
    };
    ['정보', '라이선스'].forEach((t, i) => {
      const b = h('button', { class: 'tab', type: 'button' }, t);
      b.addEventListener('click', () => pick(i));
      tabs.append(b);
    });
    const close = h('button', { class: 'btn primary', type: 'button' }, '닫기');
    close.addEventListener('click', () => dialog.close());
    dialog.replaceChildren(h('h2', {}, '정보'), tabs, body, h('div', { class: 'row end' }, close));
    pick(0);
    dialog.showModal();
  };
  return { root: dialog, open };
}
