/**
 * Core types for Network Inspector
 */

export type NetworkEvent = {
  ts: number; // epoch ms
  method: string;
  url: string;
  path: string;
  host: string;
  query: Record<string, string | string[]>;
  reqHeaders: Record<string, string>;
  reqCookies: Record<string, string>;
  reqBodyText?: string;
  reqBodyMime?: string;
  status?: number;
  resHeaders?: Record<string, string>;
  resMime?: string;
  resSize?: number; // bytes
  resBodyText?: string; // response body text (truncated, redacted)
  durationMs?: number;
  // optional tags
  phase?: "page_load" | "interaction" | "background";
  actionTag?: string; // e.g. "clicked_search"
  bodyFingerprint?: string; // hash of stable body structure
  authSignals?: {
    hasAuthHeader: boolean;
    hasSessionCookie: boolean;
    hasCsrfHeader: boolean;
    authHeaderFingerprint?: string;
  };
};

export type EndpointSummary = {
  key: string;
  method: string;
  host: string;
  path: string;
  queryKeys: string[];
  count: number;
  firstSeen: number;
  lastSeen: number;
  statuses: Record<string, number>;
  resMimeTop?: string;
  resSizeAvg?: number;
  resSizeMedian?: number;
  score: number;
  reasons: string[]; // human-readable reasons from signals applied
  sampleUrls: string[]; // max 3
  sampleBodies?: string[]; // redacted, max 1-2
  phaseDistribution?: {
    page_load: number;
    interaction: number;
    background: number;
  };
  pollingLoop?: boolean;
  authRole?: "auth_primary" | "auth_refresh" | "auth_guard" | "data_protected" | "unauthenticated";
  retryChains?: number; // number of retry chains this endpoint participates in
  jsonShape?: {
    isJson: boolean;
    depth: number;
    keyCount: number;
    arrayCount: number;
    maxArrayLen: number;
    objectCount: number;
    hasPaginationMarkers: boolean;
    hasErrorEnvelope: boolean;
    sampleKeys: string[];
  };
  entitySignals?: {
    hasIdLike: boolean;
    hasTimestamps: boolean;
    hasContactFields: boolean;
    hasLocationFields: boolean;
  };
  intent?: "query" | "mutation" | "unknown";
};

export type DedupeGroup = {
  key: string;
  events: NetworkEvent[];
  queryShape: string; // sorted query keys
  bodyFingerprint?: string;
};

export type HarEntry = {
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    headers: Array<{ name: string; value: string }>;
    cookies?: Array<{ name: string; value: string }>;
    postData?: {
      mimeType?: string;
      text?: string;
    };
  };
  response: {
    status: number;
    headers: Array<{ name: string; value: string }>;
    content: {
      mimeType?: string;
      size?: number;
      text?: string;
    };
    bodySize?: number;
  };
  _initiator?: {
    type?: string;
    stack?: any;
  };
};

export type HarFile = {
  log: {
    entries: HarEntry[];
  };
};
