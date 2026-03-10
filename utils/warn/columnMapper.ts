/**
 * Map raw parsed rows to NormalizedWarnRow using format profiles or generic aliases.
 */

import type { NormalizedWarnRow } from './normalizedSchema';
import { detectProfile, type FormatProfile, type NormalizedField } from './formatProfiles';

export type ColumnMap = Partial<Record<NormalizedField, string>>;

const normalizeHeader = (h: string) => h.trim().toLowerCase();

/** Generic alias map: normalized field → possible header names (first match wins). */
const genericAliases: Record<NormalizedField, string[]> = {
  companyName: [
    'employer',
    'company',
    'job site name',
    'job site',
    'business name',
    'business',
    'company name',
    'employer name',
  ],
  city: ['city', 'city name', 'location', 'job site city'],
  stateOrCounty: [
    'county',
    'state',
    'county name',
    'wda name',
    'region',
    'st',
    'state or county',
  ],
  layoffCount: [
    'number of jobs impacted',
    'total layoff number',
    'layoffs',
    'layoff count',
    'number affected',
    'jobs impacted',
    'total layoffs',
    'workers affected',
  ],
  layoffDate: [
    'layoff date',
    'layoff dates',
    'effective date',
    'closure date',
    'layoff_date',
    'date',
  ],
  noticeDate: [
    'notice date',
    'received date',
    'filed',
    'notice_date',
    'wfdd_received_date',
    'start date',
  ],
};

function findHeaderForField(
  headers: string[],
  candidates: string[],
  headerNormalizedSet: Map<string, string>
): string | null {
  for (const candidate of candidates) {
    const key = normalizeHeader(candidate);
    if (headerNormalizedSet.has(key)) return headerNormalizedSet.get(key)!;
  }
  return null;
}

/** Build column map from a format profile. */
function mapFromProfile(profile: FormatProfile, headers: string[]): ColumnMap {
  const headerNormalizedSet = new Map<string, string>();
  for (const h of headers) {
    headerNormalizedSet.set(normalizeHeader(h), h);
  }
  const columnMap: ColumnMap = {};
  const fields: NormalizedField[] = [
    'companyName',
    'city',
    'stateOrCounty',
    'layoffCount',
    'layoffDate',
    'noticeDate',
  ];
  for (const field of fields) {
    const source = findHeaderForField(
      headers,
      profile.headerMap[field] || [],
      headerNormalizedSet
    );
    if (source) columnMap[field] = source;
  }
  return columnMap;
}

/** Build column map from generic aliases when no profile matches. */
function mapFromGenericAliases(headers: string[]): ColumnMap {
  const headerNormalizedSet = new Map<string, string>();
  for (const h of headers) {
    headerNormalizedSet.set(normalizeHeader(h), h);
  }
  const columnMap: ColumnMap = {};
  const fields: NormalizedField[] = [
    'companyName',
    'city',
    'stateOrCounty',
    'layoffCount',
    'layoffDate',
    'noticeDate',
  ];
  for (const field of fields) {
    const source = findHeaderForField(
      headers,
      genericAliases[field] || [],
      headerNormalizedSet
    );
    if (source) columnMap[field] = source;
  }
  return columnMap;
}

function safeNumber(val: string | number | undefined | null): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number' && !Number.isNaN(val)) return val;
  const s = String(val).trim().replace(/,/g, '');
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? 0 : n;
}

function safeString(val: string | number | undefined | null): string {
  if (val === undefined || val === null) return '';
  return String(val).trim();
}

function safeDateString(val: string | number | undefined | null): string | null {
  const s = safeString(val);
  return s === '' ? null : s;
}

/**
 * Resolve column map: try known profiles first, then generic aliases.
 */
export function resolveColumnMap(headers: string[]): { map: ColumnMap; profileId: string | null } {
  const profile = detectProfile(headers);
  if (profile) {
    return { map: mapFromProfile(profile, headers), profileId: profile.id };
  }
  return { map: mapFromGenericAliases(headers), profileId: null };
}

/**
 * Map one raw row to NormalizedWarnRow. Missing companyName rows are skipped (return null).
 */
export function mapRow(
  rawRow: Record<string, string | number>,
  columnMap: ColumnMap,
  sourceFile: string,
  sourceState?: string,
  keepRaw?: boolean
): NormalizedWarnRow | null {
  const companyName = columnMap.companyName
    ? safeString(rawRow[columnMap.companyName])
    : '';
  if (!companyName) return null;

  const city = columnMap.city ? safeString(rawRow[columnMap.city]) : '';
  const stateOrCounty = columnMap.stateOrCounty
    ? safeString(rawRow[columnMap.stateOrCounty])
    : '';
  const layoffCount = columnMap.layoffCount
    ? safeNumber(rawRow[columnMap.layoffCount])
    : 0;
  const layoffDate = columnMap.layoffDate
    ? safeDateString(rawRow[columnMap.layoffDate])
    : null;
  const noticeDate = columnMap.noticeDate
    ? safeDateString(rawRow[columnMap.noticeDate])
    : null;

  const row: NormalizedWarnRow = {
    companyName,
    city,
    stateOrCounty,
    layoffCount,
    layoffDate,
    noticeDate,
    sourceFile,
    ...(sourceState ? { sourceState } : {}),
    ...(keepRaw ? { raw: { ...rawRow } } : {}),
  };
  return row;
}
