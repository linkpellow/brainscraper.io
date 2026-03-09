import { describe, expect, it } from 'vitest';

import { filterSkipTracingCandidates } from '@/utils/enrichment/skipTracingCandidateFilter';

describe('skip tracing candidate filter', () => {
  it('treats full state names and abbreviations as the same state', () => {
    const peopleDetails = [
      {
        Name: 'Daniela Grozeva',
        'Lives in': 'Cape Coral, FL',
        'Person ID': 'pl004ru6nu9lnn4ll9u2',
      },
    ];

    const result = filterSkipTracingCandidates(
      peopleDetails,
      'Daniela',
      'Grozeva',
      'Cape Coral',
      'Florida'
    );

    expect(result.disposition).toBe('clear_match');
    expect(result.survivors).toEqual([peopleDetails[0]]);
  });

  it('keeps the ambiguity block when multiple exact city/state matches survive', () => {
    const peopleDetails = [
      {
        Name: 'Shannon Carter',
        'Lives in': 'Tampa, FL',
        'Person ID': 'candidate-1',
      },
      {
        Name: 'Shannon Carter',
        'Lives in': 'Tampa, Florida',
        'Person ID': 'candidate-2',
      },
    ];

    const result = filterSkipTracingCandidates(
      peopleDetails,
      'Shannon',
      'Carter',
      'Tampa',
      'Florida'
    );

    expect(result.disposition).toBe('ambiguous');
    expect(result.survivors).toEqual(peopleDetails);
  });
});
