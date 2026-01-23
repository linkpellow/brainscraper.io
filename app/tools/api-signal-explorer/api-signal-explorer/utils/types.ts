/**
 * Shared types for auth method patterns
 */

import type { RawNetworkEvent } from '@/src/tools/api-signal-explorer/neuromap';

export type AuthMethod =
  | 'oauth'
  | 'saml'
  | 'cookie'
  | 'bearer'
  | 'basic'
  | 'api-key'
  | 'other'
  | 'auto';

export type AuthMethodPatterns = {
  authDiscovery: (event: RawNetworkEvent) => boolean;
  extractTokens: (event: RawNetworkEvent) => boolean;
  permanentCreds: (event: RawNetworkEvent) => boolean;
  guidance: {
    authDiscovery: string;
    extractTokens: string;
    tokenLifecycle: string;
    permanentCreds: string;
  };
};
