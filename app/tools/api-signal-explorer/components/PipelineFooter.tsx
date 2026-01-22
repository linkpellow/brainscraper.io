/**
 * PipelineFooter component - bottom pipeline view
 */

import { ChevronRight } from 'lucide-react';
import type { LockedStep } from '../types';

type PipelineFooterProps = {
  lockedSteps: LockedStep[];
  onExportWorkflow: () => void;
};

export default function PipelineFooter({ lockedSteps, onExportWorkflow }: PipelineFooterProps) {
  return (
    <footer className="h-28 shrink-0 px-8 border-t border-white/[0.06] bg-black/60 backdrop-blur-3xl flex items-center gap-8 overflow-x-auto no-scrollbar z-[70]">
      <div className="flex flex-col min-w-max border-r border-white/10 pr-8">
        <span className="text-[10px] font-black tracking-[0.3em] text-white/20 uppercase mb-1">Pipeline</span>
        <span className="text-lg font-bold text-white/80 tracking-tight">{lockedSteps.length} Steps Sequence</span>
      </div>
      
      <div className="flex items-center gap-6 flex-1">
        {lockedSteps.length === 0 ? (
          <div className="flex items-center gap-4 px-8 h-16 rounded-xl border border-dashed border-white/10 text-white/20 text-sm font-bold tracking-tight">
            Analyze and lock endpoints to build your automation sequence
          </div>
        ) : (
          lockedSteps.map((step, i) => (
            <div key={step.id} className="flex items-center gap-5 shrink-0 animate-in fade-in slide-in-from-left-6 duration-700" style={{ transitionDelay: `${i * 100}ms` }}>
              <div className="h-16 px-6 flex items-center gap-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl shadow-lg shadow-emerald-500/5 hover:bg-emerald-500/15 transition-all">
                <div className="w-8 h-8 rounded-full bg-emerald-500 text-black flex items-center justify-center text-xs font-black shadow-lg">
                  {step.stepNumber}
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-black text-emerald-400 font-mono leading-none">{step.method}</span>
                  <span className="text-sm font-bold text-white/90 max-w-[200px] truncate tracking-tight leading-none">{step.endpoint}</span>
                  {step.dependencies && step.dependencies.length > 0 && (
                    <span className="text-[10px] font-mono text-white/40 leading-none">{step.dependencies.length} deps</span>
                  )}
                </div>
              </div>
              {i < lockedSteps.length - 1 && <ChevronRight className="w-6 h-6 text-white/20 flex-shrink-0" />}
            </div>
          ))
        )}
      </div>

      {lockedSteps.length > 0 && (
        <button 
          onClick={onExportWorkflow}
          className="ml-auto px-8 h-14 bg-white text-black hover:bg-slate-200 rounded-xl text-sm font-black transition-all shadow-2xl shadow-white/10 active:scale-95 flex-shrink-0"
        >
          GENERATE WORKFLOW
        </button>
      )}
    </footer>
  );
}
