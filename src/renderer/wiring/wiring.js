// The wiring check: one round trip through every layer.  Not the UI.
const hex = (n) => '0x' + (n >>> 0).toString(16).padStart(8, '0');
const log = [];
let consoleText = '';
window.sim.onConsole((text) => {
  consoleText += text;
  document.getElementById('console').textContent = consoleText;
});
const crashes = [];
window.sim.onCrashed((message) => crashes.push(message));

function show(rows) {
  document.getElementById('regs').innerHTML =
    rows.map(([k, v]) => `<tr><td>${k}</td><td class="v">${v}</td></tr>`).join('');
}
function note(ok, text) {
  log.push(`${ok ? 'ok ' : 'BAD'} ${text}`);
  const div = document.createElement('div');
  div.className = ok ? 'ok' : 'bad';
  div.textContent = (ok ? '✓ ' : '✗ ') + text;
  document.getElementById('log').append(div);
  return ok;
}

(async () => {
  let ok = true;
  const source = await window.sim.example();
  const assembled = await window.sim.call('assemble', source, { fileName: 'helloworld.s' });
  ok = note(assembled.ok, `assemble: ${assembled.format.encoding}, ${assembled.errors.length} errors`) && ok;
  const run = await window.sim.call('run');
  ok = note(run.reason === 'exit', `run: ${run.reason} at ${hex(run.pc)}`) && ok;
  const r = await window.sim.call('registers');
  show([['PC', hex(r.pc)], ['$v0', hex(r.general[2])], ['$a0', hex(r.general[4])],
        ['$sp', hex(r.general[29])], ['$ra', hex(r.general[31])]]);
  ok = note(r.general[29] === 0x7fffffe4 && r.general[2] === 10, `registers: $sp ${hex(r.general[29])}, $v0 ${r.general[2]}`) && ok;
  ok = note(consoleText === 'Hello World', `console: ${JSON.stringify(consoleText)}`) && ok;
  // The core's fatal_error() ends the utility process; the host starts another.
  try {
    await window.sim.call('assemble', '\t.text\n\t.err\n');
    ok = note(false, 'fatal_error did not end the process') && ok;
  } catch (e) {
    ok = note(/중단/.test(String(e.message)), `fatal_error: ${String(e.message).replace(/^Error invoking remote method 'sim:call': /, '')}`) && ok;
  }
  const again = await window.sim.call('assemble', source, { fileName: 'helloworld.s' });
  const rerun = await window.sim.call('run');
  ok = note(again.ok && rerun.reason === 'exit' && crashes.length === 1, `after the crash: ${rerun.reason}, ${crashes.length} crash reported`) && ok;
  window.sim.wiringDone({ ok, lines: log });
})().catch((e) => window.sim.wiringDone({ ok: false, lines: [...log, 'BAD ' + e.message] }));
