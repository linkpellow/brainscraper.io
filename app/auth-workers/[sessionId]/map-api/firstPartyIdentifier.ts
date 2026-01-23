/**
 * First-Party Host Identifier
 * 
 * Identifies first-party vs third-party hosts based on registrable domain (eTLD+1)
 */

import type { RequestEvent, HostInfo } from './types';

/**
 * Get registrable domain (eTLD+1) from hostname
 * e.g., "sub.example.com" -> "example.com"
 * e.g., "sub.example.co.uk" -> "example.co.uk"
 */
function getRegistrableDomain(hostname: string): string {
  // Simple implementation - split by dots and take last 2 parts
  // For production, you'd want to use a proper eTLD list (public suffix list)
  const parts = hostname.split('.');
  
  if (parts.length <= 2) {
    return hostname;
  }
  
  // Handle common two-part TLDs
  const twoPartTlds = ['co.uk', 'com.au', 'co.nz', 'com.br', 'co.jp'];
  const lastTwo = parts.slice(-2).join('.');
  
  if (twoPartTlds.includes(lastTwo) && parts.length > 2) {
    return parts.slice(-3).join('.');
  }
  
  return parts.slice(-2).join('.');
}

/**
 * Identify first-party hosts from events
 */
export function identifyFirstPartyHosts(events: RequestEvent[]): {
  firstParty: string[];
  thirdParty: string[];
  hostInfo: HostInfo[];
} {
  const hostCounts = new Map<string, number>();
  const hostDomains = new Map<string, string>();
  
  // Count events per host
  for (const event of events) {
    const count = hostCounts.get(event.host) || 0;
    hostCounts.set(event.host, count + 1);
    
    if (!hostDomains.has(event.host)) {
      hostDomains.set(event.host, getRegistrableDomain(event.host));
    }
  }
  
  // Find the main domain (most requests)
  let mainDomain = '';
  let maxCount = 0;
  
  const domainCounts = new Map<string, number>();
  for (const [host, count] of hostCounts.entries()) {
    const domain = hostDomains.get(host)!;
    const domainCount = (domainCounts.get(domain) || 0) + count;
    domainCounts.set(domain, domainCount);
    
    if (domainCount > maxCount) {
      maxCount = domainCount;
      mainDomain = domain;
    }
  }
  
  // Also check page references for main domain
  const pageRefHosts = new Set<string>();
  for (const event of events) {
    if (event.pageref) {
      // Extract host from pageref if it's a URL
      try {
        // pageref is usually a page ID, but sometimes contains URLs
        // We'll use the most common host from actual requests
      } catch {
        // Ignore
      }
    }
  }
  
  // Classify hosts
  const firstParty: string[] = [];
  const thirdParty: string[] = [];
  const hostInfo: HostInfo[] = [];
  
  for (const [host, count] of hostCounts.entries()) {
    const domain = hostDomains.get(host)!;
    const isFirstParty = domain === mainDomain;
    
    if (isFirstParty) {
      firstParty.push(host);
    } else {
      thirdParty.push(host);
    }
    
    hostInfo.push({
      host,
      registrableDomain: domain,
      isFirstParty,
      eventCount: count,
    });
    
    // Update events with isFirstParty flag
    for (const event of events) {
      if (event.host === host) {
        event.isFirstParty = isFirstParty;
      }
    }
  }
  
  return {
    firstParty: Array.from(new Set(firstParty)),
    thirdParty: Array.from(new Set(thirdParty)),
    hostInfo: hostInfo.sort((a, b) => b.eventCount - a.eventCount),
  };
}
