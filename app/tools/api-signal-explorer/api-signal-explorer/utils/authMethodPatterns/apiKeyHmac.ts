/**
 * API Key + HMAC Signature Detection Patterns
 */

import type { RawNetworkEvent } from '@/src/tools/api-signal-explorer/neuromap';
import type { AuthMethodPatterns } from '../../types';
import { apiKeyPatterns } from './apiKey';

export function apiKeyHmacPatterns(): AuthMethodPatterns {
  return {
    authDiscovery: (e) => {
      const headerKeys = Object.keys(e.reqHeaders || {}).map(k => k.toLowerCase());
      
      // HMAC signature headers
      if (headerKeys.some(k => 
          k.includes('signature') ||
          k.includes('x-signature') ||
          k.includes('authorization') && (e.reqHeaders?.['Authorization'] || '').includes('Signature'))) {
        return true;
      }
      
      // API key + signature pattern
      const hasApiKey = apiKeyPatterns().authDiscovery(e);
      const hasSignature = headerKeys.some(k => k.includes('signature'));
      
      return hasApiKey && hasSignature;
    },
    extractTokens: (e) => {
      const headerKeys = Object.keys(e.reqHeaders || {}).map(k => k.toLowerCase());
      
      // Signature + related fields
      const hasSignature = headerKeys.some(k => 
          k.includes('signature') ||
          k.includes('x-signature'));
      const hasTimestamp = headerKeys.some(k => 
          k.includes('timestamp') ||
          k.includes('x-timestamp') ||
          k.includes('date'));
      const hasNonce = headerKeys.some(k => 
          k.includes('nonce') ||
          k.includes('x-nonce') ||
          k.includes('request-id'));
      
      return hasSignature && (hasTimestamp || hasNonce);
    },
    permanentCreds: (e) => {
      // API key + HMAC secret are permanent credentials
      return apiKeyHmacPatterns().authDiscovery(e);
    },
    guidance: {
      authDiscovery: '**API Key + HMAC Signature Detection** 🔐\n\nI\'m looking for signed request authentication:\n\n**What to look for:**\n- `X-Signature` or `Signature` headers\n- `X-API-Key` or `X-Client-Id` headers (key identifier)\n- `X-Timestamp` or `Date` headers\n- `X-Nonce` or `X-Request-Id` headers\n- Combination of API key + signature in requests\n\n**Try this:**\n1. Make API requests to the service\n2. Check for signature headers alongside API key headers\n3. I\'ll detect the signature scheme automatically',
      extractTokens: '**HMAC Signature Extraction** 🔑\n\nI\'m looking for signature components:\n\n**What to look for:**\n- `X-Signature: <signature>` header\n- `X-API-Key: <key-id>` header (public identifier)\n- `X-Timestamp: <timestamp>` header\n- `X-Nonce: <nonce>` header\n- Body hash headers (e.g., `X-Content-SHA256`)\n\n**Note:** The HMAC secret is not visible in traffic - it\'s used to compute signatures',
      tokenLifecycle: '**HMAC Signature Lifecycle** ⏱️\n\nHMAC signatures:\n- Are computed per-request using a secret key\n- Include timestamp for replay protection\n- May include nonce for uniqueness\n- No expiration (signatures are request-specific)\n\n**Note:** The secret key is permanent, but signatures are computed fresh for each request',
      permanentCreds: '**HMAC Credentials** 🔐\n\nHMAC authentication uses permanent credentials:\n- API Key ID (public identifier)\n- HMAC Secret (used to compute signatures)\n- These don\'t expire, but signatures are computed per-request',
    },
  };
}
