/**
 * Console Logs Widget
 * 
 * Floating widget that displays captured console logs in an AI-friendly format.
 * Ideal for debugging and providing context to AI assistants.
 */

'use client';

// Re-export enhanced version as default
export { default } from './ConsoleLogsWidgetEnhanced';

type ConsoleLogsWidgetProps = {
  logs: CapturedLog[];
  onClear: () => void;
  onGetFormatted: () => string;
  errorCount: number;
  warnCount: number;
};

export default function ConsoleLogsWidget({
  logs,
  onClear,
  onGetFormatted,
  errorCount,
  warnCount,
}: ConsoleLogsWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [filterLevel, setFilterLevel] = useState<LogLevel | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [exportFormat, setExportFormat] = useState<'markdown' | 'json'>('markdown');
  const logsEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Comprehensive diagnostics
  const {
    diagnostics: comprehensiveDiagnostics,
    getDiagnostic,
    exportDiagnostic,
    exportAllDiagnostics,
  } = useComprehensiveDiagnostics(logs);
  
  // Generate diagnostic report
  const diagnosticReport = useMemo(() => {
    if (logs.length === 0) return null;
    return generateDiagnosticReport(logs);
  }, [logs]);
  
  // Group similar errors
  const errorGroups = useMemo(() => {
    return groupSimilarErrors(logs);
  }, [logs]);
  
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
  
  // Download all diagnostics
  const downloadAllDiagnostics = useCallback(() => {
    const allDiagnostics = exportAllDiagnostics(exportFormat);
    const blob = new Blob([allDiagnostics], { type: exportFormat === 'json' ? 'application/json' : 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `complete-diagnostic-report-${Date.now()}.${exportFormat === 'json' ? 'json' : 'md'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [exportAllDiagnostics, exportFormat]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (isOpen && !isMinimized && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isOpen, isMinimized]);

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
    // Prefer AI-enhanced format for better context
    if (log.aiFormatted) {
      navigator.clipboard.writeText(log.aiFormatted);
      return;
    }
    
    const time = new Date(log.timestamp).toISOString();
    let formatted = `[${time}] ${log.level.toUpperCase()}: ${log.formatted}`;
    
    // Add codebase locations
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
    <div className="fixed bottom-4 right-4 z-50 w-[600px] max-w-[calc(100vw-2rem)] bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg shadow-2xl flex flex-col max-h-[80vh]">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-gray-300" />
          <h3 className="text-sm font-semibold text-white">Console Logs</h3>
          {errorCount > 0 && (
            <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full">
              {errorCount} errors
            </span>
          )}
          {warnCount > 0 && (
            <span className="px-2 py-0.5 bg-yellow-500 text-white text-xs font-bold rounded-full">
              {warnCount} warnings
            </span>
          )}
          <span className="px-2 py-0.5 bg-gray-700 text-gray-300 text-xs rounded-full">
            {logs.length} total
          </span>
        </div>
        <div className="flex items-center gap-1">
          {comprehensiveDiagnostics.length > 0 && (
            <button
              onClick={downloadAllDiagnostics}
              className="p-1.5 hover:bg-gray-700 rounded transition-colors"
              title="Download Complete Diagnostic Report"
            >
              <FileDown className="w-4 h-4 text-emerald-400" />
            </button>
          )}
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

          {/* AI Diagnostics Panel */}
          {showDiagnostics && (diagnosticReport || comprehensiveDiagnostics.length > 0) && (
            <div className="p-3 border-b border-gray-700 bg-purple-500/10">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Brain className="w-4 h-4 text-purple-400" />
                  <h4 className="text-sm font-semibold text-purple-300">Comprehensive Diagnostic Report</h4>
                  {comprehensiveDiagnostics.length > 0 && (
                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[9px] rounded-full border border-emerald-500/30">
                      {comprehensiveDiagnostics.length} Root Cause{comprehensiveDiagnostics.length !== 1 ? 's' : ''} Identified
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {comprehensiveDiagnostics.length > 0 && (
                    <button
                      onClick={downloadAllDiagnostics}
                      className="p-1 hover:bg-purple-500/20 rounded transition-colors"
                      title="Download Complete Report"
                    >
                      <FileDown className="w-3 h-3 text-emerald-400" />
                    </button>
                  )}
                  <button
                    onClick={() => {
                      const report = diagnosticReport || exportAllDiagnostics('markdown');
                      navigator.clipboard.writeText(report);
                    }}
                    className="p-1 hover:bg-purple-500/20 rounded transition-colors"
                    title="Copy diagnostic report"
                  >
                    <Copy className="w-3 h-3 text-purple-400" />
                  </button>
                </div>
              </div>
              <div className="text-xs text-purple-200/80 mb-2">
                {errorGroups.size} unique error pattern(s) detected
                {comprehensiveDiagnostics.length > 0 && ` • ${comprehensiveDiagnostics.length} with root cause analysis`}
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] text-purple-300">Export Format:</span>
                <button
                  onClick={() => setExportFormat('markdown')}
                  className={`px-2 py-0.5 text-[9px] rounded transition-colors ${
                    exportFormat === 'markdown' ? 'bg-purple-500/30 text-white' : 'bg-gray-700 text-gray-400'
                  }`}
                >
                  Markdown
                </button>
                <button
                  onClick={() => setExportFormat('json')}
                  className={`px-2 py-0.5 text-[9px] rounded transition-colors ${
                    exportFormat === 'json' ? 'bg-purple-500/30 text-white' : 'bg-gray-700 text-gray-400'
                  }`}
                >
                  JSON
                </button>
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-purple-300 hover:text-purple-200 text-[10px]">
                  View Full Diagnostic Report
                </summary>
                <pre className="mt-2 p-2 bg-black/50 rounded text-[10px] font-mono text-gray-300 whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
                  {diagnosticReport || exportAllDiagnostics('markdown')}
                </pre>
              </details>
            </div>
          )}

          {/* Logs List */}
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto p-2 space-y-2"
            style={{ maxHeight: showDiagnostics ? 'calc(80vh - 320px)' : 'calc(80vh - 180px)' }}
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

                        {/* Comprehensive Diagnostic for Errors */}
                        {log.level === 'error' && isExpanded && (() => {
                          const basicDiagnostic = diagnoseError(log);
                          const comprehensive = getDiagnostic(log.id);
                          
                          return (
                            <details className="mt-2 pt-2 border-t border-red-500/30" open>
                              <summary className="cursor-pointer text-red-400 hover:text-red-300 text-[10px] flex items-center gap-1">
                                <Brain className="w-3 h-3" />
                                Comprehensive Diagnostic Analysis
                                {comprehensive && (
                                  <span className="ml-2 px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[8px] rounded border border-emerald-500/30">
                                    ROOT CAUSE IDENTIFIED
                                  </span>
                                )}
                              </summary>
                              <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-[10px] space-y-2">
                                {comprehensive ? (
                                  <>
                                    {/* Root Cause */}
                                    <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded">
                                      <div className="flex items-center justify-between mb-1">
                                        <span className="text-emerald-300 font-semibold">Root Cause:</span>
                                        <span className={`px-1.5 py-0.5 rounded text-[8px] ${
                                          comprehensive.rootCause.confidence === 'high' ? 'bg-emerald-500 text-white' :
                                          comprehensive.rootCause.confidence === 'medium' ? 'bg-yellow-500 text-black' :
                                          'bg-gray-500 text-white'
                                        }`}>
                                          {comprehensive.rootCause.confidence.toUpperCase()} CONFIDENCE
                                        </span>
                                      </div>
                                      <div className="text-emerald-200 text-[9px] mb-2">{comprehensive.rootCause.likelyCause}</div>
                                      {comprehensive.rootCause.evidence.length > 0 && (
                                        <div>
                                          <span className="text-emerald-300 text-[8px] font-semibold">Evidence:</span>
                                          <ul className="mt-1 ml-3 list-disc space-y-0.5">
                                            {comprehensive.rootCause.evidence.map((evidence, idx) => (
                                              <li key={idx} className="text-[8px] text-emerald-200/80">{evidence}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                    </div>
                                    
                                    {/* Suggested Fix */}
                                    <div>
                                      <span className="text-red-300 font-semibold">Suggested Fix:</span>
                                      <div className="mt-1 text-gray-300 text-[9px]">{comprehensive.suggestedFix.action}</div>
                                      {comprehensive.suggestedFix.verificationSteps.length > 0 && (
                                        <div className="mt-1">
                                          <span className="text-red-300 text-[8px] font-semibold">Verification Steps:</span>
                                          <ol className="mt-0.5 ml-3 list-decimal space-y-0.5">
                                            {comprehensive.suggestedFix.verificationSteps.map((step, idx) => (
                                              <li key={idx} className="text-[8px] text-gray-300">{step}</li>
                                            ))}
                                          </ol>
                                        </div>
                                      )}
                                    </div>
                                    
                                    {/* Context Timeline */}
                                    {comprehensive.context.userActionTimeline.length > 0 && (
                                      <div>
                                        <span className="text-red-300 font-semibold">User Actions Before Error:</span>
                                        <div className="mt-1 space-y-0.5 max-h-20 overflow-y-auto">
                                          {comprehensive.context.userActionTimeline.slice(-5).map((action, idx) => (
                                            <div key={idx} className="text-[8px] text-gray-400">
                                              {action.type} on {action.target || 'unknown'}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* Download Button */}
                                    <button
                                      onClick={() => downloadDiagnostic(log.id)}
                                      className="w-full mt-2 px-2 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 rounded text-[9px] text-emerald-300 flex items-center justify-center gap-1 transition-colors"
                                    >
                                      <Download className="w-3 h-3" />
                                      Download Complete Diagnostic Report
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    {/* Fallback to basic diagnostic */}
                                    <div>
                                      <span className="text-red-300 font-semibold">Severity:</span>
                                      <span className={`ml-2 px-1.5 py-0.5 rounded text-[9px] ${
                                        basicDiagnostic.severity === 'critical' ? 'bg-red-500 text-white' :
                                        basicDiagnostic.severity === 'high' ? 'bg-orange-500 text-white' :
                                        basicDiagnostic.severity === 'medium' ? 'bg-yellow-500 text-black' :
                                        'bg-gray-500 text-white'
                                      }`}>
                                        {basicDiagnostic.severity.toUpperCase()}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-red-300 font-semibold">Category:</span>
                                      <span className="ml-2 text-gray-300">{basicDiagnostic.category}</span>
                                    </div>
                                    <div>
                                      <span className="text-red-300 font-semibold">Likely Cause:</span>
                                      <div className="mt-1 text-gray-300">{basicDiagnostic.likelyCause}</div>
                                    </div>
                                    <div>
                                      <span className="text-red-300 font-semibold">Suggested Actions:</span>
                                      <ol className="mt-1 ml-4 list-decimal space-y-1 text-gray-300">
                                        {basicDiagnostic.suggestedActions.map((action, idx) => (
                                          <li key={idx} className="text-[9px]">{action}</li>
                                        ))}
                                      </ol>
                                    </div>
                                  </>
                                )}
                              </div>
                            </details>
                          );
                        })()}

                    {/* Stack Trace (if error) */}
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

                    {/* Raw Args (if expanded and has complex objects) */}
                    {isExpanded && log.args.length > 1 && (
                      <details className="mt-2 pt-2 border-t border-gray-700/50">
                        <summary className="cursor-pointer text-gray-400 hover:text-gray-300 text-[10px]">
                          Raw Arguments ({log.args.length})
                        </summary>
                        <div className="mt-2 space-y-1">
                          {log.args.map((arg, idx) => (
                            <div key={idx} className="p-2 bg-black/50 rounded text-[10px] font-mono">
                              <div className="text-gray-500 mb-1">Arg {idx + 1}:</div>
                              <pre className="text-gray-300 whitespace-pre-wrap break-words">
                                {typeof arg === 'object' && arg !== null
                                  ? JSON.stringify(arg, null, 2)
                                  : String(arg)}
                              </pre>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                );
              })
            )}
            <div ref={logsEndRef} />
          </div>
        </>
      )}
    </div>
  );
}
