/**
 * Auth Workers Page
 * 
 * Main page with tabs:
 * - Auth Workers: List of all workers
 * - Create Auth Worker: HAR upload and creation
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { listAllSessions, getSessionById } from './utils/authWorkerPersistence';
import type { PersistedAuthWorkerState } from './utils/authWorkerPersistence';
import { getStoredMappings } from './[sessionId]/map-api/endpointMapping';
import type { EndpointMapping } from './[sessionId]/map-api/endpointMapping';
import { Key, Network, ArrowRight, Clock, CheckCircle, AlertCircle, RefreshCw, Plus } from 'lucide-react';
import { needsTokenRefresh } from './utils/tokenRefreshService';
import AppLayout from '../components/AppLayout';
import HARUploadSection from './components/HARUploadSection';

type TabType = 'workers' | 'create';

export default function AuthWorkersPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('workers');
  const [sessions, setSessions] = useState<PersistedAuthWorkerState[]>([]);
  const [mappings, setMappings] = useState<Map<string, EndpointMapping[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (activeTab === 'workers') {
      loadData();
    }
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load all sessions
      const sessionList = listAllSessions();
      const sessionObjects = sessionList
        .map(s => getSessionById(s.sessionId))
        .filter((s): s is PersistedAuthWorkerState => s !== null);
      setSessions(sessionObjects);

      // Load mappings for each session
      const allMappings = await getStoredMappings();
      const mappingsBySession = new Map<string, EndpointMapping[]>();
      
      for (const session of sessionObjects) {
        const sessionMappings = allMappings.filter(m => 
          m.siteKey.includes(session.targetDomain) || 
          session.targetDomain.includes(m.siteKey.split('.')[0])
        );
        mappingsBySession.set(session.sessionId, sessionMappings);
      }
      
      setMappings(mappingsBySession);
    } catch (error) {
      console.error('[AuthWorkersPage] Load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshToken = async (sessionId: string) => {
    setRefreshing(prev => new Set(prev).add(sessionId));
    try {
      const { refreshAuthWorkerToken } = await import('./utils/tokenRefreshService');
      const result = await refreshAuthWorkerToken(sessionId);
      if (result.success) {
        await loadData(); // Reload to show updated token
      }
    } catch (error) {
      console.error('[AuthWorkersPage] Refresh error:', error);
    } finally {
      setRefreshing(prev => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
    }
  };

  const handleWorkerClick = (sessionId: string) => {
    router.push(`/auth-workers/${sessionId}`);
  };

  const handleEndpointClick = (sessionId: string, endpointSignature: string | { method: string; normalizedPathTemplate: string }) => {
    // Create a stable endpoint ID from signature
    const signatureStr = typeof endpointSignature === 'string' 
      ? endpointSignature 
      : `${endpointSignature.method} ${endpointSignature.normalizedPathTemplate}`;
    const endpointId = btoa(signatureStr).replace(/[+/=]/g, '').substring(0, 16);
    router.push(`/auth-workers/${sessionId}/map-api/test?endpoint=${endpointId}`);
  };

  return (
    <AppLayout>
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Key className="w-8 h-8 text-emerald-400" />
                <div>
                  <h1 className="text-3xl font-bold text-white">Auth Workers</h1>
                  <p className="text-white/60 mt-1">Manage your authenticated API sessions</p>
                </div>
              </div>
              <button
                onClick={() => setActiveTab('create')}
                className="p-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors flex items-center justify-center shadow-lg hover:shadow-xl"
                title="Create Auth Worker"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Tab */}
          <div className="mb-6 border-b border-white/10">
            <button
              onClick={() => setActiveTab('workers')}
              className={`px-6 py-3 font-medium transition-colors border-b-2 ${
                activeTab === 'workers'
                  ? 'border-emerald-400 text-emerald-400'
                  : 'border-transparent text-white/60 hover:text-white/80'
              }`}
            >
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4" />
                Auth Workers
                {sessions.length > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-white/10 rounded text-xs">
                    {sessions.length}
                  </span>
                )}
              </div>
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'workers' ? (
            loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="text-white/60">Loading auth workers...</div>
              </div>
            ) : sessions.length === 0 ? (
              <div className="bg-white/5 border border-white/10 rounded-lg p-16 text-center">
                <Key className="w-16 h-16 text-white/20 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-white mb-2">No Auth Workers</h2>
                <p className="text-white/60 mb-6">
                  Upload a HAR file to create your first auth worker
                </p>
                <button
                  onClick={() => setActiveTab('create')}
                  className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors flex items-center gap-2 mx-auto"
                >
                  <Plus className="w-4 h-4" />
                  Create Auth Worker
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sessions.map((session) => {
                  const sessionMappings = mappings.get(session.sessionId) || [];
                  const tokenNeedsRefresh = needsTokenRefresh(session);
                  const expiresAt = session.step2.extractedVars.expires_at 
                    ? parseInt(session.step2.extractedVars.expires_at, 10)
                    : null;
                  const isRefreshing = refreshing.has(session.sessionId);

                  return (
                    <div
                      key={session.sessionId}
                      onClick={() => handleWorkerClick(session.sessionId)}
                      className="bg-white/5 border border-white/10 rounded-lg p-6 hover:bg-white/[0.07] transition-all cursor-pointer group"
                    >
                      {/* Card Header */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Key className="w-5 h-5 text-emerald-400" />
                            <h3 className="text-lg font-semibold text-white group-hover:text-emerald-400 transition-colors">
                              {session.targetDomain || session.sessionId.substring(0, 12)}
                            </h3>
                          </div>
                          <div className="text-xs text-white/50 font-mono mb-2">
                            {session.sessionId.substring(0, 12)}...
                          </div>
                          <div className="flex items-center gap-2 text-xs flex-wrap">
                            {tokenNeedsRefresh ? (
                              <span className="px-2 py-1 bg-orange-500/20 text-orange-400 rounded flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                Needs Refresh
                              </span>
                            ) : (
                              <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" />
                                Active
                              </span>
                            )}
                            {expiresAt && (
                              <span className="text-white/50 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {new Date(expiresAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                        {tokenNeedsRefresh && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRefreshToken(session.sessionId);
                            }}
                            disabled={isRefreshing}
                            className="p-2 hover:bg-white/10 rounded transition-colors disabled:opacity-50"
                            title="Refresh Token"
                          >
                            <RefreshCw className={`w-4 h-4 text-emerald-400 ${isRefreshing ? 'animate-spin' : ''}`} />
                          </button>
                        )}
                      </div>

                      {/* Mapped Endpoints Preview */}
                      <div className="mb-4">
                        <div className="text-xs text-white/60 mb-2 flex items-center gap-1">
                          <Network className="w-3 h-3" />
                          Endpoints ({sessionMappings.length})
                        </div>
                        {sessionMappings.length === 0 ? (
                          <div className="text-xs text-white/40 italic">
                            No endpoints mapped yet
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {sessionMappings.slice(0, 3).map((mapping, idx) => {
                              const signature = `${mapping.endpointSignature.method} ${mapping.endpointSignature.normalizedPathTemplate}`;
                              return (
                                <div
                                  key={idx}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEndpointClick(session.sessionId, mapping.endpointSignature);
                                  }}
                                  className="p-2 bg-white/[0.02] border border-white/10 rounded text-xs cursor-pointer hover:bg-white/5 transition-colors"
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-[10px] font-mono">
                                        {mapping.endpointSignature.method}
                                      </span>
                                      <span className="text-white/80 font-mono truncate">
                                        {mapping.endpointSignature.normalizedPathTemplate}
                                      </span>
                                    </div>
                                    <ArrowRight className="w-3 h-3 text-white/40" />
                                  </div>
                                </div>
                              );
                            })}
                            {sessionMappings.length > 3 && (
                              <div className="text-xs text-white/40 text-center pt-1">
                                +{sessionMappings.length - 3} more
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Click to view hint */}
                      <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                        <span className="text-xs text-white/50">Click to view details</span>
                        <ArrowRight className="w-4 h-4 text-white/40 group-hover:text-emerald-400 transition-colors" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <div>
              <HARUploadSection 
                onWorkerCreated={(worker) => {
                  // Reload data and switch to workers tab
                  loadData();
                  setTimeout(() => setActiveTab('workers'), 500);
                }}
                existingSessions={sessions}
              />
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
