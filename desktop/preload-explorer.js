const { contextBridge, ipcRenderer } = require('electron');

let _onDomActionLinked = null;
let _onWasmDecompiled = null;
let _onHeapFindings = null;
let _onHiddenDomDiscovery = null;

ipcRenderer.on('dom-action-linked', (_e, data) => { if (typeof _onDomActionLinked === 'function') _onDomActionLinked(data); });
ipcRenderer.on('wasm-decompiled', (_e, data) => { if (typeof _onWasmDecompiled === 'function') _onWasmDecompiled(data); });
ipcRenderer.on('heap-findings', (_e, data) => { if (typeof _onHeapFindings === 'function') _onHeapFindings(data); });
ipcRenderer.on('hidden-dom-discovery', (_e, data) => { if (typeof _onHiddenDomDiscovery === 'function') _onHiddenDomDiscovery(data); });

contextBridge.exposeInMainWorld('electronBridge', {
  isElectron: true,
  getBridgeWs: () => (typeof process !== 'undefined' && process.env && process.env.BRIDGE_WS) ? process.env.BRIDGE_WS : 'ws://localhost:8787/explorer',
  onDomActionLinked: (cb) => { _onDomActionLinked = cb; },
  onWasmDecompiled: (cb) => { _onWasmDecompiled = cb; },
  onHeapFindings: (cb) => { _onHeapFindings = cb; },
  onHiddenDomDiscovery: (cb) => { _onHiddenDomDiscovery = cb; },
  sandboxRequest: (url) => ipcRenderer.invoke('sandbox-request', { url }),
});
