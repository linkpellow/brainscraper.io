const COMPANY_SUFFIXES = new Set([
  'inc',
  'incorporated',
  'llc',
  'llp',
  'lp',
  'ltd',
  'limited',
  'corp',
  'corporation',
  'co',
  'company',
  'pllc',
  'pc',
  'group',
  'holdings',
]);

export interface CompanyValidationStats {
  total: number;
  kept: number;
  removed: number;
  removalRate: number;
  currentCompany?: string;
  pastCompany?: string;
}

function normalizeCompanyName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(token => !COMPANY_SUFFIXES.has(token))
    .join(' ');
}

function isCompanyMatch(candidate: string, requested: string): boolean {
  const normalizedCandidate = normalizeCompanyName(candidate);
  const normalizedRequested = normalizeCompanyName(requested);

  if (!normalizedCandidate || !normalizedRequested) {
    return false;
  }

  if (
    normalizedCandidate === normalizedRequested ||
    normalizedCandidate.includes(normalizedRequested) ||
    normalizedRequested.includes(normalizedCandidate)
  ) {
    return true;
  }

  const candidateTokens = new Set(normalizedCandidate.split(' '));
  const requestedTokens = normalizedRequested.split(' ').filter(Boolean);
  const overlapCount = requestedTokens.filter(token => candidateTokens.has(token)).length;

  if (requestedTokens.length >= 2) {
    return overlapCount >= 2;
  }

  return overlapCount >= 1;
}

function pushIfString(target: string[], value: unknown): void {
  if (typeof value === 'string' && value.trim().length > 0) {
    target.push(value.trim());
  }
}

function extractCompaniesFromList(items: unknown): string[] {
  if (!Array.isArray(items)) {
    return [];
  }

  const companies: string[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const record = item as Record<string, unknown>;
    pushIfString(companies, record.companyName);
    pushIfString(companies, record.company);

    if (record.company && typeof record.company === 'object') {
      const nestedCompany = record.company as Record<string, unknown>;
      pushIfString(companies, nestedCompany.name);
      pushIfString(companies, nestedCompany.companyName);
    }

    if (record.companyUrnResolutionResult && typeof record.companyUrnResolutionResult === 'object') {
      pushIfString(
        companies,
        (record.companyUrnResolutionResult as Record<string, unknown>).name
      );
    }
  }

  return companies;
}

function extractLeadCompanyData(lead: unknown): { current: string[]; history: string[] } {
  if (!lead || typeof lead !== 'object') {
    return { current: [], history: [] };
  }

  const record = lead as Record<string, unknown>;
  const current: string[] = [];
  const history: string[] = [];

  pushIfString(current, record.companyName);
  pushIfString(current, record.currentCompany);

  if (record.currentPosition && typeof record.currentPosition === 'object') {
    const currentPosition = record.currentPosition as Record<string, unknown>;
    pushIfString(current, currentPosition.companyName);

    if (currentPosition.companyUrnResolutionResult && typeof currentPosition.companyUrnResolutionResult === 'object') {
      pushIfString(
        current,
        (currentPosition.companyUrnResolutionResult as Record<string, unknown>).name
      );
    }
  }

  history.push(...extractCompaniesFromList(record.currentPositions));
  history.push(...extractCompaniesFromList(record.positions));
  history.push(...extractCompaniesFromList(record.pastPositions));
  history.push(...extractCompaniesFromList(record.previousPositions));
  history.push(...extractCompaniesFromList(record.experience));
  history.push(...extractCompaniesFromList(record.experiences));

  return {
    current: Array.from(new Set(current)),
    history: Array.from(new Set([...current, ...history])),
  };
}

export function filterLeadsByCompany(
  leads: unknown[],
  options: { currentCompany?: string; pastCompany?: string }
): { filtered: unknown[]; stats: CompanyValidationStats } {
  const requestedCurrent = options.currentCompany?.trim();
  const requestedPast = options.pastCompany?.trim();

  if (!requestedCurrent && !requestedPast) {
    return {
      filtered: leads,
      stats: {
        total: leads.length,
        kept: leads.length,
        removed: 0,
        removalRate: 0,
      },
    };
  }

  const filtered = leads.filter(lead => {
    const companyData = extractLeadCompanyData(lead);

    if (requestedCurrent && !companyData.current.some(company => isCompanyMatch(company, requestedCurrent))) {
      return false;
    }

    if (requestedPast && !companyData.history.some(company => isCompanyMatch(company, requestedPast))) {
      return false;
    }

    return true;
  });

  return {
    filtered,
    stats: {
      total: leads.length,
      kept: filtered.length,
      removed: leads.length - filtered.length,
      removalRate: leads.length > 0 ? ((leads.length - filtered.length) / leads.length) * 100 : 0,
      currentCompany: requestedCurrent,
      pastCompany: requestedPast,
    },
  };
}

export function matchesCompanyName(candidate: string, requested: string): boolean {
  return isCompanyMatch(candidate, requested);
}
