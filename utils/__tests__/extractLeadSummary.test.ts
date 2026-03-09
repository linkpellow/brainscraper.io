import { extractLeadSummary } from '@/utils/extractLeadSummary';
import type { EnrichedRow, EnrichmentResult } from '@/utils/enrichData';

describe('extractLeadSummary', () => {
  it('preserves zip provenance and review metadata for ambiguous skip-tracing failures', () => {
    const row: EnrichedRow = {
      Name: 'Shannon Carter',
      City: 'Tampa',
      State: 'FL',
      'LinkedIn URL': 'https://www.linkedin.com/in/shannon-carter',
    };

    const enriched: EnrichmentResult = {
      zipCode: '33602',
      zipProvenance: 'derived_city_state',
      skipTracingDisposition: 'ambiguous',
      error: 'Gatekeep failed: Ambiguous skip-tracing match',
    };

    const summary = extractLeadSummary(row, enriched);

    expect(summary.zipcode).toBe('33602');
    expect(summary.zipProvenance).toBe('derived_city_state');
    expect(summary.skipTracingDisposition).toBe('ambiguous');
    expect(summary.enrichmentStopReason).toBe('Ambiguous skip-tracing match');
    expect(summary.reviewBucket).toBe('ambiguous_identity');
  });

  it('does not assign a review bucket to successfully matched leads', () => {
    const row: EnrichedRow = {
      Name: 'Daniela Grozeva',
      City: 'Cape Coral',
      State: 'FL',
      Phone: '2023447353',
      'LinkedIn URL': 'https://www.linkedin.com/in/daniela-grozeva',
    };

    const enriched: EnrichmentResult = {
      phone: '2023447353',
      zipCode: '33904',
      zipProvenance: 'verified_skip_trace',
      skipTracingDisposition: 'clear_match',
      lineType: 'mobile',
      carrierName: 'Verizon Wireless',
    };

    const summary = extractLeadSummary(row, enriched);

    expect(summary.phone).toBe('2023447353');
    expect(summary.zipProvenance).toBe('verified_skip_trace');
    expect(summary.skipTracingDisposition).toBe('clear_match');
    expect(summary.enrichmentStopReason).toBeUndefined();
    expect(summary.reviewBucket).toBeUndefined();
  });
});
