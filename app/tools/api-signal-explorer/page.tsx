'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Download, Filter, X, Activity, Server, Clock, Wifi, WifiOff, Play, Square, Tag, AlertTriangle, Zap, Plus, Globe, Pause, Check, Monitor, Copy, Code, ChevronDown, ChevronRight, Terminal, FileCode } from 'lucide-react';
import { buildDependencyGraph, simulateFailure, type CriticalNode, type GraphEdge } from '@/src/tools/api-signal-explorer/criticalPath';
import { createNeuromap, addEventToNeuromap, toggleEndpointSelection, exportNeuromap, type Neuromap, type NeuromapMode } from '@/src/tools/api-signal-explorer/neuromap';
import NeuromapWorkspace from './NeuromapWorkspace';

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
type ExplorerTab = 'all' | 'critical' | 'auth' | 'polling';

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

type CodeSnippetLang = 'curl' | 'fetch' | 'axios' | 'python';

// Generate code snippets for API endpoints
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

function copyToClipboard(text: string, key: string, setCopied: (key: string | null) => void) {
  navigator.clipboard.writeText(text);
  setCopied(key);
  setTimeout(() => setCopied(null), 2000);
}

export default function APISignalExplorerPage() {
  const [flows, setFlows] = useState<MitmFlowEvent[]>([]);
  const [session, setSession] = useState<MitmExport['session'] | null>(null);
  const [preset, setPreset] = useState<NoisePreset>('default');
  const [selectedEndpoints, setSelectedEndpoints] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [expandedEndpoint, setExpandedEndpoint] = useState<string | null>(null);
  const [snippetLang, setSnippetLang] = useState<CodeSnippetLang>('curl');
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);
  
  // Live streaming state
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [isLive, setIsLive] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isMarkingInteraction, setIsMarkingInteraction] = useState(false);
  const [interactionWindow, setInteractionWindow] = useState<{ start: number; end?: number } | null>(null);
  const [hostFilter, setHostFilter] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<ExplorerTab>('all');
  const [disabledEndpoints, setDisabledEndpoints] = useState<Set<string>>(new Set());
  const [neuromaps, setNeuromaps] = useState<Neuromap[]>([]);
  const [activeNeuromapId, setActiveNeuromapId] = useState<string | null>(null);
  const [launchBrowserLoading, setLaunchBrowserLoading] = useState(false);
  const [servicesStatus, setServicesStatus] = useState<{ mitm: string; bridge: string } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const endpointMapRef = useRef<Map<string, EndpointData>>(new Map());
  const sessionStartRef = useRef<number | null>(null);

  // Convert mitmproxy flows to network events (for analysis)
  const networkEvents = useMemo(() => {
    return flows.flatMap((flow) => {
      try {
        const url = new URL(flow.url);
        return [{
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
        }];
      } catch {
        return [];
      }
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
        sampleHeaders: event.reqHeaders,
        sampleReqBody: event.reqBodyText,
        sampleResBody: undefined,
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
            sampleHeaders: event.reqHeaders,
            sampleReqBody: event.reqBodyText,
            sampleResBody: undefined,
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

  // Build dependency graph for critical path analysis
  const criticalPathGraph = useMemo(() => {
    if (endpoints.length === 0 || networkEvents.length === 0) {
      return { nodes: new Map<string, CriticalNode>(), edges: [] };
    }

    const endpointGroups = endpoints.map(ep => ({
      key: `${ep.method} ${ep.host}${ep.path}`,
      method: ep.method,
      host: ep.host,
      path: ep.path,
      events: networkEvents.filter(e => 
        e.method === ep.method && e.host === ep.host && e.path === ep.path
      ),
      hasAuth: ep.hasAuth,
      isMutation: ep.isMutation,
      resSizeAvg: ep.resSizeAvg,
      resMime: ep.resMime,
    }));

    return buildDependencyGraph(endpointGroups, networkEvents);
  }, [endpoints, networkEvents]);

  const criticalNodes = criticalPathGraph.nodes;
  const criticalEdges = criticalPathGraph.edges;

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

  // Check service status
  const checkServiceStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/explorer/start-services');
      const data = await res.json();
      if (data.ok && data.status) {
        setServicesStatus(data.status);
      }
    } catch (err) {
      console.warn('Could not check service status:', err);
    }
  }, []);

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

  // Detect if running in production (Railway, Render, etc.)
  const isProduction = typeof window !== 'undefined' && 
    (window.location.hostname.includes('railway.app') ||
     window.location.hostname.includes('.onrender.com') ||
     window.location.hostname.includes('.up.railway.app') ||
     (process.env.NODE_ENV === 'production' && !window.location.hostname.includes('localhost')));

  const handleLaunchBrowser = useCallback(async () => {
    if (isProduction) {
      setError('Browser automation is only available locally. Mode 1 requires Playwright and mitmproxy installed on your local machine. Use HAR import or manual mode instead.');
      return;
    }

    setLaunchBrowserLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/explorer/launch-browser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Launch failed');
      
      // Check service status after launch
      setTimeout(checkServiceStatus, 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Launch failed');
    } finally {
      setLaunchBrowserLoading(false);
    }
  }, [checkServiceStatus, isProduction]);

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
      const table = document.getElementById('endpoints-grid');
      if (table) {
        table.scrollTop = table.scrollHeight;
      }
    }
  }, [filteredEndpoints.length, autoScroll, isLive]);

  // Check service status on mount and periodically
  useEffect(() => {
    checkServiceStatus();
    const interval = setInterval(checkServiceStatus, 5000); // Check every 5 seconds
    return () => clearInterval(interval);
  }, [checkServiceStatus]);


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
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'clear_session' }));
    }
  };

  // Get unique hosts for filter chips
  const uniqueHosts = useMemo(() => {
    const hosts = new Set(endpoints.map(ep => ep.host));
    return Array.from(hosts).sort();
  }, [endpoints]);

  // Check if running in Electron
  const isElectron = typeof window !== 'undefined' && (
    !!(window as { electronBridge?: { isElectron?: boolean } }).electronBridge?.isElectron ||
    (typeof process !== 'undefined' && !!(process as { versions?: { electron?: string } }).versions?.electron)
  );

  // Auto-create neuromap on page load
  useEffect(() => {
    if (neuromaps.length === 0) {
      const newNeuromap = createNeuromap('API Capture Session', 'browser');
      setNeuromaps([newNeuromap]);
      setActiveNeuromapId(newNeuromap.id);
      newNeuromap.isActive = true;
    }
  }, []);

  return (
    <div className="min-h-screen p-4" style={{ backgroundColor: '#0a0a0a' }}>
      <div className="mx-auto max-w-full">

        {/* Live Mode Controls - Compact row */}
        {!activeNeuromapId && (
          <div className="mb-3 p-3 bg-slate-900/30 rounded-lg border border-slate-800/50">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <div className="flex items-center gap-2">
              {connectionStatus === 'connected' ? (
                <Wifi className="w-5 h-5 text-green-400" />
              ) : connectionStatus === 'connecting' ? (
                <Activity className="w-5 h-5 text-yellow-400 animate-pulse" />
              ) : (
                <WifiOff className="w-5 h-5 text-slate-500" />
              )}
              <span className="text-sm font-medium text-slate-300">
                Bridge: {connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
              </span>
            </div>

            {/* Service Status Indicators */}
            {servicesStatus && (
              <>
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs ${
                  servicesStatus.mitm === 'running' ? 'bg-green-900/30 text-green-400' : 'bg-slate-800 text-slate-500'
                }`}>
                  <Server className="w-3 h-3" />
                  <span>mitmproxy</span>
                </div>
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs ${
                  servicesStatus.bridge === 'running' ? 'bg-green-900/30 text-green-400' : 'bg-slate-800 text-slate-500'
                }`}>
                  <Activity className="w-3 h-3" />
                  <span>ws bridge</span>
                </div>
              </>
            )}

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

            {/* Only show launch browser button when no active neuromap (browser launch is in NeuromapWorkspace) */}
            {!activeNeuromapId && (
              <button
                onClick={handleLaunchBrowser}
                disabled={launchBrowserLoading || isProduction}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg text-white text-sm font-medium transition-colors shadow-lg shadow-green-500/20"
                title={isProduction ? 'Browser automation only works locally' : 'Auto-starts mitmproxy and bridge, then launches Chromium with proxy configured. Click and browse; API calls appear in real-time.'}
              >
                <Monitor className="w-4 h-4" />
                {launchBrowserLoading ? 'Starting Services & Launching…' : isProduction ? 'Launch Browser (Local Only)' : 'Launch Browser (Auto-Setup)'}
              </button>
            )}
            
            {isProduction && (
              <p className="text-yellow-400 text-xs">
                ⚠️ Browser auto-capture requires local setup. Use HAR import instead.
              </p>
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
        )}


        {/* Session Stats - Only show when no active neuromap */}
        {!activeNeuromapId && stats && (
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

        {/* Tabs: All / Critical / Auth / Polling - Only show when no active neuromap */}
        {!activeNeuromapId && flows.length > 0 && (
          <div className="mb-4 flex gap-2 border-b border-slate-800 pb-2">
            {(['all', 'critical', 'auth', 'polling'] as ExplorerTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-t text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'bg-slate-800 text-white border-b-2'
                    : 'bg-transparent text-slate-400 hover:text-slate-300 hover:bg-slate-800/50'
                }`}
                style={activeTab === tab ? { borderBottomColor: '#ff5757' } : {}}
              >
                {tab === 'all' && 'All'}
                {tab === 'critical' && `Critical (${criticalPathEndpoints.length})`}
                {tab === 'auth' && `Auth (${authEndpoints.length})`}
                {tab === 'polling' && `Polling (${pollingEndpoints.length})`}
              </button>
            ))}
          </div>
        )}

        {/* Controls - Only show when no active neuromap */}
        {!activeNeuromapId && flows.length > 0 && (
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
                endpointMapRef.current.clear();
                sessionStartRef.current = null;
                setInteractionWindow(null);
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                  wsRef.current.send(JSON.stringify({ type: 'clear_session' }));
                }
              }}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-sm text-white transition-colors ml-auto"
            >
              <X className="w-4 h-4" />
              Clear
            </button>
          </div>
        )}

        {/* API Routes Grid - Modern card-based layout with code snippets */}
        {!activeNeuromapId && filteredEndpoints.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-cyan-900/20 to-purple-900/20 rounded-lg border border-cyan-500/30">
              <div className="flex items-center gap-3">
                <Terminal className="w-5 h-5 text-cyan-400" />
                <h3 className="text-lg font-bold text-cyan-400 font-mono tracking-wider">
                  API ROUTES <span className="text-slate-500">///</span> <span className="text-purple-400">{filteredEndpoints.length}</span>
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {['curl', 'fetch', 'axios', 'python'].map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setSnippetLang(lang as CodeSnippetLang)}
                    className={`px-3 py-1 text-xs font-mono rounded transition-all ${
                      snippetLang === lang
                        ? 'bg-cyan-500 text-black font-bold shadow-lg shadow-cyan-500/50'
                        : 'bg-slate-800/50 text-slate-400 hover:text-cyan-400 hover:bg-slate-700/50'
                    }`}
                  >
                    {lang.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            
            <div id="endpoints-grid" className="space-y-2 max-h-[70vh] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-cyan-500/30 scrollbar-track-transparent">
              {filteredEndpoints.map((ep) => {
                const key = `${ep.method} ${ep.host}${ep.path}`;
                const isSelected = selectedEndpoints.has(key);
                const isExpanded = expandedEndpoint === key;
                const criticalNode = ep.criticalNode;
                
                // Get code snippet
                const snippet = 
                  snippetLang === 'curl' ? generateCurl(ep) :
                  snippetLang === 'fetch' ? generateFetch(ep) :
                  snippetLang === 'axios' ? generateAxios(ep) :
                  generatePython(ep);
                
                const copyKey = `${key}-${snippetLang}`;

                return (
                  <div
                    key={key}
                    className={`group relative overflow-hidden rounded-lg border transition-all duration-300 ${
                      isSelected 
                        ? 'border-cyan-500 bg-gradient-to-br from-cyan-900/30 to-purple-900/20 shadow-lg shadow-cyan-500/20' 
                        : 'border-slate-700/50 bg-slate-900/70 hover:border-cyan-500/50 hover:shadow-md hover:shadow-cyan-500/10'
                    }`}
                  >
                    {/* Main endpoint card */}
                    <div className="p-4">
                      <div className="flex items-start gap-4">
                        {/* Checkbox */}
                        {activeTab !== 'critical' && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleEndpointSelection(key)}
                            className="mt-1 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
                          />
                        )}
                        
                        {/* Endpoint Info */}
                        <div className="flex-1 min-w-0">
                          {/* Route header */}
                          <div className="flex items-center gap-3 mb-3">
                            <span className={`px-3 py-1 rounded-md text-sm font-bold font-mono shadow-lg ${
                              ep.method === 'GET' ? 'bg-blue-500 text-white shadow-blue-500/50' :
                              ep.method === 'POST' ? 'bg-green-500 text-white shadow-green-500/50' :
                              ep.method === 'PUT' ? 'bg-yellow-500 text-black shadow-yellow-500/50' :
                              ep.method === 'DELETE' ? 'bg-red-500 text-white shadow-red-500/50' :
                              'bg-purple-500 text-white shadow-purple-500/50'
                            }`}>
                              {ep.method}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-slate-500 font-mono mb-0.5">{ep.host}</div>
                              <div className="text-lg font-mono font-bold text-cyan-300 truncate">{ep.path}</div>
                            </div>
                            <button
                              onClick={() => setExpandedEndpoint(isExpanded ? null : key)}
                              className="p-2 rounded-lg bg-slate-800 hover:bg-cyan-900/50 border border-slate-700 hover:border-cyan-500/50 transition-all"
                              title={isExpanded ? 'Hide code' : 'Show code'}
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-5 h-5 text-cyan-400" />
                              ) : (
                                <ChevronRight className="w-5 h-5 text-slate-400" />
                              )}
                            </button>
                          </div>
                          
                          {/* Metadata badges */}
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-800/50 rounded border border-slate-700">
                              <Activity className="w-3 h-3 text-purple-400" />
                              <span className="text-slate-400">Count:</span>
                              <span className="text-white font-mono">{ep.count}</span>
                            </div>
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-800/50 rounded border border-slate-700">
                              <Server className="w-3 h-3 text-green-400" />
                              <span className="text-slate-400">Status:</span>
                              <span className="text-green-300 font-mono">
                                {Object.entries(ep.statuses).sort(([a], [b]) => Number(b) - Number(a)).slice(0, 2).map(([s, c]) => `${s}(${c})`).join(', ')}
                              </span>
                            </div>
                            {ep.hasAuth && (
                              <div className="flex items-center gap-1 px-2 py-1 bg-green-900/30 border border-green-500/50 rounded">
                                <Check className="w-3 h-3 text-green-400" />
                                <span className="text-green-300 font-semibold">Authenticated</span>
                              </div>
                            )}
                            {ep.isMutation && (
                              <div className="px-2 py-1 bg-purple-900/30 border border-purple-500/50 rounded text-purple-300 font-semibold">
                                Mutation
                              </div>
                            )}
                            {criticalNode && (
                              <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-900/30 border border-amber-500/50 rounded">
                                <Zap className="w-3 h-3 text-amber-400" />
                                <span className="text-amber-300 font-semibold">Critical: {criticalNode.score}%</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Expandable Code Snippet Section */}
                    {isExpanded && (
                      <div className="border-t border-cyan-500/30 bg-black/40 backdrop-blur-sm">
                        <div className="p-4">
                          {/* Code header */}
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <FileCode className="w-4 h-4 text-cyan-400" />
                              <span className="text-sm font-mono font-bold text-cyan-400 uppercase tracking-wider">
                                {snippetLang} Code Snippet
                              </span>
                            </div>
                            <button
                              onClick={() => copyToClipboard(snippet, copyKey, setCopiedSnippet)}
                              className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-cyan-900/50 border border-slate-700 hover:border-cyan-500 rounded text-xs font-mono text-slate-300 hover:text-cyan-300 transition-all"
                            >
                              {copiedSnippet === copyKey ? (
                                <>
                                  <Check className="w-4 h-4 text-green-400" />
                                  <span className="text-green-400">Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-4 h-4" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                          
                          {/* Code block with terminal styling */}
                          <div className="relative">
                            <div className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-cyan-500/10 to-transparent pointer-events-none" />
                            <pre className="relative bg-slate-950 border border-cyan-500/30 rounded-lg p-4 overflow-x-auto text-sm font-mono leading-relaxed shadow-inner shadow-cyan-500/10">
                              <code className="text-cyan-300">
                                {snippet.split('\n').map((line, i) => (
                                  <div key={i} className="hover:bg-cyan-900/20 px-2 -mx-2 rounded transition-colors">
                                    <span className="text-slate-600 select-none mr-4">{String(i + 1).padStart(2, '0')}</span>
                                    <span className="text-cyan-300">{line}</span>
                                  </div>
                                ))}
                              </code>
                            </pre>
                            <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-cyan-500/10 to-transparent pointer-events-none" />
                          </div>
                          
                          {/* Additional info */}
                          {criticalNode && (
                            <div className="mt-4 p-3 bg-amber-900/20 border border-amber-500/30 rounded-lg">
                              <div className="flex items-start gap-2">
                                <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5" />
                                <div className="flex-1 text-xs text-amber-200 space-y-1">
                                  <div className="font-semibold text-amber-400">Critical Path Analysis:</div>
                                  {criticalNode.reasons.slice(0, 3).map((reason, idx) => (
                                    <div key={idx}>• {reason}</div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {flows.length > 0 && filteredEndpoints.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            No endpoints match the current preset filter.
          </div>
        )}

        {/* Integrated Neuromap View */}
        {activeNeuromapId ? (() => {
          const activeNeuromap = neuromaps.find(n => n.id === activeNeuromapId);
          if (!activeNeuromap) return null;
          return (
            <NeuromapWorkspace
              neuromap={activeNeuromap}
              onUpdate={(updated) => {
                setNeuromaps(prev => prev.map(n => n.id === updated.id ? updated : n));
              }}
              onClose={() => {
                setActiveNeuromapId(null);
                if (activeNeuromap) {
                  activeNeuromap.isActive = false;
                }
              }}
            />
          );
        })() : null}
      </div>
    </div>
  );
}
