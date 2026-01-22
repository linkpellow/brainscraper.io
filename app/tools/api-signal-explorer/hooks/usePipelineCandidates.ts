/**
 * Custom hook for managing pipeline candidate steps from browser interactions
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ActionEvent } from '@/src/tools/api-signal-explorer/actions';
import type { RawNetworkEvent } from '@/src/tools/api-signal-explorer/neuromap';
import { createPipelineCandidateStep, type PipelineCandidateStep } from '@/src/tools/api-signal-explorer/pipeline-candidate';
import { correlateActionToNetwork } from '@/src/tools/api-signal-explorer/correlate';

export function usePipelineCandidates(
  networkEvents: RawNetworkEvent[],
  wsUrl: string = 'ws://localhost:8787/explorer'
) {
  const [candidateSteps, setCandidateSteps] = useState<PipelineCandidateStep[]>([]);
  const [activeActions, setActiveActions] = useState<ActionEvent[]>([]);
  const eventsRef = useRef<RawNetworkEvent[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const actionTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Keep events ref in sync
  useEffect(() => {
    eventsRef.current = networkEvents;
  }, [networkEvents]);

  // Connect to WebSocket to listen for browser_action messages
  useEffect(() => {
    // Only connect if wsUrl is provided
    if (!wsUrl) {
      return;
    }

    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let isIntentionallyClosed = false;

    const connect = () => {
      try {
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('[PipelineCandidates] Connected to bridge');
        };

        ws.onmessage = (event: MessageEvent) => {
          try {
            const message = JSON.parse(event.data);
            
            if (message.type === 'browser_action' && message.action) {
              const action: ActionEvent = message.action;
              
              // Add to active actions
              setActiveActions(prev => [...prev, action]);
              
              // Clear any existing timeout for this action
              const existingTimeout = actionTimeoutsRef.current.get(action.id);
              if (existingTimeout) {
                clearTimeout(existingTimeout);
              }
              
              // Process after a delay to allow network events to arrive
              const timeout = setTimeout(() => {
                processAction(action);
                actionTimeoutsRef.current.delete(action.id);
              }, 1500); // 1.5 second window for network events
              
              actionTimeoutsRef.current.set(action.id, timeout);
            }
          } catch (err) {
            console.error('[PipelineCandidates] Error processing browser_action:', err);
          }
        };

        ws.onerror = (error) => {
          // WebSocket error events often have empty error objects
          // Only log if there's meaningful error information
          if (error && (error.message || error.type || error.target)) {
            console.warn('[PipelineCandidates] WebSocket error:', error);
          }
          // Don't spam console with empty error objects
        };

        ws.onclose = (event) => {
          wsRef.current = null;
          if (!isIntentionallyClosed) {
            // Attempt to reconnect after a delay (only if not intentionally closed)
            console.log('[PipelineCandidates] WebSocket closed, will attempt to reconnect...');
            reconnectTimeout = setTimeout(() => {
              connect();
            }, 3000); // Reconnect after 3 seconds
          } else {
            console.log('[PipelineCandidates] WebSocket closed');
          }
        };
      } catch (err) {
        // Handle WebSocket constructor errors (e.g., invalid URL)
        console.warn('[PipelineCandidates] Failed to create WebSocket connection:', err);
      }
    };

    // Initial connection
    connect();

    return () => {
      isIntentionallyClosed = true;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      
      // Clear all timeouts
      actionTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
      actionTimeoutsRef.current.clear();
      
      if (ws) {
        try {
          ws.close();
        } catch (err) {
          // Ignore close errors
        }
      }
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (err) {
          // Ignore close errors
        }
        wsRef.current = null;
      }
    };
  }, [wsUrl]);

  const processAction = useCallback((action: ActionEvent) => {
    const currentEvents = eventsRef.current;
    const correlations = correlateActionToNetwork(action, currentEvents, {
      windowMs: 3000, // 3 second window for browser interactions
      maxLinks: 12,
    });
    
    // Get correlated events by matching eventId
    const correlatedEvents = correlations
      .map(corr => {
        try {
          // Parse eventId: "ts_method_host_path" or "ts_method_host_path_bodyHash"
          const parts = corr.eventId.split('_');
          if (parts.length < 4) return null;
          
          const ts = parseInt(parts[0]);
          if (isNaN(ts)) return null;
          
          const method = parts[1];
          const host = parts[2];
          // Path may contain underscores, so join all remaining parts
          // Unless last part looks like a hash (short alphanumeric)
          const pathParts = parts.slice(3);
          const lastPart = pathParts[pathParts.length - 1];
          const isBodyHash = lastPart && lastPart.length < 20 && /^[a-z0-9]+$/i.test(lastPart);
          const pathComponents = isBodyHash ? pathParts.slice(0, -1) : pathParts;
          const path = '/' + pathComponents.join('/');
          
          return currentEvents.find(e => 
            Math.abs(e.ts - ts) < 1000 && // Allow timestamp variance (1 second)
            e.method === method &&
            e.host === host &&
            e.path === path
          );
        } catch (err) {
          console.warn('[PipelineCandidates] Error parsing correlation:', err);
          return null;
        }
      })
      .filter((e): e is RawNetworkEvent => e !== undefined)
      .filter((e, i, arr) => {
        // Deduplicate by method+host+path+timestamp (more precise)
        const key = `${e.ts}_${e.method}_${e.host}_${e.path}`;
        return arr.findIndex(a => `${a.ts}_${a.method}_${a.host}_${a.path}` === key) === i;
      });
    
    // Create pipeline candidate step
    const candidateStep = createPipelineCandidateStep(action, correlatedEvents);
    
    setCandidateSteps(prev => {
      // Check if step already exists
      const existing = prev.find(s => s.id === candidateStep.id);
      if (existing) {
        // Update existing step with new correlation
        return prev.map(s => 
          s.id === candidateStep.id 
            ? { ...candidateStep, userStatus: s.userStatus, lockedAt: s.lockedAt } 
            : s
        );
      }
      // Add new step
      return [...prev, candidateStep];
    });
  }, []);

  const lockCandidateStep = useCallback((stepId: string) => {
    setCandidateSteps(prev => prev.map(step => 
      step.id === stepId 
        ? { ...step, userStatus: 'locked' as const, lockedAt: Date.now() }
        : step
    ));
  }, []);

  const rejectCandidateStep = useCallback((stepId: string) => {
    setCandidateSteps(prev => prev.map(step => 
      step.id === stepId 
        ? { ...step, userStatus: 'rejected' as const }
        : step
    ));
  }, []);

  const renameCandidateStep = useCallback((stepId: string, newLabel: string) => {
    setCandidateSteps(prev => prev.map(step => 
      step.id === stepId 
        ? { ...step, action: { ...step.action, label: newLabel } }
        : step
    ));
  }, []);

  const clearRejectedSteps = useCallback(() => {
    setCandidateSteps(prev => prev.filter(step => step.userStatus !== 'rejected'));
  }, []);

  return {
    candidateSteps,
    activeActions,
    lockCandidateStep,
    rejectCandidateStep,
    renameCandidateStep,
    clearRejectedSteps,
  };
}
