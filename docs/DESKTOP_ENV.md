# Desktop (API Signal Explorer) — Environment Variables

All environment variables for the Electron Stealth Browser and its dependencies.

**Loading:** The desktop app runs `dotenv.config({ path: project-root/.env })` at startup. Copy `.env.example` to `.env` and set values, or export vars before `npm run desktop`.

---

## Required for desktop to run

| Variable | Default | Description |
|----------|---------|-------------|
| `EXPLORER_URL` | `http://localhost:3000/tools/api-signal-explorer` | URL for the right panel. Next.js must be serving this. |
| `MITM_PROXY` | `http://127.0.0.1:8080` | Proxy for the **browser** (left) panel. mitmproxy must be listening here. |
| `BRIDGE_WS` | `ws://localhost:8787/explorer` | WebSocket bridge for events. Must match `npm run mitm:bridge` and the Explorer's `getBridgeWs()` / `wsUrl`. |

---

## Related services (must match)

| Variable | Where | Default | Description |
|----------|-------|---------|-------------|
| `MITM_WS_URL` | mitmproxy `stream_ws.py` | `ws://127.0.0.1:8787/mitm` | Where stream_ws sends batches. Bridge must be on `://...:8787` with `/mitm` for mitm. |
| `BRIDGE_PORT` | `wsMitmBridge` | `8787` | Port for the WebSocket bridge. Set when running `npm run mitm:bridge` so it matches `BRIDGE_WS` (e.g. `BRIDGE_WS=ws://localhost:9000/explorer` → `BRIDGE_PORT=9000`). |

---

## Optional — Deep Recon / integrity

| Variable | Default | Description |
|----------|---------|-------------|
| `DEEP_RECON_ASAR_BASELINE` | (unset) | When set and app is packaged: SHA256 of `app.asar` header. Mismatch → `asarOk: false`. |
| `DEEP_RECON_HALT_ON_FAIL` | (unset) | `1` or `true`: `process.exit(1)` if V8 or ASAR integrity fails. |
| `DEEP_RECON_MEASURE_TEXT_NATIVE` | (unset) | `1` or `true`: override `CanvasRenderingContext2D.measureText` with CoreText via native addon. |

---

## Optional — native addon (macOS)

The `desktop/native-mac` addon reads from the **system** (NSScreen, NSLocale, NSTimeZone, sysctl). It does not use env. Build with:

```bash
cd desktop && npm run rebuild:mac
```

---

## Checklist before `npm run desktop`

1. **Next.js:** `npm run dev` → `EXPLORER_URL` reachable.
2. **Bridge:** `npm run mitm:bridge` → `ws://localhost:8787` (or your `BRIDGE_WS` host/port).
3. **mitmproxy:** `mitmproxy -s tools/mitmproxy/stream_ws.py` → proxy on `127.0.0.1:8080` (or your `MITM_PROXY`).
4. **macOS addon (optional):** `npm run rebuild:mac` in `desktop/` for font/rendering parity.

Overrides example:

```bash
EXPLORER_URL=http://localhost:3001/app  \
MITM_PROXY=http://127.0.0.1:9999        \
BRIDGE_WS=ws://localhost:9000/explorer  \
npm run desktop
```

Ensure `stream_ws`’s `MITM_WS_URL` and the bridge’s port/path match the same server.

---

## Dependencies

### npm (desktop)

| Package | Purpose |
|---------|---------|
| `dotenv` | Load `.env` from project root before `EXPLORER_URL`, `MITM_PROXY`, `BRIDGE_WS`, `DEEP_RECON_*`. |
| `ws` | WebSocket client for the bridge. |
| `electron` (dev) | Runtime. |
| `node-gyp` (dev) | For `npm run rebuild:mac`. |
| `typescript` (dev) | Build. |

### npm (native-mac)

| Package | Purpose |
|---------|---------|
| `node-addon-api` | N-API C++ bindings. |

### npm (root, for `mitm:bridge`)

| Package | Purpose |
|---------|---------|
| `ws` | WebSocket server in `wsMitmBridge`. |
| `tsx` | Run `wsMitmBridge.ts`. |

### System / external

| Tool | When | Purpose |
|------|------|---------|
| Xcode Command Line Tools | `rebuild:mac` on macOS | C++/ObjC compile. |
| `wasm2wat` (wabt) | Wasm recon | `brew install wabt`. |
| `mitmproxy` | Proxy | `pip install -r tools/mitmproxy/requirements.txt`. |
| Python 3 | mitmproxy, stream_ws | Run `stream_ws.py`. |
