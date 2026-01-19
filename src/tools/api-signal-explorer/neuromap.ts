/**
 * Neuromap Data Model
 * 
 * Represents a capture session for interactive API analysis.
 */

export type NeuromapMode = "mobile" | "browser";

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

export type Neuromap = {
  id: string;
  name: string;
  mode: NeuromapMode;
  createdAt: number;
  events: RawNetworkEvent[];
  actions: ActionEvent[];
  selectedEndpointKeys: Set<string>;
  isActive: boolean;
};

/**
 * Create a new Neuromap
 */
export function createNeuromap(name: string, mode: NeuromapMode): Neuromap {
  return {
    id: `neuromap_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    name,
    mode,
    createdAt: Date.now(),
    events: [],
    actions: [],
    selectedEndpointKeys: new Set(),
    isActive: false,
  };
}

/**
 * Add event to Neuromap
 */
export function addEventToNeuromap(neuromap: Neuromap, event: RawNetworkEvent): void {
  neuromap.events.push(event);
}

/**
 * Toggle endpoint selection in Neuromap
 */
export function toggleEndpointSelection(neuromap: Neuromap, endpointKey: string): void {
  if (neuromap.selectedEndpointKeys.has(endpointKey)) {
    neuromap.selectedEndpointKeys.delete(endpointKey);
  } else {
    neuromap.selectedEndpointKeys.add(endpointKey);
  }
}

/**
 * Export Neuromap to JSON
 */
export function exportNeuromap(neuromap: Neuromap): {
  mode: NeuromapMode;
  selectedEndpoints: Array<{ method: string; host: string; path: string; categoryTags?: string[] }>;
  actions: ActionEvent[];
  endpointActionLinks: Array<{
    endpointKey: string;
    actionId: string;
    actionType: string;
    confidence: number;
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
    mode: neuromap.mode,
    selectedEndpoints,
    actions: neuromap.actions,
    endpointActionLinks,
    endpointSignals,
    eventCount: neuromap.events.length,
    createdAt: neuromap.createdAt,
  };
}
