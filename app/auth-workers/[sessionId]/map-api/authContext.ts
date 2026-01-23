/**
 * AuthContext Store
 * 
 * Maintains cookies, tokens, and auth artifacts for dependency-aware testing
 */

export type AuthArtifact = {
  type: 'cookie' | 'bearer_token' | 'csrf_token' | 'api_key';
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  lastVerified?: number;
  source?: string; // Which endpoint minted it
};

/**
 * AuthContext - stores all auth artifacts
 */
export class AuthContext {
  private artifacts: Map<string, AuthArtifact> = new Map();
  
  /**
   * Set an auth artifact
   */
  setArtifact(artifact: AuthArtifact): void {
    const key = this.getKey(artifact);
    artifact.lastVerified = Date.now();
    this.artifacts.set(key, artifact);
  }
  
  /**
   * Get an auth artifact
   */
  getArtifact(type: 'cookie' | 'bearer_token' | 'csrf_token' | 'api_key', name: string, domain?: string): AuthArtifact | undefined {
    const key = this.getKey({ type, name, domain });
    return this.artifacts.get(key);
  }
  
  /**
   * Get all cookies for a domain
   */
  getCookiesForDomain(domain: string): AuthArtifact[] {
    return Array.from(this.artifacts.values())
      .filter(a => a.type === 'cookie' && (!a.domain || a.domain === domain || domain.endsWith(a.domain)));
  }
  
  /**
   * Get bearer token
   */
  getBearerToken(): AuthArtifact | undefined {
    return Array.from(this.artifacts.values())
      .find(a => a.type === 'bearer_token');
  }
  
  /**
   * Get CSRF token
   */
  getCSRFToken(domain?: string): AuthArtifact | undefined {
    return Array.from(this.artifacts.values())
      .find(a => a.type === 'csrf_token' && (!domain || !a.domain || a.domain === domain));
  }
  
  /**
   * Check if required artifacts are available
   */
  hasRequiredArtifacts(required: {
    cookies?: string[];
    headers?: string[];
    bearerToken?: boolean;
    csrf?: boolean;
  }, domain?: string): { missing: string[]; available: boolean } {
    const missing: string[] = [];
    
    if (required.cookies) {
      for (const cookieName of required.cookies) {
        const cookie = this.getArtifact('cookie', cookieName, domain);
        if (!cookie) {
          missing.push(`cookie:${cookieName}`);
        }
      }
    }
    
    if (required.bearerToken) {
      const token = this.getBearerToken();
      if (!token) {
        missing.push('bearer_token');
      }
    }
    
    if (required.csrf) {
      const csrf = this.getCSRFToken(domain);
      if (!csrf) {
        missing.push('csrf_token');
      }
    }
    
    return {
      missing,
      available: missing.length === 0,
    };
  }
  
  /**
   * Extract artifacts from response
   */
  extractFromResponse(response: {
    headers: Record<string, string>;
    body?: any;
    url: string;
  }): AuthArtifact[] {
    const extracted: AuthArtifact[] = [];
    const url = new URL(response.url);
    
    // Extract Set-Cookie headers
    const setCookieHeader = response.headers['set-cookie'];
    if (setCookieHeader) {
      const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
      for (const cookieStr of cookies) {
        const [nameValue] = cookieStr.split(';');
        const [name, value] = nameValue.split('=');
        if (name && value) {
          extracted.push({
            type: 'cookie',
            name: name.trim(),
            value: value.trim(),
            domain: url.hostname,
            path: url.pathname,
            source: response.url,
          });
        }
      }
    }
    
    // Extract tokens from JSON body
    if (response.body && typeof response.body === 'object') {
      if (response.body.access_token) {
        extracted.push({
          type: 'bearer_token',
          name: 'access_token',
          value: response.body.access_token,
          expires: response.body.expires_in 
            ? Date.now() + (response.body.expires_in * 1000)
            : undefined,
          source: response.url,
        });
      }
      if (response.body.refresh_token) {
        extracted.push({
          type: 'bearer_token',
          name: 'refresh_token',
          value: response.body.refresh_token,
          source: response.url,
        });
      }
      if (response.body.token) {
        extracted.push({
          type: 'bearer_token',
          name: 'token',
          value: response.body.token,
          source: response.url,
        });
      }
    }
    
    return extracted;
  }
  
  /**
   * Get key for artifact map
   */
  private getKey(artifact: Partial<AuthArtifact>): string {
    if (artifact.type === 'cookie' && artifact.domain) {
      return `${artifact.type}:${artifact.name}:${artifact.domain}`;
    }
    return `${artifact.type}:${artifact.name}`;
  }
  
  /**
   * Clear all artifacts
   */
  clear(): void {
    this.artifacts.clear();
  }
  
  /**
   * Get all artifacts (for debugging)
   */
  getAllArtifacts(): AuthArtifact[] {
    return Array.from(this.artifacts.values());
  }
}
