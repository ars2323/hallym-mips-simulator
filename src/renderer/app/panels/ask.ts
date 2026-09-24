/* A question in the window's own dialog (not the operating system's
   message box, which looks like another program): Haram on the left, the
   question and the buttons on the right.  Esc or a click on the backdrop is
   the same as the cancel button.

   A file's name is never part of the sentence (no particle after a name:
   "lab04.s 은" reads wrong whatever the name); it stands on a line of its
   own, "File: lab04.s". */

import { character, code, h } from '../dom.ts';

export interface Question {
  title: string;
  file?: string;      // the file the question is about
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
        h('div', { class: 'asktext' }, h('h2', {}, q.title),
          q.file ? h('p', { class: 'askfile' }, 'File: ', code(q.file)) : null, h('p', {}, q.body),
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
