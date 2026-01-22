/**
 * Export Controls - Enhanced export options with preview
 */

import { useState } from 'react';
import { Download, FileJson, Eye, X } from 'lucide-react';
import type { LockedStep } from '../types';
import type { PipelineCandidateStep } from '@/src/tools/api-signal-explorer/pipeline-candidate';

type ExportControlsProps = {
  lockedSteps: LockedStep[];
  candidateSteps?: PipelineCandidateStep[];
  onExportAll?: () => void;
  onExportSelected?: (stepIds: string[]) => void;
  onExportHAR?: () => void;
};

export default function ExportControls({
  lockedSteps,
  candidateSteps = [],
  onExportAll,
  onExportSelected,
  onExportHAR,
}: ExportControlsProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [selectedStepIds, setSelectedStepIds] = useState<Set<string>>(new Set());

  const handleToggleSelection = (stepId: string) => {
    const newSelected = new Set(selectedStepIds);
    if (newSelected.has(stepId)) {
      newSelected.delete(stepId);
    } else {
      newSelected.add(stepId);
    }
    setSelectedStepIds(newSelected);
  };

  const handleExportSelected = () => {
    if (selectedStepIds.size > 0 && onExportSelected) {
      onExportSelected(Array.from(selectedStepIds));
    }
  };

  const handlePreview = () => {
    const selectedSteps = lockedSteps.filter(s => selectedStepIds.has(s.id));
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      steps: selectedSteps.length > 0 ? selectedSteps : lockedSteps,
      metadata: {
        totalSteps: selectedSteps.length || lockedSteps.length,
        sessionInfo: {},
      },
    };
    
    // Show in modal (for now, just log - can be enhanced with proper modal)
    setShowPreview(true);
  };

  const exportJson = () => {
    const selectedSteps = lockedSteps.filter(s => selectedStepIds.size === 0 || selectedStepIds.has(s.id));
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      steps: selectedSteps,
      metadata: {
        totalSteps: selectedSteps.length,
        sessionInfo: {},
      },
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pipeline-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex items-center gap-3">
      {/* Export All */}
      {onExportAll && lockedSteps.length > 0 && (
        <button
          onClick={onExportAll}
          className="px-4 py-2 bg-white/[0.08] hover:bg-white/[0.12] border border-white/[0.1] rounded-lg text-xs font-bold text-white/70 hover:text-white/90 transition-all flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          Export All
        </button>
      )}

      {/* Export Selected */}
      {onExportSelected && lockedSteps.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportSelected}
              disabled={selectedStepIds.size === 0}
              className="px-4 py-2 bg-white/[0.08] hover:bg-white/[0.12] border border-white/[0.1] rounded-lg text-xs font-bold text-white/70 hover:text-white/90 transition-all flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              Export Selected ({selectedStepIds.size})
            </button>
            <button
              onClick={handlePreview}
              className="px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 rounded-lg text-xs font-bold text-purple-400 transition-all flex items-center gap-2"
            >
              <Eye className="w-4 h-4" />
              Preview JSON
            </button>
          </div>
        </>
      )}

      {/* Export HAR */}
      {onExportHAR && (
        <button
          onClick={onExportHAR}
          className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg text-xs font-bold text-blue-400 transition-all flex items-center gap-2"
        >
          <FileJson className="w-4 h-4" />
          Export HAR
        </button>
      )}

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="w-[800px] h-[600px] bg-[#0d0d0d] border border-white/[0.1] rounded-2xl flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileJson className="w-5 h-5 text-purple-400" />
                <h3 className="text-sm font-black text-white/90">JSON Preview</h3>
              </div>
              <button
                onClick={() => setShowPreview(false)}
                className="text-white/20 hover:text-white/40 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <pre className="text-xs font-mono text-white/80 leading-relaxed whitespace-pre-wrap">
                {JSON.stringify(
                  {
                    version: '1.0',
                    exportedAt: new Date().toISOString(),
                    steps: selectedStepIds.size > 0
                      ? lockedSteps.filter(s => selectedStepIds.has(s.id))
                      : lockedSteps,
                    metadata: {
                      totalSteps: selectedStepIds.size > 0 ? selectedStepIds.size : lockedSteps.length,
                    },
                  },
                  null,
                  2
                )}
              </pre>
            </div>
            <div className="px-6 py-4 border-t border-white/[0.06] flex items-center justify-end gap-3">
              <button
                onClick={() => setShowPreview(false)}
                className="px-4 py-2 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.1] rounded-lg text-xs font-bold text-white/60 hover:text-white/80 transition-all"
              >
                Close
              </button>
              <button
                onClick={() => {
                  exportJson();
                  setShowPreview(false);
                }}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-xs font-black text-white transition-all flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Export JSON
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
