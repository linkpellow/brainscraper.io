/**
 * Pipeline Sequence component - displays candidate steps with lock/reject actions
 */

import { Check, X, Zap, Code, Lock as LockIcon, AlertCircle, Info } from 'lucide-react';
import { useState } from 'react';
import type { PipelineCandidateStep } from '@/src/tools/api-signal-explorer/pipeline-candidate';

type PipelineSequenceProps = {
  candidateSteps: PipelineCandidateStep[];
  onLockStep: (stepId: string) => void;
  onRejectStep: (stepId: string) => void;
  onRenameStep: (stepId: string, newLabel: string) => void;
  onSelectStep?: (stepId: string) => void;
  selectedStepId?: string | null;
  isNewStep?: (stepId: string) => boolean;
  onToggleCodePreview?: () => void;
};

export default function PipelineSequence({
  candidateSteps,
  onLockStep,
  onRejectStep,
  onRenameStep,
  onSelectStep,
  selectedStepId,
  isNewStep,
  onToggleCodePreview,
}: PipelineSequenceProps) {
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // Filter out rejected steps
  const activeSteps = candidateSteps.filter(step => step.userStatus !== 'rejected');
  
  // Sort by timestamp (oldest first)
  const sortedSteps = [...activeSteps].sort((a, b) => a.action.ts - b.action.ts);

  const handleStartEdit = (step: PipelineCandidateStep) => {
    setEditingStepId(step.id);
    setEditValue(step.action.label || '');
  };

  const handleSaveEdit = (stepId: string) => {
    if (editValue.trim()) {
      onRenameStep(stepId, editValue.trim());
    }
    setEditingStepId(null);
    setEditValue('');
  };

  const handleCancelEdit = () => {
    setEditingStepId(null);
    setEditValue('');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-white/[0.01]">
        <div className="flex items-center gap-3">
          <Zap className="w-5 h-5 text-purple-400" />
          <h3 className="text-[11px] font-black tracking-[0.3em] text-white/20 uppercase">Pipeline Sequence</h3>
          <span className="text-[10px] font-mono text-white/30">{activeSteps.length} steps</span>
        </div>
        {onToggleCodePreview && (
          <button
            onClick={onToggleCodePreview}
            className="px-3 py-1.5 bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] rounded-lg text-xs font-bold text-white/60 hover:text-white/90 transition-all flex items-center gap-2"
            title="Toggle Code Preview"
          >
            <Code className="w-4 h-4" />
            Preview
          </button>
        )}
      </div>

      {/* Steps List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {sortedSteps.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-white/20 text-sm mb-2">No candidate steps yet</div>
            <div className="text-white/10 text-xs">Interact with the browser to generate steps</div>
          </div>
        ) : (
          sortedSteps.map((step, index) => {
            const isSelected = selectedStepId === step.id;
            const isEditing = editingStepId === step.id;
            const isLocked = step.userStatus === 'locked';
            // Detect if this is a newly created step
            const isNew = isNewStep ? isNewStep(step.id) : false;
            
            return (
              <div
                key={step.id}
                className={`border rounded-xl overflow-hidden transition-all animate-in fade-in slide-in-from-right-6 duration-500 ${
                  isLocked
                    ? 'bg-emerald-500/10 border-emerald-500/30 shadow-lg shadow-emerald-500/10'
                    : isSelected
                    ? 'bg-white/[0.06] border-white/20 shadow-lg'
                    : isNew
                    ? 'bg-purple-500/10 border-purple-500/30 shadow-lg shadow-purple-500/10 animate-pulse'
                    : 'bg-white/[0.02] border-white/[0.06] hover:border-white/10'
                }`}
                onClick={() => onSelectStep?.(step.id)}
              >
                {/* Step Header */}
                <div className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Step Number */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${
                      isLocked
                        ? 'bg-emerald-500 text-black'
                        : 'bg-white/[0.1] text-white/60'
                    }`}>
                      {index + 1}
                    </div>

                    {/* Step Content */}
                    <div className="flex-1 min-w-0">
                      {/* Action Label */}
                      <div className="flex items-center gap-2 mb-2">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit(step.id);
                              if (e.key === 'Escape') handleCancelEdit();
                            }}
                            onBlur={() => handleSaveEdit(step.id)}
                            autoFocus
                            className="flex-1 bg-black/40 border border-purple-500/50 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-purple-500"
                          />
                        ) : (
                          <>
                            <span className="text-sm font-bold text-white/90">
                              {step.action.label || `${step.action.type} action`}
                            </span>
                            {!isLocked && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStartEdit(step);
                                }}
                                className="text-white/20 hover:text-white/40 transition-colors"
                              >
                                ✏️
                              </button>
                            )}
                          </>
                        )}
                      </div>

                      {/* Strategy Badge */}
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                          step.strategy === 'api'
                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                            : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        }`}>
                          {step.strategy === 'api' ? (
                            <>
                              <Code className="w-3 h-3" />
                              API
                            </>
                          ) : (
                            <>
                              <Zap className="w-3 h-3" />
                              Browser Script
                            </>
                          )}
                          <span className="text-white/40 ml-1">
                            {(step.strategyConfidence * 100).toFixed(0)}%
                          </span>
                        </div>

                        {/* Event Count */}
                        {step.correlatedEvents.length > 0 && (
                          <span className="text-[10px] text-white/30">
                            {step.correlatedEvents.length} network event{step.correlatedEvents.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {/* Strategy Reasons */}
                      {step.strategyReasons.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {step.strategyReasons.slice(0, 2).map((reason, idx) => (
                            <div key={idx} className="flex items-start gap-2 text-[10px] text-white/40">
                              <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                              <span>{reason.reason}</span>
                            </div>
                          ))}
                          {step.strategyReasons.length > 2 && (
                            <div className="text-[10px] text-white/20">
                              +{step.strategyReasons.length - 2} more reason{step.strategyReasons.length - 2 !== 1 ? 's' : ''}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    {!isLocked && (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onLockStep(step.id);
                          }}
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 transition-all"
                          title="Lock Step"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRejectStep(step.id);
                          }}
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 transition-all"
                          title="Reject Step"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {isLocked && (
                      <div className="flex-shrink-0">
                        <LockIcon className="w-5 h-5 text-emerald-400" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
