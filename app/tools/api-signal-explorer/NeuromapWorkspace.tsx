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
  
  // Tabs and notifications
  const [activeTab, setActiveTab] = useState<'logs' | 'code'>('logs');
  const [hasNewCodeSnippet, setHasNewCodeSnippet] = useState(false);
  
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
      flipbook: {
        snapshotCount: flipbookSnapshots.length,
        sessionId: flipbookSessionId,
        analysis: flipbookAnalysis,
      },
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
      </div>

      {/* AI AGENT */}
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

      {/* DUPLICATE LOCKED PIPELINE - REMOVE THIS ONE */}
      <div className="shrink-0 bg-gradient-to-r from-green-900/10 to-transparent border-b border-green-600/20 p-4" style={{ display: 'none' }}>
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
            <div className="shrink-0 flex items-center gap-3 p-4 pb-3"
            >
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
