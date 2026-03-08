import { describe, expect, it } from 'vitest';

import {
  addStationWithDependencies,
  normalizeStationConfig,
  removeStationWithDependents,
  type EnrichmentStation,
} from '@/utils/enrichmentStations';

describe('enrichment station normalization', () => {
  it('adds required dependencies when enabling age enrichment', () => {
    const stations = addStationWithDependencies(new Set<EnrichmentStation>(['linkedin']), 'age');

    expect(Array.from(stations).sort()).toEqual([
      'age',
      'dnc-check',
      'gatekeep',
      'linkedin',
      'phone-discovery',
      'telnyx',
    ]);
  });

  it('removes downstream dependents when disabling phone discovery', () => {
    const stations = removeStationWithDependents(
      new Set<EnrichmentStation>([
        'linkedin',
        'zip',
        'income-pre-qual',
        'phone-discovery',
        'telnyx',
        'gatekeep',
        'dnc-check',
        'age',
      ]),
      'phone-discovery'
    );

    expect(Array.from(stations).sort()).toEqual([
      'income-pre-qual',
      'linkedin',
      'zip',
    ]);
  });

  it('drops invalid downstream stations during runtime normalization', () => {
    const normalized = normalizeStationConfig(
      new Set<EnrichmentStation>(['linkedin', 'age'])
    );

    expect(Array.from(normalized.stations)).toEqual(['linkedin']);
    expect(normalized.issues).toEqual([
      {
        station: 'age',
        missingDependencies: ['phone-discovery', 'gatekeep', 'dnc-check'],
      },
    ]);
  });

  it('maps legacy skip-tracing ids to phone-discovery at runtime', () => {
    const normalized = normalizeStationConfig(['skip-tracing', 'telnyx']);

    expect(Array.from(normalized.stations).sort()).toEqual([
      'linkedin',
      'phone-discovery',
      'telnyx',
    ]);
  });
});
