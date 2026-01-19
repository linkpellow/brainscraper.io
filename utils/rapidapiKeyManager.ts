/**
 * RapidAPI Key Manager with Fallback Support
 * 
 * Manages multiple RapidAPI keys and automatically falls back to the next key
 * when a request fails (rate limits, errors, etc.)
 */

// Ensure Node.js types are available
declare const process: {
  env: {
    RAPIDAPI_KEY?: string;
    [key: string]: string | undefined;
  };
};

// Primary key (current production key)
const PRIMARY_KEY = '23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962';

// Fallback keys pool - dynamically loaded from environment variables
function getFallbackKeys(): string[] {
  const fallbackKeys: string[] = [];
  let index = 1;
  
  // Read fallback keys from environment variables (FALLBACK_1, FALLBACK_2, etc.)
  while (true) {
    const key = process.env[`RAPIDAPI_KEY_FALLBACK_${index}`];
    if (!key) break;
    fallbackKeys.push(key);
    index++;
  }
  
  // If no environment variables found, use hardcoded fallbacks as backup
  if (fallbackKeys.length === 0) {
    return [
      'ca25fc890cmshbde400744151111p196a39jsn3766335bdb2d',
      '22a0943c83msh01134e539f944dep1f94b0jsn344549892142',
      '153030ee5fmshff8f27c8dffad43p184730jsn66125ce1022f',
      '207dab623bmshd5489bad6877fd1p1b74b1jsn5c45ff592ddc',
      '7d1dc0f3a7mshab3d33d0c0b9e93p11e59ajsn8ee26f7b3cle',
      '1478e15d3amshaf4ed4f262c3f62p142992jsnfd93e036e4b9',
      '9b319b4093msh279e530fdecaa4fp159a9ajsn35fc4025c8ad',
      '9ff0771033mshdbf07158395d628p184a24jsnfd0e143f6320',
      '07615c41edmsh7b03d2971dc7546p1fc375jsn996094913f04',
      'a3754c7cacmsh711a6326ef6a312p1962a6jsna820058ef872',
      '325452db2emsh59a2cf36411dc00p14cbc8jsnc55f14187683',
      '45257c4c8amsh7d09cf0c53c412ap1174adjsnaa7cd32f70ff',
    ];
  }
  
  return fallbackKeys;
}

// Track failed keys to avoid immediate retries
const failedKeys = new Map<string, number>();
const FAILED_KEY_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes cooldown

/**
 * Get all available RapidAPI keys (primary + fallbacks)
 * Keys can be overridden via environment variable RAPIDAPI_KEY
 */
export function getAllRapidAPIKeys(): string[] {
  const fallbackKeys = getFallbackKeys();
  
  // Check for environment variable override
  const envKey = process.env.RAPIDAPI_KEY;
  
  if (envKey) {
    // If env key is set, use it as primary and include fallbacks
    return [envKey, ...fallbackKeys];
  }
  
  // Default: use primary key + fallbacks
  return [PRIMARY_KEY, ...fallbackKeys];
}

/**
 * Get the primary RapidAPI key
 */
export function getPrimaryRapidAPIKey(): string {
  return process.env.RAPIDAPI_KEY || PRIMARY_KEY;
}

/**
 * Check if a key is currently in cooldown (recently failed)
 */
function isKeyInCooldown(key: string): boolean {
  const failedAt = failedKeys.get(key);
  if (!failedAt) return false;
  
  const now = Date.now();
  const timeSinceFailure = now - failedAt;
  
  if (timeSinceFailure > FAILED_KEY_COOLDOWN_MS) {
    // Cooldown expired, remove from failed keys
    failedKeys.delete(key);
    return false;
  }
  
  return true;
}

/**
 * Mark a key as failed (rate limited, error, etc.)
 */
export function markKeyAsFailed(key: string): void {
  failedKeys.set(key, Date.now());
  console.log(`[RapidAPI Key Manager] Marked key ${key.substring(0, 10)}... as failed, will retry after cooldown`);
}

/**
 * Get available keys (excluding those in cooldown)
 */
export function getAvailableKeys(): string[] {
  const allKeys = getAllRapidAPIKeys();
  return allKeys.filter(key => !isKeyInCooldown(key));
}

/**
 * Make a RapidAPI request with automatic fallback
 * 
 * @param url - The full RapidAPI URL
 * @param host - The RapidAPI host (e.g., 'realtime-linkedin-sales-navigator-data.p.rapidapi.com')
 * @param options - Fetch options (method, body, headers, etc.)
 * @param retryOnStatus - HTTP status codes that should trigger fallback (default: [429, 401, 403, 500, 502, 503, 504])
 * @returns Promise with response data or error
 */
export async function fetchWithRapidAPIFallback(
  url: string,
  host: string,
  options: RequestInit = {},
  retryOnStatus: number[] = [429, 401, 403, 500, 502, 503, 504]
): Promise<{ data?: any; error?: string; usedKey?: string; statusCode?: number }> {
  const availableKeys = getAvailableKeys();
  
  if (availableKeys.length === 0) {
    return {
      error: 'All RapidAPI keys are currently in cooldown. Please wait before retrying.',
    };
  }
  
  let lastError: Error | null = null;
  let lastStatusCode: number | null = null;
  
  // Try each available key in order
  for (let i = 0; i < availableKeys.length; i++) {
    const key = availableKeys[i];
    const isLastKey = i === availableKeys.length - 1;
    
    try {
      console.log(`[RapidAPI Key Manager] Attempting request with key ${i + 1}/${availableKeys.length} (${key.substring(0, 10)}...)`);
      
      const response = await fetch(url, {
        ...options,
        headers: {
          'x-rapidapi-key': key,
          'x-rapidapi-host': host,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
      
      lastStatusCode = response.status;
      
      // Check if we should retry with next key
      if (retryOnStatus.includes(response.status)) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.log(`[RapidAPI Key Manager] Key ${key.substring(0, 10)}... failed with status ${response.status}: ${errorText.substring(0, 100)}`);
        
        // Mark key as failed if it's a rate limit or auth error
        if ([429, 401, 403].includes(response.status)) {
          markKeyAsFailed(key);
        }
        
        // Try next key if available
        if (!isLastKey) {
          console.log(`[RapidAPI Key Manager] Falling back to next key...`);
          continue;
        }
        
        // Last key failed, return error
        return {
          error: `RapidAPI error: HTTP ${response.status} - ${errorText}`,
          usedKey: key,
          statusCode: response.status,
        };
      }
      
      // Success! Parse and return response
      if (!response.ok) {
        // Non-retryable error, return immediately
        const errorText = await response.text().catch(() => 'Unknown error');
        return {
          error: `RapidAPI error: HTTP ${response.status} - ${errorText}`,
          usedKey: key,
          statusCode: response.status,
        };
      }
      
      // Parse response
      const result = await response.text();
      let data: any;
      
      try {
        data = JSON.parse(result);
      } catch {
        data = { raw: result };
      }
      
      console.log(`[RapidAPI Key Manager] Request successful with key ${key.substring(0, 10)}...`);
      
      return {
        data,
        usedKey: key,
        statusCode: response.status,
      };
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.log(`[RapidAPI Key Manager] Key ${key.substring(0, 10)}... threw error: ${lastError.message}`);
      
      // Network errors - try next key if available
      if (!isLastKey) {
        console.log(`[RapidAPI Key Manager] Network error, falling back to next key...`);
        continue;
      }
      
      // Last key failed with network error
      return {
        error: `Network error: ${lastError.message}`,
        usedKey: key,
      };
    }
  }
  
  // All keys exhausted
  return {
    error: lastError
      ? `All keys failed. Last error: ${lastError.message}`
      : `All keys failed with status ${lastStatusCode}`,
    statusCode: lastStatusCode || undefined,
  };
}

/**
 * Reset failed keys (useful for testing or manual recovery)
 */
export function resetFailedKeys(): void {
  failedKeys.clear();
  console.log('[RapidAPI Key Manager] Reset all failed keys');
}

/**
 * Get statistics about key usage
 */
export function getKeyStats(): {
  totalKeys: number;
  availableKeys: number;
  failedKeys: number;
  failedKeyDetails: Array<{ key: string; failedAt: number; cooldownUntil: number }>;
} {
  const allKeys = getAllRapidAPIKeys();
  const available = getAvailableKeys();
  const failed = allKeys.filter(key => isKeyInCooldown(key));
  
  const failedDetails = Array.from(failedKeys.entries()).map(([key, failedAt]) => ({
    key: key.substring(0, 10) + '...',
    failedAt,
    cooldownUntil: failedAt + FAILED_KEY_COOLDOWN_MS,
  }));
  
  return {
    totalKeys: allKeys.length,
    availableKeys: available.length,
    failedKeys: failed.length,
    failedKeyDetails: failedDetails,
  };
}
