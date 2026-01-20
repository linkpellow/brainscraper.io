'use client';

import { ChevronDown, ChevronRight, Target, AlertCircle, CheckCircle, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import type { AgentState } from '@/utils/ai/agent-rules';

type AgentScratchpadProps = {
  state: AgentState;
};

export default function AgentScratchpad({ state }: AgentScratchpadProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const getCertaintyColor = (level: number) => {
    if (level >= 80) return 'text-green-400';
    if (level >= 50) return 'text-amber-400';
    return 'text-red-400';
  };

  const getPhaseIcon = (phase: string) => {
    const completed = state.goalsAchieved.some(g => g.includes(phase));
    return completed ? '✓' : '○';
  };

  return (
    <div className="border-t border-slate-700/50 bg-slate-900/30">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-center justify-between hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? <ChevronDown className="w-3 h-3 text-slate-500" /> : <ChevronRight className="w-3 h-3 text-slate-500" />}
          <span className="text-xs font-medium text-slate-400">Agent Scratchpad</span>
        </div>
        <div className={`text-xs ${getCertaintyColor(state.userConfidence)}`}>
          {state.userConfidence}% confidence
        </div>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-3 text-xs">
          {/* Current Phase */}
          <div>
            <div className="text-slate-500 mb-1">Current Phase:</div>
            <div className="flex items-center gap-2 px-2 py-1 bg-purple-900/20 border border-purple-600/30 rounded">
              <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
              <span className="text-purple-400 font-medium">{state.currentPhase.toUpperCase()}</span>
            </div>
          </div>

          {/* Current Objective */}
          <div>
            <div className="text-slate-500 mb-1">Current Objective:</div>
            <div className="flex items-start gap-2 px-2 py-1.5 bg-slate-800 rounded">
              <Target className="w-3 h-3 text-blue-400 mt-0.5 shrink-0" />
              <span className="text-slate-300">{state.currentObjective}</span>
            </div>
          </div>

          {/* Next Action */}
          <div>
            <div className="text-slate-500 mb-1">Next Action:</div>
            <div className="px-2 py-1.5 bg-green-900/20 border border-green-600/30 rounded text-green-400">
              → {state.nextAction}
            </div>
          </div>

          {/* Certainty Levels */}
          <div>
            <div className="text-slate-500 mb-1">Certainty Pillars:</div>
            <div className="space-y-1">
              <div className="flex items-center justify-between px-2">
                <span className="text-slate-400">Workflow:</span>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-red-500 to-green-500 transition-all duration-500"
                      style={{ width: `${state.certaintyLevels.workflow}%` }}
                    />
                  </div>
                  <span className={getCertaintyColor(state.certaintyLevels.workflow)}>
                    {state.certaintyLevels.workflow}%
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between px-2">
                <span className="text-slate-400">Messenger:</span>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-red-500 to-green-500 transition-all duration-500"
                      style={{ width: `${state.certaintyLevels.messenger}%` }}
                    />
                  </div>
                  <span className={getCertaintyColor(state.certaintyLevels.messenger)}>
                    {state.certaintyLevels.messenger}%
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between px-2">
                <span className="text-slate-400">System:</span>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-red-500 to-green-500 transition-all duration-500"
                      style={{ width: `${state.certaintyLevels.system}%` }}
                    />
                  </div>
                  <span className={getCertaintyColor(state.certaintyLevels.system)}>
                    {state.certaintyLevels.system}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Blockers */}
          {state.blockers.length > 0 && (
            <div>
              <div className="text-slate-500 mb-1">Blockers:</div>
              <div className="space-y-1">
                {state.blockers.map((blocker, idx) => (
                  <div key={idx} className="flex items-start gap-2 px-2 py-1 bg-red-900/20 border border-red-600/30 rounded">
                    <AlertCircle className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />
                    <span className="text-red-400">{blocker}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Goals Achieved */}
          {state.goalsAchieved.length > 0 && (
            <div>
              <div className="text-slate-500 mb-1">Achieved:</div>
              <div className="space-y-1">
                {state.goalsAchieved.map((goal, idx) => (
                  <div key={idx} className="flex items-center gap-2 px-2 py-1 text-green-400">
                    <CheckCircle className="w-3 h-3 shrink-0" />
                    <span>{goal}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Progress Pipeline */}
          <div>
            <div className="text-slate-500 mb-1">Pipeline Progress:</div>
            <div className="flex items-center gap-1 text-xs">
              {['goal', 'constraints', 'target', 'capture', 'test', 'lock'].map((phase, idx) => (
                <div key={phase} className="flex items-center">
                  <div className={`px-1.5 py-0.5 rounded ${
                    state.currentPhase === phase 
                      ? 'bg-purple-600 text-white' 
                      : state.goalsAchieved.some(g => g.toLowerCase().includes(phase))
                        ? 'bg-green-900/30 text-green-400'
                        : 'bg-slate-800 text-slate-600'
                  }`}>
                    {getPhaseIcon(phase)} {phase}
                  </div>
                  {idx < 5 && <span className="text-slate-700 mx-0.5">→</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          {state.conversationHistory.length > 0 && (
            <div>
              <div className="text-slate-500 mb-1">Recent Activity:</div>
              <div className="space-y-0.5 max-h-20 overflow-y-auto">
                {state.conversationHistory.slice(-3).reverse().map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 px-2 py-0.5 text-slate-400">
                    <span className={
                      item.outcome === 'success' ? 'text-green-500' :
                      item.outcome === 'failed' ? 'text-red-500' :
                      'text-amber-500'
                    }>
                      {item.outcome === 'success' ? '✓' : item.outcome === 'failed' ? '✗' : '○'}
                    </span>
                    <span className="text-xs truncate">{item.action}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
