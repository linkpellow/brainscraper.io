/**
 * Browser Traffic View - Dual pane view for Signal Stream and Pipeline Sequence
 */

import { useState, useEffect, useRef } from 'react';
import SignalStream from './SignalStream';
import PipelineSequence from './PipelineSequence';
import SessionControlBar from './SessionControlBar';
import CodePreviewPanel from './CodePreviewPanel';
import type { RawNetworkEvent } from '@/src/tools/api-signal-explorer/neuromap';
import type { ActionEvent } from '@/src/tools/api-signal-explorer/actions';
import type { PipelineCandidateStep } from '@/src/tools/api-signal-explorer/pipeline-candidate';
import type { SessionStatus } from './SessionControlBar';

type BrowserTrafficViewProps = {
  events: RawNetworkEvent[];
  actions: ActionEvent[];
  candidateSteps: PipelineCandidateStep[];
  onLockStep: (stepId: string) => void;
  onRejectStep: (stepId: string) => void;
  onRenameStep: (stepId: string, newLabel: string) => void;
  sessionId?: string;
  sessionUrl?: string | null;
  sessionStatus: SessionStatus;
  sessionStartedAt?: number | null;
  onStopSession: () => void;
  onReopenBrowser: () => void;
  onExportHAR?: () => void;
  onNewStepCreated?: (step: PipelineCandidateStep) => void;
};

export default function BrowserTrafficView({
  events,
  actions,
  candidateSteps,
  onLockStep,
  onRejectStep,
  onRenameStep,
  sessionId,
  sessionUrl,
  sessionStatus,
  sessionStartedAt,
  onStopSession,
  onReopenBrowser,
  onExportHAR,
  onNewStepCreated,
  showCodePreview = false,
  onToggleCodePreview,
}: BrowserTrafficViewProps) {
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [showRawStream, setShowRawStream] = useState(false);
  const [codePreviewOpen, setCodePreviewOpen] = useState(false);
  const [captureState, setCaptureState] = useState<'idle' | 'capturing' | 'correlating' | 'complete'>('idle');
  const previousStepsCountRef = useRef<number>(0);
  const newStepIdsRef = useRef<Set<string>>(new Set());

  // Track last action for display
  const lastAction = actions.length > 0 ? actions[actions.length - 1] : null;
  const lastActionEvents = lastAction
    ? events.filter(e => e.actionId === lastAction.id)
    : [];

  // Detect new step creation
  useEffect(() => {
    const currentCount = candidateSteps.length;
    if (currentCount > previousStepsCountRef.current) {
      const newStep = candidateSteps[currentCount - 1];
      if (newStep && !newStepIdsRef.current.has(newStep.id)) {
        newStepIdsRef.current.add(newStep.id);
        if (onNewStepCreated) {
          onNewStepCreated(newStep);
        }
        setSelectedStepId(newStep.id);
        setSelectedActionId(newStep.action.id);
        setCaptureState('complete');
        setTimeout(() => setCaptureState('idle'), 2000);
      }
      previousStepsCountRef.current = currentCount;
    }
  }, [candidateSteps, onNewStepCreated]);

  // Check if step is new (for animation)
  const isNewStep = useCallback((stepId: string) => {
    return newStepIdsRef.current.has(stepId);
  }, []);

  // Update capture state when actions occur
  useEffect(() => {
    if (sessionStatus === 'Running' && actions.length > 0) {
      const latestAction = actions[actions.length - 1];
      const actionEvents = events.filter(e => e.actionId === latestAction.id);
      
      if (actionEvents.length > 0) {
        setCaptureState('correlating');
        setTimeout(() => setCaptureState('idle'), 2000);
      } else {
        setCaptureState('capturing');
      }
    }
  }, [actions, events, sessionStatus]);

  // When a step is selected, show its events
  const handleSelectStep = (stepId: string) => {
    setSelectedStepId(stepId);
    const step = candidateSteps.find(s => s.id === stepId);
    if (step) {
      setSelectedActionId(step.action.id);
    }
  };

  // When action is selected, show its events
  const handleSelectAction = (actionId: string | null) => {
    setSelectedActionId(actionId);
    if (!actionId) {
      setSelectedStepId(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Session Control Bar */}
      <SessionControlBar
        sessionId={sessionId || null}
        url={sessionUrl || null}
        status={sessionStatus}
        startedAt={sessionStartedAt || null}
        onStop={onStopSession}
        onReopen={onReopenBrowser}
        onExportHAR={onExportHAR}
      />

      {/* Capture Indicator and Last Action */}
      {sessionStatus === 'Running' && (
        <div className="h-12 px-6 flex items-center justify-between border-b border-white/[0.06] bg-white/[0.01]">
          <div className="flex items-center gap-4">
            {/* Capture Indicator */}
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                captureState === 'idle' ? 'bg-white/20' :
                captureState === 'capturing' ? 'bg-blue-500 animate-pulse' :
                captureState === 'correlating' ? 'bg-purple-500 animate-pulse' :
                'bg-emerald-500'
              }`} />
              <span className="text-xs font-bold text-white/40">
                {captureState === 'idle' ? 'Waiting for next interaction...' :
                 captureState === 'capturing' ? 'Capturing network delta...' :
                 captureState === 'correlating' ? 'Correlating events...' :
                 'Step created ✓'}
              </span>
            </div>

            {/* Last Action Pill */}
            {lastAction && (
              <div className="px-3 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                <span className="text-xs font-bold text-purple-400">
                  Last: {lastAction.label || lastAction.type} ({lastActionEvents.length} event{lastActionEvents.length !== 1 ? 's' : ''})
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dual/Tri Pane Layout */}
      <div className="flex-1 flex border border-white/[0.06] rounded-2xl overflow-hidden bg-[#0a0a0a]">
        {/* Left Pane: Signal Stream */}
        <div className="flex-1 border-r border-white/[0.06] flex flex-col min-w-0">
          <SignalStream
            selectedActionId={selectedActionId}
            events={events}
            actions={actions}
            onSelectAction={handleSelectAction}
            showRawStream={showRawStream}
            onToggleRawStream={() => setShowRawStream(!showRawStream)}
          />
        </div>

        {/* Middle Pane: Pipeline Sequence */}
        <div className={`${codePreviewOpen ? 'w-96' : 'flex-1'} ${codePreviewOpen ? 'border-r' : ''} border-white/[0.06] flex flex-col min-w-0`}>
          <PipelineSequence
            candidateSteps={candidateSteps}
            onLockStep={onLockStep}
            onRejectStep={onRejectStep}
            onRenameStep={onRenameStep}
            onSelectStep={handleSelectStep}
            selectedStepId={selectedStepId}
            isNewStep={isNewStep}
            onToggleCodePreview={() => setCodePreviewOpen(!codePreviewOpen)}
          />
        </div>

        {/* Right Pane: Code Preview (optional) */}
        {codePreviewOpen && (
          <div className="w-96 flex flex-col min-w-0">
            <CodePreviewPanel
              step={selectedStepId ? candidateSteps.find(s => s.id === selectedStepId) || null : null}
              onClose={() => setCodePreviewOpen(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
