/**
 * Zero-Day Integrity & Protocol Shield
 *
 * V8: baseline hash of primitives (integrity-inject); compare at startup; halt on mismatch.
 * ASAR: if packaged, verify integrity when DEEP_RECON_ASAR_BASELINE is set.
 * macOS: font smoothing, retina, locale/timezone mirroring.
 *
 * Edge cases: no baseline file yet (first run), packaged vs unpackaged, Darwin-only tweaks.
 */

import { app } from 'electron';
import { readFile, writeFile, access } from 'fs/promises';
import path from 'path';

const BASELINE_FILENAME = '.v8-integrity-baseline';
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

export type IntegrityResult = {
  v8Ok: boolean;
  v8Error?: string;
  asarOk: boolean;
  asarError?: string;
  halted: boolean;
};

/**
 * Resolve baseline file path: project root or user data.
 */
function getBaselinePath(): string {
  try {
    return path.join(app.getPath('userData'), BASELINE_FILENAME);
  } catch {
    return path.join(PROJECT_ROOT, BASELINE_FILENAME);
  }
}

/**
 * Check V8 integrity: compare current hash (from callback or file) to baseline.
 * If baseline exists and hashes differ, return v8Ok: false.
 * If no baseline, create one from provided hash and return v8Ok: true.
 */
export async function checkV8Integrity(currentHash: string | null): Promise<{ v8Ok: boolean; error?: string }> {
  const bp = getBaselinePath();
  try {
    const existing = await readFile(bp, 'utf-8').then((s) => s.trim()).catch(() => null);
    if (currentHash == null || currentHash === '') {
      return { v8Ok: true }; // Nothing to compare; integrity-inject will send later
    }
    if (existing == null || existing === '') {
      await writeFile(bp, currentHash, 'utf-8');
      return { v8Ok: true };
    }
    if (existing !== currentHash) {
      return { v8Ok: false, error: `V8 integrity mismatch: baseline=${existing.slice(0, 12)}... current=${currentHash.slice(0, 12)}...` };
    }
    return { v8Ok: true };
  } catch (e) {
    return { v8Ok: true, error: (e as Error).message }; // Don’t block on fs errors
  }
}

/**
 * ASAR integrity: if DEEP_RECON_ASAR_BASELINE env is set and app is packaged,
 * compare hash of app.asar to the baseline; else skip.
 */
export async function checkAsarIntegrity(): Promise<{ asarOk: boolean; error?: string }> {
  const baseline = process.env.DEEP_RECON_ASAR_BASELINE;
  if (!baseline || !app.isPackaged) return { asarOk: true };
  const asarPath = path.join(process.resourcesPath, 'app.asar');
  try {
    await access(asarPath);
  } catch {
    return { asarOk: true }; // No app.asar
  }
  const { createHash } = await import('crypto');
  const buf = await readFile(asarPath);
  const h = createHash('sha256').update(buf).digest('hex');
  if (h !== baseline.trim()) {
    return { asarOk: false, error: `ASAR integrity mismatch` };
  }
  return { asarOk: true };
}

/**
 * macOS: font smoothing, retina, locale. No-op on non-Darwin.
 */
export function configureMacOSRendering(): void {
  if (process.platform !== 'darwin') return;
  app.commandLine.appendSwitch('--enable-font-antialiasing');
  app.commandLine.appendSwitch('--force-color-profile', 'srgb');
  // Retina: Chromium on macOS uses deviceScaleFactor from the system; no switch needed.
  // Locale: use system. Avoid overriding LANG/LC_* so Electron picks them up.
}

/**
 * Run all checks. If DEEP_RECON_HALT_ON_FAIL=1 and (v8 or asar) fails, returns halted: true.
 * Caller must process.exit(1) when halted.
 * Note: configureMacOSRendering() must be called before app.ready; call it at main top.
 */
export async function runIntegrityChecks(v8Hash: string | null): Promise<IntegrityResult> {
  const haltOnFail = process.env.DEEP_RECON_HALT_ON_FAIL === '1' || process.env.DEEP_RECON_HALT_ON_FAIL === 'true';

  const v8 = await checkV8Integrity(v8Hash);
  const asar = await checkAsarIntegrity();

  const v8Ok = v8.v8Ok;
  const asarOk = asar.asarOk;
  const halted = haltOnFail && (!v8Ok || !asarOk);

  return {
    v8Ok,
    v8Error: v8.error,
    asarOk,
    asarError: asar.error,
    halted,
  };
}
