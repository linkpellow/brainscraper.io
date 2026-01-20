# API Signal Explorer – Setup & Manual Steps

## Is Chromium installed?

**For “Launch Chromium” (control a browser and see API calls in the logs):** yes. The app can open a Playwright Chromium window with the mitmproxy proxy pre-configured. You click and browse in that window; requests appear in the Explorer or Neuromap logs.

**For mobile neuromap:** Chromium is not used. The app uses `getDisplayMedia` (screen share) and your normal browser. Playwright/Chromium are also used for CrokDocs and tests.

Install Chromium for the Launch Chromium flow:

```bash
npx playwright install chromium
```

---

## Is the mobile screen-share + mitmproxy feature complete?

**Functionally yes.** Implemented:

- **Screen share:** User clicks “Share screen” in Mobile Neuromap; `getDisplayMedia` captures a window/screen (e.g. AirPlay/Cast of the phone). Retry and error state are shown if share fails.
- **Network events:** mitmproxy → `stream_ws.py` → WebSocket bridge → `/explorer` → Neuromap. Same path for mobile and browser; only the *source* of traffic differs (phone vs desktop browser).
- **Mark Interaction,** endpoint list, category tags, export: all work in mobile mode as in browser mode.

What stays **manual** (and cannot be done by the app):

- Running mitmproxy and the bridge.
- Configuring the **phone’s Wi‑Fi proxy** to the computer and port (e.g. 8080).
- Installing **mitmproxy’s CA on the phone** for HTTPS.
- **Getting the phone’s image onto the computer** (AirPlay, Cast, etc.) so it can be selected in “Share screen”.

---

## What you must do manually

### 1. Python (mitmproxy + websockets)

From the project root:

```bash
pip install -r tools/mitmproxy/requirements.txt
```

Or: `pip install mitmproxy websockets`

---

### 2. Start the WebSocket bridge

```bash
npm run mitm:bridge
```

Runs `wsMitmBridge` on `ws://localhost:8787` (`/mitm` for mitmproxy, `/explorer` for the app). Leave this running.

---

### 3. Start mitmproxy with the stream addon

From the **project root**:

```bash
mitmproxy -s tools/mitmproxy/stream_ws.py
```

Or from `tools/mitmproxy/`:

```bash
mitmproxy -s stream_ws.py
```

`npm run mitm:stream` only prints this; you still need to run it yourself. Default proxy: `127.0.0.1:8080`.

---

### 4. Point your traffic through mitmproxy

**Launch Chromium (easiest):** In API Signal Explorer or Neuromap (Browser mode), click **Launch Chromium**. A Chromium window opens with proxy `127.0.0.1:8080` pre-configured. Browse and click in that window; API calls show in the logs. Requires `npx playwright install chromium`.

**Desktop browser (manual):** System or browser proxy → `localhost` / `127.0.0.1`, port `8080` (or the port mitmproxy shows).

**Phone (mobile neuromap):**

- **Wi‑Fi proxy:** Wi‑Fi → your network → Proxy: Manual → Host: **this computer’s LAN IP** (e.g. `192.168.1.10`), Port: `8080`. Phone and computer must be on the same LAN.
- **HTTPS:** Run `mitmproxy` once, then on the phone (with proxy set) open **http://mitm.it** and install the CA for your OS. Otherwise HTTPS is not decrypted.

---

### 4b. Electron Desktop (embedded browser, side‑by‑side)

**Left panel = proxied browser, right panel = Next.js Explorer in the same window.** No separate Chromium; the browser is embedded.

From project root:

```bash
npm run explorer:desktop:install   # once
npm run explorer:desktop
```

**Before starting:** Next.js (`npm run dev`), `npm run mitm:bridge`, and `mitmproxy -s tools/mitmproxy/stream_ws.py` must be running. The right panel loads `http://localhost:3000/tools/api-signal-explorer`; the left uses proxy `127.0.0.1:8080`.

See `electron-explorer/README.md` for details and `EXPLORER_URL` / `MITM_PROXY` env overrides.

**4c. Desktop (Octoparse-style, `desktop/`) — font/rendering addon on macOS**

The `desktop/` app uses a native addon for `NSScreen.backingScaleFactor`, CoreText glyph metrics, locale, timezone, and `deviceMemory`. On **macOS only**, rebuild the addon before the first run (and after Electron upgrades):

```bash
cd desktop && npm run rebuild:mac
```

Requires: Xcode Command Line Tools, `node-gyp`, and `node-addon-api` (installed in `desktop/native-mac`). If the addon is not built, the app still runs; `--force-device-scale-factor`, `navigator.deviceMemory`, and CoreText-backed `measureText` (opt-in) are skipped. See `docs/ANTI_BOT_AUDIT.md` §6 Font & Rendering.

**Env for desktop:** `EXPLORER_URL`, `MITM_PROXY`, `BRIDGE_WS` (and optional `DEEP_RECON_*`). See `docs/DESKTOP_ENV.md`.

---

### 5. Mobile only: get the phone screen into the app

`getDisplayMedia` can only capture a window/screen on **this computer**. You must show the phone on the computer first, then share that in the app:

- **iOS:** AirPlay to Mac (or an AirPlay receiver), then in the app choose “Share screen” and pick that window.
- **Android:** “Cast” / “Smart View” to Chrome or a cast receiver on the computer, then share that window.

The app cannot start AirPlay or Cast for you.

---

## Checks if it doesn’t work

| Symptom | What to verify |
|--------|-----------------|
| “Bridge not connected” / no events | `npm run mitm:bridge` running; nothing else using port 8787. |
| “No endpoints” but bridge shows connected | mitmproxy running with `-s tools/mitmproxy/stream_ws.py`; device/browser proxy set to this machine and 8080. |
| No HTTPS on phone | mitmproxy CA installed on the phone (http://mitm.it with proxy set). |
| “Share denied” / no picture in mobile | User must choose a window/screen when prompted; that window must be the one showing the phone (AirPlay/Cast). |
| `mitmproxy -s stream_ws.py` not found | Run from project root with `tools/mitmproxy/stream_ws.py`, or `cd tools/mitmproxy` and use `stream_ws.py`. |
| Electron: ERR_CONNECTION_REFUSED on right panel | Next.js not running. Start `npm run dev` so `http://localhost:3000` is up before `npm run explorer:desktop`. |
| Electron: left-panel clicks but no action-linked in logs | Open a **browser-mode neuromap** in the right panel (the WebSocket connects when a neuromap is open). Ensure `npm run mitm:bridge` is running. |

---

## One-off: file export (no bridge)

For a one-time capture without the bridge:

```bash
mitmdump -s tools/mitmproxy/export_flows.py
```

Configure proxy, use the device, then stop mitmdump. It writes `mitm_flows.json` in the current directory. In API Signal Explorer use **Upload mitmproxy Export** and select that file.

---

## Optional: Playwright / Chromium

**Required for “Launch Chromium”** (controlled browser with proxy pre-configured and logs below). Also used for CrokDocs screenshots and Playwright-based tests.

```bash
npx playwright install chromium
```

Not required if you only use manual proxy in your own browser or mobile + screen share.
