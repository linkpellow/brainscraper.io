/**
 * HAR file parsing utilities
 */

import * as fs from 'fs';
import * as path from 'path';
import type { NetworkEvent, HarFile, HarEntry } from './types';
import { classifyPhase, findActionTag, type ActionWindowsConfig } from './phase';
import { extractAuthSignals } from './auth';

/**
 * Parse a HAR file and extract network events
 */
export function parseHar(
  filePath: string,
  actionWindows?: ActionWindowsConfig
): NetworkEvent[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const har: HarFile = JSON.parse(content);

  if (!har.log || !Array.isArray(har.log.entries)) {
    throw new Error('Invalid HAR file: missing log.entries');
  }

  // Determine session start timestamp (first entry or from action windows)
  const sessionStartTs = actionWindows?.sessionStartTs ?? 
    (har.log.entries.length > 0 
      ? new Date(har.log.entries[0].startedDateTime).getTime()
      : Date.now());

  return har.log.entries.map((entry, index) => 
    parseHarEntry(entry, index, sessionStartTs, actionWindows?.actions || [])
  );
}

/**
 * Parse a single HAR entry into a NetworkEvent
 */
function parseHarEntry(
  entry: HarEntry,
  index: number,
  sessionStartTs: number,
  actionWindows: Array<{ label: string; startTs: number; endTs: number }> = []
): NetworkEvent {
  const url = new URL(entry.request.url);
  const startedDateTime = new Date(entry.startedDateTime);
  const ts = startedDateTime.getTime();

  // Classify phase
  const phase = classifyPhase(ts, sessionStartTs, actionWindows);
  const actionTag = findActionTag(ts, actionWindows);

  // Extract auth signals (will be attached after parsing)
  // We'll attach it in the return statement

  // Parse query parameters
  const query: Record<string, string | string[]> = {};
  url.searchParams.forEach((value, key) => {
    if (query[key]) {
      // Multiple values for same key
      const existing = query[key];
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        query[key] = [existing, value];
      }
    } else {
      query[key] = value;
    }
  });

  // Parse request headers
  const reqHeaders: Record<string, string> = {};
  entry.request.headers?.forEach((h) => {
    reqHeaders[h.name.toLowerCase()] = h.value;
  });

  // Parse cookies
  const reqCookies: Record<string, string> = {};
  entry.request.cookies?.forEach((c) => {
    reqCookies[c.name] = c.value;
  });

  // Parse response headers
  const resHeaders: Record<string, string> = {};
  entry.response.headers?.forEach((h) => {
    resHeaders[h.name.toLowerCase()] = h.value;
  });

  // Determine response size (prefer content.size, fallback to bodySize)
  const resSize = entry.response.content?.size ?? entry.response.bodySize ?? 0;

  // Extract response MIME type
  const resMime = entry.response.content?.mimeType || resHeaders['content-type'] || '';

  // Extract response body text (if available, with safe limits)
  let resBodyText: string | undefined;
  const MAX_BODY_SIZE = 200 * 1024; // 200KB limit
  if (entry.response.content?.text) {
    let bodyText = entry.response.content.text;
    
    // Handle base64 encoding
    if (entry.response.content.encoding === 'base64') {
      try {
        bodyText = Buffer.from(bodyText, 'base64').toString('utf-8');
      } catch (e) {
        // Invalid base64, skip body
        bodyText = '';
      }
    }
    
    // Truncate if too large
    if (bodyText.length > MAX_BODY_SIZE) {
      bodyText = bodyText.substring(0, MAX_BODY_SIZE);
    }
    
    resBodyText = bodyText || undefined;
  }

  const networkEvent: NetworkEvent = {
    ts,
    method: entry.request.method,
    url: entry.request.url,
    path: url.pathname,
    host: url.hostname,
    query,
    reqHeaders,
    reqCookies,
    reqBodyText: entry.request.postData?.text,
    reqBodyMime: entry.request.postData?.mimeType,
    status: entry.response.status,
    resHeaders,
    resMime,
    resSize,
    resBodyText,
    durationMs: entry.time,
    phase,
    actionTag,
  };

  // Extract and attach auth signals
  networkEvent.authSignals = extractAuthSignals(networkEvent);

  return networkEvent;
}

/**
 * Load phase mapping from JSON file (optional) - DEPRECATED
 * Use loadActionWindows from phase.ts instead
 */
export function loadPhaseMap(filePath?: string): Map<number, { phase: string; actionTag?: string }> {
  if (!filePath || !fs.existsSync(filePath)) {
    return new Map();
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const mapping: Array<{ start: number; end: number; phase: string; actionTag?: string }> = JSON.parse(content);

  const map = new Map<number, { phase: string; actionTag?: string }>();
  mapping.forEach((range) => {
    for (let ts = range.start; ts <= range.end; ts += 1000) {
      // Map each second in the range
      map.set(ts, { phase: range.phase, actionTag: range.actionTag });
    }
  });

  return map;
}

/**
 * Apply phase mapping to events - DEPRECATED
 * Phases are now assigned during HAR parsing
 */
export function applyPhaseMapping(
  events: NetworkEvent[],
  phaseMap: Map<number, { phase: string; actionTag?: string }>
): NetworkEvent[] {
  if (phaseMap.size === 0) {
    return events;
  }

  return events.map((event) => {
    // Find closest timestamp in phase map
    let closest: { phase: string; actionTag?: string } | undefined;
    let minDiff = Infinity;

    phaseMap.forEach((value, key) => {
      const diff = Math.abs(event.ts - key);
      if (diff < minDiff && diff < 5000) {
        // Within 5 seconds
        minDiff = diff;
        closest = value;
      }
    });

    if (closest) {
      return {
        ...event,
        phase: closest.phase as "page_load" | "interaction" | "background",
        actionTag: closest.actionTag,
      };
    }

    return event;
  });
}
