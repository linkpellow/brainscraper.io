/**
 * Server Error Forwarding Hook
 * 
 * Polls for server-side errors and forwards them to console logs
 */

import { useEffect, useRef } from 'react';
import type { CapturedLog } from './useConsoleCapture';

// Simple in-memory store (in production, use Redis or database)
const serverErrors: Array<{
  id: string;
  timestamp: number;
  error: any;
  context?: any;
}> = [];

export function useServerErrorForwarding(
  onError: (error: CapturedLog) => void,
  enabled: boolean = true
) {
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    if (!enabled) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }
    
    // Poll for server errors every 2 seconds
    pollIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch('/api/diagnostics/server-errors');
        // Handle 404 gracefully (endpoint might not be set up yet)
        if (response.status === 404) {
          return; // Silently skip if endpoint doesn't exist
        }
        
        if (response.ok) {
          const data = await response.json();
          if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
            data.errors.forEach((serverError: any) => {
              try {
                const log: CapturedLog = {
                  id: serverError.id || `server_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  timestamp: serverError.timestamp || Date.now(),
                  level: 'error',
                  message: serverError.error?.message || 'Server error',
                  args: [serverError.error],
                  formatted: `[SERVER] ${serverError.error?.message || 'Unknown server error'}`,
                  stack: serverError.error?.stack,
                  context: serverError.context,
                };
                // Use original console if available to avoid triggering capture
                if (typeof window !== 'undefined' && (window as any).__ORIGINAL_CONSOLE_ERROR__) {
                  // Call onError but wrap in try-catch to prevent circular errors
                  try {
                    onError(log);
                  } catch (onErrorErr) {
                    // Silently fail to prevent circular errors
                  }
                } else {
                  // Fallback: try calling onError
                  try {
                    onError(log);
                  } catch (onErrorErr) {
                    // Silently fail
                  }
                }
              } catch (logError) {
                // Prevent circular errors - if logging fails, just skip it
                // Don't log the logging error to avoid infinite loops
              }
            });
          }
        }
      } catch (error) {
        // Silently fail - don't spam console or create circular errors
        // Only log if it's not a network/404 error
        if (error instanceof Error && !error.message.includes('404') && !error.message.includes('Failed to fetch')) {
          // Use original console.error to avoid circular capture
          if (typeof window !== 'undefined' && (window as any).__ORIGINAL_CONSOLE_ERROR__) {
            (window as any).__ORIGINAL_CONSOLE_ERROR__('[useServerErrorForwarding] Error polling server errors:', error);
          }
        }
      }
    }, 2000);
    
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [enabled, onError]);
}
