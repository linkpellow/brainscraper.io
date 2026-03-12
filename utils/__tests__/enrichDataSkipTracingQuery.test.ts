import { describe, expect, it } from 'vitest';

import { buildSkipTracingCityStateZip } from '@/utils/enrichData';

describe('buildSkipTracingCityStateZip', () => {
  it('omits derived centroid ZIPs from skip-tracing queries', () => {
    expect(buildSkipTracingCityStateZip('Naples', 'FL', '33101', 'derived_city_state')).toBe('Naples, FL');
  });

  it('includes verified row ZIPs in skip-tracing queries', () => {
    expect(buildSkipTracingCityStateZip('Naples', 'FL', '34102', 'verified_row')).toBe('Naples, FL 34102');
  });

  it('includes verified skip-tracing ZIPs in skip-tracing queries', () => {
    expect(buildSkipTracingCityStateZip('Cape Coral', 'FL', '33904', 'verified_skip_trace')).toBe('Cape Coral, FL 33904');
  });

  it('returns empty string when city or state is missing', () => {
    expect(buildSkipTracingCityStateZip(null, 'FL', '33101', 'verified_row')).toBe('');
    expect(buildSkipTracingCityStateZip('Naples', null, '33101', 'verified_row')).toBe('');
  });
});
