/* 설정.

     글자 크기        saved (the settings file); Ctrl +/- is this session only
     Data 진법        saved; the base the Data tab opens with
     고급 (folded)    QtSpim's Settings and Run Parameters: machine options,
                      the program's arguments, the exception handler.  For
                      this session only -- every start is from QtSpim's
                      defaults (lab PCs are shared) -- and taken up by the
                      next assemble. */

import type { MachineOptions } from '../../../../native/index.ts';
import { code, codeText, h } from '../dom.ts';

export type HandlerChoice = { kind: 'default' } | { kind: 'none' } | { kind: 'file'; name: string; text: string };

export interface Advanced {
  machine: MachineOptions;
  args: string;             // after argv[0] ("program.s"), split on blanks
  handler: HandlerChoice;
}

// QtSpim's defaults (native/index.ts DEFAULT_MACHINE; not imported: that
// module is the simulator process's).
export const defaultAdvanced = (): Advanced => ({
  machine: { acceptPseudo: true, delayedBranches: false, delayedLoads: false, mappedIo: false, quiet: false },
  args: '',
  handler: { kind: 'default' },
});

export const sameAdvanced = (a: Advanced, b: Advanced): boolean => JSON.stringify(a) === JSON.stringify(b);

export interface SettingsEvents {
  fontSize(): number;
  setFontSize(px: number): Promise<number>;
  dataBase(): 2 | 10 | 16;
  setDataBase(base: 2 | 10 | 16): Promise<void>;
  advanced(): Advanced;
  setAdvanced(a: Advanced): void;
  pickHandler(): Promise<{ name: string; text: string } | null>;
  about(): void;
}

const MACHINE: { key: keyof MachineOptions; label: string; note: string }[] = [
  { key: 'acceptPseudo', label: '의사 명령 허용', note: '`li` · `la` · `move` 같은 명령. 끄면 이들이 문법 오류가 됩니다' },
  { key: 'delayedBranches', label: 'delayed branches', note: '분기·점프가 한 명령 늦게 적용됩니다. 분기 오프셋이 PC+4 기준이 됩니다' },
  { key: 'delayedLoads', label: 'delayed loads', note: '적재한 값이 한 명령 늦게 레지스터에 들어갑니다' },
  { key: 'mappedIo', label: 'mapped I/O', note: '콘솔을 메모리의 장치 레지스터(`0xffff0000`~)로 씁니다. 실행 중에도 입력 칸이 열립니다' },
  { key: 'quiet', label: 'quiet', note: '예외가 나도 "Exception occurred" 메시지를 내지 않습니다' },
];

export function settingsDialog(events: SettingsEvents): { root: HTMLDialogElement; open(): void } {
  const dialog = h('dialog', { class: 'modal settings', 'aria-label': '설정' });

  const render = () => {
    const adv = events.advanced();
    const size = code(`${events.fontSize()}px`, 'value');
    const step = (d: number) => async () => {
      size.textContent = `${await events.setFontSize(events.fontSize() + d)}px`;
    };
    const minus = h('button', { class: 'btn small', type: 'button', 'aria-label': '글자 작게' }, '−');
    const plus = h('button', { class: 'btn small', type: 'button', 'aria-label': '글자 크게' }, '+');
    minus.addEventListener('click', step(-1));
    plus.addEventListener('click', step(+1));

    const bases = h('span', { class: 'seg' }, ...([16, 10, 2] as const).map((b) => {
      const el = h('button', { type: 'button', class: events.dataBase() === b ? 'on' : '' }, `${b}진`);
      el.addEventListener('click', async () => {
        await events.setDataBase(b);
        for (const x of bases.children) x.classList.toggle('on', x === el);
      });
      return el;
    }));

    const change = (f: (a: Advanced) => void) => { const a = structuredClone(events.advanced()); f(a); events.setAdvanced(a); render(); };
    const box = (checked: boolean, disabled: boolean, onChange: (v: boolean) => void) => {
      const input = h('input', { type: 'checkbox', checked, disabled });
      input.addEventListener('change', () => onChange(input.checked));
      return input;
    };
    const machine = h('div', { class: 'opts' },
      h('label', { class: 'opt off' }, box(false, true, () => {}),
        h('span', {}, h('b', {}, 'bare machine'), h('small', {}, codeText('늘 꺼져 있습니다. 이 교과목은 쓰지 않고, 켜면 교재의 `li` · `la` · `move` 가 오류가 됩니다(Qt판과 같음)')))),
      ...MACHINE.map((m) => h('label', { class: 'opt' },
        box(adv.machine[m.key], false, (v) => change((a) => { a.machine[m.key] = v; })),
        h('span', {}, h('b', {}, m.label), h('small', {}, codeText(m.note))))));
    const args = h('input', { class: 'mono text', type: 'text', value: adv.args, spellcheck: 'false', 'aria-label': '프로그램 인자' });
    args.addEventListener('change', () => change((a) => { a.args = args.value.trim(); }));
    const handlerRow = h('div', { class: 'radios' }, ...([
      ['default', '기본 (SPIM 의 exceptions.s)'], ['none', ''], ['file', '파일…'],
    ] as const).map(([kind, label]) => {
      const radio = h('input', { type: 'radio', name: 'handler', checked: adv.handler.kind === kind });
      radio.addEventListener('change', async () => {
        if (kind === 'file') {
          const f = await events.pickHandler();
          if (f) change((a) => { a.handler = { kind: 'file', ...f }; });
          else render();
        } else change((a) => { a.handler = { kind }; });
      });
      return h('label', { class: 'radio' }, radio, kind === 'none' ? h('span', {}, '불러오지 않음 — 프로그램이 ', code('__start'), ' 를 직접 둡니다')
        : kind === 'file' && adv.handler.kind === 'file' ? h('span', {}, '파일 ', code(adv.handler.name)) : label);
    }));
    const reset = h('button', { class: 'btn small', type: 'button' }, '고급을 기본값으로');
    reset.addEventListener('click', () => { events.setAdvanced(defaultAdvanced()); render(); });
    const details = h('details', { class: 'advanced' },
      h('summary', {}, '고급 ', h('small', {}, '— 이번 실행에만 적용되고, 다음 어셈블부터 쓰입니다')),
      h('h4', {}, '머신'), machine,
      h('h4', {}, 'Run Parameters'),
      h('div', { class: 'row' }, h('span', { class: 'mono' }, 'program.s'), args),
      h('small', { class: 'hint' }, codeText('`argv[0]` 은 늘 `program.s` 입니다(모두 같은 스택을 보도록). 시작 주소는 `__start` 입니다.')),
      h('h4', {}, '예외 처리기'), handlerRow,
      h('div', { class: 'row end' }, reset));
    if (!sameAdvanced(adv, defaultAdvanced())) details.open = true;

    const close = h('button', { class: 'btn primary', type: 'button' }, '닫기');
    close.addEventListener('click', () => dialog.close());
    const aboutButton = h('button', { class: 'linkbtn', type: 'button' }, '이 프로그램에 대하여 · 라이선스');
    aboutButton.addEventListener('click', () => { dialog.close(); events.about(); });
    dialog.replaceChildren(
      h('h2', {}, '설정'),
      h('div', { class: 'prow' }, h('span', {}, '글자 크기'), h('span', { class: 'grow' }), minus, size, plus),
      h('small', { class: 'hint' }, '저장됩니다. Ctrl + / Ctrl − / Ctrl 0 은 이번 실행에만 적용됩니다.'),
      h('div', { class: 'prow' }, h('span', {}, 'Data 진법'), h('span', { class: 'grow' }), bases),
      h('small', { class: 'hint' }, '저장됩니다. Data 탭이 이 진법으로 열립니다.'),
      details,
      h('div', { class: 'row' }, aboutButton, h('span', { class: 'grow' }), close));
  };
  return { root: dialog, open: () => { render(); dialog.showModal(); } };
}
