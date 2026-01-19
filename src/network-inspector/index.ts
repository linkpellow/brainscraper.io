/**
 * Network Inspector - Main entry point
 */

import { parseHar, loadPhaseMap, applyPhaseMapping } from './har';
import { normalizeEvent } from './normalize';
import { groupEvents, createEndpointSummary } from './dedupe';
import { scoreEndpoints } from './score';
import { generateJsonReport, generateMarkdownReport } from './report';
import { loadActionWindows, type ActionWindowsConfig } from './phase';
import { detectRetryChains, detectSessionCookieRotation } from './auth';
import type { NetworkEvent, EndpointSummary } from './types';

/**
 * Process a HAR file and generate reports
 */
export async function processHarFile(
  harPath: string,
  outputDir: string,
  options: {
    topN?: number;
    phaseMapPath?: string;
    actionsPath?: string;
  } = {}
): Promise<{ events: NetworkEvent[]; summaries: EndpointSummary[] }> {
  // Load action windows if provided
  let actionWindows: ActionWindowsConfig | undefined;
  if (options.actionsPath) {
    actionWindows = loadActionWindows(options.actionsPath);
  }

  // Parse HAR file (phases are assigned during parsing)
  let events = parseHar(harPath, actionWindows);

  // Legacy phase mapping support (deprecated, but kept for backward compatibility)
  if (options.phaseMapPath) {
    const phaseMap = loadPhaseMap(options.phaseMapPath);
    events = applyPhaseMapping(events, phaseMap);
  }

  // Normalize all events
  events = events.map(normalizeEvent);

  // Detect retry chains (needed for auth role assignment)
  const retryChains = detectRetryChains(events);

  // Determine session start timestamp
  const sessionStartTs = events.length > 0 
    ? Math.min(...events.map((e) => e.ts))
    : Date.now();

  // Group and deduplicate
  const groups = groupEvents(events);

  // Create summaries (with auth role assignment)
  const summaries = groups.map((group) =>
    createEndpointSummary(group, events, retryChains, sessionStartTs)
  );

  // Score endpoints
  const scoredSummaries = scoreEndpoints(groups, summaries, events);

  // Generate reports
  generateJsonReport(scoredSummaries, outputDir, options.topN || 50);
  generateMarkdownReport(scoredSummaries, events, outputDir);

  return {
    events,
    summaries: scoredSummaries,
  };
}

export * from './types';
export * from './har';
export * from './phase';
export * from './normalize';
export * from './dedupe';
export * from './score';
export * from './report';
