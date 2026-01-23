/**
 * Dev Tool Operator Widget
 * 
 * Combined widget for:
 * - Console logs viewing and management
 * - Page refresh/restart controls
 * - Dev server operations
 */

'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { 
  X, Terminal, Trash2, Copy, ChevronDown, ChevronUp, Filter, Search, 
  AlertCircle, AlertTriangle, Info, Bug, FileCode, BookOpen, Brain, 
  RefreshCw, RotateCw, Power
} from 'lucide-react';
import type { CapturedLog, LogLevel } from '../hooks/useConsoleCapture';
import type { CodeLocation } from '../utils/codebaseAwareLogging';
import { generateFileReadInstruction, createDiagnosticSummary } from '../utils/readFileContext';
import { diagnoseError, generateDiagnosticReport, groupSimilarErrors } from '../utils/errorDiagnostics';

type DevToolOperatorProps = {
  logs: CapturedLog[];
  onClear: () => void;
  onGetFormatted: () => string;
  errorCount: number;
  warnCount: number;
};

export default function DevToolOperator({
  logs,
  onClear,
  onGetFormatted,
  errorCount,
  warnCount,
}: DevToolOperatorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [filterLevel, setFilterLevel] = useState<LogLevel | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [activeTab, setActiveTab] = useState<'logs' | 'tools'>('logs');
  const logsEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Generate diagnostic report
  const diagnosticReport = useMemo(() => {
    if (logs.length === 0) return null;
    return generateDiagnosticReport(logs);
  }, [logs]);
  
  // Group similar errors
  const errorGroups = useMemo(() => {
    return groupSimilarErrors(logs);
  }, [logs]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (isOpen && !isMinimized && activeTab === 'logs' && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isOpen, isMinimized, activeTab]);

  // Filter logs
  const filteredLogs = logs.filter(log => {
    if (filterLevel !== 'all' && log.level !== filterLevel) return false;
    if (searchQuery && !log.formatted.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

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

  const copyAllLogs = () => {
    const formatted = onGetFormatted();
    navigator.clipboard.writeText(formatted);
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

  const handlePageRefresh = () => {
    window.location.reload();
  };

  const handleHardRefresh = () => {
    window.location.reload();
    // Clear cache by adding a cache-busting parameter
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => caches.delete(name));
      });
    }
  };

  const getLevelIcon = (level: LogLevel) => {
    switch (level) {
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      case 'warn':
        return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
      case 'info':
        return <Info className="w-4 h-4 text-blue-400" />;
      case 'debug':
        return <Bug className="w-4 h-4 text-gray-400" />;
      default:
        return <Terminal className="w-4 h-4 text-gray-400" />;
    }
  };

  const getLevelColor = (level: LogLevel) => {
    switch (level) {
      case 'error':
        return 'border-red-500/30 bg-red-500/5';
      case 'warn':
        return 'border-yellow-500/30 bg-yellow-500/5';
      case 'info':
        return 'border-blue-500/30 bg-blue-500/5';
      case 'debug':
        return 'border-gray-500/30 bg-gray-500/5';
      default:
        return 'border-gray-700/50 bg-gray-800/50';
    }
  };

  // Floating button when closed
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 w-14 h-14 bg-gray-900 border border-gray-700 rounded-full shadow-lg hover:bg-gray-800 transition-colors flex items-center justify-center group"
        title="Dev Tool Operator"
      >
        <Terminal className="w-6 h-6 text-gray-300 group-hover:text-white" />
        {errorCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {errorCount}
          </span>
        )}
        {warnCount > 0 && errorCount === 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {warnCount}
          </span>
        )}
      </button>
    );
  }

  // Full widget when open
  return (
    <div className="fixed bottom-4 right-4 z-50 w-[600px] bg-gray-900 border border-gray-700 rounded-lg shadow-2xl flex flex-col max-h-[80vh]">
      {/* Header */}
      <div className="p-3 border-b border-gray-700 flex items-center justify-between bg-gray-800/50">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-emerald-400" />
          <h3 className="text-sm font-semibold text-white">Dev Tool Operator</h3>
          {errorCount > 0 && (
            <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full border border-red-500/30">
              {errorCount} error{errorCount !== 1 ? 's' : ''}
            </span>
          )}
          {warnCount > 0 && (
            <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded-full border border-yellow-500/30">
              {warnCount} warn{warnCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
            title="Toggle AI Diagnostics"
          >
            <Brain className="w-4 h-4 text-purple-400" />
          </button>
          <button
            onClick={copyAllLogs}
            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
            title="Copy all logs"
          >
            <Copy className="w-4 h-4 text-gray-400" />
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
          {/* Tabs */}
          <div className="flex border-b border-gray-700 bg-gray-800/30">
            <button
              onClick={() => setActiveTab('logs')}
              className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
                activeTab === 'logs'
                  ? 'bg-gray-800 text-white border-b-2 border-emerald-400'
                  : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800/50'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Terminal className="w-4 h-4" />
                Console Logs ({logs.length})
              </div>
            </button>
            <button
              onClick={() => setActiveTab('tools')}
              className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
                activeTab === 'tools'
                  ? 'bg-gray-800 text-white border-b-2 border-emerald-400'
                  : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800/50'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Power className="w-4 h-4" />
                Dev Tools
              </div>
            </button>
          </div>

          {/* AI Diagnostics Panel */}
          {showDiagnostics && diagnosticReport && activeTab === 'logs' && (
            <div className="p-3 border-b border-gray-700 bg-purple-500/10">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Brain className="w-4 h-4 text-purple-400" />
                  <h4 className="text-sm font-semibold text-purple-300">AI Diagnostic Report</h4>
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(diagnosticReport)}
                  className="p-1 hover:bg-purple-500/20 rounded transition-colors"
                  title="Copy diagnostic report"
                >
                  <Copy className="w-3 h-3 text-purple-400" />
                </button>
              </div>
              <div className="text-xs text-purple-200/80 mb-2">
                {errorGroups.size} unique error pattern(s) detected
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-purple-300 hover:text-purple-200 text-[10px]">
                  View Full Diagnostic Report
                </summary>
                <pre className="mt-2 p-2 bg-black/50 rounded text-[10px] font-mono text-gray-300 whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
                  {diagnosticReport}
                </pre>
              </details>
            </div>
          )}

          {/* Content */}
          {activeTab === 'logs' ? (
            <>
              {/* Filters */}
              <div className="p-3 border-b border-gray-700 space-y-2">
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
                <div className="flex items-center gap-2 flex-wrap">
                  <Filter className="w-4 h-4 text-gray-400" />
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
                    Errors ({logs.filter(l => l.level === 'error').length})
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
                    Warnings ({logs.filter(l => l.level === 'warn').length})
                  </button>
                  <button
                    onClick={() => setFilterLevel('info')}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      filterLevel === 'info' 
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' 
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    Info
                  </button>
                  <button
                    onClick={() => setFilterLevel('log')}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      filterLevel === 'log' 
                        ? 'bg-gray-700 text-white' 
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    Logs
                  </button>
                </div>
              </div>

              {/* Logs List */}
              <div
                ref={scrollContainerRef}
                className="flex-1 overflow-y-auto p-2 space-y-2"
                style={{ maxHeight: showDiagnostics ? 'calc(80vh - 420px)' : 'calc(80vh - 280px)' }}
              >
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
                    
                    return (
                      <div
                        key={log.id}
                        className={`border rounded-lg p-2 text-xs ${getLevelColor(log.level)}`}
                      >
                        {/* Log Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 flex-1 min-w-0">
                            {getLevelIcon(log.level)}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-gray-400">{time}</span>
                                {log.locations && log.locations.length > 0 ? (
                                  <div className="flex items-center gap-1 flex-wrap">
                                    {log.locations.slice(0, 2).map((loc, idx) => (
                                      <span
                                        key={idx}
                                        className="px-1.5 py-0.5 bg-blue-500/20 text-blue-300 font-mono text-[10px] rounded border border-blue-500/30"
                                        title={`${loc.file}:${loc.line}:${loc.column}${loc.function ? ` in ${loc.function}()` : ''}`}
                                      >
                                        {loc.file.split('/').pop()}:{loc.line}
                                      </span>
                                    ))}
                                    {log.locations.length > 2 && (
                                      <span className="text-gray-500 text-[9px]">
                                        +{log.locations.length - 2} more
                                      </span>
                                    )}
                                  </div>
                                ) : log.source ? (
                                  <span className="text-gray-500 font-mono text-[10px]">
                                    {log.source}
                                  </span>
                                ) : null}
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

                        {/* Codebase Locations */}
                        {log.locations && log.locations.length > 0 && isExpanded && (
                          <details className="mt-2 pt-2 border-t border-gray-700/50" open>
                            <summary className="cursor-pointer text-gray-400 hover:text-gray-300 text-[10px] flex items-center gap-1">
                              <FileCode className="w-3 h-3" />
                              Code Locations ({log.locations.length})
                            </summary>
                            <div className="mt-2 space-y-2">
                              {log.locations.map((loc, idx) => (
                                <div key={idx} className="p-2 bg-blue-500/10 border border-blue-500/20 rounded text-[10px]">
                                  <div className="flex items-center gap-2 mb-1">
                                    <FileCode className="w-3 h-3 text-blue-400" />
                                    <code className="text-blue-300 font-mono">
                                      {loc.file}:{loc.line}:{loc.column}
                                    </code>
                                    {loc.function && (
                                      <span className="text-gray-400 text-[9px]">
                                        in {loc.function}()
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-gray-400 text-[9px] mt-1 space-y-1">
                                    <div className="flex items-center gap-1">
                                      <BookOpen className="w-3 h-3" />
                                      <span>AI Instruction:</span>
                                    </div>
                                    <code className="block p-1.5 bg-black/30 rounded text-[9px] font-mono whitespace-pre-wrap break-words">
                                      {generateFileReadInstruction(loc)}
                                    </code>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}

                        {/* AI-Enhanced Format */}
                        {log.aiFormatted && isExpanded && (
                          <details className="mt-2 pt-2 border-t border-gray-700/50">
                            <summary className="cursor-pointer text-gray-400 hover:text-gray-300 text-[10px] flex items-center gap-1">
                              <Terminal className="w-3 h-3" />
                              AI-Enhanced Format
                            </summary>
                            <pre className="mt-2 p-2 bg-purple-500/10 border border-purple-500/20 rounded text-[10px] font-mono text-gray-300 whitespace-pre-wrap break-words">
                              {log.aiFormatted}
                            </pre>
                          </details>
                        )}

                        {/* AI Diagnostic for Errors */}
                        {log.level === 'error' && isExpanded && (() => {
                          const diagnostic = diagnoseError(log);
                          return (
                            <details className="mt-2 pt-2 border-t border-red-500/30" open>
                              <summary className="cursor-pointer text-red-400 hover:text-red-300 text-[10px] flex items-center gap-1">
                                <Brain className="w-3 h-3" />
                                AI Diagnostic Analysis
                              </summary>
                              <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-[10px] space-y-2">
                                <div>
                                  <span className="text-red-300 font-semibold">Severity:</span>
                                  <span className={`ml-2 px-1.5 py-0.5 rounded text-[9px] ${
                                    diagnostic.severity === 'critical' ? 'bg-red-500 text-white' :
                                    diagnostic.severity === 'high' ? 'bg-orange-500 text-white' :
                                    diagnostic.severity === 'medium' ? 'bg-yellow-500 text-black' :
                                    'bg-gray-500 text-white'
                                  }`}>
                                    {diagnostic.severity.toUpperCase()}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-red-300 font-semibold">Category:</span>
                                  <span className="ml-2 text-gray-300">{diagnostic.category}</span>
                                </div>
                                <div>
                                  <span className="text-red-300 font-semibold">Likely Cause:</span>
                                  <div className="mt-1 text-gray-300">{diagnostic.likelyCause}</div>
                                </div>
                                <div>
                                  <span className="text-red-300 font-semibold">Suggested Actions:</span>
                                  <ol className="mt-1 ml-4 list-decimal space-y-1 text-gray-300">
                                    {diagnostic.suggestedActions.map((action, idx) => (
                                      <li key={idx} className="text-[9px]">{action}</li>
                                    ))}
                                  </ol>
                                </div>
                                {diagnostic.relatedFiles.length > 0 && (
                                  <div>
                                    <span className="text-red-300 font-semibold">Related Files:</span>
                                    <div className="mt-1 space-y-1">
                                      {diagnostic.relatedFiles.map((loc, idx) => (
                                        <div key={idx} className="text-[9px] text-blue-300 font-mono">
                                          {loc.file}:{loc.line}:{loc.column}
                                          {loc.function && ` (${loc.function}())`}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </details>
                          );
                        })()}

                        {/* Stack Trace */}
                        {log.stack && isExpanded && (
                          <details className="mt-2 pt-2 border-t border-gray-700/50">
                            <summary className="cursor-pointer text-gray-400 hover:text-gray-300 text-[10px]">
                              Raw Stack Trace
                            </summary>
                            <pre className="mt-2 p-2 bg-black/50 rounded text-[10px] font-mono text-gray-400 overflow-x-auto">
                              {log.stack}
                            </pre>
                          </details>
                        )}
                      </div>
                    );
                  })
                )}
                <div ref={logsEndRef} />
              </div>
            </>
          ) : (
            /* Dev Tools Tab */
            <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ maxHeight: 'calc(80vh - 200px)' }}>
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-emerald-400" />
                  Page Controls
                </h4>
                
                <div className="space-y-2">
                  <button
                    onClick={handlePageRefresh}
                    className="w-full px-4 py-3 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 rounded-lg transition-colors flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 text-emerald-400" />
                      <span className="text-sm text-white">Refresh Page</span>
                    </div>
                    <span className="text-xs text-gray-400 group-hover:text-gray-300">F5</span>
                  </button>
                  
                  <button
                    onClick={handleHardRefresh}
                    className="w-full px-4 py-3 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg transition-colors flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2">
                      <RotateCw className="w-4 h-4 text-blue-400" />
                      <span className="text-sm text-white">Hard Refresh</span>
                    </div>
                    <span className="text-xs text-gray-400 group-hover:text-gray-300">Clear Cache</span>
                  </button>
                </div>

                <div className="pt-4 border-t border-gray-700">
                  <h4 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                    <Terminal className="w-4 h-4 text-emerald-400" />
                    Log Management
                  </h4>
                  
                  <div className="space-y-2">
                    <button
                      onClick={onClear}
                      className="w-full px-4 py-3 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg transition-colors flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <Trash2 className="w-4 h-4 text-red-400" />
                        <span className="text-sm text-white">Clear All Logs</span>
                      </div>
                      <span className="text-xs text-gray-400">{logs.length} logs</span>
                    </button>
                    
                    <button
                      onClick={copyAllLogs}
                      className="w-full px-4 py-3 bg-gray-700/50 hover:bg-gray-700 border border-gray-600 rounded-lg transition-colors flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <Copy className="w-4 h-4 text-gray-300" />
                        <span className="text-sm text-white">Copy All Logs</span>
                      </div>
                      <span className="text-xs text-gray-400">Export</span>
                    </button>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-700">
                  <h4 className="text-sm font-semibold text-white mb-3">Quick Stats</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-3 bg-gray-800/50 rounded border border-gray-700">
                      <div className="text-xs text-gray-400">Total Logs</div>
                      <div className="text-lg font-semibold text-white">{logs.length}</div>
                    </div>
                    <div className="p-3 bg-red-500/10 rounded border border-red-500/20">
                      <div className="text-xs text-red-400">Errors</div>
                      <div className="text-lg font-semibold text-red-400">{errorCount}</div>
                    </div>
                    <div className="p-3 bg-yellow-500/10 rounded border border-yellow-500/20">
                      <div className="text-xs text-yellow-400">Warnings</div>
                      <div className="text-lg font-semibold text-yellow-400">{warnCount}</div>
                    </div>
                    <div className="p-3 bg-gray-800/50 rounded border border-gray-700">
                      <div className="text-xs text-gray-400">Unique Errors</div>
                      <div className="text-lg font-semibold text-white">{errorGroups.size}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
