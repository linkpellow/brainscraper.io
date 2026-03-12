import { describe, expect, it } from 'vitest';

import {
  filterSkipTracingCandidates,
  rankCandidatesByLocationMatch,
  getSurvivorStates,
} from '@/utils/enrichment/skipTracingCandidateFilter';

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
    expect(result.matchType).toBe('exact_location');
  });

  it('returns state_only matchType when state matches but no city', () => {
    const peopleDetails = [
      {
        Name: 'John Smith',
        'Lives in': 'Dallas, TX',
        'Person ID': 'js-1',
      },
    ];
    const result = filterSkipTracingCandidates(
      peopleDetails,
      'John',
      'Smith',
      undefined,
      'TX'
    );
    expect(result.disposition).toBe('clear_match');
    expect(result.matchType).toBe('state_only');
  });

  it('returns initial_last when state-only match and last name is initial', () => {
    const peopleDetails = [
      {
        Name: 'Edgar Rodriguez',
        'Lives in': 'Dallas, TX',
        'Person ID': 'er-1',
      },
    ];
    const result = filterSkipTracingCandidates(
      peopleDetails,
      'Edgar',
      'R',
      undefined,
      'TX'
    );
    expect(result.disposition).toBe('clear_match');
    expect(result.matchType).toBe('initial_last');
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

  it('matches initial last name to candidate last name (R -> Rodriguez)', () => {
    const peopleDetails = [
      {
        Name: 'Edgar Rodriguez',
        'Lives in': 'Dallas, TX',
        'Person ID': 'edgar-r',
      },
    ];

    const result = filterSkipTracingCandidates(
      peopleDetails,
      'Edgar',
      'R',
      'Dallas',
      'TX'
    );

    expect(result.disposition).toBe('clear_match');
    expect(result.survivors).toEqual(peopleDetails);
    expect(result.matchType).toBe('exact_location');
  });

  it('fuzzy city: St. Louis and Saint Louis match', () => {
    const peopleDetails = [
      {
        Name: 'Jane Doe',
        'Lives in': 'Saint Louis, MO',
        'Person ID': 'jane-1',
      },
    ];

    const result = filterSkipTracingCandidates(
      peopleDetails,
      'Jane',
      'Doe',
      'St. Louis',
      'MO'
    );

    expect(result.disposition).toBe('clear_match');
    expect(result.survivors).toEqual(peopleDetails);
    expect(result.matchType).toBe('exact_location');
  });

  it('name-only fallback: strict gives 0, name-only gives 1 -> clear_match', () => {
    const peopleDetails = [
      {
        Name: 'Alex Chen',
        'Lives in': 'Austin, TX',
        'Person ID': 'alex-1',
      },
    ];

    const result = filterSkipTracingCandidates(
      peopleDetails,
      'Alex',
      'Chen',
      'Houston',
      'TX'
    );

    expect(result.disposition).toBe('clear_match');
    expect(result.survivors).toEqual(peopleDetails);
    expect(result.matchType).toBe('name_only');
  });

  describe('rankCandidatesByLocationMatch', () => {
    it('puts city+state match first, then state-only', () => {
      const survivors = [
        { Name: 'Jane Doe', 'Lives in': 'Orlando, FL', 'Person ID': 'j1' },
        { Name: 'Jane Doe', 'Lives in': 'Tampa, FL', 'Person ID': 'j2' },
      ];
      const ranked = rankCandidatesByLocationMatch(survivors, 'Orlando', 'FL');
      expect(ranked).toHaveLength(2);
      expect(ranked[0]['Person ID']).toBe('j1');
      expect(ranked[1]['Person ID']).toBe('j2');
    });

    it('returns same order when no location requested', () => {
      const survivors = [
        { Name: 'A B', 'Lives in': 'Austin, TX', 'Person ID': '1' },
        { Name: 'A B', 'Lives in': 'Dallas, TX', 'Person ID': '2' },
      ];
      const ranked = rankCandidatesByLocationMatch(survivors);
      expect(ranked).toHaveLength(2);
    });
  });

  describe('getSurvivorStates', () => {
    it('returns distinct states from survivors', () => {
      const survivors = [
        { Name: 'John Smith', 'Lives in': 'Austin, TX', 'Person ID': '1' },
        { Name: 'John Smith', 'Lives in': 'Denver, CO', 'Person ID': '2' },
      ];
      const states = getSurvivorStates(survivors);
      expect(states.size).toBe(2);
      expect(states.has('TX')).toBe(true);
      expect(states.has('CO')).toBe(true);
    });

    it('returns one state when all in same state', () => {
      const survivors = [
        { Name: 'Jane Doe', 'Lives in': 'Tampa, FL', 'Person ID': '1' },
        { Name: 'Jane Doe', 'Lives in': 'Orlando, FL', 'Person ID': '2' },
      ];
      const states = getSurvivorStates(survivors);
      expect(states.size).toBe(1);
      expect(states.has('FL')).toBe(true);
    });
  });
});
