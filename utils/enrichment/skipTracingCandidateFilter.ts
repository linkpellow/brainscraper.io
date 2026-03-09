/**
 * Deterministic filter for skip-tracing PeopleDetails.
 * Relaxed behavior: initial-based name match (e.g. "R" matches "Rodriguez"), fuzzy city
 * (St/Saint, Ft/Fort), and name-only fallback when strict match gives 0 and name-only gives 1.
 * 0 or 2+ survivors = no spend; exactly 1 = clear_match.
 */

import { quickNormalize } from '../nameNormalization';
import { normalizeUsStateCode } from '../usState';

export type SkipTracingFilterDisposition = 'clear_match' | 'ambiguous' | 'no_exact_match';

export type SkipTracingMatchType = 'exact_location' | 'state_only' | 'name_only' | 'initial_last';

export interface FilterResult {
  survivors: any[];
  disposition: SkipTracingFilterDisposition;
  matchType?: SkipTracingMatchType;
}

function normalizeForCompare(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Fuzzy city: St/Saint, Ft/Fort so "St. Louis" and "Saint Louis" match. */
function normalizeCityForCompare(city: string): string {
  const base = normalizeForCompare(city);
  if (!base) return base;
  const tokens = base.split(/\s+/).map((t) => {
    if (t === 'st') return 'saint';
    if (t === 'ft') return 'fort';
    return t;
  });
  return tokens.join(' ');
}

/** Initial-aware: if requested has length <= 2, match when candidate starts with it; else exact. */
function namePartMatches(requested: string, candidatePart: string): boolean {
  const req = normalizeForCompare(requested);
  const cand = normalizeForCompare(candidatePart);
  if (!req) return !cand;
  if (req.length <= 2) return cand.length >= req.length && cand.startsWith(req);
  return cand === req;
}

function parseLivesIn(livesIn: string | undefined): { city: string; state: string } {
  if (!livesIn || typeof livesIn !== 'string') return { city: '', state: '' };
  const parts = livesIn.split(',').map((p) => p.trim());
  if (parts.length < 2) return { city: normalizeForCompare(parts[0] || ''), state: '' };
  const statePart = parts[parts.length - 1];
  const state = normalizeUsStateCode(statePart);
  const city = parts.slice(0, -1).join(' ');
  return { city: normalizeForCompare(city), state };
}

function normalizeState(state: string | undefined): string {
  return normalizeUsStateCode(state);
}

/**
 * Filter PeopleDetails to exact normalized first/last name match and optional city/state.
 * Returns 0, 1, or 2+ survivors and disposition.
 */
export function filterSkipTracingCandidates(
  peopleDetails: any[],
  requestedFirstName: string,
  requestedLastName: string,
  city?: string,
  state?: string
): FilterResult {
  if (!peopleDetails || peopleDetails.length === 0) {
    return { survivors: [], disposition: 'no_exact_match' };
  }

  const reqFirst = normalizeForCompare(requestedFirstName);
  const reqLast = normalizeForCompare(requestedLastName);
  const reqCity = city ? normalizeCityForCompare(city) : '';
  const reqState = state ? normalizeState(state) : '';

  const hasInitialName = reqFirst.length <= 2 || reqLast.length <= 2;
  const survivors = peopleDetails.filter((p) => {
    const nameRaw = p.Name || p.name || '';
    const { firstName: candFirst, lastName: candLast } = quickNormalize(nameRaw);
    if (!namePartMatches(requestedLastName, candLast)) return false;
    if (!namePartMatches(requestedFirstName, candFirst)) return false;

    const livesIn = p['Lives in'] || p.livesIn || '';
    const { city: candCityRaw, state: candState } = parseLivesIn(livesIn);
    const candCity = candCityRaw ? normalizeCityForCompare(candCityRaw) : '';

    if (reqState && candState !== reqState) return false;
    if (reqCity && candCity !== reqCity) return false;

    return true;
  });

  if (survivors.length > 1) return { survivors, disposition: 'ambiguous' };
  if (survivors.length === 1) {
    const hasLocation = !!(reqCity && reqState);
    const hasStateOnly = !!reqState && !reqCity;
    let matchType: SkipTracingMatchType;
    if (hasLocation) matchType = 'exact_location';
    else if (hasStateOnly && hasInitialName) matchType = 'initial_last';
    else if (hasStateOnly) matchType = 'state_only';
    else if (hasInitialName) matchType = 'initial_last';
    else matchType = 'name_only';
    return { survivors, disposition: 'clear_match', matchType };
  }

  // Fallback: strict (name+location) gave 0; try name-only. If exactly 1, use it.
  const nameOnlySurvivors = peopleDetails.filter((p) => {
    const nameRaw = p.Name || p.name || '';
    const { firstName: candFirst, lastName: candLast } = quickNormalize(nameRaw);
    return namePartMatches(requestedLastName, candLast) && namePartMatches(requestedFirstName, candFirst);
  });

  if (nameOnlySurvivors.length === 1) {
    const matchType: SkipTracingMatchType = hasInitialName ? 'initial_last' : 'name_only';
    return { survivors: nameOnlySurvivors, disposition: 'clear_match', matchType };
  }
  if (nameOnlySurvivors.length === 0) return { survivors: [], disposition: 'no_exact_match' };
  return { survivors: nameOnlySurvivors, disposition: 'ambiguous' };
}
