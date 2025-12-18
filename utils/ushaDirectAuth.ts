/**
 * Direct USHA Authentication System
 * 
 * Implements direct authentication with USHA API without middleman.
 * Supports:
 * - Username/password authentication
 * - Client credentials flow
 * - Automatic token refresh
 * - Token caching with expiration handling
 */

interface UshaAuthConfig {
  username?: string;
  password?: string;
  clientId?: string;
  clientSecret?: string;
  baseUrl?: string;
}

interface UshaTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

interface CachedUshaToken {
  access_token: string;
  refresh_token?: string;
  expiresAt: number;
  fetchedAt: number;
}

// Default USHA API base URL
const USHA_API_BASE = 'https://api-business-agent.ushadvisors.com';
const USHA_AUTH_BASE = 'https://agent.ushadvisors.com';

// Common USHA authentication endpoints (will be discovered dynamically)
const COMMON_AUTH_ENDPOINTS = [
  // OAuth 2.0 / OpenID Connect
  `${USHA_AUTH_BASE}/connect/token`,
  `${USHA_AUTH_BASE}/api/token`,
  `${USHA_AUTH_BASE}/Account/Login`,
  `${USHA_AUTH_BASE}/api/account/login`,
  `${USHA_AUTH_BASE}/api/auth/login`,
  `${USHA_API_BASE}/connect/token`,
  `${USHA_API_BASE}/api/token`,
  `${USHA_API_BASE}/api/account/login`,
  `${USHA_API_BASE}/api/auth/login`,
  // Alternative patterns
  `${USHA_AUTH_BASE}/oauth/token`,
  `${USHA_AUTH_BASE}/auth/token`,
  `${USHA_API_BASE}/oauth/token`,
  `${USHA_API_BASE}/auth/token`
];

// In-memory token cache
let tokenCache: CachedUshaToken | null = null;

// Configuration from environment or provided
let authConfig: UshaAuthConfig = {
  username: process.env.USHA_USERNAME,
  password: process.env.USHA_PASSWORD,
  clientId: process.env.USHA_CLIENT_ID,
  clientSecret: process.env.USHA_CLIENT_SECRET,
  baseUrl: process.env.USHA_AUTH_BASE_URL || USHA_AUTH_BASE
};

/**
 * Decode JWT to extract expiration time
 */
function getTokenExpiration(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (payload.exp) {
      return payload.exp * 1000; // Convert to milliseconds
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Authenticate with username/password
 */
async function authenticateWithPassword(
  username: string,
  password: string
): Promise<UshaTokenResponse | null> {
  try {
    // Try multiple authentication formats
    const authAttempts = [
      // OAuth 2.0 Resource Owner Password Credentials
      {
        endpoint: `${USHA_AUTH_BASE}/connect/token`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'password',
          username: username,
          password: password,
          scope: 'api'
        }).toString()
      },
      // JSON format
      {
        endpoint: `${USHA_AUTH_BASE}/api/account/login`,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      },
      // Alternative JSON format
      {
        endpoint: `${USHA_AUTH_BASE}/api/auth/login`,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: username, password })
      },
      // API base endpoints
      {
        endpoint: `${USHA_API_BASE}/connect/token`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'password',
          username: username,
          password: password
        }).toString()
      }
    ];

    for (const attempt of authAttempts) {
      try {
        const response = await fetch(attempt.endpoint, {
          method: 'POST',
          headers: {
            ...attempt.headers,
            'Accept': 'application/json'
          },
          body: attempt.body
        });

        if (response.ok) {
          const data = await response.json();
          if (data.access_token || data.token) {
            console.log(`✅ [USHA_AUTH] Authenticated via ${attempt.endpoint}`);
            return {
              access_token: data.access_token || data.token,
              token_type: data.token_type || 'Bearer',
              expires_in: data.expires_in || 3600,
              refresh_token: data.refresh_token
            };
          }
        } else {
          // Log for debugging but continue trying
          const errorText = await response.text().catch(() => '');
          console.log(`⚠️ [USHA_AUTH] ${attempt.endpoint} returned ${response.status}`);
        }
      } catch (e) {
        // Try next endpoint
        continue;
      }
    }

    return null;
  } catch (error) {
    console.error('❌ [USHA_AUTH] Password authentication error:', error);
    return null;
  }
}

/**
 * Authenticate with client credentials (OAuth 2.0)
 */
async function authenticateWithClientCredentials(
  clientId: string,
  clientSecret: string
): Promise<UshaTokenResponse | null> {
  try {
    const tokenEndpoints = [
      `${authConfig.baseUrl}/connect/token`,
      `${authConfig.baseUrl}/api/token`,
      `${USHA_API_BASE}/connect/token`,
      `${USHA_API_BASE}/api/token`
    ];

    for (const endpoint of tokenEndpoints) {
      try {
        const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${credentials}`
          },
          body: new URLSearchParams({
            grant_type: 'client_credentials',
            scope: 'api'
          }).toString()
        });

        if (response.ok) {
          const data = await response.json();
          if (data.access_token) {
            return {
              access_token: data.access_token,
              token_type: data.token_type || 'Bearer',
              expires_in: data.expires_in || 3600,
              refresh_token: data.refresh_token
            };
          }
        }
      } catch (e) {
        continue;
      }
    }

    return null;
  } catch (error) {
    console.error('❌ [USHA_AUTH] Client credentials authentication error:', error);
    return null;
  }
}

/**
 * Refresh token using refresh_token
 */
async function refreshToken(refreshToken: string): Promise<UshaTokenResponse | null> {
  try {
    const refreshEndpoints = [
      `${USHA_AUTH_BASE}/connect/token`,
      `${USHA_AUTH_BASE}/api/token/refresh`,
      `${USHA_AUTH_BASE}/api/token`,
      `${USHA_API_BASE}/connect/token`,
      `${USHA_API_BASE}/api/token/refresh`,
      `${USHA_API_BASE}/api/token`
    ];

    for (const endpoint of refreshEndpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
          },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken
          }).toString()
        });

        if (response.ok) {
          const data = await response.json();
          if (data.access_token) {
            console.log(`✅ [USHA_AUTH] Token refreshed via ${endpoint}`);
            return {
              access_token: data.access_token,
              token_type: data.token_type || 'Bearer',
              expires_in: data.expires_in || 3600,
              refresh_token: data.refresh_token || refreshToken
            };
          }
        }
      } catch (e) {
        continue;
      }
    }

    return null;
  } catch (error) {
    console.error('❌ [USHA_AUTH] Token refresh error:', error);
    return null;
  }
}

/**
 * Get valid USHA token with automatic authentication and refresh
 * 
 * Priority:
 * 1. Cached token (if valid)
 * 2. Environment variable USHA_JWT_TOKEN
 * 3. Client credentials (if configured)
 * 4. Username/password (if configured)
 * 5. Refresh existing token (if available)
 */
export async function getUshaTokenDirect(
  providedToken?: string | null,
  forceRefresh: boolean = false
): Promise<string> {
  // Priority 1: Provided token
  if (providedToken && providedToken.trim()) {
    const token = providedToken.trim();
    if (token.split('.').length === 3) {
      console.log('🔑 [USHA_AUTH] Using provided token');
      return token;
    }
  }

  // Priority 2: Check cache
  if (!forceRefresh && tokenCache && tokenCache.expiresAt > Date.now()) {
    const remainingMinutes = Math.floor((tokenCache.expiresAt - Date.now()) / 60000);
    console.log(`🔑 [USHA_AUTH] Using cached token (expires in ${remainingMinutes}min)`);
    return tokenCache.access_token;
  }

  // Priority 3: Environment variable
  const envToken = process.env.USHA_JWT_TOKEN;
  if (envToken && envToken.trim()) {
    const token = envToken.trim();
    if (token.split('.').length === 3) {
      const expiration = getTokenExpiration(token);
      if (expiration && expiration > Date.now()) {
        console.log('🔑 [USHA_AUTH] Using token from environment variable');
        // Cache it (try to extract refresh_token from user data if available)
        const refreshToken = process.env.USHA_REFRESH_TOKEN;
        tokenCache = {
          access_token: token,
          refresh_token: refreshToken,
          expiresAt: expiration,
          fetchedAt: Date.now()
        };
        return token;
      } else {
        console.log('⚠️ [USHA_AUTH] Environment token expired, attempting refresh...');
        // Token expired, try to refresh if we have refresh_token
        const refreshToken = process.env.USHA_REFRESH_TOKEN;
        if (refreshToken) {
          const refreshed = await refreshToken(refreshToken);
          if (refreshed) {
            const expiration = getTokenExpiration(refreshed.access_token) || 
                            (Date.now() + (refreshed.expires_in * 1000));
            tokenCache = {
              access_token: refreshed.access_token,
              refresh_token: refreshed.refresh_token || refreshToken,
              expiresAt: expiration,
              fetchedAt: Date.now()
            };
            console.log('✅ [USHA_AUTH] Token refreshed from environment refresh_token');
            return refreshed.access_token;
          }
        }
      }
    }
  }

  // Priority 4: Try refresh token if available
  if (tokenCache?.refresh_token) {
    console.log('🔑 [USHA_AUTH] Attempting token refresh...');
    const refreshed = await refreshToken(tokenCache.refresh_token);
    if (refreshed) {
      const expiration = getTokenExpiration(refreshed.access_token) || 
                        (Date.now() + (refreshed.expires_in * 1000));
      tokenCache = {
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token || tokenCache.refresh_token,
        expiresAt: expiration,
        fetchedAt: Date.now()
      };
      console.log('✅ [USHA_AUTH] Token refreshed successfully');
      return refreshed.access_token;
    }
  }

  // Priority 5: Client credentials
  if (authConfig.clientId && authConfig.clientSecret) {
    console.log('🔑 [USHA_AUTH] Authenticating with client credentials...');
    const authResult = await authenticateWithClientCredentials(
      authConfig.clientId,
      authConfig.clientSecret
    );
    if (authResult) {
      const expiration = getTokenExpiration(authResult.access_token) || 
                        (Date.now() + (authResult.expires_in * 1000));
      tokenCache = {
        access_token: authResult.access_token,
        refresh_token: authResult.refresh_token,
        expiresAt: expiration,
        fetchedAt: Date.now()
      };
      console.log('✅ [USHA_AUTH] Authenticated with client credentials');
      return authResult.access_token;
    }
  }

  // Priority 6: Username/password
  if (authConfig.username && authConfig.password) {
    console.log('🔑 [USHA_AUTH] Authenticating with username/password...');
    const authResult = await authenticateWithPassword(
      authConfig.username,
      authConfig.password
    );
    if (authResult) {
      const expiration = getTokenExpiration(authResult.access_token) || 
                        (Date.now() + (authResult.expires_in * 1000));
      tokenCache = {
        access_token: authResult.access_token,
        refresh_token: authResult.refresh_token,
        expiresAt: expiration,
        fetchedAt: Date.now()
      };
      console.log('✅ [USHA_AUTH] Authenticated with username/password');
      return authResult.access_token;
    }
  }

  // All methods failed
  throw new Error(
    'Failed to obtain USHA token. ' +
    'Please configure USHA_USERNAME/USHA_PASSWORD or USHA_CLIENT_ID/USHA_CLIENT_SECRET, ' +
    'or set USHA_JWT_TOKEN environment variable.'
  );
}

/**
 * Configure authentication credentials
 */
export function configureUshaAuth(config: UshaAuthConfig): void {
  authConfig = { ...authConfig, ...config };
  console.log('🔧 [USHA_AUTH] Configuration updated');
}

/**
 * Clear token cache
 */
export function clearUshaTokenCache(): void {
  tokenCache = null;
  console.log('🔑 [USHA_AUTH] Token cache cleared');
}

/**
 * Get current token info (for debugging)
 */
export function getUshaTokenInfo(): {
  cached: boolean;
  expiresAt: number | null;
  expiresIn: number | null;
} {
  if (!tokenCache) {
    return { cached: false, expiresAt: null, expiresIn: null };
  }
  
  return {
    cached: true,
    expiresAt: tokenCache.expiresAt,
    expiresIn: Math.floor((tokenCache.expiresAt - Date.now()) / 1000)
  };
}
