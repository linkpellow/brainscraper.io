'use client';

import AppLayout from '../components/AppLayout';
import WorkflowBuilder from '../components/WorkflowBuilder';
import { useState } from 'react';
import { Zap, Workflow, Save, Play } from 'lucide-react';

export default function ExperimentalPage() {
  const [savedWorkflows, setSavedWorkflows] = useState<any[]>([]);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);

  const handleSave = (workflow: { nodes: any[]; connections: any[] }) => {
    const newWorkflow = {
      id: `workflow-${Date.now()}`,
      name: 'New Workflow',
      ...workflow,
      savedAt: new Date().toISOString(),
    };
    setSavedWorkflows(prev => [...prev, newWorkflow]);
    setShowSaveSuccess(true);
    setTimeout(() => setShowSaveSuccess(false), 3000);
    console.log('Saved workflow:', newWorkflow);
  };

  const handleRun = (workflow: { nodes: any[]; connections: any[] }) => {
    console.log('Running workflow:', workflow);
    // Pipeline execution will be implemented
    alert(`Pipeline execution: ${workflow.nodes.length} nodes, ${workflow.connections.length} connections`);
  };

  return (
    <AppLayout>
      <div className="w-full h-screen flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700/50 bg-slate-900/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-gray-600 to-gray-500">
                <Workflow className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Workflow Builder</h1>
                <p className="text-xs text-slate-400">Create automated workflows with visual builder</p>
              </div>
            </div>
            {showSaveSuccess && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <Save className="w-4 h-4 text-white" />
                <span className="text-sm text-white">Workflow saved!</span>
              </div>
            )}
          </div>
        </div>

        {/* Workflow Builder */}
        <div className="flex-1 overflow-hidden px-6 pb-6">
          <div className="h-full">
            <WorkflowBuilder onSave={handleSave} onRun={handleRun} />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
