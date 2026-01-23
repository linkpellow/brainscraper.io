/**
 * Primary Failure Detection
 * 
 * Identifies the "first real failure" (root cause) in a run
 * and groups secondary effects under it.
 */

import type { StructuredEvent } from './eventBus';
import type { CapturedLog } from '../hooks/useConsoleCapture';

export type PrimaryFailure = {
  event: StructuredEvent | CapturedLog;
  secondaryEffects: Array<StructuredEvent | CapturedLog>;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
};

/**
 * Detect primary failure from events
 */
export function detectPrimaryFailure(
  events: Array<StructuredEvent | CapturedLog>,
  runId?: string
): PrimaryFailure | null {
  // Filter to errors only
  const errors = events.filter(e => 
    e.level === 'error' && 
    (runId ? (e as any).runId === runId : true)
  );
  
  if (errors.length === 0) return null;
  
  // Sort by timestamp
  errors.sort((a, b) => a.timestamp - b.timestamp);
  
  // Primary failure is the first error with a stack trace
  const primary = errors.find(e => {
    const hasStack = (e as any).error?.stack || (e as any).stack;
    return hasStack && hasStack.length > 0;
  }) || errors[0]; // Fallback to first error if none have stack
  
  // Secondary effects are all other errors
  const secondary = errors.filter(e => e.id !== primary.id);
  
  // Determine confidence
  let confidence: 'high' | 'medium' | 'low' = 'medium';
  let reason = 'First error in sequence';
  
  if ((primary as any).error?.stack || (primary as any).stack) {
    confidence = 'high';
    reason = 'First error with stack trace';
  } else if (primary.timestamp < errors[errors.length - 1].timestamp - 1000) {
    confidence = 'high';
    reason = 'First error occurred significantly before others';
  }
  
  return {
    event: primary,
    secondaryEffects: secondary,
    confidence,
    reason,
  };
}

/**
 * Compute error fingerprint for grouping
 */
export function computeErrorFingerprint(event: StructuredEvent | CapturedLog): string {
  const message = event.message || '';
  const stack = (event as any).error?.stack || (event as any).stack || '';
  const topStackFrame = stack.split('\n')[1] || '';
  const component = (event as any).component || 'unknown';
  
  const key = `${event.level}:${component}:${message}:${topStackFrame}`;
  
  // Simple hash
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  return `err_${Math.abs(hash)}`;
}

/**
 * Group events by fingerprint (for collapsing)
 */
export function groupEventsByFingerprint(
  events: Array<StructuredEvent | CapturedLog>
): Map<string, Array<StructuredEvent | CapturedLog>> {
  const groups = new Map<string, Array<StructuredEvent | CapturedLog>>();
  
  for (const event of events) {
    const fingerprint = computeErrorFingerprint(event);
    if (!groups.has(fingerprint)) {
      groups.set(fingerprint, []);
    }
    groups.get(fingerprint)!.push(event);
  }
  
  return groups;
}
