/**
 * API Signal Explorer — Electron Desktop
 *
 * Dual-panel: Left 25% = proxied WebContentsView (mitmproxy); Right 75% = Next.js Explorer.
 * Mapping: browser preload + injected mapper (hover outline, click -> XPath/CSS) -> IPC
 * -> main -> WebSocket bridge -> Next.js. correlate uses 3s window for Electron actions.
 */

import { app, WebContentsView, BaseWindow, Menu, ipcMain, session, dialog } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import WebSocket from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXPLORER_URL = process.env.EXPLORER_URL || 'http://localhost:3000/tools/api-signal-explorer';
const MITM_PROXY = process.env.MITM_PROXY || 'http://127.0.0.1:8080';
const BRIDGE_WS = process.env.BRIDGE_WS || 'ws://localhost:8787/explorer';
const TOOLBAR_HEIGHT = 44;

let mainWindow: InstanceType<typeof BaseWindow> | null = null;
let browserView: InstanceType<typeof WebContentsView> | null = null;
let explorerView: InstanceType<typeof WebContentsView> | null = null;
let bridgeWs: WebSocket | null = null;
let mapperInjectScript: string = '';

function loadMapperScript(): string {
  if (mapperInjectScript) return mapperInjectScript;
  const p = path.join(__dirname, 'browser_mapper_inject.js');
  mapperInjectScript = readFileSync(p, 'utf-8');
  return mapperInjectScript;
}

function connectBridge(): void {
  if (bridgeWs?.readyState === WebSocket.OPEN) return;
  try {
    bridgeWs = new WebSocket(BRIDGE_WS);
    bridgeWs.on('open', () => console.log('[Explorer] Bridge connected'));
    bridgeWs.on('close', () => { bridgeWs = null; });
    bridgeWs.on('error', () => { bridgeWs = null; });
  } catch {
    bridgeWs = null;
  }
}

function sendActionToBridge(action: { id: string; ts: number; type: string; meta?: Record<string, unknown> }): void {
  connectBridge();
  if (bridgeWs?.readyState === WebSocket.OPEN) {
    bridgeWs.send(JSON.stringify({ type: 'action', action }));
  }
}

function createWindow(): void {
  mainWindow = new BaseWindow({
    width: 1600,
    height: 960,
    title: 'API Signal Explorer',
  });

  // --- Toolbar (top) ---
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

  // --- Session for LEFT: proxy + cert bypass ---
  const ses = session.fromPartition('persist:explorer');
  ses.setProxy({ proxyRules: MITM_PROXY });
  ses.setCertificateVerifyProc((_req, cb) => cb(0));

  // --- Left 25%: proxied browser + mapper preload ---
  browserView = new WebContentsView({
    webPreferences: {
      session: ses,
      preload: path.join(__dirname, 'browser_preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  browserView.webContents.loadURL('about:blank');
  browserView.webContents.on('did-finish-load', () => {
    const script = loadMapperScript();
    browserView?.webContents?.executeJavaScript(script).catch(() => {});
  });
  mainWindow!.contentView!.addChildView(browserView);

  // --- Right 75%: Next.js + explorer preload (isElectron) ---
  explorerView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'explorer_preload.js'),
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
  });
  createMenu();
  connectBridge();
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

// IPC: navigate left browser
ipcMain.handle('navigate-browser', (_e, url: unknown) => {
  if (browserView?.webContents && typeof url === 'string') {
    let u = url.trim();
    if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
    if (u) browserView.webContents.loadURL(u);
  }
});

// IPC: action-signal from browser preload (from injected mapper)
ipcMain.on('action-signal', (_e, p: { type?: string; xpath?: string; cssSelector?: string; tagName?: string; href?: string; text?: string; timestamp?: number }) => {
  const ts = p?.timestamp ?? Date.now();
  const action = {
    id: `action_${ts}_${Math.random().toString(36).slice(2, 10)}`,
    ts,
    type: (p?.type as string) || 'click',
    meta: {
      selector: p?.cssSelector,
      xpath: p?.xpath,
      tagName: p?.tagName,
      href: p?.href,
      text: p?.text,
      source: 'electron',
    },
  };
  sendActionToBridge(action);
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (bridgeWs) {
    bridgeWs.close();
    bridgeWs = null;
  }
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
              message: 'Left 25%: proxied browser (mitmproxy :8080). Hover to highlight, click to map XPath/CSS.\nRight 75%: Next.js Explorer. Actions are correlated to network events (3s window).',
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
