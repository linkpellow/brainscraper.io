import { describe, expect, it } from 'vitest';
import { profileMatchesHeaders, detectProfile, profileTexas, profileMichigan, profileFlTn } from '../formatProfiles';

describe('formatProfiles', () => {
  it('Texas profile matches Texas CSV headers', () => {
    const headers = [
      'NOTICE_DATE',
      'JOB_SITE_NAME',
      'COUNTY_NAME',
      'WDA_NAME',
      'TOTAL_LAYOFF_NUMBER',
      'LayOff_Date',
      'WFDD_RECEIVED_DATE',
      'CITY_NAME',
    ];
    expect(profileMatchesHeaders(profileTexas, headers)).toBe(true);
    expect(detectProfile(headers)?.id).toBe('texas');
  });

  it('Michigan profile matches Michigan CSV headers', () => {
    const headers = [
      'Company',
      'Type of Company Action',
      'City',
      'County',
      'Layoff Dates',
      'Number of Jobs Impacted',
    ];
    expect(profileMatchesHeaders(profileMichigan, headers)).toBe(true);
    expect(detectProfile(headers)?.id).toBe('michigan');
  });

  it('FL/TN profile matches FL/TN CSV headers', () => {
    const headers = ['Company', 'City', 'Start Date', 'Layoff Dates', 'Number of Jobs Impacted', 'Industry'];
    expect(profileMatchesHeaders(profileFlTn, headers)).toBe(true);
    expect(detectProfile(headers)?.id).toBe('fl-tn');
  });

  it('returns null when no profile matches', () => {
    const headers = ['Foo', 'Bar', 'Baz'];
    expect(detectProfile(headers)).toBe(null);
  });

  it('matches headers case-insensitively', () => {
    const headers = ['job_site_name', 'city_name', 'county_name', 'total_layoff_number'];
    expect(profileMatchesHeaders(profileTexas, headers)).toBe(true);
  });
});
