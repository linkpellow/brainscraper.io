/**
 * HAR Ingestion Pipeline
 * 
 * Step 1: Complete ingestion and extraction
 */

import { parseHAR } from './harParser';
import { buildCookieJarTimeline } from './cookieJarExtractor';
import { extractAuthArtifacts } from './authArtifactExtractor';
import { identifyFirstPartyHosts } from './firstPartyIdentifier';
import { processStep2 } from './step2Processing';
import { groupAutomationEndpoints, type AutomationEndpointGroup } from './automationGrouping';
import type { ArtifactBundle, RequestEvent, EndpointCatalog } from './types';

/**
 * Process HAR file and extract all artifacts
 */
export async function ingestHAR(
  harContent: string | any,
  harFileName: string = 'uploaded.har'
): Promise<ArtifactBundle> {
  // Step 1: Parse HAR into normalized events
  const events = parseHAR(harContent);
  
  // Step 2: Build cookie jar timeline
  const cookieTimeline = buildCookieJarTimeline(events);
  
  // Step 3: Extract auth artifacts
  const authArtifacts = extractAuthArtifacts(events);
  
  // Step 4: Identify first-party hosts
  const hosts = identifyFirstPartyHosts(events);
  
  // Step 5: Link auth artifacts to their creation/usage
  linkAuthArtifactsToEvents(events, authArtifacts);
  
  // Build artifact bundle
  const bundle: ArtifactBundle = {
    events,
    cookieJar: {
      timeline: cookieTimeline,
    },
    authArtifacts,
    hosts,
    metadata: {
      harFile: harFileName,
      extractedAt: Date.now(),
      totalEvents: events.length,
      totalCookies: cookieTimeline.length,
      totalAuthArtifacts: authArtifacts.length,
    },
  };
  
  return bundle;
}

/**
 * Link auth artifacts to events (update createdByUrl and usedInEventIds)
 */
function linkAuthArtifactsToEvents(events: RequestEvent[], artifacts: any[]) {
  // For each artifact, find where it was created and where it's used
  for (const artifact of artifacts) {
    // If created in response, find the event
    if (artifact.location === 'response_body' || artifact.location === 'response_header') {
      const createdEvent = events.find(e => e.id === artifact.firstSeenAtEventId);
      if (createdEvent) {
        artifact.createdByUrl = createdEvent.url;
      }
    }
    
    // Find all events that use this artifact
    for (const event of events) {
      if (artifact.location === 'request_header') {
        // Check if this event uses the header
        const headerValue = event.requestHeaders[artifact.name.toLowerCase()];
        if (headerValue && headerValue.includes(artifact.value)) {
          if (!artifact.usedInEventIds.includes(event.id)) {
            artifact.usedInEventIds.push(event.id);
          }
        }
      } else if (artifact.location === 'cookie') {
        // Check if this event uses the cookie
        const hasCookie = event.requestCookies.some(c => c.name === artifact.name);
        if (hasCookie && !artifact.usedInEventIds.includes(event.id)) {
          artifact.usedInEventIds.push(event.id);
        }
      }
    }
  }
}

/**
 * Answer queries about the artifact bundle
 */
export function queryArtifactBundle(bundle: ArtifactBundle) {
  return {
    /**
     * Which endpoint sets the session cookie?
     */
    getSessionCookieSetter(): { cookie: any; setByUrl: string; eventId: string } | null {
      const sessionCookie = bundle.cookieJar.timeline.find(c => 
        c.cookieName.toLowerCase().includes('session') ||
        c.cookieName.toLowerCase().includes('auth')
      );
      
      if (sessionCookie) {
        return {
          cookie: sessionCookie,
          setByUrl: sessionCookie.setByUrl,
          eventId: sessionCookie.firstSeenAtEventId,
        };
      }
      return null;
    },
    
    /**
     * Which endpoints require a specific cookie?
     */
    getEndpointsRequiringCookie(cookieName: string): RequestEvent[] {
      const cookie = bundle.cookieJar.timeline.find(c => c.cookieName === cookieName);
      if (!cookie) return [];
      
      return bundle.events.filter(e => 
        cookie.subsequentlySentInEventIds.includes(e.id)
      );
    },
    
    /**
     * Where is Bearer token first seen, and what calls use it?
     */
    getBearerTokenUsage(): {
      token: any;
      firstSeenAt: string;
      createdByUrl: string;
      usedIn: RequestEvent[];
    } | null {
      const bearerToken = bundle.authArtifacts.find(a => 
        a.type === 'bearer_token' && a.location === 'request_header'
      );
      
      if (!bearerToken) return null;
      
      return {
        token: bearerToken,
        firstSeenAt: bearerToken.firstSeenAtEventId,
        createdByUrl: bearerToken.createdByUrl,
        usedIn: bundle.events.filter(e => 
          bearerToken.usedInEventIds.includes(e.id)
        ),
      };
    },
    
    /**
     * Is there a refresh endpoint and what triggers it?
     */
    getRefreshEndpoint(): {
      endpoint: RequestEvent;
      refreshToken: any;
    } | null {
      const refreshToken = bundle.authArtifacts.find(a => a.type === 'refresh_token');
      if (!refreshToken) return null;
      
      // Find the event that created/uses the refresh token
      const refreshEvent = bundle.events.find(e => 
        e.id === refreshToken.firstSeenAtEventId ||
        refreshToken.usedInEventIds.includes(e.id)
      );
      
      if (refreshEvent && refreshEvent.url.includes('refresh') || refreshEvent.url.includes('token')) {
        return {
          endpoint: refreshEvent,
          refreshToken,
        };
      }
      
      return null;
    },
  };
}

/**
 * Process HAR file and generate complete catalog (Step 1 + Step 2)
 */
export async function processHARComplete(
  harContent: string | any,
  harFileName: string = 'uploaded.har'
): Promise<{ bundle: ArtifactBundle; catalog: EndpointCatalog; automationGroups: AutomationEndpointGroup[] }> {
  // Step 1: Extract artifacts
  const bundle = await ingestHAR(harContent, harFileName);
  
  // Step 2: Build catalog
  const catalog = processStep2(bundle);
  
  // Generate automation-ready groups
  const automationGroups = groupAutomationEndpoints(bundle.events, bundle.hosts.firstParty);
  
  return { bundle, catalog, automationGroups };
}
