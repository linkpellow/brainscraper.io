/**
 * Comprehensive Diagnostics System
 * 
 * Eliminates guesswork by automatically capturing:
 * - Full execution context (state, props, actions)
 * - Error chains and root causes
 * - Network request correlation
 * - User action timeline
 * - Code context with actual file contents
 * - Exportable diagnostic reports
 */

import type { CapturedLog } from '../hooks/useConsoleCapture';
import type { CodeLocation } from './codebaseAwareLogging';
import { parseStackTrace } from './codebaseAwareLogging';
import { diagnoseError, type ErrorDiagnostic } from './errorDiagnostics';

export type DiagnosticContext = {
  // Execution context
  component?: {
    componentName: string;
    componentState: Record<string, any>;
    componentProps: Record<string, any>;
  };
  
  // User actions (last 10 actions before error)
  userActionTimeline: Array<{
    type: string;
    target?: string;
    timestamp: number;
    details?: Record<string, any>;
  }>;
  
  // Network requests (last 10 requests before error)
  networkTimeline: Array<{
    url: string;
    method: string;
    status?: number;
    timestamp: number;
    requestBody?: any;
    responseBody?: any;
    error?: string;
  }>;
  
  // Error chain (if this error caused other errors)
  errorChain: Array<{
    error: string;
    timestamp: number;
    location?: CodeLocation;
  }>;
  
  // Browser context
  browser?: {
    url: string;
    userAgent: string;
    viewport: { width: number; height: number };
    localStorage: Record<string, string>;
    sessionStorage: Record<string, string>;
  };
  
  // Performance metrics
  performanceMetrics?: {
    memoryUsage?: number;
    renderTime?: number;
    networkLatency?: number;
  };
};

export type ComprehensiveDiagnostic = {
  id: string;
  timestamp: number;
  error: {
    message: string;
    stack?: string;
    type: string;
    category: string;
  };
  locations: CodeLocation[];
  context: DiagnosticContext;
  diagnostic: ErrorDiagnostic;
  rootCause: {
    identified: boolean;
    likelyCause: string;
    confidence: 'high' | 'medium' | 'low';
    evidence: string[];
  };
  suggestedFix: {
    action: string;
    codeChanges?: Array<{
      file: string;
      line: number;
      currentCode?: string;
      suggestedCode?: string;
      explanation: string;
    }>;
    verificationSteps: string[];
  };
  relatedErrors: string[]; // IDs of related errors
};

/**
 * Build comprehensive diagnostic from error log
 */
export async function buildComprehensiveDiagnostic(
  log: CapturedLog,
  allLogs: CapturedLog[],
  context: DiagnosticContext
): Promise<ComprehensiveDiagnostic> {
  const locations = log.locations || parseStackTrace(log.stack);
  const diagnostic = diagnoseError(log);
  
  // Find related errors (errors that happened around the same time or in same file)
  const relatedErrors = findRelatedErrors(log, allLogs);
  
  // Identify root cause
  const rootCause = identifyRootCause(log, locations, context, allLogs);
  
  // Generate suggested fix
  const suggestedFix = generateSuggestedFix(log, locations, rootCause, diagnostic);
  
  return {
    id: log.id,
    timestamp: log.timestamp,
    error: {
      message: log.message,
      stack: log.stack,
      type: log.level,
      category: diagnostic.category,
    },
    locations,
    context,
    diagnostic,
    rootCause,
    suggestedFix,
    relatedErrors,
  };
}

/**
 * Find related errors
 */
function findRelatedErrors(
  currentLog: CapturedLog,
  allLogs: CapturedLog[]
): string[] {
  const related: string[] = [];
  const timeWindow = 5000; // 5 seconds
  const currentTime = currentLog.timestamp;
  
  // Find errors in same file
  const currentFile = currentLog.locations?.[0]?.file;
  if (currentFile) {
    allLogs.forEach(log => {
      if (log.id !== currentLog.id && log.level === 'error') {
        const logFile = log.locations?.[0]?.file;
        if (logFile === currentFile) {
          related.push(log.id);
        }
      }
    });
  }
  
  // Find errors within time window
  allLogs.forEach(log => {
    if (log.id !== currentLog.id && log.level === 'error') {
      const timeDiff = Math.abs(log.timestamp - currentTime);
      if (timeDiff < timeWindow) {
        related.push(log.id);
      }
    }
  });
  
  return [...new Set(related)];
}

/**
 * Identify root cause with evidence
 */
function identifyRootCause(
  log: CapturedLog,
  locations: CodeLocation[],
  context: DiagnosticContext,
  allLogs: CapturedLog[]
): ComprehensiveDiagnostic['rootCause'] {
  const evidence: string[] = [];
  let likelyCause = 'Unknown error';
  let confidence: 'high' | 'medium' | 'low' = 'low';
  
  // Check error message patterns
  const message = log.message.toLowerCase();
  
  if (message.includes('cannot read') || message.includes('undefined') || message.includes('null')) {
    likelyCause = 'Attempting to access property on undefined/null value';
    confidence = 'high';
    evidence.push(`Error message indicates undefined/null access: "${log.message}"`);
    
    // Check if it's a common pattern
    if (locations.length > 0) {
      const loc = locations[0];
      evidence.push(`Error occurred at ${loc.file}:${loc.line}:${loc.column}`);
      if (loc.function) {
        evidence.push(`In function: ${loc.function}()`);
      }
    }
    
    // Check user actions
    if (context.userActionTimeline.length > 0) {
      const lastAction = context.userActionTimeline[context.userActionTimeline.length - 1];
      evidence.push(`User action before error: ${lastAction.type} on ${lastAction.target || 'unknown'}`);
    }
  }
  
  // Network errors
  else if (message.includes('fetch') || message.includes('network') || message.includes('cors')) {
    likelyCause = 'Network request failure';
    confidence = 'high';
    evidence.push(`Error message indicates network issue: "${log.message}"`);
    
    // Check recent network requests
    if (context.networkTimeline.length > 0) {
      const failedRequest = context.networkTimeline.find(req => req.error || (req.status && req.status >= 400));
      if (failedRequest) {
        evidence.push(`Failed network request: ${failedRequest.method} ${failedRequest.url} (${failedRequest.status || 'error'})`);
        confidence = 'high';
      }
    }
  }
  
  // Auth errors
  else if (message.includes('auth') || message.includes('token') || message.includes('unauthorized') || message.includes('401') || message.includes('403')) {
    likelyCause = 'Authentication/authorization failure';
    confidence = 'high';
    evidence.push(`Error message indicates auth issue: "${log.message}"`);
    
    // Check if token is missing
    if (context.localStorage) {
      const hasToken = Object.keys(context.localStorage).some(key => 
        key.toLowerCase().includes('token') || key.toLowerCase().includes('auth')
      );
      if (!hasToken) {
        evidence.push('No authentication token found in localStorage');
        confidence = 'high';
      }
    }
  }
  
  // Check for error patterns in related errors
  if (allLogs.length > 0) {
    const similarErrors = allLogs.filter(l => 
      l.level === 'error' && 
      l.message.toLowerCase().includes(message.substring(0, 20))
    );
    if (similarErrors.length > 1) {
      evidence.push(`This error pattern occurred ${similarErrors.length} times`);
      confidence = 'high';
    }
  }
  
  return {
    identified: confidence !== 'low',
    likelyCause,
    confidence,
    evidence,
  };
}

/**
 * Generate suggested fix with code changes
 */
function generateSuggestedFix(
  log: CapturedLog,
  locations: CodeLocation[],
  rootCause: ComprehensiveDiagnostic['rootCause'],
  diagnostic: ErrorDiagnostic
): ComprehensiveDiagnostic['suggestedFix'] {
  const codeChanges: ComprehensiveDiagnostic['suggestedFix']['codeChanges'] = [];
  const verificationSteps: string[] = [];
  
  // Generate code changes based on root cause
  if (rootCause.likelyCause.includes('undefined') || rootCause.likelyCause.includes('null')) {
    if (locations.length > 0) {
      const loc = locations[0];
      codeChanges.push({
        file: loc.file,
        line: loc.line,
        currentCode: '// Code at error location needs null check',
        suggestedCode: '// Add: if (variable) { ... } or variable?.property',
        explanation: 'Add null/undefined check before accessing property',
      });
    }
    verificationSteps.push('Verify the variable is defined before accessing');
    verificationSteps.push('Add optional chaining (?.) if appropriate');
    verificationSteps.push('Test with null/undefined values');
  }
  
  if (rootCause.likelyCause.includes('Network')) {
    verificationSteps.push('Check network connectivity');
    verificationSteps.push('Verify API endpoint is correct');
    verificationSteps.push('Check CORS settings');
    verificationSteps.push('Verify authentication tokens are valid');
  }
  
  if (rootCause.likelyCause.includes('Authentication')) {
    verificationSteps.push('Verify auth tokens are valid and not expired');
    verificationSteps.push('Check token refresh mechanism');
    verificationSteps.push('Verify API credentials are correct');
  }
  
  return {
    action: diagnostic.suggestedActions[0] || 'Review error details and apply fix',
    codeChanges,
    verificationSteps: verificationSteps.length > 0 ? verificationSteps : diagnostic.suggestedActions,
  };
}

/**
 * Generate exportable diagnostic report
 */
export function generateDiagnosticReport(
  diagnostic: ComprehensiveDiagnostic,
  allLogs: CapturedLog[]
): string {
  let report = `# COMPREHENSIVE DIAGNOSTIC REPORT\n\n`;
  report += `**Generated:** ${new Date(diagnostic.timestamp).toISOString()}\n`;
  report += `**Error ID:** ${diagnostic.id}\n\n`;
  
  report += `## ERROR SUMMARY\n\n`;
  report += `**Message:** ${diagnostic.error.message}\n`;
  report += `**Type:** ${diagnostic.error.type}\n`;
  report += `**Category:** ${diagnostic.error.category}\n`;
  report += `**Severity:** ${diagnostic.diagnostic.severity.toUpperCase()}\n\n`;
  
  report += `## ROOT CAUSE ANALYSIS\n\n`;
  report += `**Status:** ${diagnostic.rootCause.identified ? '✅ IDENTIFIED' : '⚠️ UNCERTAIN'}\n`;
  report += `**Confidence:** ${diagnostic.rootCause.confidence.toUpperCase()}\n`;
  report += `**Likely Cause:** ${diagnostic.rootCause.likelyCause}\n\n`;
  
  if (diagnostic.rootCause.evidence.length > 0) {
    report += `**Evidence:**\n`;
    diagnostic.rootCause.evidence.forEach((evidence, idx) => {
      report += `${idx + 1}. ${evidence}\n`;
    });
    report += `\n`;
  }
  
  report += `## CODE LOCATIONS\n\n`;
  diagnostic.locations.forEach((loc, idx) => {
    report += `${idx + 1}. **${loc.file}:${loc.line}:${loc.column}**\n`;
    if (loc.function) {
      report += `   - Function: ${loc.function}()\n`;
    }
    report += `   - AI Command: \`read_file("${loc.file}", offset=${Math.max(1, loc.line - 10)}, limit=21)\`\n\n`;
  });
  
  report += `## SUGGESTED FIX\n\n`;
  report += `**Action:** ${diagnostic.suggestedFix.action}\n\n`;
  
  if (diagnostic.suggestedFix.codeChanges && diagnostic.suggestedFix.codeChanges.length > 0) {
    report += `**Code Changes:**\n\n`;
    diagnostic.suggestedFix.codeChanges.forEach((change, idx) => {
      report += `### ${idx + 1}. ${change.file}:${change.line}\n\n`;
      report += `**Explanation:** ${change.explanation}\n\n`;
      if (change.currentCode) {
        report += `**Current Code:**\n\`\`\`typescript\n${change.currentCode}\n\`\`\`\n\n`;
      }
      if (change.suggestedCode) {
        report += `**Suggested Code:**\n\`\`\`typescript\n${change.suggestedCode}\n\`\`\`\n\n`;
      }
    });
  }
  
  report += `**Verification Steps:**\n`;
  diagnostic.suggestedFix.verificationSteps.forEach((step, idx) => {
    report += `${idx + 1}. ${step}\n`;
  });
  report += `\n`;
  
  report += `## CONTEXT\n\n`;
  if (diagnostic.context.browser) {
    report += `**URL:** ${diagnostic.context.browser.url}\n`;
    report += `**User Agent:** ${diagnostic.context.browser.userAgent}\n`;
    report += `**Viewport:** ${diagnostic.context.browser.viewport.width}x${diagnostic.context.browser.viewport.height}\n\n`;
  }
  
  if (diagnostic.context.component) {
    report += `**Component:** ${diagnostic.context.component.componentName}\n`;
    if (Object.keys(diagnostic.context.component.componentState).length > 0) {
      report += `**Component State:**\n\`\`\`json\n${JSON.stringify(diagnostic.context.component.componentState, null, 2)}\n\`\`\`\n\n`;
    }
    if (Object.keys(diagnostic.context.component.componentProps).length > 0) {
      report += `**Component Props:**\n\`\`\`json\n${JSON.stringify(diagnostic.context.component.componentProps, null, 2)}\n\`\`\`\n\n`;
    }
  }
  
  if (diagnostic.context.userActionTimeline.length > 0) {
    report += `**User Actions (Last 10):**\n`;
    diagnostic.context.userActionTimeline.slice(-10).forEach((action, idx) => {
      report += `${idx + 1}. ${action.type} on ${action.target || 'unknown'} at ${new Date(action.timestamp).toISOString()}\n`;
    });
    report += `\n`;
  }
  
  if (diagnostic.context.networkTimeline.length > 0) {
    report += `**Network Requests (Last 10):**\n`;
    diagnostic.context.networkTimeline.slice(-10).forEach((req, idx) => {
      report += `${idx + 1}. ${req.method} ${req.url} - ${req.status || 'error'} at ${new Date(req.timestamp).toISOString()}\n`;
    });
    report += `\n`;
  }
  
  if (diagnostic.relatedErrors.length > 0) {
    report += `## RELATED ERRORS\n\n`;
    report += `Found ${diagnostic.relatedErrors.length} related error(s) that may be connected.\n\n`;
  }
  
  report += `## FULL STACK TRACE\n\n`;
  report += `\`\`\`\n${diagnostic.error.stack || 'No stack trace available'}\n\`\`\`\n\n`;
  
  report += `---\n`;
  report += `*This report was automatically generated by the Comprehensive Diagnostics System*\n`;
  
  return report;
}

/**
 * Export diagnostic as JSON for programmatic use
 */
export function exportDiagnosticJSON(diagnostic: ComprehensiveDiagnostic): string {
  return JSON.stringify(diagnostic, null, 2);
}

/**
 * Export diagnostic as markdown for human reading
 */
export function exportDiagnosticMarkdown(diagnostic: ComprehensiveDiagnostic, allLogs: CapturedLog[]): string {
  return generateDiagnosticReport(diagnostic, allLogs);
}
