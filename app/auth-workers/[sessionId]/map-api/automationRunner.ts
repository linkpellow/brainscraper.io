/**
 * Automation Runner
 * 
 * Executes automation templates using auth worker tokens
 */

import type { AutomationEndpointGroup } from './automationGrouping';
import type { AutomationTemplate } from './automationTemplates';
import type { EndpointMapping } from './endpointMapping';
import { AuthContext } from './authContext';
import type { PersistedAuthWorkerState } from '../../utils/authWorkerPersistence';
import { getValidToken } from '../../utils/tokenRefreshService';

/**
 * Automation execution result
 */
export type AutomationResult = {
  success: boolean;
  endpoint: AutomationEndpointGroup;
  response?: any;
  error?: string;
  duration: number;
  artifactsExtracted?: number;
};

/**
 * Automation runner
 */
export class AutomationRunner {
  private authContext: AuthContext;
  private session: PersistedAuthWorkerState;
  
  constructor(session: PersistedAuthWorkerState) {
    this.session = session;
    this.authContext = new AuthContext();
    this.initializeAuthContext();
  }

  /**
   * Initialize auth context with tokens (refreshes if needed)
   */
  private async initializeAuthContext(): Promise<void> {
    // Get valid token (auto-refreshes if needed)
    const tokenResult = await getValidToken(this.session.sessionId);
    
    if (tokenResult?.token) {
      this.authContext.setArtifact({
        type: 'bearer_token',
        name: 'access_token',
        value: tokenResult.token,
        source: 'auth-worker-session',
      });
      
      // Reload session if token was refreshed
      if (tokenResult.wasRefreshed) {
        const { getSessionById } = await import('../../utils/authWorkerPersistence');
        const updatedSession = getSessionById(this.session.sessionId);
        if (updatedSession) {
          this.session = updatedSession;
        }
      }
    } else if (this.session.step2.extractedVars.access_token) {
      // Fallback to stored token if refresh service unavailable
      this.authContext.setArtifact({
        type: 'bearer_token',
        name: 'access_token',
        value: this.session.step2.extractedVars.access_token,
        source: 'auth-worker-session',
      });
    }
    
    if (this.session.step2.extractedVars.refresh_token) {
      this.authContext.setArtifact({
        type: 'bearer_token',
        name: 'refresh_token',
        value: this.session.step2.extractedVars.refresh_token,
        source: 'auth-worker-session',
      });
    }
  }
  
  /**
   * Get current bearer token (refreshes if needed)
   */
  async getBearerToken(): Promise<string | null> {
    // Ensure auth context is initialized
    await this.initializeAuthContext();
    
    const token = this.authContext.getBearerToken();
    return token?.value || null;
  }
  
  /**
   * Execute automation template
   */
  async executeAutomation(
    template: AutomationTemplate,
    endpoint: AutomationEndpointGroup,
    input: Record<string, any> = {}
  ): Promise<AutomationResult> {
    const startTime = Date.now();
    
    try {
      // Build URL
      let url = `https://${endpoint.host}${endpoint.normalizedPathTemplate}`;
      
      // Replace template placeholders with input values
      for (const [key, value] of Object.entries(input)) {
        url = url.replace(`:${key}`, String(value));
        url = url.replace(`:id`, String(value)); // Generic ID replacement
        url = url.replace(`:uuid`, String(value)); // UUID replacement
      }
      
      // Build headers
      const headers: Record<string, string> = {};
      
      // Authorization (from auth worker - auto-refreshes if needed)
      if (endpoint.hasAuthHeader) {
        const token = await this.getBearerToken();
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
      }
      
      // Cookies
      if (endpoint.hasCookies) {
        const cookies = this.authContext.getCookiesForDomain(endpoint.host);
        if (cookies.length > 0) {
          headers['Cookie'] = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        }
      }
      
      // Content-Type
      if (endpoint.sampleBodyKeys.length > 0) {
        headers['Content-Type'] = 'application/json';
      }
      
      // Accept
      if (endpoint.isJsonResponse) {
        headers['Accept'] = 'application/json';
      }
      
      // Build body from input
      let body: string | undefined;
      if (endpoint.sampleBodyKeys.length > 0 && Object.keys(input).length > 0) {
        // Map input to body structure
        let bodyObj: Record<string, any> = {};
        for (const key of endpoint.sampleBodyKeys) {
          // Try to find matching input key (case-insensitive)
          const inputKey = Object.keys(input).find(k => 
            k.toLowerCase() === key.toLowerCase() ||
            k.toLowerCase().includes(key.toLowerCase()) ||
            key.toLowerCase().includes(k.toLowerCase())
          );
          if (inputKey) {
            bodyObj[key] = input[inputKey];
          }
        }
        
        // If no matches, use input as-is
        if (Object.keys(bodyObj).length === 0) {
          bodyObj = input;
        }
        
        body = JSON.stringify(bodyObj);
      }
      
      // Execute request
      const response = await fetch(url, {
        method: endpoint.method,
        headers,
        body,
      });
      
      const duration = Date.now() - startTime;
      const contentType = response.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');
      
      const responseData = isJson 
        ? await response.json()
        : await response.text();
      
      // Extract artifacts
      const artifacts = this.authContext.extractFromResponse({
        headers: Object.fromEntries(response.headers.entries()),
        body: responseData,
        url: response.url,
      });
      
      artifacts.forEach(artifact => this.authContext.setArtifact(artifact));
      
      return {
        success: response.status >= 200 && response.status < 300,
        endpoint,
        response: responseData,
        duration,
        artifactsExtracted: artifacts.length,
      };
    } catch (error) {
      return {
        success: false,
        endpoint,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }
  
  /**
   * Get auth context (for inspection)
   */
  getAuthContext(): AuthContext {
    return this.authContext;
  }
}
