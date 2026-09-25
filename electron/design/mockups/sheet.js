const scenes = [['A', '첫 화면'], ['B', '코드를 쓰는 중 (오류)'], ['C', '한 줄씩 실행 중'], ['D', 'Inspector 열림']];
const sizes = ['1920x1080', '1280x800', '960x1080'];
let html = '<table><tr><th></th>' + ['1', '2'].map((d) => sizes.map((s, i) =>
  `<th class="${d === '2' && i === 0 ? 'd2' : ''}">${i === 0 ? `<div class="dir">방향 ${d} — ${d === '1' ? '무대 전환' : '흐름'}</div>` : '<div class="dir">&nbsp;</div>'}${s.replace('x', '×')}</th>`).join('')).join('') + '</tr>';
for (const [s, name] of scenes) {
  html += `<tr><td class="scene">${s}<span>${name}</span></td>` + ['1', '2'].map((d) => sizes.map((z, i) =>
    `<td class="${d === '2' && i === 0 ? 'd2' : ''}"><img src="../../docs/mockups/${s}-${d}-${z}.png"></td>`).join('')).join('') + '</tr>';
}
document.getElementById('t').innerHTML = html + '</table>';
