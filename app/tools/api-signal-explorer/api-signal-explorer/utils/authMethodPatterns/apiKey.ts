/**
 * API Key Detection Patterns
 */

import type { RawNetworkEvent } from '@/src/tools/api-signal-explorer/neuromap';
import type { AuthMethodPatterns } from '../../types';

export function apiKeyPatterns(): AuthMethodPatterns {
  return {
    authDiscovery: (e) => {
      const headerKeys = Object.keys(e.reqHeaders || {}).map(k => k.toLowerCase());
      const pathLower = (e.path || '').toLowerCase();
      const urlLower = (e.url || '').toLowerCase();
      
      // API key headers
      if (headerKeys.some(k => 
          k.includes('api-key') ||
          k.includes('apikey') ||
          k.includes('x-api-key') ||
          k.includes('x-client-id') ||
          k === 'authorization' && (e.reqHeaders?.['Authorization'] || '').includes('ApiKey'))) {
        return true;
      }
      
      // API key in query
      if (urlLower.includes('api_key=') ||
          urlLower.includes('apikey=') ||
          urlLower.includes('api-key=')) {
        return true;
      }
      
      // API key endpoints
      if (pathLower.includes('/api/key') ||
          pathLower.includes('/keys') ||
          pathLower.includes('/credentials')) {
        return true;
      }
      
      return false;
    },
    extractTokens: (e) => {
      const headerKeys = Object.keys(e.reqHeaders || {}).map(k => k.toLowerCase());
      const urlLower = (e.url || '').toLowerCase();
      
      // API key in header
      if (headerKeys.some(k => 
          k.includes('api-key') ||
          k.includes('apikey') ||
          k.includes('x-api-key'))) {
        return true;
      }
      
      // API key in query
      if (urlLower.includes('api_key=') ||
          urlLower.includes('apikey=')) {
        return true;
      }
      
      return false;
    },
    permanentCreds: (e) => {
      // API keys are permanent credentials
      return apiKeyPatterns().extractTokens(e);
    },
    guidance: {
      authDiscovery: '**API Key Detection** 🔐\n\nI\'m looking for API key authentication:\n\n**What to look for:**\n- `X-API-Key`, `X-Client-Id`, or `ApiKey` headers\n- `api_key` or `apikey` query parameters\n- `/api/key` or `/keys` endpoints\n\n**Try this:**\n1. Make API requests to the service\n2. Check request headers for API key patterns\n3. I\'ll detect API key usage automatically',
      extractTokens: '**API Key Extraction** 🔑\n\nI\'m looking for API keys:\n\n**What to look for:**\n- `X-API-Key: <key>` header\n- `api_key=<key>` query parameter\n- `Authorization: ApiKey <key>` header\n\n**Note:** API keys are permanent credentials, not temporary tokens',
      tokenLifecycle: '**API Key Lifecycle** ⏱️\n\nAPI keys:\n- Are permanent credentials (don\'t expire automatically)\n- May be rotated manually via UI or API\n- No automatic refresh needed\n\n**Note:** These are permanent credentials, not temporary tokens',
      permanentCreds: '**API Key Credentials** 🔐\n\nAPI keys are permanent credentials:\n- Sent in headers or query parameters\n- Don\'t expire automatically\n- May be rotated manually',
    },
  };
}
