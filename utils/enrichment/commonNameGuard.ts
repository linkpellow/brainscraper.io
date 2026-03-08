/**
 * Common-name guard for skip-tracing eligibility.
 * When first+last is in the high-frequency set and location is weak, we skip the search call.
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
 * Returns true if both first and last name are in the high-frequency lists.
 * Used to block skip-tracing search when location is weak (no exact city+state).
 */
export function isCommonName(firstName: string, lastName: string): boolean {
  const first = normalizeForGuard(firstName);
  const last = normalizeForGuard(lastName);
  if (!first || !last) return false;
  return COMMON_FIRST_NAMES.has(first) && COMMON_SURNAMES.has(last);
}
