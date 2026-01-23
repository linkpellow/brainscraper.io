/**
 * Dependency Monitor
 * 
 * Monitors server dependencies for Auth Worker system:
 * - WebSocket signal stream
 * - Backend APIs
 * - Target website reachability
 */

export type DependencyStatus = 'operational' | 'degraded' | 'unavailable';

export type DependencyHealth = {
  name: string;
  status: DependencyStatus;
  lastCheck: number;
  lastSuccess?: number;
  consecutiveFailures: number;
  error?: string;
  details?: any;
};

export type SystemHealth = {
  signalStream: DependencyHealth;
  backendAPI: DependencyHealth;
  targetWebsite: DependencyHealth;
  overall: DependencyStatus;
  lastHeartbeat: number;
};

const HEALTH_CHECK_INTERVAL_MS = 30000; // 30 seconds
const BACKEND_PING_TIMEOUT_MS = 5000; // 5 seconds
const TARGET_PING_TIMEOUT_MS = 10000; // 10 seconds
const MAX_CONSECUTIVE_FAILURES = 2; // Mark unavailable after 2 failures

/**
 * Check WebSocket connection health
 */
export async function checkSignalStreamHealth(
  wsUrl: string | null,
  isConnected: boolean
): Promise<DependencyHealth> {
  const now = Date.now();
  
  if (!wsUrl) {
    return {
      name: 'Signal Stream',
      status: 'unavailable',
      lastCheck: now,
      consecutiveFailures: 1,
      error: 'WebSocket URL not configured',
    };
  }

  if (!isConnected) {
    return {
      name: 'Signal Stream',
      status: 'degraded',
      lastCheck: now,
      consecutiveFailures: 1,
      error: 'WebSocket connection lost',
    };
  }

  return {
    name: 'Signal Stream',
    status: 'operational',
    lastCheck: now,
    lastSuccess: now,
    consecutiveFailures: 0,
  };
}

/**
 * Check backend API health
 */
export async function checkBackendAPIHealth(): Promise<DependencyHealth> {
  const now = Date.now();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), BACKEND_PING_TIMEOUT_MS);
    
    const response = await fetch('/api/health', {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      return {
        name: 'Backend API',
        status: 'operational',
        lastCheck: now,
        lastSuccess: now,
        consecutiveFailures: 0,
        details: data,
      };
    } else {
      return {
        name: 'Backend API',
        status: 'degraded',
        lastCheck: now,
        consecutiveFailures: 1,
        error: `HTTP ${response.status}`,
      };
    }
  } catch (err: any) {
    const error = err.name === 'AbortError' 
      ? 'Request timeout'
      : err.message || 'Unknown error';
    
    return {
      name: 'Backend API',
      status: 'unavailable',
      lastCheck: now,
      consecutiveFailures: 1,
      error,
    };
  }
}

/**
 * Check target website reachability
 */
export async function checkTargetWebsiteHealth(
  targetUrl: string | null
): Promise<DependencyHealth> {
  const now = Date.now();
  
  if (!targetUrl) {
    return {
      name: 'Target Website',
      status: 'unavailable',
      lastCheck: now,
      consecutiveFailures: 1,
      error: 'Target URL not configured',
    };
  }

  try {
    // Extract domain from URL
    let domain: string;
    try {
      const url = new URL(targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`);
      domain = url.origin;
    } catch {
      domain = targetUrl;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TARGET_PING_TIMEOUT_MS);
    
    // Try to fetch the root page (HEAD request to minimize data transfer)
    // Use no-cors mode to avoid CORS issues - we just want to check connectivity
    const response = await fetch(domain, {
      method: 'HEAD',
      signal: controller.signal,
      mode: 'no-cors', // Avoid CORS issues, just check connectivity
      cache: 'no-store',
    });
    
    clearTimeout(timeoutId);
    
    // With no-cors, we can't read response status, but if no error, connection succeeded
    return {
      name: 'Target Website',
      status: 'operational',
      lastCheck: now,
      lastSuccess: now,
      consecutiveFailures: 0,
      details: { domain },
    };
  } catch (err: any) {
    const error = err.name === 'AbortError'
      ? 'Request timeout'
      : err.message || 'Unknown error';
    
    return {
      name: 'Target Website',
      status: 'degraded',
      lastCheck: now,
      consecutiveFailures: 1,
      error,
      details: { domain: targetUrl },
    };
  }
}

/**
 * Update dependency health with failure tracking
 */
export function updateDependencyHealth(
  current: DependencyHealth,
  newCheck: DependencyHealth
): DependencyHealth {
  const consecutiveFailures = newCheck.status === 'operational'
    ? 0
    : current.consecutiveFailures + 1;
  
  // Mark as unavailable after max consecutive failures
  let status = newCheck.status;
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES && status !== 'operational') {
    status = 'unavailable';
  }
  
  return {
    ...newCheck,
    consecutiveFailures,
    lastSuccess: newCheck.status === 'operational' 
      ? newCheck.lastCheck 
      : current.lastSuccess,
  };
}

/**
 * Calculate overall system health
 */
export function calculateOverallHealth(
  signalStream: DependencyHealth,
  backendAPI: DependencyHealth,
  targetWebsite: DependencyHealth
): DependencyStatus {
  // If any dependency is unavailable, overall is unavailable
  if (signalStream.status === 'unavailable' || 
      backendAPI.status === 'unavailable' || 
      targetWebsite.status === 'unavailable') {
    return 'unavailable';
  }
  
  // If any dependency is degraded, overall is degraded
  if (signalStream.status === 'degraded' || 
      backendAPI.status === 'degraded' || 
      targetWebsite.status === 'degraded') {
    return 'degraded';
  }
  
  return 'operational';
}

/**
 * Format time ago for display
 */
export function formatHealthTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  
  return new Date(timestamp).toLocaleDateString();
}
