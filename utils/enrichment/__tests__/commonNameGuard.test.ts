import { describe, expect, it } from 'vitest';

import {
  isAbbreviatedLastName,
  isCommonFirstName,
  isCommonName,
  shouldSkipEnrichmentForAbbreviatedLastName,
} from '@/utils/enrichment/commonNameGuard';

describe('commonNameGuard', () => {
  describe('isCommonFirstName', () => {
    it('returns true for common first names', () => {
      expect(isCommonFirstName('John')).toBe(true);
      expect(isCommonFirstName('john')).toBe(true);
      expect(isCommonFirstName('Mary')).toBe(true);
      expect(isCommonFirstName('Michael')).toBe(true);
    });

    it('returns false for uncommon first names', () => {
      expect(isCommonFirstName('Edgar')).toBe(false);
      expect(isCommonFirstName('Bahar')).toBe(false);
    });
  });

  describe('isAbbreviatedLastName', () => {
    it('returns true for 1–2 character last names', () => {
      expect(isAbbreviatedLastName('S')).toBe(true);
      expect(isAbbreviatedLastName('R')).toBe(true);
      expect(isAbbreviatedLastName('Jr')).toBe(true);
    });

    it('returns false for full last names', () => {
      expect(isAbbreviatedLastName('Smith')).toBe(false);
      expect(isAbbreviatedLastName('Rodriguez')).toBe(false);
    });
  });

  describe('shouldSkipEnrichmentForAbbreviatedLastName', () => {
    it('returns true for common first + abbreviated last (John S rule)', () => {
      expect(shouldSkipEnrichmentForAbbreviatedLastName('John', 'S')).toBe(true);
      expect(shouldSkipEnrichmentForAbbreviatedLastName('Mary', 'R')).toBe(true);
    });

    it('returns false when first name is uncommon', () => {
      expect(shouldSkipEnrichmentForAbbreviatedLastName('Edgar', 'R')).toBe(false);
      expect(shouldSkipEnrichmentForAbbreviatedLastName('Bahar', 'S')).toBe(false);
    });

    it('returns false when last name is not abbreviated', () => {
      expect(shouldSkipEnrichmentForAbbreviatedLastName('John', 'Smith')).toBe(false);
    });
  });

  describe('isCommonName', () => {
    it('returns true when both first and last are in common lists', () => {
      expect(isCommonName('John', 'Smith')).toBe(true);
    });

    it('returns false when last is abbreviated', () => {
      expect(isCommonName('John', 'S')).toBe(false);
    });
  });
});
