/**
 * Auto-detect patterns (fallback to generic detection)
 */

import type { RawNetworkEvent } from '@/src/tools/api-signal-explorer/neuromap';
import type { AuthMethodPatterns } from '../../types';
import { oauthPatterns } from './oauth';
import { samlPatterns } from './saml';
import { cookiePatterns } from './cookie';
import { bearerPatterns } from './bearer';
import { basicDigestPatterns } from './basicDigest';
import { apiKeyPatterns } from './apiKey';
import { apiKeyHmacPatterns } from './apiKeyHmac';

export function autoPatterns(): AuthMethodPatterns {
  return {
    authDiscovery: (e) => {
      // Generic detection - check all common patterns
      return oauthPatterns().authDiscovery(e) ||
             samlPatterns().authDiscovery(e) ||
             cookiePatterns().authDiscovery(e) ||
             bearerPatterns().authDiscovery(e) ||
             basicDigestPatterns().authDiscovery(e) ||
             apiKeyPatterns().authDiscovery(e) ||
             apiKeyHmacPatterns().authDiscovery(e);
    },
    extractTokens: (e) => {
      // Generic detection
      return oauthPatterns().extractTokens(e) ||
             samlPatterns().extractTokens(e) ||
             cookiePatterns().extractTokens(e) ||
             bearerPatterns().extractTokens(e) ||
             basicDigestPatterns().extractTokens(e) ||
             apiKeyPatterns().extractTokens(e) ||
             apiKeyHmacPatterns().extractTokens(e);
    },
    permanentCreds: (e) => {
      // Generic detection
      return basicDigestPatterns().permanentCreds(e) ||
             apiKeyPatterns().permanentCreds(e) ||
             apiKeyHmacPatterns().permanentCreds(e);
    },
    guidance: {
      authDiscovery: '**Auto-Detection Mode** 🔍\n\nI\'m automatically detecting the authentication method from network traffic.\n\n**What I\'m looking for:**\n- Login endpoints (`/login`, `/auth`, `/signin`)\n- OAuth flows (`/oauth`, `/authorize`, `/token`)\n- SAML endpoints (`/saml`, `/sso`, `/acs`)\n- API keys (`X-API-Key` headers)\n- Bearer tokens (`Authorization: Bearer`)\n- HTTP Basic/Digest (`WWW-Authenticate`)\n\n**Try this:**\n1. Navigate to the login page or make API requests\n2. Complete authentication\n3. I\'ll detect the authentication method automatically',
      extractTokens: '**Token/Credential Extraction** 🔑\n\nI\'m automatically detecting tokens and credentials:\n\n**What I\'m looking for:**\n- Access tokens, refresh tokens, ID tokens\n- Session cookies\n- Bearer tokens in headers\n- API keys\n- Basic/Digest credentials\n\n**Try this:**\n- Complete authentication\n- I\'ll automatically detect tokens/credentials in responses and headers',
      tokenLifecycle: '**Token Lifecycle Mapping** ⏱️\n\nI\'m automatically detecting token lifecycle:\n\n**What I\'m looking for:**\n- Token expiration (`expires_in`, `expires_at`)\n- Token refresh endpoints\n- Session renewal patterns\n\n**Try this:**\n- Wait for token expiration or refresh the page\n- I\'ll detect refresh patterns automatically',
      permanentCreds: '**Permanent Credentials Check** 🔐\n\nI\'m automatically checking for permanent credentials:\n\n**What I\'m looking for:**\n- API keys\n- Client credentials\n- Basic/Digest credentials\n- HMAC signing keys\n\n**Note:** These are permanent credentials that don\'t expire like tokens',
    },
  };
}
