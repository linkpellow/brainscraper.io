/**
 * Neuromap Data Model
 * 
 * Represents a capture session for interactive API analysis.
 */

import type { CategoryTag } from './signals';

export type RawNetworkEvent = {
  ts: number;
  method: string;
  url: string;
  path: string;
  host: string;
  status?: number;
  reqHeaders?: Record<string, string>;
  resHeaders?: Record<string, string>;
  reqCookies?: Record<string, string>;
  reqBodySize?: number;
  resBodySize?: number;
  resMime?: string;
  reqBodyText?: string;
  resBodyText?: string;
  query?: Record<string, string | string[]>;
  phase?: "page_load" | "interaction" | "background";
  actionTag?: string;
  source: "mobile" | "browser";
  actionId?: string;        // Linked action ID
  actionConfidence?: number; // 0-1 confidence score
  actionXpath?: string;     // XPath of the DOM element that triggered this (from target-action)
  lockedStepId?: string;    // Linked locked step ID (for Auth Worker mode)
  durationMs?: number;
};

import type { ActionEvent } from './actions';

// Dynamic import to avoid circular dependencies
let convertToNetworkSignal: ((event: any) => any) | null = null;
function getConvertToNetworkSignal() {
  if (!convertToNetworkSignal) {
    try {
      const signalsModule = require('./signals');
      convertToNetworkSignal = signalsModule.convertToNetworkSignal;
    } catch {
      // Module not available
    }
  }
  return convertToNetworkSignal;
}

// LockedStep type (avoiding circular dependency by defining inline)
export type LockedStep = {
  id: string;
  stepNumber: number;
  endpoint: string;
  method: string;
  code: string;
  response: any;
  extractedVars: Record<string, any>;
  dependencies: string[];
  lockedAt: number;
  status: 'success';
  // Verification status for step-2 (token injection verification)
  verificationStatus?: {
    tokenCaptured: boolean;
    tokenInjectionAttempted: boolean;
    tokenInjectionSucceeded: boolean;
    authenticatedRequestsDetected: boolean;
    authenticatedRequestCount: number;
    verified: boolean;
    verifiedAt?: number;
    issues: string[];
  };
};

export type Neuromap = {
  id: string;
  name: string;
  createdAt: number;
  events: RawNetworkEvent[];
  actions: ActionEvent[];
  lockedSteps: LockedStep[]; // Auth Worker mode: persisted locked steps
  /** Selected endpoint keys (format: "METHOD host/path") - Currently only used in Legacy mode */
  selectedEndpointKeys: Set<string>;
  isActive: boolean;
};

/**
 * Create a new Neuromap
 */
export function createNeuromap(name: string): Neuromap {
  return {
    id: `neuromap_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    name,
    createdAt: Date.now(),
    events: [],
    actions: [],
    lockedSteps: [],
    selectedEndpointKeys: new Set(),
    isActive: false,
  };
}

/**
 * Add event to Neuromap (immutable)
 * Returns a new Neuromap instance with the event added
 */
export function addEventToNeuromap(neuromap: Neuromap, event: RawNetworkEvent): Neuromap {
  return {
    ...neuromap,
    events: [...neuromap.events, event],
  };
}

/**
 * Add multiple events to Neuromap (immutable, batch operation)
 * Returns a new Neuromap instance with all events added
 */
export function addEventsToNeuromap(neuromap: Neuromap, events: RawNetworkEvent[]): Neuromap {
  if (events.length === 0) return neuromap;
  return {
    ...neuromap,
    events: [...neuromap.events, ...events],
  };
}

/**
 * Add action to Neuromap (immutable)
 * Returns a new Neuromap instance with the action added (if not already present)
 */
export function addActionToNeuromap(neuromap: Neuromap, action: ActionEvent): Neuromap {
  // Only add if not already present (deduplicate by id)
  if (neuromap.actions.find(a => a.id === action.id)) {
    return neuromap; // No change, return same reference
  }
  return {
    ...neuromap,
    actions: [...neuromap.actions, action],
  };
}

/**
 * Add or update locked step in Neuromap (immutable)
 * Returns a new Neuromap instance with the locked step added/updated
 */
export function addLockedStepToNeuromap(neuromap: Neuromap, step: LockedStep): Neuromap {
  const existingIndex = neuromap.lockedSteps.findIndex(s => s.id === step.id);
  if (existingIndex >= 0) {
    // Update existing step
    const newSteps = [...neuromap.lockedSteps];
    newSteps[existingIndex] = step;
    return {
      ...neuromap,
      lockedSteps: newSteps,
    };
  }
  // Add new step
  return {
    ...neuromap,
    lockedSteps: [...neuromap.lockedSteps, step],
  };
}

/**
 * Remove locked step from Neuromap (immutable)
 * Returns a new Neuromap instance with the locked step removed
 */
export function removeLockedStepFromNeuromap(neuromap: Neuromap, stepId: string): Neuromap {
  return {
    ...neuromap,
    lockedSteps: neuromap.lockedSteps.filter(s => s.id !== stepId),
  };
}

/**
 * Update locked steps in Neuromap (immutable)
 * Returns a new Neuromap instance with all locked steps replaced
 */
export function setLockedStepsInNeuromap(neuromap: Neuromap, steps: LockedStep[]): Neuromap {
  return {
    ...neuromap,
    lockedSteps: steps,
  };
}

/**
 * Link events to a locked step by matching endpoint
 * Returns a new Neuromap instance with events updated
 * 
 * @param neuromap - The neuromap instance
 * @param stepId - The locked step ID
 * @param endpoint - Endpoint string (can be full URL, "host/path", or just "/path")
 * @param method - HTTP method
 */
export function linkEventsToLockedStep(
  neuromap: Neuromap,
  stepId: string,
  endpoint: string,
  method: string
): Neuromap {
  // Parse endpoint to extract host and path
  let host = '';
  let path = '';
  
  try {
    // Try parsing as full URL first
    if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
      const url = new URL(endpoint);
      host = url.hostname;
      path = url.pathname;
    } else if (endpoint.startsWith('/')) {
      // Just a path (e.g., "/api/login")
      // Match events by path only (method must match)
      path = endpoint;
      host = ''; // Will match any host
    } else {
      // Try parsing as "host/path" or "host:port/path"
      const url = new URL(`https://${endpoint}`);
      host = url.hostname;
      path = url.pathname;
    }
  } catch {
    // If all parsing fails, try to extract host and path manually
    if (endpoint.startsWith('/')) {
      path = endpoint;
      host = ''; // Match any host
    } else {
      // Try "host/path" format
      const parts = endpoint.split('/');
      if (parts.length > 0) {
        host = parts[0].split(':')[0]; // Remove port if present
        path = '/' + parts.slice(1).join('/');
      }
    }
  }

  // Update events that match this endpoint
  const updatedEvents = neuromap.events.map(event => {
    // Match by method first
    if (event.method !== method) {
      return event;
    }
    
    // If host is empty (path-only match), only match by path
    if (!host) {
      if (event.path === path && !event.lockedStepId) {
        return {
          ...event,
          lockedStepId: stepId,
        };
      }
      return event;
    }
    
    // Match by both host and path
    if (
      event.host === host &&
      event.path === path &&
      !event.lockedStepId // Only link if not already linked
    ) {
      return {
        ...event,
        lockedStepId: stepId,
      };
    }
    return event;
  });

  return {
    ...neuromap,
    events: updatedEvents,
  };
}

/**
 * Toggle endpoint selection in Neuromap (immutable)
 * Returns a new Neuromap instance with the endpoint selection toggled
 * 
 * NOTE: Currently only used in Legacy mode (page.tsx).
 * Neuromap mode (NeuromapWorkspace) does not use this feature.
 * 
 * @param neuromap - The neuromap instance
 * @param endpointKey - Endpoint key in format "METHOD host/path"
 */
export function toggleEndpointSelection(neuromap: Neuromap, endpointKey: string): Neuromap {
  const newSelectedKeys = new Set(neuromap.selectedEndpointKeys);
  if (newSelectedKeys.has(endpointKey)) {
    newSelectedKeys.delete(endpointKey);
  } else {
    newSelectedKeys.add(endpointKey);
  }
  return {
    ...neuromap,
    selectedEndpointKeys: newSelectedKeys,
  };
}

/**
 * Export Neuromap to JSON
 */
export function exportNeuromap(neuromap: Neuromap): {
  selectedEndpoints: Array<{ method: string; host: string; path: string; categoryTags?: string[] }>;
  actions: ActionEvent[];
  lockedSteps: LockedStep[];
  endpointActionLinks: Array<{
    endpointKey: string;
    actionId: string;
    actionType: string;
    confidence: number;
  }>;
  endpointStepLinks: Array<{
    endpointKey: string;
    stepId: string;
    stepNumber: number;
  }>;
  endpointSignals: Array<{
    endpointKey: string;
    categoryTags: string[];
  }>;
  eventCount: number;
  createdAt: number;
} {
  // Extract unique endpoints from selected keys
  const selectedEndpoints: Array<{ method: string; host: string; path: string; categoryTags?: string[] }> = [];
  
  for (const key of neuromap.selectedEndpointKeys) {
    // Key format: "METHOD host/path"
    const parts = key.split(' ');
    if (parts.length >= 2) {
      const method = parts[0];
      const hostPath = parts.slice(1).join(' ');
      const [host, ...pathParts] = hostPath.split('/');
      const path = '/' + pathParts.join('/');
      
      // Get category tags from first matching event
      const firstEvent = neuromap.events.find(e => 
        `${e.method} ${e.host}${e.path}` === key
      );
      let categoryTags: string[] | undefined;
      if (firstEvent) {
        const converter = getConvertToNetworkSignal();
        if (converter) {
          try {
            const signal = converter(firstEvent);
            categoryTags = signal.categoryTags;
          } catch {
            // Ignore conversion errors
          }
        }
      }
      
      selectedEndpoints.push({ method, host, path, categoryTags });
    }
  }

  // Build endpoint-action links
  const endpointActionLinks: Array<{
    endpointKey: string;
    actionId: string;
    actionType: string;
    confidence: number;
  }> = [];

  for (const event of neuromap.events) {
    if (event.actionId && event.actionConfidence !== undefined) {
      const endpointKey = `${event.method} ${event.host}${event.path}`;
      const action = neuromap.actions.find(a => a.id === event.actionId);
      if (action) {
        endpointActionLinks.push({
          endpointKey,
          actionId: event.actionId,
          actionType: action.type,
          confidence: event.actionConfidence,
        });
      }
    }
  }

  // Build endpoint-step links (for Auth Worker mode)
  const endpointStepLinks: Array<{
    endpointKey: string;
    stepId: string;
    stepNumber: number;
  }> = [];

  for (const event of neuromap.events) {
    if (event.lockedStepId) {
      const endpointKey = `${event.method} ${event.host}${event.path}`;
      const step = neuromap.lockedSteps.find(s => s.id === event.lockedStepId);
      if (step) {
        // Deduplicate: only add if not already present
        const existing = endpointStepLinks.find(
          link => link.endpointKey === endpointKey && link.stepId === event.lockedStepId
        );
        if (!existing) {
          endpointStepLinks.push({
            endpointKey,
            stepId: event.lockedStepId,
            stepNumber: step.stepNumber,
          });
        }
      }
    }
  }

  // Build endpoint signals map
  const endpointSignalsMap = new Map<string, Set<string>>();
  const converter = getConvertToNetworkSignal();
  if (converter) {
    for (const event of neuromap.events) {
      const endpointKey = `${event.method} ${event.host}${event.path}`;
      try {
        const signal = converter(event);
        if (!endpointSignalsMap.has(endpointKey)) {
          endpointSignalsMap.set(endpointKey, new Set());
        }
        signal.categoryTags.forEach((tag: CategoryTag) => {
          endpointSignalsMap.get(endpointKey)!.add(tag);
        });
      } catch {
        // Ignore conversion errors
      }
    }
  }

  const endpointSignals = Array.from(endpointSignalsMap.entries()).map(([endpointKey, tags]) => ({
    endpointKey,
    categoryTags: Array.from(tags),
  }));

  return {
    selectedEndpoints,
    actions: neuromap.actions,
    lockedSteps: neuromap.lockedSteps,
    endpointActionLinks,
    endpointStepLinks,
    endpointSignals,
    eventCount: neuromap.events.length,
    createdAt: neuromap.createdAt,
  };
}
