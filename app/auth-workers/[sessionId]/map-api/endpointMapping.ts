/**
 * Endpoint Mapping Persistence (Step C)
 * 
 * Saves endpoint mappings per website for instant auto-selection
 */

import type { AutomationEndpointGroup } from './automationGrouping';

/**
 * Endpoint mapping
 */
export type EndpointMapping = {
  siteKey: string; // host or eTLD+1
  automationKey: string; // e.g., 'DNC_SCRUB'
  endpointSignature: {
    method: string;
    host: string;
    normalizedPathTemplate: string;
    bodyShapeHash: string;
  };
  requiredHeaders?: string[]; // Header names
  contentType?: string;
  csrfHeaderName?: string;
  mappedAt: number; // Timestamp
};

/**
 * Get site key from host
 */
export function getSiteKey(host: string): string {
  // Simple eTLD+1 extraction
  const parts = host.split('.');
  if (parts.length <= 2) {
    return host;
  }
  
  // Handle common two-part TLDs
  const twoPartTlds = ['co.uk', 'com.au', 'co.nz', 'com.br', 'co.jp'];
  const lastTwo = parts.slice(-2).join('.');
  
  if (twoPartTlds.includes(lastTwo) && parts.length > 2) {
    return parts.slice(-3).join('.');
  }
  
  return parts.slice(-2).join('.');
}

/**
 * Save endpoint mapping (server-side)
 */
export async function saveEndpointMapping(mapping: EndpointMapping): Promise<void> {
  try {
    const response = await fetch('/api/auth-worker/endpoint-mapping', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mapping),
    });
    
    if (!response.ok) {
      throw new Error('Failed to save mapping');
    }
  } catch (error) {
    console.error('[EndpointMapping] Save error:', error);
    throw error;
  }
}

/**
 * Get stored mappings (server-side)
 */
export async function getStoredMappings(): Promise<EndpointMapping[]> {
  try {
    const response = await fetch('/api/auth-worker/endpoint-mapping');
    if (!response.ok) {
      throw new Error('Failed to load mappings');
    }
    const data = await response.json();
    return data.mappings || [];
  } catch (error) {
    console.error('[EndpointMapping] Load error:', error);
    return [];
  }
}

/**
 * Get mapping for site and automation
 */
export async function getEndpointMapping(
  siteKey: string,
  automationKey: string
): Promise<EndpointMapping | undefined> {
  const mappings = await getStoredMappings();
  return mappings.find(
    m => m.siteKey === siteKey && m.automationKey === automationKey
  );
}

/**
 * Delete a mapping
 */
export async function deleteEndpointMapping(
  siteKey: string,
  automationKey: string
): Promise<void> {
  try {
    const response = await fetch('/api/auth-worker/endpoint-mapping', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ siteKey, automationKey }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to delete mapping');
    }
  } catch (error) {
    console.error('[EndpointMapping] Delete error:', error);
    throw error;
  }
}

/**
 * Find matching endpoint group from mapping
 */
export function findMappedEndpoint(
  groups: AutomationEndpointGroup[],
  mapping: EndpointMapping
): AutomationEndpointGroup | undefined {
  return groups.find(g => {
    return (
      g.method === mapping.endpointSignature.method &&
      g.host === mapping.endpointSignature.host &&
      g.normalizedPathTemplate === mapping.endpointSignature.normalizedPathTemplate &&
      g.bodyShapeHash === mapping.endpointSignature.bodyShapeHash
    );
  });
}

/**
 * Create mapping from endpoint group
 */
export function createMappingFromGroup(
  group: AutomationEndpointGroup,
  siteKey: string,
  automationKey: string
): EndpointMapping {
  return {
    siteKey,
    automationKey,
    endpointSignature: {
      method: group.method,
      host: group.host,
      normalizedPathTemplate: group.normalizedPathTemplate,
      bodyShapeHash: group.bodyShapeHash,
    },
    requiredHeaders: group.sampleHeaders.filter(h => 
      h.toLowerCase() === 'authorization' || 
      h.toLowerCase().includes('csrf') ||
      h.toLowerCase().includes('content-type')
    ),
    contentType: group.responseContentType,
    mappedAt: Date.now(),
  };
}
