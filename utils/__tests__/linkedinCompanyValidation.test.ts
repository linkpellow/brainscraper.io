import { describe, expect, it } from 'vitest';

import { filterLeadsByCompany, matchesCompanyName } from '@/utils/linkedinCompanyValidation';

describe('linkedin company validation', () => {
  it('matches normalized company names across punctuation and suffix differences', () => {
    expect(matchesCompanyName('SMBC MANUBANK', 'SMBC Manubank')).toBe(true);
    expect(matchesCompanyName('Acme, Inc.', 'Acme')).toBe(true);
    expect(matchesCompanyName('Different Company', 'Acme')).toBe(false);
  });

  it('post-filters leads by current company when helper filters fall back to keywords', () => {
    const leads = [
      {
        fullName: 'Right Match',
        currentPosition: {
          companyName: 'SMBC MANUBANK',
        },
      },
      {
        fullName: 'Wrong Match',
        currentPosition: {
          companyName: 'Other Bank',
        },
      },
    ];

    const { filtered, stats } = filterLeadsByCompany(leads, {
      currentCompany: 'SMBC Manubank',
    });

    expect(filtered).toEqual([leads[0]]);
    expect(stats).toMatchObject({
      total: 2,
      kept: 1,
      removed: 1,
      currentCompany: 'SMBC Manubank',
    });
  });
});
