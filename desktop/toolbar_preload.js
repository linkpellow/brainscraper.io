const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('explorerDesktop', {
  navigateBrowser: (url) => ipcRenderer.invoke('navigate-browser', url),
});
