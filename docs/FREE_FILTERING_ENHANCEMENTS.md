# Free Cost-Efficiency Filtering Enhancements

## Overview

This document outlines **free methods** to filter out unqualified leads (low income, unhealthy, invalid) **before** expensive API calls, maximizing cost efficiency.

## Current Filtering (Already Implemented)

✅ **Age Filter**: > 59 years old  
✅ **Income Pre-Qualification**: Filters low-income leads (< $50k conservative max)  
✅ **DNC Check**: FREE - Filters Do Not Call numbers  
✅ **Gatekeep**: Filters VoIP, fixed-line, junk carriers  
✅ **Phone Validation**: Requires valid 10+ digit phone number  

---

## Proposed Free Enhancements

### 1. **Early Age Filtering from LinkedIn Data** ⚡ HIGH IMPACT

**Current**: Age filtering happens AFTER skip-tracing (paid API call)  
**Enhancement**: Filter based on LinkedIn profile data BEFORE skip-tracing

**Implementation**:
- Check LinkedIn profile for graduation year → Calculate age
- Check LinkedIn "Years of Experience" → Estimate age
- If estimated age > 59 → Skip skip-tracing entirely

**Cost Savings**: 1 skip-tracing call per filtered lead (~$0.025 per lead)

**Code Location**: `utils/enrichData.ts` - Before STEP 3 (skip-tracing)

```typescript
// Early age estimation from LinkedIn
function estimateAgeFromLinkedIn(row: Record<string, string | number>): number | null {
  // Check for graduation year in education section
  const education = extractEducationFromLinkedIn(row);
  if (education?.graduationYear) {
    const age = new Date().getFullYear() - education.graduationYear;
    // Typical graduation age: 22-24
    const estimatedAge = age + 22;
    if (estimatedAge > 59) return estimatedAge;
  }
  
  // Check "Years of Experience" if available
  const yearsExp = extractYearsOfExperience(row);
  if (yearsExp) {
    // Typical career start: 22-25
    const estimatedAge = yearsExp + 22;
    if (estimatedAge > 59) return estimatedAge;
  }
  
  return null;
}
```

---

### 2. **Title-Based Income Pre-Filtering** ⚡ HIGH IMPACT

**Enhancement**: Filter obviously low-income titles BEFORE any API calls

**Free Pattern Matching**:
- "Cashier", "Retail Associate", "Fast Food", "Janitor" → < $30k → SKIP
- "Intern", "Trainee", "Entry Level" → < $25k → SKIP
- "Part-time", "Contractor" (low-paying) → SKIP
- "Volunteer" → $0 → SKIP

**Implementation**: Before STEP 1 (LinkedIn scraping)

**Cost Savings**: Skip entire enrichment pipeline for low-value leads

```typescript
const OBVIOUSLY_LOW_INCOME_TITLES = [
  'cashier', 'retail associate', 'fast food', 'janitor', 'custodian',
  'intern', 'trainee', 'entry level', 'volunteer', 'unpaid',
  'part-time cashier', 'part-time retail', 'seasonal worker',
  'dishwasher', 'server', 'waiter', 'waitress', 'bartender',
  'delivery driver', 'uber driver', 'lyft driver',
];

function isObviouslyLowIncome(title: string | undefined): boolean {
  if (!title) return false;
  const lower = title.toLowerCase();
  return OBVIOUSLY_LOW_INCOME_TITLES.some(lowTitle => lower.includes(lowTitle));
}
```

---

### 3. **Company-Based Pre-Filtering** ⚡ MEDIUM IMPACT

**Enhancement**: Filter based on company type/name patterns

**Free Pattern Matching**:
- Non-profits: "Foundation", "Charity", "Non-profit" → Lower income → Consider filtering
- Small businesses: "LLC" alone, no "Inc." → Lower income → Consider filtering
- Retail chains: "Walmart", "Target", "McDonald's" → Lower income → Consider filtering
- Startups: "Startup", "Early stage" → Wide variance → Lower confidence

**Implementation**: Before income pre-qualification

**Cost Savings**: Skip income pre-qual API call for obviously low-income companies

```typescript
const LOW_INCOME_COMPANY_PATTERNS = [
  'walmart', 'target', 'mcdonald', 'burger king', 'kfc', 'subway',
  'dollar general', 'dollar tree', 'family dollar',
  'foundation', 'charity', 'non-profit', 'nonprofit',
];

function isLowIncomeCompany(company: string | undefined): boolean {
  if (!company) return false;
  const lower = company.toLowerCase();
  return LOW_INCOME_COMPANY_PATTERNS.some(pattern => lower.includes(pattern));
}
```

---

### 4. **Geographic Pre-Filtering** ⚡ MEDIUM IMPACT

**Enhancement**: Use free Census data to filter low-income ZIP codes

**Free Data Source**: Census Bureau API (already using for income-by-zip)

**Implementation**:
- Before skip-tracing, check ZIP median income
- If ZIP median < $40k → Lower confidence, consider filtering
- If ZIP median < $30k → High probability of low income → Consider filtering

**Cost Savings**: Skip skip-tracing for low-income ZIP codes

**Code Location**: `utils/enrichData.ts` - Before STEP 3

```typescript
// Use existing income-by-zip API (free Census data)
async function shouldFilterByZipIncome(zipCode: string): Promise<boolean> {
  try {
    const incomeData = await fetchCensusIncomeByZip(zipCode);
    if (incomeData?.medianIncome) {
      // Filter if ZIP median < $35k (very low-income area)
      return incomeData.medianIncome < 35000;
    }
  } catch {
    // On error, don't filter (conservative)
  }
  return false;
}
```

---

### 5. **Email Domain Quality Filtering** ⚡ LOW-MEDIUM IMPACT

**Enhancement**: Filter based on email domain quality (free email = lower quality)

**Free Pattern Matching**:
- Free email domains: "gmail.com", "yahoo.com", "hotmail.com" → Lower quality
- Corporate emails: "@company.com" → Higher quality
- Disposable emails: "tempmail", "10minutemail" → SKIP

**Implementation**: Before skip-tracing (if email available)

**Cost Savings**: Skip skip-tracing for low-quality email domains

```typescript
const DISPOSABLE_EMAIL_DOMAINS = [
  'tempmail', '10minutemail', 'guerrillamail', 'mailinator',
  'throwaway', 'trashmail', 'getnada',
];

function isLowQualityEmail(email: string | undefined): boolean {
  if (!email) return false;
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return true;
  
  // Skip disposable emails
  if (DISPOSABLE_EMAIL_DOMAINS.some(d => domain.includes(d))) {
    return true;
  }
  
  // Free email = lower quality (but don't filter, just lower confidence)
  const freeEmails = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'];
  return freeEmails.includes(domain);
}
```

---

### 6. **Phone Number Pattern Validation** ⚡ LOW IMPACT

**Enhancement**: Filter obviously fake/invalid phone numbers

**Free Pattern Matching**:
- Sequential numbers: "1234567890" → SKIP
- Repeated numbers: "1111111111" → SKIP
- Test numbers: "555-0100" → SKIP
- Invalid area codes: Check against valid area code list

**Implementation**: Before Telnyx lookup

**Cost Savings**: Skip Telnyx lookup for invalid numbers (~$0.004 per lead)

```typescript
function isValidPhonePattern(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  if (digits.length !== 10) return false;
  
  // Sequential numbers
  if (/0123456789|9876543210/.test(digits)) return false;
  
  // Repeated numbers
  if (/^(\d)\1{9}$/.test(digits)) return false;
  
  // Test numbers (555-0100 pattern)
  if (digits.startsWith('555')) return false;
  
  // Invalid area codes (000, 111, etc.)
  const areaCode = digits.substring(0, 3);
  if (areaCode === '000' || areaCode === '111' || areaCode === '999') {
    return false;
  }
  
  return true;
}
```

---

### 7. **LinkedIn Profile Completeness Check** ⚡ LOW IMPACT

**Enhancement**: Filter incomplete LinkedIn profiles (lower quality leads)

**Free Pattern Matching**:
- No profile photo → Lower quality
- No job title → Lower quality
- No company → Lower quality
- Very few connections → Lower quality

**Implementation**: After LinkedIn scraping, before skip-tracing

**Cost Savings**: Skip skip-tracing for incomplete profiles

```typescript
function isIncompleteLinkedInProfile(row: Record<string, string | number>): boolean {
  const hasTitle = !!row['Title'] || !!row['Job Title'];
  const hasCompany = !!row['Company'] || !!row['Company Name'];
  const hasLocation = !!row['Location'] || !!row['City'];
  
  // Require at least title OR company
  return !hasTitle && !hasCompany;
}
```

---

### 8. **Duplicate Detection** ⚡ MEDIUM IMPACT

**Enhancement**: Prevent re-enrichment of existing leads

**Free Pattern Matching**:
- Check phone number against existing leads
- Check email against existing leads
- Check name + location against existing leads

**Implementation**: Before STEP 1 (LinkedIn scraping)

**Cost Savings**: Skip entire enrichment for duplicates

**Code Location**: `utils/enrichData.ts` - Before enrichment starts

```typescript
// Load existing leads once at start of enrichment
let existingLeadsCache: Set<string> | null = null;

async function loadExistingLeadsCache(): Promise<Set<string>> {
  if (existingLeadsCache) return existingLeadsCache;
  
  try {
    const existingPath = path.join(process.cwd(), 'data', 'enriched-all-leads.json');
    if (fs && fs.existsSync(existingPath)) {
      const data = JSON.parse(fs.readFileSync(existingPath, 'utf-8'));
      const leads = data.leads || [];
      
      // Create set of unique identifiers (phone + email + name)
      existingLeadsCache = new Set(
        leads.map((lead: any) => {
          const phone = (lead.phone || '').replace(/\D/g, '');
          const email = (lead.email || '').toLowerCase();
          const name = (lead.name || '').toLowerCase();
          return `${phone}|${email}|${name}`;
        })
      );
    }
  } catch {
    existingLeadsCache = new Set();
  }
  
  return existingLeadsCache || new Set();
}

function isDuplicateLead(
  phone: string | null,
  email: string | null,
  name: string | null,
  existingCache: Set<string>
): boolean {
  const phoneClean = (phone || '').replace(/\D/g, '');
  const emailClean = (email || '').toLowerCase();
  const nameClean = (name || '').toLowerCase();
  const key = `${phoneClean}|${emailClean}|${nameClean}`;
  return existingCache.has(key);
}
```

---

### 9. **Enhanced Income Pre-Qualification Thresholds** ⚡ HIGH IMPACT

**Enhancement**: Make income pre-qualification more aggressive

**Current Thresholds**:
- Floor: $50k (conservative max)
- Enrich: $75k (upside min)

**Proposed Adjustments**:
- Lower floor to $45k (more aggressive filtering)
- Raise enrich to $80k (only enrich high-confidence high-income)
- Add "very low" tier: < $40k → Always skip

**Implementation**: `utils/enrichment/incomePreQualifier.ts`

```typescript
function makePreQualDecision(...) {
  const floorThreshold = 45000; // Lowered from 50000
  const enrichThreshold = 80000; // Raised from 75000
  const veryLowThreshold = 40000; // NEW: Very low tier
  
  // Very low tier: Always skip
  if (conservative.max < veryLowThreshold) {
    return {
      tier: 'very_low',
      shouldContinueEnrichment: false,
      reason: `Very low income (max $${Math.round(conservative.max / 1000)}k) - skipping enrichment`,
    };
  }
  
  // Rest of logic...
}
```

---

### 10. **Location Mismatch Enhancement** ⚡ LOW IMPACT

**Enhancement**: Better location mismatch detection (already partially implemented)

**Current**: Basic state/city matching  
**Enhancement**: 
- ZIP code mismatch detection
- Distance-based filtering (if ZIP codes are far apart)
- State abbreviation normalization

**Implementation**: `utils/enrichData.ts` - Gatekeep function

```typescript
function shouldFilterByLocationMismatch(
  linkedInState: string | null,
  linkedInCity: string | null,
  linkedInZip: string | null,
  skipTracingState: string | null,
  skipTracingCity: string | null,
  skipTracingZip: string | null
): boolean {
  // State mismatch (already implemented, but enhance)
  if (linkedInState && skipTracingState) {
    const linkedInStateNorm = normalizeState(linkedInState);
    const skipTracingStateNorm = normalizeState(skipTracingState);
    if (linkedInStateNorm !== skipTracingStateNorm) {
      return true; // Mismatch
    }
  }
  
  // ZIP code mismatch (NEW)
  if (linkedInZip && skipTracingZip) {
    const linkedInZip5 = linkedInZip.substring(0, 5);
    const skipTracingZip5 = skipTracingZip.substring(0, 5);
    if (linkedInZip5 !== skipTracingZip5) {
      // Allow if same state (ZIP codes can be close)
      if (linkedInState && skipTracingState) {
        const linkedInStateNorm = normalizeState(linkedInState);
        const skipTracingStateNorm = normalizeState(skipTracingState);
        if (linkedInStateNorm !== skipTracingStateNorm) {
          return true; // Different state + different ZIP = mismatch
        }
      }
    }
  }
  
  return false;
}
```

---

## Implementation Priority

### 🔥 **CRITICAL (Implement First)**
1. **Early Age Filtering** - Saves skip-tracing calls
2. **Title-Based Pre-Filtering** - Saves entire pipeline
3. **Enhanced Income Thresholds** - More aggressive filtering

### ⚡ **HIGH PRIORITY**
4. **Geographic Pre-Filtering** - Uses free Census data
5. **Duplicate Detection** - Prevents re-enrichment
6. **Company-Based Pre-Filtering** - Pattern matching

### 📊 **MEDIUM PRIORITY**
7. **Email Domain Quality** - Lower impact but easy
8. **Location Mismatch Enhancement** - Already partially done

### 🔧 **LOW PRIORITY**
9. **Phone Pattern Validation** - Small savings
10. **LinkedIn Profile Completeness** - Lower impact

---

## Expected Cost Savings

### Per 1000 Leads

| Enhancement | Leads Filtered | API Calls Saved | Cost Saved |
|------------|----------------|-----------------|------------|
| Early Age Filtering | 50-100 | 50-100 skip-tracing | $1.25-$2.50 |
| Title Pre-Filtering | 100-200 | 100-200 full pipelines | $5-$10 |
| Geographic Pre-Filtering | 50-100 | 50-100 skip-tracing | $1.25-$2.50 |
| Duplicate Detection | 50-150 | 50-150 full pipelines | $2.50-$7.50 |
| Enhanced Income Thresholds | 100-200 | 100-200 age calls | $2.50-$5.00 |
| **TOTAL** | **350-750** | **350-750 calls** | **$12.50-$27.50** |

### ROI
- **Investment**: ~2-3 hours of development
- **Savings**: $12.50-$27.50 per 1000 leads
- **Break-even**: ~40-80 leads processed
- **Annual Savings** (10k leads/month): $1,500-$3,300/year

---

## Free Data Sources

1. **Census Bureau API** (already using)
   - ZIP median income
   - State median income
   - Cost-of-living data

2. **BLS (Bureau of Labor Statistics)**
   - Occupational wage data
   - Industry statistics
   - Regional wage data

3. **Public Name Databases**
   - Baby name statistics
   - Surname databases

4. **Free Validation APIs**
   - Email validation (free tier)
   - Phone number validation (free tier)

---

## Implementation Notes

### Data Protection
- ✅ All filters apply to **NEW leads only**
- ✅ Existing leads are **never filtered out**
- ✅ Filters are **additive** (prevent bad leads, don't remove existing)

### Conservative Approach
- When in doubt, **don't filter** (avoid false negatives)
- Use **confidence thresholds** for filtering
- Log all filtered leads for analysis

### Monitoring
- Track filter effectiveness
- Monitor false positive rate
- Adjust thresholds based on data

---

## Next Steps

1. **Implement Critical Enhancements** (1-3)
2. **Test with small dataset** (100 leads)
3. **Measure cost savings**
4. **Adjust thresholds** based on results
5. **Roll out to production**
