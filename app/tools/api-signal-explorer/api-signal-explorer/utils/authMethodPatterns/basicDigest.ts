/**
 * HTTP Basic/Digest Detection Patterns
 */

import type { RawNetworkEvent } from '@/src/tools/api-signal-explorer/neuromap';
import type { AuthMethodPatterns } from '../../types';

export function basicDigestPatterns(): AuthMethodPatterns {
  return {
    authDiscovery: (e) => {
      const resHeaders = e.resHeaders || {};
      const wwwAuth = resHeaders['WWW-Authenticate'] || resHeaders['www-authenticate'] || '';
      const authHeader = e.reqHeaders?.['Authorization'] || e.reqHeaders?.['authorization'] || '';
      
      // WWW-Authenticate challenge
      if (wwwAuth.toLowerCase().includes('basic') ||
          wwwAuth.toLowerCase().includes('digest')) {
        return true;
      }
      
      // Authorization header
      if (authHeader.startsWith('Basic ') || authHeader.startsWith('Digest ')) {
        return true;
      }
      
      return false;
    },
    extractTokens: (e) => {
      const authHeader = e.reqHeaders?.['Authorization'] || e.reqHeaders?.['authorization'] || '';
      return authHeader.startsWith('Basic ') || authHeader.startsWith('Digest ');
    },
    permanentCreds: (e) => {
      // Basic/Digest uses permanent credentials (username/password)
      const authHeader = e.reqHeaders?.['Authorization'] || e.reqHeaders?.['authorization'] || '';
      return authHeader.startsWith('Basic ') || authHeader.startsWith('Digest ');
    },
    guidance: {
      authDiscovery: '**HTTP Basic/Digest Detection** 🔐\n\nI\'m looking for HTTP Basic or Digest authentication:\n\n**What to look for:**\n- `WWW-Authenticate: Basic` or `WWW-Authenticate: Digest` in responses\n- `Authorization: Basic <base64>` or `Authorization: Digest ...` headers\n- 401 responses with authentication challenges\n\n**Try this:**\n1. Navigate to a protected resource\n2. Server will return 401 with WWW-Authenticate header\n3. I\'ll detect the authentication scheme automatically',
      extractTokens: '**Basic/Digest Credentials** 🔑\n\nHTTP Basic/Digest uses credentials directly:\n\n**What to look for:**\n- `Authorization: Basic <base64(username:password)>` header\n- `Authorization: Digest ...` header (for Digest)\n- Credentials are sent with each request\n\n**Note:** Credentials are permanent (username/password), not tokens',
      tokenLifecycle: '**Basic/Digest Lifecycle** ⏱️\n\nHTTP Basic/Digest:\n- Uses permanent credentials (username/password)\n- No token expiration\n- Credentials are sent with each request\n- May require realm/nonce handling (Digest)\n\n**Note:** These are permanent credentials, not temporary tokens',
      permanentCreds: '**Basic/Digest Credentials** 🔐\n\nHTTP Basic/Digest uses permanent credentials:\n- Username and password\n- Sent in `Authorization` header\n- No expiration (until changed manually)',
    },
  };
}
