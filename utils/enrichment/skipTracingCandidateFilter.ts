/**
 * Deterministic filter for skip-tracing PeopleDetails.
 * Replaces "use first result" with exact name + location matching; 0 or 2+ survivors = no spend.
 */

import { quickNormalize } from '../nameNormalization';
import { normalizeUsStateCode } from '../usState';

export type SkipTracingFilterDisposition = 'clear_match' | 'ambiguous' | 'no_exact_match';

export interface FilterResult {
  survivors: any[];
  disposition: SkipTracingFilterDisposition;
}

function normalizeForCompare(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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
  const reqCity = city ? normalizeForCompare(city) : '';
  const reqState = state ? normalizeState(state) : '';

  const survivors = peopleDetails.filter((p) => {
    const nameRaw = p.Name || p.name || '';
    const { firstName: candFirst, lastName: candLast } = quickNormalize(nameRaw);
    if (normalizeForCompare(candLast) !== reqLast) return false;
    if (normalizeForCompare(candFirst) !== reqFirst) return false;

    const livesIn = p['Lives in'] || p.livesIn || '';
    const { city: candCity, state: candState } = parseLivesIn(livesIn);

    if (reqState && candState !== reqState) return false;
    if (reqCity && candCity !== reqCity) return false;

    return true;
  });

  if (survivors.length === 0) return { survivors: [], disposition: 'no_exact_match' };
  if (survivors.length > 1) return { survivors, disposition: 'ambiguous' };
  return { survivors, disposition: 'clear_match' };
}
