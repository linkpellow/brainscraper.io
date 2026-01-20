'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Pause, Play, Check, X, Download, Globe, Plus, MousePointer, Tag, Monitor, Rss, ChevronDown, ChevronRight } from 'lucide-react';
import type { Neuromap, RawNetworkEvent } from '@/src/tools/api-signal-explorer/neuromap';
import { addEventToNeuromap, toggleEndpointSelection, exportNeuromap } from '@/src/tools/api-signal-explorer/neuromap';
import { createActionEvent, type ActionEvent, type ActionType } from '@/src/tools/api-signal-explorer/actions';
import { linkActionToEvents } from '@/src/tools/api-signal-explorer/correlate';
import { convertToNetworkSignal, getCategoryDescription, type CategoryTag } from '@/src/tools/api-signal-explorer/signals';
import DiagnosticsLayout from './DiagnosticsLayout';
import LogsScreenPanel from './LogsScreenPanel';
import DeepReconPanel from './DeepReconPanel';

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
  type DomFeedItem = {
    id: string;
    domAction: { selector?: string; xpath?: string; text?: string };
    chosen?: { method: string; url: string; reqHeaders?: Record<string, string>; resHeaders?: Record<string, string>; reqBody?: string; resBody?: string };
  };
  const [domActionFeed, setDomActionFeed] = useState<DomFeedItem[]>([]);
  const [selectedFeedItem, setSelectedFeedItem] = useState<DomFeedItem | null>(null);
  const [feedOpen, setFeedOpen] = useState(true);
  const [wasmDecompiled, setWasmDecompiled] = useState<Array<{ ok: boolean; path: string; url?: string; error?: string; wat?: string; endpoints: string[]; keys: string[]; crypto: string[]; exportedFuncs: string[]; jsStubs: string }>>([]);
  const [heapFindings, setHeapFindings] = useState<{ ok: boolean; method: string; error?: string; stringsTotal: number; findings: Array<{ type: string; value: string; hint: string }>; sample: string[] } | null>(null);
  const [wssFrames, setWssFrames] = useState<Array<{ flow_id?: string; from_client?: boolean; content?: string; is_text?: boolean; ts?: number }>>([]);
  const [hiddenDomFindings, setHiddenDomFindings] = useState<Array<{ type: string; selector?: string; valueSnippet?: string; attr?: string }>>([]);
  const endpointMapRef = useRef<Map<string, EndpointData>>(new Map());

  const highlightKey = useMemo(() => {
    const last = domActionFeed[domActionFeed.length - 1]?.chosen;
    if (!last?.url) return null;
    try { const u = new URL(last.url); return `${last.method || 'GET'} ${u.hostname}${u.pathname}`; } catch { return null; }
  }, [domActionFeed]);
  const wsRef = useRef<WebSocket | null>(null);
  const interactionStartRef = useRef<number | null>(null);
  const onUpdateRef = useRef(onUpdate);
  const neuromapRef = useRef(neuromap);
  onUpdateRef.current = onUpdate;
  neuromapRef.current = neuromap;

  // Action events are handled in the main WebSocket message handler below

  // Connect to WebSocket for live API stream
  useEffect(() => {
    if (isPaused) return;

    setWsStatus('connecting');
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let connectionAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;
    const RECONNECT_DELAY = 3000; // 3 seconds

    const connect = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        return; // Already connected
      }

      try {
        const ws = new WebSocket(effectiveWsUrl);
        wsRef.current = ws;
        connectionAttempts++;

        ws.onopen = () => {
          setWsStatus('connected');
          connectionAttempts = 0; // Reset on successful connection
          ws.send(JSON.stringify({ type: 'get_history' }));
          
          // Clear any pending reconnect timeout
          if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
          }
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as {
          type: string;
          action?: ActionEvent;
          eventType?: string;
          selector?: string;
          xpath?: string;
          timestamp?: number;
          data?: Array<{
            ts: number;
            method: string;
            url: string;
            status?: number;
            reqHeaders?: Record<string, string>;
            resHeaders?: Record<string, string>;
            reqBodySize?: number;
            resBodySize?: number;
            resMime?: string;
            durationMs?: number;
          }>;
        };

        if (message.type === 'action' && message.action) {
          const action = message.action;
          const nm = neuromapRef.current;
          const updatedNeuromap = { ...nm };
          updatedNeuromap.actions.push(action);
          linkActionToEvents(action, updatedNeuromap.events, { windowMs: 2000 });
          onUpdateRef.current(updatedNeuromap);
        } else if (message.type === 'target-action' && message.xpath != null && message.selector != null && typeof message.timestamp === 'number') {
          const eventType: ActionType = (message.eventType === 'click' || message.eventType === 'mouseover') ? message.eventType as 'click' | 'mouseover' : 'click';
          const action: ActionEvent = {
            id: `target_${message.timestamp}_${Math.random().toString(36).slice(2, 10)}`,
            ts: message.timestamp,
            type: eventType,
            meta: { selector: message.selector, xpath: message.xpath },
          };
          const nm = neuromapRef.current;
          const updatedNeuromap = { ...nm };
          updatedNeuromap.actions.push(action);
          linkActionToEvents(action, updatedNeuromap.events, { windowMs: 2000 });
          onUpdateRef.current(updatedNeuromap);
        } else if (message.type === 'events_batch' && message.data) {
          // Convert to RawNetworkEvent
          const newEvents: RawNetworkEvent[] = message.data
            .map(flow => {
              try {
                const url = new URL(flow.url);
                // Extract query parameters
                const query: Record<string, string | string[]> = {};
                url.searchParams.forEach((value, key) => {
                  if (query[key]) {
                    const existing = query[key];
                    query[key] = Array.isArray(existing) ? [...existing, value] : [existing as string, value];
                  } else {
                    query[key] = value;
                  }
                });

                return {
                  ts: flow.ts,
                  method: flow.method,
                  url: flow.url,
                  path: url.pathname,
                  host: url.hostname,
                  status: flow.status,
                  reqHeaders: flow.reqHeaders,
                  resHeaders: flow.resHeaders,
                  reqCookies: {}, // Will be extracted from headers if available
                  reqBodySize: flow.reqBodySize,
                  resBodySize: flow.resBodySize,
                  resMime: flow.resMime,
                  query,
                  phase: undefined,
                  actionTag: undefined,
                  source: neuromapRef.current.mode,
                  durationMs: flow.durationMs,
                } as RawNetworkEvent;
              } catch (e) {
                return null;
              }
            })
            .filter((e): e is RawNetworkEvent => e !== null);

          // Add to neuromap
          const updatedNeuromap = { ...neuromapRef.current };
          for (const event of newEvents) {
            addEventToNeuromap(updatedNeuromap, event);
            updateEndpointIncremental(event);
          }

          // Re-correlate all actions to new events (3s window for Electron)
          for (const action of updatedNeuromap.actions) {
            linkActionToEvents(action, updatedNeuromap.events, { windowMs: 2000 });
          }

          onUpdateRef.current(updatedNeuromap);
        } else if (message.type === 'history' && message.data) {
          // Load history
          const historyEvents: RawNetworkEvent[] = message.data
            .map(flow => {
              try {
                const url = new URL(flow.url);
                // Extract query parameters
                const query: Record<string, string | string[]> = {};
                url.searchParams.forEach((value, key) => {
                  if (query[key]) {
                    const existing = query[key];
                    query[key] = Array.isArray(existing) ? [...existing, value] : [existing as string, value];
                  } else {
                    query[key] = value;
                  }
                });

                // Extract cookies from headers
                const reqCookies: Record<string, string> = {};
                if (flow.reqHeaders) {
                  const cookieHeader = flow.reqHeaders['cookie'] || flow.reqHeaders['Cookie'];
                  if (cookieHeader) {
                    cookieHeader.split(';').forEach(cookie => {
                      const [name, ...valueParts] = cookie.trim().split('=');
                      if (name && valueParts.length > 0) {
                        reqCookies[name.trim()] = valueParts.join('=').trim();
                      }
                    });
                  }
                }

                return {
                  ts: flow.ts,
                  method: flow.method,
                  url: flow.url,
                  path: url.pathname,
                  host: url.hostname,
                  status: flow.status,
                  reqHeaders: flow.reqHeaders,
                  resHeaders: flow.resHeaders,
                  reqCookies,
                  reqBodySize: flow.reqBodySize,
                  resBodySize: flow.resBodySize,
                  resMime: flow.resMime,
                  query,
                  phase: undefined,
                  actionTag: undefined,
                  source: neuromapRef.current.mode,
                  durationMs: flow.durationMs,
                } as RawNetworkEvent;
              } catch (e) {
                return null;
              }
            })
            .filter((e): e is RawNetworkEvent => e !== null);

          const updatedNeuromap = { ...neuromapRef.current };
          for (const event of historyEvents) {
            addEventToNeuromap(updatedNeuromap, event);
            updateEndpointIncremental(event);
          }

          // Correlate actions to loaded events (3s window for Electron)
          for (const action of updatedNeuromap.actions) {
            linkActionToEvents(action, updatedNeuromap.events, { windowMs: 2000 });
          }

          onUpdateRef.current(updatedNeuromap);
        } else if (message.type === 'wss_frame') {
          setWssFrames((prev) => [...prev.slice(-99), { flow_id: (message as { flow_id?: string }).flow_id, from_client: (message as { from_client?: boolean }).from_client, content: (message as { content?: string }).content, is_text: (message as { is_text?: boolean }).is_text, ts: (message as { ts?: number }).ts }]);
            }
          } catch (err) {
            console.error('Error processing WebSocket message:', err);
          }
        };

        ws.onerror = (error) => {
          setWsStatus('error');
          const errorMessage = `WebSocket connection failed to ${effectiveWsUrl}. `;
          const diagnosticMessage = 
            connectionAttempts === 1 
              ? errorMessage + 'Make sure the bridge server is running: `npm run mitm:bridge`'
              : errorMessage + `Reconnection attempt ${connectionAttempts}/${MAX_RECONNECT_ATTEMPTS}`;
          
          console.error(diagnosticMessage, error);
          
          // Attempt to reconnect if we haven't exceeded max attempts
          if (connectionAttempts < MAX_RECONNECT_ATTEMPTS && !isPaused) {
            reconnectTimeout = setTimeout(() => {
              console.log(`Reconnecting to ${effectiveWsUrl}... (attempt ${connectionAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
              connect();
            }, RECONNECT_DELAY);
          } else if (connectionAttempts >= MAX_RECONNECT_ATTEMPTS) {
            console.error(`Failed to connect after ${MAX_RECONNECT_ATTEMPTS} attempts. Please check that the bridge server is running: npm run mitm:bridge`);
          }
        };

        ws.onclose = (event) => {
          setWsStatus('disconnected');
          
          // Only attempt to reconnect if it wasn't a normal closure and not paused
          if (event.code !== 1000 && !isPaused && connectionAttempts < MAX_RECONNECT_ATTEMPTS) {
            // Code 1000 = normal closure
            // Code 1006 = abnormal closure (connection lost)
            // Code 1001 = going away
            const shouldReconnect = event.code === 1006 || event.code === 1001;
            
            if (shouldReconnect) {
              reconnectTimeout = setTimeout(() => {
                console.log(`Reconnecting to ${effectiveWsUrl} after close... (attempt ${connectionAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
                connect();
              }, RECONNECT_DELAY);
            }
          }
        };
      } catch (err) {
        setWsStatus('error');
        console.error(`Failed to create WebSocket connection to ${effectiveWsUrl}:`, err);
      }
    };

    connect();

    return () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounting'); // Normal closure
        wsRef.current = null;
      }
    };
  }, [isPaused, effectiveWsUrl]);

  // Neural bridge: dom-action-linked from Electron main (SIGNAL_DOM_ACTION → correlate → send)
  useEffect(() => {
    if (!isElectron || typeof window === 'undefined') return;
    const bridge = (window as { electronBridge?: { onDomActionLinked?: (d: unknown) => void } }).electronBridge;
    if (!bridge?.onDomActionLinked) return;
    bridge.onDomActionLinked((link: { id?: string; domAction?: unknown; chosen?: unknown }) => {
      const da = (link?.domAction || {}) as { selector?: string; xpath?: string; text?: string };
      const ch = link?.chosen as { method?: string; url?: string; reqHeaders?: Record<string,string>; resHeaders?: Record<string,string>; reqBody?: string; resBody?: string } | undefined;
      setDomActionFeed((prev) => [
        ...prev.slice(-19),
        { id: (link?.id as string) || `f${Date.now()}`, domAction: da, chosen: ch && ch.url ? { method: ch.method || 'GET', url: ch.url, reqHeaders: ch.reqHeaders, resHeaders: ch.resHeaders, reqBody: ch.reqBody, resBody: ch.resBody } : undefined },
      ]);
    });
  }, [isElectron]);

  useEffect(() => {
    if (!isElectron || typeof window === 'undefined') return;
    const b = (window as { electronBridge?: { onWasmDecompiled?: (d: unknown) => void; onHeapFindings?: (d: unknown) => void } }).electronBridge;
    if (b?.onWasmDecompiled) b.onWasmDecompiled((d: unknown) => setWasmDecompiled((prev) => [...prev.slice(-9), d as (typeof prev)[number]]));
    if (b?.onHeapFindings) b.onHeapFindings((d: unknown) => setHeapFindings(d as NonNullable<typeof heapFindings>));
    const b2 = (window as { electronBridge?: { onHiddenDomDiscovery?: (d: unknown) => void } }).electronBridge;
    if (b2?.onHiddenDomDiscovery) b2.onHiddenDomDiscovery((d: unknown) => setHiddenDomFindings(Array.isArray(d) ? d : []));
  }, [isElectron]);

  // Update endpoints list (with action-linked flags and category tags from neuromap.events)
  useEffect(() => {
    const endpointArray = Array.from(endpointMapRef.current.values()).map(ep => {
      const key = `${ep.method} ${ep.host}${ep.path}`;
      const events = neuromap.events.filter(e => `${e.method} ${e.host}${e.path}` === key);
      let actionLinked = false;
      let actionConfidence: number | undefined;
      let categoryTags: CategoryTag[] = [];
      if (events.length > 0) {
        const withAction = events.filter(e => e.actionId != null && e.actionConfidence != null);
        actionLinked = withAction.length > 0;
        if (withAction.length > 0) {
          actionConfidence = Math.max(...withAction.map(e => e.actionConfidence!));
        }
        try {
          const signal = convertToNetworkSignal(events[0]);
          categoryTags = signal?.categoryTags ?? [];
        } catch {
          categoryTags = [];
        }
      }
      return {
        ...ep,
        selected: neuromap.selectedEndpointKeys.has(key),
        actionLinked,
        actionConfidence,
        categoryTags,
      };
    });

    let filtered = endpointArray;
    if (showSelectedOnly) {
      filtered = filtered.filter(ep => ep.selected);
    }
    if (selectedCategoryTag) {
      filtered = filtered.filter(ep => (ep.categoryTags || []).includes(selectedCategoryTag));
    }

    setEndpoints(filtered.sort((a, b) => b.count - a.count));
  }, [neuromap.selectedEndpointKeys, neuromap.events, showSelectedOnly, selectedCategoryTag]);

  const updateEndpointIncremental = useCallback((event: RawNetworkEvent) => {
    const key = `${event.method} ${event.host}${event.path}`;
    
    if (!endpointMapRef.current.has(key)) {
      endpointMapRef.current.set(key, {
        method: event.method,
        host: event.host,
        path: event.path,
        count: 0,
        statuses: {},
        hasAuth: false,
        isMutation: false,
        sampleUrl: event.url,
        lastSeen: event.ts,
      });
    }

    const endpoint = endpointMapRef.current.get(key)!;
    endpoint.count++;
    endpoint.lastSeen = event.ts;
    
    if (event.status) {
      const statusStr = String(event.status);
      endpoint.statuses[statusStr] = (endpoint.statuses[statusStr] || 0) + 1;
    }

    if (event.resMime) {
      endpoint.resMime = event.resMime;
    }

    // Check for auth
    const authHeaders = ['authorization', 'x-auth-token', 'x-api-key'];
    if (authHeaders.some(h => event.reqHeaders?.[h.toLowerCase()])) {
      endpoint.hasAuth = true;
    }

    // Check if mutation
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(event.method)) {
      endpoint.isMutation = true;
    }
  }, []);

  const handleToggleSelection = (endpointKey: string) => {
    toggleEndpointSelection(neuromap, endpointKey);
    onUpdate({ ...neuromap });
  };

  const handleMarkInteraction = () => {
    if (isMarkingInteraction) {
      // Stop marking
      const end = Date.now();
      const start = interactionStartRef.current || end - 3000;
      const duration = end - start;

      const action = createActionEvent('mark_window', start, undefined, { durationMs: duration });
      const updatedNeuromap = { ...neuromap };
      updatedNeuromap.actions.push(action);
      linkActionToEvents(action, updatedNeuromap.events, { windowMs: 2000 });
      
      onUpdate(updatedNeuromap);
      setIsMarkingInteraction(false);
      interactionStartRef.current = null;
    } else {
      // Start marking
      setIsMarkingInteraction(true);
      interactionStartRef.current = Date.now();
      
      // Auto-stop after 3 seconds
      setTimeout(() => {
        setIsMarkingInteraction(false);
        handleMarkInteraction();
      }, 3000);
    }
  };

  const handleExport = () => {
    const exportData = exportNeuromap(neuromap);
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `neuromap_${neuromap.id}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLaunchBrowser = useCallback(async () => {
    setLaunchBrowserLoading(true);
    setLaunchBrowserError(null);
    try {
      const res = await fetch('/api/explorer/launch-browser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: launchBrowserUrl.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Launch failed');
    } catch (e) {
      setLaunchBrowserError(e instanceof Error ? e.message : 'Launch failed');
    } finally {
      setLaunchBrowserLoading(false);
    }
  }, [launchBrowserUrl]);

  return (
    <div className="w-full flex flex-col bg-black rounded-lg border border-slate-800 overflow-hidden" style={{ minHeight: '600px', maxHeight: '90vh' }}>
      {/* Header — Chromium-style; accent #ff5757, font-orbitron */}
      <div className="shrink-0 bg-slate-900 border-b border-white/15 p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Globe className="w-5 h-5 text-green-400" aria-hidden />
          <div>
            <h2 className="text-lg font-semibold font-futuristic terminal-glow-sm" style={{ color: '#ff5757' }}>{neuromap.name}</h2>
            <div className="text-xs text-slate-400" style={{ color: 'rgba(255,255,255,0.7)' }}>
              {endpoints.length} endpoints • {neuromap.selectedEndpointKeys.size} selected
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleMarkInteraction}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm ${
              isMarkingInteraction ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-slate-800 hover:bg-slate-700 text-white'
            }`}
            title={isMarkingInteraction ? 'Stop marking (or auto-stops in 3s)' : 'Mark next 3s of requests as interaction-linked'}
          >
            <MousePointer className="w-4 h-4" />
            {isMarkingInteraction ? 'Marking…' : 'Mark Interaction'}
          </button>
          <button
            onClick={() => setIsPaused(!isPaused)}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-sm text-white"
          >
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            {isPaused ? 'Resume' : 'Pause'}
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded text-sm text-white"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-sm text-white"
          >
            <X className="w-4 h-4" />
            Close
          </button>
        </div>
      </div>

      {/* Diagnostics split: Browser View (25%) | Logs Screen (75%) */}
      <DiagnosticsLayout
        hideLeft={isElectron}
        left={
          <div className="h-full flex flex-col bg-black" style={{ color: 'rgba(255,255,255,0.9)' }} role="region" aria-label="Browser view">
            <div className="shrink-0 px-3 py-2 border-b border-white/15 flex items-center gap-2">
              <Globe className="w-4 h-4 text-green-400" aria-hidden />
              <span className="text-xs font-medium text-slate-300 font-data">
                {isElectron ? 'Browser (native)' : 'Browser View (25%)'}
              </span>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden flex items-center justify-center">
              {isElectron ? (
                <div className="terminal-border text-center p-6 max-w-sm mx-4">
                  <p className="text-slate-300 text-sm mb-1">Native browser in the left 25%.</p>
                  <p className="text-slate-500 text-xs">Hover to highlight, click to capture XPath + CSS and correlate to network events (3s window).</p>
                </div>
              ) : (
                <div className="terminal-border text-center p-8 mx-4 max-w-md">
                  <Globe className="w-16 h-16 mx-auto mb-4 text-green-400" aria-hidden />
                  <h3 className="text-xl font-semibold font-futuristic mb-2 text-white terminal-glow-sm">Browser Mode</h3>
                  <p className="text-slate-400 mb-4 text-sm">
                    Launch Chromium with the proxy pre-configured, or set your own browser's proxy to 127.0.0.1:8080. Click and browse; API calls appear in the logs on the right.
                  </p>
                  <div className="space-y-3 text-left">
                    <label className="block text-xs text-slate-500">Open URL (optional)</label>
                    <input
                      type="url"
                      value={launchBrowserUrl}
                      onChange={(e) => setLaunchBrowserUrl(e.target.value)}
                      placeholder="https://example.com"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white placeholder-slate-500"
                    />
                    <button
                      onClick={handleLaunchBrowser}
                      disabled={launchBrowserLoading}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded text-sm text-white font-medium transition-colors"
                    >
                      <Monitor className="w-4 h-4" />
                      {launchBrowserLoading ? 'Launching…' : 'Launch Chromium'}
                    </button>
                  </div>
                  {launchBrowserError && (
                    <p className="mt-3 text-amber-400 text-sm">{launchBrowserError}</p>
                  )}
                  <p className="text-slate-500 text-xs mt-4">
                    Requires mitmproxy on :8080 and the bridge. Run <code className="bg-slate-800 px-1 rounded">npm run mitm:bridge</code> and <code className="bg-slate-800 px-1 rounded">mitmproxy -s tools/mitmproxy/stream_ws.py</code>.
                  </p>
                </div>
              )}
            </div>
          </div>
        }
        right={
          <LogsScreenPanel>
            {/* Filter */}
            <div className="shrink-0 p-3 border-b border-slate-800 space-y-2">
              <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showSelectedOnly}
                  onChange={(e) => setShowSelectedOnly(e.target.checked)}
                  className="rounded border border-white/15"
                />
                <span className="text-sm text-slate-300">Show Selected Only</span>
              </label>
              </div>
              {/* Category Tag Filter */}
              <div className="flex flex-wrap gap-1">
              {(['identity', 'endpoint', 'headers', 'flow-control', 'timing', 'error', 'protection'] as CategoryTag[]).map(tag => (
                <button
                  key={tag}
                  onClick={() => setSelectedCategoryTag(selectedCategoryTag === tag ? null : tag)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    selectedCategoryTag === tag
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                  title={getCategoryDescription(tag)}
                >
                  <Tag className="w-3 h-3 inline mr-1" />
                  {tag}
                </button>
              ))}
              </div>
            </div>

            {/* Real-time Feed (Electron: DOM click → linked request) */}
            {isElectron && (
              <div className="shrink-0 border-b border-slate-800">
                <button onClick={() => setFeedOpen((o) => !o)} className="w-full px-3 py-2 flex items-center gap-2 text-left text-sm text-slate-300 hover:bg-slate-800/50">
                  {feedOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  <Rss className="w-4 h-4 text-amber-400/90" />
                  Real-time Feed ({domActionFeed.length})
                </button>
                {feedOpen && domActionFeed.length > 0 && (
                  <div className="max-h-32 overflow-y-auto px-3 pb-2 space-y-1">
                    {domActionFeed.slice(-10).reverse().map((f) => (
                      <div key={f.id} className="flex items-center gap-2 text-xs">
                        <span className="text-slate-500 truncate max-w-[120px]" title={f.domAction.selector || f.domAction.xpath}>{f.domAction.selector || f.domAction.xpath || '—'}</span>
                        <span className="text-slate-400">→</span>
                        <span className="text-slate-300 font-mono truncate flex-1" title={f.chosen?.url}>{f.chosen ? `${f.chosen.method} ${f.chosen.url}` : '—'}</span>
                        <button onClick={() => setSelectedFeedItem(f)} className="px-1.5 py-0.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-300">View</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Deep Recon (Electron: Memory Vault, Wasm, WSS, Sandbox, Apex) */}
            {isElectron && (
              <DeepReconPanel
                wasmDecompiled={wasmDecompiled}
                heapFindings={heapFindings}
                wssFrames={wssFrames}
                hiddenDomFindings={hiddenDomFindings}
                onSandboxRequest={(url) => ((window as { electronBridge?: { sandboxRequest?: (u: string) => Promise<unknown> } }).electronBridge?.sandboxRequest?.(url) ?? Promise.resolve({ ok: false, error: 'Unavailable' })) as Promise<{ ok?: boolean; error?: string; status?: number; body?: string; durationMs?: number }>}
              />
            )}

            {/* API Table — font-data for logs/tables */}
            <div className="flex-1 min-h-0 overflow-y-auto" id="neuromap-endpoints-table">
              <table className="w-full font-data">
              <thead className="bg-slate-800/50 sticky top-0 border-b border-white/15">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400 w-8" scope="col"></th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400" scope="col">Method</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400" scope="col">Host</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400" scope="col">Path</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400" scope="col">Count</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400" scope="col">Linked</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400" scope="col">Auth</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {endpoints.map((ep) => {
                  const key = `${ep.method} ${ep.host}${ep.path}`;
                  const isSelected = ep.selected || false;
                  const isHighlighted = !!(highlightKey && key === highlightKey);
                  const feedItem = isHighlighted && domActionFeed.length > 0 ? domActionFeed[domActionFeed.length - 1] : null;
                  return (
                    <tr
                      key={key}
                      className={`hover:bg-slate-800/30 transition-colors ${isSelected ? 'bg-slate-800/50' : ''} ${isHighlighted ? 'ring-1 ring-amber-400/80 bg-amber-950/30' : ''}`}
                      onClick={isHighlighted && feedItem ? () => setSelectedFeedItem(feedItem) : undefined}
                      role={isHighlighted && feedItem ? 'button' : undefined}
                      title={isHighlighted ? 'Click to inspect headers & body' : undefined}
                    >
                      <td className="px-3 py-2">
                        <button
                          onClick={() => handleToggleSelection(key)}
                          className={`p-1 rounded transition-colors ${
                            isSelected
                              ? 'bg-green-600 text-white'
                              : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                          }`}
                          title={isSelected ? 'Remove from Neuromap' : 'Add to Neuromap'}
                        >
                          {isSelected ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-1 rounded text-xs font-mono ${
                          ep.method === 'GET' ? 'bg-blue-900/30 text-blue-300' :
                          ep.method === 'POST' ? 'bg-green-900/30 text-green-300' :
                          ep.method === 'PUT' ? 'bg-yellow-900/30 text-yellow-300' :
                          ep.method === 'DELETE' ? 'bg-red-900/30 text-red-300' :
                          'bg-slate-800 text-slate-300'
                        }`}>
                          {ep.method}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-300 font-mono truncate max-w-[120px]">{ep.host}</td>
                      <td className="px-3 py-2 text-xs text-slate-300 font-mono truncate max-w-[150px]">{ep.path}</td>
                      <td className="px-3 py-2 text-xs text-slate-400">{ep.count}</td>
                      <td className="px-3 py-2">
                        {ep.actionLinked && (
                          <span className={`px-2 py-1 rounded text-xs mr-1 ${
                            (ep.actionConfidence || 0) > 0.7
                              ? 'bg-green-900/30 text-green-300'
                              : (ep.actionConfidence || 0) > 0.4
                              ? 'bg-yellow-900/30 text-yellow-300'
                              : 'bg-blue-900/30 text-blue-300'
                          }`}>
                            Action-linked {ep.actionConfidence ? `(${Math.round(ep.actionConfidence * 100)}%)` : ''}
                          </span>
                        )}
                        {ep.hasAuth ? (
                          <span className="px-2 py-1 rounded text-xs bg-green-900/30 text-green-300">✓</span>
                        ) : (
                          <span className="px-2 py-1 rounded text-xs bg-slate-800 text-slate-500">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {endpoints.length === 0 && (
              <div className="p-8 text-center text-slate-500 text-sm space-y-1">
                <p>No endpoints captured yet. Interact with the browser.</p>
                {(wsStatus === 'disconnected' || wsStatus === 'error') && (
                  <div className="text-amber-500/80 text-xs space-y-1">
                    <p>Bridge not connected.</p>
                    {wsStatus === 'error' && (
                      <p className="text-red-400/80">Connection error: Check console for details.</p>
                    )}
                    <p>Run <code className="bg-slate-800 px-1 rounded">npm run mitm:bridge</code> and <code className="bg-slate-800 px-1 rounded">mitmproxy -s tools/mitmproxy/stream_ws.py</code>.</p>
                    <p className="text-xs opacity-75">Connecting to: <code className="bg-slate-800 px-1 rounded">{effectiveWsUrl}</code></p>
                  </div>
                )}
                {wsStatus === 'connecting' && <p className="text-slate-500 text-xs">Connecting to bridge…</p>}
              </div>
            )}
            </div>

            {/* Detail overlay: Headers & JSON body (when a Linked Request is selected) */}
            {selectedFeedItem?.chosen && (
              <div className="absolute inset-0 top-auto h-[45%] border-t border-amber-500/40 bg-slate-950 flex flex-col z-10">
                <div className="shrink-0 px-3 py-2 border-b border-white/15 flex items-center justify-between">
                  <span className="text-sm font-futuristic text-amber-400/90">Request / Response — {selectedFeedItem.chosen.method} {selectedFeedItem.chosen.url}</span>
                  <button onClick={() => setSelectedFeedItem(null)} className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 text-sm">Close</button>
                </div>
                <div className="flex-1 min-h-0 overflow-auto p-3 font-data text-xs space-y-4">
                  {selectedFeedItem.chosen.reqHeaders && Object.keys(selectedFeedItem.chosen.reqHeaders).length > 0 && (
                    <div>
                      <div className="text-amber-400/90 mb-1">Request Headers</div>
                      <div className="bg-slate-900/80 rounded p-2 space-y-0.5">
                        {Object.entries(selectedFeedItem.chosen.reqHeaders).map(([k, v]) => (
                          <div key={k} className="flex gap-2"><span className="text-slate-500 shrink-0">{k}:</span><span className="text-slate-300 break-all">{v}</span></div>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedFeedItem.chosen.resHeaders && Object.keys(selectedFeedItem.chosen.resHeaders).length > 0 && (
                    <div>
                      <div className="text-amber-400/90 mb-1">Response Headers</div>
                      <div className="bg-slate-900/80 rounded p-2 space-y-0.5">
                        {Object.entries(selectedFeedItem.chosen.resHeaders).map(([k, v]) => (
                          <div key={k} className="flex gap-2"><span className="text-slate-500 shrink-0">{k}:</span><span className="text-slate-300 break-all">{v}</span></div>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedFeedItem.chosen.reqBody != null && selectedFeedItem.chosen.reqBody !== '' && (
                    <div>
                      <div className="text-amber-400/90 mb-1">Request Body</div>
                      <pre className="bg-slate-900/80 rounded p-2 overflow-auto max-h-32 text-slate-300 whitespace-pre-wrap break-words">
                        {(() => { try { return JSON.stringify(JSON.parse(selectedFeedItem.chosen.reqBody!), null, 2); } catch { return selectedFeedItem.chosen.reqBody; } })()}
                      </pre>
                    </div>
                  )}
                  {selectedFeedItem.chosen.resBody != null && selectedFeedItem.chosen.resBody !== '' && (
                    <div>
                      <div className="text-amber-400/90 mb-1">Response Body</div>
                      <pre className="bg-slate-900/80 rounded p-2 overflow-auto max-h-40 text-slate-300 whitespace-pre-wrap break-words">
                        {(() => { try { return JSON.stringify(JSON.parse(selectedFeedItem.chosen.resBody!), null, 2); } catch { return selectedFeedItem.chosen.resBody; } })()}
                      </pre>
                    </div>
                  )}
                  {(!selectedFeedItem.chosen.reqHeaders || Object.keys(selectedFeedItem.chosen.reqHeaders).length === 0) &&
                   (!selectedFeedItem.chosen.resHeaders || Object.keys(selectedFeedItem.chosen.resHeaders).length === 0) &&
                   (selectedFeedItem.chosen.reqBody == null || selectedFeedItem.chosen.reqBody === '') &&
                   (selectedFeedItem.chosen.resBody == null || selectedFeedItem.chosen.resBody === '') && (
                    <div className="text-slate-500">No headers or body captured. mitmproxy may not be configured to capture bodies.</div>
                  )}
                </div>
              </div>
            )}
          </LogsScreenPanel>
        }
      />
    </div>
  );
}

