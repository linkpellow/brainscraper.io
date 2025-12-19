/**
 * Global Countdown Timer Utility
 * 
 * Persists countdown timer state across page navigations using localStorage
 */

const COUNTDOWN_STORAGE_KEY = 'brainscraper_countdown_timer';

export interface CountdownState {
  expirationTimestamp: number | null;
  reason?: string;
}

/**
 * Get the current countdown state from localStorage
 */
export function getCountdownState(): CountdownState {
  if (typeof window === 'undefined') {
    return { expirationTimestamp: null };
  }

  try {
    const stored = localStorage.getItem(COUNTDOWN_STORAGE_KEY);
    if (!stored) {
      return { expirationTimestamp: null };
    }

    const state: CountdownState = JSON.parse(stored);
    
    // Validate expiration timestamp
    if (state.expirationTimestamp && state.expirationTimestamp > Date.now()) {
      return state;
    } else {
      // Expired, clear it
      clearCountdownState();
      return { expirationTimestamp: null };
    }
  } catch (error) {
    console.error('[COUNTDOWN] Failed to get countdown state:', error);
    return { expirationTimestamp: null };
  }
}

/**
 * Set the countdown timer expiration
 */
export function setCountdownState(expirationTimestamp: number | null, reason?: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const state: CountdownState = {
      expirationTimestamp,
      reason,
    };

    if (expirationTimestamp === null) {
      localStorage.removeItem(COUNTDOWN_STORAGE_KEY);
    } else {
      localStorage.setItem(COUNTDOWN_STORAGE_KEY, JSON.stringify(state));
    }

    // Dispatch custom event to notify components
    window.dispatchEvent(new CustomEvent('countdownStateChanged', { detail: state }));
  } catch (error) {
    console.error('[COUNTDOWN] Failed to set countdown state:', error);
  }
}

/**
 * Clear the countdown timer
 */
export function clearCountdownState(): void {
  setCountdownState(null);
}

/**
 * Get remaining seconds until expiration
 */
export function getRemainingSeconds(): number {
  const state = getCountdownState();
  if (!state.expirationTimestamp) {
    return 0;
  }

  const remaining = Math.max(0, Math.ceil((state.expirationTimestamp - Date.now()) / 1000));
  
  // Auto-clear if expired
  if (remaining === 0) {
    clearCountdownState();
  }

  return remaining;
}

/**
 * Check if countdown is active
 */
export function isCountdownActive(): boolean {
  return getRemainingSeconds() > 0;
}

/**
 * Format countdown seconds to human-readable string (MM:SS or HH:MM:SS)
 */
export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '0:00';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}
