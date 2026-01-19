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
  reqBodySize?: number;
  resBodySize?: number;
  resMime?: string;
  phase?: "page_load" | "interaction" | "background";
  actionTag?: string;
  source: "mobile" | "browser";
};

export type Neuromap = {
  id: string;
  name: string;
  mode: NeuromapMode;
  createdAt: number;
  events: RawNetworkEvent[];
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
  selectedEndpoints: Array<{ method: string; host: string; path: string }>;
  eventCount: number;
  createdAt: number;
} {
  // Extract unique endpoints from selected keys
  const selectedEndpoints: Array<{ method: string; host: string; path: string }> = [];
  
  for (const key of neuromap.selectedEndpointKeys) {
    // Key format: "METHOD host/path"
    const parts = key.split(' ');
    if (parts.length >= 2) {
      const method = parts[0];
      const hostPath = parts.slice(1).join(' ');
      const [host, ...pathParts] = hostPath.split('/');
      const path = '/' + pathParts.join('/');
      
      selectedEndpoints.push({ method, host, path });
    }
  }

  return {
    mode: neuromap.mode,
    selectedEndpoints,
    eventCount: neuromap.events.length,
    createdAt: neuromap.createdAt,
  };
}
