/**
 * Debug Report Generator
 * 
 * Generates complete ZIP reports with all artifacts:
 * - report.json (structured)
 * - report.md (human-readable)
 * - error_bundle.json
 * - last_failing_request.json (sanitized)
 * - client.log.jsonl
 * - server.log.jsonl
 */

import type { StructuredEvent } from './eventBus';
import type { ComprehensiveDiagnostic } from './comprehensiveDiagnostics';
import type { DiagnosticContext } from './comprehensiveDiagnostics';
import { exportDiagnosticJSON, exportDiagnosticMarkdown } from './comprehensiveDiagnostics';
import { sanitizeForExport } from './sanitization';

export type DebugReportArtifacts = {
  'report.json': string;
  'report.md': string;
  'error_bundle.json'?: string;
  'last_failing_request.json'?: string;
  'client.log.jsonl': string;
  'server.log.jsonl'?: string;
};

/**
 * Generate complete debug report artifacts
 */
export function generateDebugReport(
  primaryFailure: ComprehensiveDiagnostic | null,
  allEvents: StructuredEvent[],
  allLogs: any[],
  context: DiagnosticContext
): DebugReportArtifacts {
  const artifacts: DebugReportArtifacts = {
    'report.json': '',
    'report.md': '',
    'client.log.jsonl': '',
  };
  
  // Generate report.json (structured)
  const reportJson = {
    generated: new Date().toISOString(),
    primaryFailure: primaryFailure ? {
      id: primaryFailure.id,
      timestamp: primaryFailure.timestamp,
      error: primaryFailure.error,
      rootCause: primaryFailure.rootCause,
      suggestedFix: primaryFailure.suggestedFix,
      locations: primaryFailure.locations,
    } : null,
    context: sanitizeForExport(context),
    eventCount: allEvents.length,
    logCount: allLogs.length,
  };
  artifacts['report.json'] = JSON.stringify(reportJson, null, 2);
  
  // Generate report.md (human-readable)
  let reportMd = `# Debug Report\n\n`;
  reportMd += `**Generated:** ${new Date().toISOString()}\n`;
  reportMd += `**Total Events:** ${allEvents.length}\n`;
  reportMd += `**Total Logs:** ${allLogs.length}\n\n`;
  
  if (primaryFailure) {
    reportMd += `## Primary Failure\n\n`;
    reportMd += exportDiagnosticMarkdown(primaryFailure, allLogs);
    reportMd += `\n\n`;
  }
  
  reportMd += `## Event Timeline\n\n`;
  allEvents.slice(-50).forEach((event, idx) => {
    reportMd += `${idx + 1}. [${new Date(event.timestamp).toISOString()}] ${event.level.toUpperCase()} ${event.component}: ${event.message}\n`;
  });
  
  artifacts['report.md'] = reportMd;
  
  // Generate error_bundle.json (if primary failure exists)
  if (primaryFailure) {
    artifacts['error_bundle.json'] = JSON.stringify({
      error: primaryFailure.error,
      rootCause: primaryFailure.rootCause,
      suggestedFix: primaryFailure.suggestedFix,
      context: sanitizeForExport(primaryFailure.context),
      locations: primaryFailure.locations,
    }, null, 2);
  }
  
  // Find last failing request
  const lastFailingRequest = allEvents
    .filter(e => e.network && (e.network.status && e.network.status >= 400 || e.network.error))
    .sort((a, b) => b.timestamp - a.timestamp)[0];
  
  if (lastFailingRequest && lastFailingRequest.network) {
    const network = lastFailingRequest.network;
    artifacts['last_failing_request.json'] = JSON.stringify({
      method: network.method,
      url: network.url,
      status: network.status,
      statusText: network.statusText,
      error: network.error,
      timestamp: lastFailingRequest.timestamp,
      request: sanitizeForExport({
        body: network.requestBody || undefined,
        headers: network.headers,
        size: network.requestSize,
      }),
      response: sanitizeForExport({
        body: network.responseBody || undefined,
        size: network.responseSize,
      }),
    }, null, 2);
  }
  
  // Generate client.log.jsonl (structured logs, one per line)
  artifacts['client.log.jsonl'] = allLogs
    .map(log => JSON.stringify(sanitizeForExport(log)))
    .join('\n');
  
  // Server logs would come from server-side storage
  // For now, leave empty or fetch from API
  
  return artifacts;
}

/**
 * Create ZIP file from artifacts
 */
export async function createDebugReportZip(artifacts: DebugReportArtifacts): Promise<Blob> {
  // Dynamic import of JSZip to avoid SSR issues
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  
  // Add all artifacts to ZIP
  Object.entries(artifacts).forEach(([filename, content]) => {
    if (content) {
      zip.file(filename, content);
    }
  });
  
  // Generate ZIP blob
  const blob = await zip.generateAsync({ type: 'blob' });
  return blob;
}
