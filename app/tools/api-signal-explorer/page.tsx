'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Upload, Download, Filter, X, FileJson, Activity, Server, Clock, Wifi, WifiOff, Play, Square, Tag, AlertTriangle, Zap } from 'lucide-react';
import { buildDependencyGraph, simulateFailure, type CriticalNode, type GraphEdge } from '@/src/tools/api-signal-explorer/criticalPath';

type MitmFlowEvent = {
  ts: number;
  method: string;
  url: string;
  status?: number;
  reqHeaders?: Record<string, string>;
  resHeaders?: Record<string, string>;
  reqBodySize?: number;
  resBodySize?: number;
  resMime?: string;
  client?: { ip?: string; port?: number };
  server?: { ip?: string; port?: number };
  durationMs?: number;
};

type MitmExport = {
  version: string;
  session?: {
    startTs: number;
    endTs: number;
    durationMs: number;
  };
  flows: MitmFlowEvent[];
};

type NoisePreset = 'default' | 'everything' | 'critical-path';
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

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

export default function APISignalExplorerPage() {
  const [flows, setFlows] = useState<MitmFlowEvent[]>([]);
  const [session, setSession] = useState<MitmExport['session'] | null>(null);
  const [preset, setPreset] = useState<NoisePreset>('default');
  const [selectedEndpoints, setSelectedEndpoints] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  
  // Live streaming state
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [isLive, setIsLive] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isMarkingInteraction, setIsMarkingInteraction] = useState(false);
  const [interactionWindow, setInteractionWindow] = useState<{ start: number; end?: number } | null>(null);
  const [hostFilter, setHostFilter] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<ExplorerTab>('all');
  const [disabledEndpoints, setDisabledEndpoints] = useState<Set<string>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  const endpointMapRef = useRef<Map<string, EndpointData>>(new Map());
  const sessionStartRef = useRef<number | null>(null);

  // Convert mitmproxy flows to network events (for analysis)
  const networkEvents = useMemo(() => {
    return flows.map((flow) => {
      const url = new URL(flow.url);
      return {
        ts: flow.ts,
        method: flow.method,
        url: flow.url,
        path: url.pathname,
        host: url.hostname,
        query: Object.fromEntries(url.searchParams.entries()),
        reqHeaders: flow.reqHeaders || {},
        reqCookies: {},
        reqBodyText: undefined,
        reqBodyMime: undefined,
        status: flow.status,
        resHeaders: flow.resHeaders || {},
        resMime: flow.resMime,
        resSize: flow.resBodySize,
        durationMs: flow.durationMs,
      };
    });
  }, [flows]);

  // Incremental deduplication (for live mode performance)
  const updateEndpointIncremental = useCallback((event: typeof networkEvents[0]) => {
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

    if (event.resSize) {
      endpoint.resSizeAvg = ((endpoint.resSizeAvg || 0) * (endpoint.count - 1) + event.resSize) / endpoint.count;
    }

    // Check for auth
    const authHeaders = ['authorization', 'x-auth-token', 'x-api-key'];
    if (authHeaders.some(h => event.reqHeaders[h.toLowerCase()])) {
      endpoint.hasAuth = true;
    }

    // Check if mutation
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(event.method)) {
      endpoint.isMutation = true;
    }
  }, []);

  // Analyze and deduplicate endpoints (full recompute for file upload, incremental for live)
  const endpoints = useMemo(() => {
    if (isLive) {
      // In live mode, use the incremental map
      return Array.from(endpointMapRef.current.values());
    } else {
      // In file upload mode, do full recompute
      if (networkEvents.length === 0) return [];

      const endpointMap = new Map<string, EndpointData>();

      for (const event of networkEvents) {
        const key = `${event.method} ${event.host}${event.path}`;
        
        if (!endpointMap.has(key)) {
          endpointMap.set(key, {
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

        const endpoint = endpointMap.get(key)!;
        endpoint.count++;
        endpoint.lastSeen = event.ts;
        
        if (event.status) {
          const statusStr = String(event.status);
          endpoint.statuses[statusStr] = (endpoint.statuses[statusStr] || 0) + 1;
        }

        if (event.resMime) {
          endpoint.resMime = event.resMime;
        }

        if (event.resSize) {
          endpoint.resSizeAvg = ((endpoint.resSizeAvg || 0) * (endpoint.count - 1) + event.resSize) / endpoint.count;
        }

        // Check for auth
        const authHeaders = ['authorization', 'x-auth-token', 'x-api-key'];
        if (authHeaders.some(h => event.reqHeaders[h.toLowerCase()])) {
          endpoint.hasAuth = true;
        }

        // Check if mutation
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(event.method)) {
          endpoint.isMutation = true;
        }
      }

      return Array.from(endpointMap.values());
    }
  }, [networkEvents, isLive]);

  // Get critical path endpoints
  const criticalPathEndpoints = useMemo(() => {
    const criticalNodesArray = Array.from(criticalNodes.values())
      .filter(node => node.score > 0)
      .sort((a, b) => b.score - a.score);

    return criticalNodesArray.map(node => {
      const ep = endpoints.find(e => `${e.method} ${e.host}${e.path}` === node.key);
      if (!ep) return null;
      return { ...ep, criticalNode: node };
    }).filter((e): e is NonNullable<typeof e> => e !== null);
  }, [criticalNodes, endpoints]);

  // Get auth endpoints
  const authEndpoints = useMemo(() => {
    return Array.from(criticalNodes.values())
      .filter(node => node.tags.includes('auth_refresh') || node.tags.includes('token_rotation') || node.tags.includes('cookie_rotation'))
      .sort((a, b) => b.score - a.score)
      .map(node => {
        const ep = endpoints.find(e => `${e.method} ${e.host}${e.path}` === node.key);
        if (!ep) return null;
        return { ...ep, criticalNode: node };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);
  }, [criticalNodes, endpoints]);

  // Get polling endpoints
  const pollingEndpoints = useMemo(() => {
    return endpoints.filter(ep => {
      const key = `${ep.method} ${ep.host}${ep.path}`;
      const node = criticalNodes.get(key);
      return node?.tags.includes('polling') || (ep.count > 10 && ep.resSizeAvg && ep.resSizeAvg < 300);
    }).sort((a, b) => b.count - a.count);
  }, [endpoints, criticalNodes]);

  // Apply noise suppression preset and host filter
  const filteredEndpoints = useMemo(() => {
    let filtered: Array<EndpointData & { criticalNode?: CriticalNode }> = [];

    // Select endpoints based on active tab
    if (activeTab === 'critical') {
      filtered = criticalPathEndpoints;
    } else if (activeTab === 'auth') {
      filtered = authEndpoints;
    } else if (activeTab === 'polling') {
      filtered = pollingEndpoints.map(ep => ({ ...ep }));
    } else {
      filtered = endpoints.map(ep => ({ ...ep }));
    }

    // Apply host filter
    if (hostFilter.size > 0) {
      filtered = filtered.filter((ep) => hostFilter.has(ep.host));
    }

    // Apply preset filter (only for 'all' tab)
    if (activeTab === 'all') {
      if (preset === 'default') {
        // Hide unauthenticated, background-only, tiny responses, polling loops
        filtered = filtered.filter((ep) => {
          if (!ep.hasAuth && ep.count < 3) return false; // Unauthenticated, infrequent
          if (ep.resSizeAvg && ep.resSizeAvg < 300 && ep.count > 10) return false; // Tiny, frequent (polling)
          return true;
        });
      } else if (preset === 'critical-path') {
        // Auth + mutations + large JSON only
        filtered = filtered.filter((ep) => {
          if (ep.hasAuth) return true;
          if (ep.isMutation) return true;
          if (ep.resMime?.includes('json') && ep.resSizeAvg && ep.resSizeAvg > 1000) return true;
          return false;
        });
      }
    }

    // Filter out disabled endpoints
    filtered = filtered.filter(ep => {
      const key = `${ep.method} ${ep.host}${ep.path}`;
      return !disabledEndpoints.has(key);
    });

    // Sort by score for critical tab, by count otherwise
    if (activeTab === 'critical') {
      return filtered.sort((a, b) => (b.criticalNode?.score || 0) - (a.criticalNode?.score || 0));
    }
    return filtered.sort((a, b) => b.count - a.count);
  }, [endpoints, preset, hostFilter, activeTab, criticalPathEndpoints, authEndpoints, pollingEndpoints, disabledEndpoints]);

  // Session statistics
  const stats = useMemo(() => {
    if (!session && flows.length === 0) return null;

    const uniqueHosts = new Set(networkEvents.map(e => e.host));
    const duration = session?.durationMs 
      ? session.durationMs / 1000 
      : flows.length > 0 
        ? (Math.max(...flows.map(f => f.ts)) - Math.min(...flows.map(f => f.ts))) / 1000
        : 0;

    return {
      totalFlows: flows.length,
      uniqueEndpoints: endpoints.length,
      uniqueHosts: uniqueHosts.size,
      durationSeconds: duration,
    };
  }, [flows, networkEvents, endpoints, session]);

  // WebSocket connection management
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    setConnectionStatus('connecting');
    setError(null);

    const ws = new WebSocket('ws://localhost:8787/explorer');
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('Connected to WebSocket bridge');
      setConnectionStatus('connected');
      setIsLive(true);
      endpointMapRef.current.clear();
      
      // Request history
      ws.send(JSON.stringify({ type: 'get_history' }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as {
          type: string;
          data?: MitmFlowEvent[];
          connected?: boolean;
          eventCount?: number;
        };

        if (message.type === 'events_batch' && message.data) {
          // Update flows state
          setFlows((prev) => {
            const updated = [...prev, ...message.data!];
            // Update incremental map
            for (const flow of message.data!) {
              try {
                const url = new URL(flow.url);
                const networkEvent = {
                  ts: flow.ts,
                  method: flow.method,
                  url: flow.url,
                  path: url.pathname,
                  host: url.hostname,
                  query: Object.fromEntries(url.searchParams.entries()),
                  reqHeaders: flow.reqHeaders || {},
                  reqCookies: {},
                  reqBodyText: undefined,
                  reqBodyMime: undefined,
                  status: flow.status,
                  resHeaders: flow.resHeaders || {},
                  resMime: flow.resMime,
                  resSize: flow.resBodySize,
                  durationMs: flow.durationMs,
                  phase: interactionWindow && flow.ts >= interactionWindow.start && (!interactionWindow.end || flow.ts <= interactionWindow.end)
                    ? 'interaction' as const
                    : sessionStartRef.current && flow.ts <= (sessionStartRef.current + 4000)
                    ? 'page_load' as const
                    : 'background' as const,
                };
                updateEndpointIncremental(networkEvent);
              } catch (e) {
                // Invalid URL, skip
              }
            }
            return updated;
          });

          // Set session start if not set
          if (!sessionStartRef.current && message.data.length > 0) {
            sessionStartRef.current = message.data[0].ts;
          }
        } else if (message.type === 'history' && message.data) {
          // Load history
          setFlows(message.data);
          if (message.data.length > 0) {
            sessionStartRef.current = message.data[0].ts;
            for (const flow of message.data) {
              try {
                const url = new URL(flow.url);
                const networkEvent = {
                  ts: flow.ts,
                  method: flow.method,
                  url: flow.url,
                  path: url.pathname,
                  host: url.hostname,
                  query: Object.fromEntries(url.searchParams.entries()),
                  reqHeaders: flow.reqHeaders || {},
                  reqCookies: {},
                  reqBodyText: undefined,
                  reqBodyMime: undefined,
                  status: flow.status,
                  resHeaders: flow.resHeaders || {},
                  resMime: flow.resMime,
                  resSize: flow.resBodySize,
                  durationMs: flow.durationMs,
                  phase: 'background' as const,
                };
                updateEndpointIncremental(networkEvent);
              } catch (e) {
                // Invalid URL, skip
              }
            }
          }
        } else if (message.type === 'status') {
          setConnectionStatus(message.connected ? 'connected' : 'disconnected');
        } else if (message.type === 'pong') {
          // Heartbeat response
        }
      } catch (err) {
        console.error('Error processing WebSocket message:', err);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnectionStatus('error');
      setError('Failed to connect to WebSocket bridge. Make sure the bridge is running (npm run mitm:bridge)');
    };

    ws.onclose = () => {
      console.log('WebSocket closed');
      setConnectionStatus('disconnected');
      setIsLive(false);
      wsRef.current = null;
    };
  }, [updateEndpointIncremental, interactionWindow]);

  const disconnectWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnectionStatus('disconnected');
    setIsLive(false);
  }, []);

  // Interaction tagging
  const startInteractionTagging = useCallback(() => {
    setIsMarkingInteraction(true);
    const start = Date.now();
    setInteractionWindow({ start });
    
    // Auto-stop after 3 seconds
    setTimeout(() => {
      if (isMarkingInteraction) {
        setInteractionWindow((prev) => prev ? { ...prev, end: Date.now() } : null);
        setIsMarkingInteraction(false);
      }
    }, 3000);
  }, [isMarkingInteraction]);

  const stopInteractionTagging = useCallback(() => {
    setInteractionWindow((prev) => prev ? { ...prev, end: Date.now() } : null);
    setIsMarkingInteraction(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Auto-scroll to bottom when new events arrive (if enabled)
  useEffect(() => {
    if (autoScroll && isLive && filteredEndpoints.length > 0) {
      const table = document.getElementById('endpoints-table');
      if (table) {
        table.scrollTop = table.scrollHeight;
      }
    }
  }, [filteredEndpoints.length, autoScroll, isLive]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Disconnect WebSocket if connected
    if (isLive) {
      disconnectWebSocket();
    }

    setError(null);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string) as MitmExport;
        
        // Validate schema
        if (!data.flows || !Array.isArray(data.flows)) {
          throw new Error('Invalid export: missing flows array');
        }

        if (data.flows.length === 0) {
          throw new Error('Export contains no flows');
        }

        setFlows(data.flows);
        setSession(data.session || null);
        if (data.flows.length > 0) {
          sessionStartRef.current = data.session?.startTs || data.flows[0].ts;
        }
        endpointMapRef.current.clear();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse export file');
      }
    };

    reader.onerror = () => {
      setError('Failed to read file');
    };

    reader.readAsText(file);
  };

  const handleExportSelected = () => {
    const selected = filteredEndpoints
      .filter((ep) => {
        const key = `${ep.method} ${ep.host}${ep.path}`;
        return selectedEndpoints.has(key);
      })
      .map((ep) => ({
        method: ep.method,
        host: ep.host,
        path: ep.path,
        requiresAuth: ep.hasAuth,
        intent: ep.isMutation ? 'mutation' : 'query',
      }));

    const exportData = {
      exported: new Date().toISOString(),
      endpoints: selected,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `api_endpoints_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleEndpointSelection = (key: string) => {
    const newSelected = new Set(selectedEndpoints);
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    setSelectedEndpoints(newSelected);
  };

  const selectAll = () => {
    const allKeys = new Set(filteredEndpoints.map(ep => `${ep.method} ${ep.host}${ep.path}`));
    setSelectedEndpoints(allKeys);
  };

  const clearSelection = () => {
    setSelectedEndpoints(new Set());
  };

  const clearSession = () => {
    setFlows([]);
    setSession(null);
    setSelectedEndpoints(new Set());
    endpointMapRef.current.clear();
    sessionStartRef.current = null;
    setInteractionWindow(null);
    setHostFilter(new Set());
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: 'clear_session' }));
    }
  };

  // Get unique hosts for filter chips
  const uniqueHosts = useMemo(() => {
    const hosts = new Set(endpoints.map(ep => ep.host));
    return Array.from(hosts).sort();
  }, [endpoints]);

  return (
    <div className="min-h-screen p-6 sm:p-8" style={{ backgroundColor: '#0a0a0a' }}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold mb-2" style={{ color: '#ff5757' }}>
            API Signal Explorer
          </h1>
          <p className="text-slate-400 text-sm sm:text-base">
            Analyze mitmproxy captures to identify important API endpoints
          </p>
        </div>

        {/* Live Mode Controls */}
        <div className="mb-6 p-4 bg-slate-900/50 rounded-lg border border-slate-800">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              {connectionStatus === 'connected' ? (
                <Wifi className="w-5 h-5 text-green-400" />
              ) : connectionStatus === 'connecting' ? (
                <Activity className="w-5 h-5 text-yellow-400 animate-pulse" />
              ) : (
                <WifiOff className="w-5 h-5 text-slate-500" />
              )}
              <span className="text-sm font-medium text-slate-300">
                Status: {connectionStatus === 'connected' ? 'Live' : connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
              </span>
            </div>

            {connectionStatus === 'disconnected' || connectionStatus === 'error' ? (
              <button
                onClick={connectWebSocket}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-white text-sm font-medium transition-colors"
              >
                <Play className="w-4 h-4" />
                Connect
              </button>
            ) : (
              <button
                onClick={disconnectWebSocket}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white text-sm font-medium transition-colors"
              >
                <Square className="w-4 h-4" />
                Disconnect
              </button>
            )}

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-slate-400">Auto-scroll</span>
            </label>

            {isMarkingInteraction ? (
              <button
                onClick={stopInteractionTagging}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white text-sm font-medium transition-colors"
              >
                <Tag className="w-4 h-4" />
                Stop Tagging
              </button>
            ) : (
              <button
                onClick={startInteractionTagging}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white text-sm font-medium transition-colors"
              >
                <Tag className="w-4 h-4" />
                Mark Next Interaction
              </button>
            )}

            <button
              onClick={clearSession}
              className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white text-sm font-medium transition-colors ml-auto"
            >
              <X className="w-4 h-4" />
              Clear Session
            </button>
          </div>

          {/* Host Filter Chips */}
          {uniqueHosts.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-800">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500 mr-2">Hosts:</span>
                {uniqueHosts.map((host) => {
                  const isSelected = hostFilter.has(host);
                  return (
                    <button
                      key={host}
                      onClick={() => {
                        const newFilter = new Set(hostFilter);
                        if (isSelected) {
                          newFilter.delete(host);
                        } else {
                          newFilter.add(host);
                        }
                        setHostFilter(newFilter);
                      }}
                      className={`px-3 py-1 rounded-full text-xs font-mono transition-colors ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {host}
                    </button>
                  );
                })}
                {hostFilter.size > 0 && (
                  <button
                    onClick={() => setHostFilter(new Set())}
                    className="px-3 py-1 rounded-full text-xs bg-slate-800 text-slate-400 hover:bg-slate-700"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Upload Section (only show when not in live mode) */}
        {flows.length === 0 && !isLive && (
          <div className="mb-8 p-8 border-2 border-dashed border-slate-700 rounded-lg text-center">
            <FileJson className="w-12 h-12 mx-auto mb-4 text-slate-500" />
            <h2 className="text-xl font-semibold mb-2 text-slate-300">Upload mitmproxy Export</h2>
            <p className="text-slate-500 mb-4 text-sm">
              Export flows from mitmproxy using <code className="bg-slate-800 px-2 py-1 rounded">export_flows.py</code>
            </p>
            <label className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg cursor-pointer transition-colors">
              <Upload className="w-4 h-4" />
              <span>Choose JSON file</span>
              <input
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
            {error && (
              <div className="mt-4 p-3 bg-red-900/30 border border-red-700 rounded text-red-300 text-sm">
                {error}
              </div>
            )}
          </div>
        )}

        {/* Session Stats */}
        {stats && (
          <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-800">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-500">Total Flows</span>
              </div>
              <div className="text-2xl font-bold text-white">{stats.totalFlows.toLocaleString()}</div>
            </div>
            <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-800">
              <div className="flex items-center gap-2 mb-1">
                <Server className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-500">Endpoints</span>
              </div>
              <div className="text-2xl font-bold text-white">{stats.uniqueEndpoints}</div>
            </div>
            <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-800">
              <div className="flex items-center gap-2 mb-1">
                <Server className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-500">Hosts</span>
              </div>
              <div className="text-2xl font-bold text-white">{stats.uniqueHosts}</div>
            </div>
            <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-800">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-500">Duration</span>
              </div>
              <div className="text-2xl font-bold text-white">{stats.durationSeconds.toFixed(1)}s</div>
            </div>
          </div>
        )}

        {/* Controls */}
        {flows.length > 0 && (
          <div className="mb-6 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <span className="text-sm text-slate-400">Preset:</span>
              <select
                value={preset}
                onChange={(e) => setPreset(e.target.value as NoisePreset)}
                className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-white"
              >
                <option value="default">Default (Noise Suppressed)</option>
                <option value="critical-path">Critical Path Only</option>
                <option value="everything">Everything</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={selectAll}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-sm text-white transition-colors"
              >
                Select All
              </button>
              <button
                onClick={clearSelection}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-sm text-white transition-colors"
              >
                Clear
              </button>
            </div>

            {selectedEndpoints.size > 0 && (
              <button
                onClick={handleExportSelected}
                className="flex items-center gap-2 px-4 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-sm text-white transition-colors"
              >
                <Download className="w-4 h-4" />
                Export Selected ({selectedEndpoints.size})
              </button>
            )}

            {activeTab === 'critical' && criticalPathEndpoints.length > 0 && (
              <button
                onClick={() => {
                  const criticalSet = criticalPathEndpoints.map(ep => ({
                    method: ep.method,
                    host: ep.host,
                    path: ep.path,
                    requiresAuth: ep.hasAuth,
                    intent: ep.isMutation ? 'mutation' : 'query',
                    score: ep.criticalNode?.score || 0,
                    confidence: ep.criticalNode?.confidence || 0,
                    reasons: ep.criticalNode?.reasons || [],
                    tags: ep.criticalNode?.tags || [],
                  }));

                  const exportData = {
                    exported: new Date().toISOString(),
                    type: 'critical_path_seed',
                    endpoints: criticalSet,
                  };

                  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `critical_path_seed_${Date.now()}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="flex items-center gap-2 px-4 py-1.5 bg-green-600 hover:bg-green-700 border border-green-700 rounded text-sm text-white transition-colors"
              >
                <Zap className="w-4 h-4" />
                Export Critical Path Set
              </button>
            )}

            <button
              onClick={() => {
                setFlows([]);
                setSession(null);
                setSelectedEndpoints(new Set());
                setError(null);
              }}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-sm text-white transition-colors ml-auto"
            >
              <X className="w-4 h-4" />
              Clear
            </button>
          </div>
        )}

        {/* Endpoints Table */}
        {filteredEndpoints.length > 0 && (
          <div className="bg-slate-900/50 rounded-lg border border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-800/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 w-8">
                      <input
                        type="checkbox"
                        checked={selectedEndpoints.size === filteredEndpoints.length && filteredEndpoints.length > 0}
                        onChange={(e) => e.target.checked ? selectAll() : clearSelection()}
                        className="rounded"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Method</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Host</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Path</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Count</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Auth</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredEndpoints.map((ep) => {
                    const key = `${ep.method} ${ep.host}${ep.path}`;
                    const isSelected = selectedEndpoints.has(key);
                    const isDisabled = disabledEndpoints.has(key);
                    const criticalNode = ep.criticalNode;
                    
                    // Simulate failure impact if disabled
                    const failureImpact = isDisabled && criticalNode
                      ? simulateFailure(criticalNodes, criticalEdges, key)
                      : null;

                    return (
                      <tr
                        key={key}
                        className={`hover:bg-slate-800/30 transition-colors ${
                          isSelected ? 'bg-slate-800/50' : ''
                        } ${isDisabled ? 'opacity-50' : ''}`}
                      >
                        {activeTab !== 'critical' && (
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleEndpointSelection(key)}
                              className="rounded"
                            />
                          </td>
                        )}
                        {activeTab === 'critical' && (
                          <td className="px-4 py-3">
                            <button
                              onClick={() => {
                                const newDisabled = new Set(disabledEndpoints);
                                if (newDisabled.has(key)) {
                                  newDisabled.delete(key);
                                } else {
                                  newDisabled.add(key);
                                }
                                setDisabledEndpoints(newDisabled);
                              }}
                              className={`p-1 rounded transition-colors ${
                                isDisabled
                                  ? 'bg-red-600 hover:bg-red-700 text-white'
                                  : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                              }`}
                              title={isDisabled ? 'Enable endpoint' : 'Simulate failure'}
                            >
                              <AlertTriangle className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                        <td className="px-4 py-3">
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
                        <td className="px-4 py-3 text-sm text-slate-300 font-mono">{ep.host}</td>
                        <td className="px-4 py-3 text-sm text-slate-300 font-mono">{ep.path}</td>
                        {activeTab === 'critical' && criticalNode && (
                          <>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-white">{criticalNode.score}</span>
                                <div className="w-16 h-2 bg-slate-700 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-green-500 transition-all"
                                    style={{ width: `${criticalNode.score}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-xs text-slate-400">{criticalNode.confidence}%</span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="max-w-xs">
                                <div className="text-xs text-slate-300 space-y-1">
                                  {criticalNode.reasons.slice(0, 3).map((reason, idx) => (
                                    <div key={idx} className="flex items-start gap-1">
                                      <span className="text-green-400">•</span>
                                      <span>{reason}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </>
                        )}
                        <td className="px-4 py-3 text-sm text-slate-400">{ep.count}</td>
                        <td className="px-4 py-3 text-sm text-slate-400">
                          {Object.entries(ep.statuses)
                            .sort(([a], [b]) => Number(b) - Number(a))
                            .slice(0, 2)
                            .map(([s, c]) => `${s}(${c})`)
                            .join(', ')}
                        </td>
                        <td className="px-4 py-3">
                          {ep.isMutation && (
                            <span className="px-2 py-1 rounded text-xs bg-purple-900/30 text-purple-300">
                              Mutation
                            </span>
                          )}
                          {!ep.isMutation && (
                            <span className="px-2 py-1 rounded text-xs bg-blue-900/30 text-blue-300">
                              Query
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {ep.hasAuth ? (
                            <span className="px-2 py-1 rounded text-xs bg-green-900/30 text-green-300">
                              ✓
                            </span>
                          ) : (
                            <span className="px-2 py-1 rounded text-xs bg-slate-800 text-slate-500">
                              —
                            </span>
                          )}
                        </td>
                        {failureImpact && failureImpact.impact.length > 0 && (
                          <td colSpan={activeTab === 'critical' ? 8 : 7} className="px-4 py-2 bg-red-900/20 border-t border-red-800">
                            <div className="text-xs text-red-300">
                              <span className="font-semibold">Impact:</span>{' '}
                              {failureImpact.impact.join('; ')}
                              {failureImpact.unreachable.size > 0 && (
                                <span className="ml-2">
                                  ({failureImpact.unreachable.size} endpoints unreachable)
                                </span>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {flows.length > 0 && filteredEndpoints.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            No endpoints match the current preset filter.
          </div>
        )}
      </div>
    </div>
  );
}
