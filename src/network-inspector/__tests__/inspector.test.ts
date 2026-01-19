/**
 * Tests for Network Inspector
 */

import { describe, it, expect } from 'vitest';
import { stripHash, normalizeHost, normalizePath, normalizeQuery, normalizedKey, bodyFingerprint } from '../normalize';
import { groupEvents, createEndpointSummary } from '../dedupe';
import { scoreEndpoint } from '../score';
import type { NetworkEvent, DedupeGroup } from '../types';

describe('URL Normalization', () => {
  it('should strip hash from URL', () => {
    expect(stripHash('https://example.com/path#hash')).toBe('https://example.com/path');
    expect(stripHash('https://example.com/path')).toBe('https://example.com/path');
  });

  it('should normalize host to lowercase', () => {
    expect(normalizeHost('EXAMPLE.COM')).toBe('example.com');
    expect(normalizeHost('Example.Com')).toBe('example.com');
  });

  it('should normalize path', () => {
    expect(normalizePath('/path/to/resource/')).toBe('/path/to/resource');
    expect(normalizePath('/path//to///resource')).toBe('/path/to/resource');
    expect(normalizePath('/')).toBe('/');
  });

  it('should drop noise params from query', () => {
    const query = {
      page: '1',
      _: '123456',
      ts: '1234567890',
      cacheBust: 'abc',
      limit: '10',
    };
    const normalized = normalizeQuery(query);
    expect(normalized._).toBeUndefined();
    expect(normalized.ts).toBeUndefined();
    expect(normalized.cacheBust).toBeUndefined();
    expect(normalized.page).toBe('*'); // Pagination param normalized
    expect(normalized.limit).toBe('*');
  });

  it('should generate consistent normalized keys', () => {
    const event1: NetworkEvent = {
      ts: 1000,
      method: 'GET',
      url: 'https://api.example.com/users?page=1&limit=10',
      path: '/users',
      host: 'api.example.com',
      query: { page: '1', limit: '10' },
      reqHeaders: {},
      reqCookies: {},
    };

    const event2: NetworkEvent = {
      ts: 2000,
      method: 'GET',
      url: 'https://api.example.com/users?page=2&limit=10',
      path: '/users',
      host: 'api.example.com',
      query: { page: '2', limit: '10' },
      reqHeaders: {},
      reqCookies: {},
    };

    const key1 = normalizedKey(event1);
    const key2 = normalizedKey(event2);

    // Should be the same after normalization (pagination params normalized to *)
    expect(key1).toBe(key2);
  });
});

describe('Body Fingerprinting', () => {
  it('should generate fingerprint for JSON body', () => {
    const event: NetworkEvent = {
      ts: 1000,
      method: 'POST',
      url: 'https://api.example.com/users',
      path: '/users',
      host: 'api.example.com',
      query: {},
      reqHeaders: { 'content-type': 'application/json' },
      reqCookies: {},
      reqBodyText: JSON.stringify({ name: 'John', email: 'john@example.com', timestamp: 1234567890 }),
      reqBodyMime: 'application/json',
    };

    const fingerprint = bodyFingerprint(event);
    expect(fingerprint).toBeDefined();
    expect(fingerprint?.length).toBe(16);
  });

  it('should remove nonce-like keys from fingerprint', () => {
    const event1: NetworkEvent = {
      ts: 1000,
      method: 'POST',
      url: 'https://api.example.com/users',
      path: '/users',
      host: 'api.example.com',
      query: {},
      reqHeaders: {},
      reqCookies: {},
      reqBodyText: JSON.stringify({ name: 'John', timestamp: 1234567890 }),
      reqBodyMime: 'application/json',
    };

    const event2: NetworkEvent = {
      ts: 2000,
      method: 'POST',
      url: 'https://api.example.com/users',
      path: '/users',
      host: 'api.example.com',
      query: {},
      reqHeaders: {},
      reqCookies: {},
      reqBodyText: JSON.stringify({ name: 'John', timestamp: 9876543210 }),
      reqBodyMime: 'application/json',
    };

    const fp1 = bodyFingerprint(event1);
    const fp2 = bodyFingerprint(event2);

    // Should be the same (timestamp removed)
    expect(fp1).toBe(fp2);
  });
});

describe('Deduplication', () => {
  it('should group events by normalized key', () => {
    const events: NetworkEvent[] = [
      {
        ts: 1000,
        method: 'GET',
        url: 'https://api.example.com/users?page=1',
        path: '/users',
        host: 'api.example.com',
        query: { page: '1' },
        reqHeaders: {},
        reqCookies: {},
      },
      {
        ts: 2000,
        method: 'GET',
        url: 'https://api.example.com/users?page=2',
        path: '/users',
        host: 'api.example.com',
        query: { page: '2' },
        reqHeaders: {},
        reqCookies: {},
      },
      {
        ts: 3000,
        method: 'POST',
        url: 'https://api.example.com/users',
        path: '/users',
        host: 'api.example.com',
        query: {},
        reqHeaders: {},
        reqCookies: {},
      },
    ];

    const groups = groupEvents(events);
    expect(groups.length).toBe(2); // GET /users and POST /users
  });

  it('should create endpoint summary with statistics', () => {
    const events: NetworkEvent[] = [
      {
        ts: 1000,
        method: 'GET',
        url: 'https://api.example.com/users',
        path: '/users',
        host: 'api.example.com',
        query: {},
        reqHeaders: {},
        reqCookies: {},
        status: 200,
        resMime: 'application/json',
        resSize: 1024,
      },
      {
        ts: 2000,
        method: 'GET',
        url: 'https://api.example.com/users',
        path: '/users',
        host: 'api.example.com',
        query: {},
        reqHeaders: {},
        reqCookies: {},
        status: 200,
        resMime: 'application/json',
        resSize: 2048,
      },
    ];

    const groups = groupEvents(events);
    const summary = createEndpointSummary(groups[0]);

    expect(summary.count).toBe(2);
    expect(summary.statuses['200']).toBe(2);
    expect(summary.resMimeTop).toBe('application/json');
    expect(summary.resSizeAvg).toBe(1536); // (1024 + 2048) / 2
  });
});

describe('Scoring', () => {
  it('should score JSON endpoint higher', () => {
    const events: NetworkEvent[] = [
      {
        ts: 1000,
        method: 'GET',
        url: 'https://api.example.com/users',
        path: '/users',
        host: 'api.example.com',
        query: {},
        reqHeaders: {},
        reqCookies: {},
        status: 200,
        resMime: 'application/json',
        resSize: 5000,
      },
    ];

    const group: DedupeGroup = {
      key: 'GET api.example.com/users',
      events,
      queryShape: '',
    };

    const summary = createEndpointSummary(group);
    const score = scoreEndpoint(group, summary, events);

    expect(score).toBeGreaterThan(25); // At least JSON bonus
  });

  it('should score auth endpoint higher', () => {
    const events: NetworkEvent[] = [
      {
        ts: 1000,
        method: 'POST',
        url: 'https://api.example.com/login',
        path: '/login',
        host: 'api.example.com',
        query: {},
        reqHeaders: { authorization: 'Bearer token123' },
        reqCookies: {},
        status: 200,
        resMime: 'application/json',
        resSize: 2000,
      },
    ];

    const group: DedupeGroup = {
      key: 'POST api.example.com/login',
      events,
      queryShape: '',
    };

    const summary = createEndpointSummary(group);
    const score = scoreEndpoint(group, summary, events);

    // Should have: JSON (25) + Auth (20) + POST (15) = 60+
    expect(score).toBeGreaterThan(60);
  });

  it('should penalize polling-like endpoints', () => {
    const events: NetworkEvent[] = Array.from({ length: 20 }, (_, i) => ({
      ts: 1000 + i * 1000,
      method: 'GET',
      url: 'https://api.example.com/poll',
      path: '/poll',
      host: 'api.example.com',
      query: {},
      reqHeaders: {},
      reqCookies: {},
      status: 200,
      resMime: 'text/plain',
      resSize: 100, // Tiny response
    }));

    const group: DedupeGroup = {
      key: 'GET api.example.com/poll',
      events,
      queryShape: '',
    };

    const summary = createEndpointSummary(group);
    const score = scoreEndpoint(group, summary, events);

    // Should be penalized for polling pattern (score clamped to 0-100, so 0 is the minimum)
    expect(score).toBeLessThanOrEqual(0);
  });
});

import { classifyPhase, findActionTag, detectPollingLoop, calculatePhaseDistribution } from '../phase';

describe('Phase Detection', () => {
  it('should classify page_load phase correctly', () => {
    const sessionStart = 1000;
    const eventTs = sessionStart + 2000; // Within 4 seconds

    const phase = classifyPhase(eventTs, sessionStart, []);
    expect(phase).toBe('page_load');
  });

  it('should classify interaction phase when in action window', () => {
    const sessionStart = 1000;
    const actionWindows = [
      { label: 'search_click', startTs: 5000, endTs: 7000 }
    ];
    const eventTs = 6000; // Within action window

    const phase = classifyPhase(eventTs, sessionStart, actionWindows);
    expect(phase).toBe('interaction');
  });

  it('should classify background phase for events after page load', () => {
    const sessionStart = 1000;
    const eventTs = sessionStart + 5000; // After 4 seconds, no action window

    const phase = classifyPhase(eventTs, sessionStart, []);
    expect(phase).toBe('background');
  });

  it('should find action tag for events in action window', () => {
    const actionWindows = [
      { label: 'search_click', startTs: 5000, endTs: 7000 },
      { label: 'submit_form', startTs: 8000, endTs: 10000 }
    ];

    expect(findActionTag(6000, actionWindows)).toBe('search_click');
    expect(findActionTag(9000, actionWindows)).toBe('submit_form');
    expect(findActionTag(12000, actionWindows)).toBeUndefined();
  });

  it('should detect polling loops in background events', () => {
    // Create events with consistent intervals (polling pattern)
    const events = Array.from({ length: 10 }, (_, i) => ({
      ts: 10000 + i * 5000, // Every 5 seconds
      phase: 'background' as const
    }));

    expect(detectPollingLoop(events)).toBe(true);
  });

  it('should not detect polling loops with inconsistent intervals', () => {
    // Create events with random intervals
    const events = [
      { ts: 10000, phase: 'background' as const },
      { ts: 15000, phase: 'background' as const },
      { ts: 25000, phase: 'background' as const },
      { ts: 40000, phase: 'background' as const },
      { ts: 60000, phase: 'background' as const },
    ];

    expect(detectPollingLoop(events)).toBe(false);
  });

  it('should calculate phase distribution correctly', () => {
    
    const events = [
      { phase: 'page_load' as const },
      { phase: 'page_load' as const },
      { phase: 'interaction' as const },
      { phase: 'interaction' as const },
      { phase: 'interaction' as const },
      { phase: 'background' as const },
      { phase: 'background' as const },
      { phase: 'background' as const },
      { phase: 'background' as const },
    ];

    const distribution = calculatePhaseDistribution(events);
    expect(distribution.page_load).toBe(2);
    expect(distribution.interaction).toBe(3);
    expect(distribution.background).toBe(4);
  });
});

describe('Phase-Aware Scoring', () => {
  it('should score interaction-phase endpoints higher', () => {
    const events: NetworkEvent[] = [
      {
        ts: 5000,
        method: 'POST',
        url: 'https://api.example.com/search',
        path: '/search',
        host: 'api.example.com',
        query: {},
        reqHeaders: {},
        reqCookies: {},
        status: 200,
        resMime: 'application/json',
        resSize: 5000,
        phase: 'interaction',
        actionTag: 'search_click',
      },
    ];

    const group: DedupeGroup = {
      key: 'POST api.example.com/search',
      events,
      queryShape: '',
    };

    const summary = createEndpointSummary(group);
    const score = scoreEndpoint(group, summary, events);

    // Should have interaction bonus (+15) and actionTag bonus (+5)
    expect(score).toBeGreaterThan(40); // At least JSON (25) + interaction (15) + actionTag (5)
  });

  it('should penalize background polling endpoints', () => {
    const events: NetworkEvent[] = Array.from({ length: 10 }, (_, i) => ({
      ts: 10000 + i * 5000,
      method: 'GET',
      url: 'https://api.example.com/poll',
      path: '/poll',
      host: 'api.example.com',
      query: {},
      reqHeaders: {},
      reqCookies: {},
      status: 200,
      resMime: 'text/plain',
      resSize: 100,
      phase: 'background' as const,
    }));

    const group: DedupeGroup = {
      key: 'GET api.example.com/poll',
      events,
      queryShape: '',
    };

    const summary = createEndpointSummary(group);
    const score = scoreEndpoint(group, summary, events);

    // Should be penalized for background polling (-20) and polling loop (-10)
    // Score is clamped to 0-100, so 0 is the minimum
    expect(score).toBeLessThanOrEqual(0);
  });
});
