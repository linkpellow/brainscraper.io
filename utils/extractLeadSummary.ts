/**
 * Extracts essential lead information from enriched data
 * Returns: Name, Zip, Age/DOB, City, State, Phone, DNC Status
 */

import { EnrichedRow, EnrichmentResult } from './enrichData';

export interface SourceDetails {
  // LinkedIn fields
  occupation?: string;
  jobTitle?: string;
  location?: string;
  isSelfEmployed?: boolean;
  changedJobs?: boolean;
  companySize?: string;
  // Facebook fields
  groupName?: string;
  groupId?: string;
  keywords?: string[];
  postId?: string;
  commentId?: string;
}

export interface LeadSummary {
  name: string;
  phone: string; // TOP PRIORITY
  dobOrAge: string; // DOB or Age
  zipcode: string;
  state: string;
  city: string;
  email: string;
  dncStatus: string; // "YES", "NO", or "UNKNOWN"
  dncLastChecked?: string; // ISO date string of last DNC check (YYYY-MM-DD format)
  income?: number; // Income value for sorting
  lineType?: string; // From Telnyx portability.line_type
  carrier?: string; // From Telnyx carrier.name
  normalizedCarrier?: string; // From Telnyx carrier.normalized_carrier
  searchFilter?: string; // Search filter summary from LinkedIn search (backward compatibility)
  dateScraped?: string; // Date when the lead was scraped/created
  linkedinUrl?: string; // LinkedIn profile URL
  platform?: 'linkedin' | 'facebook'; // Platform source identifier
  sourceDetails?: SourceDetails; // Structured source information
}

/**
 * Calculates age from date of birth
 */
function calculateAge(dob: string): string {
  if (!dob) return '';
  
  try {
    // Try various date formats
    const date = new Date(dob);
    if (isNaN(date.getTime())) return dob; // Return original if invalid
    
    const today = new Date();
    let age = today.getFullYear() - date.getFullYear();
    const monthDiff = today.getMonth() - date.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
      age--;
    }
    
    return age.toString();
  } catch {
    return dob; // Return original if can't parse
  }
}

/**
 * Extracts name from various sources
 */
function extractName(row: EnrichedRow, enriched: EnrichmentResult | undefined): string {
  // Try original row data first
  const firstName = row['First Name'] || row['FirstName'] || row['first_name'] || row['First'] || '';
  const lastName = row['Last Name'] || row['LastName'] || row['last_name'] || row['Last'] || '';
  
  if (firstName || lastName) {
    return `${firstName} ${lastName}`.trim();
  }
  
  // Try skip-tracing data
  if (enriched?.skipTracingData) {
    const st = enriched.skipTracingData as any;
    if (st.name || st.fullName || st.full_name) {
      return st.name || st.fullName || st.full_name;
    }
    if (st.firstName && st.lastName) {
      return `${st.firstName} ${st.lastName}`.trim();
    }
  }
  
  return '';
}

/**
 * Extracts zip code from various sources
 */
function extractZip(row: EnrichedRow, enriched: EnrichmentResult | undefined): string {
  // Try original row data
  const zip = row['Zip'] || row['ZIP'] || row['Zip Code'] || row['ZipCode'] || row['zip_code'] || row['Postal Code'] || row['PostalCode'] || '';
  if (zip) return String(zip);
  
  // Try skip-tracing data
  if (enriched?.skipTracingData) {
    const st = enriched.skipTracingData as any;
    if (st.zip || st.zipCode || st.zip_code) {
      return String(st.zip || st.zipCode || st.zip_code);
    }
  }
  
  return enriched?.zipCode || '';
}

/**
 * Extracts city from various sources
 */
function extractCity(row: EnrichedRow, enriched: EnrichmentResult | undefined): string {
  // Try original row data
  const city = row['City'] || row['city'] || '';
  if (city) return String(city);
  
  // Try skip-tracing data
  if (enriched?.skipTracingData) {
    const st = enriched.skipTracingData as any;
    if (st.city) return String(st.city);
  }
  
  return '';
}

/**
 * Extracts state from various sources
 */
function extractState(row: EnrichedRow, enriched: EnrichmentResult | undefined): string {
  // Try original row data
  const state = row['State'] || row['state'] || row['ST'] || row['Province'] || '';
  if (state) return String(state);
  
  // Try skip-tracing data
  if (enriched?.skipTracingData) {
    const st = enriched.skipTracingData as any;
    if (st.state) return String(st.state);
  }
  
  return '';
}

/**
 * Formats a phone number as (XXX) XXX-XXXX
 * Returns original string if not a valid 10-digit US phone number
 */
export function formatPhoneNumber(phone: string | undefined | null): string {
  if (!phone) return 'N/A';
  
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  // Check if it's a valid 10-digit US phone number
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  
  // If it's 11 digits and starts with 1, format as US number
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  
  // Return original if not valid format
  return phone;
}

/**
 * Extracts phone number from various sources - TOP PRIORITY
 */
function extractPhone(row: EnrichedRow, enriched: EnrichmentResult | undefined): string {
  // PHASE 4: Try original row data first, but check for empty strings
  const rowPhone = row['Phone'] || row['phone'] || row['Phone Number'] || row['PhoneNumber'] || row['phone_number'] || row['Mobile'] || row['mobile'] || row['Primary Phone'] || row['PrimaryPhone'] || '';
  const rowPhoneStr = String(rowPhone).trim();
  // Only use row phone if it's not empty and has valid length
  if (rowPhoneStr && rowPhoneStr.length >= 10 && rowPhoneStr !== 'EMPTY' && rowPhoneStr !== 'N/A') {
    return rowPhoneStr;
  }
  
  // PHASE 4: Try enriched data (from skip-tracing, etc.) - prefer non-empty values
  if (enriched?.phone) {
    const enrichedPhone = String(enriched.phone).trim();
    if (enrichedPhone && enrichedPhone.length >= 10 && enrichedPhone !== 'EMPTY' && enrichedPhone !== 'N/A') {
      return enrichedPhone;
    }
  }
  
  // Try skip-tracing data
  if (enriched?.skipTracingData) {
    const st = enriched.skipTracingData as any;
    if (st.phone || st.phoneNumber || st.phone_number) {
      return String(st.phone || st.phoneNumber || st.phone_number);
    }
  }
  
  // Try website extractor/contacts
  if (enriched?.websiteExtractorData) {
    const we = enriched.websiteExtractorData as any;
    if (we.phone || we.phoneNumber || we.contact_phone) {
      return String(we.phone || we.phoneNumber || we.contact_phone);
    }
  }
  
  if (enriched?.websiteContactsData) {
    const wc = enriched.websiteContactsData as any;
    const contacts = Array.isArray(wc) ? wc : (wc.contacts || wc.data || [wc]);
    for (const contact of contacts) {
      if (contact?.phone || contact?.phoneNumber || contact?.phone_number) {
        return String(contact.phone || contact.phoneNumber || contact.phone_number);
      }
    }
  }
  
  return '';
}

/**
 * Extracts email from various sources
 */
function extractEmail(row: EnrichedRow, enriched: EnrichmentResult | undefined): string {
  // PHASE 4: Try original row data first, but check for empty strings
  const rowEmail = row['Email'] || row['email'] || row['E-mail'] || row['Email Address'] || row['EmailAddress'] || row['email_address'] || '';
  const rowEmailStr = String(rowEmail).trim();
  // Only use row email if it's not empty and has @ symbol
  if (rowEmailStr && rowEmailStr.includes('@') && rowEmailStr !== 'EMPTY' && rowEmailStr !== 'N/A') {
    return rowEmailStr;
  }
  
  // PHASE 4: Try enriched data - prefer non-empty values
  if (enriched?.email) {
    const enrichedEmail = String(enriched.email).trim();
    if (enrichedEmail && enrichedEmail.includes('@') && enrichedEmail !== 'EMPTY' && enrichedEmail !== 'N/A') {
      return enrichedEmail;
    }
  }
  
  // Try skip-tracing data
  if (enriched?.skipTracingData) {
    const st = enriched.skipTracingData as any;
    if (st.email || st.emailAddress || st.email_address) {
      return String(st.email || st.emailAddress || st.email_address);
    }
  }
  
  // Try website extractor/contacts
  if (enriched?.websiteExtractorData) {
    const we = enriched.websiteExtractorData as any;
    if (we.email || we.emailAddress || we.contact_email) {
      return String(we.email || we.emailAddress || we.contact_email);
    }
  }
  
  if (enriched?.websiteContactsData) {
    const wc = enriched.websiteContactsData as any;
    const contacts = Array.isArray(wc) ? wc : (wc.contacts || wc.data || [wc]);
    for (const contact of contacts) {
      if (contact?.email || contact?.emailAddress || contact?.email_address) {
        return String(contact.email || contact.emailAddress || contact.email_address);
      }
    }
  }
  
  return '';
}

/**
 * Extracts DOB and age from various sources
 */
function extractDOBAndAge(row: EnrichedRow, enriched: EnrichmentResult | undefined): { dob: string; age: string } {
  // Try original row data
  const dob = row['Date Of Birth'] || row['DateOfBirth'] || row['date_of_birth'] || row['DOB'] || row['dob'] || row['Birth Date'] || row['BirthDate'] || '';
  if (dob) {
    const age = calculateAge(String(dob));
    return { dob: String(dob), age };
  }
  
  // Try enriched result directly (from optimized pipeline)
  if (enriched?.age) {
    return { dob: enriched.dob || '', age: enriched.age };
  }
  if (enriched?.dob) {
    const age = calculateAge(enriched.dob);
    return { dob: enriched.dob, age };
  }
  
  // Try skip-tracing data
  if (enriched?.skipTracingData) {
    const st = enriched.skipTracingData as any;
    if (st.dob || st.dateOfBirth || st.date_of_birth || st.birthDate) {
      const dobValue = String(st.dob || st.dateOfBirth || st.date_of_birth || st.birthDate);
      const age = calculateAge(dobValue);
      return { dob: dobValue, age };
    }
    if (st.age) {
      return { dob: '', age: String(st.age) };
    }
  }
  
  return { dob: '', age: '' };
}

/**
 * Extracts DNC status (needs to be merged from USHA scrub results)
 * This will be populated when USHA scrub data is available
 */
function extractDNCStatus(row: EnrichedRow, dncData?: { phone: string; isDoNotCall: boolean; canContact: boolean }): { dncStatus: string } {
  // Check if DNC data is attached to row
  if (dncData) {
    return {
      dncStatus: dncData.isDoNotCall ? 'YES' : 'NO',
    };
  }
  
  // Check if DNC data is in row
  const dnc = row['DNC'] || row['dnc'] || row['DoNotCall'] || row['Do Not Call'] || row['isDoNotCall'] || '';
  
  return {
    dncStatus: dnc ? (String(dnc).toUpperCase() === 'YES' || String(dnc) === 'true' ? 'YES' : 'NO') : 'UNKNOWN',
  };
}

/**
 * Extracts a clean lead summary from enriched row data
 * Includes: NAME, PHONE (TOP PRIORITY), DOB/AGE, ZIPCODE, STATE, CITY, ADDRESS, INCOME, EMAIL, DNC STATUS, LINE TYPE, CARRIER, NORMALIZED CARRIER
 */
export function extractLeadSummary(
  row: EnrichedRow,
  enriched: EnrichmentResult | undefined,
  dncData?: { phone: string; isDoNotCall: boolean; canContact: boolean },
  dateScraped?: string
): LeadSummary {
  // DIAGNOSTIC: Log input data
  const rowPhone = row['Phone'] || row['phone'] || '';
  const rowEmail = row['Email'] || row['email'] || '';
  console.log(`[EXTRACT_SUMMARY] Input for "${row['Name'] || 'UNKNOWN'}":`, {
    rowPhone: rowPhone || 'MISSING',
    rowEmail: rowEmail || 'MISSING',
    rowPhoneType: typeof rowPhone,
    rowEmailType: typeof rowEmail,
    rowPhoneLength: String(rowPhone).length,
    rowEmailLength: String(rowEmail).length,
    enrichedPhone: enriched?.phone || 'MISSING',
    enrichedEmail: enriched?.email || 'MISSING',
    enrichedPhoneType: typeof enriched?.phone,
    enrichedEmailType: typeof enriched?.email,
    enrichedPhoneLength: enriched?.phone ? String(enriched.phone).length : 0,
    enrichedEmailLength: enriched?.email ? String(enriched.email).length : 0,
    hasEnriched: !!enriched,
    hasSkipTracing: !!enriched?.skipTracingData,
  });

  const { dob, age } = extractDOBAndAge(row, enriched);
  const { dncStatus } = extractDNCStatus(row, dncData);
  
  // Use age if available, otherwise DOB
  const dobOrAge = age || dob || '';
  
  // Extract Telnyx line_type and carrier info
  let lineType = '';
  let carrier = '';
  let normalizedCarrier = '';
  
  if (enriched?.lineType) {
    lineType = enriched.lineType;
  } else if (enriched?.telnyxLookupData) {
    const telnyxData = enriched.telnyxLookupData as any;
    const telnyxResponse = telnyxData.data || telnyxData;
    if (telnyxResponse?.portability?.line_type) {
      lineType = telnyxResponse.portability.line_type;
    }
    if (telnyxResponse?.carrier?.name) {
      carrier = telnyxResponse.carrier.name;
    }
    if (telnyxResponse?.carrier?.normalized_carrier) {
      normalizedCarrier = telnyxResponse.carrier.normalized_carrier;
    }
  }
  
  // Also check if it's in the row directly (from enrichment process)
  if (!lineType && row['Line Type']) {
    lineType = String(row['Line Type']);
  }
  if (!carrier && row['Carrier']) {
    carrier = String(row['Carrier']);
  }
  if (!normalizedCarrier && row['Normalized Carrier']) {
    normalizedCarrier = String(row['Normalized Carrier']);
  }
  
  // Extract search filter from row (added during conversion)
  const searchFilter = row['Search Filter'] ? String(row['Search Filter']) : '';
  
  // Extract LinkedIn URL from row
  const linkedinUrl = row['LinkedIn URL'] || row['LinkedInURL'] || row['linkedin_url'] || row['linkedinUrl'] || row['navigationUrl'] || row['profile_url'] || row['url'] || '';
  
  // Extract date scraped from row or use provided date, or current date if not available
  const scrapedDateRaw = dateScraped || row['Date Scraped'] || row['date_scraped'] || row['DateScraped'] || new Date().toISOString().split('T')[0];
  const scrapedDate = scrapedDateRaw ? String(scrapedDateRaw) : new Date().toISOString().split('T')[0];
  
  // Extract platform from row
  const platformRaw = row['Platform'] || row['platform'] || '';
  const platform = (platformRaw === 'linkedin' || platformRaw === 'facebook') ? platformRaw as 'linkedin' | 'facebook' : undefined;
  
  // Extract sourceDetails from row (can be object or JSON string)
  let sourceDetails: SourceDetails | undefined;
  const sourceDetailsRaw = row['Source Details'] || row['sourceDetails'] || row['source_details'] || '';
  if (sourceDetailsRaw) {
    try {
      if (typeof sourceDetailsRaw === 'string') {
        sourceDetails = JSON.parse(sourceDetailsRaw);
      } else if (typeof sourceDetailsRaw === 'object') {
        sourceDetails = sourceDetailsRaw as SourceDetails;
      }
    } catch {
      // If parsing fails, try to construct from individual fields
      const getStringValue = (value: string | number | undefined): string | undefined => {
        if (value === undefined || value === null) return undefined;
        return String(value);
      };
      
      const getBoolValue = (value: string | number | boolean | undefined): boolean | undefined => {
        if (value === undefined || value === null) return undefined;
        if (typeof value === 'boolean') return value;
        const str = String(value).toLowerCase();
        return str === 'true' || str === 'yes' || str === '1' ? true : undefined;
      };
      
      sourceDetails = {
        occupation: getStringValue(row['Occupation'] || row['occupation']),
        jobTitle: getStringValue(row['Job Title'] || row['jobTitle'] || row['job_title'] || row['Title']),
        location: getStringValue(row['Location'] || row['location']),
        isSelfEmployed: getBoolValue(row['Is Self Employed'] || row['isSelfEmployed'] || row['is_self_employed']),
        changedJobs: getBoolValue(row['Changed Jobs'] || row['changedJobs'] || row['changed_jobs']),
        companySize: getStringValue(row['Company Size'] || row['companySize'] || row['company_size']),
        groupName: getStringValue(row['Group Name'] || row['groupName'] || row['group_name']),
        groupId: getStringValue(row['Group ID'] || row['groupId'] || row['group_id']),
        keywords: (() => {
          const keywordsValue = row['Keywords'] || row['keywords'];
          if (!keywordsValue) return undefined;
          if (Array.isArray(keywordsValue)) {
            return keywordsValue.map(k => String(k));
          }
          return String(keywordsValue).split(',').map(k => k.trim());
        })(),
        postId: getStringValue(row['Post ID'] || row['postId'] || row['post_id']),
        commentId: getStringValue(row['Comment ID'] || row['commentId'] || row['comment_id']),
      };
      // Remove undefined values
      if (sourceDetails) {
        Object.keys(sourceDetails).forEach(key => {
          if (sourceDetails![key as keyof SourceDetails] === undefined) {
            delete sourceDetails![key as keyof SourceDetails];
          }
        });
        if (Object.keys(sourceDetails).length === 0) {
          sourceDetails = undefined;
        }
      }
    }
  }
  
  // Extract income - try row first, then enriched data, convert to number
  let income: number | undefined;
  const rowIncome = row['Income'] || row['income'] || row['Household Income'] || row['household_income'] || '';
  if (rowIncome) {
    const incomeNum = typeof rowIncome === 'number' ? rowIncome : parseFloat(String(rowIncome).replace(/[^0-9.]/g, ''));
    if (!isNaN(incomeNum) && incomeNum > 0) {
      income = incomeNum;
    }
  }
  if (!income && enriched?.incomeData) {
    const incomeData = enriched.incomeData as any;
    const incomeValue = incomeData.income || incomeData.householdIncome || incomeData.value || incomeData;
    if (incomeValue) {
      const incomeNum = typeof incomeValue === 'number' ? incomeValue : parseFloat(String(incomeValue).replace(/[^0-9.]/g, ''));
      if (!isNaN(incomeNum) && incomeNum > 0) {
        income = incomeNum;
      }
    }
  }
  
  // Extract dncLastChecked from row if it exists (preserve existing value)
  const dncLastChecked = row['dncLastChecked'] || row['DNC Last Checked'] || row['dnc_last_checked'] || undefined;
  
  const summary: LeadSummary = {
    name: extractName(row, enriched),
    phone: extractPhone(row, enriched), // TOP PRIORITY
    dobOrAge,
    zipcode: extractZip(row, enriched),
    state: extractState(row, enriched),
    city: extractCity(row, enriched),
    email: extractEmail(row, enriched),
    dncStatus,
    ...(dncLastChecked && { dncLastChecked: String(dncLastChecked) }), // Preserve if exists
    income,
    lineType,
    carrier,
    normalizedCarrier,
    searchFilter,
    dateScraped: scrapedDate,
    linkedinUrl: linkedinUrl ? String(linkedinUrl) : undefined,
    platform,
    sourceDetails,
  };
  
  // DIAGNOSTIC: Enhanced debug logging
  console.log(`[EXTRACT_SUMMARY] Final summary for "${summary.name}":`, {
    phone: summary.phone || 'MISSING',
    email: summary.email || 'MISSING',
    phoneLength: summary.phone?.length || 0,
    emailLength: summary.email?.length || 0,
    zipcode: summary.zipcode || 'MISSING',
    city: summary.city || 'MISSING',
    state: summary.state || 'MISSING',
    dobOrAge: summary.dobOrAge || 'MISSING',
    lineType: summary.lineType || 'MISSING',
    carrier: summary.carrier || 'MISSING',
    rowHasPhone: !!(row['Phone'] || row['phone']),
    rowHasEmail: !!(row['Email'] || row['email']),
    enrichedHasPhone: !!enriched?.phone,
    enrichedHasEmail: !!enriched?.email,
    enrichedHasSkipTracing: !!enriched?.skipTracingData,
  });

  if (!summary.phone && !summary.email) {
    console.warn(`[EXTRACT_SUMMARY] ⚠️  Missing phone/email for ${summary.name}`);
  }
  
  return summary;
}

/**
 * Converts lead summaries to CSV format
 * Columns: Firstname, Lastname, State, City, Age, Zipcode, Linetype, Carrier, Platform, Source Details, Search Filter
 */
export function leadSummariesToCSV(summaries: LeadSummary[]): string {
  if (summaries.length === 0) return '';
  
  // Order: Firstname, Lastname, State, City, Age, Zipcode, Linetype, Carrier, Platform, Source Details, Search Filter
  const headers = ['Firstname', 'Lastname', 'State', 'City', 'Age', 'Zipcode', 'Linetype', 'Carrier', 'Platform', 'Source Details', 'Search Filter'];
  const rows = summaries.map(summary => {
    // Split name into first and last
    const nameParts = (summary.name || '').trim().split(/\s+/);
    const firstname = nameParts[0] || '';
    const lastname = nameParts.slice(1).join(' ') || '';
    
    // Extract age from dobOrAge (if it's a number, use it; otherwise try to calculate)
    let age = '';
    if (summary.dobOrAge) {
      const dobOrAgeStr = String(summary.dobOrAge).trim();
      // If it's already a number (age), use it
      if (/^\d+$/.test(dobOrAgeStr)) {
        age = dobOrAgeStr;
      } else {
        // Try to calculate age from DOB
        try {
          const dob = new Date(dobOrAgeStr);
          if (!isNaN(dob.getTime())) {
            const today = new Date();
            let calculatedAge = today.getFullYear() - dob.getFullYear();
            const monthDiff = today.getMonth() - dob.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
              calculatedAge--;
            }
            age = calculatedAge.toString();
          }
        } catch {
          // If parsing fails, leave empty
        }
      }
    }
    
    // Format source details as readable string
    let sourceDetailsStr = '';
    if (summary.sourceDetails) {
      const parts: string[] = [];
      if (summary.sourceDetails.occupation) parts.push(`Occupation: ${summary.sourceDetails.occupation}`);
      if (summary.sourceDetails.jobTitle) parts.push(`Job: ${summary.sourceDetails.jobTitle}`);
      if (summary.sourceDetails.location) parts.push(`Location: ${summary.sourceDetails.location}`);
      if (summary.sourceDetails.isSelfEmployed) parts.push('Self-Employed');
      if (summary.sourceDetails.changedJobs) parts.push('Changed Jobs');
      if (summary.sourceDetails.groupName) parts.push(`Group: ${summary.sourceDetails.groupName}`);
      if (summary.sourceDetails.keywords && summary.sourceDetails.keywords.length > 0) {
        parts.push(`Keywords: ${summary.sourceDetails.keywords.join(', ')}`);
      }
      sourceDetailsStr = parts.join(' | ');
    }
    
    return [
      firstname,
      lastname,
      summary.state || '',
      summary.city || '',
      age,
      summary.zipcode || '',
      summary.lineType || '',
      summary.carrier || '',
      summary.platform || '',
      sourceDetailsStr,
      summary.searchFilter || '',
    ];
  });
  
  // Escape CSV values
  const escapeCSV = (value: string): string => {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };
  
  const csvRows = [
    headers.map(escapeCSV).join(','),
    ...rows.map(row => row.map(escapeCSV).join(','))
  ];
  
  return csvRows.join('\n');
}

