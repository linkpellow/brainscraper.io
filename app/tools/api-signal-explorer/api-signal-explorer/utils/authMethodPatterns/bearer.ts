/**
 * Bearer Token Detection Patterns
 */

import type { RawNetworkEvent } from '@/src/tools/api-signal-explorer/neuromap';
import type { AuthMethodPatterns } from '../../types';

export function bearerPatterns(): AuthMethodPatterns {
  return {
    authDiscovery: (e) => {
      const pathLower = (e.path || '').toLowerCase();
      const bodyLower = (e.reqBodyText || '').toLowerCase();
      const headerKeys = Object.keys(e.reqHeaders || {}).map(k => k.toLowerCase());
      
      // Token endpoints
      if (pathLower.includes('/token') ||
          pathLower.includes('/auth') ||
          pathLower.includes('/login')) {
        return true;
      }
      
      // Bearer token in requests
      const authHeader = e.reqHeaders?.['Authorization'] || e.reqHeaders?.['authorization'] || '';
      if (authHeader.startsWith('Bearer ')) {
        return true;
      }
      
      // Token in body
      if (bodyLower.includes('token') || bodyLower.includes('access_token')) {
        return true;
      }
      
      return false;
    },
    extractTokens: (e) => {
      const resBodyLower = (e.resBodyText || '').toLowerCase();
      const authHeader = e.reqHeaders?.['Authorization'] || e.reqHeaders?.['authorization'] || '';
      
      // Bearer token in header
      if (authHeader.startsWith('Bearer ')) {
        return true;
      }
      
      // Token in response
      if (resBodyLower.includes('"token"') ||
          resBodyLower.includes('"access_token"') ||
          resBodyLower.includes('"accessToken"')) {
        return true;
      }
      
      return false;
    },
    permanentCreds: () => false,
    guidance: {
      authDiscovery: '**Bearer Token Detection** 🔐\n\nI\'m looking for bearer token authentication:\n\n**What to look for:**\n- `/token` or `/auth` endpoints\n- `Authorization: Bearer <token>` headers\n- Token in request/response bodies\n\n**Try this:**\n1. Navigate to the login page\n2. Complete authentication\n3. I\'ll detect token endpoints and bearer token usage',
      extractTokens: '**Bearer Token Extraction** 🔑\n\nI\'m looking for bearer tokens:\n\n**What to look for:**\n- `Authorization: Bearer <token>` header in requests\n- `token` or `access_token` in response bodies\n- Token endpoints that return tokens\n\n**Try this:**\n- Complete authentication\n- I\'ll automatically detect bearer tokens in headers and responses',
      tokenLifecycle: '**Bearer Token Lifecycle** ⏱️\n\nBearer tokens typically:\n- Expire after a set time (check `expires_in` in response)\n- May have refresh tokens for renewal\n- Token refresh via `/token` endpoint\n\n**Try this:**\n- Check token expiration in response\n- I\'ll detect refresh token flows automatically',
      permanentCreds: '**Bearer Token Credentials** 🔐\n\nBearer tokens are temporary credentials. No permanent API keys are used.',
    },
  };
}
