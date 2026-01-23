/**
 * Step 2 Processing Pipeline
 * 
 * Orchestrates all Step 2 operations
 */

import { groupEndpoints, type EndpointGroup } from './endpointGrouping';
import { classifyAllEndpoints } from './endpointClassification';
import { computeAuthRequirements, type MinimalAuthRequirements } from './authRequirements';
import { buildAuthFlowGraph, generateAuthSummary, type AuthFlowGraph, type AuthSummary } from './authFlowGraph';
import { generateEndpointCatalog, type EndpointCatalog } from './endpointCatalog';
import type { ArtifactBundle } from './types';

/**
 * Process Step 2: Build endpoint catalog and auth flow graph
 */
export function processStep2(bundle: ArtifactBundle): EndpointCatalog {
  // 2A: Group endpoints
  const groups = groupEndpoints(bundle.events);
  
  // 2B: Classify endpoints
  classifyAllEndpoints(
    groups,
    bundle.events,
    bundle.cookieJar.timeline,
    bundle.authArtifacts
  );
  
  // 2C: Compute auth requirements
  const authRequirements = new Map<string, any>();
  for (const group of groups) {
    if (group.role !== 'NOISE') {
      const reqs = computeAuthRequirements(
        group,
        bundle.events,
        bundle.cookieJar.timeline,
        bundle.authArtifacts
      );
      authRequirements.set(group.keyString, reqs);
    }
  }
  
  // 2D: Build auth flow graph
  const authFlowGraph = buildAuthFlowGraph(
    groups,
    bundle.events,
    bundle.cookieJar.timeline,
    bundle.authArtifacts,
    authRequirements
  );
  
  // Generate auth summary
  const authSummary = generateAuthSummary(
    groups,
    bundle.events,
    bundle.cookieJar.timeline,
    bundle.authArtifacts,
    authRequirements
  );
  
  // 2E: Generate endpoint catalog
  const catalog = generateEndpointCatalog(
    groups,
    bundle.events,
    authRequirements,
    authSummary,
    authFlowGraph
  );
  
  return catalog;
}
