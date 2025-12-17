/**
 * API Toggle Middleware
 * 
 * Wraps callAPI() with settings-based controls
 * Non-breaking: Returns null if API disabled, pipeline continues
 */

import { loadSettings } from './settingsConfig';
import { mapAPINameToKey, API_REGISTRY } from './apiRegistry';

// Cache settings to avoid repeated file reads
let settingsCache: ReturnType<typeof loadSettings> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5000; // 5 seconds

/**
 * Get cached settings
 */
function getCachedSettings() {
  const now = Date.now();
  if (!settingsCache || (now - cacheTimestamp) > CACHE_TTL) {
    settingsCache = loadSettings();
    cacheTimestamp = now;
  }
  return settingsCache;
}

/**
 * Apply rate throttling based on settings
 */
async function applyRateThrottle(rateThrottle: 'safe' | 'normal' | 'aggressive'): Promise<void> {
  const delays = {
    safe: 3000,    // 3 seconds
    normal: 2000, // 2 seconds
    aggressive: 1000, // 1 second
  };

  const delay = delays[rateThrottle] || delays.normal;
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Wraps callAPI with settings-based controls
 * 
 * @param url - API endpoint URL
 * @param options - Fetch options
 * @param apiName - Human-readable API name (e.g., "Skip-tracing", "Telnyx")
 * @param callAPI - The original callAPI function to call if API is enabled
 * @returns API response or null if disabled
 */
export async function callAPIWithConfig(
  url: string,
  options: RequestInit,
  apiName: string,
  callAPI: (url: string, options: RequestInit, apiName: string) => Promise<{ data?: any; error?: string }>
): Promise<{ data?: any; error?: string }> {
  try {
    const settings = getCachedSettings();
    
    // Map API name to registry key
    const apiKey = mapAPINameToKey(apiName);
    const metadata = API_REGISTRY[apiKey];
    
    // If API not in registry, proceed normally (backward compatible)
    if (!metadata) {
      console.log(`[API_TOGGLE] ${apiName} not in registry, proceeding normally`);
      return await callAPI(url, options, apiName);
    }

    // Get toggle config
    const apiConfig = settings.apiToggles[apiKey];
    
    // Check if API is enabled
    // Default: enabled (if not in toggles, assume enabled for backward compatibility)
    const enabled = apiConfig ? apiConfig.enabled : (metadata.locked ? true : true);
    
    if (!enabled) {
      console.log(`[API_TOGGLE] ${apiName} is disabled, skipping`);
      return { data: null }; // Non-breaking: return null, not error
    }

    // Check dependencies
    if (apiConfig?.dependencies && apiConfig.dependencies.length > 0) {
      for (const dep of apiConfig.dependencies) {
        const depConfig = settings.apiToggles[dep];
        const depMetadata = API_REGISTRY[dep];
        
        // Check if dependency is enabled
        const depEnabled = depConfig ? depConfig.enabled : (depMetadata?.locked ? true : true);
        
        if (!depEnabled) {
          console.log(`[API_TOGGLE] ${apiName} disabled because dependency ${dep} is off`);
          return { data: null };
        }
      }
    }

    // Apply rate throttling
    if (settings.rateThrottle) {
      await applyRateThrottle(settings.rateThrottle);
    }

    // Proceed with normal API call
    return await callAPI(url, options, apiName);
  } catch (error) {
    // If settings loading fails, proceed normally (backward compatible)
    console.warn(`[API_TOGGLE] Failed to load settings, proceeding normally:`, error);
    return await callAPI(url, options, apiName);
  }
}

/**
 * Invalidate settings cache (call after settings are updated)
 */
export function invalidateAPIConfigCache(): void {
  settingsCache = null;
  cacheTimestamp = 0;
}

