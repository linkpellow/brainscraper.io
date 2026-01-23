/**
 * Auth Worker Detail Page
 * 
 * Shows details for a specific auth worker:
 * - Worker header with status
 * - List of API endpoints
 * - Click endpoint to test/execute
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { getSessionById } from '../utils/authWorkerPersistence';
import type { PersistedAuthWorkerState } from '../utils/authWorkerPersistence';
import { getStoredMappings } from './map-api/endpointMapping';
import type { EndpointMapping } from './map-api/endpointMapping';
import type { EndpointCatalog, EndpointCatalogEntry } from './map-api/endpointCatalog';
import { 
  ArrowLeft, 
  Shield, 
  Network, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  RefreshCw,
  Code2,
  Play,
  ExternalLink,
  Globe,
  Key,
  Cookie,
  Lock,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { needsTokenRefresh } from '../utils/tokenRefreshService';
import AppLayout from '../../components/AppLayout';

export default function AuthWorkerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params?.sessionId as string;
  
  const [session, setSession] = useState<PersistedAuthWorkerState | null>(null);
  const [mappings, setMappings] = useState<EndpointMapping[]>([]);
  const [catalog, setCatalog] = useState<EndpointCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showNoise, setShowNoise] = useState(false);
  const [expandedEndpoints, setExpandedEndpoints] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [authSummaryExpanded, setAuthSummaryExpanded] = useState(true);

  useEffect(() => {
    if (!sessionId) {
      router.push('/auth-workers');
      return;
    }

    loadData();
  }, [sessionId, router]);

  const loadData = async () => {
    setLoading(true);
    try {
      const loadedSession = getSessionById(sessionId);
      if (!loadedSession) {
        router.push('/auth-workers');
        return;
      }
      
      setSession(loadedSession);
      
      // Load mappings for this session
      const allMappings = await getStoredMappings();
      const sessionMappings = allMappings.filter(m => 
        m.siteKey.includes(loadedSession.targetDomain) || 
        loadedSession.targetDomain.includes(m.siteKey.split('.')[0])
      );
      setMappings(sessionMappings);
      
      // Load endpoint catalog from HAR data
      try {
        const response = await fetch(`/api/auth-worker/har-data?sessionId=${sessionId}`);
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data?.catalog) {
            setCatalog(result.data.catalog);
          }
        }
      } catch (error) {
        console.error('[AuthWorkerDetail] Failed to load HAR catalog:', error);
      }
    } catch (error) {
      console.error('[AuthWorkerDetail] Load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshToken = async () => {
    if (!session) return;
    
    setRefreshing(true);
    try {
      const { refreshAuthWorkerToken } = await import('../utils/tokenRefreshService');
      const result = await refreshAuthWorkerToken(session.sessionId);
      if (result.success) {
        await loadData(); // Reload to show updated token
      }
    } catch (error) {
      console.error('[AuthWorkerDetail] Refresh error:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleEndpointClick = (endpointSignature: string | { method: string; normalizedPathTemplate: string }) => {
    if (!session) return;
    
    // Create a stable endpoint ID from signature
    const signatureStr = typeof endpointSignature === 'string' 
      ? endpointSignature 
      : `${endpointSignature.method} ${endpointSignature.normalizedPathTemplate}`;
    const endpointId = btoa(signatureStr).replace(/[+/=]/g, '').substring(0, 16);
    router.push(`/auth-workers/${session.sessionId}/test?endpoint=${endpointId}`);
  };
  
  const toggleEndpoint = (endpointId: string) => {
    const newExpanded = new Set(expandedEndpoints);
    if (newExpanded.has(endpointId)) {
      newExpanded.delete(endpointId);
    } else {
      newExpanded.add(endpointId);
    }
    setExpandedEndpoints(newExpanded);
  };
  
  const getRoleColor = (role: string) => {
    switch (role) {
      case 'AUTH': return 'bg-blue-500/20 text-blue-400';
      case 'MUTATION': return 'bg-orange-500/20 text-orange-400';
      case 'DATA': return 'bg-emerald-500/20 text-emerald-400';
      case 'NOISE': return 'bg-gray-500/20 text-gray-400';
      default: return 'bg-white/10 text-white/60';
    }
  };
  
  // Filter catalog entries
  const filteredCatalogEntries = useMemo(() => {
    if (!catalog) return [];
    return catalog.entries.filter(e => {
      // Role filter
      if (roleFilter && e.role !== roleFilter) return false;
      
      // Noise filter
      if (!showNoise && e.role === 'NOISE') return false;
      
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesPath = e.path.toLowerCase().includes(query);
        const matchesMethod = e.method.toLowerCase().includes(query);
        const matchesPurpose = e.purposeGuess.toLowerCase().includes(query);
        const matchesHost = e.host.toLowerCase().includes(query);
        if (!matchesPath && !matchesMethod && !matchesPurpose && !matchesHost) {
          return false;
        }
      }
      
      return true;
    });
  }, [catalog, showNoise, roleFilter, searchQuery]);
  
  // Get role counts for filter badges
  const roleCounts = useMemo(() => {
    if (!catalog) return {};
    const counts: Record<string, number> = {};
    catalog.entries.forEach(e => {
      if (!showNoise && e.role === 'NOISE') return;
      counts[e.role] = (counts[e.role] || 0) + 1;
    });
    return counts;
  }, [catalog, showNoise]);

  if (loading) {
    return (
      <AppLayout>
        <div className="min-h-screen p-8 flex items-center justify-center">
          <div className="text-white/60">Loading auth worker...</div>
        </div>
      </AppLayout>
    );
  }

  if (!session) {
    return (
      <AppLayout>
        <div className="min-h-screen p-8 flex items-center justify-center">
          <div className="text-white/60">Auth worker not found</div>
        </div>
      </AppLayout>
    );
  }

  const tokenNeedsRefresh = needsTokenRefresh(session);
  const expiresAt = session.step2.extractedVars.expires_at 
    ? parseInt(session.step2.extractedVars.expires_at, 10)
    : null;
  const createdDate = new Date(session.stabilizedAt);
  const authMethod = session.step2.extractedVars.auth_method;
  
  // Determine connection status
  const hasAccessToken = !!session.step2.extractedVars.access_token;
  const hasRefreshToken = !!session.step2.extractedVars.refresh_token;
  const isConnected = hasAccessToken && (!expiresAt || expiresAt > Date.now());
  const isStable = !tokenNeedsRefresh && isConnected;

  return (
    <AppLayout>
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          {/* Back Button */}
          <button
            onClick={() => router.push('/auth-workers')}
            className="mb-6 flex items-center gap-2 text-white/60 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>

          {/* Worker Header */}
          <div className="bg-gradient-to-br from-white/[0.08] via-white/[0.05] to-white/[0.03] border border-white/10 rounded-2xl p-8 mb-6 relative overflow-hidden shadow-2xl backdrop-blur-sm">
            {/* Decorative background elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>
            
            <div className="relative z-10">
              {/* Top Section: Title and Running Badge */}
              <div className="flex items-start justify-between mb-7">
                <div className="flex items-center gap-5">
                  <div className="relative">
                    <div className="p-3.5 bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 rounded-xl border border-emerald-500/25 shadow-lg">
                      <Globe className="w-7 h-7 text-emerald-400 drop-shadow-lg" />
                    </div>
                    {isConnected && isStable && (
                      <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-black shadow-lg">
                        <div className="absolute inset-0 bg-emerald-400 rounded-full animate-ping opacity-75"></div>
                        <div className="absolute inset-0 bg-emerald-400 rounded-full"></div>
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-1.5">
                      <h1 className="text-3xl font-bold text-white tracking-tight drop-shadow-sm">
                        {session.targetDomain || session.sessionId.substring(0, 12)}
                      </h1>
                      {isConnected && isStable && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-500/25 to-emerald-500/15 border border-emerald-500/40 rounded-lg backdrop-blur-sm shadow-md">
                          <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse shadow-sm"></div>
                          <span className="text-xs text-emerald-300 font-semibold tracking-wide drop-shadow">Running</span>
                        </div>
                      )}
                    </div>
                    <p className="text-white/45 text-xs font-mono tracking-widest">
                      {session.sessionId}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  {!isStable && (
                    <button
                      onClick={handleRefreshToken}
                      disabled={refreshing}
                      className="px-4 py-2 bg-gradient-to-r from-emerald-500/25 to-emerald-500/15 hover:from-emerald-500/35 hover:to-emerald-500/25 text-emerald-300 rounded-lg transition-all flex items-center gap-2 border border-emerald-500/40 disabled:opacity-50 hover:scale-105 active:scale-95 shadow-md hover:shadow-lg"
                    >
                      <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                      Refresh Token
                    </button>
                  )}
                </div>
              </div>

              {/* Middle Section: Auth Method Badge */}
              {authMethod && (
                <div className="mb-7">
                  <span className="inline-flex items-center gap-2.5 px-4 py-2.5 bg-gradient-to-r from-white/12 to-white/8 border border-white/25 rounded-xl text-sm text-white/95 backdrop-blur-sm shadow-md">
                    <Key className="w-4 h-4 text-emerald-400 drop-shadow-sm" />
                    <span className="font-semibold tracking-wide">
                      {authMethod === 'oauth' ? 'OAuth' : 
                       authMethod === 'bearer_header' ? 'Bearer Token' :
                       authMethod === 'api_key' ? 'API Key' :
                       authMethod.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </span>
                  </span>
                </div>
              )}

              {/* Bottom Section: Metadata Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                <div className="space-y-2">
                  <div className="text-white/35 text-xs font-semibold uppercase tracking-[0.15em]">Created</div>
                  <div className="text-white text-lg font-bold tracking-tight">{createdDate.toLocaleDateString()}</div>
                </div>
                <div className="space-y-2">
                  <div className="text-white/35 text-xs font-semibold uppercase tracking-[0.15em]">Saved Endpoints</div>
                  <div className="text-white text-lg font-bold tracking-tight">{mappings.length}</div>
                </div>
                <div className="space-y-2">
                  <div className="text-white/35 text-xs font-semibold uppercase tracking-[0.15em]">Extracted Endpoints</div>
                  <div className="text-white text-lg font-bold tracking-tight">{catalog ? catalog.entries.length : 0}</div>
                </div>
                <div className="space-y-2">
                  <div className="text-white/35 text-xs font-semibold uppercase tracking-[0.15em]">Status</div>
                  <div className="text-white text-lg font-bold tracking-tight">{isStable ? 'Stable' : 'Unstable'}</div>
                </div>
              </div>

              {/* Expires Badge - Below Metadata Grid */}
              {expiresAt && (
                <div className="mt-6 pt-6 border-t border-white/10">
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-white/50" />
                    <div>
                      <div className="text-white/35 uppercase tracking-[0.15em] text-[10px] font-semibold mb-0.5">Expires</div>
                      <div className="text-white/95 font-bold tracking-tight text-sm">{new Date(expiresAt).toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Mapped Endpoints Section */}
          {mappings.length > 0 && (
            <div className="bg-gradient-to-br from-white/[0.06] to-white/[0.03] border border-white/10 rounded-xl p-6 mb-6 shadow-lg backdrop-blur-sm">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                    <Network className="w-5 h-5 text-emerald-400" />
                  </div>
                  <h2 className="text-2xl font-bold text-white tracking-tight">Mapped Endpoints</h2>
                  <span className="px-3 py-1 bg-white/10 border border-white/20 rounded-lg text-sm text-white/90 font-semibold">
                    {mappings.length}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                {mappings.map((mapping, idx) => {
                  const signature = typeof mapping.endpointSignature === 'string' 
                    ? mapping.endpointSignature 
                    : `${mapping.endpointSignature.method} ${mapping.endpointSignature.normalizedPathTemplate}`;
                  const method = typeof mapping.endpointSignature === 'string'
                    ? (mapping.endpointSignature as string).split(' ')[0]
                    : mapping.endpointSignature.method;
                  const path = typeof mapping.endpointSignature === 'string'
                    ? (mapping.endpointSignature as string).split(' ').slice(1).join(' ')
                    : mapping.endpointSignature.normalizedPathTemplate;

                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        const signatureStr = typeof mapping.endpointSignature === 'string' 
                          ? mapping.endpointSignature 
                          : `${mapping.endpointSignature.method} ${mapping.endpointSignature.normalizedPathTemplate}`;
                        const endpointId = btoa(signatureStr).replace(/[+/=]/g, '').substring(0, 16);
                        router.push(`/auth-workers/${session.sessionId}/map-api/test?endpoint=${endpointId}`);
                      }}
                      className="bg-white/[0.03] border border-white/10 rounded-xl p-4 hover:bg-white/5 hover:border-white/20 transition-all cursor-pointer group shadow-sm hover:shadow-md"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className={`px-2 py-1 rounded text-xs font-mono ${
                              method === 'GET' ? 'bg-blue-500/20 text-blue-400' :
                              method === 'POST' ? 'bg-green-500/20 text-green-400' :
                              method === 'PUT' ? 'bg-yellow-500/20 text-yellow-400' :
                              method === 'DELETE' ? 'bg-red-500/20 text-red-400' :
                              'bg-white/10 text-white/80'
                            }`}>
                              {method}
                            </span>
                            <span className="text-white font-mono text-sm">{path}</span>
                          </div>
                          {mapping.automationKey && (
                            <div className="text-white/60 text-sm mb-2">
                              {mapping.automationKey}
                            </div>
                          )}
                          <div className="flex items-center gap-4 text-xs text-white/50">
                            <span>Site: {mapping.siteKey}</span>
                            {mapping.mappedAt && (
                              <span>Mapped: {new Date(mapping.mappedAt).toLocaleDateString()}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEndpointClick(mapping.endpointSignature);
                            }}
                            className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded transition-colors flex items-center gap-2 text-sm border border-emerald-500/30"
                          >
                            <Play className="w-3 h-3" />
                            Test
                          </button>
                          <ExternalLink className="w-4 h-4 text-white/40 group-hover:text-emerald-400 transition-colors" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Combined API Discovery & Endpoint Catalog */}
          {catalog && (
            <div className="bg-gradient-to-br from-white/[0.06] via-white/[0.04] to-white/[0.02] border border-white/10 rounded-xl p-6 mb-6 shadow-lg backdrop-blur-sm">
              {/* Header with Auth Summary Toggle */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-gradient-to-br from-emerald-500/20 to-emerald-500/10 rounded-lg border border-emerald-500/25 shadow-md">
                    <Sparkles className="w-6 h-6 text-emerald-400 drop-shadow-sm" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2 tracking-tight drop-shadow-sm">
                      API Discovery & Endpoints
                    </h2>
                    <p className="text-white/55 text-sm mt-1 font-medium">
                      {filteredCatalogEntries.length} endpoints discovered from HAR
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setAuthSummaryExpanded(!authSummaryExpanded)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg transition-all text-sm text-white/80 hover:scale-105 active:scale-95 shadow-sm"
                >
                  <Key className="w-4 h-4" />
                  {authSummaryExpanded ? 'Hide' : 'Show'} Auth Info
                  {authSummaryExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              </div>

              {/* Collapsible Auth Summary */}
              {authSummaryExpanded && catalog.authSummary && (
                <div className="mb-6 p-5 bg-white/[0.04] border border-white/15 rounded-xl backdrop-blur-sm shadow-inner">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Session Cookies */}
                    {catalog.authSummary.sessionCookies.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <Cookie className="w-4 h-4 text-blue-400" />
                          <h3 className="text-sm font-semibold text-white">Session Cookies</h3>
                          <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded">
                            {catalog.authSummary.sessionCookies.length}
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {catalog.authSummary.sessionCookies.slice(0, 3).map((cookie: { name: string; mintedBy: string }, idx: number) => (
                            <div key={idx} className="p-2 bg-white/[0.02] border border-white/10 rounded text-xs">
                              <div className="font-mono text-white truncate">{cookie.name}</div>
                              <div className="text-white/50 mt-0.5 truncate">from {cookie.mintedBy}</div>
                            </div>
                          ))}
                          {catalog.authSummary.sessionCookies.length > 3 && (
                            <div className="text-xs text-white/50 text-center pt-1">
                              +{catalog.authSummary.sessionCookies.length - 3} more
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Token Endpoints */}
                    {catalog.authSummary.tokenEndpoints.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <Lock className="w-4 h-4 text-purple-400" />
                          <h3 className="text-sm font-semibold text-white">Token Endpoints</h3>
                          <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded">
                            {catalog.authSummary.tokenEndpoints.length}
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {catalog.authSummary.tokenEndpoints.map((endpoint: { endpoint: string; returns: string[] }, idx: number) => (
                            <div key={idx} className="p-2 bg-white/[0.02] border border-white/10 rounded text-xs">
                              <div className="font-mono text-white text-[10px] truncate">{endpoint.endpoint}</div>
                              <div className="text-white/50 mt-0.5">Returns: {endpoint.returns.join(', ')}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Blocked Endpoints */}
                    {catalog.authSummary.blockedEndpoints.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <AlertCircle className="w-4 h-4 text-red-400" />
                          <h3 className="text-sm font-semibold text-white">Blocked Endpoints</h3>
                          <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded">
                            {catalog.authSummary.blockedEndpoints.length}
                          </span>
                        </div>
                        <div className="space-y-1.5 max-h-32 overflow-y-auto">
                          {catalog.authSummary.blockedEndpoints.slice(0, 3).map((endpoint: { endpoint: string; reason: string }, idx: number) => (
                            <div key={idx} className="p-2 bg-red-500/10 border border-red-500/20 rounded text-xs">
                              <div className="font-mono text-white text-[10px] truncate">{endpoint.endpoint}</div>
                              <div className="text-red-400 mt-0.5 text-[10px] truncate">{endpoint.reason}</div>
                            </div>
                          ))}
                          {catalog.authSummary.blockedEndpoints.length > 3 && (
                            <div className="text-xs text-white/50 text-center pt-1">
                              +{catalog.authSummary.blockedEndpoints.length - 3} more
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Search and Filters */}
              <div className="mb-6 space-y-4">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/40" />
                  <input
                    type="text"
                    placeholder="Search endpoints by path, method, or purpose..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all shadow-sm focus:shadow-md"
                  />
                </div>

                {/* Filter Bar */}
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2 text-sm text-white/60">
                    <Filter className="w-4 h-4" />
                    <span>Filter:</span>
                  </div>
                  <button
                    onClick={() => setRoleFilter(null)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shadow-sm ${
                      roleFilter === null
                        ? 'bg-emerald-500/30 text-emerald-400 border border-emerald-500/50 shadow-emerald-500/20'
                        : 'bg-white/10 text-white/60 hover:bg-white/20 border border-white/20'
                    }`}
                  >
                    All ({catalog.entries.length})
                  </button>
                  {['AUTH', 'DATA', 'MUTATION'].map((role) => (
                    <button
                      key={role}
                      onClick={() => setRoleFilter(roleFilter === role ? null : role)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shadow-sm ${getRoleColor(role)} ${
                        roleFilter === role ? 'ring-2 ring-offset-2 ring-offset-black/50 ring-white/30 shadow-lg scale-105' : 'border border-transparent hover:border-white/20'
                      }`}
                    >
                      {role} ({roleCounts[role] || 0})
                    </button>
                  ))}
                  <label className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg cursor-pointer transition-all text-xs text-white/60 shadow-sm hover:shadow-md">
                    <input
                      type="checkbox"
                      checked={showNoise}
                      onChange={(e) => setShowNoise(e.target.checked)}
                      className="rounded"
                    />
                    Show Noise ({roleCounts['NOISE'] || 0})
                  </label>
                </div>
              </div>

              {/* Endpoint List */}
              {filteredCatalogEntries.length === 0 ? (
                <div className="text-center py-12">
                  <Network className="w-12 h-12 text-white/20 mx-auto mb-4" />
                  <p className="text-white/60 mb-2">No endpoints found</p>
                  <p className="text-white/40 text-sm">
                    {searchQuery || roleFilter ? 'Try adjusting your filters' : 'Upload a HAR file to discover endpoints'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredCatalogEntries.map((entry) => {
                    const isExpanded = expandedEndpoints.has(entry.id);
                    return (
                      <div 
                        id={`endpoint-${entry.id}`}
                        key={entry.id} 
                        className="bg-white/[0.04] border border-white/10 rounded-xl overflow-hidden transition-all hover:border-white/20 hover:bg-white/5 shadow-sm hover:shadow-md"
                      >
                        {/* Header */}
                        <div
                          className="p-4 cursor-pointer transition-colors"
                          onClick={() => toggleEndpoint(entry.id)}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <span className={`px-2 py-1 text-xs font-semibold rounded ${getRoleColor(entry.role)}`}>
                                  {entry.role}
                                </span>
                                <span className={`px-2 py-1 text-xs font-semibold rounded ${
                                  entry.method === 'GET' ? 'bg-blue-500/20 text-blue-400' :
                                  entry.method === 'POST' ? 'bg-green-500/20 text-green-400' :
                                  entry.method === 'PUT' ? 'bg-yellow-500/20 text-yellow-400' :
                                  entry.method === 'DELETE' ? 'bg-red-500/20 text-red-400' :
                                  'bg-white/10 text-white/80'
                                }`}>
                                  {entry.method}
                                </span>
                                <span className="text-sm font-mono text-white/90 truncate">{entry.path}</span>
                                <span className="text-xs text-white/50 whitespace-nowrap">({entry.callCount} calls)</span>
                              </div>
                              <div className="text-sm text-white/70 mb-1">{entry.purposeGuess}</div>
                              <div className="text-xs text-white/50 font-mono truncate">{entry.host}</div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/auth-workers/${sessionId}/map-api/test?endpoint=${entry.id}`);
                                }}
                                className="px-3 py-1.5 bg-gradient-to-r from-emerald-500/25 to-emerald-500/15 hover:from-emerald-500/35 hover:to-emerald-500/25 text-emerald-300 border border-emerald-500/40 rounded-lg transition-all flex items-center gap-1.5 text-xs font-semibold shadow-sm hover:shadow-md hover:scale-105 active:scale-95"
                              >
                                <Code2 className="w-3 h-3" />
                                Test
                              </button>
                              <div className="text-white/40">
                                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Expanded Content */}
                        {isExpanded && (
                          <div className="border-t border-white/10 p-4 space-y-4 bg-white/[0.02]">
                            {/* Required Auth */}
                            {(entry.requiredAuth.cookies.length > 0 || entry.requiredAuth.headers.length > 0) && (
                              <div>
                                <h4 className="text-xs font-semibold text-white/90 mb-2 flex items-center gap-1.5">
                                  <Lock className="w-3 h-3" />
                                  Required Auth
                                </h4>
                                {entry.requiredAuth.cookies.length > 0 && (
                                  <div className="mb-2">
                                    <div className="text-xs text-white/60 mb-1.5 flex items-center gap-1">
                                      <Cookie className="w-3 h-3" />
                                      Cookies:
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {entry.requiredAuth.cookies.map((cookie, idx) => (
                                        <div key={idx} className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded">
                                          {cookie}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {entry.requiredAuth.headers.length > 0 && (
                                  <div>
                                    <div className="text-xs text-white/60 mb-1.5">Headers:</div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {entry.requiredAuth.headers.map((header, idx) => (
                                        <div key={idx} className="px-2 py-1 bg-purple-500/20 text-purple-400 text-xs rounded">
                                          {header}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Request/Response Schema Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <h4 className="text-xs font-semibold text-white/90 mb-2">Request Schema</h4>
                                <div className="text-xs text-white/60 space-y-1 bg-white/[0.02] p-2 rounded">
                                  <div>Method: <span className="text-white/80 font-mono">{entry.requestSchema.method}</span></div>
                                  <div>Path: <span className="text-white/80 font-mono break-all">{entry.requestSchema.path}</span></div>
                                  {entry.requestSchema.queryParams && entry.requestSchema.queryParams.length > 0 && (
                                    <div>Query: <span className="text-white/80 font-mono">{entry.requestSchema.queryParams.join(', ')}</span></div>
                                  )}
                                </div>
                              </div>
                              <div>
                                <h4 className="text-xs font-semibold text-white/90 mb-2">Response Schema</h4>
                                <div className="text-xs text-white/60 space-y-1 bg-white/[0.02] p-2 rounded">
                                  <div>Status: <span className="text-white/80">{entry.responseSchema.statusCodes.join(', ')}</span></div>
                                  {entry.responseSchema.contentType && (
                                    <div>Type: <span className="text-white/80">{entry.responseSchema.contentType}</span></div>
                                  )}
                                  {entry.responseSchema.topLevelKeys && entry.responseSchema.topLevelKeys.length > 0 && (
                                    <div>Keys: <span className="text-white/80 font-mono">{entry.responseSchema.topLevelKeys.slice(0, 3).join(', ')}</span></div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
