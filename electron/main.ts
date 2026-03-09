/**
 * Electron main process: load env, set DATA_DIR, spawn Next standalone server, open window.
 */

import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { getEnvFilePath, loadEnvIntoProcess } from './envLoader';
import {
  getProjectRoot,
  getStandaloneDir,
  startNextServer,
  getAppUrl,
  waitForServerReady,
} from './nextRunner';

const PORT = parseInt(process.env.PORT || '3000', 10);
let nextProcess: ReturnType<typeof startNextServer> | null = null;

function ensureDataDir(dataDir: string): void {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  win.loadURL(getAppUrl(PORT));
  win.on('closed', () => {
    if (nextProcess) {
      nextProcess.kill();
      nextProcess = null;
    }
    app.quit();
  });
}

app.whenReady().then(async () => {
  const userData = app.getPath('userData');
  const dataDir = path.join(userData, 'data');
  ensureDataDir(dataDir);
  process.env.DATA_DIR = dataDir;

  const projectRoot = getProjectRoot(process.cwd(), app.isPackaged);
  const envPath = getEnvFilePath(userData, process.execPath, projectRoot);
  if (envPath) {
    loadEnvIntoProcess(envPath);
  }

  const resourcesPath = process.resourcesPath || path.join(app.getAppPath(), '..');
  const standaloneDir = getStandaloneDir(resourcesPath, projectRoot, app.isPackaged);
  nextProcess = startNextServer(standaloneDir, { DATA_DIR: dataDir }, PORT);

  nextProcess.stdout?.on('data', (d) => process.stdout.write(d));
  nextProcess.stderr?.on('data', (d) => process.stderr.write(d));
  nextProcess.on('error', (err) => console.error('[Next]', err));
  nextProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) console.error('[Next] exited with code', code);
  });

  try {
    await waitForServerReady(PORT);
    createWindow();
  } catch (error) {
    console.error('[Next] failed to become ready', error);
    if (nextProcess) {
      nextProcess.kill();
      nextProcess = null;
    }
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (nextProcess) nextProcess.kill();
  app.quit();
});
