/**
 * WorkbenchMain component - main content area with endpoint list
 */

import { Globe, Monitor, Loader2, Rss, Filter, BookOpen } from 'lucide-react';
import type { WorkflowMode, EndpointData } from '../types';
import EndpointCard from './EndpointCard';

type WorkbenchMainProps = {
  workflowMode: WorkflowMode;
  launchBrowserUrl: string;
  onLaunchBrowserUrlChange: (url: string) => void;
  onLaunchBrowser: () => void;
  launchBrowserLoading: boolean;
  launchBrowserError: string | null;
  isProduction: boolean;
  endpoints: EndpointData[];
  selectedEndpoint: EndpointData | null;
  onSelectEndpoint: (endpoint: EndpointData) => void;
  showOnlyRelevant: boolean;
  onToggleFilter: (value: boolean) => void;
  onAddChatMessage: (message: string) => void;
};

export default function WorkbenchMain({
  workflowMode,
  launchBrowserUrl,
  onLaunchBrowserUrlChange,
  onLaunchBrowser,
  launchBrowserLoading,
  isProduction,
  endpoints,
  selectedEndpoint,
  onSelectEndpoint,
  showOnlyRelevant,
  onToggleFilter,
  onAddChatMessage,
}: WorkbenchMainProps) {
  return (
    <main className="flex-1 overflow-y-auto overflow-x-hidden relative">
      <div className="w-full px-8 py-8">
        
        {/* Contextual Action Bar */}
        <div className="mb-8">
          {workflowMode === 'mobile' ? (
            <div className="flex items-center justify-between animate-in fade-in slide-in-from-top-4 duration-700">
              <div className="space-y-3">
                <h1 className="text-2xl font-bold tracking-tight text-white leading-tight">Mobile Discovery</h1>
                <p className="text-white/40 text-sm max-w-xl">
                  Proxy your device to <span className="font-mono text-purple-400 font-bold bg-purple-500/10 px-2 py-0.5 rounded">172.20.9.66:8080</span> to intercept app traffic.
                </p>
              </div>
              <button
                onClick={() => onAddChatMessage('Showing mobile proxy setup instructions...')}
                className="px-6 py-3 bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] rounded-xl text-xs font-bold transition-all flex items-center gap-2 active:scale-95"
              >
                <BookOpen className="w-5 h-5 text-purple-400" />
                Setup Guide
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-top-4 duration-700">
              <div className="space-y-3">
                <h1 className="text-2xl font-bold tracking-tight text-white leading-tight">Browser Workbench</h1>
                <p className="text-white/40 text-sm max-w-xl">Initialize an automated session to build your extraction pipeline.</p>
              </div>
              <div className="flex items-center gap-3 p-3 bg-white/[0.02] border border-white/[0.06] rounded-[2rem] backdrop-blur-xl shadow-2xl transition-all focus-within:border-blue-500/30">
                <div className="flex-1 flex items-center gap-4 px-5">
                  <Globe className="w-6 h-6 text-blue-400" />
                  <input
                    type="url"
                    value={launchBrowserUrl}
                    onChange={(e) => onLaunchBrowserUrlChange(e.target.value)}
                    placeholder="Target domain or specific URL..."
                    className="w-full bg-transparent border-none focus:ring-0 text-white/90 placeholder-white/20 text-base font-medium tracking-tight"
                  />
                </div>
                <button
                  onClick={onLaunchBrowser}
                  disabled={launchBrowserLoading || isProduction}
                  className="h-12 px-8 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl text-xs font-black shadow-xl shadow-blue-600/30 transition-all flex items-center gap-2 active:scale-95"
                >
                  {launchBrowserLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Monitor className="w-5 h-5" />}
                  LAUNCH SESSION
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Traffic Stream */}
        <div className="space-y-6">
          <div className="flex items-center justify-between mb-8 px-4">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <h3 className="text-[11px] font-black tracking-[0.3em] text-white/20 uppercase">Signal Stream</h3>
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2.5 text-xs font-bold text-white/30 cursor-pointer hover:text-white/60 transition-all group">
                <Filter className={`w-4 h-4 transition-colors ${showOnlyRelevant ? 'text-purple-400' : ''}`} />
                <input 
                  type="checkbox" 
                  checked={showOnlyRelevant} 
                  onChange={e => onToggleFilter(e.target.checked)} 
                  className="hidden" 
                />
                SMART FILTER
              </label>
              <div className="h-4 w-[1px] bg-white/10" />
              <span className="text-[11px] font-bold text-white/20 font-mono tracking-widest">{endpoints.length} SIGNALS</span>
            </div>
          </div>

          {/* SPACIOUS ENDPOINT LIST */}
          <div className="grid gap-4">
            {endpoints.length === 0 ? (
              <div className="py-32 flex flex-col items-center justify-center text-center bg-white/[0.01] border border-dashed border-white/[0.06] rounded-2xl animate-in fade-in duration-1000">
                <div className="w-16 h-16 rounded-full bg-white/[0.03] flex items-center justify-center mb-6 border border-white/[0.05]">
                  <Rss className="w-10 h-10 text-white/10" />
                </div>
                <h4 className="text-lg font-semibold text-white/60 mb-3">Awaiting Connection</h4>
                <p className="text-white/20 max-w-sm leading-relaxed">Incoming API traffic will appear here automatically once your session or device is connected.</p>
              </div>
            ) : (
              endpoints.map((ep, idx) => (
                <EndpointCard
                  key={idx}
                  endpoint={ep}
                  isSelected={selectedEndpoint?.sampleUrl === ep.sampleUrl}
                  onClick={() => onSelectEndpoint(ep)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
