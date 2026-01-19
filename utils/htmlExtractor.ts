/**
 * HTML Extraction Utility
 * 
 * Extracts structured data from HTML using JSON-LD, CSS selectors, and regex
 */

import * as cheerio from 'cheerio';

export interface ExtractedData {
  phone?: string;
  email?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    full?: string;
  };
  age?: number;
  name?: string;
  relatives?: string[];
}

/**
 * Extract JSON-LD structured data from HTML
 */
function extractJSONLD(html: string): any | null {
  try {
    const $ = cheerio.load(html);
    const jsonLdScripts = $('script[type="application/ld+json"]');
    
    for (let i = 0; i < jsonLdScripts.length; i++) {
      const scriptContent = $(jsonLdScripts[i]).html();
      if (!scriptContent) continue;
      
      try {
        const data = JSON.parse(scriptContent);
        
        // Look for Person schema
        if (data['@type'] === 'Person' || data['@type'] === 'FAQPage') {
          // FAQPage might have Person data in mainEntity
          if (data['@type'] === 'FAQPage' && data.mainEntity) {
            for (const item of data.mainEntity) {
              if (item.acceptedAnswer && item.acceptedAnswer.text) {
                // Extract from FAQ answers
                const answer = item.acceptedAnswer.text;
                if (item.name.includes('phone')) {
                  const phoneMatch = answer.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
                  if (phoneMatch) {
                    data.telephone = data.telephone || [phoneMatch[0]];
                  }
                }
                if (item.name.includes('email')) {
                  const emailMatch = answer.match(/[\w.-]+@[\w.-]+\.\w+/);
                  if (emailMatch) {
                    data.email = data.email || [emailMatch[0]];
                  }
                }
              }
            }
          }
          
          return data;
        }
      } catch (parseError) {
        // Continue to next script
        continue;
      }
    }
    
    return null;
  } catch (error) {
    console.error('[HTML Extractor] Error extracting JSON-LD:', error);
    return null;
  }
}

/**
 * Extract phone number from text
 */
function extractPhone(text: string): string | null {
  if (!text) return null;
  
  // Remove all non-digit characters except +
  const cleaned = text.replace(/[^\d+]/g, '');
  
  // US phone patterns
  const patterns = [
    /(\d{10})/, // 10 digits
    /\+1(\d{10})/, // +1 followed by 10 digits
    /1(\d{10})/, // 1 followed by 10 digits
  ];
  
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) {
      let phone = match[1] || match[0];
      // Remove leading 1 if present
      if (phone.length === 11 && phone.startsWith('1')) {
        phone = phone.substring(1);
      }
      if (phone.length === 10) {
        return phone;
      }
    }
  }
  
  return null;
}

/**
 * Extract email from text
 */
function extractEmail(text: string): string | null {
  if (!text) return null;
  
  const emailPattern = /[\w.-]+@[\w.-]+\.\w+/i;
  const match = text.match(emailPattern);
  
  return match ? match[0] : null;
}

/**
 * Calculate age from birth year
 */
function calculateAge(birthYear: number | string): number | undefined {
  if (!birthYear) return undefined;
  
  const year = typeof birthYear === 'string' ? parseInt(birthYear, 10) : birthYear;
  if (isNaN(year)) return undefined;
  
  const currentYear = new Date().getFullYear();
  return currentYear - year;
}

/**
 * Format address from structured data
 */
function formatAddress(address: any): ExtractedData['address'] | undefined {
  if (!address) return undefined;
  
  if (typeof address === 'string') {
    return { full: address };
  }
  
  if (typeof address === 'object') {
    return {
      street: address.streetAddress || address.street,
      city: address.addressLocality || address.city,
      state: address.addressRegion || address.state,
      zip: address.postalCode || address.zip,
      full: [
        address.streetAddress || address.street,
        address.addressLocality || address.city,
        address.addressRegion || address.state,
        address.postalCode || address.zip,
      ].filter(Boolean).join(', '),
    };
  }
  
  return undefined;
}

/**
 * Extract data from ZabaSearch HTML
 */
export function extractFromZabaSearch(html: string): ExtractedData {
  const result: ExtractedData = {};
  
  console.log(`[HTML Extractor] ZabaSearch: Starting extraction (HTML length: ${html.length})`);
  
  try {
    const $ = cheerio.load(html);
    
    // Try JSON-LD first (most reliable)
    console.log(`[HTML Extractor] ZabaSearch: Checking for JSON-LD...`);
    const jsonLd = extractJSONLD(html);
    
    if (jsonLd) {
      // Extract from JSON-LD
      if (jsonLd.telephone && Array.isArray(jsonLd.telephone) && jsonLd.telephone.length > 0) {
        const phone = extractPhone(jsonLd.telephone[0]);
        if (phone) result.phone = phone;
      }
      
      if (jsonLd.email && Array.isArray(jsonLd.email) && jsonLd.email.length > 0) {
        const email = extractEmail(jsonLd.email[0]);
        if (email) result.email = email;
      }
      
      if (jsonLd.address) {
        result.address = formatAddress(jsonLd.address);
      }
      
      if (jsonLd.birthDate) {
        result.age = calculateAge(jsonLd.birthDate);
      }
      
      if (jsonLd.name) {
        result.name = jsonLd.name;
      }
      
      if (jsonLd.relatedTo && Array.isArray(jsonLd.relatedTo)) {
        result.relatives = jsonLd.relatedTo.map((r: any) => r.name).filter(Boolean);
      }
      console.log(`[HTML Extractor] ZabaSearch: JSON-LD extraction complete:`, {
        phone: result.phone || 'NOT FOUND',
        email: result.email || 'NOT FOUND',
        address: result.address ? 'FOUND' : 'NOT FOUND',
      });
    } else {
      console.log(`[HTML Extractor] ZabaSearch: No JSON-LD found`);
    }
    
    // Fallback to CSS selectors if JSON-LD didn't provide everything
    if (!result.phone) {
      console.log(`[HTML Extractor] ZabaSearch: Trying CSS selectors for phone...`);
      // Try to extract from phone links
      const phoneLink = $('a[href^="/phone/"]').first();
      if (phoneLink.length) {
        const phoneText = phoneLink.text().trim();
        const phone = extractPhone(phoneText);
        if (phone) result.phone = phone;
      }
    }
    
    if (!result.email) {
      // Try to extract from email list (handle blurred emails)
      const emailList = $('.section-box:has(h3:contains("Email")) ul li');
      emailList.each((_, el) => {
        const $el = $(el);
        const text = $el.text();
        const email = extractEmail(text);
        if (email && !result.email) {
          result.email = email;
          return false; // Break
        }
      });
    }
    
    if (!result.address) {
      // Try to extract from address section
      const addressSection = $('.section-box:has(h3:contains("Last Known Address"))');
      if (addressSection.length) {
        const addressText = addressSection.find('p').first().text().trim();
        if (addressText) {
          result.address = { full: addressText };
        }
      }
    }
    
    if (!result.age) {
      // Try to extract from data attribute
      const ageAttr = $('.person').attr('data-age');
      if (ageAttr) {
        const age = parseInt(ageAttr, 10);
        if (!isNaN(age)) result.age = age;
      }
    }
    
    return result;
  } catch (error) {
    console.error('[HTML Extractor] Error extracting from ZabaSearch:', error);
    return result;
  }
}

/**
 * Extract data from FastPeopleSearch HTML
 */
export function extractFromFastPeopleSearch(html: string): ExtractedData {
  const result: ExtractedData = {};
  
  console.log(`[HTML Extractor] FastPeopleSearch: Starting extraction (HTML length: ${html.length})`);
  
  try {
    const $ = cheerio.load(html);
    
    // Try JSON-LD first
    console.log(`[HTML Extractor] FastPeopleSearch: Checking for JSON-LD...`);
    const jsonLd = extractJSONLD(html);
    if (jsonLd) {
      console.log(`[HTML Extractor] FastPeopleSearch: Found JSON-LD:`, JSON.stringify(jsonLd, null, 2).substring(0, 500));
      if (jsonLd.telephone) {
        const phone = extractPhone(Array.isArray(jsonLd.telephone) ? jsonLd.telephone[0] : jsonLd.telephone);
        if (phone) result.phone = phone;
      }
      
      if (jsonLd.email) {
        const email = extractEmail(Array.isArray(jsonLd.email) ? jsonLd.email[0] : jsonLd.email);
        if (email) result.email = email;
      }
      
      if (jsonLd.address) {
        result.address = formatAddress(jsonLd.address);
      }
      console.log(`[HTML Extractor] FastPeopleSearch: JSON-LD extraction complete:`, {
        phone: result.phone || 'NOT FOUND',
        email: result.email || 'NOT FOUND',
        address: result.address ? 'FOUND' : 'NOT FOUND',
      });
    } else {
      console.log(`[HTML Extractor] FastPeopleSearch: No JSON-LD found`);
    }
    
    // CSS selector and regex fallbacks
    // Try common patterns for phone numbers
    if (!result.phone) {
      console.log(`[HTML Extractor] FastPeopleSearch: Trying CSS selectors for phone...`);
      // Look for phone in various formats
      const phonePatterns = [
        $('[data-phone]').attr('data-phone'),
        $('.phone').text(),
        $('[class*="phone"]').text(),
        $('a[href^="tel:"]').attr('href')?.replace('tel:', ''),
      ];
      
      for (const phoneText of phonePatterns) {
        if (phoneText) {
          console.log(`[HTML Extractor] FastPeopleSearch: Trying phone pattern: ${phoneText.substring(0, 50)}`);
          const phone = extractPhone(phoneText);
          if (phone) {
            console.log(`[HTML Extractor] FastPeopleSearch: ✅ Found phone via CSS: ${phone}`);
            result.phone = phone;
            break;
          }
        }
      }
    }
    
    // Try regex fallback for phone if still not found
    if (!result.phone) {
      console.log(`[HTML Extractor] FastPeopleSearch: Trying regex fallback for phone...`);
      const phoneMatch = html.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
      if (phoneMatch) {
        console.log(`[HTML Extractor] FastPeopleSearch: Regex phone match: ${phoneMatch[0]}`);
        const phone = extractPhone(phoneMatch[0]);
        if (phone) {
          console.log(`[HTML Extractor] FastPeopleSearch: ✅ Found phone via regex: ${phone}`);
          result.phone = phone;
        }
      } else {
        console.log(`[HTML Extractor] FastPeopleSearch: No phone pattern found in HTML`);
      }
    }
    
    // Try common patterns for email
    if (!result.email) {
      console.log(`[HTML Extractor] FastPeopleSearch: Trying CSS selectors for email...`);
      const emailPatterns = [
        $('[data-email]').attr('data-email'),
        $('.email').text(),
        $('[class*="email"]').text(),
        $('a[href^="mailto:"]').attr('href')?.replace('mailto:', ''),
      ];
      
      for (const emailText of emailPatterns) {
        if (emailText) {
          console.log(`[HTML Extractor] FastPeopleSearch: Trying email pattern: ${emailText.substring(0, 50)}`);
          const email = extractEmail(emailText);
          if (email) {
            console.log(`[HTML Extractor] FastPeopleSearch: ✅ Found email via CSS: ${email}`);
            result.email = email;
            break;
          }
        }
      }
    }
    
    // Try regex fallback for email if still not found
    if (!result.email) {
      console.log(`[HTML Extractor] FastPeopleSearch: Trying regex fallback for email...`);
      const emailMatch = html.match(/[\w.-]+@[\w.-]+\.\w+/i);
      if (emailMatch) {
        console.log(`[HTML Extractor] FastPeopleSearch: ✅ Found email via regex: ${emailMatch[0]}`);
        result.email = emailMatch[0];
      } else {
        console.log(`[HTML Extractor] FastPeopleSearch: No email pattern found in HTML`);
      }
    }
    
    console.log(`[HTML Extractor] FastPeopleSearch: Final extraction result:`, {
      phone: result.phone || 'NOT FOUND',
      email: result.email || 'NOT FOUND',
      address: result.address ? 'FOUND' : 'NOT FOUND',
    });
    
    return result;
  } catch (error) {
    console.error('[HTML Extractor] Error extracting from FastPeopleSearch:', error);
    return result;
  }
}

/**
 * Extract data from SearchPeopleFree HTML
 */
export function extractFromSearchPeopleFree(html: string): ExtractedData {
  const result: ExtractedData = {};
  
  console.log(`[HTML Extractor] SearchPeopleFree: Starting extraction (HTML length: ${html.length})`);
  
  try {
    const $ = cheerio.load(html);
    
    // Try JSON-LD first
    console.log(`[HTML Extractor] SearchPeopleFree: Checking for JSON-LD...`);
    const jsonLd = extractJSONLD(html);
    if (jsonLd) {
      console.log(`[HTML Extractor] SearchPeopleFree: Found JSON-LD`);
      if (jsonLd.telephone) {
        const phone = extractPhone(Array.isArray(jsonLd.telephone) ? jsonLd.telephone[0] : jsonLd.telephone);
        if (phone) result.phone = phone;
      }
      
      if (jsonLd.email) {
        const email = extractEmail(Array.isArray(jsonLd.email) ? jsonLd.email[0] : jsonLd.email);
        if (email) result.email = email;
      }
      
      if (jsonLd.address) {
        result.address = formatAddress(jsonLd.address);
      }
      console.log(`[HTML Extractor] SearchPeopleFree: JSON-LD extraction complete:`, {
        phone: result.phone || 'NOT FOUND',
        email: result.email || 'NOT FOUND',
        address: result.address ? 'FOUND' : 'NOT FOUND',
      });
    } else {
      console.log(`[HTML Extractor] SearchPeopleFree: No JSON-LD found`);
    }
    
    // CSS selector fallbacks - try same patterns as FastPeopleSearch
    if (!result.phone) {
      console.log(`[HTML Extractor] SearchPeopleFree: Trying regex fallback for phone...`);
      const phoneMatch = html.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
      if (phoneMatch) {
        const phone = extractPhone(phoneMatch[0]);
        if (phone) {
          console.log(`[HTML Extractor] SearchPeopleFree: ✅ Found phone via regex: ${phone}`);
          result.phone = phone;
        }
      }
    }
    
    if (!result.email) {
      console.log(`[HTML Extractor] SearchPeopleFree: Trying regex fallback for email...`);
      const emailMatch = html.match(/[\w.-]+@[\w.-]+\.\w+/i);
      if (emailMatch) {
        console.log(`[HTML Extractor] SearchPeopleFree: ✅ Found email via regex: ${emailMatch[0]}`);
        result.email = emailMatch[0];
      }
    }
    
    console.log(`[HTML Extractor] SearchPeopleFree: Final extraction result:`, {
      phone: result.phone || 'NOT FOUND',
      email: result.email || 'NOT FOUND',
      address: result.address ? 'FOUND' : 'NOT FOUND',
    });
    
    return result;
  } catch (error) {
    console.error('[HTML Extractor] Error extracting from SearchPeopleFree:', error);
    return result;
  }
}

/**
 * Generic extractor that tries all methods
 */
export function extractFromHTML(html: string, site?: string): ExtractedData {
  // Route to site-specific extractor
  if (site?.includes('zabasearch')) {
    return extractFromZabaSearch(html);
  }
  
  if (site?.includes('fastpeoplesearch')) {
    return extractFromFastPeopleSearch(html);
  }
  
  if (site?.includes('searchpeoplefree')) {
    return extractFromSearchPeopleFree(html);
  }
  
  // Generic extraction (try JSON-LD first, then CSS selectors)
  const result: ExtractedData = {};
  
  try {
    const jsonLd = extractJSONLD(html);
    if (jsonLd) {
      if (jsonLd.telephone) {
        const phone = extractPhone(Array.isArray(jsonLd.telephone) ? jsonLd.telephone[0] : jsonLd.telephone);
        if (phone) result.phone = phone;
      }
      
      if (jsonLd.email) {
        const email = extractEmail(Array.isArray(jsonLd.email) ? jsonLd.email[0] : jsonLd.email);
        if (email) result.email = email;
      }
      
      if (jsonLd.address) {
        result.address = formatAddress(jsonLd.address);
      }
    }
    
    // Regex fallback for phone and email
    if (!result.phone) {
      const phoneMatch = html.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
      if (phoneMatch) {
        const phone = extractPhone(phoneMatch[0]);
        if (phone) result.phone = phone;
      }
    }
    
    if (!result.email) {
      const emailMatch = html.match(/[\w.-]+@[\w.-]+\.\w+/i);
      if (emailMatch) {
        result.email = emailMatch[0];
      }
    }
    
    return result;
  } catch (error) {
    console.error('[HTML Extractor] Error in generic extraction:', error);
    return result;
  }
}
