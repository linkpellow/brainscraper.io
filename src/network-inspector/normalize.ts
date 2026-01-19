/**
 * URL normalization utilities
 */

import * as crypto from 'crypto';
import type { NetworkEvent } from './types';

/**
 * Known noise parameters to drop from query strings
 */
const NOISE_PARAMS = new Set([
  'cachebust',
  'cache_bust',
  'cache-bust',
  '_',
  'ts',
  'timestamp',
  'rnd',
  'random',
  'nocache',
  't',
  'time',
  'v',
  'version',
  'cb',
  'callback',
]);

/**
 * Pagination parameters to normalize to "*"
 */
const PAGINATION_PARAMS = new Set(['page', 'limit', 'offset', 'cursor', 'skip', 'take', 'per_page', 'perPage']);

/**
 * Nonce-like keys to remove from JSON bodies
 */
const NONCE_KEYS = new Set(['nonce', 'state', 'timestamp', 'ts', 'time', 'rnd', 'random', 'requestId', 'request_id']);

/**
 * Strip hash from URL
 */
export function stripHash(url: string): string {
  const hashIndex = url.indexOf('#');
  return hashIndex >= 0 ? url.substring(0, hashIndex) : url;
}

/**
 * Normalize hostname (lowercase)
 */
export function normalizeHost(host: string): string {
  return host.toLowerCase();
}

/**
 * Normalize path (remove trailing slash, collapse multiple slashes)
 */
export function normalizePath(path: string): string {
  // Remove trailing slash (except root)
  let normalized = path === '/' ? path : path.replace(/\/+$/, '');
  // Collapse multiple slashes
  normalized = normalized.replace(/\/+/g, '/');
  return normalized;
}

/**
 * Normalize query parameters
 * - Drop noise params
 * - Normalize pagination params to "*"
 */
export function normalizeQuery(query: Record<string, string | string[]>): Record<string, string | string[]> {
  const normalized: Record<string, string | string[]> = {};

  for (const [key, value] of Object.entries(query)) {
    const lowerKey = key.toLowerCase();

    // Drop noise params
    if (NOISE_PARAMS.has(lowerKey)) {
      continue;
    }

    // Normalize pagination params
    if (PAGINATION_PARAMS.has(lowerKey)) {
      normalized[key] = '*';
    } else {
      normalized[key] = value;
    }
  }

  return normalized;
}

/**
 * Generate normalized key for deduplication
 */
export function normalizedKey(event: NetworkEvent): string {
  const host = normalizeHost(event.host);
  const path = normalizePath(event.path);
  const query = normalizeQuery(event.query);

  // Sort query keys for consistent ordering
  const queryKeys = Object.keys(query).sort();
  const queryString = queryKeys.length > 0 ? '?' + queryKeys.join('&') : '';

  return `${event.method} ${host}${path}${queryString}`;
}

/**
 * Generate query shape (sorted keys only, for secondary grouping)
 */
export function queryShape(query: Record<string, string | string[]>): string {
  const normalized = normalizeQuery(query);
  return Object.keys(normalized).sort().join(',');
}

/**
 * Generate body fingerprint for POST/PUT/PATCH requests
 */
export function bodyFingerprint(event: NetworkEvent): string | undefined {
  if (!event.reqBodyText || !event.reqBodyMime) {
    return undefined;
  }

  // Only fingerprint JSON bodies
  if (!event.reqBodyMime.includes('json') && !event.reqBodyText.trim().startsWith('{')) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(event.reqBodyText);

    // Remove nonce-like keys
    const cleaned = removeNonceKeys(parsed);

    // Stringify and hash
    const stable = JSON.stringify(cleaned, Object.keys(cleaned).sort());
    return crypto.createHash('sha256').update(stable).digest('hex').substring(0, 16);
  } catch {
    // Not valid JSON or parse failed
    return undefined;
  }
}

/**
 * Recursively remove nonce-like keys from an object
 */
function removeNonceKeys(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(removeNonceKeys);
  }

  if (obj !== null && typeof obj === 'object') {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (!NONCE_KEYS.has(lowerKey)) {
        cleaned[key] = removeNonceKeys(value);
      }
    }
    return cleaned;
  }

  return obj;
}

/**
 * Apply all normalizations to an event
 */
export function normalizeEvent(event: NetworkEvent): NetworkEvent {
  return {
    ...event,
    host: normalizeHost(event.host),
    path: normalizePath(event.path),
    query: normalizeQuery(event.query),
    bodyFingerprint: bodyFingerprint(event),
  };
}
