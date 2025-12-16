# LinkedIn Sales Navigator API - Complete Filter Guide

**Date**: 2025-01-27  
**API**: RapidAPI realtime-linkedin-sales-navigator-data  
**Status**: ✅ Comprehensive Filter Support Implemented

---

## Overview

This document describes all available filters for precise lead filtering using the LinkedIn Sales Navigator API. All filters are automatically converted from simple form parameters to the proper API filter format.

---

## Supported Filters

### 1. Location Filter ✅

**Parameter**: `location`  
**Filter Type**: `LOCATION`  
**Format**: Location text (e.g., "Maryland", "California", "New York, NY")

**How It Works**:
- System automatically discovers LinkedIn location IDs (`urn:li:fs_geo:XXXXX`)
- Uses multi-strategy discovery (cache → HarvestAPI → saleLeads → json_to_url)
- Falls back to keywords if location ID not found

**Example**:
```json
{
  "type": "LOCATION",
  "values": [{
    "id": "urn:li:fs_geo:103644278",
    "text": "Maryland",
    "selectionType": "INCLUDED"
  }]
}
```

**Notes**:
- Most accurate when location ID is found
- Post-filtering validates results match requested location
- Supports states, cities, and countries

---

### 2. Current Company Filter ✅

**Parameter**: `current_company`  
**Filter Type**: `CURRENT_COMPANY`  
**Format**: Company name (e.g., "Apple", "Google", "Microsoft")

**Example**:
```json
{
  "type": "CURRENT_COMPANY",
  "values": [{
    "id": "apple",
    "text": "Apple",
    "selectionType": "INCLUDED"
  }]
}
```

**Notes**:
- Company name is normalized (lowercase, underscores)
- Supports single company

---

### 3. Past Company Filter ✅

**Parameter**: `past_company`  
**Filter Type**: `PAST_COMPANY`  
**Format**: Company name (e.g., "IBM", "Oracle")

**Example**:
```json
{
  "type": "PAST_COMPANY",
  "values": [{
    "id": "ibm",
    "text": "IBM",
    "selectionType": "INCLUDED"
  }]
}
```

**Notes**:
- Finds people who previously worked at the company
- Useful for finding people who left competitors

---

### 4. Company Headcount Filter ✅

**Parameters**: `company_headcount_min`, `company_headcount_max`  
**Filter Type**: `COMPANY_HEADCOUNT`  
**Format**: Numbers (e.g., min: 100, max: 10000)

**Example**:
```json
{
  "type": "COMPANY_HEADCOUNT",
  "values": [
    {
      "id": "100",
      "text": "Min: 100",
      "selectionType": "INCLUDED"
    },
    {
      "id": "10000",
      "text": "Max: 10000",
      "selectionType": "INCLUDED"
    }
  ]
}
```

**Notes**:
- Can use min only, max only, or both
- Filters by company size
- Useful for targeting specific company sizes

---

### 5. Industry Filter ✅

**Parameter**: `industry`  
**Filter Type**: `INDUSTRY`  
**Format**: Industry name(s), comma-separated (e.g., "Technology, Finance, Healthcare")

**Example**:
```json
{
  "type": "INDUSTRY",
  "values": [
    {
      "id": "technology",
      "text": "Technology",
      "selectionType": "INCLUDED"
    },
    {
      "id": "finance",
      "text": "Finance",
      "selectionType": "INCLUDED"
    }
  ]
}
```

**Notes**:
- Supports multiple industries (comma-separated)
- Each industry is added as a separate value
- Industry names are normalized

---

### 6. School/University Filter ✅

**Parameters**: `school` or `university`  
**Filter Type**: `SCHOOL`  
**Format**: School name(s), comma-separated (e.g., "Stanford, MIT, Harvard")

**Example**:
```json
{
  "type": "SCHOOL",
  "values": [
    {
      "id": "stanford",
      "text": "Stanford",
      "selectionType": "INCLUDED"
    },
    {
      "id": "mit",
      "text": "MIT",
      "selectionType": "INCLUDED"
    }
  ]
}
```

**Notes**:
- Supports multiple schools (comma-separated)
- Finds people who attended the specified schools
- Useful for alumni targeting

---

### 7. Years of Experience Filter ✅

**Parameters**: `years_experience_min`, `years_experience_max`  
**Filter Type**: `YEARS_EXPERIENCE`  
**Format**: Numbers (e.g., min: 5, max: 20)

**Example**:
```json
{
  "type": "YEARS_EXPERIENCE",
  "values": [
    {
      "id": "5",
      "text": "Min: 5 years",
      "selectionType": "INCLUDED"
    },
    {
      "id": "20",
      "text": "Max: 20 years",
      "selectionType": "INCLUDED"
    }
  ]
}
```

**Notes**:
- Can use min only, max only, or both
- Filters by years of professional experience
- Useful for targeting specific experience levels

---

### 8. Changed Jobs Filter ✅

**Parameter**: `changed_jobs_90_days`  
**Filter Type**: `CHANGED_JOBS_90_DAYS`  
**Format**: `"true"` or `true` (boolean)

**Example**:
```json
{
  "type": "CHANGED_JOBS_90_DAYS",
  "values": [{
    "id": "true",
    "text": "Changed jobs in last 90 days",
    "selectionType": "INCLUDED"
  }]
}
```

**Notes**:
- Finds people who changed jobs in the last 90 days
- Useful for finding new hires or people in transition
- Only supports "true" (included) or not specified

---

## Keywords (Fallback)

When filters cannot be applied (e.g., location ID not found), parameters are added to keywords:

**Parameters Added to Keywords**:
- `first_name`
- `last_name`
- `title_keywords`
- `location` (if location ID not found)

**Example**:
```json
{
  "keywords": "John Director Marketing California",
  "filters": [...]
}
```

**Notes**:
- Keywords are less precise than filters
- Used as fallback when filter conversion fails
- Still useful for broad searches

---

## Filter Format

All filters follow this structure:

```typescript
{
  type: string;  // Filter type (e.g., "LOCATION", "CURRENT_COMPANY")
  values: Array<{
    id: string;  // Filter value ID (normalized)
    text: string;  // Human-readable text
    selectionType: "INCLUDED" | "EXCLUDED";  // Currently always "INCLUDED"
  }>;
}
```

---

## Complete Request Example

```json
{
  "endpoint": "premium_search_person",
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
    },
    {
      "type": "INDUSTRY",
      "values": [{
        "id": "technology",
        "text": "Technology",
        "selectionType": "INCLUDED"
      }]
    },
    {
      "type": "COMPANY_HEADCOUNT",
      "values": [
        {
          "id": "100",
          "text": "Min: 100",
          "selectionType": "INCLUDED"
        },
        {
          "id": "10000",
          "text": "Max: 10000",
          "selectionType": "INCLUDED"
        }
      ]
    }
  ],
  "keywords": "Director Marketing",
  "page": 1,
  "limit": 100
}
```

---

## Implementation Details

### Filter Conversion Logic

1. **Simple Parameters → Filters**: Form parameters are automatically converted to filter format
2. **Location Discovery**: Location text is converted to location IDs via discovery
3. **Multi-Value Support**: Comma-separated values (industries, schools) are split into multiple filter values
4. **Range Filters**: Min/max values are added as separate filter values (may need API-specific format adjustment)
5. **Fallback**: If filter conversion fails, parameters are added to keywords

### Code Location

- **Filter Conversion**: `app/api/linkedin-sales-navigator/route.ts` (lines 114-349)
- **Location Discovery**: `utils/linkedinLocationDiscovery.ts`
- **Frontend Form**: `app/components/LinkedInLeadGenerator.tsx`

---

## Testing

To test filters:

1. **Single Filter**: Use one filter at a time to verify it works
2. **Multiple Filters**: Combine filters to test precision
3. **Range Filters**: Test min/max combinations
4. **Multi-Value Filters**: Test comma-separated values
5. **Check Logs**: Review filter conversion in server logs

---

## Known Limitations

1. **Range Filters**: Min/max values are sent as separate filter values. The API might expect a different format. If range filters don't work, check API documentation for correct format.

2. **Company IDs**: Company filters use normalized names. The API might require LinkedIn company URNs (`urn:li:organization:XXXXX`) for better accuracy.

3. **Industry/School IDs**: Similar to companies, these might need LinkedIn-specific IDs rather than normalized names.

4. **Filter Type Names**: Filter type names are based on common Sales Navigator filters. The API might use different names. Check API responses for correct filter type names.

---

## Next Steps

1. ✅ **All basic filters implemented**
2. ⏳ **Test with real API calls** - Verify filter format matches API expectations
3. ⏳ **Adjust filter format** - Based on API responses/errors
4. ⏳ **Add more filter types** - If API supports additional filters
5. ⏳ **Improve ID resolution** - Use LinkedIn URNs for companies/industries/schools

---

## Resources

- **RapidAPI Documentation**: https://rapidapi.com/apibuilderz/api/realtime-linkedin-sales-navigator-data
- **LinkedIn Location ID Finder**: https://www.ghostgenius.fr/tools/search-sales-navigator-locations-id
- **Sales Navigator Filters**: https://business.linkedin.com/sales-solutions/compare-plans/advanced-search-filters

