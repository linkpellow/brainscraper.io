/**
 * Auth Worker Export Utilities
 * Generates auth worker code/configuration from locked steps
 */

import type { LockedStep } from '../types';

export interface AuthWorkerConfig {
  domain: string;
  createdAt: string;
  version: string;
  authentication: {
    loginEndpoint?: LockedStep;
    tokenEndpoint?: LockedStep;
    refreshEndpoint?: LockedStep;
    credentials?: {
      type: 'form' | 'api' | 'oauth';
      fields?: string[];
    };
  };
  tokens: {
    accessToken?: {
      header?: string;
      location: 'header' | 'body' | 'cookie';
      name?: string;
    };
    refreshToken?: {
      header?: string;
      location: 'header' | 'body' | 'cookie';
      name?: string;
    };
    expiration?: {
      field?: string;
      duration?: number;
    };
  };
  steps: LockedStep[];
}

/**
 * Generate auth worker configuration from locked steps
 */
export function generateAuthWorkerConfig(
  lockedSteps: LockedStep[],
  domain: string
): AuthWorkerConfig {
  // Identify auth-related steps with prioritization
  // Prioritize: POST > GET, specific paths > generic, stepNumber order
  
  const loginStep = lockedSteps
    .filter(s => 
      s.endpoint.toLowerCase().includes('login') ||
      s.endpoint.toLowerCase().includes('auth') ||
      s.endpoint.toLowerCase().includes('signin') ||
      s.endpoint.toLowerCase().includes('/oauth2/authorize')
    )
    .sort((a, b) => {
      // Prioritize POST over GET
      if (a.method.toUpperCase() === 'POST' && b.method.toUpperCase() !== 'POST') return -1;
      if (b.method.toUpperCase() === 'POST' && a.method.toUpperCase() !== 'POST') return 1;
      // Prioritize step 1 (auth-discovery)
      if (a.stepNumber === 1 && b.stepNumber !== 1) return -1;
      if (b.stepNumber === 1 && a.stepNumber !== 1) return 1;
      return 0;
    })[0];
  
  const tokenStep = lockedSteps
    .filter(s =>
      s.endpoint.toLowerCase().includes('token') &&
      !s.endpoint.toLowerCase().includes('refresh')
    )
    .sort((a, b) => {
      // Prioritize POST over GET
      if (a.method.toUpperCase() === 'POST' && b.method.toUpperCase() !== 'POST') return -1;
      if (b.method.toUpperCase() === 'POST' && a.method.toUpperCase() !== 'POST') return 1;
      // Prioritize step 2 (extract-tokens)
      if (a.stepNumber === 2 && b.stepNumber !== 2) return -1;
      if (b.stepNumber === 2 && a.stepNumber !== 2) return 1;
      return 0;
    })[0];
  
  const refreshStep = lockedSteps
    .filter(s =>
      s.endpoint.toLowerCase().includes('refresh') ||
      (s.endpoint.toLowerCase().includes('token') && 
       s.method.toUpperCase() === 'POST' &&
       (s.endpoint.toLowerCase().includes('refresh') || 
        (s.response && JSON.stringify(s.response).toLowerCase().includes('refresh_token'))))
    )
    .sort((a, b) => {
      // Prioritize POST over GET
      if (a.method.toUpperCase() === 'POST' && b.method.toUpperCase() !== 'POST') return -1;
      if (b.method.toUpperCase() === 'POST' && a.method.toUpperCase() !== 'POST') return 1;
      return 0;
    })[0];

  // Extract token configuration from responses
  const extractTokenConfig = (step: LockedStep | undefined) => {
    if (!step?.response) return undefined;
    
    let body: any;
    try {
      body = typeof step.response === 'string' 
        ? JSON.parse(step.response) 
        : step.response;
    } catch (error) {
      // Response is not valid JSON, try to parse as plain object
      body = step.response;
    }
    
    // Try to find access_token or token field (verify it's actually a token, not an error)
    const accessTokenField = body.access_token || body.token || body.accessToken;
    const refreshTokenField = body.refresh_token || body.refreshToken;
    
    // Verify access token is actually a token (not null, not error message)
    const isValidToken = (token: any): boolean => {
      if (!token) return false;
      if (typeof token === 'string') {
        // Token should be substantial length (at least 10 chars for JWT, usually 20+)
        if (token.length < 10) return false;
        // Exclude error messages
        if (token.toLowerCase().includes('error') || 
            token.toLowerCase().includes('invalid') ||
            token.toLowerCase().includes('expired')) {
          return false;
        }
        return true;
      }
      return false;
    };
    
    return {
      accessToken: accessTokenField && isValidToken(accessTokenField) ? {
        location: 'body' as const,
        name: Object.keys(body).find(k => 
          k.toLowerCase().includes('access') && k.toLowerCase().includes('token')
        ) || 'access_token',
      } : undefined,
      refreshToken: refreshTokenField && isValidToken(refreshTokenField) ? {
        location: 'body' as const,
        name: Object.keys(body).find(k => 
          k.toLowerCase().includes('refresh') && k.toLowerCase().includes('token')
        ) || 'refresh_token',
      } : undefined,
      expiration: body.expires_in && typeof body.expires_in === 'number' && body.expires_in > 0 ? {
        field: 'expires_in',
        duration: body.expires_in,
      } : body.expires_in && typeof body.expires_in === 'string' ? {
        field: 'expires_in',
        duration: parseInt(body.expires_in, 10) || undefined,
      } : undefined,
    };
  };

  const tokenConfig = extractTokenConfig(loginStep || tokenStep);

  return {
    domain,
    createdAt: new Date().toISOString(),
    version: '1.0.0',
    authentication: {
      loginEndpoint: loginStep,
      tokenEndpoint: tokenStep,
      refreshEndpoint: refreshStep,
      credentials: loginStep ? {
        type: 'form', // Default to form, can be enhanced
        fields: loginStep.extractedVars ? Object.keys(loginStep.extractedVars) : undefined,
      } : undefined,
    },
    tokens: {
      ...tokenConfig,
    },
    steps: lockedSteps,
  };
}

/**
 * Generate auth worker TypeScript code
 */
export function generateAuthWorkerCode(config: AuthWorkerConfig): string {
  const { domain, authentication, tokens } = config;
  
  return `/**
 * Auth Worker for ${domain}
 * Generated: ${config.createdAt}
 */

export interface AuthCredentials {
  username?: string;
  email?: string;
  password: string;
  [key: string]: any;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  expiresAt?: Date;
}

export class AuthWorker {
  private baseUrl: string;
  private tokens: AuthTokens | null = null;

  constructor(baseUrl: string = 'https://${domain}') {
    this.baseUrl = baseUrl;
  }

  /**
   * Authenticate and get tokens
   */
  async authenticate(credentials: AuthCredentials): Promise<AuthTokens> {
${authentication.loginEndpoint ? `    // Login endpoint: ${authentication.loginEndpoint.method} ${authentication.loginEndpoint.endpoint}
    const response = await fetch(\`\${this.baseUrl}${authentication.loginEndpoint.endpoint}\`, {
      method: '${authentication.loginEndpoint.method}',
      headers: {
        'Content-Type': 'application/json',
        ...this.getHeaders(),
      },
      body: JSON.stringify(credentials),
    });

    if (!response.ok) {
      throw new Error(\`Authentication failed: \${response.statusText}\`);
    }

    const data = await response.json();
    
    // Extract tokens from response
${tokens.accessToken?.location === 'body' ? `    const accessToken = data.${tokens.accessToken.name || 'access_token'};` : '    const accessToken = null; // TODO: Extract from headers/cookies'}
${tokens.refreshToken?.location === 'body' ? `    const refreshToken = data.${tokens.refreshToken.name || 'refresh_token'};` : '    const refreshToken = null; // TODO: Extract from headers/cookies'}
${tokens.expiration ? `    const expiresIn = data.${tokens.expiration.field || 'expires_in'};` : '    const expiresIn = null;'}

    this.tokens = {
      accessToken,
      refreshToken,
      expiresIn,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
    };

    return this.tokens;` : `    // TODO: Implement authentication
    throw new Error('Authentication not configured');
  }`}
  }

  /**
   * Refresh access token
   */
  async refreshToken(): Promise<AuthTokens> {
${authentication.refreshEndpoint && tokens.refreshToken ? `    if (!this.tokens?.refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await fetch(\`\${this.baseUrl}${authentication.refreshEndpoint.endpoint}\`, {
      method: '${authentication.refreshEndpoint.method}',
      headers: {
        'Content-Type': 'application/json',
        ...this.getHeaders(),
      },
      body: JSON.stringify({
        ${tokens.refreshToken.name || 'refresh_token'}: this.tokens.refreshToken,
      }),
    });

    if (!response.ok) {
      throw new Error(\`Token refresh failed: \${response.statusText}\`);
    }

    const data = await response.json();
    const accessToken = data.${tokens.accessToken?.name || 'access_token'};
    const expiresIn = data.${tokens.expiration?.field || 'expires_in'};

    this.tokens = {
      ...this.tokens,
      accessToken,
      expiresIn,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
    };

    return this.tokens;` : `    // TODO: Implement token refresh
    throw new Error('Token refresh not configured');
  }`}
  }

  /**
   * Get authorization headers
   */
  getHeaders(): Record<string, string> {
    if (!this.tokens?.accessToken) {
      return {};
    }

    return {
${tokens.accessToken?.location === 'header' ? `      '${tokens.accessToken.header || 'Authorization'}': \`Bearer \${this.tokens.accessToken}\`,` : `      'Authorization': \`Bearer \${this.tokens.accessToken}\`,`}
    };
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(): boolean {
    if (!this.tokens?.expiresAt) {
      return false; // Assume never expires if no expiration
    }

    return Date.now() >= this.tokens.expiresAt.getTime();
  }

  /**
   * Ensure valid token (refresh if needed)
   */
  async ensureValidToken(): Promise<void> {
    if (this.isTokenExpired() && this.tokens?.refreshToken) {
      await this.refreshToken();
    }
  }
}
`;
}

/**
 * Export auth worker as JSON
 */
export function exportAuthWorkerJSON(config: AuthWorkerConfig): string {
  return JSON.stringify(config, null, 2);
}

/**
 * Get session evaluation summary for step-2
 * Returns whether the session should be considered "success" based on verification
 */
export function getSessionEvaluationSummary(step2: LockedStep | undefined): {
  isSuccess: boolean;
  tokenCaptured: boolean;
  tokenInjected: boolean;
  authenticatedRequestsDetected: boolean;
  authenticatedRequestCount: number;
  issues: string[];
  summary: string;
} {
  if (!step2 || step2.stepNumber !== 2) {
    return {
      isSuccess: false,
      tokenCaptured: false,
      tokenInjected: false,
      authenticatedRequestsDetected: false,
      authenticatedRequestCount: 0,
      issues: ['Step-2 not found'],
      summary: 'Step-2 not found',
    };
  }

  const verification = step2.verificationStatus;
  if (!verification) {
    return {
      isSuccess: false,
      tokenCaptured: !!step2.extractedVars?.access_token,
      tokenInjected: false,
      authenticatedRequestsDetected: false,
      authenticatedRequestCount: 0,
      issues: ['Verification not yet completed'],
      summary: 'Verification pending',
    };
  }

  const isSuccess = !!verification.verified;
  const summary = isSuccess
    ? `✅ Success: Token captured, injected, and ${verification.authenticatedRequestCount} authenticated requests detected`
    : `❌ Failed: ${verification.issues?.join('; ') || 'Unknown error'}`;

  return {
    isSuccess,
    tokenCaptured: !!verification.tokenCaptured,
    tokenInjected: !!verification.tokenInjectionSucceeded,
    authenticatedRequestsDetected: !!verification.authenticatedRequestsDetected,
    authenticatedRequestCount: verification.authenticatedRequestCount || 0,
    issues: verification.issues || [],
    summary,
  };
}
