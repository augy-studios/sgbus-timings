// What Make it yours (setup.html) can ask of the app, as window.sgbusSetup: what's kept now, and to
// keep what's picked. setup.js checks each request comes from its own window.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sgbusSetup', {
  get: () => ipcRenderer.invoke('setup-get'),
  finish: (values) => ipcRenderer.invoke('setup-finish', values),
});
