import { describe, expect, it } from 'vitest';
import { ingestWarnFile } from '../ingestWarnFile';
import type { ParsedData } from '@/utils/parseFile';

describe('ingestWarnFile', () => {
  it('returns normalized rows for Texas-style data', () => {
    const data: ParsedData = {
      headers: ['JOB_SITE_NAME', 'CITY_NAME', 'COUNTY_NAME', 'TOTAL_LAYOFF_NUMBER', 'LayOff_Date', 'NOTICE_DATE'],
      rows: [
        {
          JOB_SITE_NAME: 'Amentum',
          CITY_NAME: 'New Boston',
          COUNTY_NAME: 'Bowie',
          TOTAL_LAYOFF_NUMBER: '178',
          LayOff_Date: '03/27/2022',
          NOTICE_DATE: '01/28/2022',
        },
      ],
      rowCount: 1,
      columnCount: 6,
    };
    const result = ingestWarnFile(data, 'texas.csv');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].companyName).toBe('Amentum');
    expect(result.rows[0].layoffCount).toBe(178);
    expect(result.profileId).toBe('texas');
  });

  it('skips rows without company name and adds warning', () => {
    const data: ParsedData = {
      headers: ['Company', 'City', 'Layoffs'],
      rows: [
        { Company: 'Acme', City: 'Austin', Layoffs: 10 },
        { Company: '', City: 'Dallas', Layoffs: 5 },
      ],
      rowCount: 2,
      columnCount: 3,
    };
    const result = ingestWarnFile(data, 'test.csv');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].companyName).toBe('Acme');
    expect(result.warnings.some((w) => w.includes('Skipped 1'))).toBe(true);
  });

  it('returns empty rows and warning when no headers', () => {
    const data: ParsedData = { headers: [], rows: [], rowCount: 0, columnCount: 0 };
    const result = ingestWarnFile(data, 'empty.csv');
    expect(result.rows).toHaveLength(0);
    expect(result.warnings).toContain('No headers in file');
  });

  it('infers sourceState from filename', () => {
    const data: ParsedData = {
      headers: ['Company', 'City', 'Number of Jobs Impacted'],
      rows: [{ Company: 'Test', City: 'Detroit', 'Number of Jobs Impacted': 5 }],
      rowCount: 1,
      columnCount: 3,
    };
    const result = ingestWarnFile(data, 'layoffs_2025_2026_michigan.csv');
    expect(result.rows[0].sourceState).toBe('MI');
  });
});
