'use client';

import { useState, useEffect } from 'react';
import { Clock, AlertCircle } from 'lucide-react';
import { getRemainingSeconds, formatCountdown, getCountdownState, isCountdownActive } from '@/utils/countdownTimer';

/**
 * Global Countdown Timer Component
 * 
 * Displays the countdown timer persistently across all pages
 */
export default function GlobalCountdownTimer() {
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [reason, setReason] = useState<string | undefined>();

  useEffect(() => {
    // Load initial state
    const state = getCountdownState();
    setRemainingSeconds(getRemainingSeconds());
    setReason(state.reason);

    // Update countdown every second
    const interval = setInterval(() => {
      const remaining = getRemainingSeconds();
      setRemainingSeconds(remaining);
      
      // Update reason if state changed
      const currentState = getCountdownState();
      setReason(currentState.reason);

      // Clear if expired
      if (remaining === 0) {
        setReason(undefined);
      }
    }, 1000);

    // Listen for countdown state changes from other components
    const handleCountdownChange = (event: CustomEvent) => {
      const state = event.detail;
      setRemainingSeconds(getRemainingSeconds());
      setReason(state.reason);
    };

    window.addEventListener('countdownStateChanged', handleCountdownChange as EventListener);

    return () => {
      clearInterval(interval);
      window.removeEventListener('countdownStateChanged', handleCountdownChange as EventListener);
    };
  }, []);

  // Don't render if countdown is not active
  if (!isCountdownActive() || remainingSeconds === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-5 duration-300">
      <div className="bg-red-600/90 backdrop-blur-sm border border-red-500/50 rounded-lg px-4 py-3 shadow-xl flex items-center gap-3 min-w-[280px]">
        <div className="flex-shrink-0">
          <Clock className="w-5 h-5 text-white animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-white text-sm font-semibold">
            {reason || 'Rate limit active'}
          </div>
          <div className="text-white/90 text-xs font-mono">
            Try again in <span className="font-bold text-white">{formatCountdown(remainingSeconds)}</span>
          </div>
        </div>
        {reason && (
          <div className="flex-shrink-0">
            <AlertCircle className="w-4 h-4 text-white/80" />
          </div>
        )}
      </div>
    </div>
  );
}
