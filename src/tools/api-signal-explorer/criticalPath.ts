/**
 * Critical Path Discovery
 * 
 * Automatically identifies the minimum set of APIs that make the app work
 * based on dependency structure observed in traffic.
 */

export type NodeKey = string; // Same key used by deduper: `${method} ${host}${path}`

export type EdgeType =
  | "auth_recovery"
  | "gates_followups"
  | "retry_dependency"
  | "cookie_rotation"
  | "token_rotation";

export type GraphEdge = {
  from: NodeKey;
  to: NodeKey;
  type: EdgeType;
  weight: number; // 0-1, frequency/confidence
  evidence?: string; // Human-readable evidence
};

export type CriticalNode = {
  key: NodeKey;
  method: string;
  host: string;
  path: string;
  score: number; // 0-100
  confidence: number; // 0-100
  reasons: string[];
  edgesOut: GraphEdge[];
  edgesIn: GraphEdge[];
  tags: string[]; // e.g., "bootstrap_gate", "auth_refresh", "mutation"
};

export type NetworkEvent = {
  ts: number;
  method: string;
  url: string;
  path: string;
  host: string;
  status?: number;
  reqHeaders?: Record<string, string>;
  resHeaders?: Record<string, string>;
  phase?: "page_load" | "interaction" | "background";
};

type EndpointGroup = {
  key: NodeKey;
  method: string;
  host: string;
  path: string;
  events: NetworkEvent[];
  hasAuth: boolean;
  isMutation: boolean;
  resSizeAvg?: number;
  resMime?: string;
};

type AuthFingerprint = {
  header?: string; // e.g., "bearer:123" (scheme:length)
  cookies?: Set<string>; // Cookie names
};

/**
 * Build dependency graph from network events
 */
export function buildDependencyGraph(
  endpointGroups: EndpointGroup[],
  allEvents: NetworkEvent[]
): { nodes: Map<NodeKey, CriticalNode>; edges: GraphEdge[] } {
  const nodes = new Map<NodeKey, CriticalNode>();
  const edges: GraphEdge[] = [];

  // Initialize nodes
  for (const group of endpointGroups) {
    nodes.set(group.key, {
      key: group.key,
      method: group.method,
      host: group.host,
      path: group.path,
      score: 0,
      confidence: 0,
      reasons: [],
      edgesOut: [],
      edgesIn: [],
      tags: [],
    });
  }

  // Sort events by timestamp
  const sortedEvents = [...allEvents].sort((a, b) => a.ts - b.ts);
  const sessionStart = sortedEvents.length > 0 ? sortedEvents[0].ts : Date.now();

  // 1. Detect auth recovery chains
  const authRecoveryEdges = detectAuthRecoveryChains(sortedEvents, nodes);
  edges.push(...authRecoveryEdges);

  // 2. Detect gating endpoints
  const gatingEdges = detectGatingEndpoints(sortedEvents, nodes, sessionStart);
  edges.push(...gatingEdges);

  // 3. Detect token/cookie rotation
  const rotationEdges = detectTokenCookieRotation(sortedEvents, nodes);
  edges.push(...rotationEdges);

  // Update node edges
  for (const edge of edges) {
    const fromNode = nodes.get(edge.from);
    const toNode = nodes.get(edge.to);
    if (fromNode && toNode) {
      fromNode.edgesOut.push(edge);
      toNode.edgesIn.push(edge);
    }
  }

  // Score nodes
  scoreCriticality(nodes, edges, sortedEvents, sessionStart);

  return { nodes, edges };
}

/**
 * Detect auth recovery chains: 401/403 → recovery → retry
 */
function detectAuthRecoveryChains(
  events: NetworkEvent[],
  nodes: Map<NodeKey, CriticalNode>
): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const eventMap = new Map<string, NetworkEvent[]>();

  // Group events by endpoint key
  for (const event of events) {
    const key = `${event.method} ${event.host}${event.path}`;
    if (!eventMap.has(key)) {
      eventMap.set(key, []);
    }
    eventMap.get(key)!.push(event);
  }

  // Find 401/403 failures
  for (let i = 0; i < events.length; i++) {
    const failedEvent = events[i];
    if (failedEvent.status !== 401 && failedEvent.status !== 403) continue;

    const failedKey = `${failedEvent.method} ${failedEvent.host}${failedEvent.path}`;
    const failedFingerprint = getAuthFingerprint(failedEvent);

    // Look for recovery event within 5 seconds
    const recoveryWindow = failedEvent.ts + 5000;
    let recoveryEvent: NetworkEvent | null = null;
    let recoveryIndex = -1;

    for (let j = i + 1; j < events.length; j++) {
      const candidate = events[j];
      if (candidate.ts > recoveryWindow) break;
      if (candidate.host !== failedEvent.host) continue;

      const candidateFingerprint = getAuthFingerprint(candidate);
      if (hasAuthMaterial(candidate) && !fingerprintsEqual(failedFingerprint, candidateFingerprint)) {
        recoveryEvent = candidate;
        recoveryIndex = j;
        break;
      }
    }

    if (!recoveryEvent) continue;

    const recoveryKey = `${recoveryEvent.method} ${recoveryEvent.host}${recoveryEvent.path}`;

    // Look for successful retry within 10 seconds of recovery
    const retryWindow = recoveryEvent.ts + 10000;
    let retryFound = false;

    for (let k = recoveryIndex + 1; k < events.length; k++) {
      const candidate = events[k];
      if (candidate.ts > retryWindow) break;

      const candidateKey = `${candidate.method} ${candidate.host}${candidate.path}`;
      if (candidateKey === failedKey && candidate.status && candidate.status >= 200 && candidate.status < 300) {
        retryFound = true;
        break;
      }
    }

    if (retryFound) {
      // Create edges
      edges.push({
        from: failedKey,
        to: recoveryKey,
        type: "auth_recovery",
        weight: 1.0,
        evidence: `401/403 → recovery → retry observed`,
      });

      edges.push({
        from: recoveryKey,
        to: failedKey,
        type: "retry_dependency",
        weight: 1.0,
        evidence: `Enables retry of failed endpoint`,
      });

      // Tag nodes
      const recoveryNode = nodes.get(recoveryKey);
      if (recoveryNode && !recoveryNode.tags.includes("auth_refresh")) {
        recoveryNode.tags.push("auth_refresh");
      }
    }
  }

  return edges;
}

/**
 * Detect gating endpoints (bootstrap → data)
 */
function detectGatingEndpoints(
  events: NetworkEvent[],
  nodes: Map<NodeKey, CriticalNode>,
  sessionStart: number
): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const bootstrapWindow = sessionStart + 5000; // First 5 seconds

  // Track which endpoints occur in bootstrap
  const bootstrapEndpoints = new Set<NodeKey>();
  const endpointFollowUps = new Map<NodeKey, Set<NodeKey>>();
  const endpointFirstSeen = new Map<NodeKey, number>();

  for (const event of events) {
    const key = `${event.method} ${event.host}${event.path}`;
    
    if (!endpointFirstSeen.has(key)) {
      endpointFirstSeen.set(key, event.ts);
    }

    if (event.ts <= bootstrapWindow) {
      bootstrapEndpoints.add(key);
    }

    // Track follow-ups (within 2 seconds)
    if (bootstrapEndpoints.has(key)) {
      if (!endpointFollowUps.has(key)) {
        endpointFollowUps.set(key, new Set());
      }
      
      const followUpWindow = event.ts + 2000;
      for (let i = events.indexOf(event) + 1; i < events.length; i++) {
        const followUp = events[i];
        if (followUp.ts > followUpWindow) break;
        
        const followUpKey = `${followUp.method} ${followUp.host}${followUp.path}`;
        if (followUpKey !== key && endpointFirstSeen.get(followUpKey)! > event.ts) {
          endpointFollowUps.get(key)!.add(followUpKey);
        }
      }
    }
  }

  // Identify gating endpoints (bootstrap + many follow-ups)
  for (const [gateKey, followUps] of endpointFollowUps.entries()) {
    if (followUps.size >= 3) {
      const gateNode = nodes.get(gateKey);
      if (gateNode && !gateNode.tags.includes("bootstrap_gate")) {
        gateNode.tags.push("bootstrap_gate");
      }

      // Create edges to follow-ups
      for (const followUpKey of followUps) {
        edges.push({
          from: gateKey,
          to: followUpKey,
          type: "gates_followups",
          weight: Math.min(1.0, followUps.size / 10), // Weight based on number of follow-ups
          evidence: `Gates ${followUps.size} endpoints during bootstrap`,
        });
      }
    }
  }

  return edges;
}

/**
 * Detect token/cookie rotation dependencies
 */
function detectTokenCookieRotation(
  events: NetworkEvent[],
  nodes: Map<NodeKey, CriticalNode>
): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const fingerprintHistory: Array<{ ts: number; fingerprint: AuthFingerprint; event: NetworkEvent }> = [];

  // Track fingerprint changes
  for (const event of events) {
    if (!hasAuthMaterial(event)) continue;

    const fingerprint = getAuthFingerprint(event);
    const lastFingerprint = fingerprintHistory.length > 0 ? fingerprintHistory[fingerprintHistory.length - 1].fingerprint : null;

    if (lastFingerprint && !fingerprintsEqual(fingerprint, lastFingerprint)) {
      // Fingerprint changed - find the endpoint that likely caused it
      const changeWindow = event.ts - 2000; // Look back 2 seconds
      
      for (let i = fingerprintHistory.length - 1; i >= 0; i--) {
        const prev = fingerprintHistory[i];
        if (prev.ts < changeWindow) break;

        const rotationKey = `${prev.event.method} ${prev.event.host}${prev.event.path}`;
        const affectedKey = `${event.method} ${event.host}${event.path}`;

        // Check if this endpoint frequently precedes fingerprint changes
        const rotationCount = edges.filter(
          e => e.from === rotationKey && e.type === "token_rotation" || e.type === "cookie_rotation"
        ).length;

        if (rotationCount < 5) { // Limit to avoid noise
          const edgeType: EdgeType = fingerprint.header !== lastFingerprint.header ? "token_rotation" : "cookie_rotation";
          
          edges.push({
            from: rotationKey,
            to: affectedKey,
            type: edgeType,
            weight: 0.8,
            evidence: `Precedes ${edgeType === "token_rotation" ? "token" : "cookie"} rotation`,
          });

          const rotationNode = nodes.get(rotationKey);
          if (rotationNode && !rotationNode.tags.includes(edgeType)) {
            rotationNode.tags.push(edgeType);
          }
        }
      }
    }

    fingerprintHistory.push({ ts: event.ts, fingerprint, event });
  }

  return edges;
}

/**
 * Score criticality for each node
 */
function scoreCriticality(
  nodes: Map<NodeKey, CriticalNode>,
  edges: GraphEdge[],
  events: NetworkEvent[],
  sessionStart: number
): void {
  for (const [key, node] of nodes.entries()) {
    let score = 0;
    const reasons: string[] = [];

    // Base signals
    if (node.tags.includes("auth_refresh")) {
      score += 30;
      reasons.push("Participates in auth recovery chain");
    }

    if (node.tags.includes("bootstrap_gate")) {
      score += 20;
      reasons.push("Gates multiple endpoints during bootstrap");
    }

    if (node.tags.includes("token_rotation") || node.tags.includes("cookie_rotation")) {
      score += 15;
      reasons.push("Triggers auth material rotation");
    }

    // Get endpoint group for additional signals
    const nodeEvents = events.filter(
      e => `${e.method} ${e.host}${e.path}` === key
    );

    const isMutation = nodeEvents.some(e => ["POST", "PUT", "PATCH", "DELETE"].includes(e.method));
    if (isMutation) {
      score += 15;
      reasons.push("Mutation endpoint");
    }

    const hasAuth = nodeEvents.some(e => hasAuthMaterial(e));
    const interactionHeavy = nodeEvents.filter(e => e.phase === "interaction").length > nodeEvents.length * 0.3;
    if (hasAuth && interactionHeavy) {
      score += 10;
      reasons.push("Authenticated and interaction-heavy");
    }

    const largeResponses = nodeEvents.some(e => {
      // Estimate from headers or assume based on status
      return e.status && e.status >= 200 && e.status < 300;
    });
    if (largeResponses && hasAuth) {
      score += 10;
      reasons.push("Data-bearing authenticated endpoint");
    }

    const isPolling = nodeEvents.length > 10 && nodeEvents.every(e => e.phase === "background");
    if (isPolling) {
      score -= 20;
      reasons.push("Polling loop detected");
    }

    // Network effect (graph centrality-lite)
    // Weighted out-degree to important nodes
    let outDegreeScore = 0;
    for (const edge of node.edgesOut) {
      const targetNode = nodes.get(edge.to);
      if (targetNode && targetNode.score > 20) {
        outDegreeScore += edge.weight * 5; // Up to 5 points per important edge
      }
    }
    outDegreeScore = Math.min(25, outDegreeScore);
    score += outDegreeScore;
    if (outDegreeScore > 0) {
      reasons.push(`Gates ${node.edgesOut.length} critical endpoints`);
    }

    // Shortest path between auth → data
    let pathScore = 0;
    if (node.tags.includes("auth_refresh")) {
      // Count how many data endpoints depend on this auth endpoint
      const dataDependents = new Set<NodeKey>();
      const visited = new Set<NodeKey>();
      const queue: Array<{ key: NodeKey; depth: number }> = [{ key, depth: 0 }];

      while (queue.length > 0) {
        const { key: currentKey, depth } = queue.shift()!;
        if (visited.has(currentKey) || depth > 3) continue;
        visited.add(currentKey);

        const currentNode = nodes.get(currentKey);
        if (currentNode && !currentNode.tags.includes("auth_refresh")) {
          dataDependents.add(currentKey);
        }

        for (const edge of currentNode?.edgesOut || []) {
          if (!visited.has(edge.to)) {
            queue.push({ key: edge.to, depth: depth + 1 });
          }
        }
      }

      pathScore = Math.min(25, dataDependents.size * 2);
      score += pathScore;
      if (pathScore > 0) {
        reasons.push(`On critical path to ${dataDependents.size} data endpoints`);
      }
    }

    // Clamp score
    node.score = Math.max(0, Math.min(100, score));

    // Calculate confidence (based on evidence strength)
    let confidence = 50; // Base confidence
    if (node.tags.length > 0) confidence += 20;
    if (node.edgesOut.length > 0) confidence += 15;
    if (node.edgesIn.length > 0) confidence += 15;
    node.confidence = Math.min(100, confidence);

    node.reasons = reasons;
  }
}

/**
 * Simulate failure: find unreachable nodes
 */
export function simulateFailure(
  nodes: Map<NodeKey, CriticalNode>,
  edges: GraphEdge[],
  disabledKey: NodeKey
): {
  unreachable: Set<NodeKey>;
  impact: string[];
} {
  const unreachable = new Set<NodeKey>();
  const impact: string[] = [];
  const visited = new Set<NodeKey>();
  const queue: NodeKey[] = [];

  // Start from all nodes except disabled one
  for (const [key, node] of nodes.entries()) {
    if (key !== disabledKey && node.edgesIn.length === 0) {
      queue.push(key);
    }
  }

  // BFS to find reachable nodes
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current) || current === disabledKey) continue;
    visited.add(current);

    const node = nodes.get(current);
    if (!node) continue;

    for (const edge of node.edgesOut) {
      if (edge.to !== disabledKey && !visited.has(edge.to)) {
        queue.push(edge.to);
      }
    }
  }

  // Unreachable = all nodes not in visited
  for (const key of nodes.keys()) {
    if (key !== disabledKey && !visited.has(key)) {
      unreachable.add(key);
    }
  }

  // Generate impact messages
  const disabledNode = nodes.get(disabledKey);
  if (disabledNode) {
    if (disabledNode.tags.includes("auth_refresh")) {
      impact.push("Likely login breaks");
    }
    if (disabledNode.tags.includes("bootstrap_gate")) {
      impact.push("App initialization may fail");
    }
    if (unreachable.size > 0) {
      impact.push(`${unreachable.size} endpoints become unreachable`);
    }
    if (disabledNode.tags.includes("mutation")) {
      impact.push("Writes may fail after auth expiration");
    }
  }

  return { unreachable, impact };
}

// Helper functions

function getAuthFingerprint(event: NetworkEvent): AuthFingerprint {
  const fingerprint: AuthFingerprint = {};

  // Extract auth header fingerprint
  const authHeader = event.reqHeaders?.["authorization"] || event.reqHeaders?.["x-auth-token"];
  if (authHeader) {
    const parts = authHeader.split(" ");
    if (parts.length > 1) {
      fingerprint.header = `${parts[0].toLowerCase()}:${parts[1].length}`;
    } else {
      fingerprint.header = `raw:${authHeader.length}`;
    }
  }

  // Extract cookie names
  const cookieHeader = event.reqHeaders?.["cookie"];
  if (cookieHeader) {
    fingerprint.cookies = new Set(
      cookieHeader.split(";").map(c => c.split("=")[0].trim())
    );
  }

  return fingerprint;
}

function hasAuthMaterial(event: NetworkEvent): boolean {
  return !!(
    event.reqHeaders?.["authorization"] ||
    event.reqHeaders?.["x-auth-token"] ||
    event.reqHeaders?.["cookie"]
  );
}

function fingerprintsEqual(a: AuthFingerprint, b: AuthFingerprint): boolean {
  if (a.header !== b.header) return false;
  if (a.cookies && b.cookies) {
    if (a.cookies.size !== b.cookies.size) return false;
    for (const cookie of a.cookies) {
      if (!b.cookies.has(cookie)) return false;
    }
  } else if (a.cookies || b.cookies) {
    return false;
  }
  return true;
}
