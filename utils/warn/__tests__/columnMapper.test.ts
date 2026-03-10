import { describe, expect, it } from 'vitest';
import { resolveColumnMap, mapRow } from '../columnMapper';
import type { ColumnMap } from '../columnMapper';

describe('columnMapper', () => {
  it('resolves Texas headers to correct column map', () => {
    const headers = [
      'NOTICE_DATE',
      'JOB_SITE_NAME',
      'COUNTY_NAME',
      'WDA_NAME',
      'TOTAL_LAYOFF_NUMBER',
      'LayOff_Date',
      'CITY_NAME',
    ];
    const { map, profileId } = resolveColumnMap(headers);
    expect(profileId).toBe('texas');
    expect(map.companyName).toBe('JOB_SITE_NAME');
    expect(map.city).toBe('CITY_NAME');
    expect(map.stateOrCounty).toBe('COUNTY_NAME');
    expect(map.layoffCount).toBe('TOTAL_LAYOFF_NUMBER');
    expect(map.layoffDate).toBe('LayOff_Date');
    expect(map.noticeDate).toBe('NOTICE_DATE');
  });

  it('maps a Texas-style row to NormalizedWarnRow', () => {
    const columnMap: ColumnMap = {
      companyName: 'JOB_SITE_NAME',
      city: 'CITY_NAME',
      stateOrCounty: 'COUNTY_NAME',
      layoffCount: 'TOTAL_LAYOFF_NUMBER',
      layoffDate: 'LayOff_Date',
      noticeDate: 'NOTICE_DATE',
    };
    const raw = {
      JOB_SITE_NAME: 'Amentum',
      CITY_NAME: 'New Boston',
      COUNTY_NAME: 'Bowie',
      TOTAL_LAYOFF_NUMBER: '178',
      LayOff_Date: '03/27/2022',
      NOTICE_DATE: '01/28/2022',
    };
    const row = mapRow(raw, columnMap, 'texas.csv');
    expect(row).not.toBeNull();
    expect(row!.companyName).toBe('Amentum');
    expect(row!.city).toBe('New Boston');
    expect(row!.stateOrCounty).toBe('Bowie');
    expect(row!.layoffCount).toBe(178);
    expect(row!.layoffDate).toBe('03/27/2022');
    expect(row!.noticeDate).toBe('01/28/2022');
    expect(row!.sourceFile).toBe('texas.csv');
  });

  it('returns null for row missing company name', () => {
    const columnMap: ColumnMap = { companyName: 'Company', layoffCount: 'Layoffs' };
    const raw = { Company: '', Layoffs: 10 };
    expect(mapRow(raw, columnMap, 'test.csv')).toBeNull();
  });

  it('uses generic alias map for Employer, City, State, Layoffs, Date', () => {
    const headers = ['Employer', 'City', 'State', 'Layoffs', 'Date'];
    const { map, profileId } = resolveColumnMap(headers);
    expect(profileId).toBe(null);
    expect(map.companyName).toBe('Employer');
    expect(map.city).toBe('City');
    expect(map.stateOrCounty).toBe('State');
    expect(map.layoffCount).toBe('Layoffs');
    expect(map.layoffDate).toBe('Date');
  });

  it('maps scraper-normalized WARN headers', () => {
    const headers = [
      'companyName',
      'city',
      'stateOrCounty',
      'layoffCount',
      'layoffDate',
      'noticeDate',
    ];
    const { map, profileId } = resolveColumnMap(headers);
    expect(profileId).toBe(null);
    expect(map.companyName).toBe('companyName');
    expect(map.city).toBe('city');
    expect(map.stateOrCounty).toBe('stateOrCounty');
    expect(map.layoffCount).toBe('layoffCount');
    expect(map.layoffDate).toBe('layoffDate');
    expect(map.noticeDate).toBe('noticeDate');
  });

  it('parses numeric layoff count from string', () => {
    const columnMap: ColumnMap = { companyName: 'Company', layoffCount: 'Count' };
    const row = mapRow({ Company: 'Acme', Count: '42' }, columnMap, 'test.csv');
    expect(row!.layoffCount).toBe(42);
  });
});
