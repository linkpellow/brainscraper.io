/**
 * Enhanced Error Capture System
 * 
 * Comprehensive error capture that goes beyond console logs:
 * - React Error Boundaries
 * - Network request interception
 * - Component context capture
 * - User action correlation
 * - Server-side error forwarding
 */

import type { Component, ReactNode } from 'react';
import type { CodeLocation } from './codebaseAwareLogging';

export type ErrorContext = {
  // Component context
  componentName?: string;
  componentProps?: Record<string, any>;
  componentState?: Record<string, any>;
  
  // User context
  userAction?: {
    type: string;
    target?: string;
    timestamp: number;
  };
  
  // Network context
  networkRequest?: {
    url: string;
    method: string;
    status?: number;
    error?: string;
  };
  
  // React context
  reactComponentStack?: string;
  
  // Browser context
  userAgent?: string;
  url?: string;
  
  // Codebase locations
  locations?: CodeLocation[];
};

export type EnhancedError = {
  id: string;
  timestamp: number;
  message: string;
  stack?: string;
  context: ErrorContext;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'render-error' | 'network-error' | 'runtime-error' | 'type-error' | 'unknown';
};

/**
 * Global error handler for unhandled errors
 */
export function setupGlobalErrorHandlers(
  onError: (error: EnhancedError) => void
): () => void {
  // Unhandled errors
  const handleError = (event: ErrorEvent) => {
    const enhanced: EnhancedError = {
      id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      message: event.message || 'Unknown error',
      stack: event.error?.stack,
      context: {
        userAgent: navigator.userAgent,
        url: window.location.href,
      },
      severity: 'high',
      category: 'runtime-error',
    };
    onError(enhanced);
  };

  // Unhandled promise rejections
  const handleRejection = (event: PromiseRejectionEvent) => {
    const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    const enhanced: EnhancedError = {
      id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      message: error.message || 'Unhandled promise rejection',
      stack: error.stack,
      context: {
        userAgent: navigator.userAgent,
        url: window.location.href,
      },
      severity: 'high',
      category: 'runtime-error',
    };
    onError(enhanced);
  };

  window.addEventListener('error', handleError);
  window.addEventListener('unhandledrejection', handleRejection);

  // Cleanup
  return () => {
    window.removeEventListener('error', handleError);
    window.removeEventListener('unhandledrejection', handleRejection);
  };
}

/**
 * Intercept fetch() to capture network errors
 */
export function interceptFetch(
  onNetworkError: (error: EnhancedError) => void
): () => void {
  const originalFetch = window.fetch;

  window.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
    const [url, options = {}] = args;
    const startTime = Date.now();

    try {
      const response = await originalFetch(...args);
      
      // Capture failed requests
      if (!response.ok) {
        const errorText = await response.clone().text();
        const enhanced: EnhancedError = {
          id: `network_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
          message: `Network request failed: ${response.status} ${response.statusText}`,
          context: {
            networkRequest: {
              url: typeof url === 'string' ? url : url.toString(),
              method: options.method || 'GET',
              status: response.status,
              error: errorText.substring(0, 500),
            },
            userAgent: navigator.userAgent,
            url: window.location.href,
          },
          severity: response.status >= 500 ? 'high' : response.status >= 400 ? 'medium' : 'low',
          category: 'network-error',
        };
        onNetworkError(enhanced);
      }
      
      return response;
    } catch (error) {
      const enhanced: EnhancedError = {
        id: `network_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        message: error instanceof Error ? error.message : 'Network request failed',
        stack: error instanceof Error ? error.stack : undefined,
        context: {
          networkRequest: {
            url: typeof url === 'string' ? url : url.toString(),
            method: options.method || 'GET',
            error: error instanceof Error ? error.message : String(error),
          },
          userAgent: navigator.userAgent,
          url: window.location.href,
        },
        severity: 'high',
        category: 'network-error',
      };
      onNetworkError(enhanced);
      throw error;
    }
  };

  // Cleanup
  return () => {
    window.fetch = originalFetch;
  };
}

/**
 * React Error Boundary Component
 * Note: This is a TypeScript file, so JSX is moved to ErrorBoundary.tsx component
 */
export type ErrorBoundaryProps = {
  children: ReactNode;
  onError: (error: EnhancedError) => void;
  fallback?: ReactNode;
};

export type ErrorBoundaryState = {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
};

export function createEnhancedErrorFromReactError(
  error: Error,
  errorInfo: React.ErrorInfo
): EnhancedError {
  return {
    id: `render_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    message: error.message || 'React render error',
    stack: error.stack,
    context: {
      reactComponentStack: errorInfo.componentStack,
      userAgent: typeof window !== 'undefined' ? navigator.userAgent : undefined,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
    },
    severity: 'critical',
    category: 'render-error',
  };
}

/**
 * Track user actions for error correlation
 */
export class UserActionTracker {
  private actions: Array<{ type: string; target?: string; timestamp: number }> = [];
  private maxActions = 50;

  recordAction(type: string, target?: string) {
    this.actions.push({
      type,
      target,
      timestamp: Date.now(),
    });
    
    // Keep only recent actions
    if (this.actions.length > this.maxActions) {
      this.actions = this.actions.slice(-this.maxActions);
    }
  }

  getRecentActions(withinMs: number = 5000): Array<{ type: string; target?: string; timestamp: number }> {
    const cutoff = Date.now() - withinMs;
    return this.actions.filter(action => action.timestamp >= cutoff);
  }

  clear() {
    this.actions = [];
  }
}

export const userActionTracker = new UserActionTracker();

/**
 * Setup user action tracking
 */
export function setupUserActionTracking(): () => void {
  const handleClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    userActionTracker.recordAction('click', target?.tagName + (target?.id ? `#${target.id}` : ''));
  };

  const handleNavigation = () => {
    userActionTracker.recordAction('navigation', window.location.pathname);
  };

  window.addEventListener('click', handleClick);
  window.addEventListener('popstate', handleNavigation);

  return () => {
    window.removeEventListener('click', handleClick);
    window.removeEventListener('popstate', handleNavigation);
  };
}
