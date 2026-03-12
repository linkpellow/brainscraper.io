import { describe, expect, it } from 'vitest';

import { parseFreezeDurationSeconds } from '@/utils/linkedinFreezeGuard';

describe('linkedin freeze guard parser', () => {
  it('parses minutes from provider freeze messages', () => {
    expect(
      parseFreezeDurationSeconds('The sales navigator account system selected for you is frozen for 60 mins due to too many requests')
    ).toBe(3600);
  });

  it('parses hours from provider freeze messages', () => {
    expect(parseFreezeDurationSeconds('Account frozen for 2 hours')).toBe(7200);
  });

  it('falls back to one hour when no duration is present', () => {
    expect(parseFreezeDurationSeconds('Account is frozen. Please try later.')).toBe(3600);
  });
});

