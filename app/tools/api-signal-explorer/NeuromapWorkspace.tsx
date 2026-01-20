'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Pause, Play, Check, X, Download, Globe, Plus, MousePointer, Tag, Monitor, Rss, ChevronDown, ChevronRight, Copy, Code, Terminal, ArrowDown, Zap, Brain, Sparkles, Loader2, Lightbulb, TrendingUp, Filter } from 'lucide-react';
import type { Neuromap, RawNetworkEvent } from '@/src/tools/api-signal-explorer/neuromap';
import { addEventToNeuromap, toggleEndpointSelection, exportNeuromap } from '@/src/tools/api-signal-explorer/neuromap';
import { createActionEvent, type ActionEvent, type ActionType } from '@/src/tools/api-signal-explorer/actions';
import { linkActionToEvents } from '@/src/tools/api-signal-explorer/correlate';
import { convertToNetworkSignal, getCategoryDescription, type CategoryTag } from '@/src/tools/api-signal-explorer/signals';
import { analyzeKeywords, scoreEndpointRelevance, type KeywordAnalysis } from '@/utils/ai/keyword-detector';
import { extractSmartVariables, detectAuthMethod, generateUsageExamples } from '@/utils/ai/smart-variables';
import { validateResponse, suggestImprovedTarget } from '@/utils/ai/success-validator';
import { findMatchingScenarios, getContextualHints, type Scenario } from '@/utils/ai/auto-suggestions';

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
    
    // Detect auth method if this looks like a login step
    const authMethod = detectAuthMethod(testResult.body);
    
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
    setCurrentStepFocus(prev => prev + 1);
    setAiAgentStatus('idle'); // Trigger re-analysis for next step
    
    // Show usage examples for extracted variables
    if (Object.keys(extractedVars).length > 0) {
      const examples = generateUsageExamples(extractedVars);
      if (examples.length > 0) {
        console.log('[Smart Lock] Variable usage examples:', examples);
      }
    }
    
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

  // Apply scenario template
  const applyScenario = (scenario: Scenario) => {
    setUserGoal(scenario.goal);
    setUserConstraints(scenario.constraints);
    setTargetData(scenario.targetData);
    setShowScenarios(false);
  };

  // Export workflow
  const exportWorkflow = () => {
    const workflow = {
      goal: userGoal,
      constraints: userConstraints,
      targetData: targetData,
      keywordAnalysis: keywordAnalysis,
      workflowPlan: workflowPlan,
      steps: lockedSteps.map(step => ({
        stepNumber: step.stepNumber,
        method: step.method,
        endpoint: step.endpoint,
        code: step.code,
        extractedVars: step.extractedVars,
        dependencies: step.dependencies,
      })),
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(workflow, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workflow-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full flex flex-col bg-black rounded-lg border border-slate-800 overflow-hidden" style={{ height: '88vh' }}>
      {/* Header */}
      <div className="shrink-0 bg-gradient-to-r from-slate-900 to-slate-800 border-b border-slate-700/50 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="w-6 h-6 text-red-500" />
          <h2 className="text-lg font-bold text-red-500 font-mono tracking-wide">API SIGNAL PIPELINE</h2>
        </div>
        <div className="flex items-center gap-2">
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

      {/* PIPELINE STAGE 1: GOAL + URL INPUT */}
      <div className="shrink-0 bg-gradient-to-r from-slate-900/50 to-transparent border-b border-slate-700/50 p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center justify-center w-8 h-8 bg-slate-700 rounded-full text-white font-bold text-sm">1</div>
          <h3 className="text-sm font-bold text-slate-300 tracking-wide">INPUT • GOAL & TARGET</h3>
          <ArrowDown className="w-4 h-4 text-slate-600 ml-auto" />
        </div>
        
        <div className="space-y-3">
          {/* Goal */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-slate-500">Goal (What do you want to achieve?)</label>
              {suggestedScenarios.length > 0 && !showScenarios && (
                <button
                  onClick={() => setShowScenarios(true)}
                  className="flex items-center gap-1 px-2 py-0.5 bg-slate-700 hover:bg-slate-600 rounded text-xs text-slate-300"
                >
                  <TrendingUp className="w-3 h-3" />
                  {suggestedScenarios.length} templates
                </button>
              )}
            </div>
            <input
              type="text"
              value={userGoal}
              onChange={(e) => setUserGoal(e.target.value)}
              placeholder="e.g., Get all product listings with prices"
              className="w-full px-4 py-2 bg-slate-900 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-red-500/60"
            />
            
            {/* Keyword Analysis Indicators */}
            {keywordAnalysis && keywordAnalysis.intent.confidence > 0.7 && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 bg-green-900/30 text-green-400 text-xs rounded">
                  ✓ Detected: {keywordAnalysis.intent.action}
                </span>
                {keywordAnalysis.entities.map(entity => (
                  <span key={entity.name} className="px-2 py-0.5 bg-blue-900/30 text-blue-400 text-xs rounded">
                    {entity.name}
                  </span>
                ))}
              </div>
            )}
            
            {/* Scenario Suggestions */}
            {showScenarios && suggestedScenarios.length > 0 && (
              <div className="mt-2 p-3 bg-slate-900 border border-slate-700 rounded-lg space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 font-medium">Quick Start Templates</span>
                  <button
                    onClick={() => setShowScenarios(false)}
                    className="text-xs text-slate-500 hover:text-slate-300"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                {suggestedScenarios.map(scenario => (
                  <button
                    key={scenario.id}
                    onClick={() => applyScenario(scenario)}
                    className="w-full text-left p-2 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 transition-all"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">{scenario.icon}</span>
                      <span className="text-xs text-white font-medium">{scenario.name}</span>
                    </div>
                    <div className="text-xs text-slate-500">{scenario.description}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Constraints */}
          <div>
            <label className="block text-xs text-slate-500 mb-1.5">Constraints (optional)</label>
            <input
              type="text"
              value={userConstraints}
              onChange={(e) => setUserConstraints(e.target.value)}
              placeholder="e.g., Must be authenticated, paginated, rate-limited"
              className="w-full px-4 py-2 bg-slate-900 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-red-500/60"
            />
          </div>

          {/* Target Data */}
          <div>
            <label className="block text-xs text-slate-500 mb-1.5">Target Data (Success criteria)</label>
            <input
              type="text"
              value={targetData}
              onChange={(e) => setTargetData(e.target.value)}
              placeholder='e.g., JSON with: { id, name, price, stock }'
              className="w-full px-4 py-2 bg-slate-900 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-red-500/60"
            />
          </div>

          {/* URL */}
          <div>
            <label className="block text-xs text-slate-500 mb-1.5">Target URL</label>
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
        </div>
      </div>

      {/* PIPELINE STAGE 2: AI AGENT */}
      <div className="shrink-0 bg-gradient-to-r from-slate-900/50 to-transparent border-b border-slate-700/50 p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center justify-center w-8 h-8 bg-slate-700 rounded-full text-white font-bold text-sm">2</div>
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

      {/* LOCKED PIPELINE SECTION */}
      <div className="shrink-0 bg-gradient-to-r from-green-900/10 to-transparent border-b border-green-600/20 p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center justify-center w-8 h-8 bg-green-600 rounded-full text-white font-bold text-sm">🔒</div>
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
          <ArrowDown className="w-4 h-4 text-slate-600" />
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
      </div>

      {/* PIPELINE STAGE 3: NETWORK LOGS */}
      <div className="flex-1 flex flex-col min-h-0 bg-gradient-to-r from-slate-900/50 to-transparent border-b border-slate-700/50">
        <div className="shrink-0 flex items-center gap-3 p-4 pb-3 border-b border-slate-800">
          <div className="flex items-center justify-center w-8 h-8 bg-slate-700 rounded-full text-white font-bold text-sm">3</div>
          <h3 className="text-sm font-bold text-slate-300 tracking-wide">CAPTURE • NETWORK TRAFFIC</h3>
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

      {/* PIPELINE STAGE 4: TEST & EXECUTE (Split View) */}
      <div className="shrink-0 bg-gradient-to-r from-slate-900/50 to-transparent" style={{ height: '35%' }}>
        <div className="h-full flex flex-col">
          <div className="shrink-0 flex items-center gap-3 p-3 border-b border-slate-800">
            <div className="flex items-center justify-center w-8 h-8 bg-slate-700 rounded-full text-white font-bold text-sm">4</div>
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
  );
}
