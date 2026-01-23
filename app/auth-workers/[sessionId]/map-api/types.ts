/**
 * Type definitions for HAR Ingestion and Auth Artifact Extraction
 * Step 1: Canonical Normalized Model
 */

/**
 * Normalized Request Event (from HAR log.entries[])
 */
export type RequestEvent = {
  // Identity
  id: string; // Unique event ID
  startedDateTime: string; // ISO timestamp
  pageref?: string; // Page reference from HAR
  
  // Request
  method: string; // GET, POST, etc.
  url: string; // Full URL
  host: string; // Extracted hostname
  path: string; // Path component
  query: Record<string, string | string[]>; // Query parameters
  httpVersion: string; // HTTP/1.1, HTTP/2, etc.
  
  // Request headers (normalized lowercase)
  requestHeaders: Record<string, string>;
  
  // Request cookies
  requestCookies: CookieRecord[];
  
  // Request body
  requestBody?: {
    mimeType?: string;
    text?: string;
    parsed?: any; // Parsed JSON if applicable
  };
  
  // Response
  status: number;
  statusText: string;
  responseHeaders: Record<string, string>;
  contentType?: string;
  size: number; // Response size in bytes
  responseBody?: {
    text?: string;
    parsed?: any; // Parsed JSON if applicable
  };
  
  // Response cookies (from Set-Cookie headers)
  responseCookies: CookieRecord[];
  
  // Timing
  wait: number; // Time waiting for response (ms)
  receive: number; // Time receiving response (ms)
  
  // Derived flags
  isPreflight: boolean; // OPTIONS request
  isJson: boolean; // Content-Type is JSON
  isMutation: boolean; // POST/PUT/PATCH/DELETE
  isFirstParty: boolean; // Same domain as main site
};

/**
 * Cookie Record
 */
export type CookieRecord = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number; // Unix timestamp
  maxAge?: number; // Seconds
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
};

/**
 * Cookie Jar Timeline Entry
 */
export type CookieTimelineEntry = {
  cookieName: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  maxAge?: number;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  firstSeenAtEventId: string;
  setByUrl: string; // The exact endpoint that issued Set-Cookie
  subsequentlySentInEventIds: string[]; // Which endpoints use this cookie
  versions: Array<{
    value: string;
    setAtEventId: string;
    setByUrl: string;
    expires?: number;
  }>; // Track value changes over time
};

/**
 * Auth Artifact
 */
export type AuthArtifact = {
  type: 'bearer_token' | 'basic_auth' | 'api_key' | 'csrf_token' | 'session_token' | 'refresh_token' | 'id_token' | 'cookie_auth';
  name: string; // Header name or JSON key
  value: string; // The actual token/value (may be masked in display)
  location: 'request_header' | 'response_header' | 'request_body' | 'response_body' | 'cookie';
  firstSeenAtEventId: string;
  createdByUrl: string; // Where it was first created/issued
  usedInEventIds: string[]; // Where it's subsequently used
  expiresIn?: number; // Seconds until expiration
  expiresAt?: number; // Unix timestamp
  metadata?: Record<string, any>; // Additional metadata
};

/**
 * Host Classification
 */
export type HostInfo = {
  host: string;
  registrableDomain: string; // eTLD+1 (e.g., "example.com" from "sub.example.com")
  isFirstParty: boolean;
  eventCount: number; // How many requests to this host
};

/**
 * Artifact Bundle (Step 1 Output)
 */
export type ArtifactBundle = {
  // Normalized event stream
  events: RequestEvent[];
  
  // Cookie jar timeline
  cookieJar: {
    timeline: CookieTimelineEntry[];
  };
  
  // Auth artifacts
  authArtifacts: AuthArtifact[];
  
  // Host classification
  hosts: {
    firstParty: string[];
    thirdParty: string[];
    hostInfo: HostInfo[];
  };
  
  // Metadata
  metadata: {
    harFile: string; // Original HAR filename
    extractedAt: number; // Timestamp
    totalEvents: number;
    totalCookies: number;
    totalAuthArtifacts: number;
  };
};

// Re-export types from other modules for convenience
export type { EndpointGroup } from './endpointGrouping';
export type { MinimalAuthRequirements } from './authRequirements';
export type { AuthFlowGraph, AuthSummary } from './authFlowGraph';
export type { EndpointCatalog, EndpointCatalogEntry } from './endpointCatalog';
export type { OAuthCredentials, TokenData } from './harToAuthWorker';
