/**
 * Cookie Jar Timeline Extractor
 * 
 * Builds an auditable timeline of cookies: who set them, who uses them
 */

import type { RequestEvent, CookieTimelineEntry } from './types';

/**
 * Build cookie jar timeline from events
 */
export function buildCookieJarTimeline(events: RequestEvent[]): CookieTimelineEntry[] {
  const cookieMap = new Map<string, CookieTimelineEntry>();
  
  for (const event of events) {
    // Process response cookies (Set-Cookie) - these are the cookie "mints"
    for (const cookie of event.responseCookies) {
      const key = `${cookie.name}:${cookie.domain || event.host}:${cookie.path || '/'}`;
      
      let entry = cookieMap.get(key);
      
      if (!entry) {
        // New cookie - create timeline entry
        entry = {
          cookieName: cookie.name,
          value: cookie.value,
          domain: cookie.domain || event.host,
          path: cookie.path || '/',
          expires: cookie.expires,
          maxAge: cookie.maxAge,
          secure: cookie.secure || false,
          httpOnly: cookie.httpOnly || false,
          sameSite: cookie.sameSite,
          firstSeenAtEventId: event.id,
          setByUrl: event.url,
          subsequentlySentInEventIds: [],
          versions: [{
            value: cookie.value,
            setAtEventId: event.id,
            setByUrl: event.url,
            expires: cookie.expires,
          }],
        };
        cookieMap.set(key, entry);
      } else {
        // Cookie already exists - check if value changed
        if (entry.value !== cookie.value) {
          // New version of cookie
          entry.versions.push({
            value: cookie.value,
            setAtEventId: event.id,
            setByUrl: event.url,
            expires: cookie.expires,
          });
          entry.value = cookie.value; // Update current value
        }
        
        // Update metadata if this is a newer set
        if (!entry.setByUrl || event.startedDateTime > events.find(e => e.id === entry.firstSeenAtEventId)?.startedDateTime || '') {
          entry.setByUrl = event.url;
        }
      }
    }
    
    // Process request cookies - track which endpoints use which cookies
    for (const cookie of event.requestCookies) {
      const key = `${cookie.name}:${cookie.domain || event.host}:${cookie.path || '/'}`;
      const entry = cookieMap.get(key);
      
      if (entry) {
        // This cookie was set earlier and is now being used
        if (!entry.subsequentlySentInEventIds.includes(event.id)) {
          entry.subsequentlySentInEventIds.push(event.id);
        }
      } else {
        // Cookie used but never seen in Set-Cookie (might be from browser storage)
        // Create entry anyway for completeness
        const newKey = `${cookie.name}:${cookie.domain || event.host}:${cookie.path || '/'}`;
        if (!cookieMap.has(newKey)) {
          cookieMap.set(newKey, {
            cookieName: cookie.name,
            value: cookie.value,
            domain: cookie.domain || event.host,
            path: cookie.path || '/',
            expires: cookie.expires,
            maxAge: cookie.maxAge,
            secure: cookie.secure || false,
            httpOnly: cookie.httpOnly || false,
            sameSite: cookie.sameSite,
            firstSeenAtEventId: event.id,
            setByUrl: 'unknown', // Not set by any endpoint in this HAR
            subsequentlySentInEventIds: [],
            versions: [{
              value: cookie.value,
              setAtEventId: event.id,
              setByUrl: 'unknown',
              expires: cookie.expires,
            }],
          });
        }
      }
    }
  }
  
  return Array.from(cookieMap.values());
}
