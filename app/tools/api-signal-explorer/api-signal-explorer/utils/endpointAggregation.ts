/**
 * Shared utility for endpoint aggregation and deduplication
 * Used by both Legacy mode (page.tsx) and Neuromap mode (useWebSocket.ts)
 */

import type { RawNetworkEvent } from '@/src/tools/api-signal-explorer/neuromap';
import type { EndpointData } from '../types';

/**
 * Create or update an endpoint in the endpoint map
 */
export function updateEndpointInMap(
  endpointMap: Map<string, EndpointData>,
  event: RawNetworkEvent | {
    method: string;
    host: string;
    path: string;
    ts: number;
    url: string;
    status?: number;
    reqHeaders?: Record<string, string>;
    resMime?: string;
    resBodySize?: number;
    reqBodyText?: string;
    resBodyText?: string;
  }
): void {
  const key = `${event.method} ${event.host}${event.path}`;
  
  if (!endpointMap.has(key)) {
    endpointMap.set(key, {
      method: event.method,
      host: event.host,
      path: event.path,
      count: 0,
      statuses: {},
      hasAuth: false,
      isMutation: false,
      sampleUrl: event.url,
      lastSeen: event.ts,
      sampleHeaders: event.reqHeaders,
      sampleReqBody: event.reqBodyText,
      sampleResBody: event.resBodyText,
    });
  }

  const endpoint = endpointMap.get(key)!;
  endpoint.count++;
  endpoint.lastSeen = event.ts;
  
  if (event.status) {
    const statusStr = String(event.status);
    endpoint.statuses[statusStr] = (endpoint.statuses[statusStr] || 0) + 1;
  }

  if (event.resMime) {
    endpoint.resMime = event.resMime;
  }

  if (event.resBodySize) {
    endpoint.resSizeAvg = ((endpoint.resSizeAvg || 0) * (endpoint.count - 1) + event.resBodySize) / endpoint.count;
  }

  // Check for auth headers
  const authHeaders = ['authorization', 'x-auth-token', 'x-api-key', 'cookie'];
  if (event.reqHeaders) {
    endpoint.hasAuth = authHeaders.some(h => 
      Object.keys(event.reqHeaders || {}).some(k => k.toLowerCase().includes(h))
    );
  }

  // Check if mutation
  endpoint.isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(event.method);

  // Update sample body if not set or if this is newer
  if (event.reqBodyText && !endpoint.sampleReqBody) {
    endpoint.sampleReqBody = event.reqBodyText;
  }
  if (event.resBodyText && !endpoint.sampleResBody) {
    endpoint.sampleResBody = event.resBodyText;
  }
}

/**
 * Process multiple events and return aggregated endpoints
 */
export function aggregateEndpoints(
  events: (RawNetworkEvent | {
    method: string;
    host: string;
    path: string;
    ts: number;
    url: string;
    status?: number;
    reqHeaders?: Record<string, string>;
    resMime?: string;
    resBodySize?: number;
    reqBodyText?: string;
    resBodyText?: string;
  })[]
): EndpointData[] {
  const endpointMap = new Map<string, EndpointData>();
  
  for (const event of events) {
    updateEndpointInMap(endpointMap, event);
  }
  
  return Array.from(endpointMap.values());
}