/**
 * Error Diagnostics Utilities
 * 
 * Provides intelligent error analysis and diagnostic suggestions
 * for AI-assisted debugging.
 */

import type { CodeLocation } from './codebaseAwareLogging';
import type { CapturedLog } from '../hooks/useConsoleCapture';

export type ErrorDiagnostic = {
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'type-error' | 'runtime-error' | 'network-error' | 'auth-error' | 'data-error' | 'unknown';
  likelyCause: string;
  suggestedActions: string[];
  relatedFiles: CodeLocation[];
  similarErrors?: string[]; // IDs of similar errors
};

/**
 * Analyze error and generate diagnostic information
 */
export function diagnoseError(log: CapturedLog): ErrorDiagnostic {
  const message = log.formatted.toLowerCase();
  const locations = log.locations || [];
  
  // Categorize error
  let category: ErrorDiagnostic['category'] = 'unknown';
  let likelyCause = 'Unknown error';
  let severity: ErrorDiagnostic['severity'] = 'medium';
  const suggestedActions: string[] = [];
  
  // Type errors
  if (message.includes('cannot read') || message.includes('undefined') || message.includes('null')) {
    category = 'type-error';
    likelyCause = 'Attempting to access property/method on undefined or null value';
    severity = 'high';
    suggestedActions.push(`Check if variable is defined before accessing: ${locations[0]?.file || 'unknown file'}`);
    suggestedActions.push('Add null/undefined checks or optional chaining (?.)');
    suggestedActions.push('Verify the variable is initialized before use');
  }
  
  // Network errors
  else if (message.includes('fetch') || message.includes('network') || message.includes('cors') || message.includes('404') || message.includes('500')) {
    category = 'network-error';
    likelyCause = 'Network request failed or API endpoint issue';
    severity = 'high';
    suggestedActions.push('Check if API endpoint is correct and accessible');
    suggestedActions.push('Verify network connectivity');
    suggestedActions.push('Check CORS settings if cross-origin request');
    suggestedActions.push('Verify authentication tokens are valid');
  }
  
  // Auth errors
  else if (message.includes('auth') || message.includes('token') || message.includes('unauthorized') || message.includes('401') || message.includes('403')) {
    category = 'auth-error';
    likelyCause = 'Authentication or authorization failure';
    severity = 'critical';
    suggestedActions.push('Verify auth tokens are valid and not expired');
    suggestedActions.push('Check token refresh mechanism');
    suggestedActions.push('Verify API key or credentials are correct');
    if (locations.some(loc => loc.file.includes('refresh'))) {
      suggestedActions.push('Check token refresh endpoint and credentials');
    }
  }
  
  // Data errors
  else if (message.includes('json') || message.includes('parse') || message.includes('invalid') || message.includes('malformed')) {
    category = 'data-error';
    likelyCause = 'Data parsing or validation error';
    severity = 'medium';
    suggestedActions.push('Verify data format matches expected schema');
    suggestedActions.push('Check JSON parsing logic');
    suggestedActions.push('Add data validation before processing');
  }
  
  // Runtime errors
  else if (message.includes('error') || message.includes('exception') || message.includes('failed')) {
    category = 'runtime-error';
    likelyCause = 'Runtime execution error';
    severity = 'high';
    suggestedActions.push('Check error stack trace for exact failure point');
    suggestedActions.push('Verify all required dependencies are available');
    suggestedActions.push('Check for missing imports or circular dependencies');
  }
  
  // Add file-specific suggestions
  if (locations.length > 0) {
    const primaryFile = locations[0];
    suggestedActions.push(`Read file ${primaryFile.file} around line ${primaryFile.line} for context`);
    suggestedActions.push(`Check function ${primaryFile.function || 'unknown'} in ${primaryFile.file}`);
    
    // Check for common patterns
    if (primaryFile.file.includes('route.ts')) {
      suggestedActions.push('Verify API route handler is correctly implemented');
      suggestedActions.push('Check request/response parsing');
    }
    if (primaryFile.file.includes('page.tsx') || primaryFile.file.includes('.tsx')) {
      suggestedActions.push('Check React component props and state');
      suggestedActions.push('Verify hooks are used correctly');
    }
    if (primaryFile.file.includes('utils/') || primaryFile.file.includes('hooks/')) {
      suggestedActions.push('Check utility function inputs and outputs');
      suggestedActions.push('Verify function is called with correct parameters');
    }
  }
  
  return {
    severity,
    category,
    likelyCause,
    suggestedActions,
    relatedFiles: locations,
  };
}

/**
 * Group similar errors together
 */
export function groupSimilarErrors(logs: CapturedLog[]): Map<string, CapturedLog[]> {
  const groups = new Map<string, CapturedLog[]>();
  
  for (const log of logs) {
    if (log.level !== 'error') continue;
    
    // Create a signature for the error
    const signature = createErrorSignature(log);
    
    if (!groups.has(signature)) {
      groups.set(signature, []);
    }
    groups.get(signature)!.push(log);
  }
  
  return groups;
}

/**
 * Create a signature for error grouping
 */
function createErrorSignature(log: CapturedLog): string {
  // Use message pattern and primary file location
  const messagePattern = log.message
    .replace(/\d+/g, 'N') // Replace numbers
    .replace(/['"]/g, '') // Remove quotes
    .substring(0, 100)
    .toLowerCase();
  
  const primaryFile = log.locations?.[0]?.file || 'unknown';
  const functionName = log.locations?.[0]?.function || 'unknown';
  
  return `${primaryFile}:${functionName}:${messagePattern}`;
}

/**
 * Generate comprehensive diagnostic report
 */
export function generateDiagnosticReport(logs: CapturedLog[]): string {
  const errorLogs = logs.filter(l => l.level === 'error');
  if (errorLogs.length === 0) return 'No errors found.';
  
  let report = `[ERROR DIAGNOSTIC REPORT]\n\n`;
  report += `Total Errors: ${errorLogs.length}\n`;
  report += `Generated: ${new Date().toISOString()}\n\n`;
  
  // Group similar errors
  const errorGroups = groupSimilarErrors(errorLogs);
  report += `[ERROR GROUPS]\n`;
  report += `Found ${errorGroups.size} unique error patterns\n\n`;
  
  // Analyze each error
  errorGroups.forEach((group, signature) => {
    const count = group.length;
    const firstError = group[0];
    const diagnostic = diagnoseError(firstError);
    
    report += `\n[ERROR PATTERN #${signature.substring(0, 20)}...]\n`;
    report += `Occurrences: ${count}\n`;
    report += `Severity: ${diagnostic.severity.toUpperCase()}\n`;
    report += `Category: ${diagnostic.category}\n`;
    report += `Likely Cause: ${diagnostic.likelyCause}\n\n`;
    
    report += `[SUGGESTED ACTIONS]\n`;
    diagnostic.suggestedActions.forEach((action, idx) => {
      report += `${idx + 1}. ${action}\n`;
    });
    
    if (firstError.locations && firstError.locations.length > 0) {
      report += `\n[CODEBASE LOCATIONS]\n`;
      firstError.locations.forEach((loc, idx) => {
        report += `${idx + 1}. ${loc.file}:${loc.line}:${loc.column}`;
        if (loc.function) {
          report += ` (${loc.function}())`;
        }
        report += '\n';
      });
    }
    
    report += `\n[ERROR MESSAGE]\n${firstError.formatted}\n`;
    report += '\n' + '='.repeat(80) + '\n';
  });
  
  return report;
}
