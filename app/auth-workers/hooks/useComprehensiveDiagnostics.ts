/**
 * Comprehensive Diagnostics Hook
 * 
 * Automatically captures full context for every error:
 * - Component state/props
 * - User action timeline
 * - Network request history
 * - Error chains
 * - Performance metrics
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { CapturedLog } from './useConsoleCapture';
import { buildComprehensiveDiagnostic, exportDiagnosticJSON, exportDiagnosticMarkdown, type ComprehensiveDiagnostic, type DiagnosticContext } from '../utils/comprehensiveDiagnostics';
import { userActionTracker } from '../utils/enhancedErrorCapture';
import { captureBrowserContext, capturePerformanceMetrics, captureComponentState } from '../utils/contextCapture';
import { eventBus, type StructuredEvent } from '../utils/eventBus';
import { tokenLifecycleTracker } from '../utils/tokenLifecycleTracker';
import { generateRequestId } from '../utils/correlationIds';

const MAX_NETWORK_HISTORY = 200; // Expanded to 200 for flight recorder
const MAX_USER_ACTIONS = 200; // Expanded to 200 for flight recorder

export function useComprehensiveDiagnostics(logs: CapturedLog[]) {
  const [diagnostics, setDiagnostics] = useState<Map<string, ComprehensiveDiagnostic>>(new Map());
  const [networkHistory, setNetworkHistory] = useState<DiagnosticContext['networkTimeline']>([]);
  const [userActions, setUserActions] = useState<DiagnosticContext['userActionTimeline']>([]);
  const componentStateRef = useRef<Record<string, any>>({});
  const componentPropsRef = useRef<Record<string, any>>({});
  
  // Track network requests with full details
  useEffect(() => {
    const originalFetch = window.fetch;
    
    window.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
      const [url, options = {}] = args;
      const timestamp = Date.now();
      const startTime = performance.now();
      const requestId = generateRequestId();
      const urlString = typeof url === 'string' ? url : url.toString();
      
      // Extract headers
      const headers = new Headers(options.headers);
      const hasAuth = headers.has('authorization');
      const authHeader = headers.get('authorization') || '';
      const authType: 'Bearer' | 'Cookie' | 'Basic' | 'Other' | 'None' = 
        authHeader.startsWith('Bearer ') ? 'Bearer' :
        authHeader.startsWith('Basic ') ? 'Basic' :
        authHeader.startsWith('Cookie ') ? 'Cookie' :
        hasAuth ? 'Other' : 'None';
      const hasCookie = headers.has('cookie') || document.cookie.length > 0;
      
      try {
        const response = await originalFetch(...args);
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        // Try to measure TTFB (time to first byte)
        let ttfb: number | undefined;
        try {
          const responseStart = performance.getEntriesByType('resource').find(
            (entry: any) => entry.name === urlString && entry.responseStart
          );
          if (responseStart) {
            ttfb = (responseStart as any).responseStart - startTime;
          }
        } catch {
          // TTFB measurement failed, estimate from duration
          ttfb = duration * 0.3; // Rough estimate
        }
        
        let responseBody: any = null;
        let responseSize = 0;
        try {
          const cloned = response.clone();
          const text = await cloned.text();
          responseSize = new Blob([text]).size;
          responseBody = JSON.parse(text);
        } catch {
          // Not JSON or failed to parse
        }
        
        const requestSize = options.body ? new Blob([typeof options.body === 'string' ? options.body : JSON.stringify(options.body)]).size : 0;
        
        const networkEvent = {
          url: urlString,
          method: options.method || 'GET',
          status: response.status,
          statusText: response.statusText,
          timestamp,
          duration,
          ttfb,
          requestSize,
          responseSize,
          requestBody: options.body ? (typeof options.body === 'string' ? JSON.parse(options.body) : options.body) : undefined,
          responseBody,
          headers: {
            authorization: hasAuth,
            authorizationType: authType,
            cookie: hasCookie,
            contentType: response.headers.get('content-type') || undefined,
          },
        };
        
        setNetworkHistory(prev => {
          const newHistory = [...prev, networkEvent];
          return newHistory.slice(-MAX_NETWORK_HISTORY);
        });
        
        // Emit to event bus
        eventBus.emit({
          level: response.ok ? 'network' : 'error',
          component: 'network',
          message: `${options.method || 'GET'} ${urlString} - ${response.status} ${response.statusText}`,
          network: networkEvent,
          requestId,
        });
        
        return response;
      } catch (error) {
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        const networkEvent = {
          url: urlString,
          method: options.method || 'GET',
          timestamp,
          duration,
          error: error instanceof Error ? error.message : String(error),
          headers: {
            authorization: hasAuth,
            authorizationType: authType,
            cookie: hasCookie,
          },
        };
        
        setNetworkHistory(prev => {
          const newHistory = [...prev, networkEvent];
          return newHistory.slice(-MAX_NETWORK_HISTORY);
        });
        
        // Emit error to event bus
        eventBus.emit({
          level: 'error',
          component: 'network',
          message: `Network error: ${error instanceof Error ? error.message : String(error)}`,
          network: networkEvent,
          error: error instanceof Error ? {
            message: error.message,
            name: error.name,
            stack: error.stack,
          } : undefined,
          requestId,
        });
        
        throw error;
      }
    };
    
    return () => {
      window.fetch = originalFetch;
    };
  }, []);
  
  // Track user actions
  useEffect(() => {
    const interval = setInterval(() => {
      const recentActions = userActionTracker.getRecentActions(10000); // Last 10 seconds
      setUserActions(prev => {
        const combined = [...prev, ...recentActions];
        return combined.slice(-MAX_USER_ACTIONS);
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  // Subscribe to event bus for auth events
  useEffect(() => {
    const unsubscribe = eventBus.subscribe((event: StructuredEvent) => {
      // Track token lifecycle
      if (event.auth) {
        tokenLifecycleTracker.processAuthEvent(event);
      }
    });
    
    return unsubscribe;
  }, []);
  
  // Build comprehensive diagnostics for errors
  useEffect(() => {
    const errorLogs = logs.filter(log => log.level === 'error' && !diagnostics.has(log.id));
    
    if (errorLogs.length === 0) return;
    
    errorLogs.forEach(async (log) => {
      const context: DiagnosticContext = {
        userActionTimeline: userActions,
        networkTimeline: networkHistory,
        errorChain: [],
        browser: captureBrowserContext(),
        performanceMetrics: capturePerformanceMetrics(),
      };
      
      // Add component context if available
      if (Object.keys(componentStateRef.current).length > 0 || Object.keys(componentPropsRef.current).length > 0) {
        context.component = captureComponentState(
          'Unknown Component',
          componentStateRef.current,
          componentPropsRef.current
        );
      }
      
      const diagnostic = await buildComprehensiveDiagnostic(log, logs, context);
      setDiagnostics(prev => new Map(prev).set(log.id, diagnostic));
    });
  }, [logs, diagnostics, userActions, networkHistory]);
  
  const getDiagnostic = useCallback((logId: string): ComprehensiveDiagnostic | undefined => {
    return diagnostics.get(logId);
  }, [diagnostics]);
  
  const exportDiagnostic = useCallback((logId: string, format: 'json' | 'markdown' = 'markdown'): string | null => {
    const diagnostic = diagnostics.get(logId);
    if (!diagnostic) return null;
    
    if (format === 'json') {
      return exportDiagnosticJSON(diagnostic);
    } else {
      return exportDiagnosticMarkdown(diagnostic, logs);
    }
  }, [diagnostics, logs]);
  
  const exportAllDiagnostics = useCallback((format: 'json' | 'markdown' = 'markdown'): string => {
    const allDiagnostics = Array.from(diagnostics.values());
    
    if (format === 'json') {
      return JSON.stringify(allDiagnostics, null, 2);
    } else {
      let report = `# COMPLETE DIAGNOSTIC REPORT\n\n`;
      report += `**Generated:** ${new Date().toISOString()}\n`;
      report += `**Total Errors:** ${allDiagnostics.length}\n\n`;
      
      allDiagnostics.forEach((diagnostic, idx) => {
        report += `---\n\n`;
        report += `## ERROR #${idx + 1}\n\n`;
        report += exportDiagnosticMarkdown(diagnostic, logs);
        report += `\n\n`;
      });
      
      return report;
    }
  }, [diagnostics, logs]);
  
  return {
    diagnostics: Array.from(diagnostics.values()),
    getDiagnostic,
    exportDiagnostic,
    exportAllDiagnostics,
    networkHistory,
    setComponentState: useCallback((state: Record<string, any>) => {
      componentStateRef.current = state;
    }, []),
    setComponentProps: useCallback((props: Record<string, any>) => {
      componentPropsRef.current = props;
    }, []),
  };
}
