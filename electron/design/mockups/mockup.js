// Builds one mockup from window.MOCK (design/mockups/data.ts, real simulator
// output) for ?dir=1|2&scene=A|B|C|D at whatever size the window is.
//
// Direction 1 "무대 전환": a [코드]/[실행] switch changes the whole screen;
//   registers are pinned on the left while running; the Inspector is a sheet
//   that comes up from the bottom; narrow = Text over registers.
// Direction 2 "흐름": editor, Text and registers side by side; running folds
//   the editor into a rail and unfolds the registers on the right; the
//   Inspector opens at the side; narrow = one panel with tabs at the bottom.

const M = window.MOCK;
const q = new URLSearchParams(location.search);
const DIR = q.get('dir');
const SCENE = q.get('scene');
const W = window.innerWidth;
const SIZE = W >= 1600 ? 'wide' : W >= 1100 ? 'mid' : 'narrow';
const A = '../../src/renderer/assets/';
const icon = (n) => `<img src="${A}icons/lucide/${n}.svg" alt="">`;
const char = (n, h) => `<img class="char" src="${A}hallym/characters/${n}.png" style="height:${h}px" alt="">`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const hex8 = (n) => '0x' + (n >>> 0).toString(16).padStart(8, '0');
const running = SCENE === 'C' || SCENE === 'D';

// ---- top bar --------------------------------------------------------------

function btn(label, ic, { primary = false, off = false, key = '' } = {}) {
  const text = SIZE === 'narrow' ? '' : `<span>${label}</span>${key ? `<kbd>${key}</kbd>` : ''}`;
  return `<span class="btn${primary ? ' primary' : ''}${off ? ' off' : ''}" title="${label}">${icon(ic)}${text}</span>`;
}

function topbar() {
  const file = SCENE === 'A' ? (DIR === '2' ? '<b>제목 없음.s</b>' : '') : '<b>lab04.s</b>';
  const assemble = btn('어셈블', 'hammer', { primary: SCENE === 'B', off: SCENE === 'A' && DIR === '1', key: 'Ctrl+S' });
  const run = btn('실행', 'play', { off: SCENE === 'A' || SCENE === 'B', key: 'F5' });
  const step = btn('한 줄', 'step-forward', { primary: running, off: SCENE === 'A' || SCENE === 'B', key: 'F10' });
  const stop = btn('처음으로', 'rotate-ccw', { off: !running });
  const seg = DIR === '1'
    ? `<span class="seg"><span class="${running ? '' : 'on'}">코드</span><span class="${running ? 'on' : SCENE === 'B' ? 'dim' : ''}">실행</span></span>`
    : '';
  return `<div class="top">
    ${SIZE === 'narrow' ? '' : '<span class="title">Hallym MIPS</span><span class="sep"></span>'}
    <span class="file">${file}</span>
    ${seg}
    <span class="grow"></span>
    ${assemble}${run}${step}${stop}
    <span class="sep"></span>
    <span class="iconbtn">${icon('circle-question-mark')}</span>
    <span class="iconbtn">${icon('settings')}</span>
  </div>`;
}

function statusbar() {
  const s = {
    A: '<span>준비</span>',
    B: '<span class="err">오류 1개</span><span>15행 · syntax error</span><span>저장됨</span>',
    C: `<span class="run">한 줄씩 실행 중</span><span>16단계</span><span>PC <span class="code">${M.stepping.registers.pc}</span></span><span>방금 바뀜: <span class="code">$t6</span></span>`,
    D: `<span class="run">한 줄씩 실행 중</span><span>16단계</span><span>PC <span class="code">${M.stepping.registers.pc}</span></span><span>고른 명령 <span class="code">${M.inspector.addr}</span></span>`,
  }[SCENE];
  return `<div class="status">${s}<span style="flex:1"></span><span class="tag">방향 ${DIR} · 장면 ${SCENE} · ${W}×${window.innerHeight}</span></div>`;
}

// ---- editor ---------------------------------------------------------------

function editorBody(src, badLine) {
  return `<div class="editor">${src.lines.map((l, i) => {
    let html = '';
    let at = 0;
    for (const [start, len, kind] of l.tokens) {
      html += esc(l.text.slice(at, start));
      const t = esc(l.text.slice(start, start + len));
      html += `<span class="k-${kind}${i + 1 === badLine && kind === 'Identifier' ? ' wave' : ''}">${t}</span>`;
      at = start + len;
    }
    html += esc(l.text.slice(at));
    return `<div class="ln${i + 1 === badLine ? ' bad' : ''}"><span class="no">${i + 1}</span><span class="tx">${html}</span></div>`;
  }).join('')}</div>`;
}

function errorsPanel() {
  const e = M.lab04.errors;
  return `<div class="errors"><div class="phead"><span class="name">오류</span><span class="meta">${e.length}개 · 어셈블은 여기서 멈췄습니다. 고친 뒤 다시 Ctrl+S</span></div>
    ${e.map((x) => `<div class="item"><span class="dot"></span><span class="line">${x.line}행</span>
      <span class="msg">${esc(x.message)}<span class="src">${esc(x.source)}</span></span><span class="go">이 줄로 가기</span></div>`).join('')}</div>`;
}

function editorPanel({ withErrors = false } = {}) {
  return `<div class="panel">
    <div class="phead"><span class="name">편집기</span><span class="meta">lab04.s · UTF-8 · LF</span></div>
    <div class="pbody">${editorBody(M.lab04, withErrors ? M.lab04.errors[0].line : 0)}</div>
    ${withErrors ? errorsPanel() : ''}
  </div>`;
}

// ---- text / data ----------------------------------------------------------

function textRows(selected, skip = 0) {
  const rows = M.stepping.text.filter((r) => !r.kernel).slice(skip);
  const pc = M.stepping.registers.pc;
  return rows.map((r, i) => {
    const band = (!r.source && i > 0) || (r.source && rows[i + 1] && !rows[i + 1].source);
    const cls = ['trow', r.addr === pc ? 'pc' : '', r.addr === selected ? 'sel' : '', band ? 'band' : ''].join(' ');
    return `<div class="${cls}"><span class="bp"></span><span class="addr">${r.addr.slice(2)}</span><span class="word">${r.word}</span>
      <span><span class="badge b-${r.format}">${r.format}</span></span><span class="dis">${esc(r.disassembly)}</span>
      <span class="lno">${r.line ?? ''}</span><span class="src">${esc(r.source)}</span></div>`;
  }).join('');
}

function textPanel({ cols = 'cols-full', selected = '', skip = 0, pre = '' } = {}) {
  const kernel = M.stepping.text.filter((r) => r.kernel).length;
  const user = M.stepping.text.length - kernel;
  return `<div class="panel ${cols}">
    <div class="phead"><span class="tabs"><span class="on">Text</span><span>Data</span></span><span class="grow"></span>
      <span class="meta">사용자 명령 ${user}개</span></div>${pre}
    <div class="theader"><span></span><span>주소</span><span class="word">기계어</span><span>형식</span><span>명령</span><span>줄</span><span>소스</span></div>
    <div class="pbody text">${textRows(selected, skip)}
      <div class="fold">커널 코드(예외 처리기) ${kernel}개 명령은 기본으로 숨김 <b>보기</b></div></div>
  </div>`;
}

// ---- registers ------------------------------------------------------------

function special() {
  const r = M.stepping.registers;
  return [['PC', r.pc], ['HI', r.hi], ['LO', r.lo]].map(([name, h]) => {
    const v = parseInt(h, 16);
    return { name, hex: h, dec: String(v | 0), bin: (v >>> 0).toString(2).padStart(32, '0').match(/.{4}/g).join(' '), changed: false };
  });
}

function rrow(r, mode) {
  const zero = r.hex === '0x00000000';
  const cls = `rrow${r.changed ? ' chg' : ''}${zero && !r.changed ? ' zero' : ''}`;
  const bin = mode === 'full' ? `<span class="bin">${r.bin}</span>` : '';
  return `<div class="${cls}"><span class="rn">${r.name}</span><span class="hex">${r.hex}</span><span class="dec">${r.dec}</span>${bin}</div>`;
}

function registerRows(mode) {
  const byName = Object.fromEntries([...special(), ...M.stepping.registers.general].map((r) => [r.name, r]));
  const names = { Special: '특수', 'Return values': '반환값', Arguments: '인자', Temporaries: '임시', Saved: '보존', Pointers: '포인터', Reserved: '예약' };
  return M.stepping.registers.groups.filter((g) => g.title !== 'CP0').map((g) =>
    `<div class="rgroup">${names[g.title] ?? g.title}</div>${g.names.map((n) => rrow(byName[n], mode)).join('')}`).join('');
}

function registersPanel(mode = 'full') {
  return `<div class="panel regs r-${mode === 'full' ? 'full' : 'hexdec'}">
    <div class="phead"><span class="name">레지스터</span><span class="grow"></span><span class="meta">16진 · 10진${mode === 'full' ? ' · 2진' : ''}</span></div>
    <div class="rhead"><span>이름</span><span>16진</span><span style="text-align:right">10진</span>${mode === 'full' ? '<span>2진</span>' : ''}</div>
    <div class="pbody">${registerRows(mode)}
      <div class="fold">CP0 · FP 레지스터는 기본으로 숨김 <b>보기</b></div></div>
  </div>`;
}

function justChanged() {
  const r = M.stepping.registers.general.find((x) => x.changed);
  return `<div class="justchanged"><b>방금 바뀜</b> ${r.name} ← ${r.hex} = ${r.dec}<br>${r.bin}</div>`;
}

function compactRegisters() {
  const all = [...special(), ...M.stepping.registers.general];
  const half = Math.ceil(all.length / 2);
  return `<div class="panel regs r-hexdec">
    <div class="phead"><span class="name">레지스터</span><span class="grow"></span><span class="meta">16진 · 10진 — 2진은 바뀐 것만</span></div>
    ${justChanged()}
    <div class="pbody rsplit"><div>${all.slice(0, half).map((r) => rrow(r, 'hexdec')).join('')}</div>
      <div>${all.slice(half).map((r) => rrow(r, 'hexdec')).join('')}</div></div>
  </div>`;
}

function registerStrip(showChanged) {
  const c = M.stepping.registers.general.find((x) => x.changed);
  return `<div class="strip"><span class="vt">레지스터</span>${showChanged ? `<span class="chip">${c.name} ${c.hex}</span>` : ''}</div>`;
}

// ---- inspector ------------------------------------------------------------

function inspector() {
  const I = M.inspector;
  const names = I.lines[4];
  const starts = [...names.matchAll(/\S+/g)].map((m) => m.index);
  const meaning = (k) => I.lines[6].slice(starts[k], starts[k + 1] ?? undefined).trim();
  const total = 32;
  const bits = I.fields.map((f) => `<div class="f f-${f.name}" style="flex:${f.high - f.low + 1}">
      <div class="range"><span>${f.high}</span><span>${f.high !== f.low ? f.low : ''}</span></div>
      <div class="b">${f.bits}</div><div class="fn">${f.name}</div></div>`).join('');
  const table = I.fields.map((f, k) => `<tr><td><span class="sw f-${f.name}"></span>${f.name}</td><td class="code">${f.high}–${f.low}</td>
      <td class="code">${f.bits}</td><td class="code">${f.value}</td><td>${esc(meaning(k))}</td></tr>`).join('');
  return `<div class="ihead"><span class="dis">${esc(I.disassembly)}</span><span class="badge b-${I.format}">${I.format}</span>
      <span class="grow"></span><span class="meta code" style="color:var(--muted)">${I.word} · ${I.addr}</span><span class="iconbtn" style="font-size:16px;color:var(--text-2)">✕</span></div>
    <div class="isub">소스 <span class="code">${esc(I.source)}</span></div>
    <div class="bits">${bits}</div>
    <table class="ftable"><tr><th>필드</th><th>비트</th><th>값(2진)</th><th>값</th><th>뜻</th></tr>${table}</table>
    <div class="explain"><b>${I.name}</b> — ${I.expansion}. <span class="code">$t6</span>(= <span class="code">${I.values.rt}</span>)을
      shamt만큼 오른쪽으로 옮겨 <span class="code">$s1</span>에 넣습니다. 빈 자리는 부호 비트로 채웁니다.</div>`;
}

// ---- console ----------------------------------------------------------------

const consoleBar = () =>
  `<div class="console-bar"><b>콘솔</b><span>아직 출력이 없습니다 — 프로그램이 출력하면 여기가 커집니다</span></div>`;

// ---- the scenes -------------------------------------------------------------

function welcome1() {
  const actions = `<div class="actions">
      <div class="action main">${icon('file-text')}<div><b>예제 열기</b><span>lab04.s — 4주차 비트 연산</span></div></div>
      <div class="action">${icon('circle-question-mark')}<div><b>튜토리얼</b><span>20단계, 10분쯤</span></div></div>
      <div class="action">${icon('file-plus')}<div><b>새 파일</b><span>빈 .s 파일</span></div></div>
      <div class="action">${icon('folder-open')}<div><b>파일 열기</b><span>Ctrl+O</span></div></div></div>`;
  const narrow = SIZE === 'narrow';
  return `<div class="welcome"><div class="wcard" style="${narrow ? 'grid-template-columns:1fr;padding:28px' : ''}">
    ${char('hello', narrow ? 150 : 210)}
    <div><h1>안녕하세요!</h1><p class="lead">MIPS 어셈블리를 쓰고, 어셈블하고, 한 줄씩 실행해 보는 곳입니다.<br>처음이라면 예제나 튜토리얼부터 시작해 보세요.</p>${actions}</div>
    <div class="recent">최근 파일 ${M.recent.map((f) => `<span class="f">${f}</span>`).join('')}</div>
  </div></div>`;
}

function emptyEditor2() {
  return `<div class="panel"><div class="phead"><span class="name">편집기</span><span class="meta">제목 없음.s</span></div>
    <div class="pbody"><div class="editor"><div class="ln cur"><span class="no">1</span><span class="ghosttext"># 여기에 MIPS 코드를 씁니다</span></div></div>
      <div class="empty" style="height:calc(100% - 60px)">
        <div class="say"><h3>무엇부터 할까요?</h3><p>코드를 바로 써도 되고, 예제를 열어 봐도 됩니다.</p>
          <p style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
          <span class="btn primary">${icon('file-text')}예제 열기 (lab04.s)</span><span class="btn">${icon('circle-question-mark')}튜토리얼</span>
          <span class="btn ghost">${icon('folder-open')}파일 열기</span></p></div>
        ${char('guide', SIZE === 'narrow' ? 130 : 170)}</div></div></div>`;
}

function layout1() {
  const pad = 'padding:8px;gap:8px;';
  if (SCENE === 'A') return `<div class="main">${welcome1()}</div>`;
  if (SCENE === 'B') return `<div class="main" style="${pad}">${editorPanel({ withErrors: true })}</div>`;
  const regW = SIZE === 'wide' ? 540 : 530;
  // With the sheet up, the list scrolls so that the chosen row sits just above it.
  const skip = SCENE === 'D' ? (SIZE === 'wide' ? 8 : SIZE === 'mid' ? 17 : 14) : 0;
  const withSheet = (inner, h) => `<div style="position:relative;min-height:0;display:grid">${inner}
      ${SCENE === 'D' ? `<div class="insp sheet" style="height:${h}"><div class="grip"></div>${inspector()}</div>` : ''}</div>`;
  if (SIZE === 'narrow') {
    return `<div class="main" style="${pad}grid-template-rows:${SCENE === 'D' ? '1fr' : '55fr 45fr'} 30px">
      ${withSheet(`<div style="display:grid;min-height:0">${textPanel({ selected: SCENE === 'D' ? M.inspector.addr : '', skip })}</div>`, '64%')}
      ${SCENE === 'D' ? '' : compactRegisters()}${consoleBar()}</div>`;
  }
  return `<div class="main" style="${pad}grid-template-columns:${regW}px 1fr;grid-template-rows:1fr 30px">
    <div style="grid-row:1/3;display:grid;min-height:0">${registersPanel('full')}</div>
    ${withSheet(textPanel({ selected: SCENE === 'D' ? M.inspector.addr : '', skip }), SIZE === 'wide' ? '46%' : '60%')}
    ${consoleBar()}</div>`;
}

function layout2() {
  const pad = 'padding:8px;gap:8px;';
  if (SIZE === 'narrow') {
    const tab = { A: 0, B: 0, C: 1, D: 1 }[SCENE];
    const tabs = ['코드', '기계어', '레지스터', '콘솔'].map((t, i) =>
      `<span class="${i === tab ? 'on' : ''}"><span>${t}${t === '코드' && SCENE === 'B' ? ' <b class="count">1</b>' : ''}</span></span>`).join('');
    let body;
    if (SCENE === 'A') body = emptyEditor2();
    else if (SCENE === 'B') body = editorPanel({ withErrors: true });
    else {
      const c = M.stepping.registers.general.find((x) => x.changed);
      const chips = `<div class="chips"><span class="meta" style="color:var(--muted)">방금 바뀜</span><span class="chip">${c.name} ← ${c.hex}</span><span class="meta" style="color:var(--muted)">PC <span class="code">${M.stepping.registers.pc}</span></span></div>`;
      body = textPanel({ selected: SCENE === 'D' ? M.inspector.addr : '', pre: chips });
    }
    const overlay = SCENE === 'D' ? `<div class="scrim"></div><div class="insp overlay" style="width:88%">${inspector()}</div>` : '';
    return `<div class="main" style="grid-template-rows:1fr 44px;min-height:0"><div style="${pad}display:grid;min-height:0;position:relative">${body}${overlay}</div>
      <div class="btabs">${tabs}</div></div>`;
  }
  const regW = SIZE === 'wide' ? 540 : 530;
  if (SCENE === 'A') return `<div class="main" style="grid-template-columns:1fr 44px"><div style="${pad}display:grid;min-height:0">${emptyEditor2()}</div>${registerStrip(false)}</div>`;
  if (SCENE === 'B') return `<div class="main" style="grid-template-columns:1fr 44px"><div style="${pad}display:grid;min-height:0">${editorPanel({ withErrors: true })}</div>${registerStrip(false)}</div>`;
  const rail = `<div class="rail">${icon('file-text')}<span class="vt">코드</span><span class="file">lab04.s</span></div>`;
  const center = `<div style="display:grid;grid-template-rows:1fr 30px;gap:8px;min-height:0">${textPanel({ selected: SCENE === 'D' ? M.inspector.addr : '' })}${consoleBar()}</div>`;
  if (SCENE === 'C') {
    return `<div class="main" style="grid-template-columns:48px 1fr ${regW}px;min-height:0">${rail}
      <div style="${pad}display:grid;grid-template-columns:1fr ${regW}px;grid-column:2/4;min-height:0">${center}<div style="display:grid;min-height:0">${registersPanel('full')}</div></div></div>`;
  }
  // D: the Inspector opens at the side; at mid width the registers fold to a strip.
  const inspW = SIZE === 'wide' ? 470 : 450;
  const regs = SIZE === 'wide' ? `<div style="display:grid;min-height:0">${registersPanel('hexdec')}</div>` : registerStrip(true);
  const cols = SIZE === 'wide' ? `1fr ${inspW}px 330px` : `1fr ${inspW}px 44px`;
  return `<div class="main" style="grid-template-columns:48px 1fr;min-height:0">${rail}
    <div style="${pad}display:grid;grid-template-columns:${cols};min-height:0;${SIZE === 'wide' ? '' : 'padding-right:0'}">${center}
      <div class="panel insp side" style="border-radius:8px">${inspector()}</div>${regs}</div></div>`;
}

document.getElementById('app').innerHTML = `<div class="app">${topbar()}${DIR === '1' ? layout1() : layout2()}${statusbar()}</div>`;
