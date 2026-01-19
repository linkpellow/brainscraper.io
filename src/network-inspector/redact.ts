/**
 * Redaction utilities for sensitive data
 */

import type { NetworkEvent } from './types';
import { tryParseJson } from './jsonShape';

const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
const PHONE_PATTERN = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g;
const TOKEN_PATTERN = /\b[A-Za-z0-9\-_]{20,}\b/g; // Long alphanumeric strings (likely tokens)

/**
 * Redact sensitive values from a string
 */
export function redactSensitiveValues(text: string): string {
  let redacted = text;

  // Redact emails
  redacted = redacted.replace(EMAIL_PATTERN, '[EMAIL_REDACTED]');

  // Redact phone numbers
  redacted = redacted.replace(PHONE_PATTERN, '[PHONE_REDACTED]');

  // Redact long tokens (but preserve structure)
  redacted = redacted.replace(TOKEN_PATTERN, (match) => {
    // Keep first 4 and last 4 chars, redact middle
    if (match.length > 20) {
      return match.substring(0, 4) + '...' + match.substring(match.length - 4);
    }
    return '[TOKEN_REDACTED]';
  });

  return redacted;
}

/**
 * Redact sensitive data from JSON object
 */
export function redactJson(obj: any): any {
  if (typeof obj === 'string') {
    return redactSensitiveValues(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(redactJson);
  }

  if (obj !== null && typeof obj === 'object') {
    const redacted: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      
      // Redact common sensitive keys
      if (
        lowerKey.includes('password') ||
        lowerKey.includes('token') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('key') ||
        lowerKey.includes('authorization') ||
        lowerKey.includes('cookie') ||
        lowerKey.includes('session')
      ) {
        redacted[key] = '[REDACTED]';
      } else {
        redacted[key] = redactJson(value);
      }
    }
    return redacted;
  }

  return obj;
}

/**
 * Redact network event for safe storage/reporting
 */
export function redactEvent(event: NetworkEvent): NetworkEvent {
  const redacted = { ...event };

  // Redact authorization headers (keep scheme + length)
  if (redacted.reqHeaders) {
    const authHeaders = ['authorization', 'x-auth-token', 'x-api-key', 'x-access-token'];
    for (const headerName of authHeaders) {
      if (redacted.reqHeaders[headerName]) {
        const value = redacted.reqHeaders[headerName];
        const scheme = value.split(' ')[0] || 'unknown';
        const length = value.length;
        redacted.reqHeaders[headerName] = `${scheme} [REDACTED_${length}_chars]`;
      }
    }
  }

  // Redact cookies (keep names only)
  if (redacted.reqCookies) {
    const redactedCookies: Record<string, string> = {};
    for (const [name, value] of Object.entries(redacted.reqCookies)) {
      redactedCookies[name] = '[REDACTED]';
    }
    redacted.reqCookies = redactedCookies;
  }

  // Redact request body if present
  if (redacted.reqBodyText) {
    const parsed = tryParseJson(redacted.reqBodyText);
    if (parsed) {
      redacted.reqBodyText = JSON.stringify(redactJson(parsed));
    } else {
      redacted.reqBodyText = redactSensitiveValues(redacted.reqBodyText);
    }
  }

  // Redact response body if present
  if (redacted.resBodyText) {
    const parsed = tryParseJson(redacted.resBodyText);
    if (parsed) {
      redacted.resBodyText = JSON.stringify(redactJson(parsed));
    } else {
      redacted.resBodyText = redactSensitiveValues(redacted.resBodyText);
    }
  }

  return redacted;
}
