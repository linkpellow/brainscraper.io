/**
 * Type definitions for NeuromapWorkspace
 */

export type EndpointData = {
  method: string;
  host: string;
  path: string;
  count: number;
  statuses: Record<string, number>;
  resMime?: string;
  resSizeAvg?: number;
  hasAuth: boolean;
  isMutation: boolean;
  sampleUrl: string;
  lastSeen: number;
  sampleHeaders?: Record<string, string>;
  sampleReqBody?: string;
  sampleResBody?: string;
  selected?: boolean;
  actionLinked?: boolean;
  actionConfidence?: number;
  categoryTags?: import('@/src/tools/api-signal-explorer/signals').CategoryTag[];
};

export type LockedStep = {
  id: string;
  stepNumber: number;
  endpoint: string;
  method: string;
  code: string;
  response: any;
  extractedVars: Record<string, any>;
  dependencies: string[];
  lockedAt: number;
  status: 'success';
};

export type AIInsight = {
  id: string;
  type: 'credential_required' | 'conditional_logic' | 'temporal_constraint' | 'rate_limit' | 'field_dependency' | 'pagination_pattern' | 'validation_rule';
  rule: string;
  confidence: number;
  severity: 'high' | 'medium' | 'low';
  suggestion: string;
  autoFixable: boolean;
  dismissed: boolean;
};

export type TestResult = {
  success: boolean;
  status: number;
  statusText: string;
  headers: Record<string, any>;
  body: any;
  error?: string;
};

export type NeuromapWorkspaceProps = {
  neuromap: import('@/src/tools/api-signal-explorer/neuromap').Neuromap;
  onUpdate: (neuromap: import('@/src/tools/api-signal-explorer/neuromap').Neuromap) => void;
  onClose: () => void;
  wsUrl?: string;
};

export type CodeSnippetLang = 'curl' | 'fetch' | 'axios' | 'python';

export type WorkflowMode = 'mobile' | 'browser';
