'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Pause, Play, Check, X, Download, Globe, Plus, MousePointer, Tag, Monitor, Rss, ChevronDown, ChevronRight, Copy, Code, Terminal, ArrowDown, Zap, Brain, Sparkles, Loader2, Lightbulb, TrendingUp, Filter, MessageSquare, BookOpen } from 'lucide-react';
import type { Neuromap, RawNetworkEvent } from '@/src/tools/api-signal-explorer/neuromap';
import { addEventToNeuromap, toggleEndpointSelection, exportNeuromap } from '@/src/tools/api-signal-explorer/neuromap';
import { createActionEvent, type ActionEvent, type ActionType } from '@/src/tools/api-signal-explorer/actions';
import { linkActionToEvents } from '@/src/tools/api-signal-explorer/correlate';
import { convertToNetworkSignal, getCategoryDescription, type CategoryTag } from '@/src/tools/api-signal-explorer/signals';
import { analyzeKeywords, scoreEndpointRelevance, type KeywordAnalysis } from '@/utils/ai/keyword-detector';
import { extractSmartVariables, detectAuthMethod, generateUsageExamples } from '@/utils/ai/smart-variables';
import { validateResponse, suggestImprovedTarget } from '@/utils/ai/success-validator';
import { findMatchingScenarios, getContextualHints, type Scenario } from '@/utils/ai/auto-suggestions';
import { getInitialAgentState, updateAgentState, shouldLoop, getNextObjective, type AgentState } from '@/utils/ai/agent-rules';
import { type ButtonMapResult, type DOMSnapshot, type MappedElement } from '@/src/tools/api-signal-explorer/form-correlator';
import { type SequentialTestResult, type ValidationResult } from '@/src/tools/api-signal-explorer/sequential-validator';
import { ErrorBoundary } from './ErrorBoundary';
import AIChatPanel, { type ChatMessage } from './AIChatPanel';

type EndpointData = {
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
};

type LockedStep = {
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

type AIInsight = {
  id: string;
  type: 'credential_required' | 'conditional_logic' | 'temporal_constraint' | 'rate_limit' | 'field_dependency' | 'pagination_pattern' | 'validation_rule';
  rule: string;
  confidence: number;
  severity: 'high' | 'medium' | 'low';
  suggestion: string;
  autoFixable: boolean;
  dismissed: boolean;
};

type TestResult = {
  success: boolean;
  status: number;
  statusText: string;
  headers: Record<string, any>;
  body: any;
  error?: string;
};

type NeuromapWorkspaceProps = {
  neuromap: Neuromap;
  onUpdate: (neuromap: Neuromap) => void;
  onClose: () => void;
  wsUrl?: string;
};

const isElectron = typeof window !== 'undefined' && (
  !!(window as { electronBridge?: { isElectron?: boolean } }).electronBridge?.isElectron ||
  (typeof process !== 'undefined' && !!(process as { versions?: { electron?: string } }).versions?.electron)
);

type CodeSnippetLang = 'curl' | 'fetch' | 'axios' | 'python';

// Code generation functions
function generateCurl(endpoint: EndpointData): string {
  const headers = endpoint.sampleHeaders || {};
  const headerFlags = Object.entries(headers)
    .map(([k, v]) => `  -H '${k}: ${v}'`)
    .join(' \\\n');
  
  const dataFlag = endpoint.sampleReqBody 
    ? `  -d '${endpoint.sampleReqBody.substring(0, 100)}${endpoint.sampleReqBody.length > 100 ? '...' : ''}'`
    : '';
  
  return `curl -X ${endpoint.method} '${endpoint.sampleUrl}'${headerFlags ? ' \\\n' + headerFlags : ''}${dataFlag ? ' \\\n' + dataFlag : ''}`;
}

function generateFetch(endpoint: EndpointData): string {
  const headers = endpoint.sampleHeaders || {};
  const headersStr = Object.keys(headers).length > 0 
    ? ',\n  headers: ' + JSON.stringify(headers, null, 2).split('\n').join('\n  ')
    : '';
  
  const body = endpoint.sampleReqBody 
    ? `,\n  body: JSON.stringify(${endpoint.sampleReqBody.substring(0, 50)}...)`
    : '';
  
  return `fetch('${endpoint.sampleUrl}', {\n  method: '${endpoint.method}'${headersStr}${body}\n})\n  .then(res => res.json())\n  .then(data => console.log(data));`;
}

function generateAxios(endpoint: EndpointData): string {
  const headers = endpoint.sampleHeaders || {};
  const config = `{\n  headers: ${JSON.stringify(headers, null, 2).split('\n').join('\n  ')}\n}`;
  
  if (endpoint.method === 'GET') {
    return `axios.get('${endpoint.sampleUrl}', ${config});`;
  }
  return `axios.${endpoint.method.toLowerCase()}('${endpoint.sampleUrl}', data, ${config});`;
}

function generatePython(endpoint: EndpointData): string {
  const headers = endpoint.sampleHeaders || {};
  const headersStr = Object.entries(headers).map(([k, v]) => `    '${k}': '${v}'`).join(',\n');
  
  return `import requests\n\nresponse = requests.${endpoint.method.toLowerCase()}(\n  '${endpoint.sampleUrl}',\n  headers={\n${headersStr}\n  }\n)\nprint(response.json())`;
}

function copyToClipboard(text: string, callback: () => void) {
  navigator.clipboard.writeText(text);
  callback();
}

// Extract variables from response
function extractVariablesFromResponse(response: any): Record<string, any> {
  const vars: Record<string, any> = {};
  
  if (!response) return vars;
  
  // Common patterns
  if (response.token) vars.token = response.token;
  if (response.access_token) vars.access_token = response.access_token;
  if (response.accessToken) vars.accessToken = response.accessToken;
  if (response.refresh_token) vars.refresh_token = response.refresh_token;
  if (response.session_id) vars.session_id = response.session_id;
  if (response.sessionId) vars.sessionId = response.sessionId;
  if (response.user?.id) vars.userId = response.user.id;
  if (response.userId) vars.userId = response.userId;
  if (response.id) vars.id = response.id;
  if (response.data?.id) vars.dataId = response.data.id;
  
  return vars;
}

// Find dependencies in code
function findDependencies(code: string, lockedSteps: LockedStep[]): string[] {
  const deps: string[] = [];
  
  lockedSteps.forEach(step => {
    Object.keys(step.extractedVars || {}).forEach(varName => {
      const varPattern = `{{step${step.stepNumber}.${varName}}}`;
      if (code.includes(varPattern)) {
        deps.push(`step${step.stepNumber}.${varName}`);
      }
    });
  });
  
  return deps;
}

// Get all available variables from locked steps
function getAllAvailableVariables(lockedSteps: LockedStep[]): Record<string, any> {
  const allVars: Record<string, any> = {};
  
  lockedSteps.forEach(step => {
    Object.entries(step.extractedVars || {}).forEach(([key, value]) => {
      allVars[`step${step.stepNumber}.${key}`] = value;
    });
  });
  
  return allVars;
}

// Replace variables in code
function replaceVariablesInCode(code: string, variables: Record<string, any>): string {
  let result = code;
  Object.entries(variables).forEach(([key, value]) => {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
  });
  return result;
}

export default function NeuromapWorkspace({ neuromap, onUpdate, onClose, wsUrl = 'ws://localhost:8787/explorer' }: NeuromapWorkspaceProps) {
  const effectiveWsUrl =
    typeof window !== 'undefined' && isElectron && typeof (window as unknown as { electronBridge?: { getBridgeWs?: () => string } }).electronBridge?.getBridgeWs === 'function'
      ? (window as unknown as { electronBridge: { getBridgeWs: () => string } }).electronBridge.getBridgeWs()
      : wsUrl;
  const [isPaused, setIsPaused] = useState(false);
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [isMarkingInteraction, setIsMarkingInteraction] = useState(false);
  const [endpoints, setEndpoints] = useState<Array<EndpointData & { selected?: boolean; actionLinked?: boolean; actionConfidence?: number; categoryTags?: CategoryTag[] }>>([]);
  const [selectedCategoryTag, setSelectedCategoryTag] = useState<CategoryTag | null>(null);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
  const [launchBrowserLoading, setLaunchBrowserLoading] = useState(false);
  const [launchBrowserError, setLaunchBrowserError] = useState<string | null>(null);
  const [launchBrowserUrl, setLaunchBrowserUrl] = useState('');
  const [snippetLang, setSnippetLang] = useState<CodeSnippetLang>('curl');
  const [copiedEndpoint, setCopiedEndpoint] = useState<string | null>(null);
  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointData | null>(null);
  
  // Goal/Constraints state
  const [userGoal, setUserGoal] = useState('');
  const [userConstraints, setUserConstraints] = useState('');
  const [targetData, setTargetData] = useState('');
  
  // Intelligent Analysis state
  const [keywordAnalysis, setKeywordAnalysis] = useState<KeywordAnalysis | null>(null);
  const [suggestedScenarios, setSuggestedScenarios] = useState<Scenario[]>([]);
  const [showScenarios, setShowScenarios] = useState(false);
  const [contextualHints, setContextualHints] = useState<string[]>([]);
  const [workflowPlan, setWorkflowPlan] = useState<any>(null);
  const [planningWorkflow, setPlanningWorkflow] = useState(false);
  
  // Locked Pipeline state
  const [lockedSteps, setLockedSteps] = useState<LockedStep[]>([]);
  const [currentStepFocus, setCurrentStepFocus] = useState(1);
  
  // AI Agent state
  const [aiAgentActive, setAiAgentActive] = useState(false);
  const [aiAgentStatus, setAiAgentStatus] = useState<'idle' | 'analyzing' | 'completed'>('idle');
  const [aiSuggestedStep, setAiSuggestedStep] = useState<any>(null);
  const [aiInsightsList, setAiInsightsList] = useState<AIInsight[]>([]);
  const [insightsPanelOpen, setInsightsPanelOpen] = useState(true);
  
  // Test & Execution state  
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [currentCode, setCurrentCode] = useState('');
  const [successValidation, setSuccessValidation] = useState<any>(null);
  
  // Endpoint filtering
  const [showOnlyRelevant, setShowOnlyRelevant] = useState(false);
  
  // AI Chat Panel state
  const [chatExpanded, setChatExpanded] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatProcessing, setChatProcessing] = useState(false);
  const [conversationStep, setConversationStep] = useState<'goal' | 'constraints' | 'target' | 'complete' | null>('goal');
  const [agentState, setAgentState] = useState<AgentState>(getInitialAgentState());

  // DOM Flipbook state
  const [flipbookSnapshots, setFlipbookSnapshots] = useState<any[]>([]);
  const [flipbookSessionId, setFlipbookSessionId] = useState<string | null>(null);
  const [flipbookAnalysis, setFlipbookAnalysis] = useState<any>(null);
  const [analyzingFlipbook, setAnalyzingFlipbook] = useState(false);
  
  // Mode #1: Full Map state
  const [buttonMap, setButtonMap] = useState<ButtonMapResult | null>(null);
  const [generatingButtonMap, setGeneratingButtonMap] = useState(false);
  const [validationResult, setValidationResult] = useState<SequentialTestResult | null>(null);
  const [validating, setValidating] = useState(false);
  
  // Mode #1: State Variant Testing
  const [stateVariantMap, setStateVariantMap] = useState<any>(null);
  const [testingStates, setTestingStates] = useState(false);
  const [stateTestCases, setStateTestCases] = useState<Array<{ state: string; zipcode: string; description?: string }>>([
    { state: 'CO', zipcode: '80202', description: 'Colorado - Denver' },
    { state: 'CA', zipcode: '90210', description: 'California - Beverly Hills' }
  ]);
  
  // Mode #1: API Discovery (Priority 1)
  const [apiDiscovery, setApiDiscovery] = useState<any>(null);
  const [discoveringAPIs, setDiscoveringAPIs] = useState(false);
  
  // Tabs and notifications
  const [activeTab, setActiveTab] = useState<'logs' | 'code'>('logs');
  const [hasNewCodeSnippet, setHasNewCodeSnippet] = useState(false);
  
  // Human/AI control mode
  const [controlMode, setControlMode] = useState<'human' | 'ai'>('ai');
  
  // AI Mode Types
  type AIMode = 'fullMap' | 'apiOnly' | 'mobileReverse';
  const [aiMode, setAiMode] = useState<AIMode>('apiOnly');
  
  // ═══════════════════════════════════════════════════════════════════
  // PERFORMANCE OPTIMIZATIONS: Memoized Computations
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Memoized network events for correlation
   * Only recomputes when endpoints change
   */
  const networkEventsForCorrelation = useMemo(() => {
    return endpoints.map(ep => ({
      ts: ep.lastSeen,
      method: ep.method,
      url: ep.sampleUrl,
      path: ep.path,
      reqBodyText: ep.sampleReqBody,
      reqHeaders: ep.sampleHeaders
    }));
  }, [endpoints]);

  /**
   * Memoized button map coverage statistics
   * Avoid recalculating percentages on every render
   */
  const buttonMapCoverage = useMemo(() => {
    if (!buttonMap) return null;
    return {
      percentage: Math.round(buttonMap.coverage * 100),
      mapped: buttonMap.mappedButtons,
      total: buttonMap.totalButtons,
      unmapped: buttonMap.unmappedButtons
    };
  }, [buttonMap]);

  /**
   * Memoized validation summary
   * Pre-computes display values for validation results
   */
  const validationSummary = useMemo(() => {
    if (!validationResult) return null;
    return {
      passed: validationResult.allPassed,
      reliability: Math.round(validationResult.reliability * 100),
      avgResponseTime: Math.round(validationResult.averageResponseTime),
      successRate: `${validationResult.successfulAttempts}/${validationResult.totalAttempts}`
    };
  }, [validationResult]);

  /**
   * Memoized filtered endpoints for Mode #1
   * Only includes relevant endpoints based on AI mode
   */
  const relevantEndpoints = useMemo(() => {
    if (aiMode !== 'fullMap') return endpoints;
    
    // For Mode #1, prioritize POST requests (form submissions)
    return endpoints.sort((a, b) => {
      if (a.method === 'POST' && b.method !== 'POST') return -1;
      if (a.method !== 'POST' && b.method === 'POST') return 1;
      return b.lastSeen - a.lastSeen; // Most recent first
    });
  }, [endpoints, aiMode]);
  
  const endpointMapRef = useRef<Map<string, EndpointData>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const interactionStartRef = useRef<number | null>(null);
  const onUpdateRef = useRef(onUpdate);
  const neuromapRef = useRef(neuromap);
  onUpdateRef.current = onUpdate;
  neuromapRef.current = neuromap;

  // WebSocket connection
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) return;
    setWsStatus('connecting');
    const ws = new WebSocket(effectiveWsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus('connected');
      console.log('[neuromap] WebSocket connected');
    };

    ws.onerror = () => {
      setWsStatus('error');
      console.error('[neuromap] WebSocket error');
    };

    ws.onclose = () => {
      setWsStatus('disconnected');
      console.log('[neuromap] WebSocket closed');
    };

    ws.onmessage = (msg) => {
      if (isPaused) return;
      try {
        const data = JSON.parse(msg.data);
        
        if (data.type === 'flow') {
          const flow = data.data;
          
          // Parse URL to get host and path
          let urlObj: URL | null = null;
          try {
            urlObj = new URL(flow.url || '');
          } catch (err) {
            console.warn('[neuromap] Invalid URL:', flow.url);
            return;
          }
          
          const networkEvent: RawNetworkEvent = {
            ts: flow.ts || Date.now(),
            method: flow.method || 'GET',
            url: flow.url || '',
            path: urlObj.pathname,
            host: urlObj.hostname,
                  status: flow.status,
            reqHeaders: flow.reqHeaders || {},
            resHeaders: flow.resHeaders || {},
            reqCookies: {},
                  reqBodySize: flow.reqBodySize,
                  resBodySize: flow.resBodySize,
                  resMime: flow.resMime,
                  durationMs: flow.durationMs,
            source: 'browser',
          };

          addEventToNeuromap(neuromapRef.current, networkEvent);
          onUpdateRef.current(neuromapRef.current);

          // Update endpoints incrementally
          try {
            const urlObj = new URL(networkEvent.url);
            const key = `${networkEvent.method} ${urlObj.hostname}${urlObj.pathname}`;
            
            if (!endpointMapRef.current.has(key)) {
              endpointMapRef.current.set(key, {
                method: networkEvent.method,
                host: urlObj.hostname,
                path: urlObj.pathname,
                count: 0,
                statuses: {},
                hasAuth: false,
                isMutation: false,
                sampleUrl: networkEvent.url,
                lastSeen: networkEvent.ts,
                sampleHeaders: networkEvent.reqHeaders,
                sampleReqBody: undefined,
                sampleResBody: undefined,
              });
            }

            const endpoint = endpointMapRef.current.get(key)!;
            endpoint.count++;
            endpoint.lastSeen = networkEvent.ts;
            
            if (networkEvent.status) {
              const statusStr = String(networkEvent.status);
              endpoint.statuses[statusStr] = (endpoint.statuses[statusStr] || 0) + 1;
            }

            const authHeaders = ['authorization', 'x-auth-token', 'x-api-key', 'cookie'];
            endpoint.hasAuth = authHeaders.some(h => Object.keys(networkEvent.reqHeaders || {}).some(k => k.toLowerCase().includes(h)));
            endpoint.isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(networkEvent.method);

            setEndpoints(Array.from(endpointMapRef.current.values()));
          } catch (err) {
            console.warn('[neuromap] Failed to parse URL:', networkEvent.url, err);
          }
        }
      } catch (err) {
        console.error('[neuromap] Failed to parse WebSocket message:', err);
      }
    };
  }, [effectiveWsUrl, isPaused]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connectWebSocket]);

  const handleMarkInteraction = () => {
    if (isMarkingInteraction) {
      interactionStartRef.current = null;
      setIsMarkingInteraction(false);
    } else {
      interactionStartRef.current = Date.now();
      setIsMarkingInteraction(true);
      setTimeout(() => {
        interactionStartRef.current = null;
        setIsMarkingInteraction(false);
      }, 3000);
    }
  };

  const handleExport = () => {
    const data = exportNeuromap(neuromap);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `neuromap-${neuromap.name}-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLaunchBrowser = async () => {
    setLaunchBrowserLoading(true);
    setLaunchBrowserError(null);
    try {
      const res = await fetch('/api/explorer/launch-browser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: launchBrowserUrl || undefined }),
      });
      const data = await res.json();
      if (!data.ok) {
        setLaunchBrowserError(data.error || 'Failed to launch browser');
      }
    } catch (err) {
      setLaunchBrowserError(err instanceof Error ? err.message : String(err));
    } finally {
      setLaunchBrowserLoading(false);
    }
  };

  const filteredEndpoints = showSelectedOnly
    ? endpoints.filter(ep => ep.selected)
    : endpoints;

  const selectedEndpoints = endpoints.filter(ep => ep.selected);

  // AI Agent skeletal functions (to be implemented)
  const handleAiAgentToggle = () => {
    setAiAgentActive(!aiAgentActive);
    if (!aiAgentActive) {
      setAiAgentStatus('idle');
      setAiSuggestedStep(null);
    }
  };

  const runAiAnalysis = async () => {
    setAiAgentStatus('analyzing');
    
    try {
      const response = await fetch('/api/ai/analyze-endpoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: userGoal,
          constraints: userConstraints,
          targetData: targetData,
          endpoints: endpoints.map(ep => ({
            method: ep.method,
            host: ep.host,
            path: ep.path,
            hasAuth: ep.hasAuth,
            count: ep.count,
            statuses: ep.statuses,
            sampleHeaders: ep.sampleHeaders,
            sampleUrl: ep.sampleUrl,
          })),
          lockedSteps: lockedSteps,
          currentStepNumber: currentStepFocus,
        }),
      });

      const data = await response.json();

      if (data.ok && data.analysis) {
        setAiSuggestedStep(data.analysis.suggestedStep);
        setAiAgentStatus('completed');
        
        // Auto-select the suggested endpoint if found
        const suggested = endpoints.find(
          ep => ep.path === data.analysis.suggestedStep?.endpoint &&
                ep.method === data.analysis.suggestedStep?.method
        );
        if (suggested) {
          setSelectedEndpoint(suggested);
          
          // Generate code with variables
          const code = generateCodeWithVariables(suggested, data.analysis.suggestedStep.usesVariables || []);
          setCurrentCode(code);
          setHasNewCodeSnippet(true); // Show notification badge
        }
                  } else {
        console.error('[AI] Analysis failed:', data.error);
        setAiAgentStatus('idle');
      }
    } catch (err) {
      console.error('[AI] Error running analysis:', err);
      setAiAgentStatus('idle');
    }
  };
  
  const generateCodeWithVariables = (endpoint: EndpointData, usesVariables: string[]): string => {
    let code = generateCurl(endpoint);
    
    // Add variable placeholders
    usesVariables.forEach(varName => {
      code = code.replace(/(-H 'Authorization: [^']*')/g, `-H 'Authorization: Bearer {{${varName}}}'`);
    });
    
    return code;
  };

  // Handle conversational goal/constraints/target collection
  const handleConversationFlow = async (userMessage: string) => {
    const msg = userMessage.trim();

    if (conversationStep === 'goal') {
      // User is answering the goal question
      setUserGoal(msg);
      
      // Update agent state
      const newState = updateAgentState(agentState, {
        phase: 'goal',
        action: 'User defined goal',
        outcome: 'success'
      });
      newState.currentPhase = 'constraints';
      newState.goalsAchieved.push('Goal defined');
      newState.currentObjective = getNextObjective(newState);
      newState.nextAction = 'Get user to specify constraints';
      newState.certaintyLevels.workflow += 20;
      setAgentState(newState);
      
      addChatMessage('assistant',
        `✓ Goal locked: **"${msg}"**\n\n` +
        `**What constraints should I know about?**`,
        { type: 'success' }
      );
      
      setTimeout(() => {
        addChatMessage('assistant',
          `💡 **Constraint Examples:**\n\n` +
          `• Authentication: "Requires login" or "Needs API key"\n` +
          `• Rate limits: "Max 100 requests per minute"\n` +
          `• Pagination: "Data is paginated" or "Returns 50 items per page"\n` +
          `• Filters: "Must filter by date range"\n` +
          `• Permissions: "Admin access only"\n\n` +
          `Type "none" or "skip" if no constraints.`,
          { type: 'suggestion' }
        );
      }, 300);
      
      setConversationStep('constraints');
    } 
    else if (conversationStep === 'constraints') {
      // User is answering constraints question
      const hasConstraints = msg.toLowerCase() !== 'none' && msg.toLowerCase() !== 'skip';
      if (hasConstraints) {
        setUserConstraints(msg);
      }
      
      // Update agent state
      const newState = updateAgentState(agentState, {
        phase: 'constraints',
        action: hasConstraints ? 'Constraints identified' : 'No constraints',
        outcome: 'success'
      });
      newState.currentPhase = 'target';
      newState.goalsAchieved.push('Constraints defined');
      newState.currentObjective = getNextObjective(newState);
      newState.nextAction = 'Get user to define target data structure';
      newState.certaintyLevels.workflow += 15;
      setAgentState(newState);
      
      addChatMessage('assistant',
        `${hasConstraints ? `✓ Constraints locked: **"${msg}"**` : '✓ No constraints needed.'}\n\n` +
        `**What's your target data structure?**`,
        { type: 'success' }
      );
      
      setTimeout(() => {
        addChatMessage('assistant',
          `💡 **Data Structure Tips:**\n\n` +
          `✓ List the key fields you need\n` +
          `✓ Use JSON-like syntax: { field1, field2, field3 }\n` +
          `✓ For arrays, prefix with "Array of"\n` +
          `✓ Use actual field names if you know them\n\n` +
          `**Examples:**\n` +
          `• "{ id, name, price, stock }"\n` +
          `• "Array of { product_id, title, quantity }"\n` +
          `• "user.id, user.email, user.profile.bio"\n\n` +
          `I'll use this to auto-validate responses!`,
          { type: 'suggestion' }
        );
      }, 300);
      
      setConversationStep('target');
    }
    else if (conversationStep === 'target') {
      // User is answering target data question
      setTargetData(msg);
      
      // Analyze the complete input
      const analysis = analyzeKeywords(userGoal, userConstraints, msg);
      const matches = findMatchingScenarios(userGoal, msg);
      
      // Update agent state - SETUP COMPLETE
      const newState = updateAgentState(agentState, {
        phase: 'target',
        action: 'Target data defined',
        outcome: 'success'
      });
      newState.currentPhase = 'capture';
      newState.goalsAchieved.push('Target data defined', 'Setup complete');
      newState.currentObjective = getNextObjective(newState);
      newState.nextAction = 'Get user to launch browser and capture traffic';
      newState.certaintyLevels.workflow = 80;
      newState.certaintyLevels.messenger = 90;
      newState.userConfidence = 80;
      setAgentState(newState);
      
      // STRAIGHT LINE: Control the frame, show certainty, direct next action
      let response = `✅ **Setup Complete**\n\n`;
      response += `I've locked in your workflow requirements:\n\n`;
      response += `✓ Goal: ${userGoal}\n`;
      response += `✓ Constraints: ${userConstraints || 'None'}\n`;
      response += `✓ Target: ${msg}\n\n`;
      
      if (analysis.intent.confidence > 0.7) {
        response += `🎯 Intent detected: **${analysis.intent.action}** (${Math.round(analysis.intent.confidence * 100)}% confidence)\n`;
        if (analysis.entities.length > 0) {
          response += `📦 Looking for: ${analysis.entities.map(e => e.name).join(', ')}\n`;
        }
        response += `\n`;
      }
      
      // ABC: Always Be Closing - direct to next action
      response += `**🚀 Ready to capture API traffic.**\n\n`;
      response += `**Next:** Click "Launch Browser" above and browse the target site normally. I'll:\n`;
      response += `• Capture all API calls automatically\n`;
      response += `• Filter to only relevant endpoints\n`;
      response += `• Suggest the best step to test first\n\n`;
      response += `Once you see endpoints appear, I'll guide you to test and lock your first step.`;
      
      addChatMessage('assistant', response, { type: 'success' });
      
      setConversationStep('complete');
    }
  };

  // Add AI chat message
  const addChatMessage = (role: 'user' | 'assistant', content: string, metadata?: ChatMessage['metadata']) => {
    const message: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random()}`,
      role,
      content,
      timestamp: Date.now(),
      metadata,
    };
    setChatMessages(prev => [...prev, message]);
  };

  // Handle chat messages
  const handleChatMessage = async (userMessage: string) => {
    // Add user message
    addChatMessage('user', userMessage);
    setChatProcessing(true);

    try {
      // Check if we're in conversation flow
      if (conversationStep && conversationStep !== 'complete') {
        await handleConversationFlow(userMessage);
        setChatProcessing(false);
        return;
      }

      // Simple keyword-based responses for now
      const msg = userMessage.toLowerCase();
      
      if (msg.includes('help') || msg.includes('how')) {
        addChatMessage('assistant', 
          `I'm here to help you build your API workflow! Here's what I can do:\n\n` +
          `1. Analyze your goal and suggest templates\n` +
          `2. Filter endpoints by relevance\n` +
          `3. Suggest the next step in your workflow\n` +
          `4. Validate responses against your target data\n` +
          `5. Extract variables automatically\n\n` +
          `What would you like to start with?`,
          { type: 'suggestion' }
        );
      } else if (msg.includes('goal') || msg.includes('start')) {
        addChatMessage('assistant',
          `Let's define your goal! Tell me what data you want to extract. For example:\n\n` +
          `• "Get all products with prices"\n` +
          `• "Fetch user profile data"\n` +
          `• "Search for orders"\n\n` +
          `Or click a template above to get started quickly!`,
          { type: 'suggestion' }
        );
      } else if (msg.includes('template') || msg.includes('scenario')) {
        if (suggestedScenarios.length > 0) {
          addChatMessage('assistant',
            `I found ${suggestedScenarios.length} relevant templates for you:\n\n` +
            suggestedScenarios.map(s => `${s.icon} ${s.name}`).join('\n') +
            `\n\nClick the "templates" button in the Goal section to apply one!`,
            { type: 'suggestion' }
          );
        } else {
          addChatMessage('assistant',
            `I don't have any templates matching your current goal yet. Try entering a goal like "Get all products" and I'll suggest relevant templates!`,
            { type: 'suggestion' }
          );
        }
      } else if (msg.includes('endpoint') || msg.includes('traffic')) {
        if (endpoints.length === 0) {
          addChatMessage('assistant',
            `No endpoints captured yet. Launch the browser and interact with the target site to capture API traffic!\n\n` +
            `Once traffic is captured, I'll help you filter and analyze it.`,
            { type: 'suggestion' }
          );
        } else {
          addChatMessage('assistant',
            `Great! I've captured ${endpoints.length} endpoints. ${showOnlyRelevant ? `Smart filter is ON - showing only relevant endpoints.` : `Try enabling Smart Filter to see only relevant endpoints!`}\n\n` +
            `Select an endpoint to generate code and test it.`,
            { type: 'success' }
          );
        }
      } else if (msg.includes('test') || msg.includes('run')) {
        if (!selectedEndpoint) {
          addChatMessage('assistant',
            `Select an endpoint from the Network Traffic section first, then click the Test button to execute it!\n\n` +
            `I'll validate the response against your target data automatically.`,
            { type: 'suggestion' }
          );
        } else {
          addChatMessage('assistant',
            `Ready to test! Click the ▶ Test button to execute the request.\n\n` +
            `I'll check if the response matches your expected target data structure.`,
            { type: 'suggestion' }
          );
        }
      } else if (msg.includes('lock') || msg.includes('step')) {
        if (lockedSteps.length === 0) {
          addChatMessage('assistant',
            `Once you have a successful test, click the 🔒 Lock button to save that step!\n\n` +
            `I'll extract variables automatically and suggest the next step.`,
            { type: 'suggestion' }
          );
        } else {
          addChatMessage('assistant',
            `Excellent progress! You've locked ${lockedSteps.length} step(s).\n\n` +
            `Variables extracted: ${Object.keys(getAllAvailableVariables(lockedSteps)).join(', ')}\n\n` +
            `Continue testing and locking steps to complete your workflow!`,
            { type: 'success' }
          );
        }
      } else {
        // Default response - analyze current state
        const state = {
          hasGoal: userGoal.trim().length > 0,
          hasEndpoints: endpoints.length > 0,
          hasLockedSteps: lockedSteps.length > 0,
          hasTest: testResult !== null,
        };

        let response = `Let me help you with that!\n\n`;
        
        if (!state.hasGoal) {
          response += `📝 Start by defining your goal in the Goal field above.\n`;
        } else if (!state.hasEndpoints) {
          response += `🌐 Launch the browser to capture API traffic.\n`;
        } else if (!state.hasTest) {
          response += `🎯 Select an endpoint and test it.\n`;
        } else if (!state.hasLockedSteps) {
          response += `🔒 Lock your successful test as Step 1.\n`;
        } else {
          response += `🚀 Great! Keep testing and locking steps to complete your workflow.\n\n`;
          response += `Type "help" to see all the things I can do!`;
        }

        addChatMessage('assistant', response, { type: 'suggestion' });
        }
      } catch (err) {
      addChatMessage('assistant', `Sorry, I encountered an error. Please try again!`, { type: 'warning' });
    } finally {
      setChatProcessing(false);
    }
  };

  useEffect(() => {
    if (aiAgentActive && endpoints.length > 0 && aiAgentStatus === 'idle') {
      runAiAnalysis();
    }
  }, [aiAgentActive, endpoints.length, aiAgentStatus]);

  // Auto-generate code when endpoint is selected
  useEffect(() => {
    if (selectedEndpoint) {
      const code = snippetLang === 'curl' ? generateCurl(selectedEndpoint) :
                   snippetLang === 'fetch' ? generateFetch(selectedEndpoint) :
                   snippetLang === 'axios' ? generateAxios(selectedEndpoint) :
                   generatePython(selectedEndpoint);
      setCurrentCode(code);
      setTestResult(null); // Clear previous test result
      setSuccessValidation(null);
    }
  }, [selectedEndpoint, snippetLang]);

  // Keyword analysis when goal changes
  useEffect(() => {
    if (userGoal.trim()) {
      const analysis = analyzeKeywords(userGoal, userConstraints, targetData);
      setKeywordAnalysis(analysis);
      
      // Find matching scenarios
      const matches = findMatchingScenarios(userGoal, targetData);
      setSuggestedScenarios(matches);
    } else {
      setKeywordAnalysis(null);
      setSuggestedScenarios([]);
    }
  }, [userGoal, userConstraints, targetData]);

  // Update contextual hints based on current state
  useEffect(() => {
    const hints = getContextualHints({
      hasGoal: userGoal.trim().length > 0,
      hasConstraints: userConstraints.trim().length > 0,
      hasTarget: targetData.trim().length > 0,
      hasEndpoints: endpoints.length > 0,
      lockedStepsCount: lockedSteps.length,
    });
    setContextualHints(hints);
  }, [userGoal, userConstraints, targetData, endpoints.length, lockedSteps.length]);

  // Listen for flipbook snapshots from Electron
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleFlipbookSnapshot = (_event: any, payload: any) => {
      if (payload?.snapshot) {
        console.log('[Neuromap] Flipbook snapshot received:', payload.snapshot.id);
        
        setFlipbookSnapshots(prev => [...prev, payload.snapshot]);
        setFlipbookSessionId(payload.sessionId);

        // Store snapshot via API
        fetch('/api/flipbook/store', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(err => console.error('[Neuromap] Failed to store snapshot:', err));
      }
    };

    // @ts-ignore - Electron API
    window.electron?.on?.('dom-flipbook-snapshot', handleFlipbookSnapshot);

    return () => {
      // @ts-ignore
      window.electron?.off?.('dom-flipbook-snapshot', handleFlipbookSnapshot);
    };
  }, []);

  // Track endpoints captured
  useEffect(() => {
    if (endpoints.length > 0 && agentState.currentPhase === 'capture') {
      const newState = updateAgentState(agentState, {
        phase: 'capture',
        action: `Captured ${endpoints.length} endpoints`,
        outcome: 'success'
      });
      newState.currentPhase = 'test';
      newState.goalsAchieved.push(`${endpoints.length} endpoints captured`);
      newState.currentObjective = getNextObjective(newState);
      newState.nextAction = 'Get user to test suggested endpoint';
      newState.certaintyLevels.system = 90;
      setAgentState(newState);

      // AUTO-MESSAGE: Traffic captured
      if (endpoints.length >= 3) {
        addChatMessage('assistant',
          `✅ **Traffic captured!** ${endpoints.length} endpoints detected.\n\n` +
          `${showOnlyRelevant ? `Smart filter active: Showing most relevant endpoints.\n\n` : `💡 Enable "Smart Filter" to see only relevant endpoints.\n\n`}` +
          `**Next:** Select an endpoint from the list and I'll generate test code automatically.`,
          { type: 'success' }
        );
      }
    }
  }, [endpoints.length]);

  // Send welcome message on mount
  useEffect(() => {
    if (chatMessages.length === 0) {
      // Initial welcome message
      addChatMessage('assistant',
        `**Specify your goal.**`,
        { type: 'suggestion' }
      );
      
      // Add best practices note
      setTimeout(() => {
        addChatMessage('assistant',
          `💡 **Best Practices:**\n\n` +
          `✓ Be specific: "Get all products" → "Get all products with prices and stock"\n` +
          `✓ Use action verbs: "Get", "Fetch", "Search", "List", "Create"\n` +
          `✓ Mention key data: Include what fields you need\n` +
          `✓ Keep it simple: One sentence is enough\n\n` +
          `**Examples:**\n` +
          `• "Get all products with prices and inventory"\n` +
          `• "Fetch user profile including email and bio"\n` +
          `• "Search orders from the last 30 days"`,
          { type: 'suggestion' }
        );
      }, 500);
    }
  }, []);

  useEffect(() => {
    if (aiSuggestedStep) {
      addChatMessage('assistant',
        `🎯 **Suggested Step ${aiSuggestedStep.stepNumber}**\n\n` +
        `${aiSuggestedStep.method} ${aiSuggestedStep.endpoint}\n\n` +
        `*Why?* ${aiSuggestedStep.reason}\n\n` +
        `Confidence: ${Math.round((aiSuggestedStep.confidence || 0) * 100)}%`,
        { type: 'suggestion' }
      );
    }
  }, [aiSuggestedStep]);

  useEffect(() => {
    if (testResult) {
      if (testResult.success) {
        // Update agent state - TEST SUCCESS
        const newState = updateAgentState(agentState, {
          phase: 'test',
          action: 'Test succeeded',
          outcome: 'success'
        });
        newState.currentPhase = 'lock';
        newState.currentObjective = getNextObjective(newState);
        newState.nextAction = 'Get user to lock this successful step';
        newState.certaintyLevels.workflow = Math.min(100, newState.certaintyLevels.workflow + 15);
        setAgentState(newState);

        // STRAIGHT LINE: Show certainty, make locking the obvious next action
        const matchScore = successValidation ? Math.round(successValidation.score * 100) : null;
        addChatMessage('assistant',
          `✅ **Test Successful!** (${testResult.status} ${testResult.statusText})\n\n` +
          `${matchScore ? `📊 Match score: **${matchScore}%** ${matchScore >= 80 ? '🎯' : ''}\n` : ''}` +
          `${successValidation?.matches ? `✓ Found: ${successValidation.matches.join(', ')}\n` : ''}` +
          `\n**Ready to lock Step ${currentStepFocus}?**\n\n` +
          `Locking this step will:\n` +
          `• Save it to your workflow\n` +
          `• Extract variables automatically\n` +
          `• Let me suggest the next step`,
          { type: 'success' }
        );
      } else {
        // Update agent state - TEST FAILED (but this is learning!)
        const newState = updateAgentState(agentState, {
          phase: 'test',
          action: `Test failed: ${testResult.status || 'error'}`,
          outcome: 'failed'
        });
        newState.blockers.push(`Test failed: ${testResult.error || testResult.status}`);
        setAgentState(newState);

        // STRAIGHT LINE: Failed test is a learning opportunity
        let response = `⚠️ **Test returned ${testResult.status || 'error'}**\n\n`;
        
        // Handle common failures
        if (testResult.status === 401 || testResult.status === 403) {
          response += `This means **authentication is required**.\n\n`;
          response += `I'm looking at the captured traffic for auth endpoints...\n\n`;
          const authEndpoints = endpoints.filter(ep => 
            ep.path.toLowerCase().includes('auth') || 
            ep.path.toLowerCase().includes('login') ||
            ep.method === 'POST' && ep.path.includes('token')
          );
          if (authEndpoints.length > 0) {
            response += `✓ Found ${authEndpoints.length} potential auth endpoint(s).\n\n`;
            response += `**Suggestion:** Test "${authEndpoints[0].method} ${authEndpoints[0].path}" first to get credentials.`;
          } else {
            response += `Try browsing to the login page to capture the auth endpoint.`;
          }
        } else if (testResult.status === 404) {
          response += `Endpoint not found. The URL might be incorrect or may require parameters.`;
        } else if (testResult.status === 429) {
          response += `**Rate limit hit.** Wait a moment and try again.`;
        } else {
          response += `${testResult.error || 'The request did not succeed.'}\n\n`;
          response += `Try a different endpoint or check the captured traffic for clues.`;
        }

        addChatMessage('assistant', response, { type: 'warning' });
      }
    }
  }, [testResult]);

  // Smart endpoint filtering by relevance
  const filteredEndpointsByRelevance = useMemo(() => {
    if (!showOnlyRelevant || !keywordAnalysis) {
      return endpoints;
    }
    
    const scored = endpoints.map(ep => ({
      endpoint: ep,
      relevance: scoreEndpointRelevance(ep.path, ep.method, keywordAnalysis),
    }));
    
    // Filter to only show relevant (score > 0.3)
    return scored
      .filter(s => s.relevance > 0.3)
      .sort((a, b) => b.relevance - a.relevance)
      .map(s => s.endpoint);
  }, [endpoints, showOnlyRelevant, keywordAnalysis]);

  // Test code snippet
  const executeCode = async () => {
    if (!currentCode || !selectedEndpoint) return;
    
    setTestLoading(true);
    setTestResult(null);
    setSuccessValidation(null);
    
    try {
      const variables = getAllAvailableVariables(lockedSteps);
      
      const response = await fetch('/api/execute-snippet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: currentCode,
          language: snippetLang,
          variables: variables,
        }),
      });

      const data = await response.json();

      if (data.ok && data.result) {
        setTestResult(data.result);
        
        // Validate against target data if provided
        if (data.result.success && targetData.trim()) {
          const validation = validateResponse(data.result.body, targetData);
          setSuccessValidation(validation);
          
          // If validation fails, suggest improvements
          if (!validation.isValid && validation.score < 0.5) {
            const improved = suggestImprovedTarget(data.result.body, targetData);
            if (improved) {
              validation.suggestions.push(`Consider updating target to: ${improved}`);
            }
          }
        }
        
        // Observe pattern (send to AI)
        await observePattern({
          type: data.result.success ? 'test_success' : 'test_failure',
          details: {
            endpoint: selectedEndpoint.path,
            method: selectedEndpoint.method,
            status: data.result.status,
            response: data.result.body,
          }
        });
      } else {
        setTestResult({
          success: false,
          status: 0,
          statusText: 'Execution Error',
          headers: {},
          body: null,
          error: data.error || 'Unknown error',
        });
      }
    } catch (err) {
      setTestResult({
        success: false,
        status: 0,
        statusText: 'Error',
        headers: {},
        body: null,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setTestLoading(false);
    }
  };

  // Lock current step
  const lockCurrentStep = () => {
    if (!testResult || !testResult.success || !selectedEndpoint) return;
    
    // Use SMART variable extraction
    const extractedVars = extractSmartVariables(testResult.body);
    const dependencies = findDependencies(currentCode, lockedSteps);
    
    const newStep: LockedStep = {
      id: `step-${currentStepFocus}`,
      stepNumber: currentStepFocus,
      endpoint: selectedEndpoint.path,
      method: selectedEndpoint.method,
      code: currentCode,
      response: testResult.body,
      extractedVars: extractedVars,
      dependencies: dependencies,
      lockedAt: Date.now(),
      status: 'success',
    };
    
    setLockedSteps(prev => [...prev, newStep]);
    const nextStepNum = currentStepFocus + 1;
    setCurrentStepFocus(nextStepNum);
    
    // Update agent state - STEP LOCKED!
    const newState = updateAgentState(agentState, {
      phase: 'lock',
      action: `Step ${currentStepFocus} locked`,
      outcome: 'success'
    });
    newState.currentPhase = 'test';
    newState.goalsAchieved.push(`Step ${currentStepFocus} locked`);
    newState.currentObjective = `Lock Step ${nextStepNum}`;
    newState.nextAction = 'Suggest and test next endpoint';
    newState.certaintyLevels.workflow = Math.min(100, newState.certaintyLevels.workflow + 10);
    newState.userConfidence = Math.min(100, newState.userConfidence + 10);
    newState.blockers = []; // Clear blockers on success
    setAgentState(newState);

    // STRAIGHT LINE: Celebrate progress, show value, direct to next action
    const varCount = Object.keys(extractedVars).length;
    let response = `🎉 **Step ${currentStepFocus} Locked!**\n\n`;
    response += `✓ ${selectedEndpoint.method} ${selectedEndpoint.path}\n`;
    if (varCount > 0) {
      response += `✓ Extracted ${varCount} variable${varCount > 1 ? 's' : ''}: ${Object.keys(extractedVars).join(', ')}\n`;
    }
    if (dependencies.length > 0) {
      response += `✓ Uses: ${dependencies.join(', ')}\n`;
    }
    response += `\n📊 **Progress:** ${lockedSteps.length + 1} step${lockedSteps.length + 1 > 1 ? 's' : ''} in your workflow\n\n`;
    
    // ABC: Always suggest next action
    if (aiAgentActive) {
      response += `**Analyzing next step...**\n\nI'll suggest the best endpoint to test next.`;
      setAiAgentStatus('idle'); // Trigger AI re-analysis
    } else {
      response += `**Next:** Select another endpoint to test, or activate the AI Agent for smart suggestions.`;
    }

    addChatMessage('assistant', response, { type: 'success' });
    
    // Clear current test
    setTestResult(null);
    setSuccessValidation(null);
    setSelectedEndpoint(null);
    setCurrentCode('');
  };

  // Send observation to AI
  const observePattern = async (event: { type: string; details: any }) => {
    try {
      const response = await fetch('/api/ai/observe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event,
          context: {
            currentStep: currentStepFocus,
            lockedSteps: lockedSteps,
            goal: userGoal,
          },
          timeline: [] // Could track full timeline if needed
        }),
      });

      const data = await response.json();

      if (data.ok && data.observation && data.observation.isSignificant) {
        const newInsight: AIInsight = {
          id: `insight-${Date.now()}`,
          ...data.observation,
          dismissed: false,
        };
        setAiInsightsList(prev => [...prev, newInsight]);
      }
    } catch (err) {
      console.error('[AI Observe] Error:', err);
    }
  };

  // Generate complete workflow plan
  const generateWorkflowPlan = async () => {
    if (!userGoal.trim() || endpoints.length === 0) return;
    
    setPlanningWorkflow(true);
    setWorkflowPlan(null);
    
    try {
      const response = await fetch('/api/ai/plan-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: userGoal,
          constraints: userConstraints,
          targetData: targetData,
          endpoints: endpoints.map(ep => ({
            method: ep.method,
            host: ep.host,
            path: ep.path,
            hasAuth: ep.hasAuth,
            count: ep.count,
          })),
        }),
      });

      const data = await response.json();

      if (data.ok && data.plan) {
        setWorkflowPlan(data.plan);
      }
    } catch (err) {
      console.error('[Workflow Plan] Error:', err);
    } finally {
      setPlanningWorkflow(false);
    }
  };

  // Analyze DOM Flipbook with AI
  const analyzeFlipbook = async () => {
    if (!flipbookSessionId || flipbookSnapshots.length === 0) {
      addChatMessage('assistant',
        '⚠️ No flipbook snapshots available. Browse the target site first to capture DOM snapshots.',
        { type: 'warning' }
      );
      return;
    }

    setAnalyzingFlipbook(true);
    addChatMessage('assistant',
      `🔍 Analyzing ${flipbookSnapshots.length} DOM snapshot${flipbookSnapshots.length > 1 ? 's' : ''}...\n\n` +
      `This will help me understand:\n` +
      `• Page structure and navigation patterns\n` +
      `• Where your target data is located\n` +
      `• Optimal automation workflow\n` +
      `• Playwright code for seamless navigation`,
      { type: 'suggestion' }
    );

    try {
      const response = await fetch('/api/ai/analyze-dom-flipbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: flipbookSessionId,
          goal: userGoal,
          targetData: targetData,
        }),
      });

      const data = await response.json();

      if (data.ok && data.analysis) {
        setFlipbookAnalysis(data.analysis);

        const analysis = data.analysis;
        let message = `✅ **DOM Analysis Complete**\n\n`;

        if (analysis.navigationPattern) {
          message += `**Navigation**: ${analysis.navigationPattern.type}\n`;
          message += `${analysis.navigationPattern.details}\n\n`;
        }

        if (analysis.contentStructure) {
          message += `**Content Located**: ${analysis.contentStructure.selector}\n\n`;
        }

        if (analysis.workflowSteps && Array.isArray(analysis.workflowSteps)) {
          message += `**Workflow Steps** (${analysis.workflowSteps.length}):\n`;
          analysis.workflowSteps.slice(0, 3).forEach((step: any) => {
            message += `${step.step}. ${step.action}\n`;
          });
          if (analysis.workflowSteps.length > 3) {
            message += `... and ${analysis.workflowSteps.length - 3} more steps\n`;
          }
          message += `\n`;
        }

        if (analysis.confidence) {
          message += `**Confidence**: ${analysis.confidence}%\n\n`;
        }

        if (analysis.playwrightCode) {
          message += `**Playwright Code Generated** ✓\n\n`;
          message += `I can now:\n`;
          message += `• Auto-navigate through pages\n`;
          message += `• Extract data with precise selectors\n` +
          `• Handle pagination automatically`;
        }

        addChatMessage('assistant', message, { type: 'success' });

        // Update agent state
        const newState = updateAgentState(agentState, {
          phase: agentState.currentPhase,
          action: 'DOM flipbook analyzed',
          outcome: 'success',
        });
        newState.certaintyLevels.workflow = Math.min(100, newState.certaintyLevels.workflow + 20);
        newState.certaintyLevels.system = Math.min(100, newState.certaintyLevels.system + 15);
        newState.goalsAchieved.push('DOM structure mapped');
        setAgentState(newState);
      } else {
        throw new Error(data.error || 'Analysis failed');
      }
    } catch (err) {
      console.error('[Neuromap] Flipbook analysis error:', err);
      addChatMessage('assistant',
        `❌ Analysis failed: ${err instanceof Error ? err.message : String(err)}`,
        { type: 'warning' }
      );
    } finally {
      setAnalyzingFlipbook(false);
    }
  };

  // ════════════════════════════════════════════════════════════════════
  // MODE #1: FULL MAP HANDLERS
  // ════════════════════════════════════════════════════════════════════

  /**
   * Generate button map from DOM snapshots and network events
   * Memoized with useCallback to prevent unnecessary re-creation
   */
  const generateFullButtonMap = useCallback(async () => {
    if (flipbookSnapshots.length === 0) {
      addChatMessage('assistant',
        '⚠️ No DOM snapshots available. Launch browser and interact with the site to capture form elements.',
        { type: 'warning' }
      );
      return;
    }

    if (!flipbookSessionId) {
      addChatMessage('assistant',
        '⚠️ No session ID available. Please reload the page.',
        { type: 'warning' }
      );
      return;
    }

    setGeneratingButtonMap(true);
    addChatMessage('assistant',
      `🗺️ Generating Full Map from ${flipbookSnapshots.length} snapshot${flipbookSnapshots.length > 1 ? 's' : ''}...\n\n` +
      `Mapping:\n` +
      `• All buttons, forms, and interactive elements\n` +
      `• Form state (VIEWSTATE, EVENTVALIDATION)\n` +
      `• Element → Endpoint correlations\n` +
      `• Sequential dependencies`,
      { type: 'suggestion' }
    );

    try {
      // Convert endpoints to array format needed by API
      const networkEvents = endpoints.map(ep => ({
        ts: ep.lastSeen,
        method: ep.method,
        url: ep.sampleUrl,
        path: ep.path,
        reqBodyText: ep.sampleReqBody,
        reqHeaders: ep.sampleHeaders
      }));

      // Call API to generate button map
      const response = await fetch('/api/fullmap/generate-button-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: flipbookSessionId,
          networkEvents
        })
      });

      const data = await response.json();

      if (!data.ok || !data.buttonMap) {
        throw new Error(data.error || 'Failed to generate button map');
      }

      const map = data.buttonMap;
      setButtonMap(map);

      let message = `✅ **Full Map Complete**\n\n`;
      message += `📊 **Summary**:\n`;
      message += `• Total Interactive Elements: ${map.totalButtons}\n`;
      message += `• Mapped to Endpoints: ${map.mappedButtons} (${Math.round((map.mappedButtons / map.totalButtons) * 100)}%)\n`;
      message += `• Unmapped: ${map.unmappedButtons}\n\n`;

      if (map.mappedButtons > 0) {
        message += `**Mapped Elements**:\n`;
        map.buttons.slice(0, 5).forEach((btn: any) => {
          if (btn.endpoint) {
            message += `• **${btn.text || btn.id}** (${btn.type}) → ${btn.method} ${btn.endpoint}\n`;
            if (btn.formState?.viewstate) {
              message += `  └─ Form state detected ✓\n`;
            }
          }
        });
        if (map.mappedButtons > 5) {
          message += `... and ${map.mappedButtons - 5} more mapped elements\n`;
        }
        message += `\n`;
        message += `🎯 Ready to build auto-quote workflow!`;
      } else {
        message += `⚠️ No elements mapped yet. Try interacting with the site (click buttons, submit forms) to capture more data.`;
      }

      addChatMessage('assistant', message, { type: 'success' });

      // Update agent state
      const newState = updateAgentState(agentState, {
        phase: 'execution',
        action: 'Full button map generated',
        outcome: 'success',
      });
      newState.certaintyLevels.workflow = Math.min(100, newState.certaintyLevels.workflow + 25);
      newState.goalsAchieved.push('All buttons mapped to endpoints');
      setAgentState(newState);

    } catch (err) {
      console.error('[FullMap] Button map generation error:', err);
      
      let errorMessage = '❌ Failed to generate button map\n\n';
      
      if (err instanceof Error) {
        if (err.message.includes('Failed to load DOM snapshots')) {
          errorMessage += '**Issue**: Could not load DOM snapshots from session\n';
          errorMessage += '**Solution**: Try launching the browser and browsing the site again to capture fresh snapshots.';
        } else if (err.message.includes('No snapshots found')) {
          errorMessage += '**Issue**: No DOM snapshots available\n';
          errorMessage += '**Solution**: Navigate through the site in the launched browser to capture form interactions.';
        } else if (err.message.includes('network')) {
          errorMessage += '**Issue**: Network request failed\n';
          errorMessage += '**Solution**: Check your connection and try again.';
        } else {
          errorMessage += `**Error**: ${err.message}\n`;
          errorMessage += '**Solution**: Please check the console for details or try again.';
        }
      } else {
        errorMessage += `**Error**: ${String(err)}\n`;
        errorMessage += '**Solution**: Please try again or contact support if the issue persists.';
      }
      
      addChatMessage('assistant', errorMessage, { type: 'warning' });
    } finally {
      setGeneratingButtonMap(false);
    }
  }, [flipbookSnapshots, flipbookSessionId, endpoints, agentState, addChatMessage]);

  /**
   * Validate locked steps 2x in sequence (Mode #1 requirement)
   * Memoized with useCallback to prevent unnecessary re-creation
   */
  const validateWorkflow2x = useCallback(async () => {
    if (lockedSteps.length === 0) {
      addChatMessage('assistant',
        '⚠️ No steps locked yet. Lock at least one step before validation.',
        { type: 'warning' }
      );
      return;
    }

    setValidating(true);
    addChatMessage('assistant',
      `🔄 Validating workflow (2x in sequence)...\n\n` +
      `Testing ${lockedSteps.length} step${lockedSteps.length > 1 ? 's' : ''}:\n` +
      lockedSteps.map(s => `• Step ${s.stepNumber}: ${s.method} ${s.endpoint}`).join('\n'),
      { type: 'suggestion' }
    );

    try {
      // Call API to validate workflow
      const response = await fetch('/api/fullmap/validate-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          steps: lockedSteps,
          mode: 'sequential',
          numAttempts: 2,
          sessionId: flipbookSessionId
        })
      });

      const data = await response.json();

      if (!data.ok || !data.result) {
        throw new Error(data.error || 'Validation failed');
      }

      const result = data.result;
      setValidationResult(result);

      let message = result.allPassed 
        ? `✅ **Validation Passed** (2/2 attempts successful)\n\n`
        : `⚠️ **Validation Failed**\n\n`;

      message += `📊 **Results**:\n`;
      message += `• Success Rate: ${Math.round(result.reliability * 100)}%\n`;
      message += `• Avg Response Time: ${Math.round(result.averageResponseTime)}ms\n`;
      message += `• Total Tests: ${result.totalAttempts}\n`;
      message += `• Passed: ${result.successfulAttempts}\n`;
      message += `• Failed: ${result.failedAttempts}\n\n`;

      result.steps.forEach((step: { stepNumber: number; passRate: number; attempts: ValidationResult[] }) => {
        const icon = step.passRate === 1 ? '✓' : step.passRate > 0.5 ? '⚠' : '✗';
        message += `${icon} **Step ${step.stepNumber}**: ${Math.round(step.passRate * 100)}% pass rate\n`;
        
        // Show attempt details
        step.attempts.forEach((attempt: ValidationResult) => {
          const status = attempt.success ? '✓' : '✗';
          message += `  ${status} Attempt ${attempt.attempt}: ${attempt.statusCode} (${attempt.responseTime}ms)`;
          if (attempt.error) {
            message += ` - ${attempt.error}`;
          }
          if (attempt.formStateUpdated) {
            message += ` [Form state updated]`;
          }
          message += `\n`;
        });
      });

      if (result.allPassed) {
        message += `\n🎯 **Workflow Ready**\n`;
        message += `All steps validated successfully. This workflow can run automatically and persist indefinitely.`;
      } else {
        message += `\n❌ **Action Required**\n`;
        message += `Some steps failed. Review the failures above and adjust the workflow.`;
      }

      addChatMessage('assistant', message, { 
        type: result.allPassed ? 'success' : 'warning' 
      });

      // Update agent state
      if (result.allPassed) {
        const newState = updateAgentState(agentState, {
          phase: 'completion',
          action: 'Workflow validated 2x',
          outcome: 'success',
        });
        newState.certaintyLevels.workflow = 100;
        newState.certaintyLevels.system = 100;
        newState.goalsAchieved.push('Workflow can persist indefinitely');
        setAgentState(newState);
      }

    } catch (err) {
      console.error('[FullMap] Validation error:', err);
      
      let errorMessage = '❌ Workflow validation failed\n\n';
      
      if (err instanceof Error) {
        if (err.message.includes('timeout') || err.message.includes('timed out')) {
          errorMessage += '**Issue**: Request timed out\n';
          errorMessage += '**Solution**: The endpoint may be slow or unreachable. Check the endpoint URL and try again.';
        } else if (err.message.includes('network') || err.message.includes('fetch')) {
          errorMessage += '**Issue**: Network connection failed\n';
          errorMessage += '**Solution**: Check your internet connection and verify the endpoint is accessible.';
        } else if (err.message.includes('auth') || err.message.includes('401')) {
          errorMessage += '**Issue**: Authentication failed\n';
          errorMessage += '**Solution**: The session may have expired. Try refreshing your cookies or logging in again.';
        } else if (err.message.includes('CORS')) {
          errorMessage += '**Issue**: CORS policy blocked the request\n';
          errorMessage += '**Solution**: The endpoint needs to allow cross-origin requests. This is a server configuration issue.';
        } else {
          errorMessage += `**Error**: ${err.message}\n`;
          errorMessage += '**Solution**: Check the error details above and adjust your workflow steps.';
        }
      } else {
        errorMessage += `**Error**: ${String(err)}\n`;
        errorMessage += '**Solution**: An unexpected error occurred. Please try again.';
      }
      
      addChatMessage('assistant', errorMessage, { type: 'warning' });
    } finally {
      setValidating(false);
    }
  }, [lockedSteps, flipbookSessionId, agentState, addChatMessage]);

  /**
   * Test multiple states to detect form variations
   * Mode #1 feature for multi-state applications (quote builders, etc.)
   */
  const testMultipleStates = useCallback(async () => {
    if (!flipbookSessionId) {
      addChatMessage('assistant',
        '⚠️ No session ID available. Please reload the page.',
        { type: 'warning' }
      );
      return;
    }

    if (stateTestCases.length < 2) {
      addChatMessage('assistant',
        '⚠️ At least 2 states required for comparison. Add more test cases below.',
        { type: 'warning' }
      );
      return;
    }

    setTestingStates(true);
    addChatMessage('assistant',
      `🔍 Testing ${stateTestCases.length} states for form variations...\n\n` +
      `States to test:\n` +
      stateTestCases.map(tc => `• ${tc.state} (${tc.zipcode}) - ${tc.description || 'No description'}`).join('\n') +
      `\n\n⏳ This will compare form structures across all states...`,
      { type: 'suggestion' }
    );

    try {
      // Call API to test states
      const response = await fetch('/api/fullmap/test-states', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: flipbookSessionId,
          testCases: stateTestCases
        })
      });

      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.error || 'Failed to test states');
      }

      const { variantMap, adaptiveWorkflow, validationResults, summary } = data;
      setStateVariantMap({ variantMap, adaptiveWorkflow, validationResults });

      // Build detailed message
      let message = `✅ **Multi-State Analysis Complete**\n\n`;
      message += `📊 **Summary**:\n`;
      message += `• States Tested: ${summary.testedStates.join(', ')}\n`;
      message += `• Total Variations: ${summary.totalVariations}\n`;
      message += `• Critical Variations: ${summary.criticalVariations}\n`;
      message += `• Adaptation Strategy: ${summary.adaptationStrategy.replace('_', ' ').toUpperCase()}\n`;
      message += `• Average Coverage: ${Math.round(summary.averageCoverage * 100)}%\n\n`;

      if (summary.criticalVariations > 0) {
        message += `**⚠️ Critical Variations Detected**:\n`;
        variantMap.variations
          .filter((v: any) => v.impact === 'critical')
          .slice(0, 3)
          .forEach((v: any) => {
            message += `• **${v.field}** (${v.type.replace('_', ' ')})\n`;
            Object.entries(v.states).forEach(([state, value]: [string, any]) => {
              if (v.type === 'dropdown_options' && Array.isArray(value)) {
                message += `  └─ ${state}: ${value.length} options\n`;
              } else {
                message += `  └─ ${state}: ${value}\n`;
              }
            });
          });
        if (variantMap.variations.filter((v: any) => v.impact === 'critical').length > 3) {
          message += `... and ${variantMap.variations.filter((v: any) => v.impact === 'critical').length - 3} more critical variations\n`;
        }
        message += `\n`;
      }

      message += `**🎯 Adaptation Strategy**: ${summary.adaptationStrategy}\n`;
      if (summary.adaptationStrategy === 'parameterized') {
        message += `→ Simple: Pass state parameter, forms are mostly consistent\n`;
      } else if (summary.adaptationStrategy === 'conditional') {
        message += `→ Medium: Use if/else logic for state-specific options\n`;
      } else {
        message += `→ Complex: Requires separate workflows per state\n`;
      }

      message += `\n**Per-State Validation**:\n`;
      validationResults.forEach((result: any) => {
        const icon = result.valid ? '✓' : '⚠';
        message += `${icon} **${result.state}**: ${Math.round(result.coverage * 100)}% coverage`;
        if (!result.valid) {
          message += ` (${result.missingFields.length} missing fields)`;
        }
        message += `\n`;
      });

      message += `\n🎯 Ready to build adaptive workflow! The system understands state differences.`;

      addChatMessage('assistant', message, { type: 'success' });

      // Update agent state
      const newState = updateAgentState(agentState, {
        phase: 'analysis',
        action: 'Multi-state variation detected',
        outcome: 'success',
      });
      newState.certaintyLevels.workflow = Math.min(100, newState.certaintyLevels.workflow + 20);
      newState.goalsAchieved.push(`Mapped variations across ${summary.testedStates.length} states`);
      setAgentState(newState);

    } catch (err) {
      console.error('[FullMap] State testing error:', err);
      
      let errorMessage = '❌ Multi-state testing failed\n\n';
      
      if (err instanceof Error) {
        if (err.message.includes('Not enough snapshots')) {
          errorMessage += '**Issue**: Not enough DOM snapshots captured\n';
          errorMessage += '**Solution**: For each state, enter the zipcode in the browser and capture a snapshot before running multi-state test.';
        } else if (err.message.includes('At least 2 test cases')) {
          errorMessage += '**Issue**: Need at least 2 states for comparison\n';
          errorMessage += '**Solution**: Add more test cases below (different zipcodes representing different states).';
        } else {
          errorMessage += `**Error**: ${err.message}\n`;
          errorMessage += '**Solution**: Check the console for details or try again.';
        }
      } else {
        errorMessage += `**Error**: ${String(err)}\n`;
        errorMessage += '**Solution**: An unexpected error occurred. Please try again.';
      }
      
      addChatMessage('assistant', errorMessage, { type: 'warning' });
    } finally {
      setTestingStates(false);
    }
  }, [flipbookSessionId, stateTestCases, agentState, addChatMessage]);

  /**
   * Discover APIs - PRIORITY 1
   * Analyzes network traffic to find direct API calls (bypass form automation)
   */
  const discoverBackendAPIs = useCallback(async () => {
    if (endpoints.length === 0) {
      addChatMessage('assistant',
        '⚠️ No network traffic captured yet. Launch browser and interact with the site to capture API calls.',
        { type: 'warning' }
      );
      return;
    }

    setDiscoveringAPIs(true);
    addChatMessage('assistant',
      `🔍 **PRIORITY 1: Discovering Backend APIs**\n\n` +
      `Analyzing ${endpoints.length} network requests...\n\n` +
      `Looking for:\n` +
      `• Direct API endpoints (JSON, REST, GraphQL)\n` +
      `• Backend calls that bypass form UI\n` +
      `• Authentication methods (cookies, tokens)\n\n` +
      `⏳ This will determine if you need form automation or can call APIs directly...`,
      { type: 'suggestion' }
    );

    try {
      // Convert endpoints to network events format
      const networkEvents = endpoints.map(ep => ({
        ts: ep.lastSeen,
        method: ep.method,
        url: ep.sampleUrl,
        path: ep.path,
        reqBodyText: ep.sampleReqBody,
        reqHeaders: ep.sampleHeaders,
        resBodyText: ep.sampleResBody,
        status: Object.keys(ep.statuses)[0] ? parseInt(Object.keys(ep.statuses)[0]) : undefined,
        responseTime: undefined
      }));

      // Call API discovery
      const response = await fetch('/api/fullmap/discover-apis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ networkEvents })
      });

      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.error || 'API discovery failed');
      }

      const { discovery, apiCalls, summary, filtering } = data;
      setApiDiscovery({ discovery, apiCalls, summary, filtering });

      // Build detailed message
      let message = `✅ **API Discovery Complete (V2 - 2026 Production Grade)**\n\n`;
      
      // CRITICAL: Show noise filtering results
      message += `🔍 **Traffic Filtering (Full Noise Cancellation)**:\n`;
      message += `• Total Captured: ${filtering.stats.total} requests\n`;
      message += `• **Noise Filtered**: ${filtering.stats.noise} (${filtering.stats.noisePercentage}%) ❌\n`;
      message += `• **Valuable Signals**: ${filtering.stats.valuable} ✓\n`;
      if (filtering.stats.uncertain > 0) {
        message += `• **Uncertain**: ${filtering.stats.uncertain} ⚠️ (needs review)\n`;
      }
      if (filtering.stats.duplicates > 0) {
        message += `• **Duplicates Removed**: ${filtering.stats.duplicates} 🔄\n`;
      }
      
      // Show confidence breakdown
      if (filtering.stats.confidenceLevels) {
        message += `\n**Confidence Breakdown**:\n`;
        if (filtering.stats.confidenceLevels.definite_valuable > 0) {
          message += `• Definite Valuable: ${filtering.stats.confidenceLevels.definite_valuable} ✅✅\n`;
        }
        if (filtering.stats.confidenceLevels.probable_valuable > 0) {
          message += `• Probable Valuable: ${filtering.stats.confidenceLevels.probable_valuable} ✅\n`;
        }
        if (filtering.stats.confidenceLevels.uncertain > 0) {
          message += `• Uncertain: ${filtering.stats.confidenceLevels.uncertain} ⚠️\n`;
        }
        if (filtering.stats.confidenceLevels.probable_noise > 0) {
          message += `• Probable Noise: ${filtering.stats.confidenceLevels.probable_noise} ❌\n`;
        }
        if (filtering.stats.confidenceLevels.definite_noise > 0) {
          message += `• Definite Noise: ${filtering.stats.confidenceLevels.definite_noise} ❌❌\n`;
        }
      }
      
      if (filtering.stats.topNoiseReasons.length > 0) {
        message += `\n**Top Noise Reasons**:\n`;
        filtering.stats.topNoiseReasons.slice(0, 3).forEach((r: any) => {
          message += `• ${r.reason} (${r.count}x)\n`;
        });
      }
      message += `\n`;

      // CRITICAL: Show extracted tokens
      if (filtering.extractedTokens.length > 0) {
        message += `🔐 **Tokens Extracted**: ${filtering.extractedTokens.length}\n`;
        const tokensByType = filtering.extractedTokens.reduce((acc: any, t: any) => {
          acc[t.type] = (acc[t.type] || 0) + 1;
          return acc;
        }, {});
        Object.entries(tokensByType).forEach(([type, count]) => {
          message += `• ${type.toUpperCase()}: ${count}\n`;
        });
        message += `\n`;
      }

      // CRITICAL: Show extracted variables
      if (filtering.extractedVariables.length > 0) {
        message += `🎯 **Dynamic Variables**: ${filtering.extractedVariables.length}\n`;
        const varsByType = filtering.extractedVariables.reduce((acc: any, v: any) => {
          acc[v.type] = (acc[v.type] || 0) + 1;
          return acc;
        }, {});
        Object.entries(varsByType).forEach(([type, count]) => {
          message += `• ${type.toUpperCase()}: ${count}\n`;
        });
        message += `\n`;
      }

      message += `📊 **API Classification**:\n`;
      message += `• Direct APIs Found: ${summary.directAPIs}\n`;
      message += `• Form Endpoints: ${summary.formEndpoints}\n`;
      message += `• API Probability: ${summary.apiCallProbability}%\n`;
      message += `• **Recommendation**: ${summary.recommendation.toUpperCase().replace(/_/g, ' ')}\n\n`;

      if (summary.recommendation === 'use_direct_api') {
        message += `🎯 **EXCELLENT NEWS!** Direct API calls found!\n\n`;
        message += `You can bypass form automation entirely. Found ${summary.directAPIs} direct API endpoint${summary.directAPIs > 1 ? 's' : ''}:\n\n`;

        discovery.directAPIs.slice(0, 3).forEach((api: any, idx: number) => {
          message += `**${idx + 1}. ${api.method} ${api.path}**\n`;
          message += `• Confidence: ${Math.round(api.confidence * 100)}%\n`;
          message += `• Evidence: ${api.evidence.join(', ')}\n`;
          if (api.authentication?.type !== 'none') {
            message += `• Auth: ${api.authentication.type.toUpperCase()}`;
            if (api.authentication.cookieNames) {
              message += ` (${api.authentication.cookieNames.length} cookies)`;
            }
            message += `\n`;
          }
          message += `• Parameters: ${api.parameters.length} detected\n`;
          message += `\n`;
        });

        if (discovery.directAPIs.length > 3) {
          message += `... and ${discovery.directAPIs.length - 3} more API endpoints\n\n`;
        }

        message += `✅ **Next Steps**:\n`;
        message += `1. Review API calls in "Code Snippets" tab\n`;
        message += `2. Test with curl/Postman\n`;
        message += `3. Extract auth cookies if needed\n`;
        message += `4. Build direct API integration (no form needed!)\n`;

      } else if (summary.recommendation === 'hybrid') {
        message += `⚙️ **Hybrid Approach Recommended**\n\n`;
        message += `Found both direct APIs (${summary.directAPIs}) and form endpoints (${summary.formEndpoints}).\n\n`;
        message += `**Strategy**:\n`;
        message += `1. Use direct APIs where available\n`;
        message += `2. Fall back to form automation for remaining steps\n`;
        message += `3. Combine both for optimal workflow\n\n`;

        if (discovery.directAPIs.length > 0) {
          const topAPI = discovery.directAPIs[0];
          message += `**Top API Candidate**: ${topAPI.method} ${topAPI.path} (${Math.round(topAPI.confidence * 100)}% confidence)\n`;
        }

      } else {
        message += `📝 **Form Automation Required**\n\n`;
        message += `No direct API calls detected. The quote system uses form submissions only.\n\n`;
        message += `**Next Steps**:\n`;
        message += `1. Use Mode #1 button mapping\n`;
        message += `2. Extract form state (VIEWSTATE, cookies)\n`;
        message += `3. Build form automation workflow\n`;
        message += `4. Use auth-worker for cookie persistence\n\n`;

        if (discovery.formEndpoints.length > 0) {
          message += `**Form Endpoints Found**: ${discovery.formEndpoints.length}\n`;
          discovery.formEndpoints.slice(0, 2).forEach((form: any) => {
            message += `• ${form.method} ${form.path}\n`;
          });
        }
      }

      addChatMessage('assistant', message, { 
        type: summary.recommendation === 'use_direct_api' ? 'success' : 'suggestion' 
      });

      // Update agent state
      const newState = updateAgentState(agentState, {
        phase: 'discovery',
        action: 'API discovery completed',
        outcome: 'success',
      });
      newState.certaintyLevels.system = summary.recommendation === 'use_direct_api' ? 100 : 70;
      newState.goalsAchieved.push(
        summary.recommendation === 'use_direct_api' 
          ? 'Direct API calls discovered - form automation not needed!'
          : 'Form-based workflow identified'
      );
      setAgentState(newState);

      // If direct APIs found, generate code snippets
      if (apiCalls && apiCalls.length > 0) {
        const topAPI = apiCalls[0];
        // Set curl command as default snippet
        setCurrentCode(topAPI.curlCommand);
        setHasNewCodeSnippet(true);
      }

    } catch (err) {
      console.error('[API Discovery] Error:', err);
      
      let errorMessage = '❌ API discovery failed\n\n';
      
      if (err instanceof Error) {
        errorMessage += `**Error**: ${err.message}\n`;
        errorMessage += '**Solution**: Check the console for details or try capturing more traffic.';
      } else {
        errorMessage += `**Error**: ${String(err)}\n`;
        errorMessage += '**Solution**: An unexpected error occurred. Please try again.';
      }
      
      addChatMessage('assistant', errorMessage, { type: 'warning' });
    } finally {
      setDiscoveringAPIs(false);
    }
  }, [endpoints, agentState, addChatMessage]);

  // Apply scenario template
  const applyScenario = useCallback((scenario: Scenario) => {
    setUserGoal(scenario.goal);
    setUserConstraints(scenario.constraints);
    setTargetData(scenario.targetData);
    setShowScenarios(false);
  }, []);

  // Export workflow
  /**
   * Export complete workflow with all metadata
   * Mode #1 exports include button maps, form state, and validation results
   */
  const exportWorkflow = useCallback(() => {
    const workflow = {
      meta: {
        exportedAt: new Date().toISOString(),
        mode: aiMode,
        version: '2.0.0', // Workflow schema version
      },
      goal: userGoal,
      constraints: userConstraints,
      targetData: targetData,
      keywordAnalysis: keywordAnalysis,
      workflowPlan: workflowPlan,
      steps: lockedSteps.map((step: LockedStep) => ({
        stepNumber: step.stepNumber,
        method: step.method,
        endpoint: step.endpoint,
        code: step.code,
        extractedVars: step.extractedVars,
        dependencies: step.dependencies,
        status: step.status,
        lockedAt: step.lockedAt,
      })),
      flipbook: {
        snapshotCount: flipbookSnapshots.length,
        sessionId: flipbookSessionId,
        analysis: flipbookAnalysis,
      },
      // Mode #1 specific data
      ...(aiMode === 'fullMap' && {
        fullMap: {
          buttonMap: buttonMap ? {
            totalButtons: buttonMap.totalButtons,
            mappedButtons: buttonMap.mappedButtons,
            unmappedButtons: buttonMap.unmappedButtons,
            coverage: buttonMap.coverage,
            buttons: buttonMap.buttons.map((btn: MappedElement) => ({
              id: btn.id,
              type: btn.type,
              text: btn.text,
              endpoint: btn.endpoint,
              method: btn.method,
              xpath: btn.xpath,
              formState: btn.formState ? {
                hasViewState: !!btn.formState.viewstate,
                hasEventValidation: !!btn.formState.eventValidation,
                customFields: Object.keys(btn.formState.customFields || {})
              } : undefined
            })),
            generatedAt: buttonMap.generatedAt,
          } : null,
          validation: validationResult ? {
            allPassed: validationResult.allPassed,
            reliability: validationResult.reliability,
            totalAttempts: validationResult.totalAttempts,
            successfulAttempts: validationResult.successfulAttempts,
            failedAttempts: validationResult.failedAttempts,
            averageResponseTime: validationResult.averageResponseTime,
            steps: validationResult.steps.map((step: { stepNumber: number; passRate: number; attempts: ValidationResult[] }) => ({
              stepNumber: step.stepNumber,
              passRate: step.passRate,
              attemptCount: step.attempts.length,
              allPassed: step.attempts.every(a => a.success),
            })),
          } : null,
          formStateManagement: {
            enabled: true,
            autoExtractViewState: true,
            autoInjectBetweenSteps: true,
          },
        },
      }),
    };

    const blob = new Blob([JSON.stringify(workflow, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const filename = aiMode === 'fullMap' 
      ? `workflow-fullmap-${Date.now()}.json`
      : `workflow-${Date.now()}.json`;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    // Show success message
    addChatMessage('assistant',
      `✅ Workflow exported successfully!\n\n` +
      `**File**: ${filename}\n` +
      `**Steps**: ${lockedSteps.length}\n` +
      `**Mode**: ${aiMode === 'fullMap' ? 'Full Map (Legacy Forms)' : aiMode === 'apiOnly' ? 'API-Only' : 'Mobile Reverse'}\n` +
      (buttonMap ? `**Button Map**: ${buttonMap.mappedButtons}/${buttonMap.totalButtons} elements\n` : '') +
      (validationResult ? `**Validation**: ${validationResult.reliability}% reliability\n` : '') +
      `\nYou can re-import this workflow later to continue where you left off.`,
      { type: 'success' }
    );
  }, [aiMode, userGoal, userConstraints, targetData, keywordAnalysis, workflowPlan, lockedSteps, flipbookSnapshots, flipbookSessionId, flipbookAnalysis, buttonMap, validationResult, addChatMessage]);

  // ═══════════════════════════════════════════════════════════════════
  // KEYBOARD NAVIGATION
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Global keyboard shortcuts for Mode #1
   * - Ctrl/Cmd + M: Toggle control mode
   * - Ctrl/Cmd + B: Generate button map
   * - Ctrl/Cmd + V: Validate workflow
   * - Ctrl/Cmd + E: Export workflow
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + M: Toggle control mode
      if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
        e.preventDefault();
        setControlMode(prev => prev === 'human' ? 'ai' : 'human');
      }

      // Ctrl/Cmd + B: Generate button map (Mode #1 only)
      if ((e.ctrlKey || e.metaKey) && e.key === 'b' && aiMode === 'fullMap' && controlMode === 'ai') {
        e.preventDefault();
        if (!generatingButtonMap && flipbookSnapshots.length > 0) {
          generateFullButtonMap();
        }
      }

      // Ctrl/Cmd + V: Validate workflow (Mode #1 only)
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && aiMode === 'fullMap' && controlMode === 'ai') {
        e.preventDefault();
        if (!validating && lockedSteps.length > 0) {
          validateWorkflow2x();
        }
      }

      // Ctrl/Cmd + E: Export workflow
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        if (lockedSteps.length > 0) {
          exportWorkflow();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [controlMode, aiMode, generatingButtonMap, validating, flipbookSnapshots.length, lockedSteps.length, generateFullButtonMap, validateWorkflow2x, exportWorkflow]);

  // Calculate dynamic width based on chat panel state
  const chatPanelWidth = chatExpanded ? 600 : 400;
  const workspaceWidth = `calc(100% - ${chatPanelWidth}px)`;

  return (
    <div className="w-full flex h-screen" style={{ transform: 'scale(0.7)', transformOrigin: 'top left', width: '142.86%', height: '142.86%' }}>
      {/* Main Workspace */}
      <div 
        className="flex flex-col bg-black border-r border-slate-800 overflow-hidden transition-all duration-300" 
        style={{ 
          width: workspaceWidth, 
          height: '88vh'
        }}
      >
      {/* Header */}
      <div className="shrink-0 bg-gradient-to-r from-slate-900 to-slate-800 border-b border-slate-700/50 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="w-6 h-6 text-red-500" />
          <h2 className="text-lg font-bold text-red-500 font-mono tracking-wide">API SIGNAL PIPELINE</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-2 bg-purple-900/30 border border-purple-600/30 rounded text-xs text-purple-400">
            <MessageSquare className="w-3.5 h-3.5" />
            <span>AI Assistant</span>
            {chatMessages.length > 0 && (
              <span className="px-1.5 py-0.5 bg-purple-600 rounded-full text-xs text-white">
                {chatMessages.length}
              </span>
            )}
          </div>
          {aiInsightsList.filter(i => !i.dismissed).length > 0 && (
            <button
              onClick={() => setInsightsPanelOpen(!insightsPanelOpen)}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-700 rounded text-xs text-white font-medium"
            >
              <Brain className="w-3.5 h-3.5" />
              {aiInsightsList.filter(i => !i.dismissed).length} Insights
            </button>
          )}
          <button
            onClick={handleMarkInteraction}
            className={`flex items-center gap-1.5 px-3 py-2 rounded text-xs font-medium ${
              isMarkingInteraction ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
            }`}
          >
            <MousePointer className="w-3.5 h-3.5" />
            {isMarkingInteraction ? 'Marking...' : 'Mark'}
          </button>
          <button
            onClick={() => setIsPaused(!isPaused)}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded text-xs text-slate-300"
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            {isPaused ? 'Resume' : 'Pause'}
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-700 rounded text-xs text-white"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        </div>
      </div>

      {/* Contextual Hints Banner */}
      {contextualHints.length > 0 && (
        <div className="shrink-0 bg-slate-800/50 border-b border-slate-700/30 px-4 py-2">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-yellow-400" />
            <div className="flex-1 text-xs text-slate-400">
              {contextualHints[0]}
            </div>
          </div>
        </div>
      )}

      {/* AI Insights Panel (Collapsible) */}
      {insightsPanelOpen && aiInsightsList.filter(i => !i.dismissed).length > 0 && (
        <div className="shrink-0 bg-amber-900/20 border-b border-amber-500/30 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-amber-400">AI DISCOVERED REQUIREMENTS</h3>
            </div>
          <button
              onClick={() => setInsightsPanelOpen(false)}
              className="text-slate-500 hover:text-slate-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {aiInsightsList.filter(i => !i.dismissed).map(insight => (
              <div key={insight.id} className="p-3 bg-slate-900 border border-amber-500/20 rounded-lg">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        insight.severity === 'high' ? 'bg-red-900/30 text-red-400' :
                        insight.severity === 'medium' ? 'bg-amber-900/30 text-amber-400' :
                        'bg-slate-700 text-slate-400'
                      }`}>
                        {insight.type.replace('_', ' ').toUpperCase()}
                      </span>
                      <span className="text-xs text-slate-500">Confidence: {Math.round(insight.confidence * 100)}%</span>
                    </div>
                    <div className="text-sm text-slate-300 mb-1">{insight.rule}</div>
                    <div className="text-xs text-slate-500">{insight.suggestion}</div>
                  </div>
                  <button
                    onClick={() => setAiInsightsList(prev => prev.map(i => i.id === insight.id ? {...i, dismissed: true} : i))}
                    className="text-xs text-slate-500 hover:text-slate-300 ml-2"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Target URL Input */}
      <div className="shrink-0 bg-gradient-to-r from-slate-900/50 to-transparent border-b border-slate-700/50 p-4">
        <div className="flex gap-2">
          <input
            type="url"
            value={launchBrowserUrl}
            onChange={(e) => setLaunchBrowserUrl(e.target.value)}
            placeholder="https://example.com"
            className="flex-1 px-4 py-2 bg-slate-900 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-red-500/60"
          />
          <button
            onClick={handleLaunchBrowser}
            disabled={launchBrowserLoading}
            className="flex items-center gap-2 px-6 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg text-sm text-white font-medium transition-all"
          >
            <Monitor className="w-4 h-4" />
            {launchBrowserLoading ? 'Launching...' : 'Launch Browser'}
          </button>
        </div>
        {launchBrowserError && (
          <p className="mt-2 text-red-400 text-xs">{launchBrowserError}</p>
        )}
      </div>

      {/* HUMAN/AI CONTROL TOGGLE */}
      <div 
        className="shrink-0 bg-gradient-to-r from-slate-900/50 to-transparent border-b border-slate-700/50 p-4"
        role="region"
        aria-label="Control Mode Selection"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-medium" id="control-mode-label">
              CONTROL MODE
            </span>
            <div 
              className="flex items-center gap-2 bg-slate-900 rounded-lg p-1"
              role="radiogroup"
              aria-labelledby="control-mode-label"
            >
              <button
                onClick={() => setControlMode('human')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  controlMode === 'human'
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
                role="radio"
                aria-checked={controlMode === 'human'}
                aria-label="Human control mode - Manual workflow building"
                tabIndex={controlMode === 'human' ? 0 : -1}
              >
                <span className="text-base" aria-hidden="true">👤</span>
                <span>HUMAN</span>
              </button>
              <button
                onClick={() => setControlMode('ai')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-red-500 ${
                  controlMode === 'ai'
                    ? 'bg-red-600 text-white shadow-lg'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
                role="radio"
                aria-checked={controlMode === 'ai'}
                aria-label="AI control mode - AI-powered suggestions and analysis"
                tabIndex={controlMode === 'ai' ? 0 : -1}
              >
                <Brain className="w-4 h-4" aria-hidden="true" />
                <span>AI</span>
              </button>
            </div>
          </div>
          <div 
            className="text-xs text-slate-500"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {controlMode === 'human' 
              ? 'Manual workflow building - AI assistance disabled' 
              : 'AI-powered suggestions and analysis enabled'}
          </div>
        </div>
        
        {/* AI MODE SELECTOR - Shows when AI is active */}
        {controlMode === 'ai' && (
          <div 
            className="mt-4 pt-4 border-t border-slate-700/50"
            role="region"
            aria-label="AI Mode Configuration"
          >
            <div className="flex items-center gap-3">
              <label 
                htmlFor="ai-mode-select" 
                className="text-xs text-slate-400 font-medium"
              >
                AI MODE
              </label>
              <select
                id="ai-mode-select"
                value={aiMode}
                onChange={(e) => setAiMode(e.target.value as AIMode)}
                className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700/50 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                aria-describedby="ai-mode-description"
              >
                <option value="fullMap">Mode #1: Full Map (Legacy Forms - No Bot Detection)</option>
                <option value="apiOnly">Mode #2: API-Only (Current)</option>
                <option value="mobileReverse">Mode #3: Mobile App Reverse Engineering</option>
              </select>
            </div>
            <div id="ai-mode-description" className="mt-2 text-xs text-slate-500" role="status" aria-live="polite">
              {aiMode === 'fullMap' && (
                <div className="flex items-start gap-2">
                  <span className="text-green-400">✓</span>
                  <div>
                    <div className="font-medium text-slate-400">Full Map Mode Active</div>
                    <div className="mt-1">
                      • Maps every button/form element → API endpoint<br/>
                      • Extracts form state (VIEWSTATE, EVENTVALIDATION)<br/>
                      • Sequential validation (2x success required)<br/>
                      • Perpetual cookie/session management<br/>
                      • Best for: Legacy .ASPX, PHP, or simple form-based apps
                    </div>
                  </div>
                </div>
              )}
              {aiMode === 'apiOnly' && 'Focus on API endpoints and network traffic only'}
              {aiMode === 'mobileReverse' && 'Reverse engineer mobile app API patterns'}
            </div>
          </div>
        )}
      </div>

      {/* LOCKED PIPELINE - MOVED TO TOP */}
      <div className="shrink-0 bg-gradient-to-r from-green-900/10 to-transparent border-b border-green-600/20 p-4">
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-sm font-bold text-green-400 tracking-wide">LOCKED PIPELINE • {lockedSteps.length} STEPS</h3>
          {lockedSteps.length > 0 && (
            <button 
              onClick={exportWorkflow}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-xs text-white font-medium"
            >
              <Download className="w-3 h-3" />
              Export Workflow
            </button>
          )}
        </div>

        {lockedSteps.length === 0 ? (
          <div className="text-center py-4 text-slate-500 text-sm">
            <div className="text-slate-600 mb-2">No steps locked yet</div>
            <div className="text-xs text-slate-700">Test and lock your first step below to start building your workflow</div>
          </div>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {lockedSteps.map(step => (
              <div key={step.id} className="p-3 bg-slate-900 border border-green-600/30 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-green-400 font-bold text-sm">✓ Step {step.stepNumber}</span>
                    <span className="text-slate-400 text-xs font-mono">{step.method} {step.endpoint}</span>
                    <span className="px-2 py-0.5 bg-green-900/30 text-green-400 text-xs rounded">LOCKED</span>
                  </div>
                  <button 
                    onClick={() => setLockedSteps(prev => prev.filter(s => s.id !== step.id))}
                    className="text-xs text-red-500 hover:text-red-400"
                  >
                    Delete
                  </button>
                </div>
                
                {Object.keys(step.extractedVars).length > 0 && (
                  <div className="text-xs text-slate-500 mb-1">
                    → Variables: {Object.entries(step.extractedVars).map(([k, v]) => 
                      `${k}="${String(v).substring(0, 15)}${String(v).length > 15 ? '...' : ''}"`
                    ).join(', ')}
                  </div>
                )}
                
                {step.dependencies.length > 0 && (
                  <div className="text-xs text-red-400">
                    ⚠ Depends on: {step.dependencies.join(', ')}
                  </div>
                )}
              </div>
            ))}
            
            <div className="p-3 bg-slate-900/50 border border-slate-700 border-dashed rounded-lg">
              <div className="flex items-center gap-2 text-slate-500">
                <span className="text-sm">→ Step {currentStepFocus}:</span>
                <span className="text-xs">{aiAgentStatus === 'analyzing' ? 'AI mapping...' : 'Ready to test'}</span>
              </div>
            </div>
          </div>
        )}

        {/* MODE #1: FULL MAP CONTROLS */}
        {aiMode === 'fullMap' && controlMode === 'ai' && (
          <div 
            className="mt-4 pt-4 border-t border-slate-700/50"
            role="region"
            aria-label="Full Map Mode Controls"
          >
            {/* PRIORITY 1: API DISCOVERY */}
            <div className="mb-4 p-4 bg-gradient-to-r from-red-900/20 to-purple-900/20 border border-red-600/30 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-1 bg-red-600 text-white text-xs font-bold rounded">PRIORITY 1</span>
                <span className="text-xs text-red-400 font-medium">API DISCOVERY</span>
                <span className="text-xs text-slate-600">• Find direct backend APIs (no form needed)</span>
              </div>
              
              <div className="text-xs text-slate-400 mb-3">
                First, check if the system has direct API calls you can use. If found, you won't need form automation!
              </div>

              <button
                onClick={discoverBackendAPIs}
                disabled={discoveringAPIs || endpoints.length === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg text-sm text-white font-medium transition-all focus:outline-none focus:ring-2 focus:ring-red-500"
                aria-label="Discover backend APIs from network traffic"
                aria-busy={discoveringAPIs}
                title={endpoints.length === 0 ? 'Launch browser first to capture API calls' : 'Analyze network traffic to find direct API endpoints'}
              >
                {discoveringAPIs ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    <span>Discovering APIs...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" aria-hidden="true" />
                    <span>Discover Backend APIs</span>
                  </>
                )}
              </button>

              {/* API Discovery Results */}
              {apiDiscovery && (
                <div className="mt-3 space-y-2">
                  {/* Main Result */}
                  <div className="p-3 bg-slate-900 border border-red-600/30 rounded-lg">
                    <div className={`text-xs font-medium mb-2 ${
                      apiDiscovery.summary.recommendation === 'use_direct_api' 
                        ? 'text-green-400' 
                        : apiDiscovery.summary.recommendation === 'hybrid'
                        ? 'text-amber-400'
                        : 'text-slate-400'
                    }`}>
                      {apiDiscovery.summary.recommendation === 'use_direct_api' && '🎯 Direct APIs Found!'}
                      {apiDiscovery.summary.recommendation === 'hybrid' && '⚙️ Hybrid Approach (APIs + Forms)'}
                      {apiDiscovery.summary.recommendation === 'use_form_automation' && '📝 Form Automation Required'}
                    </div>
                    <div className="text-xs text-slate-400 space-y-1">
                      <div>• Direct APIs: {apiDiscovery.summary.directAPIs}</div>
                      <div>• Form Endpoints: {apiDiscovery.summary.formEndpoints}</div>
                      <div>• Noise Filtered: {apiDiscovery.summary.noiseFiltered} ({apiDiscovery.summary.noisePercentage}%)</div>
                      {apiDiscovery.summary.uncertainCount > 0 && (
                        <div>• Uncertain: {apiDiscovery.summary.uncertainCount} ⚠️</div>
                      )}
                      {apiDiscovery.summary.duplicates > 0 && (
                        <div>• Duplicates: {apiDiscovery.summary.duplicates} 🔄</div>
                      )}
                    </div>
                  </div>

                  {/* CRITICAL: Extracted Tokens */}
                  {apiDiscovery.filtering?.extractedTokens?.length > 0 && (
                    <div className="p-3 bg-green-900/20 border border-green-600/30 rounded-lg">
                      <div className="text-xs font-medium text-green-400 mb-2">
                        🔐 Tokens Found: {apiDiscovery.filtering.extractedTokens.length}
                      </div>
                      <div className="text-xs text-slate-400 space-y-1">
                        {apiDiscovery.filtering.extractedTokens.slice(0, 3).map((token: any, idx: number) => (
                          <div key={idx}>
                            • {token.type.toUpperCase()} ({token.location}): {token.name}
                          </div>
                        ))}
                        {apiDiscovery.filtering.extractedTokens.length > 3 && (
                          <div className="text-slate-500">
                            ... and {apiDiscovery.filtering.extractedTokens.length - 3} more
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* CRITICAL: Extracted Variables */}
                  {apiDiscovery.filtering?.extractedVariables?.length > 0 && (
                    <div className="p-3 bg-purple-900/20 border border-purple-600/30 rounded-lg">
                      <div className="text-xs font-medium text-purple-400 mb-2">
                        🎯 Variables: {apiDiscovery.filtering.extractedVariables.length}
                      </div>
                      <div className="text-xs text-slate-400 space-y-1">
                        {apiDiscovery.filtering.extractedVariables.slice(0, 3).map((v: any, idx: number) => (
                          <div key={idx}>
                            • {v.type.toUpperCase()}: {v.name}
                          </div>
                        ))}
                        {apiDiscovery.filtering.extractedVariables.length > 3 && (
                          <div className="text-slate-500">
                            ... and {apiDiscovery.filtering.extractedVariables.length - 3} more
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Top API */}
                  {apiDiscovery.summary.topAPI && (
                    <div className="p-3 bg-slate-900 border border-green-600/30 rounded-lg">
                      <div className="text-xs text-green-400 font-medium mb-1">
                        Top API: {apiDiscovery.summary.topAPI.method} {apiDiscovery.summary.topAPI.path}
                      </div>
                      <div className="text-xs text-slate-500">
                        Confidence: {Math.round(apiDiscovery.summary.topAPI.confidence * 100)}%
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-slate-400 font-medium" id="fullmap-tools-label">
                FULL MAP TOOLS
              </span>
              <span className="text-xs text-slate-600">• If no direct APIs found</span>
            </div>
            
            <div className="flex gap-2" role="group" aria-labelledby="fullmap-tools-label">
              <button
                onClick={generateFullButtonMap}
                disabled={generatingButtonMap || flipbookSnapshots.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg text-xs text-white font-medium transition-all focus:outline-none focus:ring-2 focus:ring-purple-500"
                aria-label="Generate button map from DOM snapshots"
                aria-busy={generatingButtonMap}
                aria-disabled={generatingButtonMap || flipbookSnapshots.length === 0}
                title={flipbookSnapshots.length === 0 ? 'Launch browser first to capture snapshots' : 'Correlate UI elements with network requests'}
              >
                {generatingButtonMap ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> : <Zap className="w-3 h-3" aria-hidden="true" />}
                <span>Generate Button Map</span>
              </button>

              {lockedSteps.length > 0 && (
                <button
                  onClick={validateWorkflow2x}
                  disabled={validating}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg text-xs text-white font-medium transition-all focus:outline-none focus:ring-2 focus:ring-green-500"
                  aria-label={`Validate workflow with ${lockedSteps.length} steps twice in sequence`}
                  aria-busy={validating}
                  aria-disabled={validating}
                  title="Run workflow 2x to ensure reliability"
                >
                  {validating ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> : <Check className="w-3 h-3" aria-hidden="true" />}
                  <span>Validate 2x</span>
                </button>
              )}
            </div>

            {/* Button Map Display */}
            {buttonMap && (
              <div className="mt-3 p-3 bg-slate-900 border border-purple-600/30 rounded-lg">
                <div className="text-xs text-purple-400 font-medium mb-2">
                  🗺️ Button Map: {buttonMap.mappedButtons}/{buttonMap.totalButtons} elements mapped
                </div>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {buttonMap.buttons.slice(0, 10).map((btn: any, idx: number) => (
                    <div key={idx} className="text-xs text-slate-400">
                      {btn.endpoint ? (
                        <span className="text-green-400">✓</span>
                      ) : (
                        <span className="text-slate-600">○</span>
                      )} {btn.text || btn.id} ({btn.type}) {btn.endpoint && `→ ${btn.endpoint}`}
                    </div>
                  ))}
                  {buttonMap.buttons.length > 10 && (
                    <div className="text-xs text-slate-600">
                      ... and {buttonMap.buttons.length - 10} more elements
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Validation Results Display */}
            {validationResult && (
              <div className={`mt-3 p-3 border rounded-lg ${
                validationResult.allPassed 
                  ? 'bg-green-900/20 border-green-600/30' 
                  : 'bg-red-900/20 border-red-600/30'
              }`}>
                <div className={`text-xs font-medium mb-2 ${
                  validationResult.allPassed ? 'text-green-400' : 'text-red-400'
                }`}>
                  {validationResult.allPassed ? '✓ Validation Passed' : '✗ Validation Failed'} ({validationResult.successfulAttempts}/{validationResult.totalAttempts})
                </div>
                <div className="text-xs text-slate-400">
                  Reliability: {Math.round(validationResult.reliability * 100)}% • 
                  Avg Response: {Math.round(validationResult.averageResponseTime)}ms
                </div>
                {!validationResult.allPassed && (
                  <div className="mt-2 text-xs text-red-400">
                    {validationResult.failedAttempts} step(s) failed. Review failures in chat.
                  </div>
                )}
              </div>
            )}

            {/* Multi-State Testing */}
            <div className="mt-4 pt-4 border-t border-slate-700/50">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-slate-400 font-medium">MULTI-STATE TESTING</span>
                <span className="text-xs text-slate-600">• Detects state-specific variations</span>
              </div>
              
              <div className="space-y-2 mb-3">
                <div className="text-xs text-slate-500 mb-2">
                  Test multiple zipcodes to detect form differences across states:
                </div>
                {stateTestCases.map((testCase, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={testCase.state}
                      onChange={(e) => {
                        const newCases = [...stateTestCases];
                        newCases[idx].state = e.target.value;
                        setStateTestCases(newCases);
                      }}
                      placeholder="State"
                      className="w-16 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-white focus:outline-none focus:border-purple-500"
                    />
                    <input
                      type="text"
                      value={testCase.zipcode}
                      onChange={(e) => {
                        const newCases = [...stateTestCases];
                        newCases[idx].zipcode = e.target.value;
                        setStateTestCases(newCases);
                      }}
                      placeholder="Zipcode"
                      className="w-24 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-white focus:outline-none focus:border-purple-500"
                    />
                    <input
                      type="text"
                      value={testCase.description || ''}
                      onChange={(e) => {
                        const newCases = [...stateTestCases];
                        newCases[idx].description = e.target.value;
                        setStateTestCases(newCases);
                      }}
                      placeholder="Description (optional)"
                      className="flex-1 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-white focus:outline-none focus:border-purple-500"
                    />
                    {stateTestCases.length > 2 && (
                      <button
                        onClick={() => setStateTestCases(stateTestCases.filter((_, i) => i !== idx))}
                        className="text-red-500 hover:text-red-400 text-xs"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => setStateTestCases([...stateTestCases, { state: '', zipcode: '', description: '' }])}
                  className="text-xs text-purple-400 hover:text-purple-300"
                >
                  + Add State
                </button>
              </div>

              <button
                onClick={testMultipleStates}
                disabled={testingStates || stateTestCases.length < 2}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg text-xs text-white font-medium transition-all"
              >
                {testingStates ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Testing States...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-3 h-3" />
                    <span>Test Multiple States</span>
                  </>
                )}
              </button>

              {/* State Variant Map Display */}
              {stateVariantMap && (
                <div className="mt-3 p-3 bg-slate-900 border border-purple-600/30 rounded-lg">
                  <div className="text-xs text-purple-400 font-medium mb-2">
                    🗺️ Multi-State Analysis: {stateVariantMap.variantMap.totalVariations} variations found
                  </div>
                  <div className="text-xs text-slate-400 space-y-1">
                    <div>• Strategy: {stateVariantMap.variantMap.adaptationStrategy.replace('_', ' ').toUpperCase()}</div>
                    <div>• Critical Variations: {stateVariantMap.variantMap.variations.filter((v: any) => v.impact === 'critical').length}</div>
                    <div>• States: {stateVariantMap.variantMap.testedStates.join(', ')}</div>
                  </div>
                  {stateVariantMap.validationResults && (
                    <div className="mt-2 pt-2 border-t border-slate-700">
                      <div className="text-xs text-slate-500 mb-1">Per-State Coverage:</div>
                      {stateVariantMap.validationResults.map((result: any, idx: number) => (
                        <div key={idx} className="text-xs text-slate-400">
                          {result.valid ? '✓' : '⚠'} {result.state}: {Math.round(result.coverage * 100)}%
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* AI AGENT */}
      {controlMode === 'ai' && (
        <div className="shrink-0 bg-gradient-to-r from-slate-900/50 to-transparent border-b border-slate-700/50 p-4">
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-sm font-bold text-slate-300 tracking-wide">AI AGENT • INTELLIGENT ANALYSIS</h3>
            <div className="ml-auto flex items-center gap-2">
                  <button
                onClick={handleAiAgentToggle}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  aiAgentActive
                    ? 'bg-red-600 text-white shadow-lg'
                    : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                }`}
              >
                <Brain className="w-3.5 h-3.5" />
                {aiAgentActive ? 'Active' : 'Activate'}
                  </button>
              <ArrowDown className="w-4 h-4 text-slate-600" />
                </div>
              </div>

          {aiAgentActive ? (
          <div className="space-y-3">
            {/* AI Status */}
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg">
              {aiAgentStatus === 'analyzing' ? (
                <>
                  <Loader2 className="w-4 h-4 text-red-400 animate-spin" />
                  <span className="text-xs text-red-400">Analyzing traffic patterns...</span>
                </>
              ) : aiAgentStatus === 'completed' ? (
                <>
                  <Sparkles className="w-4 h-4 text-red-400" />
                  <span className="text-xs text-red-400">Analysis complete</span>
                </>
              ) : (
                <>
                  <Brain className="w-4 h-4 text-slate-500" />
                  <span className="text-xs text-slate-500">Waiting for traffic...</span>
                </>
              )}
            </div>

            {/* AI Suggested Step */}
            {aiSuggestedStep && (
              <div className="p-3 bg-slate-900/50 border border-red-500/30 rounded-lg">
                <div className="flex items-start gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-300 mb-1">
                      Suggested: Step {aiSuggestedStep.stepNumber}
                    </div>
                    <div className="text-xs text-slate-400 mb-2">
                      {aiSuggestedStep.method} {aiSuggestedStep.endpoint}
                    </div>
                    <div className="text-xs text-slate-500">
                      {aiSuggestedStep.reason}
                    </div>
                    {aiSuggestedStep.usesVariables && aiSuggestedStep.usesVariables.length > 0 && (
                      <div className="text-xs text-amber-400 mt-2">
                        Uses: {aiSuggestedStep.usesVariables.join(', ')}
                      </div>
                    )}
                    <div className="text-xs text-slate-600 mt-2">
                      Expected: {aiSuggestedStep.expectedResult}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-slate-600">
                  Confidence: {Math.round((aiSuggestedStep.confidence || 0) * 100)}%
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-4">
            <Brain className="w-10 h-10 mx-auto mb-2 text-slate-700 opacity-50" />
            <p className="text-xs text-slate-600">AI Agent disabled</p>
            <p className="text-xs text-slate-700 mt-1">Click "Activate" to enable intelligent analysis</p>
          </div>
        )}
        </div>
      )}

      {/* NETWORK LOGS + CODE SNIPPETS (TABBED) */}
      <div className="flex-1 flex flex-col min-h-0 bg-gradient-to-r from-slate-900/50 to-transparent border-b border-slate-700/50">
        <div className="shrink-0 flex items-center justify-between p-4 pb-0 border-b border-slate-800">
          {/* Tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                setActiveTab('logs');
              }}
              className={`px-4 py-2 text-sm font-medium rounded-t transition-all ${
                activeTab === 'logs'
                  ? 'bg-slate-900 text-white border-b-2 border-red-500'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              CAPTURE • NETWORK TRAFFIC
            </button>
            <button
              onClick={() => {
                setActiveTab('code');
                setHasNewCodeSnippet(false); // Clear notification when tab is opened
              }}
              className={`relative px-4 py-2 text-sm font-medium rounded-t transition-all ${
                activeTab === 'code'
                  ? 'bg-slate-900 text-white border-b-2 border-red-500'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              CODE SNIPPETS
              {hasNewCodeSnippet && activeTab !== 'code' && (
                <span className="absolute -top-1 -right-1 flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-green-500 rounded-full animate-pulse">
                  1
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'logs' && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="shrink-0 flex items-center gap-3 p-4 pb-3">
              <h3 className="text-sm font-bold text-slate-300 tracking-wide">ENDPOINTS</h3>
              <div className="flex items-center gap-2">
            {keywordAnalysis && endpoints.length > 0 && (
              <button
                onClick={generateWorkflowPlan}
                disabled={planningWorkflow}
                className="flex items-center gap-1 px-2 py-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded text-xs text-white"
              >
                {planningWorkflow ? <Loader2 className="w-3 h-3 animate-spin" /> : <Brain className="w-3 h-3" />}
                {planningWorkflow ? 'Planning...' : 'Plan Workflow'}
              </button>
            )}
            {flipbookSnapshots.length > 0 && (
              <button
                onClick={analyzeFlipbook}
                disabled={analyzingFlipbook}
                className="flex items-center gap-1 px-2 py-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded text-xs text-white"
                title={`Analyze ${flipbookSnapshots.length} DOM snapshots with AI`}
              >
                {analyzingFlipbook ? <Loader2 className="w-3 h-3 animate-spin" /> : <BookOpen className="w-3 h-3" />}
                {analyzingFlipbook ? 'Analyzing...' : `Flipbook (${flipbookSnapshots.length})`}
              </button>
            )}
              </div>
              {keywordAnalysis && (
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={showOnlyRelevant}
                    onChange={(e) => setShowOnlyRelevant(e.target.checked)}
                    className="rounded border border-slate-600"
                  />
                  <Filter className="w-3 h-3" />
                  Smart Filter
                </label>
              )}
              <label className="ml-auto flex items-center gap-2 cursor-pointer text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={showSelectedOnly}
                  onChange={(e) => setShowSelectedOnly(e.target.checked)}
                  className="rounded border border-slate-600"
                />
                Selected Only
              </label>
              <ArrowDown className="w-4 h-4 text-slate-600" />
            </div>
        
        <div className="flex-1 overflow-y-auto px-4 py-2">
          {filteredEndpointsByRelevance.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">
              <div className="text-center">
                <Monitor className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>{showOnlyRelevant ? 'No relevant endpoints found' : 'No traffic captured yet'}</p>
                <p className="text-xs mt-1">{showOnlyRelevant ? 'Try disabling Smart Filter' : 'Launch browser and browse a site'}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredEndpointsByRelevance.map((ep, idx) => {
                  const key = `${ep.method} ${ep.host}${ep.path}`;
                const isSelected = selectedEndpoint?.sampleUrl === ep.sampleUrl;
                  return (
                  <div
                    key={idx}
                    onClick={() => setSelectedEndpoint(ep)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                            isSelected
                        ? 'bg-red-900/20 border-red-500/60 shadow-lg shadow-red-500/10'
                        : 'bg-slate-900/50 border-slate-700/50 hover:bg-slate-800/60 hover:border-slate-600/60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        ep.method === 'GET' ? 'bg-slate-800 text-slate-300' :
                        ep.method === 'POST' ? 'bg-slate-700 text-white' :
                        ep.method === 'PUT' ? 'bg-slate-700 text-slate-300' :
                        ep.method === 'DELETE' ? 'bg-red-900/50 text-red-300' :
                        'bg-slate-700 text-slate-300'
                        }`}>
                          {ep.method}
                        </span>
                      <span className="flex-1 text-sm text-slate-300 font-mono truncate">
                        {ep.host}<span className="text-red-400">{ep.path}</span>
                          </span>
                      <span className="text-xs text-slate-500">×{ep.count}</span>
                      {ep.hasAuth && (
                        <span className="px-1.5 py-0.5 bg-red-900/30 text-red-400 text-xs rounded" title="Has auth headers">🔐</span>
                      )}
                      {isSelected && (
                        <Check className="w-4 h-4 text-red-400" />
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
            </div>
          </div>
        )}

        {/* Code Tab */}
        {activeTab === 'code' && (
          <div className="flex-1 flex flex-col min-h-0 p-4">
            <h3 className="text-sm font-bold text-slate-300 tracking-wide mb-3">GENERATED CODE SNIPPETS</h3>
            {!currentCode ? (
              <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
                No code generated yet. Select an endpoint to generate code.
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex gap-2 mb-3">
                  {(['curl', 'fetch', 'axios', 'python'] as const).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => {
                        if (selectedEndpoint) {
                          const code = lang === 'curl' ? generateCurl(selectedEndpoint) :
                                     lang === 'fetch' ? generateFetch(selectedEndpoint) :
                                     lang === 'axios' ? generateAxios(selectedEndpoint) :
                                     generatePython(selectedEndpoint);
                          setCurrentCode(code);
                          setSnippetLang(lang);
                        }
                      }}
                      className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                        snippetLang === lang
                          ? 'bg-red-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
                <div className="flex-1 overflow-auto bg-slate-950 border border-slate-800 rounded-lg p-4">
                  <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap">
                    {currentCode}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* TEST & EXECUTE */}
      <div className="shrink-0 bg-gradient-to-r from-slate-900/50 to-transparent" style={{ height: '35%' }}>
        <div className="h-full flex flex-col">
          <div className="shrink-0 flex items-center gap-3 p-3 border-b border-slate-800">
            <h3 className="text-sm font-bold text-slate-300 tracking-wide">EXECUTE • TEST & VALIDATE</h3>
            <div className="ml-auto flex items-center gap-2">
              {(['curl', 'fetch', 'axios', 'python'] as CodeSnippetLang[]).map((lang) => (
                <button
                  key={lang}
                  onClick={() => {
                    setSnippetLang(lang);
                    if (selectedEndpoint) {
                      const code = lang === 'curl' ? generateCurl(selectedEndpoint) :
                                   lang === 'fetch' ? generateFetch(selectedEndpoint) :
                                   lang === 'axios' ? generateAxios(selectedEndpoint) :
                                   generatePython(selectedEndpoint);
                      setCurrentCode(code);
                    }
                  }}
                  className={`px-2 py-1 text-xs rounded font-medium transition-all ${
                    snippetLang === lang
                      ? 'bg-red-600 text-white'
                      : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                  }`}
                >
                  {lang}
                </button>
                        ))}
                      </div>
                    </div>
          
          <div className="flex-1 grid grid-cols-2 gap-3 p-3 overflow-hidden">
            {/* LEFT: CODE */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500 font-medium">CODE</span>
                <div className="flex gap-2">
                  <button
                    onClick={executeCode}
                    disabled={!currentCode || testLoading}
                    className="flex items-center gap-1 px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded text-xs text-white"
                  >
                    {testLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                    Test
                  </button>
                  {testResult?.success && (
                    <button
                      onClick={lockCurrentStep}
                      className="flex items-center gap-1 px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-xs text-white font-medium"
                    >
                      🔒 Lock Step {currentStepFocus}
                    </button>
                  )}
                      </div>
                    </div>
              {!selectedEndpoint ? (
                <div className="flex-1 flex items-center justify-center bg-slate-950 border border-slate-800 rounded-lg text-slate-600 text-sm">
                  <div className="text-center">
                    <Terminal className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p className="text-xs">Select endpoint above</p>
                  </div>
                </div>
              ) : (
                <textarea
                  value={currentCode}
                  onChange={(e) => setCurrentCode(e.target.value)}
                  className="flex-1 p-3 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-300 font-mono resize-none focus:outline-none focus:border-red-500/60"
                  spellCheck={false}
                />
              )}
                    </div>

            {/* RIGHT: RESPONSE */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500 font-medium">RESPONSE</span>
                {testResult && (
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    testResult.success ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
                  }`}>
                    {testResult.success ? `✓ ${testResult.status} ${testResult.statusText}` : `✗ ${testResult.status || 'Error'}`}
                  </span>
                )}
                    </div>
              {!testResult ? (
                <div className="flex-1 flex items-center justify-center bg-slate-950 border border-slate-800 rounded-lg text-slate-600 text-sm">
                  <div className="text-center">
                    <Code className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p className="text-xs">Run test to see response</p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto space-y-2">
                  {/* Success Validation */}
                  {successValidation && targetData.trim() && (
                    <div className={`p-2 rounded text-xs ${
                      successValidation.isValid 
                        ? 'bg-green-900/20 border border-green-500/30'
                        : successValidation.score > 0.5
                          ? 'bg-amber-900/20 border border-amber-500/30'
                          : 'bg-red-900/20 border border-red-500/30'
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`font-medium ${
                          successValidation.isValid ? 'text-green-400' :
                          successValidation.score > 0.5 ? 'text-amber-400' :
                          'text-red-400'
                        }`}>
                          {successValidation.isValid ? '✓ Matches Target' : successValidation.score > 0.5 ? '⚠ Partial Match' : '✗ No Match'}
                        </span>
                        <span className="text-slate-500">{Math.round(successValidation.score * 100)}%</span>
                      </div>
                      {successValidation.matches.length > 0 && (
                        <div className="text-slate-400 text-xs">✓ Found: {successValidation.matches.join(', ')}</div>
                      )}
                      {successValidation.missing.length > 0 && (
                        <div className="text-red-400 text-xs">✗ Missing: {successValidation.missing.join(', ')}</div>
                      )}
                      {successValidation.suggestions.length > 0 && (
                        <div className="text-slate-500 text-xs mt-1">{successValidation.suggestions[0]}</div>
                  )}
                </div>
                  )}
                  
                  {/* Response Body */}
                  <div className="flex-1 p-3 bg-slate-950 border border-slate-700 rounded-lg overflow-auto">
                    {testResult.error ? (
                      <div className="text-xs text-red-400">
                        <div className="font-bold mb-2">Error:</div>
                        <pre>{testResult.error}</pre>
              </div>
                    ) : (
                      <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap">
                        {JSON.stringify(testResult.body, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      </div>

      {/* AI Chat Panel - Always Visible */}
      <AIChatPanel
        messages={chatMessages}
        onSendMessage={handleChatMessage}
        isProcessing={chatProcessing}
        isExpanded={chatExpanded}
        onToggleExpand={() => setChatExpanded(!chatExpanded)}
      />
    </div>
  );
}
