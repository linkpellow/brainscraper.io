# Gap-Filler Architecture — Summary

Implementations for the four anti-bot gaps and the three “Deep Recon” features.

---

## Gap 1: TLS & HTTP/2 (JA4) Alignment

**Issue:** Node `fetch`/`axios` use OpenSSL and produce a different TLS/HTTP2 fingerprint than Chromium; JA4 and similar can detect non-browser clients.

**Fix:**
- **`desktop/fetchViaChromium.ts`**: `fetchViaChromium(url, opts?)` using Electron `net.request` so TLS/HTTP2 match Chromium.
- **Use it** for any main-process HTTP to target (or sensitive) domains.
- **Menu:** View → “Fetch via Chromium (JA4)…” (hits httpbin.org as a test).
- **Doc:** [docs/GAP1-TLS-JA4-NET.md](./GAP1-TLS-JA4-NET.md)

---

## Gap 2: Snapshot-Aware Integrity (Heap Hooks)

**Issue:** Primitives (e.g. `Array.prototype.push`) can be hooked; heap snapshots are outside normal code-signing.

**Fix:**
- **`desktop/integrity-inject.js`**: Hashes `Array.prototype.push`, `Object.keys`, `Function.prototype.apply`, `document.createElement`; sends `INTEGRITY_HASH` to main. Main logs it; can later compare to a baseline.
- **Design for C++ Snapshot-Aware module:** [docs/GAP2-HEAP-INTEGRITY-DESIGN.md](./GAP2-HEAP-INTEGRITY-DESIGN.md)

---

## Gap 3: Micro-Interaction Chaos

**Issue:** Bots are too deterministic; humans fidget (e.g. hover over logo/whitespace) while a page loads.

**Fix:**
- **`desktop/main.ts` → `scheduleMicroChaos(wc)`:** After `did-finish-load`, waits 200–800 ms, then 1–2 `sendInputEvent({ type: 'mouseMove', x, y })` to random viewport coords (80–400, 80–300).
- Invoked right after the injects (stealth, dom-signal, dom-eye, integrity) on each load.

---

## Gap 4: Intent-to-Execution Delay (Signal Lag)

**Issue:** Clicks that trigger a request in &lt;1 ms look automated.

**Fix:**
- **`desktop/dom-signal-inject.js` → `onMousedown`:**  
  - `preventDefault()`, `stopImmediatePropagation()`.  
  - `postMessage(SIGNAL_DOM_ACTION_FORWARD, payload)` (unchanged).  
  - `setTimeout(30 + random(0..120) ms, () => { el.dispatchEvent(mousedown); el.dispatchEvent(mouseup); el.click(); })`.  
- The real mousedown/mouseup/click (and thus the outbound request) occur 30–150 ms after the user’s physical mousedown.

---

## Heap String Extraction (Deep Recon)

**Fix:**
- **`desktop/main.ts` → `probeHeap(wc)`:** Uses `webContents.debugger.attach` + `Runtime.evaluate` to run a snippet that walks `window.__INITIAL_STATE__`, `__NEXT_DATA__`, `gapi`, `accessToken`, `apiKey`, etc., and collects token-like strings (JWT, Bearer, hex, key names).
- **Menu:** View → “Probe heap (browser)”.
- **Result:** Logged and shown in a dialog (first 1500 chars).

---

## WebSocket Sniffing (Gap 6)

**Fix:**
- **`tools/mitmproxy/stream_ws.py`:**  
  - `websocket_message(flow)`: on each WSS message, appends `{ _wss: True, flow_id, from_client, content, is_text, ts }` to `wss_queue`.  
  - Async loop drains `wss_queue` and sends each as a JSON object to the bridge.
- **`src/server/wsMitmBridge.ts`:**  
  - If `parsed._wss === true`, broadcasts `{ type: 'wss_frame', flow_id, from_client, content, is_text, ts }` to explorers.  
  - HTTP flow handling (array of events) unchanged.
- **Explorer:** Can subscribe to `wss_frame` and show WSS traffic in the feed or a separate panel.

---

## Wasm Capture & Decompile (Gap 7)

**Fix:**
- **`tools/mitmproxy/stream_ws.py` → `response`:**  
  - If `Content-Type` contains `wasm` and `flow.response.raw_content` exists, writes to `wasm-captures/<ts>_<sha256-prefix>.wasm` and sets `flow_event["wasmPath"]`.
- **`scripts/decompile-wasm.js`:**  
  - Accepts a `.wasm` path; runs `wasm2c` or `wasm-decompile` (wabt) if in PATH; writes `.c` or `.wat` next to the `.wasm`.
- **`.gitignore`:** `wasm-captures/`.
- **Doc:** [docs/GAP7-WASM-DECOMPILE.md](./GAP7-WASM-DECOMPILE.md)

---

## File / Touchpoints

| Gap / Feature    | Files |
|------------------|-------|
| 1 JA4            | `desktop/fetchViaChromium.ts`, `desktop/main.ts` (menu), `docs/GAP1-TLS-JA4-NET.md` |
| 2 Integrity      | `desktop/integrity-inject.js`, `desktop/preload-browser.ts` (INTEGRITY_HASH), `desktop/main.ts` (load + ipc integrity-hash), `docs/GAP2-HEAP-INTEGRITY-DESIGN.md` |
| 3 Micro-chaos    | `desktop/main.ts` (`scheduleMicroChaos`, call in `did-finish-load`) |
| 4 Intent delay   | `desktop/dom-signal-inject.js` (`onMousedown` preventDefault, delay, synthetic mousedown/mouseup/click) |
| 5 Heap probe     | `desktop/main.ts` (`probeHeap`, View menu “Probe heap (browser)”) |
| 6 WSS            | `tools/mitmproxy/stream_ws.py` (`websocket_message`, `wss_queue`, drain in pump), `src/server/wsMitmBridge.ts` (`_wss` → `wss_frame`) |
| 7 Wasm           | `tools/mitmproxy/stream_ws.py` (wasm write + `wasmPath`), `scripts/decompile-wasm.js`, `docs/GAP7-WASM-DECOMPILE.md`, `.gitignore` wasm-captures/ |
