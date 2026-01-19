/**
 * Name Normalization Service
 * 
 * Robust service to clean and standardize LinkedIn Sales Navigator names
 * for the enrichment pipeline.
 * 
 * Handles:
 * - Emoji & noise removal
 * - Prefix/title stripping (Dr., Prof., etc.)
 * - Middle initial removal
 * - Professional suffix extraction
 * - Hyphenated name preservation
 * - Initial-only first name handling
 */

export interface NormalizedNameResult {
  firstName: string;
  lastName: string;
  prefix?: string;
  suffixes: string[];
  cleanFullName: string;
  originalName: string;
  recoveredLastName?: boolean; // Indicates if last name was recovered from email
}

/**
 * Common professional prefixes/titles
 */
const PROFESSIONAL_PREFIXES = [
  'dr', 'dr.', 'doctor', 'prof', 'prof.', 'professor', 'hon', 'hon.', 'honorable',
  'sir', 'madam', 'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.', 'miss',
  'rev', 'rev.', 'reverend', 'fr', 'fr.', 'father', 'sister', 'brother',
  'capt', 'capt.', 'captain', 'col', 'col.', 'colonel', 'gen', 'gen.', 'general',
  'lt', 'lt.', 'lieutenant', 'sgt', 'sgt.', 'sergeant', 'maj', 'maj.', 'major',
  'adm', 'adm.', 'admiral', 'cmdr', 'cmdr.', 'commander',
];

/**
 * Common professional suffixes
 */
const PROFESSIONAL_SUFFIXES = [
  'md', 'm.d.', 'dds', 'd.d.s.', 'phd', 'ph.d.', 'mba', 'cpa', 'pmp', 'esq', 'esquire',
  'rn', 'r.n.', 'jd', 'j.d.', 'cfa', 'pe', 'p.e.', 'lssgb', 'lssbb', 'lssbb',
  'do', 'd.o.', 'pharmd', 'pharm.d.', 'mph', 'psyd', 'np', 'n.p.', 'pa', 'p.a.',
  'lcsw', 'lmft', 'shrm', 'shrm-scp', 'shrm-cp', 'shrm-scp',
  'cissp', 'pmp', 'pmi-acp', 'scrum', 'csm', 'cspo',
  'cfp', 'chfc', 'clu', 'cfc', 'cma', 'cia', 'cisa',
];

/**
 * Common name suffixes (generational)
 */
const GENERATIONAL_SUFFIXES = [
  'jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v', 'vi',
  '2nd', '3rd', '4th', '5th',
];

/**
 * Common email noise/junk suffixes to ignore
 * These often appear after the actual name in email addresses
 */
const EMAIL_NOISE_SUFFIXES = [
  'hired', 'work', 'inbox', 'spam', 'dev', 'test', 'mail', 'email',
  'ridesbikes', '123', '456', '789', '2024', '2023', '2022', '2021',
  '01', '02', '03', '04', '05', '06', '07', '08', '09', '10',
  'gmail', 'yahoo', 'hotmail', 'outlook', 'company', 'corp',
  'official', 'personal', 'business', 'contact', 'info',
];

/**
 * Minimum length for a recovered last name to be considered valid
 * Prevents recovering single letters or initials
 */
const MIN_RECOVERED_NAME_LENGTH = 3;

/**
 * Comprehensive emoji and symbol removal regex
 */
const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}]/gu; // Emoticons
const SYMBOL_REGEX = /[\u{2600}-\u{26FF}]/gu; // Miscellaneous symbols
const DINGBAT_REGEX = /[\u{2700}-\u{27BF}]/gu; // Dingbats
const VARIATION_SELECTOR_REGEX = /[\u{FE00}-\u{FE0F}]/gu; // Variation selectors
const ZERO_WIDTH_REGEX = /[\u{200B}-\u{200D}\u{FEFF}]/gu; // Zero-width characters

/**
 * Normalize a LinkedIn Sales Navigator name
 */
export function normalizeName(rawName: string): NormalizedNameResult {
  if (!rawName || typeof rawName !== 'string') {
    return {
      firstName: '',
      lastName: '',
      prefix: undefined,
      suffixes: [],
      cleanFullName: '',
      originalName: rawName || '',
      recoveredLastName: false,
    };
  }

  const originalName = rawName.trim();
  let cleaned = originalName;

  // Step 1: Remove emojis and non-standard symbols
  cleaned = cleaned
    .replace(EMOJI_REGEX, '')
    .replace(SYMBOL_REGEX, '')
    .replace(DINGBAT_REGEX, '')
    .replace(VARIATION_SELECTOR_REGEX, '')
    .replace(ZERO_WIDTH_REGEX, '')
    .replace(/[★☀️🦊🚀🎯⚡️🟢🔴🟡🟠🟣⚫⚪🟤]/g, '') // Common LinkedIn symbols
    .replace(/\s+/g, ' ') // Normalize multiple spaces
    .trim();

  // Step 2: Extract and remove prefix/title
  let prefix: string | undefined = undefined;
  // Match prefix with optional period and required space (or end of string for "Dr. " case)
  const prefixPattern = new RegExp(
    `^(${PROFESSIONAL_PREFIXES.map(p => p.replace(/\./g, '\\.')).join('|')})\\.?\\s+`,
    'i'
  );
  // Also handle case where prefix is at end with optional space (e.g., "Dr. " or "Dr ")
  const prefixPatternEnd = new RegExp(
    `^(${PROFESSIONAL_PREFIXES.map(p => p.replace(/\./g, '\\.')).join('|')})\\.?\\s*$`,
    'i'
  );
  
  let prefixMatch = cleaned.match(prefixPattern);
  let usedEndPattern = false;
  if (!prefixMatch) {
    prefixMatch = cleaned.match(prefixPatternEnd);
    usedEndPattern = !!prefixMatch;
  }
  
  if (prefixMatch) {
    let matchedPrefix = prefixMatch[1].trim().toLowerCase();
    // Capitalize first letter
    matchedPrefix = matchedPrefix.charAt(0).toUpperCase() + matchedPrefix.slice(1);
    // Add period only for short abbreviations (Dr., Prof., etc.) but not for full words (Sir, Professor)
    const shortAbbrevs = ['dr', 'prof', 'hon', 'rev', 'fr', 'capt', 'col', 'gen', 'lt', 'sgt', 'maj', 'adm', 'cmdr'];
    if (matchedPrefix.length <= 4 && !matchedPrefix.endsWith('.') && 
        shortAbbrevs.includes(matchedPrefix.toLowerCase())) {
      // Always add period for short abbreviations
      prefix = matchedPrefix + '.';
    } else {
      // Full words like "Sir", "Professor" don't get periods
      prefix = matchedPrefix;
    }
    // Remove the prefix from cleaned string
    if (usedEndPattern) {
      cleaned = cleaned.replace(prefixPatternEnd, '').trim();
    } else {
      cleaned = cleaned.replace(prefixPattern, '').trim();
    }
  }

  // Step 3: Extract professional suffixes (before cleaning commas)
  const suffixes: string[] = [];
  
  // Build suffix pattern (case insensitive, with optional periods)
  const suffixPatternParts = PROFESSIONAL_SUFFIXES.map(s => {
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Make periods optional
    return escaped.replace(/\\./g, '\\.?');
  });
  
  // Handle compound credentials like "MD/MPH" first
  const compoundSuffixPattern = new RegExp(
    `\\b(${suffixPatternParts.join('|')})\\s*/\\s*(${suffixPatternParts.join('|')})\\b`,
    'gi'
  );
  let compoundMatch;
  while ((compoundMatch = compoundSuffixPattern.exec(cleaned)) !== null) {
    const suffix1 = formatSuffix(compoundMatch[1], compoundMatch[0]);
    const suffix2 = formatSuffix(compoundMatch[2], compoundMatch[0]);
    if (!suffixes.includes(suffix1)) suffixes.push(suffix1);
    if (!suffixes.includes(suffix2)) suffixes.push(suffix2);
    cleaned = cleaned.replace(compoundMatch[0], '').trim();
  }
  
  // Helper function to format suffix (preserve case for PhD, etc.)
  function formatSuffix(suffixText: string, originalMatch: string): string {
    const upper = suffixText.toUpperCase();
    // Preserve mixed case for known suffixes (PhD, not PHD)
    if (upper === 'PHD') return 'PhD';
    if (upper === 'MBA') return 'MBA';
    if (upper === 'CPA') return 'CPA';
    if (upper === 'JD') return 'JD';
    if (upper === 'MD') return 'MD';
    if (upper === 'RN') return 'RN';
    if (upper === 'PE') return 'PE';
    // For others, use uppercase
    let suffix = upper;
    // Preserve periods if they were in the original
    if (originalMatch.includes('.')) {
      if (suffix.length <= 4 && !suffix.includes('.')) {
        suffix = suffix.split('').join('.');
      }
    }
    return suffix;
  }
  
  // Handle comma-separated suffixes (e.g., "John Doe, MD, PhD")
  const commaSuffixPattern = new RegExp(
    `,\\s*(${suffixPatternParts.join('|')})\\.?`,
    'gi'
  );
  let match;
  const suffixMatches: Array<{ suffix: string; original: string }> = [];
  while ((match = commaSuffixPattern.exec(cleaned)) !== null) {
    const suffix = formatSuffix(match[1], match[0]);
    suffixMatches.push({ suffix, original: match[0] });
  }
  
  // Remove comma-separated suffixes
  for (const { original } of suffixMatches) {
    cleaned = cleaned.replace(original, '').trim();
  }
  
  // Add unique suffixes
  for (const { suffix } of suffixMatches) {
    if (!suffixes.includes(suffix)) {
      suffixes.push(suffix);
    }
  }

  // Handle end-of-string suffixes (e.g., "John Doe MD")
  const endSuffixPattern = new RegExp(
    `\\s+(${suffixPatternParts.join('|')})\\.?$`,
    'i'
  );
  const endMatch = cleaned.match(endSuffixPattern);
  if (endMatch) {
    const suffix = formatSuffix(endMatch[1], endMatch[0]);
    if (!suffixes.includes(suffix)) {
      suffixes.push(suffix);
    }
    cleaned = cleaned.replace(endSuffixPattern, '').trim();
  }

  // Step 4: Remove remaining non-name characters (preserve hyphens, apostrophes, periods for initials)
  cleaned = cleaned
    .replace(/[^\w\s\-'.]/g, '') // Keep word chars, spaces, hyphens, apostrophes, periods
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim();

  // Step 5: Handle middle initials and extract name parts
  const tokens = cleaned.split(/\s+/).filter(t => t.length > 0);
  
  if (tokens.length === 0) {
    return {
      firstName: '',
      lastName: '',
      prefix,
      suffixes,
      cleanFullName: '',
      originalName,
    };
  }

  // Step 6: Identify first name (handle initial-only names like "JB")
  let firstName = tokens[0];
  
  // Check if first token is an initial-only name (e.g., "JB", "TJ", "AJ")
  // Criteria: 2-3 characters, all letters, not a single letter
  const isInitialOnlyName = firstName.length >= 2 && 
    firstName.length <= 3 && 
    /^[A-Za-z]+$/.test(firstName) &&
    !firstName.includes('.');

  // Step 7: Process middle tokens and last name
  // Remove middle initials (single letters or "M."), but preserve multi-character middle names
  const processedTokens: string[] = [firstName]; // Start with first name
  
  // Process middle tokens
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    
    // Check if this is the last token
    const isLastToken = i === tokens.length - 1;
    
    // Check if token is a generational suffix
    const isGenerationalSuffix = GENERATIONAL_SUFFIXES.some(
      suffix => token.toLowerCase().replace(/\./g, '') === suffix.toLowerCase().replace(/\./g, '')
    );
    
    if (isGenerationalSuffix) {
      // Add to suffixes and don't include in name
      const genSuffix = token.trim();
      if (!suffixes.includes(genSuffix)) {
        suffixes.push(genSuffix);
      }
      continue;
    }
    
    // Check if it's a middle initial (single letter or "M.")
    const isMiddleInitial = !isLastToken && 
      (token.length === 1 || (token.length === 2 && token.endsWith('.')));
    
    if (isMiddleInitial) {
      // Skip middle initials
      continue;
    }
    
    // Keep the token (could be middle name or last name)
    processedTokens.push(token);
  }

  // Step 8: Extract first and last name
  let lastName = '';
  if (processedTokens.length > 1) {
    // Last token is the last name
    lastName = processedTokens[processedTokens.length - 1];
    
    // Check if we need to combine tokens for hyphenated last name
    // If second-to-last token ends with hyphen, combine with last token
    if (processedTokens.length > 2) {
      const secondToLast = processedTokens[processedTokens.length - 2];
      if (secondToLast.endsWith('-')) {
        // Combine hyphenated last name
        lastName = secondToLast + lastName;
        processedTokens.pop(); // Remove the last token (now combined)
        processedTokens.pop(); // Remove second-to-last (now combined)
        processedTokens.push(lastName); // Add combined name
      }
    }
  }

  // Step 9: Build clean full name
  // Include first name, any middle names, and last name
  const middleNames = processedTokens.slice(1, -1);
  const nameParts = [firstName, ...middleNames, lastName].filter(part => part);
  const cleanFullName = nameParts.join(' ').trim();

  // Final cleanup: ensure proper formatting
  const finalFirstName = firstName.trim();
  const finalLastName = lastName.trim();

  return {
    firstName: finalFirstName,
    lastName: finalLastName,
    prefix,
    suffixes: suffixes.length > 0 ? suffixes : [],
    cleanFullName: cleanFullName || `${finalFirstName} ${finalLastName}`.trim(),
    originalName,
    recoveredLastName: false, // Standard normalization doesn't recover from email
  };
}

/**
 * Recover last name from email when only an initial is provided
 * 
 * @param firstName - The first name
 * @param partialLast - The partial last name (e.g., "Y." or "Y")
 * @param email - The email address
 * @returns The recovered last name, or empty string if recovery failed
 */
export function recoverLastNameFromEmail(
  firstName: string,
  partialLast: string,
  email: string
): string {
  // Validation: Only proceed if last name is a single character (with or without period)
  if (!partialLast || !email || !firstName) {
    return '';
  }

  // Normalize partial last name - remove period, trim, lowercase
  const lastInitial = partialLast.replace(/\./g, '').trim().toLowerCase();
  
  // Must be exactly one character
  if (lastInitial.length !== 1) {
    return '';
  }

  // Extract email prefix (before @)
  const emailPrefix = email.split('@')[0].toLowerCase();
  if (!emailPrefix || emailPrefix.length < MIN_RECOVERED_NAME_LENGTH) {
    return '';
  }

  const firstNameLower = firstName.toLowerCase();
  const firstInitial = firstNameLower.charAt(0);

  // Pattern 1: Exact match - email starts with first name
  // Example: "ralphyemmingway" where firstName is "Ralph"
  if (emailPrefix.startsWith(firstNameLower)) {
    const potentialLastName = emailPrefix.substring(firstNameLower.length);
    
    // Validate: recovered name must start with the last initial
    if (potentialLastName.length >= MIN_RECOVERED_NAME_LENGTH &&
        potentialLastName.charAt(0).toLowerCase() === lastInitial) {
      // Remove noise suffixes
      const cleaned = removeEmailNoise(potentialLastName);
      if (cleaned.length >= MIN_RECOVERED_NAME_LENGTH) {
        return capitalizeName(cleaned);
      }
    }
  }

  // Pattern 2: Initial match - email starts with first initial + last name
  // Example: "ryemmingway" where firstName is "Ralph" and last initial is "Y"
  if (emailPrefix.startsWith(firstInitial) && emailPrefix.length > 1) {
    const potentialLastName = emailPrefix.substring(1);
    
    // Validate: recovered name must start with the last initial
    if (potentialLastName.length >= MIN_RECOVERED_NAME_LENGTH &&
        potentialLastName.charAt(0).toLowerCase() === lastInitial) {
      // Remove noise suffixes
      const cleaned = removeEmailNoise(potentialLastName);
      if (cleaned.length >= MIN_RECOVERED_NAME_LENGTH) {
        return capitalizeName(cleaned);
      }
    }
  }

  // Pattern 3: First name + dot/separator + last name
  // Example: "ralph.yemmingway" or "ralph_yemmingway"
  // BUT: Be careful with single-character second parts (e.g., "ralph.y" should not recover "y")
  const separators = ['.', '_', '-'];
  for (const sep of separators) {
    if (emailPrefix.includes(sep)) {
      const parts = emailPrefix.split(sep);
      if (parts.length >= 2) {
        const firstPart = parts[0].toLowerCase();
        const secondPart = parts[1].toLowerCase();
        
        // Special case: if second part is just the initial (e.g., "ralph.y"), don't recover
        // This handles the company email case where domain might be confused
        if (secondPart.length === 1 && secondPart === lastInitial) {
          // This is just the initial, not a full name - skip this pattern
          continue;
        }
        
        // Check if first part matches first name or initial
        // AND second part is long enough and starts with last initial
        if ((firstPart === firstNameLower || firstPart === firstInitial) &&
            secondPart.length >= MIN_RECOVERED_NAME_LENGTH &&
            secondPart.charAt(0).toLowerCase() === lastInitial) {
          const cleaned = removeEmailNoise(secondPart);
          if (cleaned.length >= MIN_RECOVERED_NAME_LENGTH) {
            return capitalizeName(cleaned);
          }
        }
      }
    }
  }

  // Pattern 4: Last name + first name (reversed)
  // Example: "yemmingwayralph" - less common but possible
  if (emailPrefix.endsWith(firstNameLower) || emailPrefix.endsWith(firstInitial)) {
    const potentialLastName = emailPrefix.substring(0, emailPrefix.length - firstNameLower.length);
    
    if (potentialLastName.length >= 3 && // MIN_RECOVERED_NAME_LENGTH
        potentialLastName.charAt(0).toLowerCase() === lastInitial) {
      const cleaned = removeEmailNoise(potentialLastName);
      if (cleaned.length >= 3) { // MIN_RECOVERED_NAME_LENGTH
        return capitalizeName(cleaned);
      }
    }
  }

  return '';
}

/**
 * Remove common email noise suffixes from a potential name
 */
function removeEmailNoise(name: string): string {
  let cleaned = name.toLowerCase();
  
  // Remove numeric suffixes (e.g., "montague77" -> "montague")
  cleaned = cleaned.replace(/\d+$/, '');
  
  // Check for common noise suffixes at the end
  for (const noise of EMAIL_NOISE_SUFFIXES) {
    if (cleaned.endsWith(noise)) {
      cleaned = cleaned.substring(0, cleaned.length - noise.length);
      break; // Only remove one suffix to avoid over-cleaning
    }
  }
  
  return cleaned;
}

/**
 * Capitalize a name properly (first letter uppercase, rest lowercase)
 */
function capitalizeName(name: string): string {
  if (!name) return '';
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

/**
 * Normalize a LinkedIn Sales Navigator name with optional email for last name recovery
 */
export function normalizeNameWithEmail(
  rawName: string,
  email?: string
): NormalizedNameResult {
  // First, do standard normalization
  const normalized = normalizeName(rawName);
  
  // If we have a partial last name (single character) and an email, try to recover
  if (normalized.lastName && 
      normalized.firstName &&
      email &&
      normalized.lastName.replace(/\./g, '').trim().length === 1) {
    const recovered = recoverLastNameFromEmail(
      normalized.firstName,
      normalized.lastName,
      email
    );
    
    if (recovered) {
      return {
        ...normalized,
        lastName: recovered,
        cleanFullName: `${normalized.firstName} ${recovered}`.trim(),
        recoveredLastName: true,
      };
    }
  }
  
  return normalized;
}

/**
 * Quick normalization for simple use cases
 * Returns just first and last name
 */
export function quickNormalize(rawName: string): { firstName: string; lastName: string } {
  const normalized = normalizeName(rawName);
  return {
    firstName: normalized.firstName,
    lastName: normalized.lastName,
  };
}
