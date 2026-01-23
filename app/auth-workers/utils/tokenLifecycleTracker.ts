/**
 * Token Lifecycle Tracker
 * 
 * Tracks token refresh cycles and 401→refresh→retry flows
 */

import type { StructuredEvent } from './eventBus';

export type AuthIncident = {
  id: string;
  runId?: string;
  workerId?: string;
  timeline: Array<{
    event: StructuredEvent;
    timestamp: number;
    type: '401' | 'REFRESH_START' | 'REFRESH_SUCCESS' | 'REFRESH_FAIL' | 'RETRY' | 'SUCCESS' | 'FAIL';
  }>;
  outcome: 'success' | 'failed' | 'pending';
  duration?: number;
};

class TokenLifecycleTracker {
  private incidents: Map<string, AuthIncident> = new Map();
  private pendingIncidents: Map<string, AuthIncident> = new Map();
  
  /**
   * Process auth event and update incidents
   */
  processAuthEvent(event: StructuredEvent): void {
    if (!event.auth) return;
    
    const { eventType, workerId } = event.auth;
    const incidentKey = `${event.runId || 'global'}:${workerId || 'unknown'}`;
    
    // Get or create incident
    let incident = this.pendingIncidents.get(incidentKey);
    if (!incident) {
      incident = {
        id: `incident_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        runId: event.runId,
        workerId,
        timeline: [],
        outcome: 'pending',
      };
      this.pendingIncidents.set(incidentKey, incident);
    }
    
    // Add event to timeline
    let type: AuthIncident['timeline'][0]['type'] = 'SUCCESS';
    if (eventType === 'REQUEST_401') type = '401';
    else if (eventType === 'TOKEN_REFRESH_START') type = 'REFRESH_START';
    else if (eventType === 'TOKEN_REFRESH_SUCCESS') type = 'REFRESH_SUCCESS';
    else if (eventType === 'TOKEN_REFRESH_FAIL') type = 'REFRESH_FAIL';
    else if (eventType === 'REQUEST_RETRY_AFTER_REFRESH') type = 'RETRY';
    
    incident.timeline.push({
      event,
      timestamp: event.timestamp,
      type,
    });
    
    // Update outcome
    if (eventType === 'TOKEN_REFRESH_FAIL') {
      incident.outcome = 'failed';
      incident.duration = event.timestamp - (incident.timeline[0]?.timestamp || event.timestamp);
      this.pendingIncidents.delete(incidentKey);
      this.incidents.set(incident.id, incident);
    } else if (eventType === 'REQUEST_RETRY_AFTER_REFRESH') {
      // Check if retry succeeded (would be in network event)
      // For now, mark as success if we got here
      incident.outcome = 'success';
      incident.duration = event.timestamp - (incident.timeline[0]?.timestamp || event.timestamp);
      this.pendingIncidents.delete(incidentKey);
      this.incidents.set(incident.id, incident);
    }
  }
  
  /**
   * Get incidents for a run
   */
  getIncidentsForRun(runId: string): AuthIncident[] {
    return Array.from(this.incidents.values()).filter(i => i.runId === runId);
  }
  
  /**
   * Get all incidents
   */
  getAllIncidents(): AuthIncident[] {
    return Array.from(this.incidents.values());
  }
  
  /**
   * Get pending incidents
   */
  getPendingIncidents(): AuthIncident[] {
    return Array.from(this.pendingIncidents.values());
  }
  
  /**
   * Clear old incidents (keep last 100)
   */
  clearOldIncidents(): void {
    const all = Array.from(this.incidents.values());
    all.sort((a, b) => b.timeline[0]?.timestamp || 0 - (a.timeline[0]?.timestamp || 0));
    
    if (all.length > 100) {
      const toKeep = all.slice(0, 100);
      this.incidents.clear();
      toKeep.forEach(incident => {
        this.incidents.set(incident.id, incident);
      });
    }
  }
}

export const tokenLifecycleTracker = new TokenLifecycleTracker();
