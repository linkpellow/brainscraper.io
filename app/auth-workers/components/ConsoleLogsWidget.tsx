/**
 * Enhanced Console Logs Widget - Flight Recorder
 * 
 * Complete implementation with:
 * - Primary failure detection
 * - Network/Auth pane
 * - Correlation ID filters
 * - Noise reduction
 * - Health signals
 * - One-click actions
 * - ZIP export
 */

'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { X, Terminal, Trash2, Copy, ChevronDown, ChevronUp, Filter, Search, AlertCircle, AlertTriangle, Info, Bug, FileCode, ExternalLink, BookOpen, Brain, FileText, Download, FileDown, Network, Shield, Activity, Package, Eye, EyeOff, Zap, Link as LinkIcon } from 'lucide-react';
import type { CapturedLog, LogLevel } from '../hooks/useConsoleCapture';
import { generateFileReadInstruction } from '../utils/readFileContext';
import { diagnoseError, groupSimilarErrors } from '../utils/errorDiagnostics';
import { useComprehensiveDiagnostics } from '../hooks/useComprehensiveDiagnostics';
import { useHealthMonitoring } from '../hooks/useHealthMonitoring';
import { eventBus, type StructuredEvent } from '../utils/eventBus';
import { detectPrimaryFailure } from '../utils/primaryFailureDetection';
import { tokenLifecycleTracker } from '../utils/tokenLifecycleTracker';
import { filterNoise, classifyEvent } from '../utils/noiseReduction';
import { generateDebugReport, createDebugReportZip } from '../utils/reportGenerator';
import { getCurrentRunId } from '../utils/correlationIds';

type ConsoleLogsWidgetProps = {
  logs: CapturedLog[];
  onClear: () => void;
  onGetFormatted: () => string;
  errorCount: number;
  warnCount: number;
};

type ViewMode = 'logs' | 'network' | 'auth';

export default function ConsoleLogsWidget({
  logs,
  onClear,
  onGetFormatted,
  errorCount,
  warnCount,
}: ConsoleLogsWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('logs');
  const [filterLevel, setFilterLevel] = useState<LogLevel | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [exportFormat, setExportFormat] = useState<'markdown' | 'json'>('markdown');
  
  // Advanced filters
  const [hideAssets, setHideAssets] = useState(true);
  const [hidePolling, setHidePolling] = useState(true);
  const [collapseRepetitive, setCollapseRepetitive] = useState(true);
  const [rawMode, setRawMode] = useState(false);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [networkOnly, setNetworkOnly] = useState(false);
  const [authOnly, setAuthOnly] = useState(false);
  
  // Correlation ID filters
  const [filterRunId, setFilterRunId] = useState<string>('');
  const [filterRequestId, setFilterRequestId] = useState<string>('');
  const [filterWorkerId, setFilterWorkerId] = useState<string>('');
  
  const logsEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Comprehensive diagnostics
  const {
    diagnostics: comprehensiveDiagnostics,
    getDiagnostic,
    exportDiagnostic,
    exportAllDiagnostics,
    networkHistory,
  } = useComprehensiveDiagnostics(logs);
  
  // Health monitoring
  const health = useHealthMonitoring(true);
  
  // Get events from event bus (defer updates to avoid setState during render)
  const [events, setEvents] = useState<StructuredEvent[]>([]);
  useEffect(() => {
    const updateEvents = () => {
      // Defer state update
      queueMicrotask(() => {
        setEvents(eventBus.getEvents());
      });
    };
    
    const unsubscribe = eventBus.subscribe(() => {
      updateEvents();
    });
    
    updateEvents();
    const interval = setInterval(updateEvents, 500);
    
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);
  
  // Primary failure detection
  const primaryFailure = useMemo(() => {
    const runId = getCurrentRunId();
    const allEvents = [...events, ...logs.map(log => ({
      ...log,
      level: log.level as any,
      component: (log as any).component || 'unknown',
    }))];
    return detectPrimaryFailure(allEvents, runId || undefined);
  }, [events, logs]);
  
  // Auth incidents
  const authIncidents = useMemo(() => {
    const runId = getCurrentRunId();
    if (runId) {
      return tokenLifecycleTracker.getIncidentsForRun(runId);
    }
    return tokenLifecycleTracker.getAllIncidents();
  }, [events]);
  
  // Network events
  const networkEvents = useMemo(() => {
    return events.filter(e => e.network).sort((a, b) => b.timestamp - a.timestamp);
  }, [events]);
  
  // Filter logs with noise reduction
  const { filtered: filteredLogs, collapsed: collapsedLogs } = useMemo(() => {
    let toFilter = [...logs];
    
    // Apply correlation ID filters
    if (filterRunId) {
      toFilter = toFilter.filter(log => log.runId === filterRunId);
    }
    if (filterRequestId) {
      toFilter = toFilter.filter(log => log.requestId === filterRequestId);
    }
    if (filterWorkerId) {
      toFilter = toFilter.filter(log => log.workerId === filterWorkerId);
    }
    
    // Apply level filter
    if (filterLevel !== 'all') {
      toFilter = toFilter.filter(log => log.level === filterLevel);
    }
    
    // Apply search
    if (searchQuery) {
      toFilter = toFilter.filter(log => 
        log.formatted.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.message.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    // Apply special filters
    if (onlyErrors) {
      toFilter = toFilter.filter(log => log.level === 'error');
    }
    if (networkOnly) {
      toFilter = toFilter.filter(log => (log as any).component === 'network');
    }
    if (authOnly) {
      toFilter = toFilter.filter(log => (log as any).component === 'auth');
    }
    
    // Apply noise reduction
    if (!rawMode) {
      const result = filterNoise(toFilter, {
        hideAssets,
        hidePolling,
        collapseRepetitive,
        minRepeatCount: 3,
      });
      // Type assertion: filteredLogs only contains CapturedLog (not StructuredEvent)
      return { filtered: result.filtered as CapturedLog[], collapsed: result.collapsed };
    }
    
    return { filtered: toFilter, collapsed: new Map() };
  }, [logs, filterLevel, searchQuery, hideAssets, hidePolling, collapseRepetitive, rawMode, onlyErrors, networkOnly, authOnly, filterRunId, filterRequestId, filterWorkerId]);
  
  // Group similar errors
  const errorGroups = useMemo(() => {
    return groupSimilarErrors(logs);
  }, [logs]);
  
  // Copy repro steps
  const copyReproSteps = useCallback((log: CapturedLog) => {
    const diagnostic = getDiagnostic(log.id);
    if (!diagnostic) return;
    
    const steps: string[] = [];
    steps.push(`# Reproduction Steps for Error: ${log.message}`);
    steps.push('');
    steps.push(`**Error ID:** ${log.id}`);
    steps.push(`**Timestamp:** ${new Date(log.timestamp).toISOString()}`);
    steps.push('');
    
    if (diagnostic.context.userActionTimeline.length > 0) {
      steps.push('## User Actions Before Error:');
      diagnostic.context.userActionTimeline.slice(-10).forEach((action, idx) => {
        steps.push(`${idx + 1}. ${action.type} on ${action.target || 'unknown'}`);
      });
      steps.push('');
    }
    
    if (diagnostic.context.networkTimeline.length > 0) {
      steps.push('## Network Requests:');
      diagnostic.context.networkTimeline.slice(-10).forEach((req, idx) => {
        steps.push(`${idx + 1}. ${req.method} ${req.url} - ${req.status || 'error'}`);
      });
      steps.push('');
    }
    
    steps.push('## Error Details:');
    steps.push(`- Message: ${log.message}`);
    if (log.stack) {
      steps.push(`- Stack: ${log.stack.split('\n').slice(0, 5).join('\n')}`);
    }
    
    navigator.clipboard.writeText(steps.join('\n'));
  }, [getDiagnostic]);
  
  // Copy error bundle
  const copyErrorBundle = useCallback((log: CapturedLog) => {
    const diagnostic = getDiagnostic(log.id);
    if (!diagnostic) return;
    
    const bundle = {
      error: {
        id: log.id,
        message: log.message,
        stack: log.stack,
        timestamp: log.timestamp,
      },
      rootCause: diagnostic.rootCause,
      suggestedFix: diagnostic.suggestedFix,
      locations: diagnostic.locations,
      context: {
        userActions: diagnostic.context.userActionTimeline.slice(-10),
        networkRequests: diagnostic.context.networkTimeline.slice(-10),
      },
    };
    
    navigator.clipboard.writeText(JSON.stringify(bundle, null, 2));
  }, [getDiagnostic]);
  
  // Download ZIP report
  const downloadZipReport = useCallback(async () => {
    try {
      const runId = getCurrentRunId();
      const allEvents = eventBus.getEvents(runId ? { runId } : undefined);
      const primaryDiagnostic = primaryFailure ? getDiagnostic((primaryFailure.event as any).id) : null;
      
      const context = {
        userActionTimeline: [],
        networkTimeline: networkHistory,
        errorChain: [],
        browser: typeof window !== 'undefined' ? {
          url: window.location.href,
          userAgent: navigator.userAgent,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          localStorage: { ...localStorage },
          sessionStorage: { ...sessionStorage },
        } : undefined,
      };
      
      const artifacts = generateDebugReport(primaryDiagnostic || null, allEvents, logs, context as any);
      const zipBlob = await createDebugReportZip(artifacts);
      
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `debug-report-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('[ConsoleLogsWidget] Error creating ZIP:', error);
    }
  }, [primaryFailure, getDiagnostic, networkHistory, logs]);
  
  // Download diagnostic report
  const downloadDiagnostic = useCallback((logId: string) => {
    const diagnostic = exportDiagnostic(logId, exportFormat);
    if (!diagnostic) return;
    
    const blob = new Blob([diagnostic], { type: exportFormat === 'json' ? 'application/json' : 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diagnostic-${logId}-${Date.now()}.${exportFormat === 'json' ? 'json' : 'md'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [exportDiagnostic, exportFormat]);
  
  // Auto-scroll
  useEffect(() => {
    if (isOpen && !isMinimized && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isOpen, isMinimized]);
  
  const toggleExpanded = (logId: string) => {
    setExpandedLogs(prev => {
      const next = new Set(prev);
      if (next.has(logId)) {
        next.delete(logId);
      } else {
        next.add(logId);
      }
      return next;
    });
  };
  
  const copyLog = (log: CapturedLog) => {
    if (log.aiFormatted) {
      navigator.clipboard.writeText(log.aiFormatted);
      return;
    }
    
    const time = new Date(log.timestamp).toISOString();
    let formatted = `[${time}] ${log.level.toUpperCase()}: ${log.formatted}`;
    
    if (log.locations && log.locations.length > 0) {
      formatted += '\n\n[CODEBASE REFERENCES]';
      log.locations.forEach((loc, idx) => {
        formatted += `\n${idx + 1}. ${loc.file}:${loc.line}:${loc.column}`;
        if (loc.function) {
          formatted += ` (in function: ${loc.function})`;
        }
      });
    }
    
    if (log.stack) {
      formatted += `\n\n[STACK TRACE]\n${log.stack}`;
    }
    
    navigator.clipboard.writeText(formatted);
  };
  
  const getLevelIcon = (level: LogLevel) => {
    switch (level) {
      case 'error': return <AlertCircle className="w-4 h-4 text-red-400" />;
      case 'warn': return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
      case 'info': return <Info className="w-4 h-4 text-blue-400" />;
      case 'debug': return <Bug className="w-4 h-4 text-gray-400" />;
      default: return <Terminal className="w-4 h-4 text-gray-400" />;
    }
  };
  
  const getLevelColor = (level: LogLevel) => {
    switch (level) {
      case 'error': return 'text-red-400 bg-red-500/10 border-red-500/20';
      case 'warn': return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
      case 'info': return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
      case 'debug': return 'text-gray-400 bg-gray-500/10 border-gray-500/20';
      default: return 'text-gray-300 bg-gray-500/10 border-gray-500/20';
    }
  };
  
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 p-3 bg-gray-800/90 hover:bg-gray-700/90 border border-gray-600 rounded-lg shadow-lg transition-all flex items-center gap-2 group"
        title="Open Console Logs"
      >
        <Terminal className="w-5 h-5 text-gray-300" />
        {errorCount > 0 && (
          <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full">
            {errorCount}
          </span>
        )}
        {warnCount > 0 && errorCount === 0 && (
          <span className="px-2 py-0.5 bg-yellow-500 text-white text-xs font-bold rounded-full">
            {warnCount}
          </span>
        )}
      </button>
    );
  }
  
  return (
    <div className="fixed bottom-4 right-4 z-50 w-[700px] max-w-[calc(100vw-2rem)] bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg shadow-2xl flex flex-col max-h-[85vh]">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-gray-300" />
          <h3 className="text-sm font-semibold text-white">Flight Recorder</h3>
          {errorCount > 0 && (
            <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full">
              {errorCount}
            </span>
          )}
          {warnCount > 0 && (
            <span className="px-2 py-0.5 bg-yellow-500 text-white text-xs font-bold rounded-full">
              {warnCount}
            </span>
          )}
          <span className="px-2 py-0.5 bg-gray-700 text-gray-300 text-xs rounded-full">
            {logs.length} total
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={downloadZipReport}
            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
            title="Download Complete ZIP Report"
          >
            <Package className="w-4 h-4 text-emerald-400" />
          </button>
          <button
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
            title="Toggle AI Diagnostics"
          >
            <Brain className="w-4 h-4 text-purple-400" />
          </button>
          <button
            onClick={onClear}
            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
            title="Clear logs"
          >
            <Trash2 className="w-4 h-4 text-gray-400" />
          </button>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            {isMinimized ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
            title="Close"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Health Signals Strip */}
          <div className="px-3 py-2 border-b border-gray-700 bg-gray-800/50 flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1">
              <Activity className={`w-3 h-3 ${health.wsBridge.connected ? 'text-emerald-400' : 'text-red-400'}`} />
              <span className={health.wsBridge.connected ? 'text-emerald-400' : 'text-red-400'}>
                WS: {health.wsBridge.status}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Shield className={`w-3 h-3 ${health.authWorker.running ? 'text-emerald-400' : 'text-gray-400'}`} />
              <span className={health.authWorker.running ? 'text-emerald-400' : 'text-gray-400'}>
                Auth: {health.authWorker.status}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Zap className="w-3 h-3 text-blue-400" />
              <span className="text-blue-400">
                {health.eventRate.eventsPerSecond.toFixed(1)} evt/s
              </span>
            </div>
          </div>

          {/* View Mode Tabs */}
          <div className="flex items-center border-b border-gray-700">
            <button
              onClick={() => setViewMode('logs')}
              className={`px-3 py-2 text-xs font-medium transition-colors ${
                viewMode === 'logs' 
                  ? 'bg-gray-800 text-white border-b-2 border-blue-500' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Logs ({filteredLogs.length})
            </button>
            <button
              onClick={() => setViewMode('network')}
              className={`px-3 py-2 text-xs font-medium transition-colors ${
                viewMode === 'network' 
                  ? 'bg-gray-800 text-white border-b-2 border-blue-500' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Network ({networkEvents.length})
            </button>
            <button
              onClick={() => setViewMode('auth')}
              className={`px-3 py-2 text-xs font-medium transition-colors ${
                viewMode === 'auth' 
                  ? 'bg-gray-800 text-white border-b-2 border-blue-500' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Auth ({authIncidents.length})
            </button>
          </div>

          {/* Primary Failure Section */}
          {primaryFailure && viewMode === 'logs' && (
            <div className="p-3 border-b border-red-500/30 bg-red-500/10">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400" />
                  <h4 className="text-sm font-semibold text-red-300">Primary Failure</h4>
                  <span className={`px-2 py-0.5 rounded text-[9px] ${
                    primaryFailure.confidence === 'high' ? 'bg-emerald-500 text-white' :
                    primaryFailure.confidence === 'medium' ? 'bg-yellow-500 text-black' :
                    'bg-gray-500 text-white'
                  }`}>
                    {primaryFailure.confidence.toUpperCase()} CONFIDENCE
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => copyErrorBundle(primaryFailure.event as CapturedLog)}
                    className="p-1 hover:bg-red-500/20 rounded transition-colors"
                    title="Copy Error Bundle"
                  >
                    <Copy className="w-3 h-3 text-red-400" />
                  </button>
                  <button
                    onClick={() => copyReproSteps(primaryFailure.event as CapturedLog)}
                    className="p-1 hover:bg-red-500/20 rounded transition-colors"
                    title="Copy Repro Steps"
                  >
                    <FileText className="w-3 h-3 text-red-400" />
                  </button>
                </div>
              </div>
              <div className="text-xs text-red-200/80 mb-1">{primaryFailure.reason}</div>
              <div className="text-xs text-red-300 font-mono">
                {(primaryFailure.event as any).message || primaryFailure.event.message}
              </div>
              {primaryFailure.secondaryEffects.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-red-300 hover:text-red-200 text-[10px]">
                    Secondary Effects ({primaryFailure.secondaryEffects.length})
                  </summary>
                  <div className="mt-1 space-y-1">
                    {primaryFailure.secondaryEffects.slice(0, 5).map((effect, idx) => (
                      <div key={idx} className="text-[9px] text-red-200/60">
                        {idx + 1}. {(effect as any).message || effect.message}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {/* Filters */}
          <div className="p-3 border-b border-gray-700 space-y-2 bg-gray-800/30">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-gray-600"
              />
            </div>
            
            {/* Correlation ID Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Run ID"
                value={filterRunId}
                onChange={(e) => setFilterRunId(e.target.value)}
                className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white placeholder-gray-500 focus:outline-none focus:border-gray-600 w-32"
              />
              <input
                type="text"
                placeholder="Request ID"
                value={filterRequestId}
                onChange={(e) => setFilterRequestId(e.target.value)}
                className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white placeholder-gray-500 focus:outline-none focus:border-gray-600 w-32"
              />
              <input
                type="text"
                placeholder="Worker ID"
                value={filterWorkerId}
                onChange={(e) => setFilterWorkerId(e.target.value)}
                className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white placeholder-gray-500 focus:outline-none focus:border-gray-600 w-32"
              />
            </div>
            
            {/* Level Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setFilterLevel('all')}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  filterLevel === 'all' 
                    ? 'bg-gray-700 text-white' 
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterLevel('error')}
                className={`px-2 py-1 text-xs rounded transition-colors flex items-center gap-1 ${
                  filterLevel === 'error' 
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                <AlertCircle className="w-3 h-3" />
                Errors
              </button>
              <button
                onClick={() => setFilterLevel('warn')}
                className={`px-2 py-1 text-xs rounded transition-colors flex items-center gap-1 ${
                  filterLevel === 'warn' 
                    ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' 
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                <AlertTriangle className="w-3 h-3" />
                Warnings
              </button>
            </div>
            
            {/* Noise Reduction Toggles */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setHideAssets(!hideAssets)}
                className={`px-2 py-1 text-xs rounded transition-colors flex items-center gap-1 ${
                  hideAssets ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-800 text-gray-400'
                }`}
                title="Hide static assets"
              >
                {hideAssets ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                Assets
              </button>
              <button
                onClick={() => setHidePolling(!hidePolling)}
                className={`px-2 py-1 text-xs rounded transition-colors flex items-center gap-1 ${
                  hidePolling ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-800 text-gray-400'
                }`}
                title="Hide polling requests"
              >
                {hidePolling ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                Polling
              </button>
              <button
                onClick={() => setCollapseRepetitive(!collapseRepetitive)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  collapseRepetitive ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-800 text-gray-400'
                }`}
                title="Collapse repetitive logs"
              >
                Collapse
              </button>
              <button
                onClick={() => setRawMode(!rawMode)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  rawMode ? 'bg-purple-500/20 text-purple-400' : 'bg-gray-800 text-gray-400'
                }`}
                title="Raw mode (show all)"
              >
                Raw
              </button>
              <button
                onClick={() => setOnlyErrors(!onlyErrors)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  onlyErrors ? 'bg-red-500/20 text-red-400' : 'bg-gray-800 text-gray-400'
                }`}
              >
                Errors Only
              </button>
              <button
                onClick={() => setNetworkOnly(!networkOnly)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  networkOnly ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-800 text-gray-400'
                }`}
              >
                Network Only
              </button>
              <button
                onClick={() => setAuthOnly(!authOnly)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  authOnly ? 'bg-green-500/20 text-green-400' : 'bg-gray-800 text-gray-400'
                }`}
              >
                Auth Only
              </button>
            </div>
            
            {/* Collapsed Logs Summary */}
            {collapsedLogs.size > 0 && (
              <div className="text-xs text-gray-400">
                {collapsedLogs.size} repetitive log group(s) collapsed
              </div>
            )}
          </div>

          {/* Content Area */}
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto p-2 space-y-2"
            style={{ maxHeight: 'calc(85vh - 400px)' }}
          >
            {viewMode === 'logs' && (
              <>
                {filteredLogs.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    {searchQuery || filterLevel !== 'all' 
                      ? 'No logs match your filters' 
                      : 'No logs captured yet'}
                  </div>
                ) : (
                  filteredLogs.map((log) => {
                    const isExpanded = expandedLogs.has(log.id);
                    const time = new Date(log.timestamp).toLocaleTimeString();
                    const diagnostic = getDiagnostic(log.id);
                    
                    return (
                      <div
                        key={log.id}
                        className={`border rounded-lg p-2 text-xs ${getLevelColor(log.level)}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 flex-1 min-w-0">
                            {getLevelIcon(log.level)}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-gray-400">{time}</span>
                                {log.runId && (
                                  <span className="px-1 py-0.5 bg-gray-700 text-gray-300 text-[9px] rounded">
                                    {log.runId.substring(0, 8)}...
                                  </span>
                                )}
                                {log.requestId && (
                                  <span className="px-1 py-0.5 bg-blue-700 text-blue-300 text-[9px] rounded">
                                    {log.requestId.substring(0, 8)}...
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 break-words">
                                {isExpanded ? (
                                  <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
                                    {log.formatted}
                                  </pre>
                                ) : (
                                  <div className="line-clamp-2 font-mono text-[11px]">
                                    {log.formatted.length > 200 
                                      ? `${log.formatted.substring(0, 200)}...` 
                                      : log.formatted}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {log.level === 'error' && (
                              <>
                                <button
                                  onClick={() => copyErrorBundle(log)}
                                  className="p-1 hover:bg-gray-700/50 rounded transition-colors"
                                  title="Copy Error Bundle"
                                >
                                  <Package className="w-3 h-3 text-emerald-400" />
                                </button>
                                <button
                                  onClick={() => copyReproSteps(log)}
                                  className="p-1 hover:bg-gray-700/50 rounded transition-colors"
                                  title="Copy Repro Steps"
                                >
                                  <FileText className="w-3 h-3 text-blue-400" />
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => copyLog(log)}
                              className="p-1 hover:bg-gray-700/50 rounded transition-colors"
                              title="Copy log"
                            >
                              <Copy className="w-3 h-3 text-gray-400" />
                            </button>
                            {log.formatted.length > 200 && (
                              <button
                                onClick={() => toggleExpanded(log.id)}
                                className="p-1 hover:bg-gray-700/50 rounded transition-colors"
                                title={isExpanded ? 'Collapse' : 'Expand'}
                              >
                                {isExpanded ? (
                                  <ChevronUp className="w-3 h-3 text-gray-400" />
                                ) : (
                                  <ChevronDown className="w-3 h-3 text-gray-400" />
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                        
                        {/* Comprehensive Diagnostic */}
                        {log.level === 'error' && isExpanded && diagnostic && (
                          <details className="mt-2 pt-2 border-t border-red-500/30" open>
                            <summary className="cursor-pointer text-red-400 hover:text-red-300 text-[10px] flex items-center gap-1">
                              <Brain className="w-3 h-3" />
                              Root Cause Analysis
                            </summary>
                            <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-[10px]">
                              <div className="text-emerald-300 font-semibold mb-1">
                                {diagnostic.rootCause.likelyCause}
                              </div>
                              <div className="text-gray-300 text-[9px]">
                                {diagnostic.suggestedFix.action}
                              </div>
                              <button
                                onClick={() => downloadDiagnostic(log.id)}
                                className="w-full mt-2 px-2 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 rounded text-[9px] text-emerald-300"
                              >
                                Download Full Report
                              </button>
                            </div>
                          </details>
                        )}
                      </div>
                    );
                  })
                )}
              </>
            )}
            
            {viewMode === 'network' && (
              <>
                {networkEvents.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 text-sm">No network events</div>
                ) : (
                  networkEvents.map((event) => {
                    if (!event.network) return null;
                    const net = event.network;
                    
                    return (
                      <div
                        key={event.id}
                        className="border rounded-lg p-2 text-xs bg-blue-500/10 border-blue-500/20"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-blue-300">{net.method}</span>
                              <span className="text-blue-200 truncate">{net.url}</span>
                              {net.status && (
                                <span className={`px-1.5 py-0.5 rounded text-[9px] ${
                                  net.status >= 400 ? 'bg-red-500 text-white' :
                                  net.status >= 300 ? 'bg-yellow-500 text-black' :
                                  'bg-emerald-500 text-white'
                                }`}>
                                  {net.status}
                                </span>
                              )}
                            </div>
                            <div className="mt-1 text-gray-400 text-[9px] flex items-center gap-3">
                              {net.duration && <span>Duration: {net.duration.toFixed(0)}ms</span>}
                              {net.ttfb && <span>TTFB: {net.ttfb.toFixed(0)}ms</span>}
                              {net.requestSize && <span>Req: {net.requestSize} bytes</span>}
                              {net.responseSize && <span>Res: {net.responseSize} bytes</span>}
                            </div>
                            {net.headers && (
                              <div className="mt-1 text-gray-400 text-[9px] flex items-center gap-2">
                                {net.headers.authorization && (
                                  <span className="px-1 py-0.5 bg-green-500/20 text-green-300 rounded">
                                    Auth: {net.headers.authorizationType}
                                  </span>
                                )}
                                {net.headers.cookie && (
                                  <span className="px-1 py-0.5 bg-purple-500/20 text-purple-300 rounded">
                                    Cookie
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </>
            )}
            
            {viewMode === 'auth' && (
              <>
                {authIncidents.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 text-sm">No auth incidents</div>
                ) : (
                  authIncidents.map((incident) => (
                    <div
                      key={incident.id}
                      className={`border rounded-lg p-2 text-xs ${
                        incident.outcome === 'success' ? 'bg-emerald-500/10 border-emerald-500/20' :
                        incident.outcome === 'failed' ? 'bg-red-500/10 border-red-500/20' :
                        'bg-yellow-500/10 border-yellow-500/20'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4 text-green-400" />
                          <span className="font-semibold">
                            {incident.outcome === 'success' ? '✅ Success' :
                             incident.outcome === 'failed' ? '❌ Failed' :
                             '⏳ Pending'}
                          </span>
                        </div>
                        {incident.duration && (
                          <span className="text-gray-400 text-[9px]">
                            {incident.duration}ms
                          </span>
                        )}
                      </div>
                      <div className="space-y-1">
                        {incident.timeline.map((step, idx) => (
                          <div key={idx} className="text-[9px] text-gray-300">
                            {step.type}: {new Date(step.timestamp).toLocaleTimeString()}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </>
            )}
            
            <div ref={logsEndRef} />
          </div>
        </>
      )}
    </div>
  );
}
