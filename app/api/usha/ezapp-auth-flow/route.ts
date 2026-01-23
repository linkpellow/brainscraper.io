/**
 * USHA Advisors ezApp Authentication Flow Tracer
 * 
 * Traces what happens when clicking the ezApp link on agent.ushadvisors.com
 * to understand the authentication flow
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action') || 'info';
  
  if (action === 'info') {
    return NextResponse.json({
      success: true,
      title: 'USHA Advisors ezApp Authentication Flow',
      description: 'When clicking the ezApp link on agent.ushadvisors.com, the following authentication flow is triggered:',
      authenticationMethod: {
        type: 'JWT Token (Bearer)',
        provider: 'AWS Cognito + USHA Token Exchange',
        description: 'USHA Advisors uses JWT tokens, not session cookies. Authentication happens via Cognito, then tokens are exchanged for USHA JWT tokens.',
      },
      expectedFlow: [
        {
          step: 1,
          action: 'User clicks ezApp link',
          url: 'https://agent.ushadvisors.com/home#:~:text=My%20Business-,ezApp,-Agent%20Insights',
          description: 'This is likely a client-side navigation or redirect',
        },
        {
          step: 2,
          action: 'Check for existing authentication',
          checks: [
            'localStorage/sessionStorage for existing tokens',
            'Cookies for session state',
            'Cognito ID token (if logged in via Cognito)',
          ],
        },
        {
          step: 3,
          action: 'If not authenticated, redirect to login',
          endpoints: [
            'https://agent.ushadvisors.com/Account/Login',
            'Cognito hosted UI (if using Cognito)',
          ],
        },
        {
          step: 4,
          action: 'After login, exchange Cognito token for USHA JWT',
          endpoints: [
            'https://agent.ushadvisors.com/api/account/login',
            'https://agent.ushadvisors.com/api/auth/login',
            'https://api-business-agent.ushadvisors.com/api/account/login',
            'https://api-identity-agent.ushadvisors.com/account/refresh',
          ],
          method: 'POST',
          headers: {
            'Authorization': 'Bearer <Cognito-ID-Token>',
            'Content-Type': 'application/json',
          },
        },
        {
          step: 5,
          action: 'Receive USHA JWT token',
          response: {
            access_token: 'JWT token',
            token_type: 'Bearer',
            expires_in: 3600,
            refresh_token: 'optional',
          },
        },
        {
          step: 6,
          action: 'Navigate to ezApp',
          url: 'https://ezapp.ushealthgroup.com (or similar)',
          headers: {
            'Authorization': 'Bearer <USHA-JWT-Token>',
          },
        },
      ],
      keyEndpoints: {
        login: [
          'https://agent.ushadvisors.com/Account/Login',
          'https://agent.ushadvisors.com/api/account/login',
        ],
        tokenExchange: [
          'https://agent.ushadvisors.com/api/auth/login',
          'https://api-business-agent.ushadvisors.com/api/account/login',
          'https://api-identity-agent.ushadvisors.com/account/refresh',
        ],
        ezApp: [
          'https://ezapp.ushealthgroup.com',
          'https://app.tampausha.com',
        ],
      },
      authenticationTypes: {
        primary: 'JWT Bearer Token',
        secondary: 'AWS Cognito ID Token (exchanged for JWT)',
        storage: [
          'localStorage (browser)',
          'sessionStorage (browser)',
          'Cookies (session state only, not auth)',
        ],
      },
      howToCapture: {
        method: 'HAR File Capture',
        steps: [
          '1. Open browser DevTools (F12) → Network tab',
          '2. Clear network log',
          '3. Click the ezApp link on agent.ushadvisors.com',
          '4. Watch for these requests:',
          '   - POST to /api/account/login or /api/auth/login',
          '   - POST to /account/refresh (token refresh)',
          '   - GET/POST requests with Authorization: Bearer headers',
          '5. Export HAR file',
          '6. Upload to /auth-workers page',
        ],
        whatToLookFor: [
          'Authorization: Bearer <token> headers',
          'Response bodies containing access_token or token',
          'Cognito-related requests (if using Cognito)',
          'Token refresh endpoints',
        ],
      },
      differenceFromUSHEALTH: {
        ushaAdvisors: {
          method: 'JWT Bearer Token',
          storage: 'localStorage/sessionStorage',
          endpoints: 'OAuth-style token endpoints',
          example: 'agent.ushadvisors.com',
        },
        ushealthGroup: {
          method: 'ASP.NET Session Cookie',
          storage: 'Browser cookies (ASP.NET_SessionId)',
          endpoints: 'Session-based (no token exchange)',
          example: 'ezapp.ushealthgroup.com',
        },
      },
    });
  }
  
  return NextResponse.json({
    success: false,
    error: 'Invalid action',
  }, { status: 400 });
}
