/* The window's only way out.  CommonJS because a sandboxed preload cannot be
   an ES module.  Results come back as { ok, value } or { ok: false, error }
   and are unwrapped here, so the page sees ordinary promises. */
const { contextBridge, ipcRenderer } = require('electron');

const unwrap = (r) => {
  if (r && r.ok === false) {
    const e = new Error(r.error.message);
    e.name = r.error.name;
    throw e;
  }
  return r && r.ok === true ? r.value : r;
};

contextBridge.exposeInMainWorld('app', {
  call: (method, ...args) => ipcRenderer.invoke('sim:call', method, args).then(unwrap),
  stop: () => ipcRenderer.invoke('sim:stop').then(unwrap),
  onConsole: (listener) => ipcRenderer.on('sim:console', (_e, text) => listener(text)),
  onProgress: (listener) => ipcRenderer.on('sim:progress', (_e, p) => listener(p)),
  onCrashed: (listener) => ipcRenderer.on('sim:crashed', (_e, message, detail) => listener(message, detail)),
  openFile: () => ipcRenderer.invoke('file:open').then(unwrap),
  saveFile: (file) => ipcRenderer.invoke('file:save', file).then(unwrap),
  openExample: (name) => ipcRenderer.invoke('example:open', name).then(unwrap),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (s) => ipcRenderer.invoke('settings:set', s),
});
