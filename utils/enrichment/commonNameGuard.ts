/**
 * Common-name guard for skip-tracing eligibility.
 * When first+last is in the high-frequency set and location is weak, we skip the search call.
 * COMMON_FIRST_NAMES is also used to skip enrichment when last name is abbreviated ("John S" rule).
 * Static internal data only; no external API.
 */

const COMMON_FIRST_NAMES = new Set([
  'james', 'john', 'robert', 'michael', 'david', 'william', 'richard', 'joseph', 'thomas', 'christopher',
  'mary', 'patricia', 'jennifer', 'linda', 'elizabeth', 'barbara', 'susan', 'jessica', 'sarah', 'karen',
  'daniel', 'matthew', 'anthony', 'mark', 'donald', 'steven', 'paul', 'andrew', 'joshua', 'kenneth',
  'nancy', 'betty', 'margaret', 'sandra', 'ashley', 'dorothy', 'kimberly', 'emily', 'donna', 'michelle',
]);

const COMMON_SURNAMES = new Set([
  'smith', 'johnson', 'williams', 'jones', 'brown', 'davis', 'miller', 'wilson', 'moore', 'taylor',
  'anderson', 'thomas', 'jackson', 'white', 'harris', 'martin', 'thompson', 'garcia', 'martinez', 'robinson',
  'clark', 'rodriguez', 'lewis', 'lee', 'walker', 'hall', 'allen', 'young', 'king', 'wright',
  'scott', 'green', 'baker', 'adams', 'nelson', 'hill', 'campbell', 'mitchell', 'roberts', 'carter',
]);

function normalizeForGuard(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Returns true if the first name is in the high-frequency list.
 * Used for "John S" rule: skip when common first + abbreviated last.
 */
export function isCommonFirstName(firstName: string): boolean {
  const first = normalizeForGuard(firstName);
  return first.length > 0 && COMMON_FIRST_NAMES.has(first);
}

/**
 * Returns true if the last name is an initial or very short (1–2 chars after normalize).
 * Used for "John S" rule so we don't spend skip-tracing on "John S", "Mary R", etc.
 */
export function isAbbreviatedLastName(lastName: string): boolean {
  const last = normalizeForGuard(lastName);
  return last.length >= 1 && last.length <= 2;
}

/**
 * Returns true when we should skip enrichment: common first name + abbreviated last name.
 * Example: "John S" -> true; "Edgar R" -> false; "John Smith" -> false.
 */
export function shouldSkipEnrichmentForAbbreviatedLastName(
  firstName: string,
  lastName: string
): boolean {
  return isAbbreviatedLastName(lastName) && isCommonFirstName(firstName);
}

/**
 * Returns true if both first and last name are in the high-frequency lists.
 * Used to block skip-tracing search when location is weak (no exact city+state).
 */
export function isCommonName(firstName: string, lastName: string): boolean {
  const first = normalizeForGuard(firstName);
  const last = normalizeForGuard(lastName);
  if (!first || !last) return false;
  return COMMON_FIRST_NAMES.has(first) && COMMON_SURNAMES.has(last);
}
