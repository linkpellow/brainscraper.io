/**
 * Context Capture Utilities
 * 
 * Automatically captures execution context for errors:
 * - Component state/props snapshots
 * - React component tree
 * - Redux/Context state (if applicable)
 * - Performance metrics
 */

import type { DiagnosticContext } from './comprehensiveDiagnostics';

/**
 * Capture current browser context
 */
export function captureBrowserContext(): DiagnosticContext['browser'] {
  return {
    url: window.location.href,
    userAgent: navigator.userAgent,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    localStorage: captureLocalStorage(),
    sessionStorage: captureSessionStorage(),
  };
}

/**
 * Capture localStorage (sanitized)
 */
function captureLocalStorage(): Record<string, string> {
  const storage: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        // Redact sensitive data
        const value = localStorage.getItem(key) || '';
        if (key.toLowerCase().includes('token') || 
            key.toLowerCase().includes('secret') || 
            key.toLowerCase().includes('password') ||
            key.toLowerCase().includes('key')) {
          storage[key] = '[REDACTED]';
        } else {
          // Truncate long values
          storage[key] = value.length > 100 ? value.substring(0, 100) + '...' : value;
        }
      }
    }
  } catch {
    // Ignore localStorage errors
  }
  return storage;
}

/**
 * Capture sessionStorage (sanitized)
 */
function captureSessionStorage(): Record<string, string> {
  const storage: Record<string, string> = {};
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key) {
        const value = sessionStorage.getItem(key) || '';
        if (key.toLowerCase().includes('token') || 
            key.toLowerCase().includes('secret') || 
            key.toLowerCase().includes('password') ||
            key.toLowerCase().includes('key')) {
          storage[key] = '[REDACTED]';
        } else {
          storage[key] = value.length > 100 ? value.substring(0, 100) + '...' : value;
        }
      }
    }
  } catch {
    // Ignore sessionStorage errors
  }
  return storage;
}

/**
 * Capture performance metrics
 */
export function capturePerformanceMetrics(): DiagnosticContext['performanceMetrics'] {
  try {
    const memory = (performance as any).memory;
    return {
      memoryUsage: memory ? memory.usedJSHeapSize : undefined,
      renderTime: performance.now(),
    };
  } catch {
    return undefined;
  }
}

/**
 * Capture React component state (if available)
 */
export function captureComponentState(
  componentName: string,
  state: Record<string, any>,
  props: Record<string, any>
): DiagnosticContext['component'] {
  return {
    componentName,
    componentState: sanitizeObject(state),
    componentProps: sanitizeObject(props),
  };
}

/**
 * Sanitize object for logging (remove circular refs, truncate large values)
 */
function sanitizeObject(obj: any, depth: number = 0, maxDepth: number = 3): any {
  if (depth > maxDepth) return '[Max Depth]';
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') {
    const str = String(obj);
    return str.length > 200 ? str.substring(0, 200) + '...' : str;
  }
  if (Array.isArray(obj)) {
    return obj.slice(0, 10).map(item => sanitizeObject(item, depth + 1, maxDepth));
  }
  
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith('_') || key === 'ref') continue; // Skip internal React props
    sanitized[key] = sanitizeObject(value, depth + 1, maxDepth);
  }
  return sanitized;
}
