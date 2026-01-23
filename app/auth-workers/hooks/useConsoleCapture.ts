/**
 * Console Capture Hook
 * 
 * Intercepts console.log, console.error, console.warn, etc. and captures them
 * in a structured format ideal for AI consumption and debugging.
 * 
 * Enhanced with codebase-aware logging:
 * - Extracts file paths and line numbers from stack traces
 * - Normalizes paths to repo-relative format
 * - Provides code context information
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { parseStackTrace, formatLogWithCodebase, type CodeLocation } from '../utils/codebaseAwareLogging';
import { eventBus, type StructuredEvent, type EventLevel, type EventComponent } from '../utils/eventBus';
import { generateRequestId, getCorrelationIds } from '../utils/correlationIds';

export type LogLevel = 'log' | 'error' | 'warn' | 'info' | 'debug';

export type CapturedLog = {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  args: any[];
  formatted: string; // AI-friendly formatted string
  stack?: string;
  source?: string; // File/component that logged this
  context?: Record<string, any>; // Additional context
  locations?: CodeLocation[]; // Codebase locations from stack trace
  aiFormatted?: string; // Enhanced AI-friendly format with codebase references
  // Correlation IDs
  runId?: string;
  stepId?: string;
  requestId?: string;
  workerId?: string;
  traceId?: string;
  // Grouping
  fingerprint?: string;
  groupKey?: string;
  repeatCount?: number;
  // Component classification
  component?: EventComponent;
};

const MAX_LOGS = 1000; // Keep last 1000 logs
const RING_BUFFER_SIZE = 200; // Last 200 events for error snapshots

export function useConsoleCapture(enabled: boolean = true) {
  const [logs, setLogs] = useState<CapturedLog[]>([]);
  const ringBufferRef = useRef<StructuredEvent[]>([]); // Ring buffer for error snapshots
  const originalConsole = useRef<{
    log: typeof console.log;
    error: typeof console.error;
    warn: typeof console.warn;
    info: typeof console.info;
    debug: typeof console.debug;
  } | null>(null);

  /**
   * Format log arguments into AI-friendly string
   */
  const formatLogArgs = useCallback((args: any[]): string => {
    return args.map(arg => {
      if (arg === null) return 'null';
      if (arg === undefined) return 'undefined';
      
      if (typeof arg === 'string') return arg;
      
      if (typeof arg === 'object') {
        // Handle Error objects specially
        if (arg instanceof Error) {
          return `Error: ${arg.message}${arg.stack ? `\nStack: ${arg.stack}` : ''}`;
        }
        
        // Try to stringify, with fallback
        try {
          // For large objects, show summary
          const str = JSON.stringify(arg, null, 2);
          if (str.length > 5000) {
            return `${str.substring(0, 5000)}... [truncated, ${str.length} chars total]`;
          }
          return str;
        } catch (e) {
          return `[Object: ${arg.constructor?.name || 'Object'}]`;
        }
      }
      
      return String(arg);
    }).join(' ');
  }, []);

  /**
   * Extract source information from stack trace (legacy format)
   */
  const extractSource = useCallback((stack?: string): string | undefined => {
    if (!stack) return undefined;
    
    const locations = parseStackTrace(stack);
    if (locations.length > 0) {
      const loc = locations[0];
      const fileName = loc.file.split('/').pop() || loc.file;
      return `${fileName}:${loc.line}:${loc.column}${loc.function ? ` (${loc.function})` : ''}`;
    }
    
    return undefined;
  }, []);

  /**
   * Create a captured log entry with codebase awareness and correlation IDs
   */
  const createLog = useCallback((
    level: LogLevel,
    ...args: any[]
  ): CapturedLog => {
    try {
      const message = args[0]?.toString() || '';
      const formatted = formatLogArgs(args);
      const error = args.find(arg => arg instanceof Error);
      const stack = error?.stack || (level === 'error' ? new Error().stack : undefined);
      const source = extractSource(stack);
      
      // Enhanced codebase-aware formatting
      const { locations, aiFriendly } = formatLogWithCodebase(message, stack, args);
      
      // Get correlation IDs
      const correlationIds = getCorrelationIds();
      
      // Determine component from stack trace
      let component: EventComponent = 'unknown';
      if (locations && locations.length > 0) {
        const file = locations[0].file;
        if (file.includes('app/api/') || file.includes('route.ts')) {
          component = 'server';
        } else if (file.includes('app/') || file.includes('.tsx') || file.includes('.ts')) {
          component = 'ui';
        }
      }
      
      // Compute fingerprint for noise reduction
      const fingerprint = `${level}:${component}:${message}:${stack?.split('\n')[0] || ''}`;
      let hash = 0;
      for (let i = 0; i < fingerprint.length; i++) {
        const char = fingerprint.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      const fingerprintHash = `fp_${Math.abs(hash)}`;
      const groupKey = `${fingerprintHash}:${correlationIds.runId || 'global'}`;
      
      const log: CapturedLog = {
        id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        level,
        message,
        args,
        formatted,
        stack,
        source,
        locations,
        aiFormatted: aiFriendly,
        // Correlation IDs
        runId: correlationIds.runId || undefined,
        stepId: correlationIds.stepId || undefined,
        workerId: correlationIds.workerId || undefined,
        // Grouping
        fingerprint: fingerprintHash,
        groupKey,
        component,
      };
      
      // Emit to event bus (with error handling to prevent circular errors)
      try {
        eventBus.emit({
          level: level as EventLevel,
          component,
          message,
          error: error ? {
            message: error.message,
            name: error.name,
            stack: error.stack,
          } : undefined,
          locations,
          context: {
            args: args.length > 1 ? args.slice(1) : undefined,
            source,
          },
        });
      } catch (emitError) {
        // If event bus fails, don't crash - just skip it
        if (typeof window !== 'undefined' && (window as any).__ORIGINAL_CONSOLE_ERROR__) {
          (window as any).__ORIGINAL_CONSOLE_ERROR__('[useConsoleCapture] Event bus error:', emitError);
        }
      }
      
      // Add to ring buffer (with error handling)
      try {
        ringBufferRef.current.push({
          id: log.id,
          timestamp: log.timestamp,
          level: level as EventLevel,
          component,
          message,
          runId: log.runId,
          stepId: log.stepId,
          workerId: log.workerId,
          error: log.stack ? {
            message: log.message,
            name: 'Error',
            stack: log.stack,
          } : undefined,
          locations: log.locations,
          fingerprint: log.fingerprint,
          groupKey: log.groupKey,
        });
        
        // Keep ring buffer at 200 events
        if (ringBufferRef.current.length > RING_BUFFER_SIZE) {
          ringBufferRef.current.shift();
        }
      } catch (bufferError) {
        // If ring buffer fails, don't crash
        if (typeof window !== 'undefined' && (window as any).__ORIGINAL_CONSOLE_ERROR__) {
          (window as any).__ORIGINAL_CONSOLE_ERROR__('[useConsoleCapture] Ring buffer error:', bufferError);
        }
      }
      
      return log;
    } catch (createError) {
      // If log creation itself fails, return a minimal log to prevent complete failure
      return {
        id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        level,
        message: '[Log creation failed]',
        args: [],
        formatted: '[Log creation failed]',
        component: 'unknown',
      };
    }
  }, [formatLogArgs, extractSource]);

  /**
   * Intercept console methods
   */
  useEffect(() => {
    if (!enabled) {
      // Restore original console if disabled
      if (originalConsole.current) {
        console.log = originalConsole.current.log;
        console.error = originalConsole.current.error;
        console.warn = originalConsole.current.warn;
        console.info = originalConsole.current.info;
        console.debug = originalConsole.current.debug;
        originalConsole.current = null;
      }
      return;
    }

    // Store original console methods
    if (!originalConsole.current) {
      originalConsole.current = {
        log: console.log.bind(console),
        error: console.error.bind(console),
        warn: console.warn.bind(console),
        info: console.info.bind(console),
        debug: console.debug.bind(console),
      };
      
      // Also store on window for emergency access
      if (typeof window !== 'undefined') {
        (window as any).__ORIGINAL_CONSOLE_ERROR__ = originalConsole.current.error;
        (window as any).__ORIGINAL_CONSOLE_LOG__ = originalConsole.current.log;
      }
    }

    // Override console.log
    console.log = (...args: any[]) => {
      originalConsole.current!.log(...args);
      // Defer state update to avoid setState during render
      queueMicrotask(() => {
        try {
          setLogs(prev => {
            try {
              const newLog = createLog('log', ...args);
              return [...prev.slice(-MAX_LOGS + 1), newLog];
            } catch (logError) {
              // If log creation fails, return previous state unchanged
              return prev;
            }
          });
        } catch (setError) {
          // If setState fails, silently ignore to prevent circular errors
          if (typeof window !== 'undefined' && (window as any).__ORIGINAL_CONSOLE_ERROR__) {
            (window as any).__ORIGINAL_CONSOLE_ERROR__('[useConsoleCapture] Failed to capture log:', setError);
          }
        }
      });
    };

    // Override console.error
    console.error = (...args: any[]) => {
      originalConsole.current!.error(...args);
      // Defer state update to avoid setState during render
      queueMicrotask(() => {
        try {
          setLogs(prev => {
            try {
              const newLog = createLog('error', ...args);
              return [...prev.slice(-MAX_LOGS + 1), newLog];
            } catch (logError) {
              // If log creation fails, return previous state unchanged
              return prev;
            }
          });
        } catch (setError) {
          // If setState fails, silently ignore to prevent circular errors
          if (typeof window !== 'undefined' && (window as any).__ORIGINAL_CONSOLE_ERROR__) {
            (window as any).__ORIGINAL_CONSOLE_ERROR__('[useConsoleCapture] Failed to capture error:', setError);
          }
        }
      });
    };

    // Override console.warn
    console.warn = (...args: any[]) => {
      originalConsole.current!.warn(...args);
      // Defer state update to avoid setState during render
      queueMicrotask(() => {
        try {
          setLogs(prev => {
            try {
              const newLog = createLog('warn', ...args);
              return [...prev.slice(-MAX_LOGS + 1), newLog];
            } catch (logError) {
              // If log creation fails, return previous state unchanged
              return prev;
            }
          });
        } catch (setError) {
          // If setState fails, silently ignore to prevent circular errors
          if (typeof window !== 'undefined' && (window as any).__ORIGINAL_CONSOLE_ERROR__) {
            (window as any).__ORIGINAL_CONSOLE_ERROR__('[useConsoleCapture] Failed to capture warn:', setError);
          }
        }
      });
    };

    // Override console.info
    console.info = (...args: any[]) => {
      originalConsole.current!.info(...args);
      // Defer state update to avoid setState during render
      queueMicrotask(() => {
        try {
          setLogs(prev => {
            try {
              const newLog = createLog('info', ...args);
              return [...prev.slice(-MAX_LOGS + 1), newLog];
            } catch (logError) {
              // If log creation fails, return previous state unchanged
              return prev;
            }
          });
        } catch (setError) {
          // If setState fails, silently ignore to prevent circular errors
          if (typeof window !== 'undefined' && (window as any).__ORIGINAL_CONSOLE_ERROR__) {
            (window as any).__ORIGINAL_CONSOLE_ERROR__('[useConsoleCapture] Failed to capture info:', setError);
          }
        }
      });
    };

    // Override console.debug
    console.debug = (...args: any[]) => {
      originalConsole.current!.debug(...args);
      // Defer state update to avoid setState during render
      queueMicrotask(() => {
        try {
          setLogs(prev => {
            try {
              const newLog = createLog('debug', ...args);
              return [...prev.slice(-MAX_LOGS + 1), newLog];
            } catch (logError) {
              // If log creation fails, return previous state unchanged
              return prev;
            }
          });
        } catch (setError) {
          // If setState fails, silently ignore to prevent circular errors
          if (typeof window !== 'undefined' && (window as any).__ORIGINAL_CONSOLE_ERROR__) {
            (window as any).__ORIGINAL_CONSOLE_ERROR__('[useConsoleCapture] Failed to capture debug:', setError);
          }
        }
      });
    };

    // Cleanup: restore original console on unmount
    return () => {
      if (originalConsole.current) {
        console.log = originalConsole.current.log;
        console.error = originalConsole.current.error;
        console.warn = originalConsole.current.warn;
        console.info = originalConsole.current.info;
        console.debug = originalConsole.current.debug;
      }
    };
  }, [enabled, createLog]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const getFormattedLogs = useCallback((): string => {
    return logs.map(log => {
      // Use AI-enhanced format if available, otherwise fall back to standard format
      if (log.aiFormatted) {
        return log.aiFormatted;
      }
      
      const time = new Date(log.timestamp).toISOString();
      const level = log.level.toUpperCase().padEnd(5);
      const source = log.source ? ` [${log.source}]` : '';
      let formatted = `[${time}] ${level}${source}: ${log.formatted}`;
      
      // Add codebase locations if available
      if (log.locations && log.locations.length > 0) {
        formatted += '\n\n[CODEBASE REFERENCES]';
        log.locations.forEach((loc, idx) => {
          formatted += `\n${idx + 1}. ${loc.file}:${loc.line}:${loc.column}`;
          if (loc.function) {
            formatted += ` (in function: ${loc.function})`;
          }
        });
      }
      
      if (log.stack) {
        formatted += `\n\n[STACK TRACE]\n${log.stack}`;
      }
      
      return formatted;
    }).join('\n\n' + '='.repeat(80) + '\n\n');
  }, [logs]);

  return {
    logs,
    clearLogs,
    getFormattedLogs,
    errorCount: logs.filter(l => l.level === 'error').length,
    warnCount: logs.filter(l => l.level === 'warn').length,
  };
}
