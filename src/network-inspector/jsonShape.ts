/**
 * JSON shape analysis and entity signal detection
 */

import type { NetworkEvent } from './types';

export type JsonShapeMetrics = {
  isJson: boolean;
  depth: number;
  keyCount: number;
  arrayCount: number;
  maxArrayLen: number;
  objectCount: number;
  hasPaginationMarkers: boolean; // next, prev, cursor, total, count, edges/nodes
  hasErrorEnvelope: boolean; // error/code/message present at top-level
  sampleKeys: string[]; // top-level keys (<= 20)
};

export type EntitySignals = {
  hasIdLike: boolean; // id, uuid, *_id patterns at any depth
  hasTimestamps: boolean; // created_at, updated_at, timestamp-ish fields
  hasContactFields: boolean; // email / phone-like keys and simple value patterns
  hasLocationFields: boolean; // city/state/zip/address-like keys
};

const MAX_NODES_TO_TRAVERSE = 10000;
const MAX_SAMPLE_KEYS = 20;

/**
 * Safely parse JSON text
 */
export function tryParseJson(text?: string): any | undefined {
  if (!text) return undefined;

  // Check if it looks like JSON
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    return undefined;
  }
}

/**
 * Compute JSON shape metrics
 */
export function analyzeJsonShape(
  bodyText?: string,
  mimeType?: string
): JsonShapeMetrics {
  const defaultMetrics: JsonShapeMetrics = {
    isJson: false,
    depth: 0,
    keyCount: 0,
    arrayCount: 0,
    maxArrayLen: 0,
    objectCount: 0,
    hasPaginationMarkers: false,
    hasErrorEnvelope: false,
    sampleKeys: [],
  };

  // Check if response is JSON
  const isJsonMime = mimeType?.includes('json') || false;
  const parsed = tryParseJson(bodyText);

  if (!parsed && !isJsonMime) {
    return defaultMetrics;
  }

  // If we couldn't parse but mime says JSON, mark as JSON but no metrics
  if (!parsed && isJsonMime) {
    return {
      ...defaultMetrics,
      isJson: true,
    };
  }

  if (!parsed) {
    return defaultMetrics;
  }

  const metrics: JsonShapeMetrics = {
    isJson: true,
    depth: 0,
    keyCount: 0,
    arrayCount: 0,
    maxArrayLen: 0,
    objectCount: 0,
    hasPaginationMarkers: false,
    sampleKeys: [],
    hasErrorEnvelope: false,
  };

  // Collect top-level keys
  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    metrics.sampleKeys = Object.keys(parsed).slice(0, MAX_SAMPLE_KEYS);
    
    // Check for error envelope
    const lowerKeys = metrics.sampleKeys.map((k) => k.toLowerCase());
    metrics.hasErrorEnvelope =
      lowerKeys.includes('error') ||
      lowerKeys.includes('code') ||
      lowerKeys.includes('message') ||
      (lowerKeys.includes('status') && lowerKeys.includes('error'));

    // Check for pagination markers
    metrics.hasPaginationMarkers =
      lowerKeys.includes('next') ||
      lowerKeys.includes('prev') ||
      lowerKeys.includes('previous') ||
      lowerKeys.includes('cursor') ||
      lowerKeys.includes('total') ||
      lowerKeys.includes('count') ||
      lowerKeys.includes('edges') ||
      lowerKeys.includes('nodes') ||
      lowerKeys.includes('page') ||
      lowerKeys.includes('offset') ||
      lowerKeys.includes('limit');
  }

  // Traverse structure
  let nodesTraversed = 0;
  const visited = new WeakSet();

  function traverse(obj: any, currentDepth: number): void {
    if (nodesTraversed >= MAX_NODES_TO_TRAVERSE) return;
    if (obj === null || obj === undefined) return;

    nodesTraversed++;
    metrics.depth = Math.max(metrics.depth, currentDepth);

    if (Array.isArray(obj)) {
      metrics.arrayCount++;
      metrics.maxArrayLen = Math.max(metrics.maxArrayLen, obj.length);

      // Traverse array elements (limit to first 100 to avoid blowup)
      for (let i = 0; i < Math.min(obj.length, 100); i++) {
        if (nodesTraversed >= MAX_NODES_TO_TRAVERSE) break;
        traverse(obj[i], currentDepth + 1);
      }
    } else if (typeof obj === 'object') {
      metrics.objectCount++;
      
      // Avoid circular references
      if (visited.has(obj)) return;
      visited.add(obj);

      const keys = Object.keys(obj);
      metrics.keyCount += keys.length;

      // Traverse object values
      for (const key of keys) {
        if (nodesTraversed >= MAX_NODES_TO_TRAVERSE) break;
        traverse(obj[key], currentDepth + 1);
      }
    }
  }

  traverse(parsed, 1);

  return metrics;
}

/**
 * Detect entity signals in JSON structure
 */
export function detectEntitySignals(
  bodyText?: string,
  mimeType?: string
): EntitySignals {
  const signals: EntitySignals = {
    hasIdLike: false,
    hasTimestamps: false,
    hasContactFields: false,
    hasLocationFields: false,
  };

  const parsed = tryParseJson(bodyText);
  if (!parsed) return signals;

  let nodesTraversed = 0;
  const visited = new WeakSet();

  function traverse(obj: any): void {
    if (nodesTraversed >= MAX_NODES_TO_TRAVERSE) return;
    if (obj === null || obj === undefined) return;

    nodesTraversed++;

    if (Array.isArray(obj)) {
      // Traverse array elements (limit to first 50)
      for (let i = 0; i < Math.min(obj.length, 50); i++) {
        if (nodesTraversed >= MAX_NODES_TO_TRAVERSE) break;
        traverse(obj[i]);
      }
    } else if (typeof obj === 'object') {
      if (visited.has(obj)) return;
      visited.add(obj);

      for (const [key, value] of Object.entries(obj)) {
        if (nodesTraversed >= MAX_NODES_TO_TRAVERSE) break;

        const lowerKey = key.toLowerCase();

        // ID-like patterns
        if (
          !signals.hasIdLike &&
          (lowerKey === 'id' ||
            lowerKey === 'uuid' ||
            lowerKey.endsWith('_id') ||
            lowerKey.endsWith('id'))
        ) {
          signals.hasIdLike = true;
        }

        // Timestamp patterns
        if (
          !signals.hasTimestamps &&
          (lowerKey.includes('created_at') ||
            lowerKey.includes('updated_at') ||
            lowerKey.includes('timestamp') ||
            lowerKey.includes('date') ||
            lowerKey === 'time')
        ) {
          signals.hasTimestamps = true;
        }

        // Contact fields
        if (!signals.hasContactFields) {
          if (lowerKey.includes('email') || lowerKey === 'email') {
            // Check if value looks like email
            if (typeof value === 'string' && value.includes('@') && value.includes('.')) {
              signals.hasContactFields = true;
            }
          } else if (lowerKey.includes('phone') || lowerKey === 'phone' || lowerKey === 'tel') {
            // Check if value looks like phone (10+ digits)
            if (typeof value === 'string') {
              const digits = value.replace(/\D/g, '');
              if (digits.length >= 10) {
                signals.hasContactFields = true;
              }
            }
          }
        }

        // Location fields
        if (
          !signals.hasLocationFields &&
          (lowerKey.includes('city') ||
            lowerKey.includes('state') ||
            lowerKey.includes('zip') ||
            lowerKey.includes('address') ||
            lowerKey.includes('location') ||
            lowerKey.includes('country'))
        ) {
          signals.hasLocationFields = true;
        }

        // Recurse into nested objects
        traverse(value);
      }
    }
  }

  traverse(parsed);

  return signals;
}

/**
 * Analyze event's JSON shape and entity signals
 */
export function analyzeEventShape(event: NetworkEvent): {
  jsonShape: JsonShapeMetrics;
  entitySignals: EntitySignals;
} {
  const jsonShape = analyzeJsonShape(event.resBodyText, event.resMime);
  const entitySignals = detectEntitySignals(event.resBodyText, event.resMime);

  return { jsonShape, entitySignals };
}
