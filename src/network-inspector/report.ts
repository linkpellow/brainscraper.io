/**
 * Report generation utilities
 */

import * as fs from 'fs';
import * as path from 'path';
import type { EndpointSummary, NetworkEvent } from './types';

/**
 * Generate JSON report of important endpoints
 */
export function generateJsonReport(
  summaries: EndpointSummary[],
  outputDir: string,
  topN: number = 50
): void {
  const sorted = summaries.sort((a, b) => b.score - a.score);
  const topEndpoints = sorted.slice(0, topN);

  const report = {
    generated: new Date().toISOString(),
    totalEndpoints: summaries.length,
    topEndpoints,
  };

  const outputPath = path.join(outputDir, 'important_endpoints.json');
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');
}

/**
 * Generate Markdown report
 */
export function generateMarkdownReport(
  summaries: EndpointSummary[],
  allEvents: NetworkEvent[],
  outputDir: string
): void {
  const sorted = summaries.sort((a, b) => b.score - a.score);
  const topImportant = sorted.filter((s) => s.score > 0).slice(0, 20);
  const topNoise = sorted
    .filter((s) => s.score <= 0 || s.count > 50)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Phase-based categorization
  const interactionDriven = sorted.filter(
    (s) => s.phaseDistribution && s.phaseDistribution.interaction > 0 && s.score > 0
  ).slice(0, 10);

  const backgroundPolling = sorted.filter(
    (s) => s.pollingLoop || (s.phaseDistribution && s.phaseDistribution.background >= 5 && s.count >= 5)
  ).sort((a, b) => b.count - a.count).slice(0, 10);

  const bootstrapOnly = sorted.filter(
    (s) => s.phaseDistribution && s.phaseDistribution.page_load > 0 && 
           (s.phaseDistribution.interaction === 0 && s.phaseDistribution.background === 0)
  ).slice(0, 10);

  // Auth-based categorization
  const authPrimary = sorted.filter((s) => s.authRole === 'auth_primary');
  const authRefresh = sorted.filter((s) => s.authRole === 'auth_refresh');
  const authGuard = sorted.filter((s) => s.authRole === 'auth_guard');
  const dataProtected = sorted.filter((s) => s.authRole === 'data_protected');
  const retryDependent = sorted.filter((s) => s.retryChains && s.retryChains > 0).sort((a, b) => (b.retryChains || 0) - (a.retryChains || 0));

  // Data-shape categorization
  const richDataApis = sorted
    .filter((s) => s.jsonShape && s.jsonShape.depth >= 4 && s.jsonShape.keyCount >= 30)
    .sort((a, b) => (b.jsonShape?.keyCount || 0) - (a.jsonShape?.keyCount || 0))
    .slice(0, 10);

  const mutations = sorted
    .filter((s) => s.intent === 'mutation')
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const entityHeavy = sorted
    .filter(
      (s) =>
        s.entitySignals &&
        (s.entitySignals.hasIdLike ||
          s.entitySignals.hasContactFields ||
          s.entitySignals.hasLocationFields)
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  // Detect polling loops (legacy function for backward compatibility)
  const pollingLoops = detectPollingLoops(summaries);

  const lines: string[] = [];

  lines.push('# Network Deduplication Report');
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push('');

  // Totals
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **Total Requests:** ${allEvents.length}`);
  lines.push(`- **Unique Endpoints:** ${summaries.length}`);
  lines.push(`- **High-Importance Endpoints (score > 0):** ${summaries.filter((s) => s.score > 0).length}`);
  lines.push('');

  // Top important endpoints
  lines.push('## Top Important Endpoints');
  lines.push('');
  lines.push('These endpoints scored highly based on heuristics (JSON responses, auth, write methods, etc.)');
  lines.push('');

  for (const endpoint of topImportant) {
    lines.push(`### ${endpoint.method} ${endpoint.host}${endpoint.path}`);
    lines.push('');
    lines.push(`- **Score:** ${endpoint.score}/100`);
    lines.push(`- **Count:** ${endpoint.count}`);
    lines.push(`- **Reasons:** ${endpoint.reasons.join(', ')}`);
    lines.push(`- **Status Codes:** ${Object.entries(endpoint.statuses).map(([s, c]) => `${s} (${c})`).join(', ')}`);
    if (endpoint.resMimeTop) {
      lines.push(`- **Content-Type:** ${endpoint.resMimeTop}`);
    }
    if (endpoint.resSizeAvg) {
      lines.push(`- **Avg Response Size:** ${formatBytes(endpoint.resSizeAvg)}`);
    }
    if (endpoint.sampleUrls.length > 0) {
      lines.push(`- **Sample URLs:**`);
      endpoint.sampleUrls.forEach((url) => {
        lines.push(`  - ${url}`);
      });
    }
    lines.push('');
  }

  // Top noise endpoints
  lines.push('## Top Noise Endpoints');
  lines.push('');
  lines.push('These endpoints have low scores but high request counts (likely polling or noise)');
  lines.push('');

  for (const endpoint of topNoise) {
    lines.push(`### ${endpoint.method} ${endpoint.host}${endpoint.path}`);
    lines.push('');
    lines.push(`- **Score:** ${endpoint.score}/100`);
    lines.push(`- **Count:** ${endpoint.count}`);
    lines.push(`- **Reasons:** ${endpoint.reasons.join(', ') || 'None'}`);
    lines.push('');
  }

  // Polling loops
  if (pollingLoops.length > 0) {
    lines.push('## Potential Polling Loops');
    lines.push('');
    lines.push('These endpoints repeat at regular intervals, suggesting polling behavior:');
    lines.push('');

    for (const loop of pollingLoops) {
      lines.push(`- **${loop.method} ${loop.host}${loop.path}**`);
      lines.push(`  - Count: ${loop.count}`);
      lines.push(`  - Interval: ~${loop.intervalSeconds}s`);
      lines.push(`  - Score: ${loop.score}/100`);
      lines.push('');
    }
  }

  const outputPath = path.join(outputDir, 'network_dedupe_report.md');
  fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
}

/**
 * Detect polling loops (endpoints that repeat at regular intervals)
 */
function detectPollingLoops(summaries: EndpointSummary[]): Array<{
  method: string;
  host: string;
  path: string;
  count: number;
  intervalSeconds: number;
  score: number;
}> {
  const loops: Array<{
    method: string;
    host: string;
    path: string;
    count: number;
    intervalSeconds: number;
    score: number;
  }> = [];

  for (const summary of summaries) {
    if (summary.count < 5) continue; // Need multiple requests to detect pattern

    // Estimate interval based on time span
    const timeSpan = (summary.lastSeen - summary.firstSeen) / 1000; // seconds
    const estimatedInterval = timeSpan / summary.count;

    // If interval is between 1-60 seconds and count is high, likely polling
    if (estimatedInterval >= 1 && estimatedInterval <= 60 && summary.count > 10) {
      loops.push({
        method: summary.method,
        host: summary.host,
        path: summary.path,
        count: summary.count,
        intervalSeconds: Math.round(estimatedInterval),
        score: summary.score,
      });
    }
  }

  return loops.sort((a, b) => b.count - a.count);
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
