'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Brain, X } from 'lucide-react';
import type { Neuromap } from '@/src/tools/api-signal-explorer/neuromap';
import { exportNeuromap } from '@/src/tools/api-signal-explorer/neuromap';
import type { CategoryTag } from '@/src/tools/api-signal-explorer/signals';
import { type ButtonMapResult } from '@/src/tools/api-signal-explorer/form-correlator';
import { type SequentialTestResult } from '@/src/tools/api-signal-explorer/sequential-validator';
import { ErrorBoundary } from './ErrorBoundary';
import AIChatPanel from './AIChatPanel';
import CommandHeader from './components/CommandHeader';
import WorkbenchMain from './components/WorkbenchMain';
import PipelineFooter from './components/PipelineFooter';
import WorkbenchDetail from './components/WorkbenchDetail';
import type { 
  EndpointData, 
  LockedStep, 
  AIInsight, 
  TestResult, 
  NeuromapWorkspaceProps, 
  CodeSnippetLang,
  WorkflowMode 
} from './types';
import { generateCurl, generateFetch, generateAxios, generatePython } from './code-generators';
import { useWebSocket } from './hooks/useWebSocket';
import { usePipeline } from './hooks/usePipeline';
import { useTestExecution } from './hooks/useTestExecution';
import { useChat } from './hooks/useChat';
import { useAnalysis } from './hooks/useAnalysis';
import { usePipelineCandidates } from './hooks/usePipelineCandidates';
import { useBrowserSession } from './hooks/useBrowserSession';
import { useToast } from './hooks/useToast';
import BrowserTrafficView from './components/BrowserTrafficView';
import ToastContainer from './components/ToastContainer';
import type { PipelineCandidateStep } from '@/src/tools/api-signal-explorer/pipeline-candidate';

export default function NeuromapWorkspace({ neuromap, onUpdate, onClose, wsUrl = 'ws://localhost:8787/explorer' }: NeuromapWorkspaceProps) {
  const [isPaused, setIsPaused] = useState(false);
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [isMarkingInteraction, setIsMarkingInteraction] = useState(false);
  const [selectedCategoryTag, setSelectedCategoryTag] = useState<CategoryTag | null>(null);
  const [launchBrowserLoading, setLaunchBrowserLoading] = useState(false);
  const [launchBrowserError, setLaunchBrowserError] = useState<string | null>(null);
  const [launchBrowserUrl, setLaunchBrowserUrl] = useState('');
  const [snippetLang, setSnippetLang] = useState<CodeSnippetLang>('curl');
  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointData | null>(null);
  
  // AI Agent state
  const [aiAgentActive, setAiAgentActive] = useState(false);
  const [aiAgentStatus, setAiAgentStatus] = useState<'idle' | 'analyzing' | 'completed'>('idle');
  const [aiSuggestedStep, setAiSuggestedStep] = useState<any>(null);
  const [aiInsightsList, setAiInsightsList] = useState<AIInsight[]>([]);

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
    { state: 'AL', zipcode: '35203', description: 'Alabama - Birmingham' },
    { state: 'AR', zipcode: '72201', description: 'Arkansas - Little Rock' },
    { state: 'CO', zipcode: '80202', description: 'Colorado - Denver' },
    { state: 'DE', zipcode: '19901', description: 'Delaware - Dover' },
    { state: 'FL', zipcode: '33101', description: 'Florida - Miami' },
    { state: 'GA', zipcode: '30303', description: 'Georgia - Atlanta' },
    { state: 'IL', zipcode: '60601', description: 'Illinois - Chicago' },
    { state: 'IN', zipcode: '46204', description: 'Indiana - Indianapolis' },
    { state: 'IA', zipcode: '50309', description: 'Iowa - Des Moines' },
    { state: 'KS', zipcode: '66101', description: 'Kansas - Kansas City' },
    { state: 'KY', zipcode: '40202', description: 'Kentucky - Louisville' },
    { state: 'LA', zipcode: '70112', description: 'Louisiana - New Orleans' },
    { state: 'MD', zipcode: '21201', description: 'Maryland - Baltimore' },
    { state: 'MI', zipcode: '48201', description: 'Michigan - Detroit' },
    { state: 'MS', zipcode: '39201', description: 'Mississippi - Jackson' },
    { state: 'MO', zipcode: '63101', description: 'Missouri - St. Louis' },
    { state: 'MT', zipcode: '59601', description: 'Montana - Helena' },
    { state: 'NE', zipcode: '68102', description: 'Nebraska - Omaha' },
    { state: 'NV', zipcode: '89101', description: 'Nevada - Las Vegas' },
    { state: 'NC', zipcode: '27601', description: 'North Carolina - Raleigh' },
    { state: 'OH', zipcode: '43215', description: 'Ohio - Columbus' },
    { state: 'OK', zipcode: '73102', description: 'Oklahoma - Oklahoma City' },
    { state: 'SC', zipcode: '29201', description: 'South Carolina - Columbia' },
    { state: 'SD', zipcode: '57501', description: 'South Dakota - Pierre' },
    { state: 'TN', zipcode: '37203', description: 'Tennessee - Nashville' },
    { state: 'TX', zipcode: '75201', description: 'Texas - Dallas' },
    { state: 'UT', zipcode: '84101', description: 'Utah - Salt Lake City' },
    { state: 'VA', zipcode: '23219', description: 'Virginia - Richmond' },
    { state: 'WI', zipcode: '53202', description: 'Wisconsin - Milwaukee' },
    { state: 'WV', zipcode: '25301', description: 'West Virginia - Charleston' }
  ]);
  
  // Workflow mode
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>('mobile');

  // Custom hooks
  const { wsStatus, endpoints, setEndpoints } = useWebSocket(wsUrl, isPaused, neuromap, onUpdate);
  const {
    lockedSteps,
    currentStepFocus,
    pipelineCollapsed,
    setPipelineCollapsed,
    lockCurrentStep: lockStep,
    exportWorkflow,
  } = usePipeline();
  const {
    testResult,
    testLoading,
    currentCode,
    successValidation,
    setCurrentCode,
    setSuccessValidation,
    executeCode,
  } = useTestExecution(lockedSteps);
  const {
    chatExpanded,
    chatMessages,
    chatProcessing,
    conversationStep,
    agentState,
    userGoal,
    userConstraints,
    targetData,
    setChatExpanded,
    setAgentState,
    handleChatMessage,
    addChatMessage,
  } = useChat();
  const {
    keywordAnalysis,
    suggestedScenarios,
    showScenarios,
    contextualHints,
    workflowPlan,
    planningWorkflow,
    showOnlyRelevant,
    filteredEndpointsByRelevance,
    setKeywordAnalysis,
    setSuggestedScenarios,
    setShowScenarios,
    setContextualHints,
    setWorkflowPlan,
    setPlanningWorkflow,
    setShowOnlyRelevant,
  } = useAnalysis(endpoints);

  // Browser View: Pipeline candidate steps
  const {
    candidateSteps,
    activeActions,
    lockCandidateStep,
    rejectCandidateStep,
    renameCandidateStep,
    clearRejectedSteps,
  } = usePipelineCandidates(neuromap.events || [], wsUrl);

  const interactionStartRef = useRef<number | null>(null);
  const [browserSessionId, setBrowserSessionId] = useState<string | null>(null);
  const [browserSessionUrl, setBrowserSessionUrl] = useState<string | null>(null);
  const [browserSessionStartedAt, setBrowserSessionStartedAt] = useState<number | null>(null);

  // Browser session state management
  const {
    session: browserSession,
    startSession: startBrowserSession,
    stopSession: stopBrowserSession,
    reopenBrowser: reopenBrowserSession,
    updateLastAction,
  } = useBrowserSession(wsUrl);

  // Toast notifications
  const toast = useToast();

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

  const isProduction = typeof window !== 'undefined' && (window.location.hostname.includes('railway.app') || window.location.hostname.includes('.onrender.com') || window.location.hostname.includes('.up.railway.app'));

  const handleLaunchBrowser = async () => {
    if (isProduction) {
      setLaunchBrowserError('Browser automation is only available locally.');
      return;
    }
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
        setLaunchBrowserError(data.error || 'Failed to launch');
        toast.error(data.error || 'Failed to launch browser');
      } else {
        // Store session info
        if (data.sessionId) {
          setBrowserSessionId(data.sessionId);
          setBrowserSessionUrl(data.url || null);
          setBrowserSessionStartedAt(data.startedAt || Date.now());
          // Start session tracking
          startBrowserSession(data.sessionId, data.url || launchBrowserUrl || '', data.startedAt || Date.now());
        }
        // Switch to browser mode automatically
        if (workflowMode === 'mobile') {
          setWorkflowMode('browser');
        }
        // Toast will be shown when browser_opened event arrives
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setLaunchBrowserError(errorMsg);
      toast.error(`Failed to launch browser: ${errorMsg}`);
    }
    finally { setLaunchBrowserLoading(false); }
  };

  // Handle stop session with confirmation
  const handleStopSession = async () => {
    if (!browserSession.id) return;
    
    // Show confirmation (use window.confirm for now, can be replaced with modal)
    if (!window.confirm('Stop session? HAR will export automatically.')) {
      return;
    }

    const success = await stopBrowserSession();
    if (success) {
      setBrowserSessionId(null);
      setBrowserSessionUrl(null);
      setBrowserSessionStartedAt(null);
      toast.success('Session stopped successfully');
    } else {
      toast.error('Failed to stop session');
    }
  };

  // Handle reopen browser
  const handleReopenBrowser = async () => {
    if (!browserSession.id) return;

    const success = await reopenBrowserSession();
    if (success) {
      toast.success('Reopening browser window...');
    } else {
      toast.error('Failed to reopen browser');
    }
  };

  // Handle export HAR
  const handleExportHAR = async () => {
    if (!browserSession.id) return;

    try {
      const res = await fetch(`/api/explorer/export-har?sessionId=${browserSession.id}`);
      if (!res.ok) {
        toast.error('Failed to export HAR');
        return;
      }
      
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `session-${browserSession.id}.har`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast.success('HAR exported successfully');
    } catch (err) {
      toast.error('Failed to export HAR');
    }
  };

  // Listen for lifecycle events via useBrowserSession (handled in hook)
  // Listen for browser_opened event to show toast
  useEffect(() => {
    if (browserSession.status === 'Running' && browserSession.id) {
      toast.success('Browser window opened');
    }
  }, [browserSession.status, browserSession.id, toast]);

  // Listen for browser_closed event
  useEffect(() => {
    if (browserSession.status === 'BrowserClosed' && browserSession.id) {
      toast.warning('Browser window closed — session paused');
    }
  }, [browserSession.status, browserSession.id, toast]);

  // Listen for session_stopped event
  useEffect(() => {
    if (browserSession.status === 'Stopped' && browserSession.id) {
      // Session stopped toast already shown in handleStopSession
    }
  }, [browserSession.status, browserSession.id]);

  // Handle new step creation (toast + animation)
  const handleNewStepCreated = useCallback((step: PipelineCandidateStep) => {
    toast.info(`Captured: ${step.action.label || step.action.type}`);
    updateLastAction(step.action.label || step.action.type, step.correlatedEvents.length);
  }, [toast, updateLastAction]);

  const handleLockCandidateStep = useCallback((stepId: string) => {
    lockCandidateStep(stepId);
    const step = candidateSteps.find(s => s.id === stepId);
    if (step) {
      // Convert candidate step to locked step
      const primaryEvent = step.correlatedEvents[0];
      if (primaryEvent) {
        lockStep(
          currentStepFocus,
          primaryEvent.path,
          primaryEvent.method,
          '', // Code will be generated
          primaryEvent.resBodyText || primaryEvent,
          (stepNumber) => {
            addChatMessage('assistant', `Step ${stepNumber} locked from browser interaction.`, { type: 'success' });
          }
        );
      } else {
        // No correlated events - still lock the step but warn
        addChatMessage('assistant', `Step locked but no network events correlated.`, { type: 'warning' });
      }
    }
  }, [candidateSteps, currentStepFocus, lockStep, lockCandidateStep, addChatMessage]);

  const handleExecuteCode = async () => {
    if (!currentCode || !selectedEndpoint) return;
    await executeCode(currentCode, snippetLang, selectedEndpoint);
  };

  const lockCurrentStep = () => {
    if (!testResult?.success || !selectedEndpoint) return;
    lockStep(
      currentStepFocus,
      selectedEndpoint.path,
      selectedEndpoint.method,
      currentCode,
      testResult.body,
      (stepNumber) => {
        setSelectedEndpoint(null);
        addChatMessage('assistant', `Step ${stepNumber} locked successfully.`, { type: 'success' });
      }
    );
  };

  const handleExportWorkflow = useCallback(() => {
    exportWorkflow(userGoal);
  }, [userGoal, exportWorkflow]);

  return (
    <div className="w-full h-screen bg-[#0a0a0a] text-white flex flex-col overflow-hidden font-futuristic selection:bg-purple-500/30">
      <CommandHeader
        neuromapName={neuromap?.name || 'Workspace'}
        workflowMode={workflowMode}
        onWorkflowModeChange={setWorkflowMode}
        isPaused={isPaused}
        onTogglePause={() => setIsPaused(!isPaused)}
        onExport={handleExport}
        chatExpanded={chatExpanded}
        onToggleChat={() => setChatExpanded(!chatExpanded)}
      />

      {workflowMode === 'browser' && browserSessionId ? (
        <div className="flex-1 overflow-hidden flex flex-col">
          <BrowserTrafficView
            events={neuromap.events || []}
            actions={activeActions}
            candidateSteps={candidateSteps.filter(s => s.userStatus !== 'rejected')}
            onLockStep={handleLockCandidateStep}
            onRejectStep={rejectCandidateStep}
            onRenameStep={renameCandidateStep}
            sessionId={browserSessionId}
            sessionUrl={browserSession.url || browserSessionUrl}
            sessionStatus={browserSession.status}
            sessionStartedAt={browserSession.startedAt || browserSessionStartedAt}
            onStopSession={handleStopSession}
            onReopenBrowser={handleReopenBrowser}
            onExportHAR={handleExportHAR}
            onNewStepCreated={handleNewStepCreated}
          />
        </div>
      ) : (
        <WorkbenchMain
          workflowMode={workflowMode}
          launchBrowserUrl={launchBrowserUrl}
          onLaunchBrowserUrlChange={setLaunchBrowserUrl}
          onLaunchBrowser={handleLaunchBrowser}
          launchBrowserLoading={launchBrowserLoading}
          launchBrowserError={launchBrowserError}
          isProduction={isProduction}
          endpoints={filteredEndpointsByRelevance}
          selectedEndpoint={selectedEndpoint}
          onSelectEndpoint={setSelectedEndpoint}
          showOnlyRelevant={showOnlyRelevant}
          onToggleFilter={setShowOnlyRelevant}
          onAddChatMessage={(msg) => addChatMessage('assistant', msg)}
        />
      )}

      <PipelineFooter
        lockedSteps={lockedSteps}
        onExportWorkflow={handleExportWorkflow}
      />

      {selectedEndpoint && (
        <WorkbenchDetail
          selectedEndpoint={selectedEndpoint}
          onClose={() => setSelectedEndpoint(null)}
          snippetLang={snippetLang}
          currentCode={currentCode}
          testResult={testResult}
          testLoading={testLoading}
          onSnippetLangChange={setSnippetLang}
          onCodeChange={setCurrentCode}
          onRunTest={handleExecuteCode}
          onLockStep={lockCurrentStep}
        />
      )}

      {/* Toast Container */}
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* 5. AI CONTEXT ASSISTANT (Floating) */}
      {chatExpanded && (
        <div 
          className="fixed bottom-28 right-10 w-[480px] h-[650px] rounded-[2.5rem] bg-[#0d0d0d] border border-white/[0.1] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.9)] z-[1000] flex flex-col overflow-hidden animate-in slide-in-from-bottom-12 duration-700 backdrop-blur-2xl"
        >
          <div className="h-16 px-8 flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02]">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-xl bg-purple-600/20 flex items-center justify-center border border-purple-500/20">
                <Brain className="w-5 h-5 text-purple-400" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-black tracking-widest text-purple-400 uppercase leading-none mb-1">AI Assistant</span>
                <span className="text-sm font-bold text-white/90 leading-none">
                  {workflowMode === 'mobile' ? 'Mobile Context Intelligence' : 'Browser Workflow Strategist'}
                </span>
              </div>
            </div>
            <button onClick={() => setChatExpanded(false)} className="text-white/20 hover:text-white/90 transition-colors p-2 hover:bg-white/5 rounded-xl">
              <X className="w-6 h-6" />
            </button>
          </div>
          <AIChatPanel
            messages={chatMessages}
            onSendMessage={handleChatMessage}
            isProcessing={chatProcessing}
            isExpanded={true}
            onToggleExpand={() => setChatExpanded(false)}
          />
        </div>
      )}
    </div>
  );
}
