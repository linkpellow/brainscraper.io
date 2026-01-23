/**
 * Cookie-based Session Detection Patterns
 */

import type { RawNetworkEvent } from '@/src/tools/api-signal-explorer/neuromap';
import type { AuthMethodPatterns } from '../../types';

export function cookiePatterns(): AuthMethodPatterns {
  return {
    authDiscovery: (e) => {
      const pathLower = (e.path || '').toLowerCase();
      const bodyLower = (e.reqBodyText || '').toLowerCase();
      const method = (e.method || '').toUpperCase();
      
      // Classic login endpoints
      if ((pathLower.includes('login') ||
          pathLower.includes('auth') ||
          pathLower.includes('signin') ||
          pathLower.includes('sign-in') ||
          pathLower.includes('authenticate')) &&
          ((bodyLower.includes('username') && bodyLower.includes('password')) ||
           (bodyLower.includes('email') && bodyLower.includes('password')) ||
           method === 'POST')) {
        return true;
      }
      
      return false;
    },
    extractTokens: (e) => {
      // Session cookies
      const setCookieHeaders = Object.entries(e.resHeaders || {})
        .filter(([key]) => key.toLowerCase() === 'set-cookie')
        .map(([, value]) => value);
      
      const cookieNames = ['session', 'sid', 'connect.sid', 'auth', 'sessionid', 'jsessionid', 'csrf'];
      return setCookieHeaders.some(header =>
        cookieNames.some(name => header.toLowerCase().includes(name.toLowerCase()))
      );
    },
    permanentCreds: () => false,
    guidance: {
      authDiscovery: '**Cookie Session Detection** 🔐\n\nI\'m looking for cookie-based login:\n\n**What to look for:**\n- `/login`, `/auth`, or `/signin` endpoints\n- POST requests with `username`/`password` or `email`/`password`\n- Form-based authentication\n\n**Try this:**\n1. Navigate to the login page\n2. Enter your credentials\n3. Submit the login form\n4. I\'ll detect the login endpoint automatically',
      extractTokens: '**Session Cookie Extraction** 🔑\n\nAfter login, the site sets session cookies:\n\n**What to look for:**\n- `Set-Cookie` headers in login response\n- Cookies named `session`, `sid`, `connect.sid`, or similar\n- CSRF tokens (often paired with session cookies)\n\n**Try this:**\n- Complete the login\n- I\'ll automatically detect session cookies in the response',
      tokenLifecycle: '**Session Cookie Lifecycle** ⏱️\n\nCookie sessions typically:\n- May expire after inactivity\n- May have refresh endpoints (check for `/session/refresh`)\n- May use rolling expiration on authenticated requests\n\n**Try this:**\n- Check if the site has a session refresh endpoint\n- I\'ll detect any session renewal patterns',
      permanentCreds: '**Cookie Session Credentials** 🔐\n\nCookie-based sessions don\'t use permanent API credentials. Authentication is handled via login form and session cookies.',
    },
  };
}
