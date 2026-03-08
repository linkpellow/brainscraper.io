'use client';

import { useState, useEffect, useMemo } from 'react';
import { Settings, Zap, DollarSign, CheckCircle2, XCircle, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { 
  EnrichmentStation, 
  STATION_DEFINITIONS, 
  addStationWithDependencies,
  calculateOptimalOrder, 
  validateStationConfig,
  getDefaultStationConfig,
  removeStationWithDependents,
} from '@/utils/enrichmentStations';

interface EnrichmentStationControlProps {
  enabledStations: Set<EnrichmentStation>;
  onStationsChange: (stations: Set<EnrichmentStation>) => void;
  className?: string;
}

export default function EnrichmentStationControl({
  enabledStations,
  onStationsChange,
  className = '',
}: EnrichmentStationControlProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDetails, setShowDetails] = useState<Set<EnrichmentStation>>(new Set());
  
  // Calculate optimal order for current configuration
  const optimalOrder = useMemo(() => {
    return calculateOptimalOrder(new Set(enabledStations));
  }, [enabledStations]);
  
  // Validate configuration
  const validationErrors = useMemo(() => {
    return validateStationConfig(enabledStations);
  }, [enabledStations]);
  
  // Calculate cost summary
  const costSummary = useMemo(() => {
    const free = optimalOrder.filter(s => STATION_DEFINITIONS[s].cost === 'free').length;
    const paid = optimalOrder.filter(s => STATION_DEFINITIONS[s].cost === 'paid').length;
    return { free, paid, total: optimalOrder.length };
  }, [optimalOrder]);
  
  const toggleStation = (station: EnrichmentStation) => {
    const config = STATION_DEFINITIONS[station];
    
    // Cannot disable required stations
    if (config.required) {
      return;
    }
    
    const newEnabled = enabledStations.has(station)
      ? removeStationWithDependents(enabledStations, station)
      : addStationWithDependencies(enabledStations, station);
    
    onStationsChange(newEnabled);
  };
  
  const toggleDetails = (station: EnrichmentStation) => {
    const newShow = new Set(showDetails);
    if (newShow.has(station)) {
      newShow.delete(station);
    } else {
      newShow.add(station);
    }
    setShowDetails(newShow);
  };
  
  const resetToDefault = () => {
    onStationsChange(getDefaultStationConfig());
  };
  
  // Group stations by category
  const stationGroups = useMemo(() => {
    const foundation: EnrichmentStation[] = ['linkedin'];
    const free: EnrichmentStation[] = ['zip', 'income-pre-qual', 'gatekeep', 'dnc-check'];
    const paid: EnrichmentStation[] = ['phone-discovery', 'telnyx', 'age'];
    
    return { foundation, free, paid };
  }, []);
  
  return (
    <div className={`bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 p-4 ${className}`}>
      {/* Header */}
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <Settings className="w-5 h-5 text-white/70" />
          <div>
            <h3 className="text-white font-semibold">Enrichment Stations</h3>
            <p className="text-white/60 text-sm">
              {optimalOrder.length} stations • {costSummary.free} free • {costSummary.paid} paid
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {validationErrors.length > 0 && (
            <div className="text-red-400 text-xs" title={validationErrors.join(', ')}>
              ⚠️ {validationErrors.length} issue{validationErrors.length > 1 ? 's' : ''}
            </div>
          )}
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-white/60" />
          ) : (
            <ChevronDown className="w-5 h-5 text-white/60" />
          )}
        </div>
      </div>
      
      {/* Expanded Content */}
      {isExpanded && (
        <div className="mt-4 space-y-4">
          {/* Cost Summary */}
          <div className="bg-white/5 rounded-lg p-3 border border-white/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white/80 text-sm font-medium">Execution Order</span>
              <button
                onClick={resetToDefault}
                className="text-xs text-white/60 hover:text-white/80 underline"
              >
                Reset to Default
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {optimalOrder.map((station, idx) => {
                const config = STATION_DEFINITIONS[station];
                return (
                  <div
                    key={station}
                    className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${
                      config.cost === 'free' 
                        ? 'bg-green-500/20 text-green-300 border border-green-500/30' 
                        : 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
                    }`}
                    title={`${config.name} (${config.cost})`}
                  >
                    <span className="text-white/50">{idx + 1}.</span>
                    {config.name}
                    {config.cost === 'free' ? (
                      <Zap className="w-3 h-3 text-green-300" />
                    ) : (
                      <DollarSign className="w-3 h-3 text-yellow-300" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* Station Toggles */}
          <div className="space-y-3">
            {/* Foundation Stations */}
            <div>
              <h4 className="text-white/70 text-sm font-medium mb-2">Foundation</h4>
              <div className="space-y-2">
                {stationGroups.foundation.map(station => {
                  const config = STATION_DEFINITIONS[station];
                  const isEnabled = enabledStations.has(station);
                  return (
                    <StationToggle
                      key={station}
                      station={station}
                      config={config}
                      isEnabled={isEnabled}
                      orderIndex={optimalOrder.indexOf(station)}
                      enabledStations={enabledStations}
                      onToggle={() => toggleStation(station)}
                      onToggleDetails={() => toggleDetails(station)}
                      showDetails={showDetails.has(station)}
                    />
                  );
                })}
              </div>
            </div>
            
            {/* Free Stations */}
            <div>
              <h4 className="text-white/70 text-sm font-medium mb-2 flex items-center gap-2">
                Free Operations
                <Zap className="w-4 h-4 text-green-400" />
              </h4>
              <div className="space-y-2">
                {stationGroups.free.map(station => {
                  const config = STATION_DEFINITIONS[station];
                  const isEnabled = enabledStations.has(station);
                  return (
                    <StationToggle
                      key={station}
                      station={station}
                      config={config}
                      isEnabled={isEnabled}
                      orderIndex={optimalOrder.indexOf(station)}
                      enabledStations={enabledStations}
                      onToggle={() => toggleStation(station)}
                      onToggleDetails={() => toggleDetails(station)}
                      showDetails={showDetails.has(station)}
                    />
                  );
                })}
              </div>
            </div>
            
            {/* Paid Stations */}
            <div>
              <h4 className="text-white/70 text-sm font-medium mb-2 flex items-center gap-2">
                Paid Operations
                <DollarSign className="w-4 h-4 text-yellow-400" />
              </h4>
              <div className="space-y-2">
                {stationGroups.paid.map(station => {
                  const config = STATION_DEFINITIONS[station];
                  const isEnabled = enabledStations.has(station);
                  return (
                    <StationToggle
                      key={station}
                      station={station}
                      config={config}
                      isEnabled={isEnabled}
                      orderIndex={optimalOrder.indexOf(station)}
                      enabledStations={enabledStations}
                      onToggle={() => toggleStation(station)}
                      onToggleDetails={() => toggleDetails(station)}
                      showDetails={showDetails.has(station)}
                    />
                  );
                })}
              </div>
            </div>
          </div>
          
          {/* Validation Errors */}
          {validationErrors.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                <div className="text-red-300 text-sm">
                  <div className="font-medium mb-1">Configuration Issues:</div>
                  <ul className="list-disc list-inside space-y-1">
                    {validationErrors.map((error, idx) => (
                      <li key={idx}>{error}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface StationToggleProps {
  station: EnrichmentStation;
  config: typeof STATION_DEFINITIONS[EnrichmentStation];
  isEnabled: boolean;
  orderIndex: number;
  enabledStations: Set<EnrichmentStation>;
  onToggle: () => void;
  onToggleDetails: () => void;
  showDetails: boolean;
}

function StationToggle({
  station,
  config,
  isEnabled,
  orderIndex,
  enabledStations,
  onToggle,
  onToggleDetails,
  showDetails,
}: StationToggleProps) {
  const isDisabled = config.required;
  const isInOrder = orderIndex >= 0;
  
  return (
    <div className={`bg-white/5 rounded-lg border ${
      isEnabled 
        ? config.cost === 'free' 
          ? 'border-green-500/30 bg-green-500/5' 
          : 'border-yellow-500/30 bg-yellow-500/5'
        : 'border-white/10'
    }`}>
      <div className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            {/* Toggle Switch */}
            <button
              onClick={onToggle}
              disabled={isDisabled}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                isEnabled 
                  ? config.cost === 'free' 
                    ? 'bg-green-500' 
                    : 'bg-yellow-500'
                  : 'bg-white/20'
              } ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                isEnabled ? 'translate-x-6' : 'translate-x-0'
              }`} />
            </button>
            
            {/* Station Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-white font-medium">{config.name}</span>
                {isInOrder && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-white/70">
                    #{orderIndex + 1}
                  </span>
                )}
                {config.cost === 'free' ? (
                  <Zap className="w-4 h-4 text-green-400" />
                ) : (
                  <DollarSign className="w-4 h-4 text-yellow-400" />
                )}
                {config.required && (
                  <span className="text-xs text-white/50">(Required)</span>
                )}
              </div>
              <p className="text-white/60 text-xs mt-0.5">{config.description}</p>
            </div>
          </div>
          
          {/* Details Toggle */}
          <button
            onClick={onToggleDetails}
            className="ml-2 p-1 hover:bg-white/10 rounded transition-colors"
          >
            <Info className={`w-4 h-4 text-white/60 transition-transform ${
              showDetails ? 'rotate-180' : ''
            }`} />
          </button>
        </div>
        
        {/* Details Panel */}
        {showDetails && (
          <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
            <div className="text-xs text-white/70">
              <div className="font-medium mb-1">Provides:</div>
              <div className="flex flex-wrap gap-1">
                {config.provides.map(prov => (
                  <span key={prov} className="px-2 py-0.5 bg-white/10 rounded text-white/80">
                    {prov}
                  </span>
                ))}
              </div>
            </div>
            {config.dependencies.length > 0 && (
              <div className="text-xs text-white/70">
                <div className="font-medium mb-1">Depends on:</div>
                <div className="flex flex-wrap gap-1">
                  {config.dependencies.map(dep => {
                    const depConfig = STATION_DEFINITIONS[dep];
                    return (
                      <span 
                        key={dep} 
                        className={`px-2 py-0.5 rounded ${
                          enabledStations.has(dep)
                            ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                            : 'bg-red-500/20 text-red-300 border border-red-500/30'
                        }`}
                      >
                        {depConfig.name}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
