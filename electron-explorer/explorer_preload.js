/**
 * Preload for the right (Next.js Explorer) WebContentsView.
 * Exposes electronBridge.isElectron so the app can adapt the left-panel UI.
 */
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronBridge', {
  isElectron: true,
});
