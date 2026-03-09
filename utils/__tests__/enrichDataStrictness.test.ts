import { describe, expect, it, afterEach } from 'vitest';

import { getStrictness } from '@/utils/enrichData';

describe('getStrictness', () => {
  const origEnv = process.env.ENRICHMENT_STRICTNESS;

  afterEach(() => {
    if (origEnv !== undefined) {
      process.env.ENRICHMENT_STRICTNESS = origEnv;
    } else {
      delete process.env.ENRICHMENT_STRICTNESS;
    }
  });

  it('defaults to strict when no options and no env', () => {
    delete process.env.ENRICHMENT_STRICTNESS;
    expect(getStrictness()).toBe('strict');
    expect(getStrictness(undefined)).toBe('strict');
  });

  it('uses options.strictness when provided', () => {
    expect(getStrictness({ strictness: 'balanced' })).toBe('balanced');
    expect(getStrictness({ strictness: 'volume' })).toBe('volume');
    expect(getStrictness({ strictness: 'strict' })).toBe('strict');
  });

  it('uses env when options not provided', () => {
    process.env.ENRICHMENT_STRICTNESS = 'balanced';
    expect(getStrictness()).toBe('balanced');
    process.env.ENRICHMENT_STRICTNESS = 'volume';
    expect(getStrictness()).toBe('volume');
  });

  it('options override env', () => {
    process.env.ENRICHMENT_STRICTNESS = 'volume';
    expect(getStrictness({ strictness: 'strict' })).toBe('strict');
  });

  it('invalid env falls back to strict', () => {
    process.env.ENRICHMENT_STRICTNESS = 'invalid';
    expect(getStrictness()).toBe('strict');
    process.env.ENRICHMENT_STRICTNESS = 'BALANCED'; // normalized to lowercase
    expect(getStrictness()).toBe('balanced');
  });
});
