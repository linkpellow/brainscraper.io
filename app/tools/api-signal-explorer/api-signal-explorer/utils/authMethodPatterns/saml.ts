/**
 * SAML 2.0 Detection Patterns
 */

import type { RawNetworkEvent } from '@/src/tools/api-signal-explorer/neuromap';
import type { AuthMethodPatterns } from '../../types';

export function samlPatterns(): AuthMethodPatterns {
  return {
    authDiscovery: (e) => {
      const pathLower = (e.path || '').toLowerCase();
      const bodyLower = (e.reqBodyText || '').toLowerCase();
      const urlLower = (e.url || '').toLowerCase();
      
      // SAML endpoints
      if (pathLower.includes('/saml') ||
          pathLower.includes('/sso') ||
          pathLower.includes('/acs') || // Assertion Consumer Service
          pathLower.includes('/saml2')) {
        return true;
      }
      
      // SAML message indicators
      if (bodyLower.includes('samlrequest') ||
          bodyLower.includes('samlresponse') ||
          bodyLower.includes('<samlp:') ||
          bodyLower.includes('saml:assertion') ||
          urlLower.includes('samlrequest=') ||
          urlLower.includes('samlresponse=')) {
        return true;
      }
      
      return false;
    },
    extractTokens: (e) => {
      // SAML typically results in session cookies after ACS
      const setCookieHeaders = Object.entries(e.resHeaders || {})
        .filter(([key]) => key.toLowerCase() === 'set-cookie')
        .map(([, value]) => value);
      
      if (setCookieHeaders.length > 0) {
        const cookieNames = ['session', 'sid', 'connect.sid', 'auth', 'saml'];
        return setCookieHeaders.some(header =>
          cookieNames.some(name => header.toLowerCase().includes(name.toLowerCase()))
        );
      }
      
      return false;
    },
    permanentCreds: () => false, // SAML doesn't use permanent credentials
    guidance: {
      authDiscovery: '**SAML 2.0 Detection** 🔐\n\nI\'m looking for SAML authentication flow:\n\n**What to look for:**\n- `/saml` or `/sso` endpoints\n- `/acs` (Assertion Consumer Service) endpoint\n- `SAMLRequest` or `SAMLResponse` in URLs or form data\n- Redirects to Identity Provider (IdP)\n\n**Try this:**\n1. Navigate to the login page\n2. Click "Sign in with SSO" or similar\n3. Complete the SAML handshake (SP → IdP → SP)\n4. I\'ll detect SAML endpoints and messages automatically',
      extractTokens: '**SAML Session Extraction** 🔑\n\nAfter SAML authentication, the site typically sets session cookies:\n\n**What to look for:**\n- Session cookies in `Set-Cookie` headers after ACS response\n- Cookies named `session`, `sid`, `connect.sid`, or similar\n- These cookies authenticate subsequent requests\n\n**Try this:**\n- Complete the SAML login flow\n- I\'ll automatically detect session cookies set after authentication',
      tokenLifecycle: '**SAML Session Lifecycle** ⏱️\n\nSAML sessions typically:\n- Use session cookies that may expire\n- May have refresh endpoints (check for `/session/refresh`)\n- May use "silent renew" if IdP session is still valid\n\n**Try this:**\n- Check if the site has a session refresh endpoint\n- I\'ll detect any session renewal patterns',
      permanentCreds: '**SAML Credentials** 🔐\n\nSAML doesn\'t use permanent API credentials. Authentication is handled via the SAML handshake.',
    },
  };
}
