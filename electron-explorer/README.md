# API Signal Explorer — Electron Desktop

Embedded **side-by-side** layout: proxied browser (left 25%) + Next.js Explorer (right 75%).  
Based on the [electron-example-browserview](https://github.com/mamezou-tech/electron-example-browserview) pattern using `WebContentsView`.

## Layout

- **Top**: Toolbar (Orbitron, dark-grid) — URL input + Go for the **left** (proxied) browser.
- **Left 25%**: Proxied browser. Session: `persist:explorer` with `setProxy({ proxyRules: 'http://127.0.0.1:8080' })` and `setCertificateVerifyProc` to accept mitmproxy’s HTTPS cert.
  - **Mapping (Octoparse-style)**: `browser_preload.js` + injected `browser_mapper_inject.js`. On **hover**: outline `#ff5757`. On **click**: XPath + CSS selector → `action-signal` IPC → main → WebSocket bridge → Next.js. `correlate` uses a **3-second** window for Electron click/type.
- **Right 75%**: Next.js at `http://localhost:3000/tools/api-signal-explorer` (default session, no proxy). Create or open a **browser-mode** neuromap to connect the WebSocket and see action-linked API logs from left-panel clicks.

## Prerequisites

1. **Next.js** running: `npm run dev` (or `pnpm dev`) so `http://localhost:3000` serves the app.
2. **mitmproxy** with the stream addon:  
   `mitmproxy -s tools/mitmproxy/stream_ws.py` (proxy on `127.0.0.1:8080`).
3. **Bridge**: `npm run mitm:bridge` so the Explorer can receive events.

## Run

```bash
# From project root — start Next.js first, then:
cd electron-explorer
npm install
npm start
```

Or from root (if you add a script):

```bash
npm run dev          # Terminal 1: Next.js
npm run mitm:bridge  # Terminal 2: bridge
mitmproxy -s tools/mitmproxy/stream_ws.py  # Terminal 3: mitmproxy
npm run explorer:desktop   # Terminal 4: this Electron app
```

## Env (optional)

- `EXPLORER_URL` — Right panel URL (default: `http://localhost:3000/tools/api-signal-explorer`).
- `MITM_PROXY` — Proxy for the left browser (default: `http://127.0.0.1:8080`).
- `BRIDGE_WS` — WebSocket for action-signal broadcast (default: `ws://localhost:8787/explorer`).

## References

- [electron-example-browserview](https://github.com/mamezou-tech/electron-example-browserview) — `WebContentsView`, layout.
- [Electron: session.setProxy](https://www.electronjs.org/docs/latest/api/session#sessetproxyconfig) — proxy for `persist:explorer`.
- [Electron: setCertificateVerifyProc](https://www.electronjs.org/docs/latest/api/session#sessetcertificateverifyprocproc) — accept mitmproxy’s cert.
