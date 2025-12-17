# API Usage Accuracy Report

**Date**: 2025-01-XX  
**Status**: ✅ **VERIFIED AND UPDATED**

---

## ✅ APIs Actually Used in Enrichment Pipeline

### Currently Active in `enrichRow()`:

1. **Skip Tracing** ✅
   - Called as: `'Skip-tracing (Phone Discovery)'`
   - Called as: `'Skip-tracing (Person Details)'` (conditional)
   - Called as: `'Skip-tracing (Age)'` (conditional)
   - Registry Key: `'skip-tracing'`
   - **Status**: ✅ ACTIVE - All variations map correctly

2. **Telnyx Lookup** ✅
   - Called as: `'Telnyx'`
   - Registry Key: `'telnyx-lookup'`
   - **Status**: ✅ ACTIVE - Maps correctly

---

## ⚠️ APIs Available But NOT Used in Auto-Enrichment

These APIs exist in the codebase and have routes, but are **NOT called** in the current `enrichRow()` enrichment pipeline:

1. **Income by Zip** ❌
   - Route exists: `/api/income-by-zip`
   - **NOT called** in `enrichRow()`
   - **Status**: Available for manual use, not in auto-enrichment

2. **Website Extractor** ❌
   - Route exists: `/api/website-extractor`
   - **NOT called** in `enrichRow()`
   - **Status**: Available for manual use, not in auto-enrichment

3. **Website Contacts** ❌
   - Route exists: `/api/website-contacts`
   - **NOT called** in `enrichRow()`
   - **Status**: Available for manual use, not in auto-enrichment

4. **LinkedIn Profile** ❌
   - Route exists: `/api/linkedin-profile`
   - **NOT called** in `enrichRow()`
   - **Status**: Available for manual use, not in auto-enrichment

5. **Fresh LinkedIn Profile** ❌
   - Route exists: `/api/fresh-linkedin-profile`
   - **NOT called** in `enrichRow()`
   - **Status**: Available for manual use, not in auto-enrichment

6. **Fresh LinkedIn Company** ❌
   - Route exists: `/api/fresh-linkedin-company`
   - **NOT called** in `enrichRow()`
   - **Status**: Available for manual use, not in auto-enrichment

7. **LinkedIn Company** ❌
   - Route exists: `/api/linkedin-company`
   - **NOT called** in `enrichRow()`
   - **Status**: Available for manual use, not in auto-enrichment

8. **DNC Scrubbing** ❌
   - Route exists: `/api/usha/scrub` (manual trigger)
   - **NOT called** in `enrichRow()`
   - **Status**: Manual trigger only, not in auto-enrichment

---

## 📋 Current Enrichment Pipeline

The `enrichRow()` function currently uses this optimized flow:

1. **STEP 1**: Extract LinkedIn data (from scraped data, no API call)
2. **STEP 2**: Local ZIP lookup (free, local database, no API call)
3. **STEP 3**: Skip-tracing (Phone Discovery) - **API CALL**
4. **STEP 3b**: Skip-tracing (Person Details) - **API CALL** (conditional)
5. **STEP 4**: Telnyx Lookup - **API CALL**
6. **STEP 5**: Gatekeep (validation logic, no API call)
7. **STEP 6**: Skip-tracing (Age) - **API CALL** (conditional)

**Total API Calls**: 1-3 per lead (typically 1-2)

---

## ✅ Registry Accuracy

The API registry has been updated to:
- ✅ Include all API name variations (including "Skip-tracing (Age)")
- ✅ Add comments noting which APIs are available but not in auto-enrichment
- ✅ Keep all APIs in registry (for future use or manual calls)
- ✅ Ensure accurate mapping for all called APIs

**Result**: API controls accurately reflect what's actually used in the scraping/enrichment process.

---

## 🎯 Recommendation

The current pipeline is **optimized** and only uses essential APIs:
- Skip-tracing (for phone/email/age)
- Telnyx (for phone validation)

Other APIs (Income by Zip, Website APIs, LinkedIn Profile APIs) are available but not integrated into the auto-enrichment flow. This is intentional for cost optimization.

**If you want to add these APIs to the enrichment pipeline**, they would need to be integrated into `enrichRow()` function.
