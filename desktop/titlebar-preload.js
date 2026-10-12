// What the title bar (titlebar.html) can ask of the app, as window.bar: to go back, forward or
// reload the site, and to copy its address. main.js only answers the window's own title bar.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bar', {
  platform: process.platform,
  back: () => ipcRenderer.send('bar-back'),
  forward: () => ipcRenderer.send('bar-forward'),
  reload: () => ipcRenderer.send('bar-reload'),
  // True once the link's on the clipboard.
  copy: () => ipcRenderer.invoke('bar-copy'),
  // { url, display, canBack, canForward, loading, fullscreen, color }, each time any changes.
  onState: (cb) => ipcRenderer.on('bar-state', (_e, s) => cb(s)),
});
