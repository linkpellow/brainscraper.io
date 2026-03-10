/**
 * Known WARN format profiles: state/agency-specific header → normalized field mapping.
 * First matching profile wins. Headers matched case-insensitive, trimmed.
 */

export type NormalizedField =
  | 'companyName'
  | 'city'
  | 'stateOrCounty'
  | 'layoffCount'
  | 'layoffDate'
  | 'noticeDate';

export type FormatProfile = {
  id: string;
  /** Optional label for UI (e.g. "Texas TWC", "Michigan") */
  label?: string;
  /** Map: normalized field → possible source header names (any match) */
  headerMap: Record<NormalizedField, string[]>;
  /** At least one of these headers must be present for this profile to match (avoids generic "Company"/"City" matching Texas first) */
  signatureHeaders?: string[];
};

function n(str: string): string {
  return str.trim().toLowerCase();
}

/** Returns true if file headers contain at least one header for companyName, layoffCount, at least one location, and (if defined) at least one signature header. */
export function profileMatchesHeaders(profile: FormatProfile, headers: string[]): boolean {
  const headerSet = new Set(headers.map((h) => n(h)));
  if (profile.signatureHeaders?.length) {
    const hasSignature = profile.signatureHeaders.some((s) => headerSet.has(n(s)));
    if (!hasSignature) return false;
  }
  const required: NormalizedField[] = ['companyName', 'layoffCount'];
  for (const field of required) {
    const aliases = profile.headerMap[field];
    if (!aliases?.length) return false;
    const found = aliases.some((a) => headerSet.has(n(a)));
    if (!found) return false;
  }
  const cityAliases = profile.headerMap['city'] || [];
  const countyAliases = profile.headerMap['stateOrCounty'] || [];
  const hasCity = cityAliases.some((a) => headerSet.has(n(a)));
  const hasCounty = countyAliases.some((a) => headerSet.has(n(a)));
  if (!hasCity && !hasCounty) return false;
  return true;
}

/** Texas TWC: JOB_SITE_NAME, CITY_NAME, COUNTY_NAME, TOTAL_LAYOFF_NUMBER, LayOff_Date, NOTICE_DATE */
export const profileTexas: FormatProfile = {
  id: 'texas',
  label: 'Texas TWC',
  signatureHeaders: ['JOB_SITE_NAME', 'CITY_NAME', 'COUNTY_NAME', 'WDA_NAME', 'TOTAL_LAYOFF_NUMBER'],
  headerMap: {
    companyName: ['JOB_SITE_NAME', 'Job Site Name', 'Employer', 'Company'],
    city: ['CITY_NAME', 'City', 'City Name'],
    stateOrCounty: ['COUNTY_NAME', 'WDA_NAME', 'County', 'WDA Name'],
    layoffCount: ['TOTAL_LAYOFF_NUMBER', 'Total Layoff Number', 'Number of Jobs Impacted'],
    layoffDate: ['LayOff_Date', 'Layoff_Date', 'Layoff Date', 'Layoff Dates'],
    noticeDate: ['NOTICE_DATE', 'WFDD_RECEIVED_DATE', 'Notice Date', 'Received Date'],
  },
};

/** Michigan: Company, City, County, Number of Jobs Impacted, Layoff Dates */
export const profileMichigan: FormatProfile = {
  id: 'michigan',
  label: 'Michigan',
  signatureHeaders: ['Type of Company Action', 'Layoff Dates', 'Number of Jobs Impacted'],
  headerMap: {
    companyName: ['Company', 'Employer', 'Job Site Name'],
    city: ['City', 'City Name'],
    stateOrCounty: ['County', 'State', 'County Name'],
    layoffCount: ['Number of Jobs Impacted', 'Total Layoff Number', 'Layoffs'],
    layoffDate: ['Layoff Dates', 'Layoff Date', 'Effective Date'],
    noticeDate: ['Notice Date', 'Received Date'],
  },
};

/** FL/TN style: Company, City, Start Date, Layoff Dates, Number of Jobs Impacted, Industry */
export const profileFlTn: FormatProfile = {
  id: 'fl-tn',
  label: 'Florida / Tennessee',
  signatureHeaders: ['Start Date', 'Industry'],
  headerMap: {
    companyName: ['Company', 'Employer', 'Job Site Name'],
    city: ['City', 'City Name'],
    stateOrCounty: ['County', 'State', 'Industry'],
    layoffCount: ['Number of Jobs Impacted', 'Total Layoff Number', 'Layoffs'],
    layoffDate: ['Layoff Dates', 'Layoff Date', 'Effective Date'],
    noticeDate: ['Start Date', 'Notice Date', 'Received Date'],
  },
};

/** Order matters: FL/TN before Michigan so "Start Date" / "Industry" match first. */
export const knownProfiles: FormatProfile[] = [profileTexas, profileFlTn, profileMichigan];

/** Find first profile that matches the given headers. */
export function detectProfile(headers: string[]): FormatProfile | null {
  for (const profile of knownProfiles) {
    if (profileMatchesHeaders(profile, headers)) return profile;
  }
  return null;
}
