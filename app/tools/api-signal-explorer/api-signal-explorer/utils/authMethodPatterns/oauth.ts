/**
 * OAuth 2.0 / OIDC Detection Patterns
 */

import type { RawNetworkEvent } from '@/src/tools/api-signal-explorer/neuromap';
import type { AuthMethodPatterns } from '../../types';

export function oauthPatterns(): AuthMethodPatterns {
  return {
    authDiscovery: (e) => {
      const pathLower = (e.path || '').toLowerCase();
      const urlLower = (e.url || '').toLowerCase();
      const bodyLower = (e.reqBodyText || '').toLowerCase();
      
      // OAuth discovery endpoints
      if (pathLower.includes('/.well-known/openid-configuration') ||
          pathLower.includes('/oauth2') ||
          pathLower.includes('/authorize') ||
          pathLower.includes('/token')) {
        return true;
      }
      
      // OAuth flow indicators
      if (urlLower.includes('response_type=') ||
          urlLower.includes('grant_type=') ||
          urlLower.includes('code=') ||
          urlLower.includes('state=') ||
          bodyLower.includes('grant_type') ||
          bodyLower.includes('code_verifier') ||
          bodyLower.includes('code_challenge')) {
        return true;
      }
      
      return false;
    },
    extractTokens: (e) => {
      const resBodyLower = (e.resBodyText || '').toLowerCase();
      const headerKeys = Object.keys(e.reqHeaders || {}).map(k => k.toLowerCase());
      
      // OAuth token responses
      if (resBodyLower.includes('access_token') ||
          resBodyLower.includes('refresh_token') ||
          resBodyLower.includes('id_token') ||
          resBodyLower.includes('"token"') ||
          resBodyLower.includes('"accessToken"')) {
        return true;
      }
      
      // Bearer token in Authorization header
      const authHeader = e.reqHeaders?.['Authorization'] || e.reqHeaders?.['authorization'] || '';
      if (authHeader.startsWith('Bearer ')) {
        return true;
      }
      
      return false;
    },
    permanentCreds: (e) => {
      const headerKeys = Object.keys(e.reqHeaders || {}).map(k => k.toLowerCase());
      const bodyLower = (e.reqBodyText || '').toLowerCase();
      
      // Client credentials
      if (headerKeys.some(k => k.includes('client-id') || k.includes('client_id')) ||
          bodyLower.includes('client_id') ||
          bodyLower.includes('client_secret')) {
        return true;
      }
      
      return false;
    },
    guidance: {
      authDiscovery: '**OAuth 2.0 Detection** 🔐\n\nI\'m looking for OAuth/OIDC endpoints:\n\n**What to look for:**\n- `/oauth2/authorize` or `/authorize` endpoints\n- `/token` endpoint (token exchange)\n- `/.well-known/openid-configuration` (OIDC discovery)\n- URLs with `response_type=code` or `grant_type=authorization_code`\n\n**Try this:**\n1. Navigate to the login page\n2. Click "Sign in with Google/Microsoft/etc." if available\n3. Complete the OAuth flow\n4. I\'ll detect the authorization and token endpoints automatically',
      extractTokens: '**OAuth Token Extraction** 🔑\n\nI\'m looking for OAuth tokens:\n\n**What to look for:**\n- `access_token` in response body (after token exchange)\n- `refresh_token` in response body\n- `id_token` (if OIDC)\n- `Authorization: Bearer <token>` header in subsequent requests\n\n**Try this:**\n- Complete the OAuth login flow\n- Check the token endpoint response for `access_token` and `refresh_token`\n- I\'ll automatically detect tokens in responses and headers',
      tokenLifecycle: '**OAuth Token Lifecycle** ⏱️\n\nOAuth tokens typically:\n- Access tokens expire (check `expires_in` in token response)\n- Refresh tokens can be used to get new access tokens\n- Token refresh happens via `/token` endpoint with `grant_type=refresh_token`\n\n**Try this:**\n- Wait for token expiration or refresh the page\n- I\'ll detect the refresh token flow automatically',
      permanentCreds: '**OAuth Client Credentials** 🔐\n\nSome OAuth flows use client credentials:\n- `client_id` and `client_secret` for server-to-server flows\n- Client credentials grant type\n\n**Note:** Client credentials are permanent and don\'t expire like tokens',
    },
  };
}
