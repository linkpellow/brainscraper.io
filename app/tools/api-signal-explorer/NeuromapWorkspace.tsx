'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Pause, Play, Check, X, Download, Smartphone, Globe, Plus, MousePointer, Keyboard, Navigation, Clock, Filter } from 'lucide-react';
import type { Neuromap, RawNetworkEvent, NeuromapMode } from '@/src/tools/api-signal-explorer/neuromap';
import { createActionEvent, generateActionLabel, type ActionEvent } from '@/src/tools/api-signal-explorer/actions';
import { linkActionToEvents } from '@/src/tools/api-signal-explorer/correlate';

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

export default function NeuromapWorkspace({ neuromap, onUpdate, onClose, wsUrl = 'ws://localhost:8787/explorer' }: NeuromapWorkspaceProps) {
  const [isPaused, setIsPaused] = useState(false);
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [isMarkingInteraction, setIsMarkingInteraction] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [endpoints, setEndpoints] = useState<Array<EndpointData & { selected?: boolean; actionLinked?: boolean; actionConfidence?: number }>>([]);
  const endpointMapRef = useRef<Map<string, EndpointData>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const interactionStartRef = useRef<number | null>(null);

  // Initialize screen share for mobile mode
  useEffect(() => {
    if (neuromap.mode === 'mobile' && !screenStream) {
      navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
        .then(stream => {
          setScreenStream(stream);
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch(err => {
          console.error('Screen share error:', err);
        });
    }

    return () => {
      if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [neuromap.mode, screenStream]);

  // Action events are handled in the main WebSocket message handler below

  // Connect to WebSocket for live API stream
  useEffect(() => {
    if (isPaused) return;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'get_history' }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as {
          type: string;
          action?: ActionEvent;
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
          }>;
        };

        if (message.type === 'action' && message.action) {
          // Handle action event
          const action = message.action;
          const updatedNeuromap = { ...neuromap };
          updatedNeuromap.actions.push(action);
          
          // Correlate to existing network events
          linkActionToEvents(action, updatedNeuromap.events);
          
          onUpdate(updatedNeuromap);
        } else if (message.type === 'events_batch' && message.data) {
          // Convert to RawNetworkEvent
          const newEvents: RawNetworkEvent[] = message.data
            .map(flow => {
              try {
                const url = new URL(flow.url);
                return {
                  ts: flow.ts,
                  method: flow.method,
                  url: flow.url,
                  path: url.pathname,
                  host: url.hostname,
                  status: flow.status,
                  reqHeaders: flow.reqHeaders,
                  resHeaders: flow.resHeaders,
                  reqBodySize: flow.reqBodySize,
                  resBodySize: flow.resBodySize,
                  resMime: flow.resMime,
                  phase: undefined,
                  actionTag: undefined,
                  source: neuromap.mode,
                } as RawNetworkEvent;
              } catch (e) {
                return null;
              }
            })
            .filter((e): e is RawNetworkEvent => e !== null);

          // Add to neuromap
          const updatedNeuromap = { ...neuromap };
          for (const event of newEvents) {
            addEventToNeuromap(updatedNeuromap, event);
            updateEndpointIncremental(event);
          }

          // Re-correlate all actions to new events
          for (const action of updatedNeuromap.actions) {
            linkActionToEvents(action, updatedNeuromap.events);
          }

          onUpdate(updatedNeuromap);
        } else if (message.type === 'history' && message.data) {
          // Load history
          const historyEvents: RawNetworkEvent[] = message.data
            .map(flow => {
              try {
                const url = new URL(flow.url);
                return {
                  ts: flow.ts,
                  method: flow.method,
                  url: flow.url,
                  path: url.pathname,
                  host: url.hostname,
                  status: flow.status,
                  reqHeaders: flow.reqHeaders,
                  resHeaders: flow.resHeaders,
                  reqBodySize: flow.reqBodySize,
                  resBodySize: flow.resBodySize,
                  resMime: flow.resMime,
                  phase: undefined,
                  actionTag: undefined,
                  source: neuromap.mode,
                } as RawNetworkEvent;
              } catch (e) {
                return null;
              }
            })
            .filter((e): e is RawNetworkEvent => e !== null);

          const updatedNeuromap = { ...neuromap };
          for (const event of historyEvents) {
            addEventToNeuromap(updatedNeuromap, event);
            updateEndpointIncremental(event);
          }

          // Correlate actions to loaded events
          for (const action of updatedNeuromap.actions) {
            linkActionToEvents(action, updatedNeuromap.events);
          }

          onUpdate(updatedNeuromap);
        }
      } catch (err) {
        console.error('Error processing WebSocket message:', err);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket closed');
    };

    return () => {
      ws.close();
    };
  }, [neuromap, isPaused, wsUrl, onUpdate]);

  // Update endpoints list
  useEffect(() => {
    const endpointArray = Array.from(endpointMapRef.current.values()).map(ep => ({
      ...ep,
      selected: neuromap.selectedEndpointKeys.has(`${ep.method} ${ep.host}${ep.path}`),
    }));

    let filtered = endpointArray;
    if (showSelectedOnly) {
      filtered = filtered.filter(ep => ep.selected);
    }

    setEndpoints(filtered.sort((a, b) => b.count - a.count));
  }, [neuromap.selectedEndpointKeys, showSelectedOnly]);

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
      
      // Correlate to network events
      linkActionToEvents(action, updatedNeuromap.events);
      
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

  // Calculate timeline data
  const timelineData = useMemo(() => {
    if (neuromap.events.length === 0) return null;

    const start = neuromap.createdAt;
    const end = Math.max(...neuromap.events.map(e => e.ts), neuromap.createdAt);
    const duration = end - start;

    // Bin events into time buckets for density
    const buckets = 100;
    const bucketSize = duration / buckets;
    const density = new Array(buckets).fill(0);
    
    for (const event of neuromap.events) {
      const bucket = Math.floor((event.ts - start) / bucketSize);
      if (bucket >= 0 && bucket < buckets) {
        density[bucket]++;
      }
    }

    const maxDensity = Math.max(...density, 1);

    return {
      start,
      end,
      duration,
      density: density.map(d => d / maxDensity), // Normalize to 0-1
      actions: neuromap.actions,
    };
  }, [neuromap]);

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineData || !timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    const clickedTime = timelineData.start + (timelineData.duration * percent);

    // Set time window to 2 seconds around click
    setTimeWindow({
      start: clickedTime - 1000,
      end: clickedTime + 1000,
    });
  };

  const handleTimelineDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineData || !timelineRef.current) return;
    // Simple implementation: on mouse move, update window
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    const clickedTime = timelineData.start + (timelineData.duration * percent);

    setTimeWindow({
      start: clickedTime - 1000,
      end: clickedTime + 1000,
    });
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {neuromap.mode === 'mobile' ? (
            <Smartphone className="w-5 h-5 text-blue-400" />
          ) : (
            <Globe className="w-5 h-5 text-green-400" />
          )}
          <div>
            <h2 className="text-lg font-semibold text-white">{neuromap.name}</h2>
            <div className="text-xs text-slate-400">
              {endpoints.length} endpoints • {neuromap.selectedEndpointKeys.size} selected
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
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

      {/* Split View */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Screen/Browser (60%) */}
        <div className="w-[60%] bg-black border-r border-slate-800 flex items-center justify-center">
          {neuromap.mode === 'mobile' ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-slate-900">
              <div className="text-center p-8">
                <Globe className="w-16 h-16 mx-auto mb-4 text-green-400" />
                <h3 className="text-xl font-semibold mb-2 text-white">Browser Mode</h3>
                <p className="text-slate-400 mb-4 text-sm">
                  Configure your browser to use mitmproxy as proxy, then interact normally.
                </p>
                <p className="text-slate-500 text-xs">
                  Network requests will be captured and displayed in real-time on the right.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right: API List (40%) */}
        <div className="w-[40%] bg-slate-900 flex flex-col">
          {/* Filter */}
          <div className="p-3 border-b border-slate-800">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showSelectedOnly}
                onChange={(e) => setShowSelectedOnly(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-slate-300">Show Selected Only</span>
            </label>
          </div>

          {/* API Table */}
          <div className="flex-1 overflow-y-auto">
            <table className="w-full">
              <thead className="bg-slate-800/50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400 w-8"></th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400">Method</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400">Host</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400">Path</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400">Count</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400">Auth</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {endpoints.map((ep) => {
                  const key = `${ep.method} ${ep.host}${ep.path}`;
                  const isSelected = ep.selected || false;
                  return (
                    <tr
                      key={key}
                      className={`hover:bg-slate-800/30 transition-colors ${isSelected ? 'bg-slate-800/50' : ''}`}
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
              <div className="p-8 text-center text-slate-500 text-sm">
                No endpoints captured yet. {neuromap.mode === 'mobile' ? 'Share your screen and interact.' : 'Interact with the browser.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Re-export functions for use in component
import { addEventToNeuromap, toggleEndpointSelection, exportNeuromap } from '@/src/tools/api-signal-explorer/neuromap';
