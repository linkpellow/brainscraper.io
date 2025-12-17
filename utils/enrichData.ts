/**
 * Data enrichment utilities using skip-tracing API
 */

import { ParsedData } from './parseFile';
import { isLeadProcessed, saveEnrichedLeadImmediate, getLeadKey } from './incrementalSave';
import { extractLeadSummary } from './extractLeadSummary';
import { callAPIWithConfig } from './apiToggleMiddleware';

/**
 * Detailed progress information for real-time tracking
 */
export interface EnrichmentProgress {
  current: number;
  total: number;
  leadName?: string;
  step?: 'linkedin' | 'zip' | 'phone-discovery' | 'telnyx' | 'gatekeep' | 'age' | 'complete';
  stepDetails?: {
    firstName?: string;
    lastName?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    phone?: string;
    email?: string;
    lineType?: string;
    carrier?: string;
    age?: string;
  };
  errors?: string[];
  timestamp: number;
}

export interface EnrichmentResult {
  email?: string;
  phone?: string;
  zipCode?: string;
  domain?: string;
  linkedinUrl?: string;
  linkedinCompanyUrl?: string;
  facebookProfileId?: string;
  addressLine1?: string;
  addressLine2?: string;
  firstName?: string;
  lastName?: string;
  skipTracingData?: unknown;
  telnyxLookupData?: unknown;
  incomeData?: unknown;
  companyData?: unknown;
  freshLinkedinCompanyData?: unknown;
  websiteContactsData?: unknown;
  linkedinProfileData?: unknown;
  freshLinkedinProfileData?: unknown;
  linkedinSalesNavigatorData?: unknown;
  facebookPhotosData?: unknown;
  websiteExtractorData?: unknown;
  lineType?: string; // From Telnyx portability.line_type
  carrierName?: string; // From Telnyx carrier.name
  carrierType?: string; // From Telnyx carrier.type
  normalizedCarrier?: string; // From Telnyx carrier.normalized_carrier
  age?: string; // From skip-tracing
  dob?: string; // From skip-tracing
  error?: string;
}

export type EnrichedRow = Record<string, string | number> & {
  _enriched?: EnrichmentResult;
};

export interface EnrichedData {
  headers: string[];
  rows: EnrichedRow[];
  rowCount: number;
  columnCount: number;
}

/**
 * Detects if a column name likely contains emails
 */
function isEmailColumn(columnName: string): boolean {
  const lower = columnName.toLowerCase();
  return lower.includes('email') || lower.includes('e-mail') || lower === 'email';
}

/**
 * Detects if a column name likely contains phone numbers
 */
function isPhoneColumn(columnName: string): boolean {
  const lower = columnName.toLowerCase();
  return lower.includes('phone') || lower.includes('tel') || lower.includes('mobile') || lower === 'phone';
}

/**
 * Detects if a column name likely contains zip codes
 */
function isZipColumn(columnName: string): boolean {
  const lower = columnName.toLowerCase();
  return lower.includes('zip') || lower.includes('postal') || lower === 'zipcode' || lower === 'zip_code' || lower === 'zip code';
}

/**
 * Detects if a column name likely contains domains or websites
 */
function isDomainColumn(columnName: string): boolean {
  const lower = columnName.toLowerCase();
  return lower.includes('domain') || lower.includes('website') || lower.includes('url') || lower.includes('company') || lower === 'domain' || lower === 'site';
}

/**
 * Normalizes a name by stripping credentials, suffixes, and noise
 * Returns: { firstName: string, lastName: string, suffixRaw?: string }
 */
interface NormalizedName {
  firstName: string;
  lastName: string;
  suffixRaw?: string;
}

function normalizeName(fullName: string): NormalizedName {
  if (!fullName) return { firstName: '', lastName: '' };
  
  // Step 1: Remove emojis and special unicode characters
  let cleaned = fullName
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Remove emojis
    .replace(/[\u{2600}-\u{26FF}]/gu, '') // Remove miscellaneous symbols
    .replace(/[\u{2700}-\u{27BF}]/gu, '') // Remove dingbats
    .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
    .trim();
  
  // Step 2: Strip credentials and noise using deny-list regex
  // Pattern matches: MD, M.D., DO, PharmD, Pharm.D., CPA, JD, MPH, MBA, PsyD, RN, NP, PA, DDS, DMD, LCSW, LMFT, SHRM-*, SAFe *, AKA *, DBA *, The *, etc.
  // Also handles compound credentials like MD/MPH
  const baseCredentialPattern = '(MD|M\\.D\\.|DO|PharmD|Pharm\\.D\\.|CPA|JD|MPH|MBA|PsyD|RN|NP|PA|DDS|DMD|LCSW|LMFT|SHRM[-]?[A-Z]*)';
  
  // Handle compound credentials like "MD/MPH" first (before individual ones)
  const compoundCredentialPattern = new RegExp(`\\b${baseCredentialPattern}\\s*\\/\\s*${baseCredentialPattern}\\b`, 'gi');
  
  // Handle individual credentials and phrases
  const credentialPattern = new RegExp(`\\b(${baseCredentialPattern}|SAFe\\s+[A-Z/]*|AKA\\s+.*?|DBA\\s+.*?|The\\s+.*?|Psychotherapist|Guru|Loan\\s+Officer|People's\\s+.*?|Mortgage\\s+Guru)\\b`, 'gi');
  
  // Extract suffix before removing it (check compound first, then individual)
  const suffixMatchCompound = cleaned.match(compoundCredentialPattern);
  const suffixMatchIndividual = cleaned.match(credentialPattern);
  const allSuffixes = [...(suffixMatchCompound || []), ...(suffixMatchIndividual || [])];
  const suffixRaw = allSuffixes.length > 0 ? allSuffixes.join(' ').trim() : undefined;
  
  // Remove credentials (compound first, then individual)
  cleaned = cleaned.replace(compoundCredentialPattern, '').trim();
  cleaned = cleaned.replace(credentialPattern, '').trim();
  
  // Step 3: Remove any remaining non-name characters (preserve apostrophes and hyphens)
  cleaned = cleaned
    .replace(/[^\w\s\-']/g, '') // Keep only word chars, spaces, hyphens, apostrophes
    .replace(/\s+/g, ' ') // Normalize spaces again
    .trim();
  
  // Step 4: Split and extract first/last name
  const tokens = cleaned.split(/\s+/).filter(t => t.length > 0);
  
  if (tokens.length === 0) {
    return { firstName: '', lastName: '', suffixRaw };
  }
  
  // First token = first_name
  const firstName = tokens[0];
  
  // Last valid token = last_name (if more than one token)
  const lastName = tokens.length > 1 ? tokens[tokens.length - 1] : '';
  
  return { firstName, lastName, suffixRaw };
}

/**
 * Removes emojis and special characters from a name, keeping only letters, spaces, and common name characters
 * This is a simpler version for API calls after normalization
 */
function cleanNameForAPI(name: string): string {
  if (!name) return '';
  // Remove emojis and special unicode characters, keep only letters, spaces, hyphens, apostrophes, and periods
  return name
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Remove emojis
    .replace(/[\u{2600}-\u{26FF}]/gu, '') // Remove miscellaneous symbols
    .replace(/[\u{2700}-\u{27BF}]/gu, '') // Remove dingbats
    .replace(/[^\w\s\-'.,]/g, '') // Keep only word chars, spaces, hyphens, apostrophes, periods, commas
    .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
    .trim();
}

/**
 * Detects if a column name likely contains LinkedIn URLs
 */
function isLinkedInColumn(columnName: string): boolean {
  const lower = columnName.toLowerCase();
  return lower.includes('linkedin') || lower.includes('linked-in') || lower === 'linkedin_url' || lower === 'linkedin url';
}

/**
 * Detects if a column name likely contains Facebook profile IDs or URLs
 */
function isFacebookColumn(columnName: string): boolean {
  const lower = columnName.toLowerCase();
  return lower.includes('facebook') || lower.includes('fb') || lower === 'facebook_id' || lower === 'facebook id' || lower === 'fb_id';
}

/**
 * Detects if a column name likely contains addresses
 */
function isAddressColumn(columnName: string): boolean {
  const lower = columnName.toLowerCase();
  return lower.includes('address') || lower.includes('street') || lower.includes('city') || lower === 'address1' || lower === 'address2' || lower === 'address_line1' || lower === 'address_line2';
}

/**
 * Detects if a column name likely contains full names
 */
function isNameColumn(columnName: string): boolean {
  const lower = columnName.toLowerCase();
  return lower === 'name' || lower === 'full name' || lower === 'fullname' || 
         lower === 'person name' || lower === 'contact name' || lower === 'person';
}

/**
 * Detects if a column name likely contains first names
 */
function isFirstNameColumn(columnName: string): boolean {
  const lower = columnName.toLowerCase();
  return lower === 'firstname' || lower === 'first_name' || lower === 'first name' || lower === 'fname' || lower === 'given name';
}

/**
 * Detects if a column name likely contains last names
 */
function isLastNameColumn(columnName: string): boolean {
  const lower = columnName.toLowerCase();
  return lower === 'lastname' || lower === 'last_name' || lower === 'last name' || lower === 'lname' || lower === 'surname' || lower === 'family name';
}

/**
 * Extracts email from a row
 */
function extractEmail(row: Record<string, string | number>, headers: string[]): string | null {
  for (const header of headers) {
    if (isEmailColumn(header)) {
      const value = String(row[header] || '').trim();
      // DIAGNOSTIC: Log email extraction attempt
      if (header.toLowerCase().includes('email')) {
        console.log(`[EXTRACT_EMAIL] Checking column "${header}":`, {
          value: value || 'EMPTY',
          valueLength: value.length,
          hasAtSymbol: value.includes('@'),
          willReturn: value && value.includes('@') ? 'YES' : 'NO',
        });
      }
      if (value && value.includes('@')) {
        return value;
      }
    }
  }
  console.log(`[EXTRACT_EMAIL] No valid email found in row`);
  return null;
}

/**
 * Extracts phone from a row
 */
function extractPhone(row: Record<string, string | number>, headers: string[]): string | null {
  for (const header of headers) {
    if (isPhoneColumn(header)) {
      const value = String(row[header] || '').trim();
      // DIAGNOSTIC: Log phone extraction attempt
      if (header.toLowerCase().includes('phone')) {
        console.log(`[EXTRACT_PHONE] Checking column "${header}":`, {
          value: value || 'EMPTY',
          valueLength: value.length,
          cleaned: value ? value.replace(/[^\d+]/g, '') : '',
          cleanedLength: value ? value.replace(/[^\d+]/g, '').length : 0,
          hasMinLength: value ? (value.replace(/[^\d+]/g, '').length >= 10) : false,
          willReturn: value && value.replace(/[^\d+]/g, '').length >= 10 ? 'YES' : 'NO',
        });
      }
      if (value) {
        // Clean phone number (remove non-digits except +)
        const cleaned = value.replace(/[^\d+]/g, '');
        if (cleaned.length >= 10) {
          return cleaned;
        }
      }
    }
  }
  console.log(`[EXTRACT_PHONE] No valid phone found in row`);
  return null;
}

/**
 * Extracts zip code from a row
 */
function extractZipCode(row: Record<string, string | number>, headers: string[]): string | null {
  for (const header of headers) {
    if (isZipColumn(header)) {
      const value = String(row[header] || '').trim();
      if (value) {
        // Extract 5-digit zip code
        const zipMatch = value.match(/\b\d{5}\b/);
        if (zipMatch) {
          return zipMatch[0];
        }
      }
    }
  }
  return null;
}

/**
 * Extracts domain from a row
 */
function extractDomain(row: Record<string, string | number>, headers: string[]): string | null {
  for (const header of headers) {
    if (isDomainColumn(header)) {
      const value = String(row[header] || '').trim();
      if (value) {
        // Skip if it's a LinkedIn URL (handle separately)
        if (value.includes('linkedin.com')) {
          continue;
        }
        
        // Extract domain from URL or use as-is if it looks like a domain
        let domain = value;
        
        // Remove protocol if present
        domain = domain.replace(/^https?:\/\//, '');
        
        // Remove www. if present
        domain = domain.replace(/^www\./, '');
        
        // Remove path if present
        domain = domain.split('/')[0];
        
        // Remove port if present
        domain = domain.split(':')[0];
        
        // Validate it looks like a domain (has at least one dot and valid characters)
        if (domain.match(/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.[a-zA-Z]{2,}$/)) {
          return domain;
        }
      }
    }
  }
  return null;
}

/**
 * Extracts LinkedIn profile URL from a row
 */
function extractLinkedInUrl(row: Record<string, string | number>, headers: string[]): string | null {
  for (const header of headers) {
    if (isLinkedInColumn(header)) {
      const value = String(row[header] || '').trim();
      if (value && value.includes('linkedin.com')) {
        // Check if it's a company URL (linkedin.com/company/) vs profile URL (linkedin.com/in/)
        if (value.includes('linkedin.com/in/')) {
          return value; // Profile URL
        }
      }
    }
  }
  
  // Also check domain columns for LinkedIn URLs
  for (const header of headers) {
    if (isDomainColumn(header)) {
      const value = String(row[header] || '').trim();
      if (value && value.includes('linkedin.com/in/')) {
        return value; // Profile URL
      }
    }
  }
  
  return null;
}

/**
 * Extracts LinkedIn company URL from a row
 */
function extractLinkedInCompanyUrl(row: Record<string, string | number>, headers: string[]): string | null {
  for (const header of headers) {
    if (isLinkedInColumn(header)) {
      const value = String(row[header] || '').trim();
      if (value && value.includes('linkedin.com/company/')) {
        return value;
      }
    }
  }
  
  // Also check domain columns for LinkedIn company URLs
  for (const header of headers) {
    if (isDomainColumn(header)) {
      const value = String(row[header] || '').trim();
      if (value && value.includes('linkedin.com/company/')) {
        return value;
      }
    }
  }
  
  return null;
}

/**
 * Extracts Facebook profile ID from a row
 */
function extractFacebookProfileId(row: Record<string, string | number>, headers: string[]): string | null {
  for (const header of headers) {
    if (isFacebookColumn(header)) {
      const value = String(row[header] || '').trim();
      if (value) {
        // Extract profile ID from Facebook URL or use as-is if it's just a number
        const urlMatch = value.match(/facebook\.com\/(?:profile\.php\?id=)?(\d+)/);
        if (urlMatch) {
          return urlMatch[1];
        }
        // If it's just a numeric ID
        if (/^\d+$/.test(value)) {
          return value;
        }
      }
    }
  }
  
  // Also check domain/URL columns for Facebook URLs
  for (const header of headers) {
    if (isDomainColumn(header)) {
      const value = String(row[header] || '').trim();
      if (value && value.includes('facebook.com')) {
        const urlMatch = value.match(/facebook\.com\/(?:profile\.php\?id=)?(\d+)/);
        if (urlMatch) {
          return urlMatch[1];
        }
      }
    }
  }
  
  return null;
}

/**
 * Extracts address information from a row
 */
function extractAddress(row: Record<string, string | number>, headers: string[]): { addressLine1?: string; addressLine2?: string } {
  const result: { addressLine1?: string; addressLine2?: string } = {};
  
  for (const header of headers) {
    const lower = header.toLowerCase();
    const value = String(row[header] || '').trim();
    
    if (value) {
      if (lower.includes('address1') || lower.includes('address_line1') || lower.includes('street') || (lower.includes('address') && !lower.includes('address2'))) {
        result.addressLine1 = value;
      } else if (lower.includes('address2') || lower.includes('address_line2') || lower.includes('city') || lower.includes('state') || lower.includes('zip')) {
        result.addressLine2 = value;
      }
    }
  }
  
  return result;
}

/**
 * Extracts first name from a row
 * Handles both separate firstName columns and full Name columns with credentials
 */
function extractFirstName(row: Record<string, string | number>, headers: string[]): string | null {
  // First, try dedicated firstName column
  for (const header of headers) {
    if (isFirstNameColumn(header)) {
      const value = String(row[header] || '').trim();
      if (value) {
        // Normalize in case it contains credentials
        const normalized = normalizeName(value);
        if (normalized.firstName) {
          console.log(`[EXTRACT_FIRST_NAME] Found column "${header}" with value: "${value}" -> normalized: "${normalized.firstName}"`);
          return normalized.firstName;
        }
      }
    }
  }
  
  // If no firstName column, try parsing from Name column
  for (const header of headers) {
    if (isNameColumn(header)) {
      const fullName = String(row[header] || '').trim();
      if (fullName) {
        const normalized = normalizeName(fullName);
        if (normalized.firstName) {
          console.log(`[EXTRACT_FIRST_NAME] Parsed from Name column "${header}": "${fullName}" -> "${normalized.firstName}"`);
          return normalized.firstName;
        }
      }
    }
  }
  
  console.log(`[EXTRACT_FIRST_NAME] No first name found`);
  return null;
}

/**
 * Extracts last name from a row
 * Handles both separate lastName columns and full Name columns with credentials
 */
function extractLastName(row: Record<string, string | number>, headers: string[]): string | null {
  // First, try dedicated lastName column
  for (const header of headers) {
    if (isLastNameColumn(header)) {
      const value = String(row[header] || '').trim();
      if (value) {
        // Normalize in case it contains credentials
        const normalized = normalizeName(value);
        if (normalized.lastName) {
          console.log(`[EXTRACT_LAST_NAME] Found column "${header}" with value: "${value}" -> normalized: "${normalized.lastName}"`);
          return normalized.lastName;
        }
      }
    }
  }
  
  // If no lastName column, try parsing from Name column
  for (const header of headers) {
    if (isNameColumn(header)) {
      const fullName = String(row[header] || '').trim();
      if (fullName) {
        const normalized = normalizeName(fullName);
        if (normalized.lastName) {
          console.log(`[EXTRACT_LAST_NAME] Parsed from Name column "${header}": "${fullName}" -> "${normalized.lastName}"`);
          return normalized.lastName;
        }
      }
    }
  }
  
  console.log(`[EXTRACT_LAST_NAME] No last name found`);
  return null;
}

/**
 * Extracts city from a row
 */
function extractCity(row: Record<string, string | number>, headers: string[]): string | null {
  for (const header of headers) {
    const lower = header.toLowerCase();
    if (lower === 'city' || (lower.includes('city') && !lower.includes('state'))) {
      const value = String(row[header] || '').trim();
      if (value && value !== 'N/A') {
        return value;
      }
    }
  }
  return null;
}

/**
 * Extracts state from a row
 */
function extractState(row: Record<string, string | number>, headers: string[]): string | null {
  for (const header of headers) {
    const lower = header.toLowerCase();
    if (lower === 'state' || lower === 'st' || (lower.includes('state') && !lower.includes('city'))) {
      const value = String(row[header] || '').trim();
      if (value && value !== 'N/A') {
        return value;
      }
    }
  }
  return null;
}

/**
 * Checks if income data already exists in the row
 */
function hasIncomeData(row: Record<string, string | number>, headers: string[]): boolean {
  const incomeKeywords = ['income', 'household', 'median', 'average', 'salary', 'wage'];
  for (const header of headers) {
    const lower = header.toLowerCase();
    if (incomeKeywords.some(keyword => lower.includes(keyword))) {
      const value = String(row[header] || '').trim();
      if (value && value !== '0' && value !== 'N/A' && value !== '') {
        return true;
      }
    }
  }
  return false;
}

/**
 * Checks if DOB or age data already exists in the row
 */
function hasDOBOrAge(row: Record<string, string | number>, headers: string[]): boolean {
  const dobKeywords = ['dob', 'date of birth', 'birthdate', 'birth date', 'age'];
  for (const header of headers) {
    const lower = header.toLowerCase();
    if (dobKeywords.some(keyword => lower.includes(keyword))) {
      const value = String(row[header] || '').trim();
      if (value && value !== 'N/A' && value !== '') {
        return true;
      }
    }
  }
  return false;
}

/**
 * Checks if address data already exists in the row
 */
function hasAddressData(row: Record<string, string | number>, headers: string[]): boolean {
  const addressKeywords = ['address', 'street', 'city', 'state', 'zip'];
  let foundCount = 0;
  for (const header of headers) {
    const lower = header.toLowerCase();
    if (addressKeywords.some(keyword => lower.includes(keyword))) {
      const value = String(row[header] || '').trim();
      if (value && value !== 'N/A' && value !== '') {
        foundCount++;
      }
    }
  }
  // Consider address complete if we have at least city and state, or a full address
  return foundCount >= 2;
}

/**
 * Checks if we already have comprehensive contact data (phone, email, name)
 */
function hasCompleteContactData(row: Record<string, string | number>, headers: string[]): boolean {
  const hasEmail = extractEmail(row, headers) !== null;
  const hasPhone = extractPhone(row, headers) !== null;
  const hasFirstName = extractFirstName(row, headers) !== null;
  const hasLastName = extractLastName(row, headers) !== null;
  
  // If we have email/phone AND name, we likely have enough contact data
  return (hasEmail || hasPhone) && hasFirstName && hasLastName;
}

/**
 * Checks if LinkedIn profile data already exists
 */
function hasLinkedInProfileData(row: Record<string, string | number>, headers: string[]): boolean {
  const linkedinKeywords = ['linkedin', 'profile', 'headline', 'title', 'job title', 'position'];
  let foundCount = 0;
  for (const header of headers) {
    const lower = header.toLowerCase();
    if (linkedinKeywords.some(keyword => lower.includes(keyword))) {
      const value = String(row[header] || '').trim();
      if (value && value !== 'N/A' && value !== '') {
        foundCount++;
      }
    }
  }
  // If we have title/headline and company, we likely have LinkedIn profile data
  return foundCount >= 2;
}

/**
 * Checks if company data already exists
 */
function hasCompanyData(row: Record<string, string | number>, headers: string[]): boolean {
  const companyKeywords = ['company', 'employer', 'organization', 'firm'];
  for (const header of headers) {
    const lower = header.toLowerCase();
    if (companyKeywords.some(keyword => lower.includes(keyword))) {
      const value = String(row[header] || '').trim();
      if (value && value !== 'N/A' && value !== '') {
        return true;
      }
    }
  }
  return false;
}

/**
 * Rate limiter for skip-tracing API (5 requests per second)
 * Uses a queue-based approach to ensure strict rate limiting across concurrent requests
 */
class SkipTracingRateLimiter {
  private lastRequestTime: number = 0;
  private readonly minDelayMs: number = 250; // 250ms delay = 4 req/sec (conservative to account for 2 calls per lead: search + person details)
  private requestQueue: Array<() => void> = [];
  private processingPromise: Promise<void> | null = null;
  private consecutive429Errors: number = 0;

  async waitIfNeeded(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.requestQueue.push(resolve);
      // Reduced logging - only log if queue is getting long
      if (this.requestQueue.length > 5) {
        console.log(`[RATE_LIMIT] Queue length: ${this.requestQueue.length}`);
      }
      
      // Start processing if not already processing
      // Check if processingPromise exists AND is still pending (not resolved)
      if (!this.processingPromise) {
        this.processingPromise = this.processQueue().finally(() => {
          // Reset processingPromise when queue processing completes
          this.processingPromise = null;
        });
      }
    });
  }

  private async processQueue(): Promise<void> {
    while (this.requestQueue.length > 0) {
      const resolve = this.requestQueue.shift();
      if (!resolve) {
        break;
      }

      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      
      // If we've had recent 429 errors, add extra delay (exponential backoff)
      const baseDelay = this.minDelayMs; // 200ms = 5 req/sec
      const extraDelay = this.consecutive429Errors > 0 ? Math.min(this.consecutive429Errors * 500, 2000) : 0; // Max 2 seconds extra
      const totalDelay = baseDelay + extraDelay;
      
      // CRITICAL: Always ensure minimum delay between requests
      // This prevents bursts that trigger 429 errors
      if (timeSinceLastRequest < totalDelay) {
        const waitTime = totalDelay - timeSinceLastRequest;
        // Only log if waiting significantly or if we have 429 errors
        if (waitTime > 500 || this.consecutive429Errors > 0) {
          console.log(`[RATE_LIMIT] Waiting ${waitTime}ms (${this.consecutive429Errors} consecutive 429s, queue: ${this.requestQueue.length})`);
        }
        await new Promise(r => setTimeout(r, waitTime));
      }
      
      // Update lastRequestTime BEFORE resolving, so the next request waits properly
      // This ensures requests are truly spaced out, not just queued quickly
      this.lastRequestTime = Date.now();
      resolve(); // Allow this request to proceed - it will make the API call now
    }
  }
  
  increment429Errors(): void {
    this.consecutive429Errors++;
  }
  
  reset429Errors(): void {
    this.consecutive429Errors = 0;
  }
  
  getConsecutive429Errors(): number {
    return this.consecutive429Errors;
  }
}

// Singleton instance for skip-tracing rate limiting
const skipTracingRateLimiter = new SkipTracingRateLimiter();

/**
 * Helper: Makes an API call with consistent error handling
 */
function getServerBaseUrl(): string {
  // Prefer explicit config (works in dev/prod)
  const explicit =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    '';

  if (explicit) {
    return explicit.startsWith('http') ? explicit : `https://${explicit}`;
  }

  // Vercel provides host without protocol
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  // Local dev fallback
  return 'http://localhost:3000';
}

/**
 * Wrapper function that applies settings-based controls
 * This is the main entry point for all API calls
 */
export async function callAPI(
  url: string,
  options: RequestInit = {},
  apiName: string
): Promise<{ data?: any; error?: string }> {
  return await callAPIWithConfig(url, options, apiName, callAPIImpl);
}

/**
 * Original callAPI function (internal - actual implementation)
 */
async function callAPIImpl(
  url: string,
  options: RequestInit = {},
  apiName: string
): Promise<{ data?: any; error?: string }> {
  // Add AbortController for timeout (60 seconds for person details, 30 for others)
  const timeoutMs = apiName.includes('Person Details') ? 60000 : 30000;
  const controller = new AbortController();
  let timeoutId: NodeJS.Timeout | null = null;
  
  try {
    // Apply rate limiting for skip-tracing API calls (5 requests per second)
    if (apiName.includes('Skip-tracing')) {
      console.log(`[RATE_LIMIT] Request queued for ${apiName}`);
      await skipTracingRateLimiter.waitIfNeeded();
      console.log(`[RATE_LIMIT] Request approved for ${apiName}`);
    }

    const finalUrl =
      url.startsWith('/')
        ? new URL(url, getServerBaseUrl()).toString()
        : url;

    console.log(`[CALL_API] Calling ${apiName} at ${finalUrl}`);
    
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    const response = await fetch(finalUrl, { ...options, signal: controller.signal });
    if (timeoutId) clearTimeout(timeoutId);
    console.log(`[CALL_API] ${apiName} response status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log(`[CALL_API] ${apiName} response data keys:`, data ? Object.keys(data) : 'null');
      console.log(`[CALL_API] ${apiName} response preview:`, JSON.stringify(data).substring(0, 1000));
      return { data };
    } else if (response.status === 429) {
      // Rate limit exceeded - wait longer and retry once
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }
      
      // Exponential backoff for 429 errors (but don't wait too long - we already have rate limiter)
      const backoffDelay = Math.min(1000 * Math.pow(1.5, skipTracingRateLimiter.getConsecutive429Errors()), 5000); // Max 5 seconds
      console.warn(`[CALL_API] ${apiName} rate limited (429), waiting ${backoffDelay}ms before retrying...`);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
      
      // Apply rate limiting again before retry
      if (apiName.includes('Skip-tracing')) {
        skipTracingRateLimiter.increment429Errors();
        await skipTracingRateLimiter.waitIfNeeded();
      }
      
      // Retry once after waiting (without timeout for retry)
      const retryController = new AbortController();
      const retryTimeoutId = setTimeout(() => retryController.abort(), timeoutMs);
      try {
        const retryResponse = await fetch(finalUrl, { ...options, signal: retryController.signal });
        clearTimeout(retryTimeoutId);
        if (retryResponse.ok) {
          const retryData = await retryResponse.json();
          console.log(`[CALL_API] ${apiName} retry successful`);
          if (apiName.includes('Skip-tracing')) {
            skipTracingRateLimiter.reset429Errors();
          }
          return { data: retryData };
        } else if (retryResponse.status === 429) {
          // Still rate limited after retry - don't retry again
          const retryErrorText = await retryResponse.text();
          console.error(`[CALL_API] ${apiName} retry still rate limited (429)`);
          return { error: `${apiName}: Rate limit exceeded. Please wait before retrying.` };
        } else {
          const retryErrorText = await retryResponse.text();
          let retryErrorData;
          try {
            retryErrorData = JSON.parse(retryErrorText);
          } catch {
            retryErrorData = { error: retryErrorText };
          }
          console.error(`[CALL_API] ${apiName} retry failed:`, retryErrorData);
          return { error: `${apiName}: ${retryErrorData.error || 'Failed to enrich'}` };
        }
      } catch (retryError) {
        clearTimeout(retryTimeoutId);
        throw retryError;
      }
    } else {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }
      console.error(`[CALL_API] ${apiName} error:`, errorData);
      return { error: `${apiName}: ${errorData.error || 'Failed to enrich'}` };
    }
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    
    // Record error for cooldown tracking (only for actual errors, not timeouts)
    if (!(error instanceof Error && error.name === 'AbortError')) {
      try {
        const { recordError } = await import('./cooldownManager');
        await recordError();
      } catch (cooldownError) {
        // Silent fail - don't break API call flow
      }
    }

    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`[CALL_API] ${apiName} timeout after ${timeoutMs}ms`);
      return {
        error: `${apiName}: Request timeout after ${timeoutMs}ms`,
      };
    }
    console.error(`[CALL_API] ${apiName} exception:`, error);
    return {
      error: `${apiName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Helper: Extracts phone/email from API response data
 */
function extractContactFromData(
  data: any,
  currentPhone: string | null,
  currentEmail: string | null
): { phone: string | null; email: string | null } {
  console.log(`[EXTRACT_CONTACT] Extracting from data:`, {
    dataKeys: data ? Object.keys(data) : [],
    dataType: Array.isArray(data) ? 'array' : typeof data,
    dataLength: Array.isArray(data) ? data.length : 'N/A',
    currentPhone: currentPhone || 'NONE',
    currentEmail: currentEmail || 'NONE',
  });
  
  let phone = currentPhone;
  let email = currentEmail;

  // Handle array responses (skip-tracing might return array)
  let searchData = data;
  if (Array.isArray(data) && data.length > 0) {
    searchData = data[0]; // Use first result
    console.log(`[EXTRACT_CONTACT] Data is array, using first element`);
  }
  
  // CRITICAL: Log the actual data structure to see what we're working with
  console.log(`[EXTRACT_CONTACT] Full data structure:`, JSON.stringify(searchData, null, 2).substring(0, 500));

  // Try various phone field names - check ALL possible locations
  if (!phone) {
    const phoneCandidates = [
      // Direct fields
      searchData?.phone,
      searchData?.phoneNumber,
      searchData?.phone_number,
      searchData?.contact_phone,
      searchData?.mobile,
      searchData?.cell,
      searchData?.primaryPhone,
      searchData?.primary_phone,
      searchData?.mobile_1,
      searchData?.landline_1,
      // Nested objects
      searchData?.contact?.phone,
      searchData?.person?.phone,
      searchData?.data?.phone,
      // Array fields (if phones is an array)
      Array.isArray(searchData?.phones) ? searchData.phones[0]?.value || searchData.phones[0] : null,
      Array.isArray(searchData?.phoneNumbers) ? searchData.phoneNumbers[0] : null,
    ].filter(Boolean);
    
    console.log(`[EXTRACT_CONTACT] Phone candidates found:`, phoneCandidates.length);
    
    if (phoneCandidates.length > 0) {
      phone = String(phoneCandidates[0]).trim();
      // Clean phone number
      const cleaned = phone.replace(/[^\d+]/g, '');
      if (cleaned.length >= 10) {
        phone = cleaned;
      }
      console.log(`[EXTRACT_CONTACT] ✅ Found phone: ${phone.substring(0, 10)}...`);
    } else {
      console.log(`[EXTRACT_CONTACT] ❌ No phone found in data`);
      console.log(`[EXTRACT_CONTACT] Available keys:`, Object.keys(searchData || {}));
    }
  }

  // Try various email field names - check ALL possible locations
  if (!email) {
    const emailCandidates = [
      // Direct fields
      searchData?.email,
      searchData?.emailAddress,
      searchData?.email_address,
      searchData?.contact_email,
      searchData?.primaryEmail,
      searchData?.primary_email,
      searchData?.email_1,
      // Nested objects
      searchData?.contact?.email,
      searchData?.person?.email,
      searchData?.data?.email,
      // Array fields (if emails is an array)
      Array.isArray(searchData?.emails) ? searchData.emails[0]?.value || searchData.emails[0] : null,
      Array.isArray(searchData?.emailAddresses) ? searchData.emailAddresses[0] : null,
    ].filter(Boolean);
    
    console.log(`[EXTRACT_CONTACT] Email candidates found:`, emailCandidates.length);
    
    if (emailCandidates.length > 0) {
      email = String(emailCandidates[0]).trim();
      if (email.includes('@')) {
        console.log(`[EXTRACT_CONTACT] ✅ Found email: ${email.substring(0, 20)}...`);
      } else {
        console.log(`[EXTRACT_CONTACT] ⚠️  Found email-like value but no @ symbol: ${email}`);
        email = null; // Invalid email
      }
    } else {
      console.log(`[EXTRACT_CONTACT] ❌ No email found in data`);
      console.log(`[EXTRACT_CONTACT] Available keys:`, Object.keys(searchData || {}));
    }
  }

  console.log(`[EXTRACT_CONTACT] Final extraction:`, {
    phone: phone || 'NONE',
    email: email || 'NONE',
  });

  return { phone, email };
}

/**
 * Helper: Extracts phone/email from nested data structures (skip-tracing v2, etc.)
 */
function extractContactFromNestedData(
  data: any,
  currentPhone: string | null,
  currentEmail: string | null
): { phone: string | null; email: string | null } {
  // Handle nested structures (addressSearch, nameAddressSearch, etc.)
  const nested = data?.addressSearch || data?.nameAddressSearch || data;
  return extractContactFromData(nested, currentPhone, currentEmail);
}

/**
 * Helper: Extracts phone/email from array of contacts
 */
function extractContactFromArray(
  contacts: any[],
  currentPhone: string | null,
  currentEmail: string | null
): { phone: string | null; email: string | null } {
  let phone = currentPhone;
  let email = currentEmail;

  for (const contact of contacts) {
    const extracted = extractContactFromData(contact, phone, email);
    if (extracted.phone) phone = extracted.phone;
    if (extracted.email) email = extracted.email;
    if (phone && email) break; // Found both, stop searching
  }

  return { phone, email };
}

/**
 * Helper: Adds error to result (handles concatenation)
 */
function addError(result: EnrichmentResult, error: string): void {
  if (!result.error) {
    result.error = error;
  } else {
    result.error += ` | ${error}`;
  }
}

/**
 * Helper: Checks if we have all critical data (phone, email, DOB, address)
 * Note: Must be defined after hasDOBOrAge and hasAddressData
 */
function hasAllCriticalData(
  phone: string | null,
  email: string | null,
  row: Record<string, string | number>,
  headers: string[]
): boolean {
  return !!(
    phone &&
    email &&
    hasDOBOrAge(row, headers) &&
    hasAddressData(row, headers)
  );
}

/**
 * Gatekeep logic - determines if we should continue with age enrichment
 * STEP 5: MONEY SAVER - Cuts 30-60% of waste
 */
function shouldContinueEnrichment(
  phone: string | null,
  lineType: string | undefined,
  carrierName: string | undefined,
  city: string | null,
  state: string | null,
  skipTracingCity?: string,
  skipTracingState?: string
): boolean {
  // IF phone not found → STOP
  if (!phone) return false;
  
  // IF linetype = VOIP → STOP
  if (lineType?.toLowerCase() === 'voip') return false;
  
  // IF carrier ∈ junk_carriers → STOP
  const junkCarriers = ['google voice', 'textnow', 'burner', 'hushed', 'line2', 'bandwidth', 'twilio'];
  if (carrierName && junkCarriers.some(junk => carrierName.toLowerCase().includes(junk))) {
    return false;
  }
  
  // IF geo mismatch → STOP (if we have location data from skip-tracing)
  if (skipTracingCity && skipTracingState && city && state) {
    const normalizedCity = city.toLowerCase().trim();
    const normalizedState = state.toLowerCase().trim();
    const normalizedStCity = skipTracingCity.toLowerCase().trim();
    const normalizedStState = skipTracingState.toLowerCase().trim();
    
    // If states don't match, stop
    if (normalizedState !== normalizedStState) return false;
    
    // If cities are very different, stop (allow some variation)
    if (normalizedCity && normalizedStCity && 
        !normalizedCity.includes(normalizedStCity) && 
        !normalizedStCity.includes(normalizedCity)) {
      return false;
    }
  }
  
  return true;
}

/**
 * OPTIMIZED ENRICHMENT PIPELINE
 * Order of operations (EXACT):
 * 1. LinkedIn (Sales Nav) → First name, last name, city, state
 * 2. Local geo DB → Zipcode (free)
 * 3. Skip trace (phones only) → Get a phone number (address only if bundled)
 * 4. Telnyx Number Lookup → Linetype + carrier
 * 5. Skip trace (conditional) → Age only if the number is valid (not VoIP/junk)
 * 
 * API CALLS PER LEAD:
 * - STEP 3: 1 skip-tracing search call (phones only)
 * - STEP 3: 0-1 person details call (only if search doesn't have phone)
 * - STEP 4: 1 Telnyx call (only if we have phone)
 * - STEP 6: 0-1 skip-tracing age call (only if Telnyx validates AND age not in STEP 3 results)
 * MAX: 3 calls per lead (typically 1-2, often just 1-2 if age is in search results)
 */
export async function enrichRow(
  row: Record<string, string | number>,
  headers: string[],
  onProgress?: (step: EnrichmentProgress['step'], stepDetails?: EnrichmentProgress['stepDetails'], errors?: string[]) => void
): Promise<EnrichmentResult> {
  // DIAGNOSTIC: Log input row data
  const emailColumns = headers.filter(h => isEmailColumn(h));
  const phoneColumns = headers.filter(h => isPhoneColumn(h));
  console.log(`[ENRICH_ROW] Input row data for "${row['Name'] || 'UNKNOWN'}":`, {
    hasEmailColumn: !!row['Email'],
    hasPhoneColumn: !!row['Phone'],
    emailValue: row['Email'] || 'MISSING',
    phoneValue: row['Phone'] || 'MISSING',
    emailValueType: typeof row['Email'],
    phoneValueType: typeof row['Phone'],
    emailValueLength: row['Email'] ? String(row['Email']).length : 0,
    phoneValueLength: row['Phone'] ? String(row['Phone']).length : 0,
    emailColumns: emailColumns,
    phoneColumns: phoneColumns,
    allHeaders: headers,
  });

  // STEP 1: Extract LinkedIn data (already in row from scraping)
  const firstName = extractFirstName(row, headers);
  const lastName = extractLastName(row, headers);
  const city = extractCity(row, headers);
  let state = extractState(row, headers);
  
  console.log(`[ENRICH_ROW] STEP 1: Extracted LinkedIn data:`, {
    firstName: firstName || 'MISSING',
    lastName: lastName || 'MISSING',
    city: city || 'MISSING',
    state: state || 'MISSING',
    hasFirstName: !!firstName,
    hasLastName: !!lastName,
    hasBothNames: !!(firstName && lastName),
  });
  
  // Report LinkedIn step progress
  onProgress?.('linkedin', {
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    city: city || undefined,
    state: state || undefined,
  });
  
  // STEP 2: Local ZIP lookup (FREE, LOCAL - No API calls)
  let zipCode = extractZipCode(row, headers);
  if (!zipCode && city && state) {
    // Only use ZIP lookup on server-side (where fs is available)
    // On client-side, this will fall back to state centroids which don't need fs
    try {
      const { lookupZipFromCityState } = await import('./zipLookup');
      zipCode = lookupZipFromCityState(city, state);
    } catch (error) {
      // If import fails (client-side), skip ZIP lookup
      // The state centroids will still work without fs
      console.warn('ZIP lookup not available (client-side):', error);
    }
  }
  
  // Report ZIP step progress
  if (zipCode) {
    onProgress?.('zip', {
      zipCode,
      city: city || undefined,
      state: state || undefined,
    });
  }
  
  // Extract other initial data
  let email = extractEmail(row, headers);
  let phone = extractPhone(row, headers);
  const address = extractAddress(row, headers);

  // DIAGNOSTIC: Log extraction results
  console.log(`[ENRICH_ROW] After extractEmail/extractPhone:`, {
    extractedEmail: email || 'NULL',
    extractedPhone: phone || 'NULL',
    extractedEmailType: typeof email,
    extractedPhoneType: typeof phone,
    extractedEmailLength: email?.length || 0,
    extractedPhoneLength: phone?.length || 0,
  });
  
  const result: EnrichmentResult = {
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    zipCode: zipCode || undefined,
    phone: phone || undefined,
    email: email || undefined,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2,
  };
  
  // DIAGNOSTIC: Enhanced debug logging
  console.log(`[ENRICH_ROW] Initial data:`, {
    firstName,
    lastName,
    city,
    state,
    zipCode,
    phone: phone ? `${phone.substring(0, 5)}...` : 'none',
    email: email ? `${email.substring(0, 10)}...` : 'none',
    phoneSet: !!phone,
    emailSet: !!email,
    phoneInResult: !!result.phone,
    emailInResult: !!result.email,
  });
  
  // PHASE 3: Preserve initial phone/email before any API calls
  const initialPhone = phone;
  const initialEmail = email;
  console.log(`[ENRICH_ROW] PHASE 3: Preserving initial values:`, {
    initialPhone: initialPhone || 'NONE',
    initialEmail: initialEmail || 'NONE',
  });

  // STEP 3: Phone Discovery (Skip-tracing - PHONE ONLY, not age yet)
  // CRITICAL FIX: Run skip-tracing if we have name OR email, even if we don't have both
  // This is the PRIMARY way to get phone/email when LinkedIn summary doesn't have it
  const hasName = firstName && lastName;
  const hasEmail = !!email;
  
  console.log(`[ENRICH_ROW] STEP 3: Skip-tracing check:`, {
    hasPhone: !!phone,
    hasEmail,
    hasName,
    willRunSkipTracing: !phone && (hasEmail || hasName),
  });
  
  if (!phone && hasName) {
    // Use GET with name parameter (working API format)
    // Clean the name to remove emojis and special characters before API call
    const cleanedFirstName = cleanNameForAPI(firstName);
    const cleanedLastName = cleanNameForAPI(lastName);
    const fullName = `${cleanedFirstName} ${cleanedLastName}`.trim();
    
    // Build citystatezip if we have city and state
    let citystatezip = '';
    if (city && state) {
      citystatezip = `${city}, ${state}`;
      if (zipCode) {
        citystatezip += ` ${zipCode}`;
      }
    }
    
    console.log(`[ENRICH_ROW] STEP 3: Calling skip-tracing API for phone discovery:`, {
      name: fullName,
      originalName: `${firstName} ${lastName}`.trim(),
      citystatezip: citystatezip || 'none',
    });
    
    // Use bynameaddress if we have location, otherwise byname
    let searchUrl = '';
    if (citystatezip) {
      searchUrl = `/api/skip-tracing?name=${encodeURIComponent(fullName)}&citystatezip=${encodeURIComponent(citystatezip)}&page=1`;
    } else {
      searchUrl = `/api/skip-tracing?name=${encodeURIComponent(fullName)}&page=1`;
    }
    
    // Use GET to call skip-tracing API with name
      const { data, error } = await callAPIWithConfig(
      searchUrl,
        {},
        'Skip-tracing (Phone Discovery)',
        callAPIImpl
      );
      
      console.log(`[ENRICH_ROW] STEP 3: Skip-tracing API response:`, {
        hasData: !!data,
        hasError: !!error,
        dataKeys: data ? Object.keys(data) : [],
        errorMessage: error,
        dataPreview: data ? JSON.stringify(data).substring(0, 500) : 'none',
      });
      
      if (data) {
        // Check if API returned an error
        if (data.success === false || data.error) {
          console.error(`[ENRICH_ROW] STEP 3: Skip-tracing API returned error:`, data.error || data);
          addError(result, `Skip-tracing: ${data.error || 'Unknown error'}`);
        } else {
          // Extract actual data (might be wrapped in data property)
          const actualData = data.data || data;
          result.skipTracingData = actualData;
          
          console.log(`[ENRICH_ROW] STEP 3: Extracted actualData, keys:`, actualData ? Object.keys(actualData) : []);
          console.log(`[ENRICH_ROW] STEP 3: actualData.PeopleDetails exists:`, !!actualData.PeopleDetails);
          console.log(`[ENRICH_ROW] STEP 3: actualData.PeopleDetails is array:`, Array.isArray(actualData.PeopleDetails));
          console.log(`[ENRICH_ROW] STEP 3: actualData.PeopleDetails length:`, actualData.PeopleDetails?.length || 0);
          
          // Handle new API response format: { PeopleDetails: [...], Status: 200, ... }
          let responseData: any = null;
          if (actualData.PeopleDetails && Array.isArray(actualData.PeopleDetails) && actualData.PeopleDetails.length > 0) {
            // New API format - use first result
            responseData = actualData.PeopleDetails[0];
            console.log(`[ENRICH_ROW] STEP 3: Found ${actualData.PeopleDetails.length} results, using first match`);
            console.log(`[ENRICH_ROW] STEP 3: First result keys:`, Object.keys(responseData));
            console.log(`[ENRICH_ROW] STEP 3: First result preview:`, JSON.stringify(responseData).substring(0, 300));
            
            // STEP 3: PHONES ONLY - Do NOT extract age here (age comes later in STEP 6, conditionally)
            // Age extraction removed - will be done conditionally in STEP 6 after Telnyx validation
            
            // CRITICAL: Check if search results already have phone number BEFORE making person details call
            // This saves API calls - we only need person details if search doesn't have phone
            const searchPhone = responseData.Telephone || responseData.phone || responseData.phone_number || 
                               responseData['Phone Number'] || responseData['Phone'];
            
            console.log(`[ENRICH_ROW] STEP 3: Checking for phone in search results:`, {
              hasTelephone: !!responseData.Telephone,
              hasPhone: !!responseData.phone,
              hasPhoneNumber: !!responseData.phone_number,
              hasPhoneNumberField: !!responseData['Phone Number'],
              hasPhoneField: !!responseData['Phone'],
              searchPhoneValue: searchPhone || 'NOT_FOUND',
              currentPhone: phone || 'NONE',
            });
            
            if (searchPhone && !phone) {
              // Clean phone: remove all non-digits except leading +
              phone = String(searchPhone).replace(/[^\d+]/g, '');
              // Remove leading + if present (US numbers)
              if (phone.startsWith('+1')) {
                phone = phone.substring(2);
              } else if (phone.startsWith('+')) {
                phone = phone.substring(1);
              }
              if (phone.length >= 10) {
                result.phone = phone;
                console.log(`[ENRICH_ROW] ✅ STEP 3: Got phone from SEARCH RESULTS: ${phone.substring(0, 5)}... (saved API call!)`);
              } else {
                console.log(`[ENRICH_ROW] ⚠️  STEP 3: Search phone found but invalid length (${phone.length}): ${phone}`);
              }
            } else if (!searchPhone) {
              console.log(`[ENRICH_ROW] ⚠️  STEP 3: No phone found in search results for ${firstName} ${lastName}`);
            }
            
            // ONLY make person details call if we STILL don't have a phone number
            // This cuts API calls in half for leads where search already has phone
            if (responseData['Person ID'] && !phone) {
              console.log(`[ENRICH_ROW] STEP 3: No phone in search results, fetching person details for phone via Person ID: ${responseData['Person ID']}...`);
              
              try {
                // Call person details API directly
                // Note: The API endpoint works (tested directly), so we let it complete naturally
                const personDetailsResult = await callAPIWithConfig(
                  `/api/skip-tracing?peo_id=${encodeURIComponent(responseData['Person ID'])}`,
                  {},
                  'Skip-tracing (Person Details)',
                  callAPIImpl
                );
                
                const { data: personData, error: personError } = personDetailsResult;
                
                console.log(`[ENRICH_ROW] STEP 3: Person details API call completed:`, {
                  hasData: !!personData,
                  hasError: !!personError,
                  error: personError || 'none',
                });
                
                if (personError) {
                  console.log(`[ENRICH_ROW] ⚠️  STEP 3: Person details API error: ${personError}`);
                }
                
                if (personData && personData.data) {
                  const personDetails = personData.data;
                  console.log(`[ENRICH_ROW] STEP 3: Person details received, keys: ${Object.keys(personDetails).slice(0, 10).join(', ')}...`);
                  console.log(`[ENRICH_ROW] STEP 3: Person details has 'All Phone Details':`, !!personDetails['All Phone Details']);
                  console.log(`[ENRICH_ROW] STEP 3: 'All Phone Details' is array:`, Array.isArray(personDetails['All Phone Details']));
                  console.log(`[ENRICH_ROW] STEP 3: 'All Phone Details' length:`, personDetails['All Phone Details']?.length || 0);
                
                // Extract phone from "All Phone Details" array (prefer most recent/wireless)
                if (personDetails['All Phone Details'] && Array.isArray(personDetails['All Phone Details']) && personDetails['All Phone Details'].length > 0) {
                  console.log(`[ENRICH_ROW] STEP 3: Processing ${personDetails['All Phone Details'].length} phone details`);
                  // Prefer wireless phones, then most recently reported
                  const phones = personDetails['All Phone Details']
                    .filter((p: any) => p.phone_number)
                    .sort((a: any, b: any) => {
                      // Prefer wireless
                      if (a.phone_type === 'Wireless' && b.phone_type !== 'Wireless') return -1;
                      if (b.phone_type === 'Wireless' && a.phone_type !== 'Wireless') return 1;
                      // Then prefer most recent (extract date from last_reported)
                      const aDate = a.last_reported ? new Date(a.last_reported) : new Date(0);
                      const bDate = b.last_reported ? new Date(b.last_reported) : new Date(0);
                      return bDate.getTime() - aDate.getTime();
                    });
                  
                  if (phones.length > 0) {
                    const phoneNumber = phones[0].phone_number;
                    console.log(`[ENRICH_ROW] STEP 3: Selected phone from All Phone Details:`, {
                      phoneNumber,
                      phoneType: phones[0].phone_type,
                      lastReported: phones[0].last_reported,
                    });
                    // Clean phone: remove all non-digits except leading +
                    phone = String(phoneNumber).replace(/[^\d+]/g, '');
                    // Remove leading + if present (US numbers)
                    if (phone.startsWith('+1')) {
                      phone = phone.substring(2);
                    } else if (phone.startsWith('+')) {
                      phone = phone.substring(1);
                    }
                    if (phone.length >= 10) {
                      result.phone = phone;
                      console.log(`[ENRICH_ROW] ✅ STEP 3: Got phone from person details: ${phone.substring(0, 5)}... (${phones[0].phone_type})`);
                    } else {
                      console.log(`[ENRICH_ROW] ⚠️  STEP 3: Phone from person details invalid length (${phone.length}): ${phone}`);
                    }
                  } else {
                    console.log(`[ENRICH_ROW] ⚠️  STEP 3: No valid phones found in All Phone Details array`);
                  }
                } else {
                  console.log(`[ENRICH_ROW] ⚠️  STEP 3: 'All Phone Details' not found or empty in person details`);
                }
                
                // Fallback: check Person Details Telephone field
                if (!phone && personDetails['Person Details'] && Array.isArray(personDetails['Person Details']) && personDetails['Person Details'].length > 0) {
                  const telephone = personDetails['Person Details'][0].Telephone;
                  console.log(`[ENRICH_ROW] STEP 3: Checking Person Details Telephone field:`, telephone || 'NOT_FOUND');
                  if (telephone) {
                    // Clean phone: remove all non-digits except leading +
                    phone = String(telephone).replace(/[^\d+]/g, '');
                    // Remove leading + if present (US numbers)
                    if (phone.startsWith('+1')) {
                      phone = phone.substring(2);
                    } else if (phone.startsWith('+')) {
                      phone = phone.substring(1);
                    }
                    if (phone.length >= 10) {
                      result.phone = phone;
                      console.log(`[ENRICH_ROW] ✅ STEP 3: Got phone from Person Details: ${phone.substring(0, 5)}...`);
                    } else {
                      console.log(`[ENRICH_ROW] ⚠️  STEP 3: Person Details Telephone invalid length (${phone.length}): ${phone}`);
                    }
                  }
                } else if (!phone) {
                  console.log(`[ENRICH_ROW] ⚠️  STEP 3: No phone found in person details for ${firstName} ${lastName}`);
                  console.log(`[ENRICH_ROW] STEP 3: Person Details structure:`, {
                    hasPersonDetails: !!personDetails['Person Details'],
                    isArray: Array.isArray(personDetails['Person Details']),
                    length: personDetails['Person Details']?.length || 0,
                  });
                }
                
                // Extract state from Current Address Details List
                if (personDetails['Current Address Details List'] && Array.isArray(personDetails['Current Address Details List']) && personDetails['Current Address Details List'].length > 0) {
                  const currentAddress = personDetails['Current Address Details List'][0];
                  if (currentAddress.address_region && !state) {
                    state = currentAddress.address_region;
                    console.log(`[ENRICH_ROW] ✅ STEP 3: Updated state from skip-tracing address: ${state}`);
                  }
                }
                
                // Extract email addresses if available
                console.log(`[ENRICH_ROW] STEP 3: Checking for email in person details:`, {
                  hasEmailAddresses: !!personDetails['Email Addresses'],
                  isArray: Array.isArray(personDetails['Email Addresses']),
                  length: personDetails['Email Addresses']?.length || 0,
                  currentEmail: email || 'NONE',
                });
                if (personDetails['Email Addresses'] && Array.isArray(personDetails['Email Addresses']) && personDetails['Email Addresses'].length > 0 && !email) {
                  const firstEmail = personDetails['Email Addresses'][0];
                  console.log(`[ENRICH_ROW] STEP 3: First email from person details:`, firstEmail || 'NOT_FOUND');
                  if (firstEmail && firstEmail.includes('@')) {
                    email = firstEmail;
                    result.email = email || undefined;
                    if (email) {
                      console.log(`[ENRICH_ROW] ✅ STEP 3: Got email from person details: ${email.substring(0, 10)}...`);
                    }
                  } else {
                    console.log(`[ENRICH_ROW] ⚠️  STEP 3: Email from person details invalid or missing @: ${firstEmail}`);
                  }
                } else if (!email) {
                  console.log(`[ENRICH_ROW] ⚠️  STEP 3: No email found in person details for ${firstName} ${lastName}`);
                }
                
                // Extract ZIP code from Current Address Details List (more accurate than LinkedIn location)
                if (personDetails['Current Address Details List'] && Array.isArray(personDetails['Current Address Details List']) && personDetails['Current Address Details List'].length > 0) {
                  const currentAddress = personDetails['Current Address Details List'][0];
                  if (currentAddress.postal_code) {
                    const skipTracingZip = String(currentAddress.postal_code).trim();
                    if (skipTracingZip && skipTracingZip.length >= 5) {
                      zipCode = skipTracingZip;
                      result.zipCode = zipCode;
                      console.log(`[ENRICH_ROW] ✅ STEP 3: Updated ZIP from skip-tracing address: ${zipCode}`);
                    }
                  }
                }
                
                // STEP 3: PHONES ONLY - Do NOT extract age here
                // Age will be extracted conditionally in STEP 6 after Telnyx validation
              } else {
                console.log(`[ENRICH_ROW] ⚠️  STEP 3: Person details API returned no data or invalid structure`);
              }
              } catch (error) {
                console.log(`[ENRICH_ROW] ❌ STEP 3: Exception fetching person details:`, error instanceof Error ? error.message : String(error));
              }
            }
            
            // If we still don't have phone/email, try extracting from responseData
            if (!phone || !email) {
              const extracted = extractContactFromData(responseData || actualData, phone, email);
              
              console.log(`[ENRICH_ROW] STEP 3: Extracted from skip-tracing:`, {
                extractedPhone: extracted.phone ? `${extracted.phone.substring(0, 5)}...` : 'NONE',
                extractedEmail: extracted.email ? `${extracted.email.substring(0, 10)}...` : 'NONE',
                currentPhone: phone ? `${phone.substring(0, 5)}...` : 'NONE',
                currentEmail: email ? `${email.substring(0, 10)}...` : 'NONE',
              });
              
              // PHASE 3: CRITICAL FIX - Update phone/email from skip-tracing
              // This is the PRIMARY source of contact data when LinkedIn doesn't have it
              if (extracted.phone && !phone) {
                phone = extracted.phone;
                result.phone = phone;
                console.log(`[ENRICH_ROW] ✅ PHASE 3: Updated phone from skip-tracing: ${phone.substring(0, 5)}...`);
              } else if (!extracted.phone) {
                console.log(`[ENRICH_ROW] ⚠️  PHASE 3: Skip-tracing did not return phone`);
              }
              
              if (extracted.email && !email) {
                email = extracted.email;
                result.email = email ?? undefined;
                console.log(`[ENRICH_ROW] ✅ PHASE 3: Updated email from skip-tracing: ${email.substring(0, 10)}...`);
              } else if (!extracted.email) {
                console.log(`[ENRICH_ROW] ⚠️  PHASE 3: Skip-tracing did not return email`);
              }
            }
          } else if (Array.isArray(actualData) && actualData.length > 0) {
            // Fallback: array format
            responseData = actualData[0];
            const extracted = extractContactFromData(responseData, phone, email);
            if (extracted.phone && !phone) {
              phone = extracted.phone;
              result.phone = phone;
            }
            if (extracted.email && !email) {
              email = extracted.email;
              result.email = email ?? undefined;
            }
          } else {
            // Fallback: direct object
            responseData = actualData;
            const extracted = extractContactFromData(responseData, phone, email);
            if (extracted.phone && !phone) {
              phone = extracted.phone;
              result.phone = phone;
            }
            if (extracted.email && !email) {
              email = extracted.email;
              result.email = email ?? undefined;
            }
          }
          
          console.log(`[ENRICH_ROW] After skip-tracing:`, {
            phone: phone ? `${phone.substring(0, 5)}...` : 'none',
            email: email ? `${email.substring(0, 10)}...` : 'none',
          });
          
          // Report phone discovery step progress
          onProgress?.('phone-discovery', {
            phone: phone || undefined,
            email: email || undefined,
            zipCode: zipCode || undefined,
          });
        
        // Extract address if bundled (optional)
          const addressData = responseData || actualData;
          if (addressData?.address || addressData?.addressLine1) {
            result.addressLine1 = addressData.address || addressData.addressLine1;
        }
          if (addressData?.addressLine2) {
            result.addressLine2 = addressData.addressLine2;
          }
        }
      } else {
        console.log(`[ENRICH_ROW] ⚠️  STEP 3: Skip-tracing API returned no data`);
      }
      if (error) {
        console.error(`[ENRICH_ROW] ❌ STEP 3: Skip-tracing API error:`, error);
        addError(result, error);
    }
  } else {
    // We already have phone/email from row - ensure they're in result
    if (phone) {
      result.phone = phone;
      console.log(`[ENRICH_ROW] PHASE 3: Preserved phone from row: ${phone.substring(0, 5)}...`);
    }
    if (email) {
      result.email = email ?? undefined;
      const emailStr = email;
      console.log(`[ENRICH_ROW] PHASE 3: Preserved email from row: ${emailStr.substring(0, 10)}...`);
    }
  }
  
  // STEP 4: Telnyx Phone Intelligence (CRITICAL)
  if (phone) {
    console.log(`[ENRICH_ROW] Calling Telnyx for phone: ${phone.substring(0, 5)}...`);
    const { data, error } = await callAPIWithConfig(
      `/api/telnyx/lookup?phone=${encodeURIComponent(phone)}`,
      {},
      'Telnyx',
      callAPIImpl
    );
    
    if (data) {
      result.telnyxLookupData = data;
      // Handle nested response structure: data.data.portability or data.portability
      const telnyxData = data.data?.data || data.data || data;
      
      console.log(`[ENRICH_ROW] STEP 4: Telnyx data structure:`, {
        hasData: !!data.data,
        hasNestedData: !!data.data?.data,
        portabilityKeys: telnyxData?.portability ? Object.keys(telnyxData.portability) : [],
        carrierKeys: telnyxData?.carrier ? Object.keys(telnyxData.carrier) : [],
      });
      
      if (telnyxData?.portability?.line_type) {
        result.lineType = telnyxData.portability.line_type;
        console.log(`[ENRICH_ROW] ✅ STEP 4: Extracted line_type: ${result.lineType}`);
      }
      if (telnyxData?.carrier) {
        result.carrierName = telnyxData.carrier.name;
        result.carrierType = telnyxData.carrier.type;
        result.normalizedCarrier = telnyxData.carrier.normalized_carrier;
        console.log(`[ENRICH_ROW] ✅ STEP 4: Extracted carrier: ${result.carrierName} (${result.carrierType})`);
      }
      
      // Report Telnyx step progress
      onProgress?.('telnyx', {
        phone: phone || undefined,
        lineType: result.lineType,
        carrier: result.carrierName,
      });
    }
    if (error) {
      addError(result, error);
      onProgress?.('telnyx', undefined, [error]);
    }
  }
  
  // STEP 5: GATEKEEP (MONEY SAVER - Cuts 30-60% of waste)
  const skipTracingData = result.skipTracingData as any;
  const shouldContinue = shouldContinueEnrichment(
    phone,
    result.lineType,
    result.carrierName,
    city,
    state,
    skipTracingData?.city,
    skipTracingData?.state
  );
  
  // Report gatekeep step progress
  onProgress?.('gatekeep', {
    phone: phone || undefined,
    lineType: result.lineType,
    carrier: result.carrierName,
  }, shouldContinue ? undefined : ['Gatekeep failed: Skipping age enrichment']);
  
  // STEP 6: Age (CONDITIONAL - Only if Telnyx confirms valid number)
  // Age enrichment ONLY runs on high-quality leads (not VoIP/junk)
  // CRITICAL OPTIMIZATION: Reuse STEP 3 search results to avoid duplicate API calls
  if (shouldContinue && !hasDOBOrAge(row, headers) && firstName && lastName && phone) {
    // First, check if we already have age data from STEP 3 search results
    const skipTracingData = result.skipTracingData as any;
    let ageFromStep3: string | null = null;
    
    if (skipTracingData?.PeopleDetails && Array.isArray(skipTracingData.PeopleDetails) && skipTracingData.PeopleDetails.length > 0) {
      const step3Result = skipTracingData.PeopleDetails[0];
      if (step3Result?.Age) {
        ageFromStep3 = String(step3Result.Age);
        console.log(`[ENRICH_ROW] STEP 6: Found age in STEP 3 search results: ${ageFromStep3} (saving API call!)`);
      }
    } else if (skipTracingData?.Age) {
      ageFromStep3 = String(skipTracingData.Age);
      console.log(`[ENRICH_ROW] STEP 6: Found age in STEP 3 data: ${ageFromStep3} (saving API call!)`);
    }
    
    if (ageFromStep3) {
      // Use age from STEP 3 - no additional API call needed
      result.age = ageFromStep3;
      console.log(`[ENRICH_ROW] ✅ STEP 6: Using age from STEP 3 search results: ${result.age}`);
    } else if (skipTracingData && (skipTracingData.PeopleDetails?.length > 0 || Object.keys(skipTracingData).length > 0)) {
      // STEP 3 had results but no age - check person details if we have Person ID
      // CRITICAL: Only make person details call if we didn't already make it in STEP 3
      const step3Result = skipTracingData.PeopleDetails?.[0] || skipTracingData;
      const personId = step3Result?.['Person ID'] || step3Result?.person_id;
      
      if (personId && !phone) {
        // We already made person details call in STEP 3 (because we needed phone)
        // Age should have been in person details - if not, it's not available
        console.log(`[ENRICH_ROW] STEP 6: Person details already fetched in STEP 3, age not available`);
      } else if (personId) {
        // We have Person ID but didn't fetch person details in STEP 3 (phone was in search)
        // Fetch person details now for age
        console.log(`[ENRICH_ROW] STEP 6: Fetching person details for age via Person ID: ${personId}...`);
        
        try {
          const personDetailsResult = await callAPIWithConfig(
            `/api/skip-tracing?peo_id=${encodeURIComponent(personId)}`,
            {},
            'Skip-tracing (Person Details - Age)',
            callAPIImpl
          );
          
          const { data: personData, error: personError } = personDetailsResult;
          
          if (personError) {
            console.log(`[ENRICH_ROW] ⚠️  STEP 6: Person details API error: ${personError}`);
          } else if (personData?.data) {
            const personDetails = personData.data;
            
            // Extract age from person details
            if (personDetails['Person Details'] && Array.isArray(personDetails['Person Details']) && personDetails['Person Details'].length > 0) {
              const age = personDetails['Person Details'][0].Age;
              if (age) {
                result.age = String(age);
                console.log(`[ENRICH_ROW] ✅ STEP 6: Got age from person details: ${result.age}`);
              }
            }
          }
        } catch (error) {
          console.log(`[ENRICH_ROW] ❌ STEP 6: Exception fetching person details for age:`, error instanceof Error ? error.message : String(error));
        }
      } else {
        // No Person ID and no age in search results - age not available without making new search
        // CRITICAL OPTIMIZATION: Don't make duplicate search call - age is not available
        console.log(`[ENRICH_ROW] STEP 6: Age not available in STEP 3 results and no Person ID - skipping duplicate search call`);
      }
    } else {
      // STEP 3 had no results at all - age not available
      console.log(`[ENRICH_ROW] STEP 6: STEP 3 had no results - age not available`);
    }
  } else if (!shouldContinue) {
    console.log(`[ENRICH_ROW] STEP 6: Skipping age enrichment - number not validated by Telnyx (VoIP/junk/geo mismatch)`);
  }
  
  // Report completion
  onProgress?.('complete', {
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    city: city || undefined,
    state: state || undefined,
    zipCode: result.zipCode || zipCode || undefined,
    phone: result.phone || phone || undefined,
    email: result.email || email || undefined,
    lineType: result.lineType,
    carrier: result.carrierName,
    age: result.age,
  }, result.error ? [result.error] : undefined);
  
  // PHASE 3: FINAL PRESERVATION - Ensure phone/email from row are preserved if APIs didn't find them
  // This is critical - the row data (from LinkedIn summary extraction) must be preserved
  // Check initial values first, then current values
  if (!result.phone) {
    if (initialPhone) {
      result.phone = initialPhone;
      phone = initialPhone;
      console.log(`[ENRICH_ROW] PHASE 3 FINAL: Restored phone from initial value: ${initialPhone.substring(0, 5)}...`);
    } else if (phone) {
      result.phone = phone;
      console.log(`[ENRICH_ROW] PHASE 3 FINAL: Preserved phone from current value: ${phone.substring(0, 5)}...`);
    }
  }
  if (!result.email) {
    if (initialEmail) {
      result.email = initialEmail;
      email = initialEmail;
      console.log(`[ENRICH_ROW] PHASE 3 FINAL: Restored email from initial value: ${initialEmail.substring(0, 10)}...`);
    } else if (email) {
      result.email = email ?? undefined;
      const emailStr = email;
      console.log(`[ENRICH_ROW] PHASE 3 FINAL: Preserved email from current value: ${emailStr.substring(0, 10)}...`);
    }
  }
  // Update ZIP code if we have a better one from skip-tracing, otherwise use initial lookup
  if (zipCode && (!result.zipCode || result.zipCode === '21201')) {
    // Only update if we don't have one, or if it's still the MD centroid (likely wrong)
    result.zipCode = zipCode;
    console.log(`[ENRICH_ROW] PHASE 3 FINAL: Preserved zipCode: ${zipCode}`);
  }
  
  // DIAGNOSTIC: Enhanced final result logging
  console.log(`[ENRICH_ROW] Final EnrichmentResult:`, {
    phone: result.phone || 'MISSING',
    email: result.email || 'MISSING',
    phoneSource: result.phone ? 'SET' : 'NOT_SET',
    emailSource: result.email ? 'SET' : 'NOT_SET',
    phoneValue: result.phone ? String(result.phone).substring(0, 10) : 'N/A',
    emailValue: result.email ? String(result.email).substring(0, 20) : 'N/A',
    hasZipCode: !!result.zipCode,
    hasAge: !!result.age,
    hasLineType: !!result.lineType,
    hasCarrier: !!result.carrierName,
    zipCode: result.zipCode || 'MISSING',
    age: result.age || 'MISSING',
  });
  
  return result;
}

/**
 * Enriches all rows in parsed data
 * @param data - The parsed data to enrich
 * @param onProgress - Optional callback for progress updates (enhanced with detailed info)
 * @returns Promise with enriched data
 */
export async function enrichData(
  data: ParsedData,
  onProgress?: (current: number, total: number) => void,
  onDetailedProgress?: (progress: EnrichmentProgress) => void
): Promise<EnrichedData> {
  const enrichedRows: EnrichedRow[] = [];

  for (let i = 0; i < data.rows.length; i++) {
    const row = data.rows[i];
    const leadName = String(row['Name'] || row['First Name'] + ' ' + row['Last Name'] || `Lead ${i + 1}`).trim();
    
    // Check if lead has already been processed (duplicate detection)
    if (isLeadProcessed(row)) {
      const leadKey = getLeadKey(row);
      console.log(`⏭️  [ENRICH_DATA] Skipping already processed lead: ${leadName} (${leadKey})`);
      
      // Still report progress for skipped leads
      if (onProgress) {
        onProgress(i + 1, data.rows.length);
      }
      if (onDetailedProgress) {
        onDetailedProgress({
          current: i + 1,
          total: data.rows.length,
          leadName,
          step: 'complete',
          stepDetails: {},
          timestamp: Date.now(),
        });
      }
      
      // Try to load existing enriched data for this lead
      // This ensures we don't lose data even if we skip enrichment
      continue; // Skip to next lead to avoid duplicate API calls
    }
    
    const enrichedRow: EnrichedRow = { ...row };

    // Enhanced progress callback
    const reportProgress = (step: EnrichmentProgress['step'], stepDetails?: EnrichmentProgress['stepDetails'], errors?: string[]) => {
      if (onDetailedProgress) {
        onDetailedProgress({
          current: i + 1,
          total: data.rows.length,
          leadName,
          step,
          stepDetails,
          errors,
          timestamp: Date.now(),
        });
      }
      // Also call simple progress callback for backward compatibility
      if (onProgress) {
        onProgress(i + 1, data.rows.length);
      }
    };

    // Enrich the row with progress tracking
    const enrichment = await enrichRow(row, data.headers, reportProgress);
    enrichedRow._enriched = enrichment;

    // Extract and add Telnyx line_type to the row if available
    // Handle nested response structure: data.data.portability or data.portability
    if (enrichment.telnyxLookupData) {
      const telnyxData = enrichment.telnyxLookupData as any;
      const telnyxResponse = telnyxData.data?.data || telnyxData.data || telnyxData;
      if (telnyxResponse?.portability?.line_type) {
        enrichedRow['Line Type'] = telnyxResponse.portability.line_type;
      }
      if (telnyxResponse?.carrier?.name) {
        enrichedRow['Carrier'] = telnyxResponse.carrier.name;
      }
      if (telnyxResponse?.carrier?.normalized_carrier) {
        enrichedRow['Normalized Carrier'] = telnyxResponse.carrier.normalized_carrier;
      }
    }
    // Also use the extracted lineType from enrichment if available (preferred, already parsed)
    if (enrichment.lineType) {
      enrichedRow['Line Type'] = enrichment.lineType;
    }
    if (enrichment.carrierName) {
      enrichedRow['Carrier'] = enrichment.carrierName;
    }
    if (enrichment.normalizedCarrier) {
      enrichedRow['Normalized Carrier'] = enrichment.normalizedCarrier;
    }
    
    // Add age/DOB to row if available (from optimized pipeline)
    if (enrichment.age) {
      enrichedRow['Age'] = enrichment.age;
    }
    if (enrichment.dob) {
      enrichedRow['DOB'] = enrichment.dob;
    }
    
    // Add zipCode to row if available
    if (enrichment.zipCode) {
      // Try common zipcode column names
      const zipCol = data.headers.find(h => 
        h.toLowerCase().includes('zip') || 
        h.toLowerCase().includes('postal') ||
        h.toLowerCase() === 'zipcode' ||
        h.toLowerCase() === 'zip_code'
      );
      if (zipCol) {
        enrichedRow[zipCol] = enrichment.zipCode;
      } else {
        // Default to 'Zipcode' if no matching column found
        enrichedRow['Zipcode'] = enrichment.zipCode;
      }
    }
    
    // CRITICAL: Preserve phone/email from enrichment, or keep valid row values
    // This ensures extractLeadSummary can read them from the row
    // Always save enrichment phone if found, even if row has empty string
    if (enrichment.phone) {
      const currentPhone = String(enrichedRow['Phone'] || '').trim();
      const enrichmentPhone = String(enrichment.phone).trim();
      // Only update if current phone is empty/invalid or enrichment phone is better
      if (!currentPhone || currentPhone.length < 10 || currentPhone === 'EMPTY' || currentPhone === 'N/A') {
        enrichedRow['Phone'] = enrichmentPhone;
        console.log(`💾 [ENRICH_DATA] Saved phone to row for ${leadName}: ${enrichmentPhone.substring(0, 5)}...`);
      } else if (enrichmentPhone.length >= 10) {
        // Enrichment phone is valid, prefer it over existing
        enrichedRow['Phone'] = enrichmentPhone;
        console.log(`💾 [ENRICH_DATA] Updated phone in row for ${leadName}: ${enrichmentPhone.substring(0, 5)}...`);
      }
    }
    
    // Always save enrichment email if found, even if row has empty string
    if (enrichment.email) {
      const currentEmail = String(enrichedRow['Email'] || '').trim();
      const enrichmentEmail = String(enrichment.email).trim();
      // Only update if current email is empty/invalid or enrichment email is better
      if (!currentEmail || !currentEmail.includes('@') || currentEmail === 'EMPTY' || currentEmail === 'N/A') {
        enrichedRow['Email'] = enrichmentEmail;
        console.log(`💾 [ENRICH_DATA] Saved email to row for ${leadName}: ${enrichmentEmail.substring(0, 10)}...`);
      } else if (enrichmentEmail.includes('@')) {
        // Enrichment email is valid, prefer it over existing
        enrichedRow['Email'] = enrichmentEmail;
        console.log(`💾 [ENRICH_DATA] Updated email in row for ${leadName}: ${enrichmentEmail.substring(0, 10)}...`);
      }
    }
    
    // Preserve original row values if enrichment doesn't have them and row values are valid
    if (!enrichment.phone) {
      const rowPhone = String(enrichedRow['Phone'] || '').trim();
      if (rowPhone && rowPhone.length >= 10 && rowPhone !== 'EMPTY' && rowPhone !== 'N/A') {
        // Keep the original phone from row - it's valid
        console.log(`💾 [ENRICH_DATA] Preserved existing phone in row for ${leadName}: ${rowPhone.substring(0, 5)}...`);
      }
    }
    if (!enrichment.email) {
      const rowEmail = String(enrichedRow['Email'] || '').trim();
      if (rowEmail && rowEmail.includes('@') && rowEmail !== 'EMPTY' && rowEmail !== 'N/A') {
        // Keep the original email from row - it's valid
        console.log(`💾 [ENRICH_DATA] Preserved existing email in row for ${leadName}: ${rowEmail.substring(0, 10)}...`);
      }
    }

    // CRITICAL: Save immediately after enrichment to ensure data persistence
    try {
      const leadSummary = extractLeadSummary(enrichedRow, enrichment);
      saveEnrichedLeadImmediate(enrichedRow, leadSummary);
      console.log(`💾 [ENRICH_DATA] Saved lead immediately: ${leadName}`);
    } catch (saveError) {
      console.error(`❌ [ENRICH_DATA] Failed to save lead ${leadName}:`, saveError);
      // Continue processing even if save fails - don't lose the enrichment
    }

    enrichedRows.push(enrichedRow);

    // Call progress callback
    if (onProgress) {
      onProgress(i + 1, data.rows.length);
    }

    // Add small delay to avoid rate limiting
    if (i < data.rows.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  // Route enriched leads to configured destination
  try {
    const { routeEnrichedLeads } = await import('./outputRouter');
    await routeEnrichedLeads(enrichedRows);
  } catch (routingError) {
    // Don't fail enrichment if routing fails
    console.warn('[ENRICH_DATA] Failed to route leads:', routingError);
  }

  return {
    ...data,
    rows: enrichedRows,
  };
}

