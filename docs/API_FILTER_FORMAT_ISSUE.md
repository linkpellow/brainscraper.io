# RapidAPI Filter Format Issue

## Problem Summary

The `realtime-linkedin-sales-navigator-data` RapidAPI endpoint is rejecting our filter format with **500 errors**.

## What We Tried

### 1. Original Format (❌ Failed - 500 Error)
```json
{
  "filters": [{
    "type": "LOCATION",
    "values": [{
      "id": "urn:li:fs_geo:103644278",
      "text": "Maryland, United States",
      "selectionType": "INCLUDED"
    }]
  }]
}
```
**Result**: 500 error from RapidAPI

### 2. Fixed Format Based on Playground Example (❌ Failed - 500 Error)
```json
{
  "filters": [{
    "type": "REGION",
    "values": [{
      "id": "103644278",  // Just numeric ID
      "text": "Maryland, United States",
      "selectionType": "INCLUDED"
    }],
    "selectedSubFilter": 50
  }]
}
```
**Result**: 500 error from RapidAPI

### 3. Keywords Only (✅ Works - But Low Accuracy)
```json
{
  "keywords": "Maryland MD real estate",
  "page": 1,
  "account_number": 1
}
```
**Result**: ✅ Success - Returns 25 leads, but only 2 match Maryland (8% accuracy)

## Root Cause

The RapidAPI endpoint:
1. **Does NOT accept the `filters` array format** we're using (causes 500 error)
2. **Only works with `keywords` parameter** for search
3. **Has NO location filtering capability** via filters

## Evidence

### Test Results
- **With `REGION` filter**: 500 error
- **With `LOCATION` filter**: 500 error  
- **With keywords only**: 200 OK, returns 25 leads (but only 8% match requested location)

### RapidAPI Playground Example
The playground shows a `POST`AL_CODE` filter example:
```json
{
  "filters": [{
    "type": "POSTAL_CODE",
    "values": [{
      "id": "101041448",
      "text": "781104, Guwahati, Assam, India",
      "selectionType": "INCLUDED"
    }],
    "selectedSubFilter": 50
  }]
}
```

**However**:
- This example is for `POSTAL_CODE`, not `REGION` or `LOCATION`
- We have no postal code data (only state/city names)
- We don't know if this format even works for the `/premium_search_person` endpoint

## Current Workaround

1. ✅ Send keywords only (no filters)
2. ✅ Use client-side post-filtering for 100% accuracy
3. ✅ Works, but inefficient (API returns 25 leads, we filter to 2)

## What We Need

To implement proper filtering, we need from the RapidAPI documentation/playground:

1. **Confirmed working example** for `/premium_search_person` endpoint with location filtering
2. **Exact filter type names** supported (is it `REGION`, `GEO_REGION`, `LOCATION`, etc.?)
3. **Complete filter structure** including all required fields
4. **Whether the endpoint supports filters at all** for person search

## Recommended Next Steps

### Option A: Accept Keywords-Only Approach
- ✅ Already working
- ✅ Post-filtering ensures 100% accuracy
- ❌ Very inefficient (92% of API results discarded)
- ❌ Limited to 25 results per page

### Option B: Find Correct Filter Format
- Need to test different filter type names:
  - `GEO_REGION`
  - `LOCATION`
  - `REGION`
  - `GEOGRAPHY`
  - `PLACE`
- Need to test with/without `selectedSubFilter` field
- Need to test different ID formats (numeric vs URN)

### Option C: Use Different API
- Consider switching to a different LinkedIn API that properly supports filters
- Examples: LinkedIn official API, alternative RapidAPI providers

## Impact on User Requirements

**User Goal**: "Filter by state and job with accurate results"

**Current Status**:
- ✅ Can search with location keywords
- ✅ 100% accuracy achieved via post-filtering
- ❌ Only gets 2 valid results per search (very inefficient)
- ❌ Cannot fetch thousands of leads efficiently

**To achieve the user's goal**, we MUST find the correct filter format or switch APIs.

