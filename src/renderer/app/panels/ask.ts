/* A question in the window's own dialog (not the operating system's
   message box, which looks like another program): Haram on the left, the
   question and the buttons on the right.  Esc or a click on the backdrop is
   the same as the cancel button. */

import { character, h } from '../dom.ts';

export interface Question {
  title: string;
  body: string;
  ok: string;
  cancel?: string;
  danger?: boolean;   // the ok button discards something
}

export function ask(q: Question): Promise<boolean> {
  return new Promise((answer) => {
    const ok = h('button', { class: `btn ${q.danger ? 'danger' : 'primary'}`, type: 'button' }, q.ok);
    const cancel = h('button', { class: 'btn', type: 'button' }, q.cancel ?? '취소');
    const dialog = h('dialog', { class: 'modal ask', 'aria-label': q.title },
      h('div', { class: 'askbody' }, character('haram', 96),
        h('div', { class: 'asktext' }, h('h2', {}, q.title), h('p', {}, q.body),
          h('div', { class: 'row end' }, cancel, ok))));
    let result = false;
    ok.addEventListener('click', () => { result = true; dialog.close(); });
    cancel.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => { dialog.remove(); answer(result); });
    document.body.append(dialog);
    dialog.showModal();
    ok.focus();
  });
}
