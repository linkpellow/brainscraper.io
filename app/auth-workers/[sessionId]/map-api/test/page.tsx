/**
 * Endpoint Test Page - RapidAPI Style
 * 
 * Three-column layout:
 * - Left: Endpoints list
 * - Middle: Code snippets + Mock data inputs
 * - Right: Request/Response preview
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { getSessionById } from '../../../utils/authWorkerPersistence';
import type { PersistedAuthWorkerState } from '../../../utils/authWorkerPersistence';
import { ArrowLeft, Play, Copy, CheckCircle, XCircle, Loader, Code2, FileText, Network } from 'lucide-react';
import type { EndpointCatalog, EndpointCatalogEntry } from '../endpointCatalog';
import { generateSnippets, type SnippetVariant } from '../snippetGenerator';
import { executeTest, type TestResult } from '../testRunner';
import { buildDependencyGraph } from '../dependencyResolver';
import { AuthContext } from '../authContext';
import { useToast } from '../hooks/useToast';
import AppLayout from '../../../../components/AppLayout';

type MockDataInputs = Record<string, string | number | boolean>;

export default function EndpointTestPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = params?.sessionId as string;
  const selectedEndpointId = searchParams?.get('endpoint');
  
  const [session, setSession] = useState<PersistedAuthWorkerState | null>(null);
  const [catalog, setCatalog] = useState<EndpointCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointCatalogEntry | null>(null);
  const [mockData, setMockData] = useState<MockDataInputs>({});
  const [agentNumber, setAgentNumber] = useState<string | null>(null);
  const [snippetVariant, setSnippetVariant] = useState<SnippetVariant>('minimal');
  const [isProductionMode, setIsProductionMode] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testViewTab, setTestViewTab] = useState<'request' | 'response'>('response');
  const [authContext] = useState(() => new AuthContext());
  const toast = useToast();

  // Load session and HAR data
  useEffect(() => {
    if (!sessionId) {
      router.push('/auth-workers');
      return;
    }

    const loadData = async () => {
      try {
        const loadedSession = getSessionById(sessionId);
        if (!loadedSession) {
          router.push('/auth-workers');
          return;
        }
        
        setSession(loadedSession);
        
        // Initialize auth context
        const { getValidToken } = await import('../../../utils/tokenRefreshService');
        const tokenResult = await getValidToken(loadedSession.sessionId);
        if (tokenResult?.token) {
          authContext.setArtifact({
            type: 'bearer_token',
            name: 'access_token',
            value: tokenResult.token,
            source: 'auth-worker-session',
          });
        }
        
        // Load HAR data
        const response = await fetch(`/api/auth-worker/har-data?sessionId=${sessionId}`);
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data?.catalog) {
            setCatalog(result.data.catalog);
            
            // Load cookies from HAR data into auth context
            if (result.data.artifactBundle?.cookieJar?.timeline) {
              for (const cookieEntry of result.data.artifactBundle.cookieJar.timeline) {
                // Get the latest version of the cookie
                const latestVersion = cookieEntry.versions && cookieEntry.versions.length > 0
                  ? cookieEntry.versions[cookieEntry.versions.length - 1]
                  : null;
                const cookieValue = latestVersion?.value || cookieEntry.value;
                
                authContext.setArtifact({
                  type: 'cookie',
                  name: cookieEntry.cookieName,
                  value: cookieValue,
                  domain: cookieEntry.domain,
                  path: cookieEntry.path,
                  expires: cookieEntry.expires,
                  source: cookieEntry.setByUrl,
                });
              }
            }
            
            // Extract agent number from HAR data (from query params or request bodies)
            let extractedAgentNumber: string | null = null;
            if (result.data.catalog?.entries) {
              for (const entry of result.data.catalog.entries) {
                // Check query params for currentContextAgentNumber
                if (entry.requestSchema?.queryParams?.includes('currentContextAgentNumber')) {
                  // Try to extract from exampleCurl or URL patterns
                  const curlMatch = entry.exampleCurl?.match(/currentContextAgentNumber=([^&\s"']+)/);
                  if (curlMatch) {
                    extractedAgentNumber = curlMatch[1];
                    break;
                  }
                }
                // Check request body for agentNumber
                if (entry.requestSchema?.bodyExample) {
                  const bodyStr = typeof entry.requestSchema.bodyExample === 'string'
                    ? entry.requestSchema.bodyExample
                    : JSON.stringify(entry.requestSchema.bodyExample);
                  const agentMatch = bodyStr.match(/"agentNumber"\s*:\s*"([^"]+)"/);
                  if (agentMatch) {
                    extractedAgentNumber = agentMatch[1];
                    break;
                  }
                }
              }
            }
            if (extractedAgentNumber) {
              setAgentNumber(extractedAgentNumber);
            }
            
            // Find and select endpoint
            if (selectedEndpointId) {
              const endpoint = result.data.catalog.entries.find((e: EndpointCatalogEntry) => {
                const signature = `${e.method} ${e.path}`;
                const id = btoa(signature).replace(/[+/=]/g, '').substring(0, 16);
                return id === selectedEndpointId || e.id === selectedEndpointId;
              });
              
              if (endpoint) {
                setSelectedEndpoint(endpoint);
                // Initialize mock data - only phone numbers (agent number is auto-filled)
                const initialMockData: MockDataInputs = {};
                if (endpoint.requestSchema.queryParams) {
                  endpoint.requestSchema.queryParams.forEach((param: string) => {
                    const paramLower = param.toLowerCase();
                    if (paramLower.includes('phone')) {
                      // Only phone numbers need user input
                      initialMockData[param] = '2694621403';
                    }
                    // Agent number and other params are auto-filled, not in mock data
                  });
                }
                setMockData(initialMockData);
              }
            }
          }
        }
      } catch (error) {
        console.error('[EndpointTestPage] Load error:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [sessionId, selectedEndpointId, router, authContext]);

  // Determine base URL based on mode
  const baseUrl = isProductionMode ? 'https://brainscraper.io' : 'http://localhost:3000';

  // Generate code snippets
  const snippets = useMemo(() => {
    if (!selectedEndpoint || !session) return null;
    
    const authReqs = {
      requiredCookies: selectedEndpoint.requiredAuth.cookies.map(name => ({
        name,
        domain: selectedEndpoint.host,
        path: '/',
        required: true,
        confidence: 1,
        presentInSuccess: 1,
        presentInFailure: 0,
        setByUrl: (selectedEndpoint.authSources.cookies instanceof Map
          ? selectedEndpoint.authSources.cookies.get(name)
          : selectedEndpoint.authSources.cookies?.[name]) || '',
      })),
      optionalCookies: [],
      requiredHeaders: selectedEndpoint.requiredAuth.headers.map(name => ({
        name,
        required: true,
        confidence: 1,
        presentInSuccess: 1,
        presentInFailure: 0,
        source: selectedEndpoint.authSources.headers instanceof Map
          ? selectedEndpoint.authSources.headers.get(name)
          : selectedEndpoint.authSources.headers?.[name],
      })),
      optionalHeaders: [],
      csrfBinding: selectedEndpoint.requiredAuth.csrf ? {
        cookieName: selectedEndpoint.requiredAuth.csrf.cookie,
        headerName: selectedEndpoint.requiredAuth.csrf.header,
        requiredForMutations: true,
        detected: true,
      } : undefined,
      cookieSources: selectedEndpoint.authSources.cookies instanceof Map
        ? selectedEndpoint.authSources.cookies
        : new Map(Object.entries(selectedEndpoint.authSources.cookies || {})),
    };
    
    return generateSnippets(
      selectedEndpoint,
      authReqs as any,
      authContext,
      snippetVariant,
      {
        sessionId: session.sessionId,
        apiKey: session.apiKey,
        domain: session.targetDomain,
        baseUrl: baseUrl,
        mockData: mockData, // Pass mock data to snippet generator
        agentNumber: agentNumber || undefined, // Pass extracted agent number
      }
    );
  }, [selectedEndpoint, session, snippetVariant, authContext, mockData, baseUrl]);

  // Handle test execution (via server-side proxy to avoid CORS)
  const handleRunTest = async () => {
    if (!selectedEndpoint || !catalog || !session) return;
    
    setIsTesting(true);
    setTestViewTab('response');
    
    try {
      // Build URL with query params (auto-fill agent number, use mock data for phone)
      let url = `https://${selectedEndpoint.host}${selectedEndpoint.path}`;
      if (selectedEndpoint.requestSchema.queryParams && selectedEndpoint.requestSchema.queryParams.length > 0) {
        const urlObj = new URL(url);
        selectedEndpoint.requestSchema.queryParams.forEach((param: string) => {
          const paramLower = param.toLowerCase();
          if (paramLower.includes('agent') && (paramLower.includes('number') || paramLower.includes('context'))) {
            // Auto-fill agent number from HAR data
            if (agentNumber) {
              urlObj.searchParams.set(param, agentNumber);
            }
          } else if (paramLower.includes('phone')) {
            // Use mock data for phone
            if (mockData[param]) {
              urlObj.searchParams.set(param, String(mockData[param]));
            }
          }
        });
        url = urlObj.toString();
      }
      
      // Build headers (essential ones only)
      const headers: Record<string, string> = {};
      
      // Get token for Authorization header
      const { getValidToken } = await import('../../../utils/tokenRefreshService');
      const tokenResult = await getValidToken(session.sessionId);
      if (tokenResult?.token) {
        headers['Authorization'] = `Bearer ${tokenResult.token}`;
      }
      
      // Add cookies if required (from auth context)
      const cookieStrings: string[] = [];
      for (const cookieName of selectedEndpoint.requiredAuth.cookies) {
        const cookie = authContext.getArtifact('cookie', cookieName, selectedEndpoint.host);
        if (cookie && cookie.value) {
          cookieStrings.push(`${cookie.name}=${cookie.value}`);
        }
      }
      if (cookieStrings.length > 0) {
        headers['Cookie'] = cookieStrings.join('; ');
      }
      
      // Content-Type
      if (selectedEndpoint.requestSchema.bodyExample) {
        headers['Content-Type'] = 'application/json';
      }
      
      // Accept
      if (selectedEndpoint.responseSchema.contentType?.includes('json')) {
        headers['Accept'] = 'application/json';
      }
      
      // Build body
      let requestBody: any = undefined;
      if (selectedEndpoint.requestSchema.bodyExample) {
        requestBody = Object.keys(mockData).length > 0
          ? { ...selectedEndpoint.requestSchema.bodyExample, ...mockData }
          : selectedEndpoint.requestSchema.bodyExample;
      }
      
      // Execute via server-side proxy (avoids CORS)
      const startTime = Date.now();
      const response = await fetch('/api/auth-worker/test-endpoint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: session.sessionId,
          endpointId: selectedEndpoint.id,
          url,
          method: selectedEndpoint.method,
          headers,
          body: requestBody,
          mockData,
        }),
      });
      
      const duration = Date.now() - startTime;
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      const result = await response.json();
      
      // Convert to TestResult format
      const testResult: TestResult = {
        endpointId: selectedEndpoint.id,
        success: result.success,
        status: result.status,
        statusText: result.statusText,
        duration: result.duration,
        response: result.response,
        responseHeaders: result.responseHeaders,
        request: result.request,
        error: result.success ? undefined : (result.error || 'Request failed'),
        errorType: result.errorType,
      };
      
      setTestResult(testResult);
      
      if (testResult.success) {
        toast.success('Test succeeded!');
      } else {
        toast.error('Test failed: ' + (testResult.error || 'Unknown error'));
      }
    } catch (error) {
      setTestResult({
        endpointId: selectedEndpoint.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        errorType: 'network',
      });
      toast.error('Test execution failed');
    } finally {
      setIsTesting(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="min-h-screen p-8 flex items-center justify-center">
          <div className="text-white/60">Loading endpoint...</div>
        </div>
      </AppLayout>
    );
  }

  if (!catalog || !selectedEndpoint) {
    return (
      <AppLayout>
        <div className="min-h-screen p-8 flex items-center justify-center">
          <div className="text-white/60">Endpoint not found</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="min-h-screen p-8">
        <div className="max-w-[1800px] mx-auto">
          {/* Header */}
          <div className="mb-6">
            <button
              onClick={() => router.push(`/auth-workers/${sessionId}`)}
              className="mb-4 flex items-center gap-2 text-white/60 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Endpoints
            </button>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-500/20 rounded-lg">
                  <Code2 className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-white">Test Endpoint</h1>
                  <p className="text-white/60 mt-1">
                    {selectedEndpoint.method} {selectedEndpoint.path}
                  </p>
                </div>
              </div>
              {/* Environment Toggle */}
              <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-lg px-4 py-2">
                <span className="text-xs text-white/60">Local</span>
                <button
                  onClick={() => setIsProductionMode(!isProductionMode)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    isProductionMode ? 'bg-emerald-500' : 'bg-white/20'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      isProductionMode ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className="text-xs text-white/60">Production</span>
                <span className="text-xs text-white/40 font-mono ml-2">
                  {isProductionMode ? 'brainscraper.io' : 'localhost:3000'}
                </span>
              </div>
            </div>
          </div>

          {/* Three-Column Layout */}
          <div className="grid grid-cols-12 gap-6">
            {/* Left Column: Endpoints List */}
            <div className="col-span-3 bg-white/5 border border-white/10 rounded-lg p-4">
              <h2 className="text-sm font-semibold text-white mb-4">Endpoints</h2>
              <div className="space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto">
                {catalog.entries
                  .filter(e => e.role !== 'NOISE')
                  .map((entry) => (
                    <button
                      key={entry.id}
                      onClick={() => {
                        setSelectedEndpoint(entry);
                        setTestResult(null);
                        // Initialize mock data - only phone numbers (agent number is auto-filled)
                        const initialMockData: MockDataInputs = {};
                        if (entry.requestSchema.queryParams) {
                          entry.requestSchema.queryParams.forEach((param: string) => {
                            const paramLower = param.toLowerCase();
                            if (paramLower.includes('phone')) {
                              // Only phone numbers need user input
                              initialMockData[param] = '2694621403';
                            }
                            // Agent number and other params are auto-filled, not in mock data
                          });
                        }
                        setMockData(initialMockData);
                        router.push(`/auth-workers/${sessionId}/map-api/test?endpoint=${entry.id}`);
                      }}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selectedEndpoint.id === entry.id
                          ? 'bg-emerald-500/20 border-emerald-500/30'
                          : 'bg-white/[0.02] border-white/10 hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-1.5 py-0.5 text-xs font-mono rounded ${
                          entry.method === 'GET' ? 'bg-blue-500/20 text-blue-400' :
                          entry.method === 'POST' ? 'bg-green-500/20 text-green-400' :
                          entry.method === 'PUT' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>
                          {entry.method}
                        </span>
                        <span className="text-xs text-white/80 font-mono truncate">{entry.path}</span>
                      </div>
                      <div className="text-xs text-white/60 truncate">{entry.purposeGuess}</div>
                    </button>
                  ))}
              </div>
            </div>

            {/* Middle Column: Code Snippets + Mock Data */}
            <div className="col-span-5 bg-white/5 border border-white/10 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Code Snippets</h2>
                <button
                  onClick={() => setSnippetVariant(snippetVariant === 'minimal' ? 'fidelity' : 'minimal')}
                  className="px-3 py-1 text-xs bg-white/10 hover:bg-white/20 border border-white/20 rounded transition-colors"
                >
                  {snippetVariant === 'minimal' ? 'Minimal' : 'Fidelity'}
                </button>
              </div>

              {/* Mock Data Inputs - Only phone numbers (agent number is auto-filled) */}
              {selectedEndpoint.requestSchema.queryParams && selectedEndpoint.requestSchema.queryParams.some((p: string) => p.toLowerCase().includes('phone')) && (
                <div className="mb-6 p-4 bg-white/[0.02] border border-white/10 rounded-lg">
                  <h3 className="text-sm font-medium text-white mb-3">Mock Data</h3>
                  <div className="space-y-3">
                    {selectedEndpoint.requestSchema.queryParams
                      .filter((param: string) => param.toLowerCase().includes('phone'))
                      .map((param: string) => (
                        <div key={param}>
                          <label className="block text-xs text-white/60 mb-1">
                            {param}
                            <span className="ml-2 text-emerald-400">(phone number)</span>
                          </label>
                          <input
                            type="text"
                            value={String(mockData[param] ?? '')}
                            onChange={(e) => {
                              setMockData({ ...mockData, [param]: e.target.value });
                            }}
                            placeholder="Enter phone number..."
                            className="w-full px-3 py-2 bg-black/50 border border-white/10 rounded text-sm text-white font-mono focus:outline-none focus:border-emerald-500/50"
                          />
                        </div>
                      ))}
                  </div>
                  {agentNumber && (
                    <div className="mt-3 p-2 bg-emerald-500/10 border border-emerald-500/20 rounded text-xs text-emerald-400">
                      Agent number auto-filled: <span className="font-mono">{agentNumber}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Code Snippets */}
              {snippets && (
                <div className="space-y-4">
                  {/* cURL */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-white/60">cURL</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(snippets.curl);
                          toast.success('cURL copied to clipboard');
                        }}
                        className="p-1 hover:bg-white/10 rounded transition-colors"
                        title="Copy to clipboard"
                      >
                        <Copy className="w-3 h-3 text-white/60" />
                      </button>
                    </div>
                    <pre className="p-3 bg-black/50 border border-white/10 rounded text-xs font-mono text-white/90 overflow-x-auto max-h-64 overflow-y-auto">
                      <code>{snippets.curl}</code>
                    </pre>
                  </div>

                  {/* Executable Code */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-white/60">Executable Code</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(snippets.executable);
                          toast.success('Code copied to clipboard');
                        }}
                        className="p-1 hover:bg-white/10 rounded transition-colors"
                        title="Copy to clipboard"
                      >
                        <Copy className="w-3 h-3 text-white/60" />
                      </button>
                    </div>
                    <pre className="p-3 bg-black/50 border border-white/10 rounded text-xs font-mono text-white/90 overflow-x-auto max-h-96 overflow-y-auto">
                      <code>{snippets.executable}</code>
                    </pre>
                  </div>
                </div>
              )}

              {/* Run Test Button */}
              <div className="mt-6">
                <button
                  onClick={handleRunTest}
                  disabled={isTesting}
                  className="w-full px-6 py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 font-medium text-lg shadow-lg hover:shadow-xl"
                >
                  {isTesting ? (
                    <>
                      <Loader className="w-5 h-5 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5" />
                      Run Test
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Right Column: Request/Response Preview */}
            <div className="col-span-4 bg-white/5 border border-white/10 rounded-lg overflow-hidden">
              {/* Tabs */}
              <div className="flex border-b border-white/10">
                <button
                  onClick={() => setTestViewTab('request')}
                  className={`flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                    testViewTab === 'request'
                      ? 'text-white border-emerald-400 bg-white/5'
                      : 'text-white/60 hover:text-white/80 border-transparent'
                  }`}
                >
                  Request
                </button>
                <button
                  onClick={() => setTestViewTab('response')}
                  className={`flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                    testViewTab === 'response'
                      ? 'text-white border-emerald-400 bg-white/5'
                      : 'text-white/60 hover:text-white/80 border-transparent'
                  }`}
                >
                  Response
                </button>
              </div>

              {/* Request Tab */}
              {testViewTab === 'request' && (
                <div className="p-4 space-y-4 max-h-[calc(100vh-300px)] overflow-y-auto">
                  {/* Method & URL */}
                  <div>
                    <div className="text-xs text-white/60 mb-1">Method & URL</div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs font-mono rounded">
                        {selectedEndpoint.method}
                      </span>
                      <span className="text-sm font-mono text-white/90 break-all">
                        https://{selectedEndpoint.host}{selectedEndpoint.path}
                        {selectedEndpoint.requestSchema.queryParams && selectedEndpoint.requestSchema.queryParams.length > 0 && (
                          <span className="text-white/50">
                            ?{selectedEndpoint.requestSchema.queryParams.map(p => `${p}=${mockData[p] || ''}`).join('&')}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Headers */}
                  <div>
                    <div className="text-xs text-white/60 mb-2">Headers</div>
                    <div className="bg-black/50 border border-white/10 rounded p-3 max-h-48 overflow-y-auto">
                      <table className="w-full text-xs font-mono">
                        <tbody>
                          {/* Filter out browser-only headers and show only essential ones */}
                          {selectedEndpoint.requiredAuth.headers
                            .filter(header => {
                              const headerLower = header.toLowerCase();
                              // Filter out browser-only headers
                              const browserOnlyHeaders = [
                                'accept-encoding',
                                'connection',
                                'host',
                                'origin',
                                'referer',
                                'sec-fetch-dest',
                                'sec-fetch-mode',
                                'sec-fetch-site',
                                'sec-fetch-user',
                                'user-agent',
                                'sec-ch-ua',
                                'sec-ch-ua-mobile',
                                'sec-ch-ua-platform',
                                'upgrade-insecure-requests',
                                'cache-control',
                                'pragma',
                              ];
                              return !browserOnlyHeaders.includes(headerLower);
                            })
                            .map((header) => {
                              const headerLower = header.toLowerCase();
                              let value = '';
                              if (headerLower === 'authorization') {
                                value = 'Bearer [TOKEN]';
                              } else if (headerLower === 'accept') {
                                value = 'application/json';
                              } else if (headerLower === 'content-type') {
                                value = 'application/json';
                              } else {
                                // Skip headers we don't have values for
                                return null;
                              }
                              return (
                                <tr key={header} className="border-b border-white/5">
                                  <td className="py-1 text-blue-400 pr-4 align-top">{header}:</td>
                                  <td className="py-1 text-white/80">{value}</td>
                                </tr>
                              );
                            })
                            .filter(Boolean)}
                          {selectedEndpoint.requestSchema.bodyShape && (
                            <tr className="border-b border-white/5">
                              <td className="py-1 text-blue-400 pr-4 align-top">Content-Type:</td>
                              <td className="py-1 text-white/80">application/json</td>
                            </tr>
                          )}
                          {selectedEndpoint.responseSchema.contentType?.includes('json') && (
                            <tr className="border-b border-white/5">
                              <td className="py-1 text-blue-400 pr-4 align-top">Accept:</td>
                              <td className="py-1 text-white/80">application/json</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Body */}
                  {selectedEndpoint.requestSchema.bodyExample && (
                    <div>
                      <div className="text-xs text-white/60 mb-2">Body</div>
                      <pre className="bg-black/50 border border-white/10 rounded p-3 text-xs font-mono text-white/90 overflow-x-auto max-h-64">
                        {JSON.stringify(
                          Object.keys(mockData).length > 0
                            ? { ...selectedEndpoint.requestSchema.bodyExample, ...mockData }
                            : selectedEndpoint.requestSchema.bodyExample,
                          null,
                          2
                        )}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Response Tab */}
              {testViewTab === 'response' && (
                <div className="p-4 space-y-4 max-h-[calc(100vh-300px)] overflow-y-auto">
                  {testResult ? (
                    <>
                      {/* Status */}
                      <div>
                        <div className="text-xs text-white/60 mb-1">Status</div>
                        <div className="flex items-center gap-3">
                          {testResult.success ? (
                            <CheckCircle className="w-5 h-5 text-emerald-400" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-400" />
                          )}
                          <span className={`px-2 py-1 rounded text-xs font-mono ${
                            testResult.status && testResult.status >= 200 && testResult.status < 300
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : testResult.status && testResult.status >= 400 && testResult.status < 500
                              ? 'bg-yellow-500/20 text-yellow-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}>
                            {testResult.status || 'N/A'} {testResult.statusText || ''}
                          </span>
                          {testResult.duration && (
                            <span className="text-xs text-white/50">{testResult.duration}ms</span>
                          )}
                        </div>
                      </div>

                      {/* Error */}
                      {testResult.error && (
                        <div className="p-3 bg-red-500/20 border border-red-500/30 rounded">
                          <div className="text-sm font-medium text-red-400 mb-1">Error</div>
                          <div className="text-sm text-white/90">{testResult.error}</div>
                        </div>
                      )}

                      {/* Response Headers */}
                      {testResult.responseHeaders && Object.keys(testResult.responseHeaders).length > 0 && (
                        <div>
                          <div className="text-xs text-white/60 mb-2">Headers</div>
                          <div className="bg-black/50 border border-white/10 rounded p-3 max-h-48 overflow-y-auto">
                            <table className="w-full text-xs font-mono">
                              <tbody>
                                {Object.entries(testResult.responseHeaders).map(([key, value]) => (
                                  <tr key={key} className="border-b border-white/5">
                                    <td className="py-1 text-purple-400 pr-4 align-top">{key}:</td>
                                    <td className="py-1 text-white/80 break-all">{String(value)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                        {/* Response Body - Always Show */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-xs text-white/60">Body</div>
                            {testResult.response !== undefined && (
                              <button
                                onClick={() => {
                                  const text = typeof testResult.response === 'string'
                                    ? testResult.response
                                    : JSON.stringify(testResult.response, null, 2);
                                  navigator.clipboard.writeText(text);
                                  toast.success('Response copied to clipboard');
                                }}
                                className="px-2 py-1 text-xs bg-white/10 hover:bg-white/20 rounded transition-colors flex items-center gap-1"
                              >
                                <Copy className="w-3 h-3" />
                                Copy
                              </button>
                            )}
                          </div>
                          {testResult.response !== undefined && testResult.response !== null ? (
                            <pre className="bg-black/50 border border-white/10 rounded p-3 text-xs font-mono text-white/90 overflow-x-auto max-h-96 overflow-y-auto">
                              {typeof testResult.response === 'string'
                                ? testResult.response
                                : JSON.stringify(testResult.response, null, 2)}
                            </pre>
                          ) : testResult.error ? (
                            <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-sm text-red-400">
                              {testResult.error}
                            </div>
                          ) : (
                            <div className="bg-white/5 border border-white/10 rounded p-3 text-sm text-white/60">
                              No response data. Click "Run Test" to execute the endpoint and see the response.
                            </div>
                          )}
                        </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <FileText className="w-12 h-12 text-white/20 mb-4" />
                      <p className="text-white/60 mb-2">No test results yet</p>
                      <p className="text-xs text-white/40">
                        Click "Run Test" to execute the endpoint and see the response
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
