/**
 * Exchange Cognito ID Token for USHA JWT Token
 * 
 * This function takes a Cognito ID token and exchanges it for a USHA JWT token
 * that can be used with the USHA DNC API.
 */

const USHA_AUTH_BASE = 'https://agent.ushadvisors.com';
const USHA_API_BASE = 'https://api-business-agent.ushadvisors.com';

/**
 * Exchange Cognito ID token for USHA JWT token
 * 
 * Tries multiple potential endpoints that might accept Cognito tokens
 * and return USHA JWT tokens.
 */
export async function exchangeCognitoForUshaJwt(cognitoIdToken: string): Promise<string | null> {
  const exchangeEndpoints = [
    // Common token exchange patterns
    `${USHA_AUTH_BASE}/api/account/login`,
    `${USHA_AUTH_BASE}/api/auth/login`,
    `${USHA_AUTH_BASE}/api/token`,
    `${USHA_AUTH_BASE}/connect/token`,
    `${USHA_AUTH_BASE}/api/auth/exchange`,
    `${USHA_AUTH_BASE}/api/auth/token`,
    `${USHA_API_BASE}/api/account/login`,
    `${USHA_API_BASE}/api/auth/login`,
    `${USHA_API_BASE}/api/token`,
  ];

  for (const endpoint of exchangeEndpoints) {
    try {
      // Try with Cognito token in Authorization header
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cognitoIdToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.token || data.access_token || data.jwt_token) {
          const token = data.token || data.access_token || data.jwt_token;
          console.log(`✅ [TOKEN_EXCHANGE] Successfully exchanged Cognito token for USHA JWT via ${endpoint}`);
          return token;
        }
      }

      // Try with Cognito token in body
      const bodyResponse = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          cognitoToken: cognitoIdToken,
          idToken: cognitoIdToken,
          token: cognitoIdToken,
        }),
      });

      if (bodyResponse.ok) {
        const data = await bodyResponse.json();
        if (data.token || data.access_token || data.jwt_token) {
          const token = data.token || data.access_token || data.jwt_token;
          console.log(`✅ [TOKEN_EXCHANGE] Successfully exchanged Cognito token for USHA JWT via ${endpoint} (body)`);
          return token;
        }
      }
    } catch (error) {
      // Try next endpoint
      continue;
    }
  }

  console.warn('⚠️ [TOKEN_EXCHANGE] Could not find endpoint to exchange Cognito token for USHA JWT');
  return null;
}
