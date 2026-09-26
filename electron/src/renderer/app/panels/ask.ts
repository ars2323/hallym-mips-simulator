/* A question in the window's own dialog (not the operating system's
   message box, which looks like another program): Haram on the left, the
   question and the buttons on the right, the same place and size every
   time.  Its backdrop darkens everything behind it, the tutorial's card
   and rings included, and while it is up only its two buttons can be
   reached (showModal: the rest of the page is inert).  Esc is the cancel
   button -- the safe side; the other answer is only ever given by its
   button.  A click outside the dialog does nothing at all: in the tutorial
   a student clicks about, and a question that went away on such a click
   would not even be noticed.

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
    dialog.addEventListener('close', () => { dialog.remove(); document.body.classList.remove('dialog-open'); answer(result); });
    document.body.append(dialog);
    document.body.classList.add('dialog-open'); // app.css: the tutorial's own Haram gives way to this one
    dialog.showModal();
    ok.focus();
  });
}
