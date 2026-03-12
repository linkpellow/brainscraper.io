import { ensureDataDirectory, getDataDirectory, safeReadFile, safeWriteFile } from './dataDirectory';
import { withLock } from './fileLock';

const FREEZE_FILE = 'linkedin-freeze-state.json';

type LinkedinFreezeState = {
  frozenUntil?: string;
  detectedAt?: string;
  durationSeconds?: number;
  sourceMessage?: string;
};

function getFreezeFilePath(): string {
  const path = require('path');
  return path.join(getDataDirectory(), FREEZE_FILE);
}

async function saveState(state: LinkedinFreezeState): Promise<void> {
  ensureDataDirectory();
  const filePath = getFreezeFilePath();
  await withLock(filePath, async () => {
    safeWriteFile(filePath, JSON.stringify(state, null, 2));
  });
}

function loadState(): LinkedinFreezeState {
  try {
    const content = safeReadFile(getFreezeFilePath());
    if (!content) return {};
    return JSON.parse(content) as LinkedinFreezeState;
  } catch {
    return {};
  }
}

export function parseFreezeDurationSeconds(message: string): number {
  const normalized = message.toLowerCase();
  const match = normalized.match(/(\d+)\s*(mins?|minutes?|hrs?|hours?|seconds?|secs?)/i);
  if (!match) return 60 * 60;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  if (!Number.isFinite(value) || value <= 0) return 60 * 60;

  if (unit.startsWith('sec')) return value;
  if (unit.startsWith('hr') || unit.startsWith('hour')) return value * 60 * 60;
  return value * 60;
}

export async function setLinkedinFreezeState(message: string): Promise<void> {
  const durationSeconds = parseFreezeDurationSeconds(message);
  const now = Date.now();
  await saveState({
    detectedAt: new Date(now).toISOString(),
    frozenUntil: new Date(now + (durationSeconds * 1000)).toISOString(),
    durationSeconds,
    sourceMessage: message,
  });
}

export async function getLinkedinFreezeStatus(): Promise<{
  isFrozen: boolean;
  remainingSeconds: number;
  sourceMessage?: string;
}> {
  const state = loadState();
  if (!state.frozenUntil) {
    return { isFrozen: false, remainingSeconds: 0 };
  }

  const expiresAt = new Date(state.frozenUntil).getTime();
  if (!Number.isFinite(expiresAt)) {
    await saveState({});
    return { isFrozen: false, remainingSeconds: 0 };
  }

  const remainingMs = expiresAt - Date.now();
  if (remainingMs <= 0) {
    await saveState({});
    return { isFrozen: false, remainingSeconds: 0 };
  }

  return {
    isFrozen: true,
    remainingSeconds: Math.ceil(remainingMs / 1000),
    sourceMessage: state.sourceMessage,
  };
}

