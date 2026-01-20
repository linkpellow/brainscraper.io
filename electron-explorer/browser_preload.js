/**
 * Preload for the left (proxied) BrowserView.
 * Listens for postMessage 'explorer-action-signal' from the injected mapper
 * and forwards to main via IPC.
 */
const { ipcRenderer } = require('electron');

window.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'explorer-action-signal' && e.data.payload) {
    ipcRenderer.send('action-signal', e.data.payload);
  }
});
