/**
 * Auth Worker Health Monitoring Hook
 * 
 * Continuously monitors Auth Worker health and reports status
 */

import { useState, useEffect, useCallback, useRef } from 'react';
// RawNetworkEvent type (minimal definition for health monitoring)
type RawNetworkEvent = {
  url?: string;
  method?: string;
  status?: number;
  timestamp?: number;
};
import type { LockedStep } from '../utils/authWorkerPersistence';
import { 
  checkAuthWorkerHealth, 
  checkAllSessionsHealth,
  type HealthStatus,
  type HealthCheckResult,
  formatHealthTimeAgo 
} from '../utils/authWorkerHealthMonitor';
import { listAllSessions } from '../utils/authWorkerPersistence';

const HEALTH_CHECK_INTERVAL_MS = 30000; // 30 seconds

export type AuthWorkerHealthState = {
  status: HealthStatus;
  lastChecked: number;
  reason?: string;
  details: HealthCheckResult['details'];
  sessionId?: string;
  targetDomain?: string;
};

export function useAuthWorkerHealth(
  events: RawNetworkEvent[],
  lockedSteps: LockedStep[],
  enabled: boolean = true
) {
  const [health, setHealth] = useState<AuthWorkerHealthState | null>(null);
  const [allSessionsHealth, setAllSessionsHealth] = useState<Map<string, HealthCheckResult>>(new Map());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastCheckRef = useRef<number>(0);

  const performHealthCheck = useCallback(() => {
    if (!enabled) return;

    try {
      const sessions = listAllSessions();
      
      if (sessions.length === 0) {
        setHealth(null);
        setAllSessionsHealth(new Map());
        return;
      }

      // Check health for all sessions
      const healthMap = checkAllSessionsHealth(events, lockedSteps);
      setAllSessionsHealth(healthMap);

      // Get most recent session for primary health status
      const mostRecent = sessions.sort((a, b) => b.stabilizedAt - a.stabilizedAt)[0];
      const primaryHealth = healthMap.get(mostRecent.sessionId);

      if (primaryHealth) {
        setHealth({
          status: primaryHealth.status,
          lastChecked: primaryHealth.lastChecked,
          reason: primaryHealth.reason,
          details: primaryHealth.details,
          sessionId: mostRecent.sessionId,
          targetDomain: mostRecent.targetDomain,
        });

        // Log health status changes
        const now = Date.now();
        if (now - lastCheckRef.current > HEALTH_CHECK_INTERVAL_MS) {
          if (primaryHealth.status === 'healthy') {
            console.log(`[AuthWorkerHealth] ✅ Healthy - ${primaryHealth.reason || 'All checks passed'}`);
          } else if (primaryHealth.status === 'unhealthy') {
            console.error(`[AuthWorkerHealth] ❌ Unhealthy - ${primaryHealth.reason || 'Health check failed'}`);
          } else {
            console.warn(`[AuthWorkerHealth] ⚠️ ${primaryHealth.status} - ${primaryHealth.reason || 'Status unknown'}`);
          }
          lastCheckRef.current = now;
        }
      } else {
        setHealth(null);
      }
    } catch (err) {
      console.error('[AuthWorkerHealth] Health check error:', err);
    }
  }, [events, lockedSteps, enabled]);

  // Start monitoring
  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Perform initial check
    performHealthCheck();

    // Set up polling interval
    intervalRef.current = setInterval(() => {
      performHealthCheck();
    }, HEALTH_CHECK_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, performHealthCheck]);

  // Manual refresh function
  const refreshHealth = useCallback(() => {
    performHealthCheck();
  }, [performHealthCheck]);

  return {
    health,
    allSessionsHealth,
    refreshHealth,
    formatTimeAgo: formatHealthTimeAgo,
  };
}
