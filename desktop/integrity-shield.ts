/**
 * Zero-Day Integrity & Protocol Shield (desktop, inlined)
 * V8 baseline, ASAR (when env set), macOS rendering. Call configureMacOSRendering before app.ready.
 */

import { app } from 'electron';
import { readFile, writeFile, access } from 'fs/promises';
import path from 'path';

const BASELINE_FILENAME = '.v8-integrity-baseline';
const PROJECT_ROOT = path.resolve(__dirname, '..');

export type IntegrityResult = { v8Ok: boolean; v8Error?: string; asarOk: boolean; asarError?: string; halted: boolean };

function getBaselinePath(): string {
  try { return path.join(app.getPath('userData'), BASELINE_FILENAME); } catch { return path.join(PROJECT_ROOT, BASELINE_FILENAME); }
}

export async function checkV8Integrity(currentHash: string | null): Promise<{ v8Ok: boolean; error?: string }> {
  const bp = getBaselinePath();
  try {
    const existing = await readFile(bp, 'utf-8').then((s) => s.trim()).catch(() => null);
    if (currentHash == null || currentHash === '') return { v8Ok: true };
    if (existing == null || existing === '') { await writeFile(bp, currentHash, 'utf-8'); return { v8Ok: true }; }
    if (existing !== currentHash) return { v8Ok: false, error: `V8 integrity mismatch` };
    return { v8Ok: true };
  } catch (e) { return { v8Ok: true, error: (e as Error).message }; }
}

export async function checkAsarIntegrity(): Promise<{ asarOk: boolean; error?: string }> {
  const baseline = process.env.DEEP_RECON_ASAR_BASELINE;
  if (!baseline || !app.isPackaged) return { asarOk: true };
  const asarPath = path.join(process.resourcesPath, 'app.asar');
  try { await access(asarPath); } catch { return { asarOk: true }; }
  const { createHash } = await import('crypto');
  const h = createHash('sha256').update(await readFile(asarPath)).digest('hex');
  if (h !== baseline.trim()) return { asarOk: false, error: 'ASAR integrity mismatch' };
  return { asarOk: true };
}

export function configureMacOSRendering(): void {
  if (process.platform !== 'darwin') return;
  app.commandLine.appendSwitch('--enable-font-antialiasing');
  app.commandLine.appendSwitch('--enable-font-subpixel-positioning');
  app.commandLine.appendSwitch('--force-color-profile', 'srgb');
}

export async function runIntegrityChecks(v8Hash: string | null): Promise<IntegrityResult> {
  const haltOnFail = process.env.DEEP_RECON_HALT_ON_FAIL === '1' || process.env.DEEP_RECON_HALT_ON_FAIL === 'true';
  const v8 = await checkV8Integrity(v8Hash);
  const asar = await checkAsarIntegrity();
  const v8Ok = v8.v8Ok, asarOk = asar.asarOk, halted = haltOnFail && (!v8Ok || !asarOk);
  return { v8Ok, v8Error: v8.error, asarOk, asarError: asar.error, halted };
}
