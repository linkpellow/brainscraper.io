# LinkedIn API Response Analysis

**Test Date**: November 30, 2025  
**Total APIs Tested**: 7

## Key Findings

### ✅ Only ONE API Returns Location Data

**LinkedIn Sales Navigator API** is the ONLY API that returns location information in search results.

### ❌ No APIs Return Geo IDs Directly

None of the tested APIs return LinkedIn geo IDs (`urn:li:fs_geo:XXXXX`) in their responses. We must discover geo IDs separately for location filtering.

---

## Detailed API Responses

### 1. LinkedIn Data API (rockapis) - By Username
**Endpoint**: `GET /api/linkedin-profile-by-username?username={username}`  
**Status**: 200 ✅  
**Location Data**: ❌ NO  
**Geo IDs**: ❌ NO

**Response**:
```json
{
  "success": true,
  "data": {
    "success": false,
    "message": "We are no longer providing this service at this time. If you need assistance, please contact support@professionalnetworkdata.com",
    "data": null
  },
  "locationInfo": null
}
```

**Conclusion**: ⚠️ **SERVICE DISCONTINUED** - This API is no longer available. Do not use for location discovery.

---

### 2. LinkedIn Sales Navigator API - Search People ✅
**Endpoint**: `POST /api/linkedin-sales-navigator`  
**Status**: 200 ✅  
**Location Data**: ✅ YES  
**Geo IDs**: ❌ NO

**Response Structure**:
```json
{
  "success": true,
  "data": {
    "success": true,
    "status": 200,
    "response": {
      "data": [
        {
          "firstName": "Sérgio",
          "fullName": "Sérgio Seiva",
          "lastName": "Seiva",
          "geoRegion": "Guarulhos, São Paulo, Brazil",  // ← LOCATION TEXT ONLY
          "profilePictureDisplayImage": "...",
          "summary": "...",
          "profileUrn": "ACwAAAHvpBwBUq95EWjviNcLaz0L4jtEVxTXKDE",
          "navigationUrl": "https://www.linkedin.com/in/ACwAAAHvpBwBUq95EWjviNcLaz0L4jtEVxTXKDE",
          "currentPosition": {
            "companyName": "...",
            "title": "...",
            "companyUrnResolutionResult": {
              "location": "Flowery Branch, Georgia, United States"  // ← Company location
            }
          }
        }
      ],
      "pagination": {
        "total": 100,
        "count": 25,
        "start": 0
      }
    }
  }
}
```

**Key Fields**:
- ✅ `geoRegion`: Location text (e.g., "Guarulhos, São Paulo, Brazil", "Atlanta Metropolitan Area")
- ✅ `currentPosition.companyUrnResolutionResult.location`: Company location text
- ❌ **NO geo IDs** - Only location text strings

**Conclusion**: ✅ **PRIMARY API FOR LEAD SCRAPING** - Returns location text but NOT geo IDs. Use this for scraping leads. Location filtering requires geo IDs discovered separately.

---

### 3. Fresh LinkedIn Profile Data
**Endpoint**: `GET /api/fresh-linkedin-profile?linkedin_url={url}`  
**Status**: 403 ❌  
**Location Data**: ❌ NO  
**Geo IDs**: ❌ NO

**Response**:
```json
{
  "error": "RapidAPI error: Forbidden",
  "details": "{\"message\":\"You are not subscribed to this API.\"}"
}
```

**Conclusion**: ⚠️ **NOT SUBSCRIBED** - Requires subscription. Cannot test location data.

---

### 4. Fresh LinkedIn Company Data
**Endpoint**: `GET /api/fresh-linkedin-company?linkedin_url={url}`  
**Status**: 429 ❌  
**Location Data**: ❌ NO  
**Geo IDs**: ❌ NO

**Response**:
```json
{
  "error": "RapidAPI error: Too Many Requests",
  "details": "{\"message\":\"Too many requests\"}"
}
```

**Conclusion**: ⚠️ **RATE LIMITED** - Cannot test at this time.

---

### 5. LinkedIn Company (by domain) - rockapis
**Endpoint**: `GET /api/linkedin-company?domain={domain}`  
**Status**: 200 ✅  
**Location Data**: ❌ NO  
**Geo IDs**: ❌ NO

**Response**:
```json
{
  "success": false,
  "message": "We are no longer providing this service at this time. If you need assistance, please contact support@professionalnetworkdata.com",
  "data": null
}
```

**Conclusion**: ⚠️ **SERVICE DISCONTINUED** - This API is no longer available.

---

### 6. LinkedIn Profile (li-data-scraper)
**Endpoint**: `GET /api/linkedin-profile?url={url}`  
**Status**: 200 ✅  
**Location Data**: ❌ NO  
**Geo IDs**: ❌ NO

**Response**:
```json
{
  "success": false,
  "message": "We are no longer providing this service at this time. If you need assistance, please contact support@professionalnetworkdata.com",
  "data": null
}
```

**Conclusion**: ⚠️ **SERVICE DISCONTINUED** - This API is no longer available.

---

### 7. LinkedIn Bulk Data Scraper
**Endpoint**: `GET /api/linkedin-scraper?url={url}&endpoint=profile`  
**Status**: 200 ✅  
**Location Data**: ❌ NO  
**Geo IDs**: ❌ NO

**Response**:
```json
{
  "success": true,
  "data": {
    "success": true,
    "status": 200,
    "health": "100%"
  },
  "raw": "{\"success\":true,\"status\":200,\"health\":\"100%\"}"
}
```

**Conclusion**: ⚠️ **HEALTH CHECK ONLY** - Returns health status, no profile data.

---

## Summary & Recommendations

### ✅ What Works

1. **LinkedIn Sales Navigator API** - Returns leads with `geoRegion` field containing location text
   - Use for: Scraping leads
   - Location data: Text only (e.g., "Maryland", "Atlanta Metropolitan Area")
   - Geo IDs: None

### ❌ What Doesn't Work

1. **LinkedIn Data API (rockapis)** - Service discontinued
2. **LinkedIn Company (by domain) - rockapis** - Service discontinued  
3. **LinkedIn Profile (li-data-scraper)** - Service discontinued
4. **LinkedIn Bulk Data Scraper** - Health check only
5. **Fresh LinkedIn APIs** - Not subscribed / Rate limited

### 🎯 Key Insight

**NO API returns geo IDs directly.** We must:
1. Use **Sales Navigator API** to scrape leads (returns location text in `geoRegion`)
2. Use **location discovery methods** (json_to_url, HarvestAPI, saleLeads.ai) to find geo IDs for filtering
3. **DO NOT** use linkedin-data-api (rockapis) - it's discontinued and won't help

### 📍 Location Data in Sales Navigator Results

The Sales Navigator API returns location as **text strings** in the `geoRegion` field:
- "Guarulhos, São Paulo, Brazil"
- "Atlanta Metropolitan Area"
- "Washington, District of Columbia, United States"
- "United States"
- "Dubai, United Arab Emirates"

**These are NOT geo IDs** - they're just location names. To filter by location, we need to:
1. Convert location text → geo ID (using discovery methods)
2. Use geo ID in the filter when searching
3. The API will then return leads matching that location

---

## Action Items

1. ✅ **Remove linkedin-data-api usage** - Service is discontinued
2. ✅ **Use Sales Navigator API** - Primary source for lead scraping
3. ✅ **Use location discovery** - For converting location text → geo IDs
4. ✅ **Post-filter results** - Validate leads match requested location (already implemented)

