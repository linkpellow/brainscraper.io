'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Zap, Plus, X, Play, Save, Code, Globe, Key, Database, Layers
} from 'lucide-react';

export interface WorkflowNode {
  id: string;
  label: string;
  position: { x: number; y: number };
  config: {
    apiService?: string;
    app?: string;
    apiKey?: string;
    requestUrl?: string;
    endpoint?: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    params?: Array<{ key: string; value: string; description?: string }>;
    headers?: Array<{ key: string; value: string; description?: string }>;
    body?: string;
    authorizations?: Array<{ type: string; key: string; value: string }>;
    retryConfig?: {
      maxRetries?: number;
      backoffMs?: number;
    };
  };
}

export interface WorkflowConnection {
  id: string;
  from: string;
  to: string;
}

interface WorkflowBuilderProps {
  onSave?: (workflow: { nodes: WorkflowNode[]; connections: WorkflowConnection[] }) => void;
  onRun?: (workflow: { nodes: WorkflowNode[]; connections: WorkflowConnection[] }) => void;
}

const API_SERVICES = [
  {
    id: 'rapidapi',
    name: 'RapidAPI',
    description: 'RapidAPI marketplace endpoints',
    icon: Globe,
  },
  {
    id: 'scraperapi',
    name: 'ScraperAPI',
    description: 'Web scraping API',
    icon: Code,
  },
  {
    id: 'capsolver',
    name: 'Capsolver',
    description: 'CAPTCHA solving service',
    icon: Key,
  },
  {
    id: 'us-census',
    name: 'US Census API',
    description: 'US Census Bureau data',
    icon: Database,
  },
  {
    id: 'telnyx',
    name: 'Telnyx',
    description: 'Phone number lookup',
    icon: Globe,
  },
  {
    id: 'usha',
    name: 'USHA',
    description: 'DNC scrubbing service',
    icon: Key,
  },
  {
    id: 'geocodio',
    name: 'Geocodio',
    description: 'Geocoding service',
    icon: Globe,
  },
  {
    id: 'custom',
    name: 'Custom API',
    description: 'Any HTTP API endpoint',
    icon: Code,
  },
];

export default function WorkflowBuilder({ onSave, onRun }: WorkflowBuilderProps) {
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [connections, setConnections] = useState<WorkflowConnection[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedPort, setSelectedPort] = useState<{ nodeId: string; type: 'input' | 'output' } | null>(null);
  const [isConnecting, setIsConnecting] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState('New Pipeline');
  const [configTab, setConfigTab] = useState<'app' | 'params' | 'headers' | 'body' | 'authorizations'>('app');
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [nodeDragOffset, setNodeDragOffset] = useState({ x: 0, y: 0 });

  const generateNodeId = () => `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const handleAddNode = useCallback((position: { x: number; y: number }) => {
    const newNode: WorkflowNode = {
      id: generateNodeId(),
      label: `Node ${nodes.length + 1}`,
      position,
      config: {
        method: 'GET',
        params: [],
        headers: [],
        body: '',
        authorizations: [],
        retryConfig: {
          maxRetries: 3,
          backoffMs: 1000,
        },
      },
    };

    setNodes(prev => [...prev, newNode]);
    setSelectedNode(newNode.id);
  }, [nodes.length]);

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target === canvasRef.current || target.classList.contains('canvas-background')) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const x = e.clientX - rect.left - canvasOffset.x;
        const y = e.clientY - rect.top - canvasOffset.y;
        handleAddNode({ x, y });
      }
    }
  }, [canvasOffset, handleAddNode]);

  const handleNodeMouseDown = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    setDraggedNode(nodeId);
    setNodeDragOffset({
      x: e.clientX - rect.left - canvasOffset.x - node.position.x,
      y: e.clientY - rect.top - canvasOffset.y - node.position.y,
    });
  }, [nodes, canvasOffset]);

  useEffect(() => {
    if (!draggedNode) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const newX = e.clientX - rect.left - canvasOffset.x - nodeDragOffset.x;
      const newY = e.clientY - rect.top - canvasOffset.y - nodeDragOffset.y;

      setNodes(prev => prev.map(n =>
        n.id === draggedNode ? { ...n, position: { x: newX, y: newY } } : n
      ));
    };

    const handleMouseUp = () => {
      setDraggedNode(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggedNode, nodeDragOffset, canvasOffset]);

  const handleStartConnection = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsConnecting(nodeId);
    setSelectedPort({ nodeId, type: 'output' });
  }, []);

  const handleEndConnection = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isConnecting && isConnecting !== nodeId) {
      const newConnection: WorkflowConnection = {
        id: `conn-${Date.now()}`,
        from: isConnecting,
        to: nodeId,
      };
      setConnections(prev => [...prev, newConnection]);
    }
    setIsConnecting(null);
    setSelectedPort({ nodeId, type: 'input' });
  }, [isConnecting]);

  const handlePortClick = useCallback((nodeId: string, type: 'input' | 'output', e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedPort({ nodeId, type });
    if (type === 'output') {
      setIsConnecting(nodeId);
    } else if (isConnecting) {
      handleEndConnection(nodeId, e);
    }
  }, [isConnecting, handleEndConnection]);

  const handleDeleteNode = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setConnections(prev => prev.filter(c => c.from !== nodeId && c.to !== nodeId));
    if (selectedNode === nodeId) setSelectedNode(null);
  }, [selectedNode]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target === canvasRef.current || target.classList.contains('canvas-background')) {
      setIsDraggingCanvas(true);
      setDragStart({ x: e.clientX - canvasOffset.x, y: e.clientY - canvasOffset.y });
    }
  }, [canvasOffset]);

  useEffect(() => {
    if (!isDraggingCanvas) return;

    const handleMouseMove = (e: MouseEvent) => {
      setCanvasOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    };

    const handleMouseUp = () => {
      setIsDraggingCanvas(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingCanvas, dragStart]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isConnecting && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        setMousePos({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
      }
    };

    if (isConnecting) {
      document.addEventListener('mousemove', handleMouseMove);
      return () => document.removeEventListener('mousemove', handleMouseMove);
    }
  }, [isConnecting]);

  const getNodePosition = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    return node ? node.position : { x: 0, y: 0 };
  };

  const selectedNodeData = nodes.find(n => n.id === selectedNode);
  const selectedService = selectedNodeData?.config.apiService
    ? API_SERVICES.find(s => s.id === selectedNodeData.config.apiService)
    : null;

  return (
    <div className="flex h-full bg-slate-900 rounded-xl overflow-hidden relative">
      {/* Sidebar */}
      <div className="w-64 border-r border-slate-700/50 bg-slate-800/50 flex flex-col z-10">
        <div className="p-4 border-b border-slate-700/50">
          <h3 className="text-sm font-semibold text-white mb-1">Pipeline Builder</h3>
          <p className="text-xs text-slate-400">Click canvas to add nodes</p>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <div className="panel-inactive rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Plus className="w-4 h-4 text-white" />
              <span className="text-xs font-medium text-white">Add API Node</span>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Click anywhere on the canvas to add a new API node
            </p>
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-slate-300">Available Services</h4>
              <div className="space-y-1">
                {API_SERVICES.map((service) => {
                  const Icon = service.icon;
                  return (
                    <div key={service.id} className="flex items-center gap-2 text-xs text-slate-400">
                      <Icon className="w-3 h-3" />
                      <span>{service.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="panel-inactive rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Layers className="w-4 h-4 text-white" />
              <span className="text-xs font-medium text-white">Pipeline Stats</span>
            </div>
            <div className="space-y-1 text-xs text-slate-400">
              <div className="flex justify-between">
                <span>Nodes:</span>
                <span className="text-white">{nodes.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Connections:</span>
                <span className="text-white">{connections.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 relative overflow-hidden">
        <div
          ref={canvasRef}
          className={`canvas-background w-full h-full relative ${isDraggingCanvas ? 'cursor-grabbing' : 'cursor-crosshair'}`}
          onClick={handleCanvasClick}
          onMouseDown={handleCanvasMouseDown}
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
          }}
        >
          {/* Connections SVG */}
          <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
            {connections.map((conn) => {
              const fromPos = getNodePosition(conn.from);
              const toPos = getNodePosition(conn.to);

              const fromX = fromPos.x + 208;
              const fromY = fromPos.y + 50;
              const toX = toPos.x;
              const toY = toPos.y + 50;

              const curveOffset = Math.min(100, Math.abs(toX - fromX) / 2);

              return (
                <path
                  key={conn.id}
                  d={`M ${fromX} ${fromY} C ${fromX + curveOffset} ${fromY}, ${toX - curveOffset} ${toY}, ${toX} ${toY}`}
                  fill="none"
                  stroke="rgba(255,255,255,0.3)"
                  strokeWidth="2"
                  markerEnd="url(#arrowhead)"
                />
              );
            })}
            {isConnecting && (() => {
              const fromPos = getNodePosition(isConnecting);
              const fromX = fromPos.x + 208;
              const fromY = fromPos.y + 50;
              const toX = mousePos.x;
              const toY = mousePos.y;
              const curveOffset = Math.min(100, Math.abs(toX - fromX) / 2);

              return (
                <path
                  d={`M ${fromX} ${fromY} C ${fromX + curveOffset} ${fromY}, ${toX - curveOffset} ${toY}, ${toX} ${toY}`}
                  fill="none"
                  stroke="rgba(255,255,255,0.5)"
                  strokeWidth="2"
                  strokeDasharray="5,5"
                />
              );
            })()}
            <defs>
              <marker
                id="arrowhead"
                markerWidth="10"
                markerHeight="10"
                refX="9"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 10 3, 0 6" fill="rgba(255,255,255,0.3)" />
              </marker>
            </defs>
          </svg>

          {/* Nodes */}
          <div style={{ transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px)` }}>
            {nodes.map((node) => {
              const isSelected = selectedNode === node.id;
              const isConnectingFrom = isConnecting === node.id;
              const service = node.config.apiService
                ? API_SERVICES.find(s => s.id === node.config.apiService)
                : null;
              const ServiceIcon = service?.icon || Code;

              return (
                <div
                  key={node.id}
                  className="absolute"
                  style={{
                    left: node.position.x,
                    top: node.position.y,
                    zIndex: isSelected ? 10 : 2,
                  }}
                >
                  <div
                    className={`
                      panel-inactive rounded-xl p-4 w-52 cursor-move transition-all
                      ${isSelected ? 'border-white/50 shadow-lg shadow-white/20' : 'border-slate-700/50'}
                      ${isConnectingFrom ? 'ring-2 ring-white/50' : ''}
                    `}
                    onMouseDown={(e) => handleNodeMouseDown(node.id, e)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedNode(node.id);
                    }}
                  >
                    {/* Input Port */}
                    <div
                      className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 flex items-center justify-center z-20"
                      onClick={(e) => handlePortClick(node.id, 'input', e)}
                    >
                      <div
                        className={`
                          w-4 h-4 rounded-full border-2 bg-slate-800 transition-all cursor-pointer
                          ${selectedPort?.nodeId === node.id && selectedPort?.type === 'input'
                            ? 'border-white ring-2 ring-white/50 bg-white/20'
                            : isConnecting && isConnecting !== node.id
                            ? 'border-white hover:bg-white/20'
                            : 'border-slate-600 hover:border-slate-400'
                          }
                        `}
                        title="Input Port - Click to select or connect"
                      />
                    </div>

                    {/* Node Content */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="p-2 rounded-lg bg-gradient-to-br from-gray-600 to-gray-500">
                        <ServiceIcon className="w-4 h-4 text-white" />
                      </div>
                      <button
                        onClick={(e) => handleDeleteNode(node.id, e)}
                        className="p-1 hover:bg-white/10 rounded transition-colors"
                        title="Delete Node"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </div>
                    <h4 className="text-xs font-semibold text-white mb-1 truncate">{node.label}</h4>
                    <div className="space-y-1">
                      {service ? (
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full bg-white/30"></div>
                          <span className="text-xs text-slate-400">{service.name}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full bg-slate-600"></div>
                          <span className="text-xs text-slate-400">Not configured</span>
                        </div>
                      )}
                      {node.config.endpoint && (
                        <div className="text-xs text-slate-500 truncate" title={node.config.endpoint}>
                          {node.config.method} {node.config.endpoint.substring(0, 25)}...
                        </div>
                      )}
                    </div>

                    {/* Output Port */}
                    <div
                      className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-4 h-4 flex items-center justify-center z-20"
                      onClick={(e) => handlePortClick(node.id, 'output', e)}
                    >
                      <div
                        className={`
                          w-4 h-4 rounded-full border-2 bg-slate-800 transition-all cursor-pointer
                          ${selectedPort?.nodeId === node.id && selectedPort?.type === 'output'
                            ? 'border-white ring-2 ring-white/50 bg-white/20'
                            : isConnectingFrom
                            ? 'border-white ring-2 ring-white/50'
                            : 'border-slate-600 hover:border-slate-400'
                          }
                        `}
                        title="Output Port - Click to select or connect"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <Zap className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-sm text-slate-400 mb-1">Click anywhere to add an API node</p>
                <p className="text-xs text-slate-500">Configure each node to connect your APIs</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Configuration Panel */}
      {selectedNodeData && (
        <div className="w-96 border-l border-slate-700/50 bg-slate-800/50 flex flex-col z-10">
          <div className="p-4 border-b border-slate-700/50">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">Node Configuration</h3>
              <button
                onClick={() => setSelectedNode(null)}
                className="p-1 hover:bg-white/10 rounded transition-colors"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
            {/* Tabs */}
            <div className="flex gap-1 border-b border-slate-700/50">
              {[
                { id: 'app', label: 'App' },
                { id: 'params', label: `Params(${selectedNodeData.config.params?.length || 0})` },
                { id: 'headers', label: `Headers(${selectedNodeData.config.headers?.length || 0})` },
                { id: 'body', label: 'Body' },
                { id: 'authorizations', label: 'Authorizations' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setConfigTab(tab.id as any)}
                  className={`
                    px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-[1px]
                    ${configTab === tab.id
                      ? 'text-white border-white'
                      : 'text-slate-400 border-transparent hover:text-slate-300'
                    }
                  `}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {/* App Tab */}
            {configTab === 'app' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Node Label</label>
                  <input
                    type="text"
                    value={selectedNodeData.label}
                    onChange={(e) => {
                      setNodes(prev => prev.map(n =>
                        n.id === selectedNodeData.id ? { ...n, label: e.target.value } : n
                      ));
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-700/50 text-white text-sm focus:outline-none focus:border-white/30"
                    placeholder="e.g., Skip Trace API"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">API Service</label>
                  <select
                    value={selectedNodeData.config.apiService || ''}
                    onChange={(e) => {
                      setNodes(prev => prev.map(n =>
                        n.id === selectedNodeData.id ? {
                          ...n,
                          config: {
                            ...n.config,
                            apiService: e.target.value || undefined,
                            headers: [],
                          },
                        } : n
                      ));
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-700/50 text-white text-sm focus:outline-none focus:border-white/30"
                  >
                    <option value="">Select API Service...</option>
                    {API_SERVICES.map(service => (
                      <option key={service.id} value={service.id}>{service.name}</option>
                    ))}
                  </select>
                  {selectedService && (
                    <p className="text-xs text-slate-400 mt-1">{selectedService.description}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">App</label>
                  <select
                    value={selectedNodeData.config.app || 'default-application'}
                    onChange={(e) => {
                      setNodes(prev => prev.map(n =>
                        n.id === selectedNodeData.id ? {
                          ...n,
                          config: { ...n.config, app: e.target.value },
                        } : n
                      ));
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-700/50 text-white text-sm focus:outline-none focus:border-white/30"
                  >
                    <option value="default-application">default-application</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    {selectedService?.id === 'rapidapi' ? 'X-RapidAPI-Key' : 'API Key'}
                  </label>
                  <select
                    value={selectedNodeData.config.apiKey || ''}
                    onChange={(e) => {
                      setNodes(prev => prev.map(n =>
                        n.id === selectedNodeData.id ? {
                          ...n,
                          config: { ...n.config, apiKey: e.target.value },
                        } : n
                      ));
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-700/50 text-white text-sm focus:outline-none focus:border-white/30 font-mono text-xs"
                  >
                    <option value="">Select API Key...</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Request URL</label>
                  <select
                    value={selectedNodeData.config.requestUrl || 'rapidapi.com'}
                    onChange={(e) => {
                      setNodes(prev => prev.map(n =>
                        n.id === selectedNodeData.id ? {
                          ...n,
                          config: { ...n.config, requestUrl: e.target.value },
                        } : n
                      ));
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-700/50 text-white text-sm focus:outline-none focus:border-white/30"
                  >
                    <option value="rapidapi.com">rapidapi.com</option>
                    <option value="custom">Custom URL</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">HTTP Method</label>
                  <select
                    value={selectedNodeData.config.method || 'GET'}
                    onChange={(e) => {
                      setNodes(prev => prev.map(n =>
                        n.id === selectedNodeData.id ? {
                          ...n,
                          config: { ...n.config, method: e.target.value as any },
                        } : n
                      ));
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-700/50 text-white text-sm focus:outline-none focus:border-white/30"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="PATCH">PATCH</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Endpoint URL</label>
                  <input
                    type="text"
                    value={selectedNodeData.config.endpoint || ''}
                    onChange={(e) => {
                      setNodes(prev => prev.map(n =>
                        n.id === selectedNodeData.id ? {
                          ...n,
                          config: { ...n.config, endpoint: e.target.value },
                        } : n
                      ));
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-700/50 text-white text-sm focus:outline-none focus:border-white/30 font-mono text-xs"
                    placeholder="https://api.example.com/endpoint"
                  />
                </div>
              </div>
            )}

            {/* Params Tab */}
            {configTab === 'params' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Query Parameters</span>
                  <button
                    onClick={() => {
                      setNodes(prev => prev.map(n =>
                        n.id === selectedNodeData.id ? {
                          ...n,
                          config: {
                            ...n.config,
                            params: [...(n.config.params || []), { key: '', value: '', description: '' }],
                          },
                        } : n
                      ));
                    }}
                    className="text-xs text-white hover:text-slate-300 transition-colors"
                  >
                    + Add Param
                  </button>
                </div>
                {(selectedNodeData.config.params || []).map((param, idx) => (
                  <div key={idx} className="space-y-2 p-3 rounded-lg bg-slate-900/30 border border-slate-700/30">
                    <div className="flex items-center justify-between">
                      <input
                        type="text"
                        value={param.key}
                        onChange={(e) => {
                          const newParams = [...(selectedNodeData.config.params || [])];
                          newParams[idx] = { ...newParams[idx], key: e.target.value };
                          setNodes(prev => prev.map(n =>
                            n.id === selectedNodeData.id ? {
                              ...n,
                              config: { ...n.config, params: newParams },
                            } : n
                          ));
                        }}
                        className="flex-1 px-2 py-1.5 rounded bg-slate-800/50 border border-slate-700/50 text-white text-xs focus:outline-none focus:border-white/30"
                        placeholder="Key"
                      />
                      <button
                        onClick={() => {
                          const newParams = (selectedNodeData.config.params || []).filter((_, i) => i !== idx);
                          setNodes(prev => prev.map(n =>
                            n.id === selectedNodeData.id ? {
                              ...n,
                              config: { ...n.config, params: newParams },
                            } : n
                          ));
                        }}
                        className="ml-2 p-1 hover:bg-white/10 rounded"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={param.value}
                      onChange={(e) => {
                        const newParams = [...(selectedNodeData.config.params || [])];
                        newParams[idx] = { ...newParams[idx], value: e.target.value };
                        setNodes(prev => prev.map(n =>
                          n.id === selectedNodeData.id ? {
                            ...n,
                            config: { ...n.config, params: newParams },
                          } : n
                        ));
                      }}
                      className="w-full px-2 py-1.5 rounded bg-slate-800/50 border border-slate-700/50 text-white text-xs focus:outline-none focus:border-white/30"
                      placeholder="Value"
                    />
                  </div>
                ))}
                {(!selectedNodeData.config.params || selectedNodeData.config.params.length === 0) && (
                  <p className="text-xs text-slate-500 text-center py-4">No parameters configured</p>
                )}
              </div>
            )}

            {/* Headers Tab */}
            {configTab === 'headers' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">HTTP Headers</span>
                  <button
                    onClick={() => {
                      setNodes(prev => prev.map(n =>
                        n.id === selectedNodeData.id ? {
                          ...n,
                          config: {
                            ...n.config,
                            headers: [...(n.config.headers || []), { key: '', value: '', description: '' }],
                          },
                        } : n
                      ));
                    }}
                    className="text-xs text-white hover:text-slate-300 transition-colors"
                  >
                    + Add Header
                  </button>
                </div>
                {(selectedNodeData.config.headers || []).map((header, idx) => (
                  <div key={idx} className="space-y-2 p-3 rounded-lg bg-slate-900/30 border border-slate-700/30">
                    <div className="flex items-center justify-between">
                      <input
                        type="text"
                        value={header.key}
                        onChange={(e) => {
                          const newHeaders = [...(selectedNodeData.config.headers || [])];
                          newHeaders[idx] = { ...newHeaders[idx], key: e.target.value };
                          setNodes(prev => prev.map(n =>
                            n.id === selectedNodeData.id ? {
                              ...n,
                              config: { ...n.config, headers: newHeaders },
                            } : n
                          ));
                        }}
                        className="flex-1 px-2 py-1.5 rounded bg-slate-800/50 border border-slate-700/50 text-white text-xs focus:outline-none focus:border-white/30"
                        placeholder="Header Name"
                      />
                      <button
                        onClick={() => {
                          const newHeaders = (selectedNodeData.config.headers || []).filter((_, i) => i !== idx);
                          setNodes(prev => prev.map(n =>
                            n.id === selectedNodeData.id ? {
                              ...n,
                              config: { ...n.config, headers: newHeaders },
                            } : n
                          ));
                        }}
                        className="ml-2 p-1 hover:bg-white/10 rounded"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={header.value}
                      onChange={(e) => {
                        const newHeaders = [...(selectedNodeData.config.headers || [])];
                        newHeaders[idx] = { ...newHeaders[idx], value: e.target.value };
                        setNodes(prev => prev.map(n =>
                          n.id === selectedNodeData.id ? {
                            ...n,
                            config: { ...n.config, headers: newHeaders },
                          } : n
                        ));
                      }}
                      className="w-full px-2 py-1.5 rounded bg-slate-800/50 border border-slate-700/50 text-white text-xs focus:outline-none focus:border-white/30"
                      placeholder="Header Value"
                    />
                  </div>
                ))}
                {(!selectedNodeData.config.headers || selectedNodeData.config.headers.length === 0) && (
                  <p className="text-xs text-slate-500 text-center py-4">No headers configured</p>
                )}
              </div>
            )}

            {/* Body Tab */}
            {configTab === 'body' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Request Body</label>
                  <textarea
                    value={selectedNodeData.config.body || ''}
                    onChange={(e) => {
                      setNodes(prev => prev.map(n =>
                        n.id === selectedNodeData.id ? {
                          ...n,
                          config: { ...n.config, body: e.target.value },
                        } : n
                      ));
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-700/50 text-white text-sm focus:outline-none focus:border-white/30 font-mono text-xs"
                    rows={8}
                    placeholder='{"key": "value"}'
                  />
                </div>
              </div>
            )}

            {/* Authorizations Tab */}
            {configTab === 'authorizations' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Authorization Methods</span>
                  <button
                    onClick={() => {
                      setNodes(prev => prev.map(n =>
                        n.id === selectedNodeData.id ? {
                          ...n,
                          config: {
                            ...n.config,
                            authorizations: [...(n.config.authorizations || []), { type: 'Bearer', key: '', value: '' }],
                          },
                        } : n
                      ));
                    }}
                    className="text-xs text-white hover:text-slate-300 transition-colors"
                  >
                    + Add Auth
                  </button>
                </div>
                {(selectedNodeData.config.authorizations || []).map((auth, idx) => (
                  <div key={idx} className="space-y-2 p-3 rounded-lg bg-slate-900/30 border border-slate-700/30">
                    <select
                      value={auth.type}
                      onChange={(e) => {
                        const newAuths = [...(selectedNodeData.config.authorizations || [])];
                        newAuths[idx] = { ...newAuths[idx], type: e.target.value };
                        setNodes(prev => prev.map(n =>
                          n.id === selectedNodeData.id ? {
                            ...n,
                            config: { ...n.config, authorizations: newAuths },
                          } : n
                        ));
                      }}
                      className="w-full px-2 py-1.5 rounded bg-slate-800/50 border border-slate-700/50 text-white text-xs focus:outline-none focus:border-white/30"
                    >
                      <option value="Bearer">Bearer Token</option>
                      <option value="Basic">Basic Auth</option>
                      <option value="API Key">API Key</option>
                    </select>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={auth.key}
                        onChange={(e) => {
                          const newAuths = [...(selectedNodeData.config.authorizations || [])];
                          newAuths[idx] = { ...newAuths[idx], key: e.target.value };
                          setNodes(prev => prev.map(n =>
                            n.id === selectedNodeData.id ? {
                              ...n,
                              config: { ...n.config, authorizations: newAuths },
                            } : n
                          ));
                        }}
                        className="flex-1 px-2 py-1.5 rounded bg-slate-800/50 border border-slate-700/50 text-white text-xs focus:outline-none focus:border-white/30"
                        placeholder="Key"
                      />
                      <input
                        type="password"
                        value={auth.value}
                        onChange={(e) => {
                          const newAuths = [...(selectedNodeData.config.authorizations || [])];
                          newAuths[idx] = { ...newAuths[idx], value: e.target.value };
                          setNodes(prev => prev.map(n =>
                            n.id === selectedNodeData.id ? {
                              ...n,
                              config: { ...n.config, authorizations: newAuths },
                            } : n
                          ));
                        }}
                        className="flex-1 px-2 py-1.5 rounded bg-slate-800/50 border border-slate-700/50 text-white text-xs focus:outline-none focus:border-white/30"
                        placeholder="Value"
                      />
                      <button
                        onClick={() => {
                          const newAuths = (selectedNodeData.config.authorizations || []).filter((_, i) => i !== idx);
                          setNodes(prev => prev.map(n =>
                            n.id === selectedNodeData.id ? {
                              ...n,
                              config: { ...n.config, authorizations: newAuths },
                            } : n
                          ));
                        }}
                        className="p-1 hover:bg-white/10 rounded"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  </div>
                ))}
                {(!selectedNodeData.config.authorizations || selectedNodeData.config.authorizations.length === 0) && (
                  <p className="text-xs text-slate-500 text-center py-4">No authorizations configured</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Top Bar */}
      <div className="absolute top-0 left-64 right-0 h-16 bg-slate-800/80 backdrop-blur-sm border-b border-slate-700/50 flex items-center justify-between px-6 z-20">
        <div className="flex items-center gap-4">
          <input
            type="text"
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-slate-900/50 border border-slate-700/50 text-white text-sm focus:outline-none focus:border-white/30"
            placeholder="Pipeline name"
          />
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>{nodes.length} nodes</span>
            <span>•</span>
            <span>{connections.length} connections</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onSave?.({ nodes, connections })}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700/70 text-white text-sm font-medium transition-colors"
          >
            <Save className="w-4 h-4" />
            Save
          </button>
          <button
            onClick={() => onRun?.({ nodes, connections })}
            disabled={nodes.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-gray-600 to-gray-500 hover:from-gray-700 hover:to-gray-600 text-white text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="w-4 h-4" />
            Run Pipeline
          </button>
        </div>
      </div>
    </div>
  );
}
