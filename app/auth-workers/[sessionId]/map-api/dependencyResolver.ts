/**
 * Dependency Resolver (Step 3D)
 * 
 * Builds DAG and resolves prerequisites for dependency-aware testing
 */

import type { EndpointCatalogEntry, AuthFlowGraph, AuthSummary } from './types';
import type { AuthContext } from './authContext';

/**
 * Dependency node
 */
export type DependencyNode = {
  endpointId: string;
  endpoint: EndpointCatalogEntry;
  prerequisites: string[]; // Endpoint IDs that must run first
  requiredArtifacts: {
    cookies: string[];
    headers: string[];
    bearerToken: boolean;
    csrf: boolean;
  };
};

/**
 * Dependency graph
 */
export type DependencyGraph = {
  nodes: Map<string, DependencyNode>;
  edges: Array<{ from: string; to: string }>; // from prerequisite to dependent
};

/**
 * Build dependency graph from catalog and auth flow
 */
export function buildDependencyGraph(
  entries: EndpointCatalogEntry[],
  authFlowGraph: AuthFlowGraph,
  authSummary: AuthSummary
): DependencyGraph {
  const nodes = new Map<string, DependencyNode>();
  const edges: Array<{ from: string; to: string }> = [];
  
  // Create nodes for each endpoint
  for (const entry of entries) {
    const requiredArtifacts = {
      cookies: entry.requiredAuth.cookies || [],
      headers: entry.requiredAuth.headers.filter(h => h.toLowerCase() !== 'authorization') || [],
      bearerToken: entry.requiredAuth.tokens !== undefined && entry.requiredAuth.tokens.length > 0,
      csrf: entry.requiredAuth.csrf !== undefined,
    };
    
    const prerequisites: string[] = [];
    
    // Find prerequisites: endpoints that mint required cookies
    for (const cookieName of requiredArtifacts.cookies) {
      const cookieSource = entry.authSources.cookies.get(cookieName);
      if (cookieSource) {
        // Find endpoint that mints this cookie
        const mintingEndpoint = entries.find(e => 
          e.requestSchema.path && cookieSource.includes(e.requestSchema.path)
        );
        if (mintingEndpoint && mintingEndpoint.id !== entry.id) {
          if (!prerequisites.includes(mintingEndpoint.id)) {
            prerequisites.push(mintingEndpoint.id);
            edges.push({ from: mintingEndpoint.id, to: entry.id });
          }
        }
      }
    }
    
    // Find prerequisites: endpoints that return bearer token
    if (requiredArtifacts.bearerToken) {
      const tokenEndpoint = authSummary.tokenEndpoints.find(te => 
        te.returns.includes('bearer_token') || te.returns.includes('access_token')
      );
      if (tokenEndpoint) {
        const mintingEndpoint = entries.find(e => 
          e.requestSchema.path && tokenEndpoint.endpoint.includes(e.requestSchema.path)
        );
        if (mintingEndpoint && mintingEndpoint.id !== entry.id) {
          if (!prerequisites.includes(mintingEndpoint.id)) {
            prerequisites.push(mintingEndpoint.id);
            edges.push({ from: mintingEndpoint.id, to: entry.id });
          }
        }
      }
    }
    
    nodes.set(entry.id, {
      endpointId: entry.id,
      endpoint: entry,
      prerequisites,
      requiredArtifacts,
    });
  }
  
  return { nodes, edges };
}

/**
 * Resolve execution order (topological sort)
 */
export function resolveExecutionOrder(
  graph: DependencyGraph,
  targetEndpointId: string
): string[] {
  const visited = new Set<string>();
  const order: string[] = [];
  
  function visit(nodeId: string) {
    if (visited.has(nodeId)) return;
    
    const node = graph.nodes.get(nodeId);
    if (!node) return;
    
    // Visit prerequisites first
    for (const prereqId of node.prerequisites) {
      visit(prereqId);
    }
    
    visited.add(nodeId);
    order.push(nodeId);
  }
  
  visit(targetEndpointId);
  
  return order;
}

/**
 * Check if endpoint can run (has all required artifacts)
 */
export function canRunEndpoint(
  node: DependencyNode,
  authContext: AuthContext
): { canRun: boolean; missing: string[] } {
  const check = authContext.hasRequiredArtifacts(
    node.requiredArtifacts,
    node.endpoint.host
  );
  
  return {
    canRun: check.available,
    missing: check.missing,
  };
}
