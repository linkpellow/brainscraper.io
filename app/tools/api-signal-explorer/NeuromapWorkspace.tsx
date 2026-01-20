'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Pause, Play, Check, X, Download, Globe, Plus, MousePointer, Tag, Monitor, Rss, ChevronDown, ChevronRight, Copy, Code, Terminal, ArrowDown, Zap } from 'lucide-react';
import type { Neuromap, RawNetworkEvent } from '@/src/tools/api-signal-explorer/neuromap';
import { addEventToNeuromap, toggleEndpointSelection, exportNeuromap } from '@/src/tools/api-signal-explorer/neuromap';
import { createActionEvent, type ActionEvent, type ActionType } from '@/src/tools/api-signal-explorer/actions';
import { linkActionToEvents } from '@/src/tools/api-signal-explorer/correlate';
import { convertToNetworkSignal, getCategoryDescription, type CategoryTag } from '@/src/tools/api-signal-explorer/signals';

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
          const networkEvent: RawNetworkEvent = {
            ts: flow.ts || Date.now(),
            method: flow.method || 'GET',
            url: flow.url || '',
            status: flow.status,
            reqHeaders: flow.reqHeaders || {},
            resHeaders: flow.resHeaders || {},
            reqBodySize: flow.reqBodySize,
            resBodySize: flow.resBodySize,
            resMime: flow.resMime,
            durationMs: flow.durationMs,
          };

          const updated = addEventToNeuromap(neuromapRef.current, networkEvent);
          onUpdateRef.current(updated);

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

  return (
    <div className="w-full flex flex-col bg-black rounded-lg border border-slate-800 overflow-hidden" style={{ height: '88vh' }}>
      {/* Header */}
      <div className="shrink-0 bg-gradient-to-r from-slate-900 to-slate-800 border-b border-cyan-500/30 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="w-6 h-6 text-cyan-400" />
          <div>
            <h2 className="text-lg font-bold text-cyan-400 font-mono tracking-wide">API SIGNAL PIPELINE</h2>
            <div className="text-xs text-slate-500 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${wsStatus === 'connected' ? 'bg-green-400' : wsStatus === 'connecting' ? 'bg-yellow-400 animate-pulse' : 'bg-red-400'}`} />
              <span>{endpoints.length} endpoints captured</span>
              <span>•</span>
              <span>{selectedEndpoints.length} selected</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleMarkInteraction}
            className={`flex items-center gap-1.5 px-3 py-2 rounded text-xs font-medium ${
              isMarkingInteraction ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
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
            className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 rounded text-xs text-white"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        </div>
      </div>

      {/* PIPELINE STAGE 1: URL INPUT */}
      <div className="shrink-0 bg-gradient-to-r from-purple-900/20 to-transparent border-b border-purple-500/30 p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center justify-center w-8 h-8 bg-purple-600 rounded-full text-white font-bold text-sm">1</div>
          <h3 className="text-sm font-bold text-purple-400 tracking-wide">INPUT • TARGET URL</h3>
          <ArrowDown className="w-4 h-4 text-slate-600 ml-auto" />
        </div>
        <div className="flex gap-2">
          <input
            type="url"
            value={launchBrowserUrl}
            onChange={(e) => setLaunchBrowserUrl(e.target.value)}
            placeholder="https://api.example.com or https://example.com"
            className="flex-1 px-4 py-2.5 bg-slate-900 border border-purple-500/30 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/60"
          />
          <button
            onClick={handleLaunchBrowser}
            disabled={launchBrowserLoading}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 rounded-lg text-sm text-white font-medium transition-all"
          >
            <Monitor className="w-4 h-4" />
            {launchBrowserLoading ? 'Launching...' : 'Launch Browser'}
          </button>
        </div>
        {launchBrowserError && (
          <p className="mt-2 text-amber-400 text-xs">{launchBrowserError}</p>
        )}
      </div>

      {/* PIPELINE STAGE 2: NETWORK LOGS */}
      <div className="flex-1 flex flex-col min-h-0 bg-gradient-to-r from-cyan-900/10 to-transparent border-b border-cyan-500/30">
        <div className="shrink-0 flex items-center gap-3 p-4 pb-3 border-b border-slate-800">
          <div className="flex items-center justify-center w-8 h-8 bg-cyan-600 rounded-full text-white font-bold text-sm">2</div>
          <h3 className="text-sm font-bold text-cyan-400 tracking-wide">CAPTURE • NETWORK TRAFFIC</h3>
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
          {filteredEndpoints.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">
              <div className="text-center">
                <Monitor className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No traffic captured yet</p>
                <p className="text-xs mt-1">Launch browser and browse a site</p>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredEndpoints.map((ep, idx) => {
                const key = `${ep.method} ${ep.host}${ep.path}`;
                const isSelected = selectedEndpoint?.sampleUrl === ep.sampleUrl;
                return (
                  <div
                    key={idx}
                    onClick={() => setSelectedEndpoint(ep)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-cyan-900/40 border-cyan-500/60 shadow-lg shadow-cyan-500/20'
                        : 'bg-slate-900/50 border-slate-700/50 hover:bg-slate-800/60 hover:border-slate-600/60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        ep.method === 'GET' ? 'bg-green-900/50 text-green-300' :
                        ep.method === 'POST' ? 'bg-blue-900/50 text-blue-300' :
                        ep.method === 'PUT' ? 'bg-yellow-900/50 text-yellow-300' :
                        ep.method === 'DELETE' ? 'bg-red-900/50 text-red-300' :
                        'bg-slate-700 text-slate-300'
                      }`}>
                        {ep.method}
                      </span>
                      <span className="flex-1 text-sm text-slate-300 font-mono truncate">
                        {ep.host}<span className="text-cyan-400">{ep.path}</span>
                      </span>
                      <span className="text-xs text-slate-500">×{ep.count}</span>
                      {ep.hasAuth && (
                        <span className="px-1.5 py-0.5 bg-amber-900/30 text-amber-400 text-xs rounded" title="Has auth headers">🔐</span>
                      )}
                      {isSelected && (
                        <Check className="w-4 h-4 text-cyan-400" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* PIPELINE STAGE 3: CODE SNIPPETS */}
      <div className="shrink-0 bg-gradient-to-r from-green-900/20 to-transparent" style={{ height: '30%' }}>
        <div className="h-full flex flex-col">
          <div className="shrink-0 flex items-center gap-3 p-4 pb-3 border-b border-slate-800">
            <div className="flex items-center justify-center w-8 h-8 bg-green-600 rounded-full text-white font-bold text-sm">3</div>
            <h3 className="text-sm font-bold text-green-400 tracking-wide">OUTPUT • CODE SNIPPETS</h3>
            <div className="ml-auto flex items-center gap-2">
              {(['curl', 'fetch', 'axios', 'python'] as CodeSnippetLang[]).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setSnippetLang(lang)}
                  className={`px-3 py-1 text-xs rounded-lg font-medium transition-all ${
                    snippetLang === lang
                      ? 'bg-green-600 text-white shadow-lg'
                      : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4">
            {!selectedEndpoint ? (
              <div className="flex items-center justify-center h-full text-slate-500 text-sm">
                <div className="text-center">
                  <Terminal className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Select an endpoint above to generate code</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Code className="w-4 h-4 text-green-400" />
                    <span className="text-xs text-slate-400 font-mono">{selectedEndpoint.method} {selectedEndpoint.host}{selectedEndpoint.path}</span>
                  </div>
                  <button
                    onClick={() => {
                      const code = snippetLang === 'curl' ? generateCurl(selectedEndpoint) :
                                   snippetLang === 'fetch' ? generateFetch(selectedEndpoint) :
                                   snippetLang === 'axios' ? generateAxios(selectedEndpoint) :
                                   generatePython(selectedEndpoint);
                      copyToClipboard(code, () => {
                        setCopiedEndpoint(selectedEndpoint.sampleUrl);
                        setTimeout(() => setCopiedEndpoint(null), 2000);
                      });
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded text-xs text-white font-medium"
                  >
                    {copiedEndpoint === selectedEndpoint.sampleUrl ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copiedEndpoint === selectedEndpoint.sampleUrl ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <pre className="p-4 bg-slate-950 border border-slate-700 rounded-lg text-xs text-green-300 font-mono overflow-x-auto">
                  {snippetLang === 'curl' && generateCurl(selectedEndpoint)}
                  {snippetLang === 'fetch' && generateFetch(selectedEndpoint)}
                  {snippetLang === 'axios' && generateAxios(selectedEndpoint)}
                  {snippetLang === 'python' && generatePython(selectedEndpoint)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
