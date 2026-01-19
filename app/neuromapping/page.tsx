'use client';

import { useState } from 'react';
import AppLayout from '@/app/components/AppLayout';
import { Brain, Network, Zap, Activity } from 'lucide-react';

export default function NeuromappingPage() {
  const [selectedView, setSelectedView] = useState<'overview' | 'network' | 'activity'>('overview');

  return (
    <AppLayout>
      <div className="p-8 space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight flex items-center gap-3" style={{ color: '#ff5757' }}>
            <Brain className="w-10 h-10" />
            Neuromapping
          </h1>
          <p className="text-white/60 text-lg">
            Visualize and analyze neural network patterns and data flows
          </p>
        </div>

        {/* View Tabs */}
        <div className="flex gap-2 border-b border-white/10">
          <button
            onClick={() => setSelectedView('overview')}
            className={`px-4 py-2 font-medium text-sm transition-all ${
              selectedView === 'overview'
                ? 'text-white border-b-2'
                : 'text-white/60 hover:text-white/80'
            }`}
            style={selectedView === 'overview' ? { borderBottomColor: '#ff5757', color: '#ff5757' } : {}}
          >
            Overview
          </button>
          <button
            onClick={() => setSelectedView('network')}
            className={`px-4 py-2 font-medium text-sm transition-all ${
              selectedView === 'network'
                ? 'text-white border-b-2'
                : 'text-white/60 hover:text-white/80'
            }`}
            style={selectedView === 'network' ? { borderBottomColor: '#ff5757', color: '#ff5757' } : {}}
          >
            Network Map
          </button>
          <button
            onClick={() => setSelectedView('activity')}
            className={`px-4 py-2 font-medium text-sm transition-all ${
              selectedView === 'activity'
                ? 'text-white border-b-2'
                : 'text-white/60 hover:text-white/80'
            }`}
            style={selectedView === 'activity' ? { borderBottomColor: '#ff5757', color: '#ff5757' } : {}}
          >
            Activity Monitor
          </button>
        </div>

        {/* Content Area */}
        <div className="panel-inactive rounded-xl p-6 min-h-[600px]">
          {selectedView === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="panel-active rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 text-white/80">
                    <Network className="w-5 h-5" />
                    <span className="font-medium">Active Nodes</span>
                  </div>
                  <div className="text-3xl font-bold text-white">0</div>
                  <div className="text-sm text-white/60">No active connections</div>
                </div>

                <div className="panel-active rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 text-white/80">
                    <Zap className="w-5 h-5" />
                    <span className="font-medium">Data Flow</span>
                  </div>
                  <div className="text-3xl font-bold text-white">0 KB/s</div>
                  <div className="text-sm text-white/60">No data transmission</div>
                </div>

                <div className="panel-active rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 text-white/80">
                    <Activity className="w-5 h-5" />
                    <span className="font-medium">Processing Rate</span>
                  </div>
                  <div className="text-3xl font-bold text-white">0 ops/s</div>
                  <div className="text-sm text-white/60">System idle</div>
                </div>
              </div>

              <div className="panel-active rounded-lg p-6">
                <h2 className="text-xl font-bold text-white mb-4">System Status</h2>
                <div className="space-y-3 text-white/80">
                  <p>Neuromapping system is ready for configuration.</p>
                  <p className="text-sm text-white/60">
                    Connect data sources and configure network mappings to begin visualization.
                  </p>
                </div>
              </div>
            </div>
          )}

          {selectedView === 'network' && (
            <div className="space-y-4">
              <div className="panel-active rounded-lg p-6 min-h-[500px] flex items-center justify-center">
                <div className="text-center space-y-2">
                  <Network className="w-16 h-16 mx-auto text-white/20" />
                  <p className="text-white/60">Network visualization will appear here</p>
                </div>
              </div>
            </div>
          )}

          {selectedView === 'activity' && (
            <div className="space-y-4">
              <div className="panel-active rounded-lg p-6 min-h-[500px] flex items-center justify-center">
                <div className="text-center space-y-2">
                  <Activity className="w-16 h-16 mx-auto text-white/20" />
                  <p className="text-white/60">Activity monitoring will appear here</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
