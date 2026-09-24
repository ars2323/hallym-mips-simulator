/* The window's only way to the simulator.  CommonJS because a sandboxed
   preload cannot be an ES module. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sim', {
  call: (method, ...args) => ipcRenderer.invoke('sim:call', method, args),
  stop: () => ipcRenderer.invoke('sim:stop'),
  example: () => ipcRenderer.invoke('app:example'),
  onConsole: (listener) => ipcRenderer.on('sim:console', (_e, text) => listener(text)),
  onCrashed: (listener) => ipcRenderer.on('sim:crashed', (_e, message, detail) => listener(message, detail)),
  wiringDone: (report) => ipcRenderer.send('wiring:done', report),
});
