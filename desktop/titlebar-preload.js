// What the title bar (titlebar.html) can ask of the app, as window.bar: to go back, forward or
// reload the site, to restart to install a downloaded update, to go to an address typed in it, to copy its address, to take a screenshot of it, or a long one of the
// whole page, and to minimise, maximise or close the window. main.js only answers
// the window's own title bar.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bar', {
  platform: process.platform,
  back: () => ipcRenderer.send('bar-back'),
  forward: () => ipcRenderer.send('bar-forward'),
  reload: () => ipcRenderer.send('bar-reload'),
  // Restarts the app to install the update it's downloaded.
  update: () => ipcRenderer.send('bar-update'),
  minimize: () => ipcRenderer.send('bar-minimize'),
  // Maximises, or restores it if it's maximised already.
  maximize: () => ipcRenderer.send('bar-maximize'),
  close: () => ipcRenderer.send('bar-close'),
  // 'site' once it's opening here, 'browser' once in your browser, null if it isn't an address.
  go: (text) => ipcRenderer.invoke('bar-go', String(text)),
  // The address is being typed in, so keys come here, not to the site; then they go back.
  edit: () => ipcRenderer.send('bar-edit'),
  done: () => ipcRenderer.send('bar-done'),
  // Ctrl+L or F6, from the site: to the address.
  onEdit: (cb) => ipcRenderer.on('bar-edit', () => cb()),
  // True once the link's on the clipboard.
  copy: () => ipcRenderer.invoke('bar-copy'),
  // True once it's on the clipboard and saved in Downloads. long: the whole page, not just
  // what's on screen.
  screenshot: (long) => ipcRenderer.invoke('bar-screenshot', Boolean(long)),
  // { url, display, canBack, canForward, loading, fullscreen, maximized, color, update }, each time
  // any changes.
  onState: (cb) => ipcRenderer.on('bar-state', (_e, s) => cb(s)),
});
