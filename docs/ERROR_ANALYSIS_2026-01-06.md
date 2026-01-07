# Error Analysis Report
**Date**: 2026-01-06  
**Log File**: `logs.1767738901397.json`  
**Total Log Entries**: 1,001 (906 info, 95 errors)  
**Time Range**: 14:55:59 - 22:34:25 UTC

---

## Executive Summary

The logs reveal **5 critical error categories** affecting system operations:

1. **TOKEN_EXCHANGE Failures** (7 errors) - Cognito to USHA JWT token exchange failing
2. **API 400 Errors** (8+ errors) - RapidAPI rejecting premium_search_person requests
3. **Location Suggestions API** (1 error) - Location discovery failing
4. **Railway Rate Limiting** (1 error, 890 messages dropped) - Excessive logging
5. **Scraping Failures** (cascading from API errors) - Background jobs failing

---

## 1. TOKEN_EXCHANGE Errors (7 occurrences)

### Issue
```
⚠️ [TOKEN_EXCHANGE] Could not find endpoint to exchange Cognito token for USHA JWT
```

### Root Cause
**Location**: `utils/exchangeCognitoForUshaJwt.ts:145`

The function attempts to exchange Cognito ID/Access tokens for USHA JWT tokens by trying multiple endpoints, but none succeed. The function tries:
- `/api/account/login`
- `/api/auth/login`
- `/api/auth/token`
- `/api/token`
- `/connect/token`
- `/api/auth/exchange`
- OAuth endpoints

All attempts fail, indicating either:
1. The correct endpoint is not in the list
2. The endpoint requires different authentication/headers
3. The endpoint doesn't exist or has changed

### Impact
- **USHA DNC scrubbing** may fail if relying on Cognito token exchange
- System falls back to other token sources (USHA_REFRESH_TOKEN, direct OAuth)
- **Not critical** if alternative token sources are configured

### Code Reference
```145:147:utils/exchangeCognitoForUshaJwt.ts
  console.warn('⚠️ [TOKEN_EXCHANGE] Could not find endpoint to exchange Cognito token for USHA JWT');
  console.warn('⚠️ [TOKEN_EXCHANGE] Tried all endpoints with both ID token and Access token');
  return null;
```

### Recommendation
1. **Verify USHA authentication endpoint** - Contact USHA or check documentation for correct endpoint
2. **Add endpoint discovery** - Try to discover endpoint from USHA API documentation
3. **Monitor fallback success** - Ensure USHA_REFRESH_TOKEN or direct OAuth is working
4. **Consider removing** if not needed (if USHA_REFRESH_TOKEN is primary method)

---

## 2. API 400 Errors (8+ occurrences)

### Issue
```
[API Error] RapidAPI returned error in 200 OK response (Top Level)
error: 'Request failed with status code 400'
endpoint: 'premium_search_person'
```

### Root Cause
**Location**: `app/api/linkedin-sales-navigator/route.ts`

RapidAPI is returning HTTP 200 with an error payload indicating a 400 Bad Request. The failing request includes:
```json
{
  "account_number": 1,
  "filters": [{
    "type": "REGION",
    "values": [{
      "id": "105142029",
      "text": "Orlando, Florida",
      "selectionType": "INCLUDED"
    }]
  }],
  "keywords": "Self Employed, Self-Employed, Freelancer, Independent Contractor, Consultant, Owner, Founder",
  "page": 1
}
```

### Possible Causes
1. **Invalid REGION filter format** - The REGION filter type might not be accepted
2. **Invalid location ID** - Location ID "105142029" might be incorrect or expired
3. **Filter combination** - REGION filter with keywords might be incompatible
4. **API changes** - RapidAPI might have changed their validation rules

### Impact
- **Scraping jobs fail** when using REGION filters
- **Location-based searches fail** for Orlando, Florida
- **Background jobs** (`utils/inngest/scraping.ts`) throw errors and stop

### Error Flow
1. API call to `premium_search_person` with REGION filter
2. RapidAPI returns 200 OK with error payload
3. Error handler detects 400 error in response
4. Error propagates to scraping function
5. Scraping job fails with: `Failed to scrape page 1: API request failed (403)`

### Code References
- Error detection: `app/api/linkedin-sales-navigator/route.ts` (around line 1600-1700)
- Scraping error: `utils/inngest/scraping.ts:120`
- Error thrown: `utils/inngest/scraping.ts:168`

### Recommendation
1. **Verify REGION filter format** - Check if REGION is valid or should be LOCATION
2. **Validate location IDs** - Ensure "105142029" is correct for Orlando, Florida
3. **Test filter combinations** - Verify REGION + keywords is allowed
4. **Add better error handling** - Distinguish between filter errors and API errors
5. **Consider using LOCATION filter** instead of REGION (if supported)

---

## 3. Location Suggestions API Error (1 occurrence)

### Issue
```
Location suggestions API returned 400
```

### Root Cause
**Location**: `utils/linkedinLocationSuggestions.ts:49`

The location suggestions API (`filter_geography_location_region_suggestions`) returned a 400 Bad Request. This API is used for fast location ID discovery.

### Impact
- **Location discovery fails** for that specific query
- System should fall back to alternative discovery methods
- **Not critical** if fallback methods work

### Code Reference
```48:50:utils/linkedinLocationSuggestions.ts
    if (!response.ok) {
      console.warn(`Location suggestions API returned ${response.status}`);
      return [];
```

### Recommendation
1. **Add retry logic** - Retry with different query format
2. **Log the query** - Include the query in error logs for debugging
3. **Verify fallback** - Ensure alternative discovery methods are working
4. **Monitor frequency** - If this becomes common, investigate API changes

---

## 4. Railway Rate Limiting (1 occurrence, 890 messages dropped)

### Issue
```
Railway rate limit of 500 logs/sec reached for replica, update your application to reduce the logging rate. Messages dropped: 890
```

### Root Cause
**Excessive logging** - The application is logging more than 500 messages per second, exceeding Railway's rate limit.

### Impact
- **890 log messages were dropped** - Critical errors might be missing
- **Debugging becomes difficult** - Incomplete log history
- **Potential performance impact** - Excessive I/O operations

### Recommendation
1. **Reduce logging verbosity** - Remove or reduce frequency of info-level logs
2. **Batch logs** - Group related logs together
3. **Use log levels** - Only log errors/warnings in production
4. **Add rate limiting** - Implement client-side rate limiting for logs
5. **Review logging locations**:
   - Check for loops that log on every iteration
   - Remove debug logs from production
   - Use structured logging with sampling

### Priority
**HIGH** - This affects observability and could hide critical errors.

---

## 5. Scraping Failures (Cascading from API 400 Errors)

### Issue
```
[SCRAPING] Failed to fetch page 1: API request failed (403): {...}
Error: Failed to scrape page 1: API request failed (403): {...}
```

### Root Cause
**Location**: `utils/inngest/scraping.ts:120, 168`

Scraping failures are **cascading from API 400 errors** (see #2). When the API returns a 400 error, the scraping function throws an error and stops.

### Impact
- **Background scraping jobs fail** completely
- **No partial results** - Job stops at first error
- **User experience** - Users see failed jobs with no results

### Code Reference
```118:120:utils/inngest/scraping.ts
          if (!response.ok) {
              const errorText = await response.text().catch(() => response.statusText);
              throw new Error(`API request failed (${response.status}): ${errorText}`);
```

```167:168:utils/inngest/scraping.ts
            console.error(`[SCRAPING] Failed to fetch page ${page}:`, errorMessage);
            throw new Error(`Failed to scrape page ${page}: ${errorMessage}`);
```

### Recommendation
1. **Fix root cause** - Resolve API 400 errors (see #2)
2. **Add retry logic** - Retry failed pages with exponential backoff
3. **Partial success handling** - Continue scraping other pages if one fails
4. **Better error messages** - Distinguish between retryable and fatal errors
5. **Graceful degradation** - Return partial results if some pages fail

---

## Error Correlation

### Timeline Analysis
- **22:31:23** - Multiple TOKEN_EXCHANGE errors (7 occurrences in quick succession)
- **22:31:39** - Railway rate limit reached (890 messages dropped)
- **22:33:53** - Location suggestions API 400 error
- **22:33:55** - API 400 errors for premium_search_person (multiple occurrences)
- **22:34:25** - Scraping failures (cascading from API errors)

### Error Chain
1. **TOKEN_EXCHANGE fails** → System uses fallback token source (likely succeeds)
2. **Location suggestions API fails** → System uses fallback discovery (likely succeeds)
3. **API 400 errors** → REGION filter requests fail
4. **Scraping jobs fail** → Users see failed jobs

---

## Action Items

### Critical (Fix Immediately)
1. ✅ **Fix API 400 errors** - Investigate REGION filter format and location ID validation
2. ✅ **Reduce logging verbosity** - Fix Railway rate limiting issue

### High Priority
3. ✅ **Improve error handling** - Add retry logic and partial success handling for scraping
4. ✅ **Verify token exchange** - Confirm if TOKEN_EXCHANGE is needed or can be removed

### Medium Priority
5. ✅ **Monitor location suggestions** - Add better logging and retry logic
6. ✅ **Add error tracking** - Implement error aggregation and alerting

---

## Files to Review

1. `utils/exchangeCognitoForUshaJwt.ts` - Token exchange logic
2. `app/api/linkedin-sales-navigator/route.ts` - API error handling
3. `utils/inngest/scraping.ts` - Scraping error handling
4. `utils/linkedinLocationSuggestions.ts` - Location discovery
5. All files with `console.log` - Reduce logging verbosity

---

## Next Steps

1. **Immediate**: Fix API 400 errors by verifying REGION filter format
2. **Immediate**: Reduce logging to prevent Railway rate limiting
3. **Short-term**: Add retry logic and better error handling
4. **Long-term**: Implement comprehensive error tracking and alerting

