# Anti-Bot Audit — macOS Chrome Simulation

Compliance matrix, validation hooks, and gaps for the simulated macOS Chrome instance (Electron API Signal Explorer).

---

## 1. Protocol & Network (The Digital Handshake)

| Criterion | Status | Implementation | Verification |
|-----------|--------|----------------|--------------|
| **JA4 Hash** | ✓ | All outbound from the *browser* panel uses Chromium net (Electron `WebContents` + `session`). Main-process HTTP uses `net.request` (native-net). | **Manual:** In the app, navigate the **browser** (left) to https://tls.peet.ws. Compare JA4 to a known retail macOS Chrome. Menu: View → "Open tls.peet.ws (JA4)". |
| **HTTP/2 Consistency** | ✓ | We do not set custom SETTINGS, connection window, or HPACK. Chromium defaults used. `applyProtocolShadow` enables `NetworkService` only; it does not override HTTP/2 parameters. | Assert: no code passes custom `initialWindowSize` or `SETTINGS` to the stack. See `utils/stealth/anti-bot-audit.ts` → `HTTP2_AUDIT_NOTE`. |
| **Intent Delay 30–150ms** | ✓ | `dom-signal-inject.js`: on mousedown, `preventDefault` + `stopImmediatePropagation`, then `setTimeout(30 + Math.floor(Math.random()*120), …)` before synthetic mousedown/mouseup/click. | `getIntentDelayConfigured()` → `{ min: 30, max: 149 }`. `assertIntentDelayInRange(30, 149)` → PASS. |

---

## 2. Biological Fidelity (The Human Marker)

| Criterion | Status | Implementation | Verification |
|-----------|--------|----------------|--------------|
| **WindMouse Linearity < 0.15** | ✓ | `src/stealth/physics-mouse.ts`: WindMouse (gravity, wind, friction), overshoot, saccadic suppression. | `computeLinearityScore(path)` in `utils/stealth/anti-bot-audit.ts`. Record a move path and assert `score < 0.15`. |
| **Micro-tremor 0.08–0.26px** | ✓ | `getTremorOffset`: `amp = 0.08 + 0.18*rng()` → [0.08, 0.26]. Exported `TREMOR_AMP_PX`. | `assertTremorAmplitudeInRange(amp)` in anti-bot-audit. |
| **Fatigue after 15 min** | ✓ | `SessionFatigue`: `getWindScale` / `getDelayMuScale` scale with `min(actions, cap)`. `getTimeScale()` adds +5% after 15 min elapsed. | `getFatigueAuditNote()`. Cap 60 ≈ 15 min at ~1 action/15s. |
| **Fidget: 1–2 curiosity hovers on idle** | ✓ | `scheduleMicroChaos` (200–800ms after load, 1–2 moves) + idle jitter (1200–2000ms after load, 1–2 ±3px moves). | Count and interval hardcoded in `main.ts` `did-finish-load`. |

---

## 3. Engine Authenticity (The Technical Truth)

| Criterion | Status | Implementation | Verification |
|-----------|--------|----------------|--------------|
| **Error stack: strip Electron/Node → chrome://** | ✓ | `stealth-inject.js`: `Error.prepareStackTrace` override; replace `/electron|node_modules|node\.js|\.asar/` with `chrome://browser/`. | Throw in console, inspect `stack`; should contain `chrome://` and not `electron` or `node_modules`. |
| **userAgentData high-entropy, Mac M-series** | ✓ | `stealth-inject.js`: override `navigator.userAgentData.getHighEntropyValues` to force `platform: 'macOS'`, `architecture: 'arm'`, `bitness: '64'`, `model: ''`. | In target: `navigator.userAgentData.getHighEntropyValues([...])` and check values. |
| **process, Buffer, require invisible** | ✓ | `stealth-inject.js`: `delete window.process|Buffer|require|global` when present. Preload uses `contextIsolation`; no Node in page. | In page: `typeof process` → `'undefined`; no `window.require`. |
| **Canvas: Apple Silicon anti-aliasing** | ⚠ Gap | Not implemented. Would require `getImageData`/`toDataURL` hook or injected noise to mimic M-series GPU artifacts. | **Gap:** Canvas fingerprint can still diverge from real Mac. Consider a dedicated canvas-noise inject (experimental). |

---

## 4. System Integrity (The macOS Shell)

| Criterion | Status | Implementation | Verification |
|-----------|--------|----------------|--------------|
| **ASAR: EnableEmbeddedAsarIntegrityValidation** | ⚠ Build-time | Fuse must be enabled at **packaging** with `@electron/fuses`: `EnableEmbeddedAsarIntegrityValidation: true`, `OnlyLoadAppFromAsar: true`. Not settable from `main.ts`. | **Build:** Use `flipFuses` in packager (e.g. Electron Forge, `@electron/packager` 18.3.1+). See [Electron ASAR integrity](https://www.electronjs.org/docs/latest/tutorial/asar-integrity). |
| **Hardened Runtime, allow-jit + allow-unsigned-executable-memory** | ⚠ Build-time | App must be signed and notarized. Entitlements: `com.apple.security.cs.allow-jit`, `com.apple.security.cs.allow-unsigned-executable-memory` only. | **Build:** Use `tools/entitlements.mac.plist` (or similar) in signing. No `disable-library-validation` etc. |
| **performance.now() ±2µs jitter** | ✓ | `stealth-inject.js`: override `performance.now` to add `(Math.random()-0.5)*2*jitterUs/1000` ms (±2µs). | In console: sample `performance.now()`; resolution should show sub-ms jitter. |

---

## 5. Intelligence & Mapping (The Octoparse Core)

| Criterion | Status | Implementation | Verification |
|-----------|--------|----------------|--------------|
| **Click → API/WebSocket correlation (100%)** | ✓ | `linkActionToEvents` in `correlate.ts`; 2s window. Actions from `target-action`, `SIGNAL_DOM_ACTION`, `action`; events from `events_batch`. | `computeClickCorrelationRatio(actions, 2000)`. 100% when every click that triggers a request is linked; some clicks have no network (excluded). |
| **Hidden DOM: ≥3 per run** | ✓ | `hidden-dom-inject.js`: hidden inputs, `[data-token|data-key|...]`, inline script key-like strings. PostMessage `HIDDEN_DOM_DISCOVERY` → main → Explorer. | `assertHiddenDomCount(findings, 3)`. Deep Recon → Apex: "Hidden DOM: N (≥3)". Depends on page having hidden inputs/data-*; may be <3 on minimal pages. |
| **Wasm: all .wasm → .wat, indexed for search** | ✓ | mitmproxy `stream_ws` captures `application/wasm` → `wasmPath`; `runWasmRecon` → wasm2wat, scan, JS stubs. Explorer `wasmDecompiled` + search input in Wasm tab. | All flows with `wasmPath` are processed. Wasm tab has search over path, endpoints, keys, exportedFuncs. |

---

## 6. Font & Rendering (The macOS Glyph Truth)

| Criterion | Status | Implementation | Verification |
|-----------|--------|----------------|--------------|
| **NSScreen.backingScaleFactor → Chromium** | ✓ | Native addon `desktop/native-mac`: `getBackingScaleFactor()` from `[NSScreen mainScreen] backingScaleFactor]`. Main applies `--force-device-scale-factor` before any window. | Correct `devicePixelRatio`, canvas, and subpixel layout vs. retina. Run on Retina Mac; `window.devicePixelRatio` should match display (typically 2). |
| **CoreText getGlyphMetrics** | ✓ | Addon: `CTFontCreateWithName`, `CTLineCreateWithAttributedString`, `CTLineGetTypographicBounds` → `{ width, ascent, descent, ok }`. | `getGlyphMetrics('Helvetica', 16, 'Hi')` returns CoreText values. |
| **measureText override (opt-in)** | ✓ | When `DEEP_RECON_MEASURE_TEXT_NATIVE=1`, stealth-inject overrides `CanvasRenderingContext2D.measureText` to call `__getGlyphMeasure` (preload → `get-glyph-measure` IPC → addon). | Set env, load page, `ctx.measureText('x')` uses CoreText when font/size matched. |
| **--lang from NSLocale** | ✓ | Addon `getLocale()` → `[[NSLocale currentLocale] localeIdentifier]`; main sets `--lang` before app.ready. | App language matches system. |
| **TZ from NSTimeZone** | ✓ | Addon `getTimezone()`; main sets `process.env.TZ` before app.ready. | `Intl`, `Date` match system timezone. |
| **navigator.deviceMemory from sysctl** | ✓ | Addon `getDeviceMemory()` from `HW_MEMSIZE`; main sets `window.__deviceMemory` before stealth-inject; stealth defines `navigator.deviceMemory`. | `navigator.deviceMemory` matches physical RAM (4–64 GB). |
| **--enable-font-subpixel-positioning** | ✓ | `configureMacOSRendering` in integrity-shield. | Chromium uses subpixel positioning; closer to macOS. |
| **WebGL UNMASKED_VENDOR / RENDERER** | ✓ | stealth-inject: override `getParameter(0x1F01)` → "Apple Inc.", `0x1F02` → "Apple M1" (arm) or "Apple Intel Inc. Intel Iris OpenGL Engine" (x64). | Reduces WebGL fingerprint delta. |
| **Canvas getImageData / fillText rasterization** | ⚠ Gap | Skia still does the actual canvas draw; we match scale and optional measureText. Glyph rasterization in `fillText` remains Skia. | **Gap:** `getImageData` hashes can still diverge. Correct `backingScaleFactor` removes the main scale mismatch. |

**Build (native addon):** On macOS, run `npm run rebuild:mac` from `desktop/` (or `node desktop/scripts/rebuild-mac-addon.js`). Requires `node-gyp`, `Xcode` CLT, and `node-addon-api` (installed in `desktop/native-mac`). Builds for Electron’s Node. **Packaging:** Add `desktop/native-mac` to `asarUnpack` (the `.node` binary cannot live inside asar).

---

## Test Scaffold & Assertions

- **`utils/stealth/anti-bot-audit.ts`**
  - `assertIntentDelayInRange`, `getIntentDelayConfigured`
  - `computeLinearityScore`, `assertLinearityScore`
  - `assertTremorAmplitudeInRange`, `TREMOR_AMP_PX`
  - `getFatigueAuditNote`
  - `computeClickCorrelationRatio`, `assertHiddenDomCount`
  - `searchWasmIndex`, `JA4_VERIFICATION`, `HTTP2_AUDIT_NOTE`

- **Runtime**
  - `dom-signal-inject.js`: intent delay 30+random*120.
  - `stealth-inject.js`: stacks, userAgentData, process/Buffer/require hide, `performance.now` jitter, `navigator.deviceMemory`, WebGL spoof, optional `measureText` override.
  - `hidden-dom-inject.js`: run on `did-finish-load`; `HIDDEN_DOM_DISCOVERY` → Explorer.
  - `physics-mouse`: `TREMOR_AMP_PX`, `SessionFatigue` + `getTimeScale` (15 min).
  - `desktop/native-mac`: `getBackingScaleFactor`, `getGlyphMetrics`, `getLocale`, `getTimezone`, `getDeviceMemory`. Main: `--force-device-scale-factor`, `--lang`, `TZ`, `__deviceMemory`; `get-glyph-measure` IPC.

---

## Gaps & Fidelity Risks

| Gap | Impact | Mitigation |
|-----|---------|------------|
| **Canvas** | Canvas fingerprint can differ from real Mac M-series. `backingScaleFactor` and opt-in CoreText `measureText` reduce the main deltas; Skia `fillText` rasterization and `getImageData` hashes remain. | Future: inject or hook `getImageData`/`toDataURL` with Apple Silicon–like anti-aliasing noise. |
| **ASAR / Hardened Runtime** | Require build and entitlements; not runtime. | Use `@electron/fuses` and `entitlements.mac.plist` in CI/release. |
| **JA4** | Depends on Chromium/Electron version; can drift from latest retail Chrome. | Re-verify after Electron upgrades; document target Chrome version. |
| **Hidden DOM <3** | On minimal pages, findings may be <3. | Criterion is "at least 3 *per run*" on a typical app page; document that sparse DOM can yield <3. |

---

## Quick Checks

1. **JA4:** View → "Open tls.peet.ws (JA4)" in the browser panel; compare to reference.
2. **Intent delay:** In `dom-signal-inject.js`, delay is `30 + Math.floor(Math.random()*120)` → [30,149] ms.
3. **Tremor:** `physics-mouse` exports `TREMOR_AMP_PX`; `getTremorOffset` uses it.
4. **Stacks:** Throw in the target page; stack should have `chrome://` and not `electron` or `node_modules`.
5. **performance.now:** In console, `performance.now()` should show ~µs-level jitter.
6. **Hidden DOM:** Load a page with forms/hidden inputs; Deep Recon → Apex shows "Hidden DOM: N (≥3)".
7. **Wasm:** Load a page that fetches .wasm; Deep Recon → Wasm lists it and search works.
8. **Font/rendering:** On macOS, run `npm run rebuild:mac` in `desktop/` then start the app; `window.devicePixelRatio` should match display. `navigator.deviceMemory` should match physical RAM. WebGL `getParameter(0x1F02)` → "Apple M1" (or Intel). Optional: `DEEP_RECON_MEASURE_TEXT_NATIVE=1` for CoreText-backed `measureText`.
