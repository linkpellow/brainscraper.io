/**
 * API Signal Explorer — Electron Shell (Octoparse-style)
 *
 * Core infrastructure: dedicated session with proxy to mitmproxy at 127.0.0.1:8080.
 * Left = target browser (session + preload-browser). Right = Next.js Explorer.
 */

import { app, WebContentsView, BaseWindow, Menu, ipcMain, session, dialog } from 'electron';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import WebSocket from 'ws';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });
import { fetchViaChromium, applyProtocolShadow } from './native-net';
import { configureMacOSRendering, runIntegrityChecks } from './integrity-shield';
import { runWasmRecon } from './wasm-recon';
import { runHeapMiner } from './heap-miner';

// Neural correlate (DOM action ↔ API flows). No-op if dist not built.
let NeuralCorrelate: new (o?: any) => { ingestDomAction: (d: unknown) => void; ingestFlows: (f: unknown[]) => void } = function (this: any) { this.ingestDomAction = () => {}; this.ingestFlows = () => {}; } as any;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require(path.join(__dirname, '..', 'dist', 'main', 'services', 'correlate.js'));
  if (mod?.NeuralCorrelate) NeuralCorrelate = mod.NeuralCorrelate;
} catch (e) {
  console.warn('[Desktop] NeuralCorrelate not loaded (run: tsc -p src/main/tsconfig.json):', (e as Error)?.message);
}

// --- Native macOS font/rendering (before app.whenReady, before any window) ---
let macFonts: { getBackingScaleFactor?: () => number; getLocale?: () => string; getTimezone?: () => string; getDeviceMemory?: () => number; getGlyphMetrics?: (a: string, b: number, c: string) => { width: number; ok: boolean } } | null = null;
try {
  if (process.platform === 'darwin') macFonts = require(path.join(__dirname, 'native-mac'));
} catch { /* addon not built or load failed */ }
if (macFonts?.getBackingScaleFactor) {
  const s = macFonts.getBackingScaleFactor();
  if (s >= 1 && s <= 3) app.commandLine.appendSwitch('--force-device-scale-factor', String(s));
}
if (macFonts?.getLocale) app.commandLine.appendSwitch('--lang', macFonts.getLocale());
if (macFonts?.getTimezone) process.env.TZ = macFonts.getTimezone();

// --- Stealth & protocol (before app.whenReady) ---
app.commandLine.appendSwitch('--disable-blink-features', 'AutomationControlled');
applyProtocolShadow();
configureMacOSRendering();
// ASAR: EnableEmbeddedAsarIntegrityValidation is a build-time fuse. Use @electron/fuses at pack time. See docs/ANTI_BOT_AUDIT.md.

const EXPLORER_URL = process.env.EXPLORER_URL || 'http://localhost:3000/tools/api-signal-explorer';
const MITM_PROXY = process.env.MITM_PROXY || 'http://127.0.0.1:8080';
const BRIDGE_WS = process.env.BRIDGE_WS || 'ws://localhost:8787/explorer';
const TOOLBAR_HEIGHT = 44;

let mainWindow: InstanceType<typeof BaseWindow> | null = null;
let browserView: InstanceType<typeof WebContentsView> | null = null;
let explorerView: InstanceType<typeof WebContentsView> | null = null;
let bridgeWs: WebSocket | null = null;
let bridgeOnMessage: ((d: Buffer) => void) | null = null;
let neuralCorrelate: { ingestDomAction: (d: unknown) => void; ingestFlows: (f: unknown[]) => void } | null = null;
let domEyeInjectScript: string = '';
let stealthInjectScript: string = '';
let domSignalInjectScript: string = '';
let integrityInjectScript: string = '';
let hiddenDomInjectScript: string = '';

function loadDomEyeScript(): string {
  if (domEyeInjectScript) return domEyeInjectScript;
  domEyeInjectScript = readFileSync(path.join(__dirname, 'dom-eye-inject.js'), 'utf-8');
  return domEyeInjectScript;
}

function loadStealthScript(): string {
  if (stealthInjectScript) return stealthInjectScript;
  stealthInjectScript = readFileSync(path.join(__dirname, 'stealth-inject.js'), 'utf-8');
  return stealthInjectScript;
}

function loadDomSignalScript(): string {
  if (domSignalInjectScript) return domSignalInjectScript;
  domSignalInjectScript = readFileSync(path.join(__dirname, 'dom-signal-inject.js'), 'utf-8');
  return domSignalInjectScript;
}

function loadIntegrityScript(): string {
  if (integrityInjectScript) return integrityInjectScript;
  integrityInjectScript = readFileSync(path.join(__dirname, 'integrity-inject.js'), 'utf-8');
  return integrityInjectScript;
}

function loadHiddenDomScript(): string {
  if (hiddenDomInjectScript) return hiddenDomInjectScript;
  hiddenDomInjectScript = readFileSync(path.join(__dirname, 'hidden-dom-inject.js'), 'utf-8');
  return hiddenDomInjectScript;
}

/** Gap 3: Micro-Interaction Chaos. After load, 1–2 non-functional mouse moves to mimic human fidgeting. */
function scheduleMicroChaos(wc: Electron.WebContents): void {
  const delay = 200 + Math.floor(Math.random() * 600);
  setTimeout(() => {
    try {
      const x1 = 80 + Math.floor(Math.random() * 320);
      const y1 = 80 + Math.floor(Math.random() * 220);
      wc.sendInputEvent({ type: 'mouseMove', x: x1, y: y1 });
      if (Math.random() > 0.5) {
        setTimeout(() => {
          const x2 = 80 + Math.floor(Math.random() * 320);
          const y2 = 80 + Math.floor(Math.random() * 220);
          wc.sendInputEvent({ type: 'mouseMove', x: x2, y: y2 });
        }, 50 + Math.floor(Math.random() * 100));
      }
    } catch { /* ignore */ }
  }, delay);
}

function connectBridge(opts?: { onMessage?: (d: Buffer) => void }): void {
  if (opts?.onMessage) bridgeOnMessage = opts.onMessage;
  if (bridgeWs?.readyState === WebSocket.OPEN) return;
  try {
    bridgeWs = new WebSocket(BRIDGE_WS);
    bridgeWs.on('open', () => console.log('[Desktop] Bridge connected'));
    bridgeWs.on('message', (d: Buffer) => bridgeOnMessage?.(d));
    bridgeWs.on('close', () => { bridgeWs = null; });
    bridgeWs.on('error', () => { bridgeWs = null; });
  } catch {
    bridgeWs = null;
  }
}

function sendTargetActionToBridge(p: { type: string; selector: string; xpath: string; timestamp: number }): void {
  connectBridge();
  if (bridgeWs?.readyState === WebSocket.OPEN) {
    bridgeWs.send(JSON.stringify({ type: 'target-action', eventType: p.type, selector: p.selector, xpath: p.xpath, timestamp: p.timestamp }));
  }
}

// --- 1. Core Infrastructure: session + proxy (The Proxy Fix) ---
// Create dedicated session and set proxy immediately upon creation so all target-site
// traffic is routed through mitmproxy.
const ses = session.fromPartition('persist:explorer');
ses.setProxy({ proxyRules: MITM_PROXY });
ses.setCertificateVerifyProc((_req, cb) => cb(0)); // accept mitmproxy HTTPS cert
// --- 5. Stealth: standard macOS Chrome User-Agent ---
ses.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

function createWindow(): void {
  mainWindow = new BaseWindow({
    width: 1600,
    height: 960,
    title: 'API Signal Explorer',
  });

  // Toolbar
  const toolbar = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'toolbar_preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  toolbar.webContents.loadFile(path.join(__dirname, 'toolbar.html'));
  mainWindow!.contentView!.addChildView(toolbar);
  toolbar.setBounds({ x: 0, y: 0, width: 1600, height: TOOLBAR_HEIGHT });

  // Preload: desktop preload-browser (has INTEGRITY_HASH, HIDDEN_DOM_DISCOVERY, __getGlyphMeasure, target-action, SIGNAL_DOM_ACTION)
  const preloadPath = path.join(__dirname, 'preload-browser.js');

  // Left: target browser — uses session `persist:explorer` (proxy already set above)
  browserView = new WebContentsView({
    webPreferences: {
      session: ses,
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  browserView.webContents.loadURL('about:blank');
  browserView.webContents.on('did-finish-load', () => {
    const wc = browserView?.webContents;
    if (!wc) return;
    const dm = macFonts?.getDeviceMemory?.();
    const useNative = process.env.DEEP_RECON_MEASURE_TEXT_NATIVE === '1' || process.env.DEEP_RECON_MEASURE_TEXT_NATIVE === 'true';
    wc.executeJavaScript(`window.__deviceMemory=${dm != null ? dm : 'undefined'};window.__useNativeMeasureText=${useNative};`).catch(() => {});
    wc.executeJavaScript(loadStealthScript()).catch(() => {});
    wc.executeJavaScript(loadDomSignalScript()).catch(() => {});
    wc.executeJavaScript(loadDomEyeScript()).catch(() => {});
    wc.executeJavaScript(loadIntegrityScript()).catch(() => {});
    wc.executeJavaScript(loadHiddenDomScript()).catch(() => {});
    scheduleMicroChaos(wc);
    const idleDelay = 1200 + Math.floor(Math.random() * 800);
    setTimeout(() => {
      try {
        const cx = 160 + Math.floor(Math.random() * 80);
        const cy = 220 + Math.floor(Math.random() * 120);
        for (let i = 0; i < 1 + Math.floor(Math.random() * 2); i++) {
          setTimeout(() => {
            try {
              wc.sendInputEvent({ type: 'mouseMove', x: cx + (Math.random() - 0.5) * 6, y: cy + (Math.random() - 0.5) * 6 });
            } catch { /* ignore */ }
          }, i * 280);
        }
      } catch { /* ignore */ }
    }, idleDelay);
  });
  mainWindow!.contentView!.addChildView(browserView);

  // Right: Next.js Explorer
  explorerView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload-explorer.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  explorerView.webContents.loadURL(EXPLORER_URL);
  mainWindow!.contentView!.addChildView(explorerView);

  resizeContentViews();
  mainWindow!.on('resize', () => resizeContentViews());
  mainWindow!.on('closed', () => {
    mainWindow = null;
    browserView = null;
    explorerView = null;
    neuralCorrelate = null;
  });

  // Neural correlation: DOM action ↔ API flows (2000 ms window, keyword priority, store)
  neuralCorrelate = new NeuralCorrelate({
    windowMs: 2000,
    onLinked: (link: unknown) => explorerView?.webContents?.send('dom-action-linked', link),
  });
  connectBridge({
    onMessage: (d) => {
      try {
        const m = JSON.parse(d.toString()) as { type?: string; data?: unknown[] };
        if (m.type === 'events_batch' && Array.isArray(m.data)) {
          neuralCorrelate?.ingestFlows(m.data);
          for (const ev of m.data) {
            const e = ev as { wasmPath?: string; url?: string };
            if (e?.wasmPath && typeof e.wasmPath === 'string') {
              runWasmRecon(e.wasmPath, { url: e.url, projectRoot: path.join(__dirname, '..') })
                .then((res) => explorerView?.webContents?.send('wasm-decompiled', res))
                .catch(() => {});
            }
          }
        }
      } catch { /* ignore */ }
    },
  });
  createMenu();
}

function resizeContentViews(): void {
  if (!mainWindow) return;
  const b = mainWindow.getBounds();
  const w = b.width;
  const h = b.height - TOOLBAR_HEIGHT;
  const leftW = Math.floor(w * 0.25);
  const views = mainWindow.contentView!.children;
  if (views.length >= 3) {
    views[0].setBounds({ x: 0, y: 0, width: w, height: TOOLBAR_HEIGHT });
    views[1].setBounds({ x: 0, y: TOOLBAR_HEIGHT, width: leftW, height: h });
    views[2].setBounds({ x: leftW, y: TOOLBAR_HEIGHT, width: w - leftW, height: h });
  }
}

ipcMain.handle('navigate-browser', (_e, url: unknown) => {
  if (browserView?.webContents && typeof url === 'string') {
    let u = url.trim();
    if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
    if (u) browserView.webContents.loadURL(u);
  }
});

ipcMain.on('target-action', (_e, p: { type: string; selector: string; xpath: string; timestamp: number }) => {
  if (p && typeof p.type === 'string' && typeof p.selector === 'string' && typeof p.xpath === 'string' && typeof p.timestamp === 'number') {
    sendTargetActionToBridge(p);
  }
});

ipcMain.on('SIGNAL_DOM_ACTION', (_e, p: unknown) => {
  if (p && typeof p === 'object' && 'xpath' in p && 'selector' in p && typeof (p as { timestamp?: unknown }).timestamp === 'number') {
    neuralCorrelate?.ingestDomAction(p);
  }
});

ipcMain.on('integrity-hash', (_e, p: { hash?: string; ts?: number }) => {
  if (p && typeof p.hash === 'string') {
    console.log('[Desktop] INTEGRITY_HASH', p.hash, 'ts=', p.ts);
    runIntegrityChecks(p.hash).then((r) => { if (r.halted) process.exit(1); });
  }
});

ipcMain.on('HIDDEN_DOM_DISCOVERY', (_e, payload: unknown) => {
  if (Array.isArray(payload)) explorerView?.webContents?.send('hidden-dom-discovery', payload);
});

ipcMain.handle('get-glyph-measure', (_e, p: { font?: string; size?: number; text?: string }) => {
  if (!macFonts?.getGlyphMetrics || typeof p?.font !== 'string' || typeof p?.size !== 'number' || typeof p?.text !== 'string') {
    return { width: 0, ok: false };
  }
  return macFonts.getGlyphMetrics(p.font, p.size, p.text);
});

/** Heap miner: HeapProfiler or Runtime fallback; send heap-findings to Explorer. */
function probeHeap(wc: Electron.WebContents | undefined): void {
  if (!wc || wc.isDestroyed()) return;
  runHeapMiner(wc).then((res) => {
    explorerView?.webContents?.send('heap-findings', res);
    try { dialog.showMessageBox(mainWindow!, { type: 'info', title: 'Heap Miner', message: `Method: ${res.method}\nStrings: ${res.stringsTotal}\nFindings: ${res.findings.length}${res.error ? `\nError: ${res.error}` : ''}` }); } catch { /* ignore */ }
  }).catch(() => {});
}

ipcMain.handle('sandbox-request', async (_e, arg: { url?: string }) => {
  const url = arg?.url;
  if (!url || typeof url !== 'string') return { ok: false, error: 'Missing url', durationMs: 0 };
  const start = Date.now();
  try {
    const r = await fetchViaChromium(url);
    return { ok: true, status: r.status, body: r.body, durationMs: Date.now() - start };
  } catch (e) {
    return { ok: false, error: (e as Error).message, durationMs: Date.now() - start };
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (bridgeWs) { bridgeWs.close(); bridgeWs = null; }
  if (process.platform !== 'darwin') app.quit();
});

function createMenu(): void {
  const template: object[] = [
    {
      label: 'View',
      submenu: [
        { label: 'Reload Browser (Left)', click: () => browserView?.webContents?.reload() },
        { label: 'Reload Explorer (Right)', click: () => explorerView?.webContents?.reload() },
        { type: 'separator' },
        { label: 'Open tls.peet.ws (JA4)', click: () => { if (browserView?.webContents) browserView.webContents.loadURL('https://tls.peet.ws'); }},
        { label: 'Fetch via Chromium (JA4)…', click: async () => {
          try {
            const r = await fetchViaChromium('https://httpbin.org/get');
            dialog.showMessageBox(mainWindow!, { type: 'info', title: 'fetchViaChromium', message: `Status: ${r.status}\nBody length: ${r.body?.length ?? 0}` });
          } catch (err) {
            dialog.showMessageBox(mainWindow!, { type: 'error', title: 'fetchViaChromium', message: String(err) });
          }
        }},
        { label: 'Probe heap (browser)', click: () => { probeHeap(browserView?.webContents); }},
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            dialog.showMessageBox(mainWindow!, {
              type: 'info',
              title: 'API Signal Explorer',
              message: 'Left: proxied browser (mitmproxy 127.0.0.1:8080). Right: Next.js Explorer. Target-actions and flows are correlated (≤2s).',
            });
          },
        },
      ],
    },
  ];
  if (!app.isPackaged) {
    (template[0] as { submenu?: object[] }).submenu?.splice(3, 0, { type: 'separator' }, { role: 'forceReload' });
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
