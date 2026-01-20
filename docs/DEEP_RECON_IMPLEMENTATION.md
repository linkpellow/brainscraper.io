# Deep Recon — Binary & Memory Suite

End-to-end implementation of the Deep Recon spec: wasm decompilation, heap mining, interaction chaos, native net (JA4/TLS), integrity shield, and the Deep Recon Dashboard.

---

## 1. Wasm Decompiler Bridge (`desktop/wasm-recon.ts`, `utils/deep-recon/wasm-recon.ts`)

- **Intercept:** `.wasm` from mitmproxy `wasmPath` in `events_batch`; `runWasmRecon(path, { url, projectRoot })` in desktop main.
- **wasm2wat:** Spawns `wasm2wat` (wabt). Timeout 30s, handles missing binary, non‑zero exit, empty output.
- **Scan:** Regex for endpoints (URLs, /api, wss), keys (Bearer, base64, hex, `api_key`-style), crypto (opcodes, import names).
- **JS stubs:** `toJavaScriptStubs(exportedFuncs, endpoints, keys)` for offline token emulation.
- **Result:** Sent to Explorer as `wasm-decompiled`; shown in Deep Recon → Wasm.

---

## 2. Heap String Miner (`desktop/heap-miner.ts`, `utils/deep-recon/heap-miner.ts`)

- **takeHeapSnapshot:** CDP `HeapProfiler.takeHeapSnapshot`, collect `addHeapSnapshotChunk`, parse `strings` (or quoted-string fallback).
- **Fallback:** `Runtime.evaluate` over `__INITIAL_STATE__`, `__NEXT_DATA__`, `gapi`, `auth`, `token`, etc.
- **Regex:** JWT, Bearer, apiKey, secret, long hex, base64.
- **Dedupe:** `Map` by `type:value slice`.
- **Result:** `heap-findings` to Explorer; Deep Recon → Memory Vault.

---

## 3. Interaction Chaos

- **physics-mouse (`src/stealth/physics-mouse.ts`):** `idleMicroHover(sink, center, { count, intervalMs, displacementPx })`, `runIdleJitter(sink, cx, cy)`.
- **desktop main `did-finish-load`:**  
  - `scheduleMicroChaos`: 200–800 ms delay, 1–2 `mouseMove` to random viewport coords.  
  - Idle jitter: 1200–2000 ms delay, 1–2 small `mouseMove` (±3 px) around a center.

---

## 4. Network Ghost (`desktop/native-net.ts`, `utils/deep-recon/native-net.ts`)

- **`request` / `fetchViaChromium`:** Electron `net.request` only; no axios/Node `fetch`/`https`.
- **`applyProtocolShadow`:** `--enable-features=NetworkService,NetworkServiceInProcess`, `--disable-features=OutOfBlinkCors` (before `app.ready`).
- **30–150 ms intent-to-execution:** In `dom-signal-inject.js` (mousedown → preventDefault → delay → synthetic mousedown/mouseup/click).
- **WSS:** `stream_ws.py` `websocket_message` → `_wss` JSON → bridge `wss_frame` → Explorer; Deep Recon → WSS.

---

## 5. Zero-Day Integrity & Protocol Shield (`desktop/integrity-shield.ts`)

- **`configureMacOSRendering`:** Before `app.ready`: `--enable-font-antialiasing`, `--force-color-profile=srgb` (Darwin only).
- **`checkV8Integrity`:** Baseline at `userData/.v8-integrity-baseline`; create on first run; compare on later `integrity-hash` from inject.
- **`checkAsarIntegrity`:** When `DEEP_RECON_ASAR_BASELINE` and `app.isPackaged`; compare `app.asar` sha256.
- **`runIntegrityChecks`:** V8 + ASAR; if `DEEP_RECON_HALT_ON_FAIL=1` and either fails → `halted: true`; caller `process.exit(1)`.

---

## 6. Deep Recon Dashboard (Next.js)

- **`DeepReconPanel`:** Tabs: **Memory Vault** (heap findings), **Wasm** (decompiled + scan), **WSS** (live frames), **API Sandbox** (URL + Fetch via native net + `durationMs`), **Apex** (22 criteria + JA4/CreepJS note).
- **Data:** `wasmDecompiled`, `heapFindings`, `wssFrames` state; `onWasmDecompiled`, `onHeapFindings` from `electronBridge`; `wss_frame` in `ws.onmessage`; `sandboxRequest` → `ipcMain.handle('sandbox-request')` → `fetchViaChromium`.
- **Shown:** Only when `isElectron` (and browser-mode neuromap in Electron).

---

## 7. End-to-End Wiring

- **desktop main:**  
  - Before `app.ready`: `applyProtocolShadow`, `configureMacOSRendering`.  
  - `connectBridge` `onMessage`: on `events_batch`, for each `wasmPath` run `runWasmRecon` → `explorerView.webContents.send('wasm-decompiled', res)`.  
  - `integrity-hash` IPC: `runIntegrityChecks(p.hash)` → `process.exit(1)` if `r.halted`.  
  - `probeHeap` → `runHeapMiner` → `send('heap-findings', res)`.  
  - `ipcMain.handle('sandbox-request', …)` → `fetchViaChromium` → return `{ ok, status, body, durationMs }`.  
  - `did-finish-load`: `scheduleMicroChaos` + idle jitter (setTimeout).
- **preload-explorer:** `onWasmDecompiled`, `onHeapFindings`, `sandboxRequest` via `contextBridge`.
- **Bridge:** `_wss` from mitmproxy → `wss_frame` broadcast to explorers.

---

## Verify

1. **Desktop:** `npm run desktop` (or `npm start --prefix desktop`). Next.js on :3000, bridge :8787, mitmproxy :8080.
2. **Wasm:** Load a page that fetches `.wasm`; ensure `stream_ws` has wasm capture and `wasmPath` in the flow; in Explorer, Deep Recon → Wasm should list it after recon. Install `wabt` for `wasm2wat`.
3. **Heap:** View → Probe heap (browser); Deep Recon → Memory Vault.
4. **WSS:** Use a site with WSS; Deep Recon → WSS should show frames.
5. **Sandbox:** Deep Recon → API Sandbox, URL e.g. `https://httpbin.org/get`, Fetch (native) → status and `durationMs`.
6. **Integrity:** First run creates baseline; alter inject hash and set `DEEP_RECON_HALT_ON_FAIL=1` to test halt (optional).

---

## 22 Apex Criteria (Deep Recon → Apex)

All reflected in the checklist: native net, JA4/TLS, 30–150 ms delay, WSS logging, wasm intercept+wasm2wat+scan+JS stubs, heap snapshot/Runtime+regex+Memory Vault, micro-chaos, idle jitter, integrity hash, ASAR, halt on mismatch, macOS font+retina, protocol shadow, AutomationControlled off, intent-to-execution in dom-signal, Wasm UI, API Sandbox+metrics. JA4/CreepJS: run in target to validate.
