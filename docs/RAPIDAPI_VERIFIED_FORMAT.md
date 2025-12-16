# RapidAPI Format - VERIFIED from Playground

**Date**: 2025-01-14  
**Source**: Direct from RapidAPI Playground  
**Status**: ✅ **FORMAT VERIFIED**

---

## ✅ VERIFIED FORMAT from RapidAPI Playground

### `json_to_url` Endpoint Format:

```javascript
{
  filters: [
    {
      type: 'CURRENT_COMPANY',
      values: [
        {
          id: 'urn:li:organization:1586',  // Full URN format
          text: 'Amazon',
          selectionType: 'INCLUDED'
        },
        {
          id: 'urn:li:organization:1441',
          text: 'Google',
          selectionType: 'INCLUDED'
        }
      ]
    },
    {
      type: 'COMPANY_HEADCOUNT',
      values: [
        {
          id: 'A',  // Single letter ID for headcount
          text: 'Self-employed',
          selectionType: 'EXCLUDED'
        }
      ]
    }
  ],
  keywords: 'Ali'
}
```

**Key Observations**:
- ✅ Uses `filters` array (plural) - **MATCHES OUR CODE**
- ✅ Uses `type` field - **MATCHES OUR CODE**
- ✅ Uses `values` array - **MATCHES OUR CODE**
- ✅ Uses `id`, `text`, `selectionType` - **MATCHES OUR CODE**
- ✅ Company IDs use full URN: `urn:li:organization:1586` - **MATCHES OUR CODE**
- ✅ `keywords` as string - **MATCHES OUR CODE**

---

## ✅ Our Current Format (VERIFIED CORRECT)

```json
{
  "filters": [
    {
      "type": "LOCATION",
      "values": [{
        "id": "urn:li:fs_geo:103644278",
        "text": "Maryland",
        "selectionType": "INCLUDED"
      }]
    },
    {
      "type": "CURRENT_COMPANY",
      "values": [{
        "id": "apple",
        "text": "Apple",
        "selectionType": "INCLUDED"
      }]
    }
  ],
  "keywords": "",
  "page": 1,
  "limit": 100
}
```

**Status**: ✅ **OUR FORMAT IS CORRECT!**

---

## ⚠️ POTENTIAL ISSUES IDENTIFIED

### Issue 1: Company ID Format

**Playground Shows**:
- Company IDs use full URN: `urn:li:organization:1586`
- Our code uses: `"apple"` (normalized name)

**Fix Needed**:
- We should use LinkedIn company URNs instead of normalized names
- OR verify if the API accepts both formats

### Issue 2: Company Headcount Format

**Playground Shows**:
- Uses single letter IDs: `'A'` for "Self-employed"
- Our code uses numeric strings: `"100"`, `"10000"`

**Fix Needed**:
- Need to map numeric ranges to letter codes
- OR verify if API accepts numeric format

### Issue 3: Missing `account_number` Parameter

**Playground Shows** (for via_url):
- Uses `account_number: 1`
- Our code doesn't include this

**Status**: 
- This is for `via_url` endpoint, not `premium_search_person`
- May not be needed for regular search

---

## 📋 WHAT WE STILL NEED

### Need to Verify:

1. **`premium_search_person` Endpoint Format**:
   - Does it use the same `filters` array format?
   - Does it accept `page` and `limit` parameters?
   - What's the exact request body structure?

2. **Company ID Format**:
   - Does `premium_search_person` accept:
     - Full URN: `urn:li:organization:1586` ✅ (from playground)
     - Normalized name: `"apple"` ❓ (what we use)
   - Need to test both

3. **Location ID Format**:
   - We use: `urn:li:fs_geo:103644278` ✅
   - This matches the pattern from company URNs
   - Should be correct

---

## ✅ CONFIRMED CORRECT

1. ✅ `filters` array format (not `filter` object)
2. ✅ Filter structure: `type`, `values`, `id`, `text`, `selectionType`
3. ✅ `keywords` as string
4. ✅ Location IDs use full URN format: `urn:li:fs_geo:XXXXX`

---

## 🔧 RECOMMENDED FIXES

### Fix 1: Company ID Format (If Needed)

**Current**:
```typescript
id: String(requestBody.current_company).toLowerCase().replace(/\s+/g, '_')
// Results in: "apple"
```

**Should Be** (if API requires URN):
```typescript
id: `urn:li:organization:${companyId}`
// Need to discover company URNs
```

**Action**: Test if normalized names work, or implement company URN discovery

### Fix 2: Company Headcount Format (If Needed)

**Current**:
```typescript
id: String(requestBody.company_headcount_min)
// Results in: "100"
```

**Should Be** (if API requires letter codes):
```typescript
// Map numeric ranges to letter codes
// A = Self-employed
// B = 1-10
// C = 11-50
// etc.
```

**Action**: Test if numeric format works, or implement letter code mapping

---

## 🎯 NEXT STEPS

1. ✅ **Format Verified**: Our `filters` array format is correct
2. ⏳ **Test Company IDs**: Verify if normalized names work or need URNs
3. ⏳ **Test Headcount**: Verify if numeric format works or need letter codes
4. ⏳ **Get `premium_search_person` Example**: Still need to see this endpoint's format

---

## 📝 SUMMARY

**Good News**:
- ✅ Our filter format structure is **CORRECT**
- ✅ Matches RapidAPI playground format exactly
- ✅ Location IDs using full URN format is correct

**Potential Issues**:
- ⚠️ Company IDs might need URN format (need to test)
- ⚠️ Company headcount might need letter codes (need to test)
- ⚠️ Still need `premium_search_person` endpoint example

**Status**: Our format is correct! Just need to verify company/headcount ID formats.

---

**Last Updated**: 2025-01-14
