# Enrichment Pipeline: Exact Order of API Calls

## Overview

The enrichment pipeline processes leads in a specific order designed to:
1. **Minimize cost** - Free operations first, paid operations only when necessary
2. **Maximize efficiency** - Early filtering prevents wasted API calls
3. **Respect dependencies** - Each step requires data from previous steps
4. **Optimize for quality** - Validate data before expensive operations

---

## Exact Order of Operations

### **STEP 1: LinkedIn Data Extraction** (FREE, NO API)
**Station:** `linkedin`  
**API Calls:** 0  
**Reason:** Extract data already present in the scraped row (name, city, state, title, company). This is the foundation for all subsequent operations.

**Provides:**
- `firstName`
- `lastName`
- `city`
- `state`
- `jobTitle`
- `company`

**Why First:**
- Required foundation data
- No cost (data already scraped)
- All other stations depend on this

---

### **STEP 2: ZIP Code Lookup** (FREE, LOCAL DATABASE)
**Station:** `zip`  
**API Calls:** 0  
**Reason:** Lookup ZIP code from city/state using local database. Needed for income pre-qualification and geographic filtering.

**Provides:**
- `zipCode`

**Dependencies:**
- Requires `city` and `state` from STEP 1

**Why Second:**
- Free operation (local database lookup)
- Needed early for income pre-qualification (STEP 4.5)
- Improves accuracy of geographic data

---

### **STEP 2.5: Income Pre-Qualification** (FREE - Census API)
**Station:** `income-pre-qual`  
**API Calls:** 1 (conditional - only if ZIP available)
- **Call:** `/api/income-by-zip?zip=...` (FREE census API)

**Reason:** Estimate income from job title, company, location. **CRITICAL cost control gate** - filters out leads earning < $60k BEFORE any paid API calls.

**Provides:**
- `incomePreQual` (conservative/upside estimates, decision)

**Dependencies:**
- Requires `jobTitle`, `company` from STEP 1
- Requires `city`, `state` from STEP 1
- Optional: `zipCode` from STEP 2 (improves accuracy)

**Why Here (Before Phone Discovery):**
- **CRITICAL:** Prevents spending money on skip-tracing for unqualified leads
- Only needs LinkedIn data (jobTitle, company, city, state) + ZIP
- Can make decision without phone/carrier/age data
- **Decision:** If `upside.p50 < $60k` → **SKIP all further enrichment** (saves 2-4 paid API calls)

**Decision Logic:**
- If `upside.p50 < $60k` → **SKIP all further enrichment** (strict threshold)
- If `upside.p50 >= $60k` → Continue with phone discovery

**Cost Savings:**
- Filters out low-income leads BEFORE expensive skip-tracing calls
- Saves 1-2 paid API calls per rejected lead (skip-tracing search + person details)

---

### **STEP 2.6: Gender Detection** (FREE, LOCAL)
**Station:** `gender`  
**API Calls:** 0  
**Reason:** Infer gender from first name using comprehensive name database. Runs in parallel with other free operations.

**Provides:**
- `gender`
- `genderConfidence`

**Dependencies:**
- Requires `firstName` from STEP 1

**Why Here:**
- Free operation (local name database)
- Independent of other operations
- Provides additional lead qualification data

---

### **STEP 3: Phone Discovery** (PAID - Skip-tracing API)
**Station:** `phone-discovery`  
**API Calls:** 0-2 (highly conditional)
- **Call 1:** Skip-tracing search (`/api/skip-tracing?name=...&citystatezip=...`)
- **Call 2:** Person details (`/api/skip-tracing?peo_id=...`) - **ONLY if phone not in search results**

**Reason:** Find phone numbers when not present in LinkedIn data. This is the PRIMARY way to get contact information.

**Provides:**
- `phone` (primary goal)
- `email` (bonus if available)
- `address` (bonus if available)
- `age` (stored for STEP 6, but not used yet)

**Dependencies:**
- Requires `firstName` and `lastName` from STEP 1
- **CRITICAL:** Requires income pre-qual to pass (STEP 2.5) - **SKIPS if income < $60k**
- Optional: `city`, `state`, `zipCode` for better accuracy

**Why Third:**
- Phone is required for all subsequent paid operations
- **CRITICAL:** Only runs if income >= $60k (prevents wasting money on unqualified leads)
- Early phone discovery enables cost savings (can skip if no phone found)
- **Optimization:** Only makes person details call if search doesn't return phone (saves 50% of API calls)

**Cost Optimization:**
- **SKIPS ENTIRELY** if income < $60k (saves 1-2 API calls)
- If phone found in search results → **1 API call total**
- If phone not in search → **2 API calls** (search + person details)
- Reuses person details data for age in STEP 6 (no duplicate call)
**Station:** `phone-discovery`  
**API Calls:** 1-2 (conditional)
- **Call 1:** Skip-tracing search (`/api/skip-tracing?name=...&citystatezip=...`)
- **Call 2:** Person details (`/api/skip-tracing?peo_id=...`) - **ONLY if phone not in search results**

**Reason:** Find phone numbers when not present in LinkedIn data. This is the PRIMARY way to get contact information.

**Provides:**
- `phone` (primary goal)
- `email` (bonus if available)
- `address` (bonus if available)
- `age` (stored for STEP 6, but not used yet)

**Dependencies:**
- Requires `firstName` and `lastName` from STEP 1
- Optional: `city`, `state`, `zipCode` for better accuracy

**Why Third:**
- Phone is required for all subsequent paid operations
- Early phone discovery enables cost savings (can skip if no phone found)
- **Optimization:** Only makes person details call if search doesn't return phone (saves 50% of API calls)

**Cost Optimization:**
- If phone found in search results → **1 API call total**
- If phone not in search → **2 API calls** (search + person details)
- Reuses person details data for age in STEP 6 (no duplicate call)

---

### **STEP 4: Telnyx Phone Validation** (PAID)
**Station:** `telnyx`  
**API Calls:** 1 (conditional - only if phone exists)
- **Call:** `/api/telnyx/lookup?phone=...`

**Reason:** Validate phone number and get carrier/line type. Critical for filtering VoIP/junk numbers before expensive age enrichment.

**Provides:**
- `lineType` (mobile/voip/fixed)
- `carrierName`
- `carrierType`
- `normalizedCarrier`

**Dependencies:**
- Requires `phone` from STEP 3 (or row data)

**Why Fourth:**
- Must validate phone before spending money on age enrichment
- Line type determines if age enrichment is worth it (VoIP = skip)
- Carrier data used for income estimation and filtering

**Cost Optimization:**
- Only runs if phone exists
- Skips if age > 59 detected in STEP 3 (early filter)

---

### **STEP 5: Gatekeep Filter** (FREE - Logic Only)
**Station:** `gatekeep`  
**API Calls:** 0  
**Reason:** Filter out VoIP, junk carriers, and invalid numbers. Prevents wasting money on age enrichment for unqualified leads.

**Provides:**
- `shouldContinueEnrichment` (boolean decision)

**Dependencies:**
- Requires `lineType` from STEP 4
- Requires `carrierName` from STEP 4

**Why Fifth:**
- Must run after Telnyx (needs line type/carrier data)
- Must run before DNC check (no point checking DNC on VoIP numbers)
- Must run before age enrichment (prevents wasted API calls)

**Filter Rules:**
- VoIP numbers → Skip
- Fixed/landline → Skip (mobile only for age enrichment)
- Junk carriers → Skip
- Invalid phone patterns → Skip

---

### **STEP 5.5: DNC Check** (FREE - USHA API)
**Station:** `dnc-check`  
**API Calls:** 1 (conditional - only if gatekeep passes)
- **Call:** `/api/usha/scrub-phone?phone=...` (FREE)

**Reason:** Check Do Not Call registry. Prevents wasting money on age enrichment for DNC numbers.

**Provides:**
- `dncStatus` (YES/NO/UNKNOWN)
- `canContact` (boolean)
- `dncReason`

**Dependencies:**
- Requires `phone` from STEP 3
- Requires `gatekeep` to pass (STEP 5)

**Why Here:**
- Must run after gatekeep (no point checking DNC on VoIP/junk)
- Must run before age enrichment (saves API call if DNC)
- Free operation, so no cost to check

**Cost Optimization:**
- Only runs if gatekeep passes
- If DNC detected → Skip age enrichment (saves API call)

---

### **STEP 6: Age Enrichment** (PAID - Skip-tracing API)
**Station:** `age`  
**API Calls:** 0-1 (highly conditional)
- **Call:** `/api/skip-tracing?peo_id=...` - **ONLY if:**
  - Phone exists
  - Gatekeep passed
  - Not DNC
  - Age not already in STEP 3 results
  - Age not > 59

**Reason:** Get age/DOB for lead qualification. **Most expensive and conditional operation.**

**Provides:**
- `age`
- `dob`

**Dependencies:**
- Requires `phone` from STEP 3
- Requires `gatekeep` to pass (STEP 5)
- Requires `dnc-check` to pass (STEP 5.5)
- Requires `firstName`, `lastName` from STEP 1

**Why Last:**
- Most expensive operation
- Only runs on highest-quality leads (validated phone, not DNC, not VoIP)
- **Critical Optimization:** Reuses STEP 3 person details data if available (saves API call)

**Cost Optimization:**
- **Best case:** Age already in STEP 3 results → **0 API calls**
- **Good case:** Person details already fetched in STEP 3 → **0 API calls** (reuse stored age)
- **Worst case:** Need to fetch person details for age → **1 API call**
- Skips if age > 59 (early filter in STEP 3)
- Skips if VoIP/junk (gatekeep)
- Skips if DNC (DNC check)

---

## Pipeline Flow Diagram

```
STEP 1: LinkedIn (FREE)
  ↓
STEP 2: ZIP Lookup (FREE)
  ↓
STEP 2.5: Income Pre-Qual (FREE)
  ├─ ZIP Income API (1 call, conditional)
  └─ Decision: Continue or SKIP? (income >= $60k?)
  ↓
STEP 2.6: Gender (FREE) ──┐
  ↓                        │ (Parallel)
STEP 3: Phone Discovery (PAID) - ONLY if income >= $60k
  ├─ Search API (1 call, conditional)
  └─ Person Details API (0-1 call, conditional)
  ↓
STEP 4: Telnyx Validation (PAID)
  └─ Phone Lookup API (1 call, conditional)
  ↓
STEP 5: Gatekeep Filter (FREE - Logic)
  └─ Decision: Continue or SKIP?
  ↓
STEP 5.5: DNC Check (FREE)
  └─ DNC Scrub API (1 call, conditional)
  └─ Decision: Continue or SKIP?
  ↓
STEP 6: Age Enrichment (PAID)
  └─ Person Details API (0-1 call, highly conditional)
```

---

## Cost Optimization Summary

### Minimum API Calls (Best Case):
1. **STEP 2.5:** 1 call (ZIP income - FREE)
2. **STEP 3:** 1 call (phone in search results) - **ONLY if income >= $60k**
3. **STEP 4:** 1 call (Telnyx validation)
4. **STEP 5.5:** 1 call (DNC check - FREE)
5. **STEP 6:** 0 calls (age in STEP 3 results)

**Total: 2 paid calls + 2 free calls = 2 paid calls**

### Maximum API Calls (Worst Case):
1. **STEP 2.5:** 1 call (ZIP income - FREE)
2. **STEP 3:** 2 calls (search + person details) - **ONLY if income >= $60k**
3. **STEP 4:** 1 call (Telnyx validation)
4. **STEP 5.5:** 1 call (DNC check - FREE)
5. **STEP 6:** 1 call (person details for age)

**Total: 4 paid calls + 2 free calls = 4 paid calls**

### Early Exit Scenarios (Cost Savings):
- **Income < $60k in STEP 2.5:** Saves 2-4 calls (entire phone discovery + Telnyx + DNC + age) ⭐ **BIGGEST SAVINGS**
- **Age > 59 in STEP 3:** Saves 1-2 calls (Telnyx + age)
- **VoIP/junk in STEP 5:** Saves 2 calls (DNC + age)
- **DNC in STEP 5.5:** Saves 1 call (age)

---

## Key Design Principles

1. **Free Before Paid:** All free operations (ZIP, gender, income pre-qual, DNC) run before expensive operations
2. **Early Filtering:** Age filter (STEP 3) and income filter (STEP 4.5) prevent wasted API calls
3. **Dependency Chain:** Each step requires data from previous steps
4. **Conditional Execution:** Expensive operations only run if prerequisites are met
5. **Data Reuse:** STEP 3 person details reused in STEP 6 (saves API calls)
6. **Parallel Operations:** ZIP and gender can run in parallel (both free, independent)

---

## Station Dependencies

```
linkedin (required)
  ├─ zip (depends on: linkedin)
  ├─ income-pre-qual (depends on: linkedin, zip) ⭐ MOVED BEFORE phone-discovery
  ├─ gender (depends on: linkedin)
  └─ phone-discovery (depends on: linkedin, income-pre-qual) ⭐ NOW DEPENDS ON INCOME
      └─ telnyx (depends on: phone-discovery)
          └─ gatekeep (depends on: telnyx)
              └─ dnc-check (depends on: phone-discovery, gatekeep)
                  └─ age (depends on: phone-discovery, gatekeep, dnc-check)
```

---

## Why This Order Maximizes Efficiency

1. **Foundation First:** LinkedIn data is extracted first (no cost, required for everything)
2. **Free Operations Early:** ZIP, income pre-qual, gender run early (no cost, improve data quality)
3. **Income Gate Before Phone Discovery:** **CRITICAL** - Income pre-qual filters out low-income leads BEFORE any paid API calls (saves 2-4 calls per rejected lead)
4. **Phone Discovery Early:** Phone is required for all subsequent operations, so we find it ASAP (but only if income >= $60k)
5. **Validation Before Enrichment:** Telnyx validates phone before spending money on age
6. **Quality Gates:** Gatekeep and DNC check prevent wasting money on unqualified leads
7. **Age Last:** Age is the most expensive and least critical, so it runs last and only on highest-quality leads

---

**Last Updated:** 2025-01-19
