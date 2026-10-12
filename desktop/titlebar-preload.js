// What the title bar (titlebar.html) can ask of the app, as window.bar: to go back, forward or
// reload the site, to copy its address, and to take a screenshot of it, or a long one of the
// whole page. main.js only answers
// the window's own title bar.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bar', {
  platform: process.platform,
  back: () => ipcRenderer.send('bar-back'),
  forward: () => ipcRenderer.send('bar-forward'),
  reload: () => ipcRenderer.send('bar-reload'),
  // True once the link's on the clipboard.
  copy: () => ipcRenderer.invoke('bar-copy'),
  // True once it's on the clipboard and saved in Pictures. long: the whole page, not just
  // what's on screen.
  screenshot: (long) => ipcRenderer.invoke('bar-screenshot', Boolean(long)),
  // { url, display, canBack, canForward, loading, fullscreen, color }, each time any changes.
  onState: (cb) => ipcRenderer.on('bar-state', (_e, s) => cb(s)),
});
