/**
 * Event Bus - Flight Recorder Core
 * 
 * Centralized event system with:
 * - Structured JSON logs
 * - Correlation ID propagation
 * - Ring buffer (200 events)
 * - Event fingerprinting for noise reduction
 */

import { getCorrelationIds } from './correlationIds';

export type CorrelationIds = {
  runId: string | null;
  stepId: string | null;
  workerId: string | null;
};
import type { CodeLocation } from './codebaseAwareLogging';

export type EventLevel = 'log' | 'error' | 'warn' | 'info' | 'debug' | 'network' | 'auth' | 'health';

export type EventComponent = 'ui' | 'server' | 'ws' | 'auth' | 'network' | 'unknown';

export type StructuredEvent = {
  // Core fields
  id: string;
  timestamp: number;
  level: EventLevel;
  component: EventComponent;
  message: string;
  
  // Correlation IDs
  runId?: string;
  stepId?: string;
  requestId?: string;
  workerId?: string;
  traceId?: string;
  
  // Error details
  error?: {
    message: string;
    name: string;
    stack?: string;
    serverStack?: string; // Server-side stack if different
    cause?: any;
  };
  
  // Code locations
  locations?: CodeLocation[];
  
  // Network context (if applicable)
  network?: {
    method: string;
    url: string;
    normalizedEndpoint?: string;
    status?: number;
    statusText?: string;
    duration?: number;
    ttfb?: number; // Time to first byte
    requestSize?: number;
    responseSize?: number;
    error?: string; // Error message if request failed
    requestBody?: any; // Request body (sanitized in reports)
    responseBody?: any; // Response body (sanitized in reports)
    headers?: {
      authorization?: boolean;
      authorizationType?: 'Bearer' | 'Cookie' | 'Basic' | 'Other' | 'None';
      cookie?: boolean;
      contentType?: string;
    };
  };
  
  // Auth context (if applicable)
  auth?: {
    eventType: 'TOKEN_REFRESH_START' | 'TOKEN_REFRESH_SUCCESS' | 'TOKEN_REFRESH_FAIL' | 'TOKEN_EXPIRES_AT_UPDATED' | 'REQUEST_401' | 'REQUEST_RETRY_AFTER_REFRESH';
    workerId?: string;
    expiresAt?: number;
    refreshAttempted?: boolean;
    refreshSucceeded?: boolean;
  };
  
  // Additional context
  context?: Record<string, any>;
  
  // Fingerprinting for noise reduction
  fingerprint?: string; // Hash of message + stack + component
  
  // Grouping
  groupKey?: string; // For collapsing similar events
  repeatCount?: number; // How many times this event occurred
};

type EventListener = (event: StructuredEvent) => void;

class EventBus {
  private events: StructuredEvent[] = [];
  private maxEvents = 200; // Ring buffer size
  private listeners: Set<EventListener> = new Set();
  private eventGroups: Map<string, StructuredEvent[]> = new Map();
  
  /**
   * Emit a structured event
   */
  emit(event: Omit<StructuredEvent, 'id' | 'timestamp' | 'fingerprint' | 'groupKey'>): string {
    const fullEvent: StructuredEvent = {
      ...event,
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      fingerprint: this.computeFingerprint(event),
      groupKey: this.computeGroupKey(event),
      ...this.getCorrelationIds(),
    };
    
    // Add to ring buffer
    this.events.push(fullEvent);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }
    
    // Group similar events
    this.groupEvent(fullEvent);
    
    // Notify listeners (defer to avoid setState during render)
    queueMicrotask(() => {
      this.listeners.forEach(listener => {
        try {
          listener(fullEvent);
        } catch (error) {
          console.error('[EventBus] Listener error:', error);
        }
      });
    });
    
    return fullEvent.id;
  }
  
  /**
   * Get all events (optionally filtered)
   */
  getEvents(filters?: {
    runId?: string;
    stepId?: string;
    requestId?: string;
    workerId?: string;
    level?: EventLevel;
    component?: EventComponent;
    startTime?: number;
    endTime?: number;
  }): StructuredEvent[] {
    let filtered = [...this.events];
    
    if (filters) {
      if (filters.runId) {
        filtered = filtered.filter(e => e.runId === filters.runId);
      }
      if (filters.stepId) {
        filtered = filtered.filter(e => e.stepId === filters.stepId);
      }
      if (filters.requestId) {
        filtered = filtered.filter(e => e.requestId === filters.requestId);
      }
      if (filters.workerId) {
        filtered = filtered.filter(e => e.workerId === filters.workerId);
      }
      if (filters.level) {
        filtered = filtered.filter(e => e.level === filters.level);
      }
      if (filters.component) {
        filtered = filtered.filter(e => e.component === filters.component);
      }
      if (filters.startTime) {
        filtered = filtered.filter(e => e.timestamp >= filters.startTime);
      }
      if (filters.endTime) {
        filtered = filtered.filter(e => e.timestamp <= filters.endTime);
      }
    }
    
    return filtered;
  }
  
  /**
   * Get events for a specific run
   */
  getEventsForRun(runId: string): StructuredEvent[] {
    return this.getEvents({ runId });
  }
  
  /**
   * Get primary failure for a run
   */
  getPrimaryFailure(runId?: string): StructuredEvent | null {
    const events = runId ? this.getEventsForRun(runId) : this.events;
    const errors = events.filter(e => e.level === 'error' && e.error?.stack);
    
    if (errors.length === 0) return null;
    
    // First error with stack trace is primary
    return errors[0];
  }
  
  /**
   * Subscribe to events
   */
  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  
  /**
   * Clear all events
   */
  clear(): void {
    this.events = [];
    this.eventGroups.clear();
  }
  
  /**
   * Get grouped events (for collapsing)
   */
  getGroupedEvents(): Map<string, StructuredEvent[]> {
    return this.eventGroups;
  }
  
  /**
   * Compute event fingerprint for noise reduction
   */
  private computeFingerprint(event: Omit<StructuredEvent, 'id' | 'timestamp' | 'fingerprint' | 'groupKey'>): string {
    const key = `${event.level}:${event.component}:${event.message}:${event.error?.stack?.split('\n')[0] || ''}`;
    // Simple hash
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `fp_${Math.abs(hash)}`;
  }
  
  /**
   * Compute group key for collapsing similar events
   */
  private computeGroupKey(event: Omit<StructuredEvent, 'id' | 'timestamp' | 'fingerprint' | 'groupKey'>): string {
    return `${event.fingerprint || this.computeFingerprint(event)}:${event.runId || 'global'}`;
  }
  
  /**
   * Group event for collapsing
   */
  private groupEvent(event: StructuredEvent): void {
    if (!event.groupKey) return;
    
    if (!this.eventGroups.has(event.groupKey)) {
      this.eventGroups.set(event.groupKey, []);
    }
    
    const group = this.eventGroups.get(event.groupKey)!;
    group.push(event);
    
    // Keep only last 10 in group (for display)
    if (group.length > 10) {
      group.shift();
    }
  }
  
  /**
   * Get correlation IDs from context
   */
  private getCorrelationIds(): Partial<CorrelationIds> {
    return getCorrelationIds();
  }
}

export const eventBus = new EventBus();
