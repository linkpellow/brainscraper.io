'use client';

import { useState, useMemo } from 'react';
import { Upload, Download, Filter, X, FileJson, Activity, Server, Clock } from 'lucide-react';

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

export default function APISignalExplorerPage() {
  const [flows, setFlows] = useState<MitmFlowEvent[]>([]);
  const [session, setSession] = useState<MitmExport['session'] | null>(null);
  const [preset, setPreset] = useState<NoisePreset>('default');
  const [selectedEndpoints, setSelectedEndpoints] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

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

  // Analyze and deduplicate endpoints
  const endpoints = useMemo(() => {
    if (networkEvents.length === 0) return [];

    // Simple deduplication by method + host + path
    const endpointMap = new Map<string, {
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
    }>();

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
        });
      }

      const endpoint = endpointMap.get(key)!;
      endpoint.count++;
      
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
  }, [networkEvents]);

  // Apply noise suppression preset
  const filteredEndpoints = useMemo(() => {
    let filtered = [...endpoints];

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
    // 'everything' preset shows all

    return filtered.sort((a, b) => b.count - a.count);
  }, [endpoints, preset]);

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

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

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

        {/* Upload Section */}
        {flows.length === 0 && (
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
                    return (
                      <tr
                        key={key}
                        className={`hover:bg-slate-800/30 transition-colors ${isSelected ? 'bg-slate-800/50' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleEndpointSelection(key)}
                            className="rounded"
                          />
                        </td>
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
