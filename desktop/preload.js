// What the site's page can ask of the desktop app, as window.sgbusDesktop: only to show a
// notification (main-site/js/alerts.js), and which version this is. main.js checks each
// request comes from the site itself.
const { contextBridge, ipcRenderer } = require('electron');

const version = (process.argv.find((a) => a.startsWith('--sgbus-version=')) || '').split('=')[1] || null;

contextBridge.exposeInMainWorld('sgbusDesktop', {
  version,
  platform: process.platform,
  // { title, body, url }: url, a #address on the site, is where clicking it opens.
  notify: (n) => ipcRenderer.send('notify', n),
});
