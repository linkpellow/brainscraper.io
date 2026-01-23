/**
 * Health Monitoring Hook
 * 
 * Monitors system health:
 * - WS bridge status
 * - Auth worker status
 * - Event rate
 * - Queue depth
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { eventBus, type StructuredEvent } from '../utils/eventBus';

export type HealthStatus = {
  wsBridge: {
    connected: boolean;
    lastMessageTime?: number;
    status: 'connected' | 'disconnected' | 'unknown';
  };
  authWorker: {
    running: boolean;
    lastRefresh?: number;
    nextExpiry?: number;
    status: 'running' | 'failed' | 'unknown';
  };
  eventRate: {
    eventsPerSecond: number;
    queueDepth: number;
  };
};

export function useHealthMonitoring(enabled: boolean = true) {
  const [health, setHealth] = useState<HealthStatus>({
    wsBridge: { connected: false, status: 'unknown' },
    authWorker: { running: false, status: 'unknown' },
    eventRate: { eventsPerSecond: 0, queueDepth: 0 },
  });
  
  const eventCountRef = useRef<number>(0);
  const lastEventRateCheckRef = useRef<number>(Date.now());
  const eventTimestampsRef = useRef<number[]>([]);
  
  // Track event rate
  useEffect(() => {
    if (!enabled) return;
    
    const unsubscribe = eventBus.subscribe((event: StructuredEvent) => {
      eventCountRef.current++;
      eventTimestampsRef.current.push(Date.now());
      
      // Keep only last 10 seconds of timestamps
      const cutoff = Date.now() - 10000;
      eventTimestampsRef.current = eventTimestampsRef.current.filter(ts => ts > cutoff);
    });
    
    return unsubscribe;
  }, [enabled]);
  
  // Calculate event rate
  const calculateEventRate = useCallback(() => {
    const now = Date.now();
    const window = 10000; // 10 seconds
    const cutoff = now - window;
    
    const recentEvents = eventTimestampsRef.current.filter(ts => ts > cutoff);
    const eventsPerSecond = recentEvents.length / (window / 1000);
    
    return {
      eventsPerSecond: Math.round(eventsPerSecond * 10) / 10,
      queueDepth: eventBus.getEvents().length,
    };
  }, []);
  
  // Poll health status
  useEffect(() => {
    if (!enabled) return;
    
    const checkHealth = async () => {
      try {
        // Check WS bridge (would need actual WS connection check)
        // For now, infer from events
        const recentEvents = eventBus.getEvents({ startTime: Date.now() - 5000 });
        const hasRecentEvents = recentEvents.length > 0;
        
        // Check auth worker (from token lifecycle tracker)
        const { tokenLifecycleTracker } = await import('../utils/tokenLifecycleTracker');
        const incidents = tokenLifecycleTracker.getAllIncidents();
        const recentIncidents = incidents.filter(i => 
          i.timeline[0] && (Date.now() - i.timeline[0].timestamp) < 60000
        );
        const authWorkerRunning = recentIncidents.length > 0 || incidents.length > 0;
        
        // Get last refresh from incidents
        let lastRefresh: number | undefined;
        let nextExpiry: number | undefined;
        if (incidents.length > 0) {
          const latest = incidents.sort((a, b) => 
            (b.timeline[0]?.timestamp || 0) - (a.timeline[0]?.timestamp || 0)
          )[0];
          const refreshEvent = latest.timeline.find(t => t.type === 'REFRESH_SUCCESS');
          if (refreshEvent) {
            lastRefresh = refreshEvent.timestamp;
            // Estimate next expiry (1 hour default)
            nextExpiry = lastRefresh + (3600 * 1000);
          }
        }
        
        const eventRate = calculateEventRate();
        
        setHealth({
          wsBridge: {
            connected: hasRecentEvents,
            lastMessageTime: recentEvents[0]?.timestamp,
            status: hasRecentEvents ? 'connected' : 'disconnected',
          },
          authWorker: {
            running: authWorkerRunning,
            lastRefresh,
            nextExpiry,
            status: authWorkerRunning ? 'running' : 'unknown',
          },
          eventRate,
        });
      } catch (error) {
        console.error('[HealthMonitoring] Error checking health:', error);
      }
    };
    
    // Initial check
    checkHealth();
    
    // Poll every 2 seconds
    const interval = setInterval(checkHealth, 2000);
    
    return () => clearInterval(interval);
  }, [enabled, calculateEventRate]);
  
  return health;
}
