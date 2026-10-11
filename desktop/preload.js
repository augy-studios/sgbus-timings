// What the site's page can ask of the desktop app, as window.sgbusDesktop: to show a
// notification (main-site/js/alerts.js), to open a page in the app's window, and, in a widget
// (widgets.js, main-site/widget.html), its own stop and window. main.js and widgets.js check
// each request comes from the site itself.
const { contextBridge, ipcRenderer } = require('electron');

const arg = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || '').split('=')[1] || null;
const version = arg('sgbus-version');
const widgetId = arg('sgbus-widget');

contextBridge.exposeInMainWorld('sgbusDesktop', {
  version,
  platform: process.platform,
  // { title, body, url }: url, a #address on the site, is where clicking it opens.
  notify: (n) => ipcRenderer.send('notify', n),
  // A #address on the site, in the app's own window.
  open: (hash) => ipcRenderer.send('open-hash', hash),
  // Only in a widget's window: its stop, as { code, name, buses, onTop }.
  ...(widgetId && {
    widget: {
      get: () => ipcRenderer.invoke('widget-get'),
      save: (config) => ipcRenderer.invoke('widget-save', config),
      close: () => ipcRenderer.send('widget-close'),
      onTop: (on) => ipcRenderer.invoke('widget-on-top', on),
    },
  }),
});
