/**
 * Cooldown Manager
 * 
 * Detects error spikes and auto-pauses scraping
 */

import { getDataDirectory, ensureDataDirectory, safeWriteFile, safeReadFile } from './dataDirectory';
import { withLock } from './fileLock';
import { loadSettings } from './settingsConfig';

const COOLDOWN_FILE = 'cooldown-state.json';

interface CooldownState {
  isPaused: boolean;
  pausedAt?: string;
  pauseDuration: number; // seconds
  errorCount: number;
  errorWindow: number[]; // Timestamps of recent errors (last minute)
  lastErrorAt?: string;
}

/**
 * Get cooldown state file path
 */
function getCooldownFilePath(): string {
  if (typeof window !== 'undefined') {
    return './data/cooldown-state.json';
  }
  const dataDir = getDataDirectory();
  const path = require('path');
  return path.join(dataDir, COOLDOWN_FILE);
}

/**
 * Load cooldown state
 */
function loadCooldownState(): CooldownState {
  try {
    const filePath = getCooldownFilePath();
    const content = safeReadFile(filePath);

    if (!content) {
      return {
        isPaused: false,
        pauseDuration: 0,
        errorCount: 0,
        errorWindow: [],
      };
    }

    return JSON.parse(content) as CooldownState;
  } catch (error) {
    console.error('[COOLDOWN] Failed to load cooldown state:', error);
    return {
      isPaused: false,
      pauseDuration: 0,
      errorCount: 0,
      errorWindow: [],
    };
  }
}

/**
 * Save cooldown state
 */
async function saveCooldownState(state: CooldownState): Promise<void> {
  try {
    ensureDataDirectory();
    const filePath = getCooldownFilePath();

    await withLock(filePath, async () => {
      safeWriteFile(filePath, JSON.stringify(state, null, 2));
    });
  } catch (error) {
    console.error('[COOLDOWN] Failed to save cooldown state:', error);
  }
}

/**
 * Record an error and check if cooldown should be triggered
 */
export async function recordError(): Promise<void> {
  try {
    const settings = loadSettings();
    
    if (!settings.cooldownWindows.enabled) {
      return; // Cooldown disabled, don't track
    }

    const state = loadCooldownState();
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;

    // Clean old errors from window (older than 1 minute)
    state.errorWindow = state.errorWindow.filter(timestamp => timestamp > oneMinuteAgo);
    
    // Add current error
    state.errorWindow.push(now);
    state.errorCount = state.errorWindow.length;
    state.lastErrorAt = new Date().toISOString();

    // Check if error threshold exceeded
    if (state.errorCount >= settings.cooldownWindows.errorThreshold) {
      if (!state.isPaused) {
        // Trigger cooldown
        state.isPaused = true;
        state.pausedAt = new Date().toISOString();
        state.pauseDuration = settings.cooldownWindows.pauseDuration;
        console.warn(`[COOLDOWN] Error spike detected (${state.errorCount} errors/min), pausing for ${state.pauseDuration}s`);
      }
    }

    await saveCooldownState(state);
  } catch (error) {
    console.error('[COOLDOWN] Failed to record error:', error);
  }
}

/**
 * Check if system is in cooldown
 */
export async function isInCooldown(): Promise<boolean> {
  try {
    const settings = loadSettings();
    
    if (!settings.cooldownWindows.enabled) {
      return false; // Cooldown disabled
    }

    const state = loadCooldownState();

    if (!state.isPaused) {
      return false;
    }

    // Check if cooldown period has expired
    if (state.pausedAt) {
      const pausedAt = new Date(state.pausedAt).getTime();
      const now = Date.now();
      const elapsed = (now - pausedAt) / 1000; // seconds

      if (elapsed >= state.pauseDuration) {
        // Cooldown expired, resume
        const newState: CooldownState = {
          isPaused: false,
          pauseDuration: 0,
          errorCount: 0,
          errorWindow: [],
        };
        await saveCooldownState(newState);
        console.log('[COOLDOWN] Cooldown period expired, resuming operations');
        return false;
      }
    }

    return true; // Still in cooldown
  } catch (error) {
    console.error('[COOLDOWN] Failed to check cooldown state:', error);
    return false; // On error, allow operations (backward compatible)
  }
}

/**
 * Get cooldown status information
 */
export async function getCooldownStatus(): Promise<{
  isPaused: boolean;
  pausedAt?: string;
  remainingSeconds?: number;
  errorCount: number;
}> {
  try {
    const state = loadCooldownState();

    if (!state.isPaused || !state.pausedAt) {
      return {
        isPaused: false,
        errorCount: state.errorCount,
      };
    }

    const pausedAt = new Date(state.pausedAt).getTime();
    const now = Date.now();
    const elapsed = (now - pausedAt) / 1000;
    const remaining = Math.max(0, state.pauseDuration - elapsed);

    return {
      isPaused: true,
      pausedAt: state.pausedAt,
      remainingSeconds: Math.ceil(remaining),
      errorCount: state.errorCount,
    };
  } catch (error) {
    return {
      isPaused: false,
      errorCount: 0,
    };
  }
}

/**
 * Manually clear cooldown (for testing/admin)
 */
export async function clearCooldown(): Promise<void> {
  const newState: CooldownState = {
    isPaused: false,
    pauseDuration: 0,
    errorCount: 0,
    errorWindow: [],
  };
  await saveCooldownState(newState);
}

