/**
 * Enhanced Error Capture Hook
 * 
 * Comprehensive error capture that integrates:
 * - Console logs (existing)
 * - React Error Boundaries
 * - Network request interception
 * - User action correlation
 * - Global error handlers
 */

import { useEffect, useCallback, useRef } from 'react';
import {
  setupGlobalErrorHandlers,
  interceptFetch,
  setupUserActionTracking,
  userActionTracker,
  type EnhancedError,
} from '../utils/enhancedErrorCapture';
import { parseStackTrace } from '../utils/codebaseAwareLogging';
import type { CapturedLog } from './useConsoleCapture';

export type EnhancedCapturedLog = CapturedLog & {
  enhancedError?: EnhancedError;
  userActions?: Array<{ type: string; target?: string; timestamp: number }>;
};

export function useEnhancedErrorCapture(
  enabled: boolean,
  onError?: (error: EnhancedError) => void
) {
  const errorHandlerRef = useRef<(error: EnhancedError) => void>();

  // Update error handler ref
  useEffect(() => {
    errorHandlerRef.current = (error: EnhancedError) => {
      // Add codebase locations from stack
      if (error.stack) {
        error.context.locations = parseStackTrace(error.stack);
      }
      
      // Add recent user actions
      error.context.userAction = userActionTracker.getRecentActions(5000)[0];
      
      // Call provided handler
      if (onError) {
        onError(error);
      }
      
      // Also log to console for visibility
      // Use original console to avoid triggering capture (which could cause circular errors)
      if (typeof window !== 'undefined' && (window as any).__ORIGINAL_CONSOLE_ERROR__) {
        (window as any).__ORIGINAL_CONSOLE_ERROR__('[EnhancedErrorCapture]', error);
      } else {
        // Fallback to regular console if original not available
        try {
          console.error('[EnhancedErrorCapture]', error);
        } catch (logError) {
          // Last resort: do nothing to prevent circular errors
        }
      }
    };
  }, [onError]);

  useEffect(() => {
    if (!enabled) return;

    // Setup global error handlers
    const cleanupErrorHandlers = setupGlobalErrorHandlers((error) => {
      errorHandlerRef.current?.(error);
    });

    // Setup fetch interception
    const cleanupFetch = interceptFetch((error) => {
      errorHandlerRef.current?.(error);
    });

    // Setup user action tracking
    const cleanupActions = setupUserActionTracking();

    // Cleanup
    return () => {
      cleanupErrorHandlers();
      cleanupFetch();
      cleanupActions();
    };
  }, [enabled]);

  return {
    recordUserAction: useCallback((type: string, target?: string) => {
      userActionTracker.recordAction(type, target);
    }, []),
  };
}
