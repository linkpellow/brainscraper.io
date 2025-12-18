/**
 * AWS Cognito Authentication for USHA/Tampa API
 * 
 * Handles authentication with AWS Cognito to obtain tokens for optic-prod-api.leadarena.com
 */

interface CognitoAuthConfig {
  username?: string;
  password?: string;
  userPoolId?: string;
  clientId?: string;
  region?: string;
}

interface CognitoTokenResponse {
  AccessToken?: string;
  IdToken: string;
  RefreshToken?: string;
  TokenType?: string;
  ExpiresIn?: number;
}

interface CachedCognitoToken {
  idToken: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt: number;
  fetchedAt: number;
}

// Cognito configuration from environment or defaults
const COGNITO_CONFIG = {
  userPoolId: process.env.COGNITO_USER_POOL_ID || 'us-east-1_SWmFzvnku',
  clientId: process.env.COGNITO_CLIENT_ID || '5dromsrnopienmqa83ba4n927h',
  region: process.env.COGNITO_REGION || 'us-east-1'
};

const COGNITO_ENDPOINT = `https://cognito-idp.${COGNITO_CONFIG.region}.amazonaws.com/`;

// In-memory token cache
let cognitoTokenCache: CachedCognitoToken | null = null;

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
 * Authenticate with Cognito using username/password
 * Uses AWS Cognito InitiateAuth API
 */
export async function authenticateWithCognito(
  username: string,
  password: string
): Promise<CognitoTokenResponse | null> {
  try {
    // AWS Cognito InitiateAuth request
    const authParams = {
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: COGNITO_CONFIG.clientId,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password
      }
    };

    const response = await fetch(COGNITO_ENDPOINT, {
      method: 'POST',
      headers: {
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
        'Content-Type': 'application/x-amz-json-1.1'
      },
      body: JSON.stringify(authParams)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [COGNITO_AUTH] Authentication failed: ${response.status}`, errorText);
      return null;
    }

    const data = await response.json();
    
    if (data.AuthenticationResult) {
      console.log('✅ [COGNITO_AUTH] Authenticated successfully');
      return {
        AccessToken: data.AuthenticationResult.AccessToken,
        IdToken: data.AuthenticationResult.IdToken,
        RefreshToken: data.AuthenticationResult.RefreshToken,
        TokenType: data.AuthenticationResult.TokenType,
        ExpiresIn: data.AuthenticationResult.ExpiresIn
      };
    }

    // Handle challenge response (MFA, new password required, etc.)
    if (data.ChallengeName) {
      console.warn(`⚠️ [COGNITO_AUTH] Challenge required: ${data.ChallengeName}`);
      // For now, we'll need to handle challenges manually
      // Common challenges: NEW_PASSWORD_REQUIRED, MFA_SETUP, SOFTWARE_TOKEN_MFA
      return null;
    }

    return null;
  } catch (error) {
    console.error('❌ [COGNITO_AUTH] Authentication error:', error);
    return null;
  }
}

/**
 * Refresh Cognito token using refresh token
 */
export async function refreshCognitoToken(
  refreshToken: string
): Promise<CognitoTokenResponse | null> {
  try {
    const authParams = {
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: COGNITO_CONFIG.clientId,
      AuthParameters: {
        REFRESH_TOKEN: refreshToken
      }
    };

    const response = await fetch(COGNITO_ENDPOINT, {
      method: 'POST',
      headers: {
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
        'Content-Type': 'application/x-amz-json-1.1'
      },
      body: JSON.stringify(authParams)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [COGNITO_AUTH] Token refresh failed: ${response.status}`, errorText);
      return null;
    }

    const data = await response.json();
    
    if (data.AuthenticationResult) {
      console.log('✅ [COGNITO_AUTH] Token refreshed successfully');
      return {
        AccessToken: data.AuthenticationResult.AccessToken,
        IdToken: data.AuthenticationResult.IdToken,
        RefreshToken: refreshToken, // Refresh token doesn't change
        TokenType: data.AuthenticationResult.TokenType,
        ExpiresIn: data.AuthenticationResult.ExpiresIn
      };
    }

    return null;
  } catch (error) {
    console.error('❌ [COGNITO_AUTH] Token refresh error:', error);
    return null;
  }
}

/**
 * Get valid Cognito ID token (used for API authentication)
 * 
 * Priority:
 * 1. Cached token (if valid)
 * 2. Environment variable COGNITO_ID_TOKEN
 * 3. Refresh token (if available)
 * 4. Username/password authentication
 */
export async function getCognitoIdToken(
  providedToken?: string | null,
  forceRefresh: boolean = false
): Promise<string> {
  // Priority 1: Provided token
  if (providedToken && providedToken.trim()) {
    const token = providedToken.trim();
    if (token.split('.').length === 3) {
      console.log('🔑 [COGNITO_AUTH] Using provided token');
      return token;
    }
  }

  // Priority 2: Check cache
  if (!forceRefresh && cognitoTokenCache && cognitoTokenCache.expiresAt > Date.now()) {
    const remainingMinutes = Math.floor((cognitoTokenCache.expiresAt - Date.now()) / 60000);
    console.log(`🔑 [COGNITO_AUTH] Using cached token (expires in ${remainingMinutes}min)`);
    return cognitoTokenCache.idToken;
  }

  // Priority 3: Environment variable
  const envToken = process.env.COGNITO_ID_TOKEN;
  if (envToken && envToken.trim()) {
    const token = envToken.trim();
    const expiration = getTokenExpiration(token);
    if (expiration && expiration > Date.now()) {
      console.log('🔑 [COGNITO_AUTH] Using environment token');
      // Cache it
      cognitoTokenCache = {
        idToken: token,
        expiresAt: expiration,
        fetchedAt: Date.now()
      };
      return token;
    } else if (expiration) {
      console.log('⚠️ [COGNITO_AUTH] Environment token expired, refreshing...');
    }
  }

  // Priority 4: Refresh token
  const refreshToken = process.env.COGNITO_REFRESH_TOKEN || cognitoTokenCache?.refreshToken;
  if (refreshToken) {
    console.log('🔄 [COGNITO_AUTH] Refreshing token...');
    const refreshResult = await refreshCognitoToken(refreshToken);
    if (refreshResult && refreshResult.IdToken) {
      const expiration = getTokenExpiration(refreshResult.IdToken) || 
                        (Date.now() + ((refreshResult.ExpiresIn || 3600) * 1000));
      cognitoTokenCache = {
        idToken: refreshResult.IdToken,
        accessToken: refreshResult.AccessToken,
        refreshToken: refreshResult.RefreshToken || refreshToken,
        expiresAt: expiration,
        fetchedAt: Date.now()
      };
      console.log('✅ [COGNITO_AUTH] Token refreshed');
      return refreshResult.IdToken;
    }
  }

  // Priority 5: Username/password
  const username = process.env.COGNITO_USERNAME || process.env.USHA_USERNAME;
  const password = process.env.COGNITO_PASSWORD || process.env.USHA_PASSWORD;
  
  if (username && password) {
    console.log('🔑 [COGNITO_AUTH] Authenticating with username/password...');
    const authResult = await authenticateWithCognito(username, password);
    if (authResult && authResult.IdToken) {
      const expiration = getTokenExpiration(authResult.IdToken) || 
                        (Date.now() + ((authResult.ExpiresIn || 3600) * 1000));
      cognitoTokenCache = {
        idToken: authResult.IdToken,
        accessToken: authResult.AccessToken,
        refreshToken: authResult.RefreshToken,
        expiresAt: expiration,
        fetchedAt: Date.now()
      };
      console.log('✅ [COGNITO_AUTH] Authenticated with username/password');
      return authResult.IdToken;
    }
  }

  // All methods failed
  throw new Error(
    'Failed to obtain Cognito token. ' +
    'Please configure COGNITO_USERNAME/COGNITO_PASSWORD or COGNITO_REFRESH_TOKEN, ' +
    'or set COGNITO_ID_TOKEN environment variable.'
  );
}

/**
 * Clear Cognito token cache
 */
export function clearCognitoTokenCache(): void {
  cognitoTokenCache = null;
  console.log('🗑️ [COGNITO_AUTH] Token cache cleared');
}

/**
 * Get Cognito token info
 */
export function getCognitoTokenInfo(): {
  cached: boolean;
  expiresAt?: number;
  expiresIn?: number;
} | null {
  if (!cognitoTokenCache) return null;
  
  return {
    cached: true,
    expiresAt: cognitoTokenCache.expiresAt,
    expiresIn: Math.max(0, Math.floor((cognitoTokenCache.expiresAt - Date.now()) / 1000))
  };
}
