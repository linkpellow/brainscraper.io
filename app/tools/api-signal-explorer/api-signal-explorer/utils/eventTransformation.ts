/**
 * Shared utility for transforming network events
 * Converts bridge events to RawNetworkEvent format
 */

import type { RawNetworkEvent } from '@/src/tools/api-signal-explorer/neuromap';

type BridgeFlowEvent = {
  ts?: number;
  method?: string;
  url?: string;
  status?: number;
  reqHeaders?: Record<string, string>;
  resHeaders?: Record<string, string>;
  reqBodySize?: number;
  resBodySize?: number;
  resMime?: string;
  reqBodyText?: string;
  resBodyText?: string;
  durationMs?: number;
  source?: "mobile" | "browser";
  phase?: "page_load" | "interaction" | "background";
  actionId?: string;
};

/**
 * Transform bridge flow event to RawNetworkEvent
 */
export function transformFlowToNetworkEvent(flow: BridgeFlowEvent): RawNetworkEvent | null {
  try {
    if (!flow.url) return null;
    
    const urlObj = new URL(flow.url);
    
    return {
      ts: flow.ts || Date.now(),
      method: flow.method || 'GET',
      url: flow.url,
      path: urlObj.pathname,
      host: urlObj.hostname,
      status: flow.status,
      reqHeaders: flow.reqHeaders || {},
      resHeaders: flow.resHeaders || {},
      reqCookies: {},
      reqBodySize: flow.reqBodySize,
      resBodySize: flow.resBodySize,
      resMime: flow.resMime,
      reqBodyText: flow.reqBodyText,
      resBodyText: flow.resBodyText,
      query: Object.fromEntries(urlObj.searchParams.entries()),
      phase: flow.phase,
      source: flow.source || 'browser',
      actionId: flow.actionId,
      durationMs: flow.durationMs,
    };
  } catch {
    // Invalid URL, skip
    return null;
  }
}

/**
 * Transform multiple bridge flow events to RawNetworkEvent array
 */
export function transformFlowsToNetworkEvents(flows: BridgeFlowEvent[]): RawNetworkEvent[] {
  return flows
    .map(transformFlowToNetworkEvent)
    .filter((event): event is RawNetworkEvent => event !== null);
}