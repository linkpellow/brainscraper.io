/**
 * Request intent inference (mutation vs query)
 */

import type { NetworkEvent } from './types';
import { tryParseJson } from './jsonShape';

export type Intent = 'query' | 'mutation' | 'unknown';

/**
 * Infer request intent from method, body, and response
 */
export function inferIntent(event: NetworkEvent): Intent {
  // GET with no body is always a query
  if (event.method === 'GET' && !event.reqBodyText) {
    return 'query';
  }

  // DELETE is always a mutation
  if (event.method === 'DELETE') {
    return 'mutation';
  }

  // PUT/PATCH are typically mutations
  if (event.method === 'PUT' || event.method === 'PATCH') {
    return 'mutation';
  }

  // POST requires more analysis
  if (event.method === 'POST') {
    // If response is tiny ack with 2xx and no JSON, likely mutation
    if (
      event.status &&
      event.status >= 200 &&
      event.status < 300 &&
      event.resSize &&
      event.resSize < 500 &&
      !event.resMime?.includes('json')
    ) {
      return 'mutation';
    }

    // If response is large JSON list, could be query (GraphQL-like)
    if (event.resMime?.includes('json') && event.resBodyText) {
      const parsed = tryParseJson(event.resBodyText);
      if (Array.isArray(parsed) && parsed.length > 10) {
        // Large array response suggests query
        return 'query';
      }

      // Check if request body is JSON and has query-like structure
      if (event.reqBodyText) {
        const reqParsed = tryParseJson(event.reqBodyText);
        if (reqParsed && typeof reqParsed === 'object') {
          // If body has large nested object but no obvious form fields, treat as query
          const keys = Object.keys(reqParsed);
          const hasQueryLikeStructure =
            keys.length > 3 && !keys.some((k) => k.toLowerCase().includes('form'));

          if (hasQueryLikeStructure && event.resSize && event.resSize > 1000) {
            return 'query';
          }
        }
      }
    }

    // Default POST to mutation (most common case)
    return 'mutation';
  }

  return 'unknown';
}

/**
 * Infer intent for an endpoint group (majority vote)
 */
export function inferEndpointIntent(events: NetworkEvent[]): Intent {
  const intents: Intent[] = events.map(inferIntent);
  
  const counts: Record<Intent, number> = {
    query: 0,
    mutation: 0,
    unknown: 0,
  };

  for (const intent of intents) {
    counts[intent]++;
  }

  // Return majority intent, or 'mutation' if tied
  if (counts.query > counts.mutation && counts.query > counts.unknown) {
    return 'query';
  }
  if (counts.mutation > counts.unknown) {
    return 'mutation';
  }
  return 'unknown';
}
