/**
 * Public type surface for the API Signal Explorer (app tool).
 *
 * Keep this file small and stable: feature modules import types from here
 * instead of reaching into arbitrary UI/component paths.
 */
 
export type { AuthMethod, AuthMethodPatterns } from './utils/types';

export type EndpointData = {
  method: string;
  host: string;
  path: string;
  count: number;
  statuses: Record<string, number>;
  hasAuth: boolean;
  isMutation: boolean;

  sampleUrl: string;
  lastSeen: number;

  resMime?: string;
  resSizeAvg?: number;

  sampleHeaders?: Record<string, string>;
  sampleReqBody?: string;
  sampleResBody?: string;
};

export type LockedStep = {
  id?: string;
  stepNumber: number;
  endpoint: string;
  method: string;
  lockedAt?: number;

  response?: unknown;
  extractedVars?: Record<string, any>;
  verificationStatus?: {
    tokenCaptured?: boolean;
    tokenInjectionAttempted?: boolean;
    tokenInjectionSucceeded?: boolean;
    authenticatedRequestsDetected?: boolean;
    authenticatedRequestCount?: number;
    verified?: boolean;
    authenticatedEndpoints?: string[];
    issues?: string[];
  };
};

