# Comprehensive Sales Navigator API Verification Plan

**Date**: 2025-01-14  
**Goal**: Verify every endpoint and filter works perfectly  
**Status**: 📋 Planning Phase

---

## 🎯 VERIFICATION OBJECTIVES

1. **Verify all 22 endpoints** work correctly
2. **Verify all filter types** are properly formatted and accepted
3. **Verify filter accuracy** - results match filters
4. **Verify response parsing** - all data structures handled
5. **Verify pagination** - works for 2,500+ leads
6. **Verify error handling** - graceful failures
7. **Verify via_url flow** - includes all filters correctly

---

## 📊 ENDPOINT VERIFICATION MATRIX

### Main Search Endpoints (4)

| Endpoint | Status | Test Cases | Priority |
|----------|--------|------------|----------|
| `premium_search_person` | ⏳ | 15+ filter combinations | **CRITICAL** |
| `premium_search_person_via_url` | ⏳ | URL generation, all filters | **CRITICAL** |
| `premium_search_company_via_url` | ⏳ | Company URL, filters | HIGH |
| `json_to_url` | ⏳ | All filter types | **CRITICAL** |

### Filter Helper Endpoints (18)

| Endpoint | Status | Test Cases | Priority |
|----------|--------|------------|----------|
| `filter_geography_location_region_suggestions` | ⏳ | Query responses, ID extraction | **CRITICAL** |
| `filter_company_suggestions` | ⏳ | URN format, autocomplete | **CRITICAL** |
| `filter_industry_suggestions` | ⏳ | Response format | HIGH |
| `filter_school_suggestions` | ⏳ | Response format | MEDIUM |
| `filter_job_title_suggestions` | ⏳ | Response format | MEDIUM |
| `filter_years_in` | ⏳ | Format verification | HIGH |
| `filter_technology` | ⏳ | Response format | MEDIUM |
| `filter_annual_revunue` | ⏳ | Response format | MEDIUM |
| `filter_followers_count` | ⏳ | Response format | LOW |
| `filter_department_headcount` | ⏳ | Response format | LOW |
| `filter_recent_activities` | ⏳ | Response format | MEDIUM |
| `filter_job_oppertunities` | ⏳ | Response format | MEDIUM |
| `filter_fortune` | ⏳ | Response format | LOW |
| `filter_company_headcount` | ⏳ | Format verification | HIGH |
| `filter_languages` | ⏳ | Response format | MEDIUM |
| `search_suggestions` | ⏳ | Response format | LOW |
| `filter_seniority_level` | ⏳ | Response format | MEDIUM |
| `filter_company_type` | ⏳ | Response format | MEDIUM |

---

## 🔍 FILTER TYPE VERIFICATION

### Filter Types to Verify (Based on Reference File)

1. **LOCATION** ✅ (Currently implemented)
   - Format: `type: 'LOCATION'`, `id: 'urn:li:fs_geo:103644278'`
   - Test: Single state, multiple states, cities, countries
   - Accuracy: Verify 90%+ match rate

2. **POSTAL_CODE** ❌ (Not implemented, shown in reference)
   - Format: `type: 'POSTAL_CODE'`, `id: '101041448'`, `selectedSubFilter: 50`
   - Test: Verify if this works better than LOCATION
   - Action: Test and potentially add support

3. **CURRENT_COMPANY** ⚠️ (Implemented but using wrong format)
   - Current: `id: 'apple'` (normalized name)
   - Reference shows: `id: 'urn:li:organization:1586'` (URN format)
   - **CRITICAL**: Need to verify which format works
   - Action: Test both formats, use working one

4. **COMPANY_HEADCOUNT** ⚠️ (Implemented but format unknown)
   - Current: `id: '100'`, `id: '10000'` (numeric)
   - Reference shows: `id: 'A'`, `id: 'B'` (letter codes)
   - **CRITICAL**: Need to verify correct format
   - Action: Test both formats, use working one

5. **CHANGED_JOBS_90_DAYS** ✅ (Implemented)
   - Format: `type: 'CHANGED_JOBS_90_DAYS'`, `id: 'true'`
   - Test: Verify it returns only recent job changers

6. **PAST_COMPANY** ⚠️ (Implemented but format unknown)
   - Current: `id: 'ibm'` (normalized name)
   - Should test: URN format like CURRENT_COMPANY

7. **INDUSTRY** ⚠️ (Implemented but format unknown)
   - Current: `id: 'technology'` (normalized name)
   - Should test: LinkedIn industry IDs if available

8. **SCHOOL** ⚠️ (Implemented but format unknown)
   - Current: `id: 'stanford'` (normalized name)
   - Should test: LinkedIn school URNs if available

9. **YEARS_EXPERIENCE** ⚠️ (Implemented but format unknown)
   - Current: `id: '5'`, `id: '20'` (numeric)
   - Should test: Letter codes from `filter_years_in` endpoint

10. **JOB_TITLE** ❌ (Not using filter, using keywords)
    - Reason: Keywords work better (52% vs 20%)
    - Action: Keep using keywords, verify accuracy

---

## 📋 DETAILED TEST PLAN

### Phase 1: Filter Helper Endpoints (Verify Response Formats)

**Goal**: Understand what formats the API expects

#### Test 1.1: Location Suggestions
```typescript
// Test filter_geography_location_region_suggestions
- Query: "Maryland"
- Query: "California"
- Query: "New York"
- Verify: Response structure, ID format, URN extraction
```

#### Test 1.2: Company Suggestions
```typescript
// Test filter_company_suggestions
- Query: "Apple"
- Query: "Google"
- Verify: Returns URN format? (urn:li:organization:XXXXX)
- Verify: Can we use these URNs in CURRENT_COMPANY filter?
```

#### Test 1.3: Company Headcount Options
```typescript
// Test filter_company_headcount
- Verify: Returns letter codes (A, B, C) or numeric ranges?
- Verify: Map to our current numeric format
```

#### Test 1.4: Years of Experience Options
```typescript
// Test filter_years_in
- Verify: Returns letter codes or numeric ranges?
- Verify: Map to our current numeric format
```

#### Test 1.5: All Other Filter Helpers
```typescript
// Test all remaining filter helper endpoints
- Verify: Response structure
- Verify: Data format
- Document: Available options for each
```

---

### Phase 2: Main Search Endpoint - Filter Format Verification

**Goal**: Verify each filter type works with correct format

#### Test 2.1: LOCATION Filter
```typescript
Test Cases:
1. Single state: Maryland (urn:li:fs_geo:103644278)
   - Expected: 90%+ accuracy
   - Verify: Results match location

2. Multiple states: Maryland, California
   - Expected: Results from both states
   - Verify: All results match one of the states

3. City: "Baltimore, Maryland"
   - Expected: City-level accuracy
   - Verify: Results match city

4. Country: "United States"
   - Expected: Broad results
   - Verify: All results from US
```

#### Test 2.2: CURRENT_COMPANY Filter
```typescript
Test Cases:
1. Format A: Normalized name (current)
   - Body: { type: 'CURRENT_COMPANY', values: [{ id: 'apple', text: 'Apple' }] }
   - Verify: Returns Apple employees?

2. Format B: URN format (from reference)
   - Body: { type: 'CURRENT_COMPANY', values: [{ id: 'urn:li:organization:1586', text: 'Apple' }] }
   - Verify: Returns Apple employees?
   - Compare: Which format is more accurate?
```

#### Test 2.3: COMPANY_HEADCOUNT Filter
```typescript
Test Cases:
1. Format A: Numeric (current)
   - Body: { type: 'COMPANY_HEADCOUNT', values: [{ id: '100', text: 'Min: 100' }] }
   - Verify: Returns companies with 100+ employees?

2. Format B: Letter codes (from reference)
   - Body: { type: 'COMPANY_HEADCOUNT', values: [{ id: 'B', text: '1-10' }] }
   - Verify: Returns companies with 1-10 employees?
   - Compare: Which format works?
```

#### Test 2.4: POSTAL_CODE Filter (New)
```typescript
Test Cases:
1. Single postal code
   - Body: { type: 'POSTAL_CODE', values: [{ id: '101041448', text: '781104, Guwahati, Assam, India' }], selectedSubFilter: 50 }
   - Verify: Returns results from that postal code
   - Compare: More accurate than LOCATION?
```

#### Test 2.5: CHANGED_JOBS_90_DAYS Filter
```typescript
Test Cases:
1. Changed jobs filter
   - Body: { type: 'CHANGED_JOBS_90_DAYS', values: [{ id: 'true', text: 'Changed jobs in last 90 days' }] }
   - Verify: Returns only people who changed jobs recently
   - Verify: Check job change dates in results
```

#### Test 2.6: INDUSTRY Filter
```typescript
Test Cases:
1. Single industry
   - Body: { type: 'INDUSTRY', values: [{ id: 'technology', text: 'Technology' }] }
   - Verify: Returns people in technology industry

2. Multiple industries
   - Body: { type: 'INDUSTRY', values: [{ id: 'technology', text: 'Technology' }, { id: 'finance', text: 'Finance' }] }
   - Verify: Returns people in either industry
```

#### Test 2.7: SCHOOL Filter
```typescript
Test Cases:
1. Single school
   - Body: { type: 'SCHOOL', values: [{ id: 'stanford', text: 'Stanford' }] }
   - Verify: Returns Stanford alumni

2. Multiple schools
   - Body: { type: 'SCHOOL', values: [{ id: 'stanford', text: 'Stanford' }, { id: 'mit', text: 'MIT' }] }
   - Verify: Returns alumni from either school
```

#### Test 2.8: YEARS_EXPERIENCE Filter
```typescript
Test Cases:
1. Min only
   - Body: { type: 'YEARS_EXPERIENCE', values: [{ id: '5', text: 'Min: 5 years' }] }
   - Verify: Returns people with 5+ years experience

2. Max only
   - Body: { type: 'YEARS_EXPERIENCE', values: [{ id: '20', text: 'Max: 20 years' }] }
   - Verify: Returns people with ≤20 years experience

3. Range
   - Body: { type: 'YEARS_EXPERIENCE', values: [{ id: '5', text: 'Min: 5' }, { id: '20', text: 'Max: 20' }] }
   - Verify: Returns people with 5-20 years experience
```

#### Test 2.9: Combined Filters
```typescript
Test Cases:
1. Location + Company
   - Filters: [LOCATION (Maryland), CURRENT_COMPANY (Apple)]
   - Verify: Returns Apple employees in Maryland
   - Accuracy: 90%+ for both filters

2. Location + Industry + Changed Jobs
   - Filters: [LOCATION (Maryland), INDUSTRY (Technology), CHANGED_JOBS_90_DAYS]
   - Verify: Returns tech workers in Maryland who changed jobs
   - Accuracy: 90%+ for all filters

3. All Filters Combined
   - Filters: [LOCATION, CURRENT_COMPANY, INDUSTRY, SCHOOL, YEARS_EXPERIENCE, CHANGED_JOBS_90_DAYS]
   - Verify: All filters applied correctly
   - Accuracy: 90%+ for all filters
```

---

### Phase 3: via_url Endpoint Verification

**Goal**: Verify via_url includes all filters and works correctly

#### Test 3.1: json_to_url Generation
```typescript
Test Cases:
1. Location only
   - Filters: [LOCATION (Maryland)]
   - Verify: Generated URL contains location filter
   - Verify: URL is valid Sales Navigator URL

2. Location + Company
   - Filters: [LOCATION (Maryland), CURRENT_COMPANY (Apple)]
   - Verify: Generated URL contains both filters
   - Verify: URL is valid

3. All filters
   - Filters: [LOCATION, CURRENT_COMPANY, INDUSTRY, etc.]
   - Verify: Generated URL contains all filters
   - Verify: URL is valid
```

#### Test 3.2: premium_search_person_via_url
```typescript
Test Cases:
1. URL with location filter
   - Use generated URL from json_to_url
   - Verify: Returns results matching location
   - Accuracy: 100% (via_url should be perfect)

2. URL with multiple filters
   - Use generated URL with all filters
   - Verify: Returns results matching all filters
   - Accuracy: 100% for all filters
```

---

### Phase 4: Response Parsing Verification

**Goal**: Verify we handle all response structures correctly

#### Test 4.1: Response Structure Variations
```typescript
Test Cases:
1. Structure A: data.response.data
   - Verify: Parsed correctly

2. Structure B: data.data.response.data
   - Verify: Parsed correctly

3. Structure C: data.data (direct array)
   - Verify: Parsed correctly

4. Structure D: response.results
   - Verify: Parsed correctly

5. Structure E: response.leads
   - Verify: Parsed correctly
```

#### Test 4.2: Pagination Verification
```typescript
Test Cases:
1. Single page (25 results)
   - Verify: Pagination info correct
   - Verify: hasMore flag correct

2. Multiple pages (100+ results)
   - Verify: Can fetch page 2, 3, 4, etc.
   - Verify: Pagination info updates correctly

3. Large pagination (2,500 leads)
   - Verify: Can fetch 100 pages (25 per page)
   - Verify: No rate limit issues
   - Verify: All results parsed correctly
```

---

### Phase 5: Accuracy Validation

**Goal**: Verify filters actually work (not just accepted by API)

#### Test 5.1: Location Filter Accuracy
```typescript
Test Cases:
1. Maryland filter
   - Request: LOCATION filter for Maryland
   - Results: 100 leads
   - Verify: Count how many actually from Maryland
   - Expected: 90%+ accuracy
   - If <90%: Filter not working, investigate

2. California filter
   - Request: LOCATION filter for California
   - Results: 100 leads
   - Verify: Count how many actually from California
   - Expected: 90%+ accuracy
```

#### Test 5.2: Company Filter Accuracy
```typescript
Test Cases:
1. Apple filter
   - Request: CURRENT_COMPANY filter for Apple
   - Results: 100 leads
   - Verify: Count how many actually work at Apple
   - Expected: 90%+ accuracy
```

#### Test 5.3: Combined Filter Accuracy
```typescript
Test Cases:
1. Maryland + Apple
   - Request: LOCATION (Maryland) + CURRENT_COMPANY (Apple)
   - Results: 50 leads
   - Verify: All from Maryland AND work at Apple
   - Expected: 100% accuracy for both filters
```

---

### Phase 6: Error Handling Verification

**Goal**: Verify graceful error handling

#### Test 6.1: Invalid Filter Formats
```typescript
Test Cases:
1. Invalid location ID
   - Request: LOCATION with invalid ID
   - Verify: Graceful error, fallback to keywords

2. Invalid company ID
   - Request: CURRENT_COMPANY with invalid ID
   - Verify: Graceful error or empty results

3. Missing required fields
   - Request: Filter without required fields
   - Verify: Error message, no crash
```

#### Test 6.2: Rate Limiting
```typescript
Test Cases:
1. Rapid requests
   - Make 10 requests quickly
   - Verify: Rate limiting handled
   - Verify: Retry logic works

2. 429 Response
   - Trigger rate limit
   - Verify: Proper error message
   - Verify: Retry-After header respected
```

---

## 🧪 TEST IMPLEMENTATION STRATEGY

### Test Script Structure

```typescript
// scripts/comprehensive-api-verification.ts

1. Test Helper Endpoints
   - Call each filter helper endpoint
   - Document response structure
   - Extract available options

2. Test Filter Formats
   - Test each filter type with different formats
   - Compare accuracy
   - Document working format

3. Test Combined Filters
   - Test 2, 3, 4+ filters together
   - Verify all work correctly

4. Test via_url Flow
   - Generate URLs with json_to_url
   - Use URLs in via_url endpoint
   - Verify accuracy

5. Test Pagination
   - Fetch multiple pages
   - Verify pagination info
   - Test 2,500 lead scenario

6. Accuracy Validation
   - Count matching results
   - Calculate accuracy percentage
   - Report issues
```

---

## 📊 SUCCESS CRITERIA

### Filter Helper Endpoints
- ✅ All 18 endpoints return valid responses
- ✅ Response structures documented
- ✅ Can extract IDs/options from responses

### Main Search Endpoints
- ✅ All 4 endpoints work correctly
- ✅ Filters accepted (no 500 errors)
- ✅ Results returned (not empty)

### Filter Accuracy
- ✅ LOCATION filter: 90%+ accuracy
- ✅ CURRENT_COMPANY filter: 90%+ accuracy
- ✅ Combined filters: 90%+ accuracy for each
- ✅ via_url: 100% accuracy

### Response Parsing
- ✅ All response structures handled
- ✅ Pagination info extracted correctly
- ✅ Lead data extracted correctly

### Error Handling
- ✅ Invalid inputs handled gracefully
- ✅ Rate limits handled correctly
- ✅ Error messages are clear

---

## 🚨 CRITICAL ISSUES TO VERIFY

### Issue 1: Company Filter Format
**Question**: Does CURRENT_COMPANY need URN format?
- Test: `id: 'apple'` vs `id: 'urn:li:organization:1586'`
- Action: Use whichever works better

### Issue 2: Company Headcount Format
**Question**: Does COMPANY_HEADCOUNT need letter codes?
- Test: `id: '100'` vs `id: 'B'`
- Action: Use whichever works

### Issue 3: Years Experience Format
**Question**: Does YEARS_EXPERIENCE need letter codes?
- Test: `id: '5'` vs letter codes from `filter_years_in`
- Action: Use whichever works

### Issue 4: POSTAL_CODE vs LOCATION
**Question**: Is POSTAL_CODE more accurate?
- Test: Both filter types
- Action: Use more accurate one

### Issue 5: selectedSubFilter Parameter
**Question**: When is `selectedSubFilter: 50` needed?
- Test: With/without for different filter types
- Action: Add where needed

---

## 📋 TEST EXECUTION ORDER

### Priority 1: CRITICAL (Do First)
1. ✅ Test LOCATION filter accuracy
2. ✅ Test CURRENT_COMPANY filter format (URN vs name)
3. ✅ Test COMPANY_HEADCOUNT format (numeric vs letter)
4. ✅ Test via_url with all filters
5. ✅ Test combined filters accuracy

### Priority 2: HIGH (Do Second)
6. ✅ Test all filter helper endpoints
7. ✅ Test POSTAL_CODE filter
8. ✅ Test YEARS_EXPERIENCE format
9. ✅ Test pagination for 2,500 leads
10. ✅ Test response parsing variations

### Priority 3: MEDIUM (Do Third)
11. ✅ Test INDUSTRY filter accuracy
12. ✅ Test SCHOOL filter accuracy
13. ✅ Test CHANGED_JOBS_90_DAYS accuracy
14. ✅ Test error handling
15. ✅ Test rate limiting

### Priority 4: LOW (Do Last)
16. ✅ Test remaining filter helpers
17. ✅ Test edge cases
18. ✅ Performance testing
19. ✅ Documentation updates

---

## 📝 DELIVERABLES

1. **Comprehensive Test Script**
   - File: `scripts/comprehensive-api-verification.ts`
   - Tests all endpoints and filters
   - Generates detailed report

2. **Test Results Report**
   - File: `docs/VERIFICATION_RESULTS.md`
   - Documents what works/doesn't work
   - Accuracy percentages
   - Format recommendations

3. **Fixed Implementation**
   - Update filter formats based on test results
   - Fix any issues found
   - Optimize for accuracy

4. **Updated Documentation**
   - Document working filter formats
   - Document response structures
   - Document best practices

---

## ⏱️ ESTIMATED TIME

- **Phase 1** (Filter Helpers): 2-3 hours
- **Phase 2** (Filter Formats): 4-6 hours
- **Phase 3** (via_url): 2-3 hours
- **Phase 4** (Response Parsing): 1-2 hours
- **Phase 5** (Accuracy): 3-4 hours
- **Phase 6** (Error Handling): 1-2 hours
- **Total**: 13-20 hours

---

## ✅ NEXT STEPS

1. **Create comprehensive test script** (Priority 1)
2. **Run Phase 1 tests** (Filter helpers)
3. **Run Phase 2 tests** (Filter formats) - **CRITICAL**
4. **Fix any format issues** found
5. **Run Phase 3-6 tests** (Complete verification)
6. **Generate final report**
7. **Update implementation** based on results

---

**Status**: 📋 Plan Complete - Awaiting Execution Mode Activation

**Ready to proceed with implementation when approved.**
