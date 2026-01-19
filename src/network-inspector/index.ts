/**
 * Network Inspector - Main entry point
 */

import { parseHar, loadPhaseMap, applyPhaseMapping } from './har';
import { normalizeEvent } from './normalize';
import { groupEvents, createEndpointSummary } from './dedupe';
import { scoreEndpoints } from './score';
import { generateJsonReport, generateMarkdownReport } from './report';
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
  } = {}
): Promise<{ events: NetworkEvent[]; summaries: EndpointSummary[] }> {
  // Parse HAR file
  let events = parseHar(harPath);

  // Apply phase mapping if provided
  if (options.phaseMapPath) {
    const phaseMap = loadPhaseMap(options.phaseMapPath);
    events = applyPhaseMapping(events, phaseMap);
  }

  // Normalize all events
  events = events.map(normalizeEvent);

  // Group and deduplicate
  const groups = groupEvents(events);

  // Create summaries
  const summaries = groups.map(createEndpointSummary);

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
export * from './normalize';
export * from './dedupe';
export * from './score';
export * from './report';
