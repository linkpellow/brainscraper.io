/**
 * Auth Flow Graph (Step 2D)
 * 
 * Builds graph of auth flow: mint → use → refresh → rotate
 */

import type { RequestEvent, EndpointGroup, CookieTimelineEntry, AuthArtifact, MinimalAuthRequirements } from './types';

/**
 * Graph node types
 */
export type GraphNode = {
  id: string;
  type: 'endpoint' | 'cookie' | 'token';
  label: string;
  data: any; // EndpointGroup, CookieTimelineEntry, or AuthArtifact
};

/**
 * Graph edge types
 */
export type GraphEdge = {
  from: string;
  to: string;
  type: 'sets' | 'requires' | 'uses' | 'returns' | 'refreshes';
  label?: string;
};

/**
 * Auth flow graph
 */
export type AuthFlowGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

/**
 * Auth summary
 */
export type AuthSummary = {
  sessionCookies: Array<{
    name: string;
    mintedBy: string;
    usedIn: string[];
  }>;
  tokenEndpoints: Array<{
    endpoint: string;
    returns: string[]; // access_token, refresh_token, etc.
  }>;
  refreshTriggers: Array<{
    type: '401_burst' | 'time_based' | 'explicit';
    endpoint?: string;
    description: string;
  }>;
  blockedEndpoints: Array<{
    endpoint: string;
    reason: string;
  }>;
};

/**
 * Build auth flow graph
 */
export function buildAuthFlowGraph(
  groups: EndpointGroup[],
  events: RequestEvent[],
  cookieTimeline: CookieTimelineEntry[],
  authArtifacts: AuthArtifact[],
  authRequirements: Map<string, MinimalAuthRequirements>
): AuthFlowGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  
  // Add endpoint nodes
  for (const group of groups) {
    if (group.role === 'AUTH' || group.role === 'MUTATION' || group.role === 'DATA') {
      nodes.push({
        id: `endpoint:${group.keyString}`,
        type: 'endpoint',
        label: `${group.key.method} ${group.key.templatedPath}`,
        data: group,
      });
    }
  }
  
  // Add cookie nodes
  for (const cookie of cookieTimeline) {
    if (cookie.subsequentlySentInEventIds.length > 0) {
      nodes.push({
        id: `cookie:${cookie.cookieName}`,
        type: 'cookie',
        label: cookie.cookieName,
        data: cookie,
      });
    }
  }
  
  // Add token nodes
  for (const artifact of authArtifacts) {
    if (artifact.type === 'bearer_token' || artifact.type === 'refresh_token') {
      nodes.push({
        id: `token:${artifact.name}`,
        type: 'token',
        label: artifact.name,
        data: artifact,
      });
    }
  }
  
  // Add edges: endpoint sets cookie
  for (const cookie of cookieTimeline) {
    const setterEvent = events.find(e => e.id === cookie.firstSeenAtEventId);
    if (setterEvent) {
      const setterGroup = groups.find(g => g.eventIds.includes(setterEvent.id));
      if (setterGroup) {
        edges.push({
          from: `endpoint:${setterGroup.keyString}`,
          to: `cookie:${cookie.cookieName}`,
          type: 'sets',
          label: 'sets',
        });
      }
    }
  }
  
  // Add edges: endpoint requires cookie
  for (const [groupKey, requirements] of authRequirements.entries()) {
    const group = groups.find(g => g.keyString === groupKey);
    if (!group) continue;
    
    for (const cookieReq of requirements.requiredCookies) {
      edges.push({
        from: `cookie:${cookieReq.name}`,
        to: `endpoint:${groupKey}`,
        type: 'requires',
        label: 'required',
      });
    }
  }
  
  // Add edges: endpoint returns token
  for (const artifact of authArtifacts) {
    if (artifact.location === 'response_body' || artifact.location === 'response_header') {
      const creatorEvent = events.find(e => e.id === artifact.firstSeenAtEventId);
      if (creatorEvent) {
        const creatorGroup = groups.find(g => g.eventIds.includes(creatorEvent.id));
        if (creatorGroup && (artifact.type === 'bearer_token' || artifact.type === 'refresh_token')) {
          edges.push({
            from: `endpoint:${creatorGroup.keyString}`,
            to: `token:${artifact.name}`,
            type: 'returns',
            label: 'returns',
          });
        }
      }
    }
  }
  
  // Add edges: endpoint uses token
  for (const artifact of authArtifacts) {
    if (artifact.location === 'request_header' && artifact.type === 'bearer_token') {
      for (const eventId of artifact.usedInEventIds) {
        const event = events.find(e => e.id === eventId);
        if (event) {
          const group = groups.find(g => g.eventIds.includes(event.id));
          if (group) {
            edges.push({
              from: `token:${artifact.name}`,
              to: `endpoint:${group.keyString}`,
              type: 'uses',
              label: 'uses',
            });
          }
        }
      }
    }
  }
  
  return { nodes, edges };
}

/**
 * Generate auth summary
 */
export function generateAuthSummary(
  groups: EndpointGroup[],
  events: RequestEvent[],
  cookieTimeline: CookieTimelineEntry[],
  authArtifacts: AuthArtifact[],
  authRequirements: Map<string, MinimalAuthRequirements>
): AuthSummary {
  // Session cookies
  const sessionCookies = cookieTimeline
    .filter(c => 
      c.cookieName.toLowerCase().includes('session') ||
      c.cookieName.toLowerCase().includes('auth') ||
      c.subsequentlySentInEventIds.length > 5
    )
    .map(cookie => ({
      name: cookie.cookieName,
      mintedBy: cookie.setByUrl,
      usedIn: cookie.subsequentlySentInEventIds.map(id => {
        const event = events.find(e => e.id === id);
        return event ? event.url : id;
      }).slice(0, 10), // Top 10
    }));
  
  // Token endpoints
  const tokenEndpoints: AuthSummary['tokenEndpoints'] = [];
  for (const artifact of authArtifacts) {
    if (artifact.type === 'bearer_token' || artifact.type === 'refresh_token') {
      if (artifact.createdByUrl && artifact.createdByUrl !== 'unknown') {
        const existing = tokenEndpoints.find(t => t.endpoint === artifact.createdByUrl);
        if (existing) {
          existing.returns.push(artifact.type);
        } else {
          tokenEndpoints.push({
            endpoint: artifact.createdByUrl,
            returns: [artifact.type],
          });
        }
      }
    }
  }
  
  // Refresh triggers
  const refreshTriggers: AuthSummary['refreshTriggers'] = [];
  
  // Detect 401 bursts
  const authGroups = groups.filter(g => g.role === 'AUTH');
  for (const group of authGroups) {
    const groupEvents = events.filter(e => group.eventIds.includes(e.id));
    const refreshEvents = groupEvents.filter(e => 
      e.url.toLowerCase().includes('refresh') || 
      e.url.toLowerCase().includes('token')
    );
    
    if (refreshEvents.length > 0) {
      // Check if preceded by 401s
      const beforeRefresh = events.filter(e => {
        const refreshTime = new Date(refreshEvents[0].startedDateTime).getTime();
        const eventTime = new Date(e.startedDateTime).getTime();
        return eventTime < refreshTime && eventTime > refreshTime - 10000 && e.status === 401;
      });
      
      if (beforeRefresh.length > 0) {
        refreshTriggers.push({
          type: '401_burst',
          endpoint: refreshEvents[0].url,
          description: `Refresh triggered after ${beforeRefresh.length} 401 errors`,
        });
      } else {
        refreshTriggers.push({
          type: 'explicit',
          endpoint: refreshEvents[0].url,
          description: 'Explicit refresh endpoint called',
        });
      }
    }
  }
  
  // Blocked endpoints (401/403)
  const blockedEndpoints: AuthSummary['blockedEndpoints'] = [];
  for (const group of groups) {
    const groupEvents = events.filter(e => group.eventIds.includes(e.id));
    const failures = groupEvents.filter(e => e.status === 401 || e.status === 403);
    
    if (failures.length > 0 && group.role !== 'NOISE') {
      const reqs = authRequirements.get(group.keyString);
      if (reqs && reqs.requiredCookies.length > 0) {
        blockedEndpoints.push({
          endpoint: `${group.key.method} ${group.key.templatedPath}`,
          reason: `Missing required cookies: ${reqs.requiredCookies.map(c => c.name).join(', ')}`,
        });
      } else if (reqs && reqs.requiredHeaders.length > 0) {
        blockedEndpoints.push({
          endpoint: `${group.key.method} ${group.key.templatedPath}`,
          reason: `Missing required headers: ${reqs.requiredHeaders.map(h => h.name).join(', ')}`,
        });
      }
    }
  }
  
  return {
    sessionCookies,
    tokenEndpoints,
    refreshTriggers,
    blockedEndpoints: blockedEndpoints.slice(0, 10), // Top 10
  };
}
