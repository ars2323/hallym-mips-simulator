/* A panel's word to the student when it has nothing else to show: the
   Console before any output, the Inspector before the first step, the
   card on the Run side before the first assemble (and after an edit), and
   the error list.  One shape for all of them: the words on the left --
   a title, a sentence, and whatever else the case needs (a button, the
   errors) -- and a character on the right, the two together in the
   middle of the panel, no wider than a paragraph reads well.

   The character is at the far end from the Editor, which most of these
   words are about (never between the words and what they point at), and
   its size is one size.  A panel too short or too narrow for it (the
   Console at a small window, the Inspector at 1093 px) keeps the words
   alone (app.css, the container query on .notice-host). */

import { character, h } from './dom.ts';

export const NOTICE_CHARACTER = 120;

export interface Notice {
  pose: string;                       // the character's file: talk, sign, guide, curious
  title: string;
  body?: Node | string;
  more?: (Node | null)[];             // after the sentence: a button, the errors
}

export function notice(n: Notice): HTMLElement {
  return h('div', { class: 'notice' },
    h('div', { class: 'say' }, h('h3', {}, n.title), n.body ? h('p', {}, n.body) : null, ...(n.more ?? [])),
    character(n.pose, NOTICE_CHARACTER));
}
